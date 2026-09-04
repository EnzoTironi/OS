use std::{path::PathBuf, time::Duration};

use axum::{extract::State, http::StatusCode, response::IntoResponse};
use reqwest::Client;
use zoen_adapters::{
    CedarPolicyEvaluator, PostgresAuthorityStore, PostgresWorldReleaseStore,
    ProjectionWatermarkStatus, require_loadable_policy_catalog,
};
use zoen_core::{WorldId, WorldReleaseError};
use zoen_query::ObjectStoreConfig;
use zoend::{config, integrity::StateClassification};

const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone)]
pub struct ReadyState {
    pub auth_origin: String,
    pub cedar_manifest_path: PathBuf,
    pub classification: std::sync::Arc<StateClassification>,
    pub eve_origin: String,
    pub effect_registration_health_url: Option<String>,
    pub http: Client,
    pub object_store: Option<ObjectStoreConfig>,
    pub require_reference: bool,
    pub releases: PostgresWorldReleaseStore,
    pub store: PostgresAuthorityStore,
    pub projection_world_id: Option<WorldId>,
    pub watermark_max_age: Duration,
    pub world_id: Option<WorldId>,
}

impl ReadyState {
    /// Build probe state from the process environment and booted store.
    ///
    /// # Errors
    ///
    /// Returns an error when product-dependency URLs, tenant, watermark age, or
    /// the HTTP client cannot be constructed.
    pub fn from_boot(
        classification: std::sync::Arc<StateClassification>,
        require_reference: bool,
        store: PostgresAuthorityStore,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(PROBE_TIMEOUT)
            .build()
            .map_err(|error| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!("ready HTTP client failed: {error}"),
                )
            })?;
        let releases = PostgresWorldReleaseStore::new(store.pool());
        Ok(Self {
            auth_origin: config::auth_base_url()?,
            cedar_manifest_path: config::cedar_manifest_path()?,
            classification,
            eve_origin: config::eve_base_url()?,
            effect_registration_health_url: config::effect_registration_health_url()?,
            http,
            object_store: config::object_store_config()?,
            require_reference,
            releases,
            store,
            projection_world_id: config::ready_tenant_id()?,
            watermark_max_age: config::projection_watermark_max_age()?,
            world_id: config::ready_world_id()?,
        })
    }
}

pub async fn ready(State(state): State<ReadyState>) -> impl IntoResponse {
    match evaluate(&state).await {
        Ok(()) => (StatusCode::OK, "ready\n".to_owned()),
        Err(reasons) => (StatusCode::SERVICE_UNAVAILABLE, format!("{reasons}\n")),
    }
}

async fn evaluate(state: &ReadyState) -> Result<(), String> {
    let integrity = check_integrity(state);
    let bootstrap_policy = check_bootstrap_policy(state);
    let release = check_release(state);
    let watermark = check_watermark(state);
    let effect = check_effect(state);
    let eve = check_eve(state);
    let auth = check_auth(state);
    let storage = check_storage(state);
    let (integrity, release, watermark, effect, eve, auth, storage) =
        tokio::join!(integrity, release, watermark, effect, eve, auth, storage);
    let mut reasons = Vec::new();
    for result in [
        integrity,
        bootstrap_policy,
        release,
        watermark,
        effect,
        eve,
        auth,
        storage,
    ] {
        if let Err(reason) = result {
            reasons.push(reason);
        }
    }
    if reasons.is_empty() {
        Ok(())
    } else {
        Err(reasons.join("\n"))
    }
}

fn check_bootstrap_policy(state: &ReadyState) -> Result<(), String> {
    match CedarPolicyEvaluator::from_path(&state.cedar_manifest_path) {
        Ok(policy) if !policy.is_empty() => Ok(()),
        Ok(_) => Err("bootstrap Cedar is broken: policy manifest is empty".to_owned()),
        Err(error) => Err(format!("bootstrap Cedar is broken: {error}")),
    }
}

async fn check_integrity(state: &ReadyState) -> Result<(), String> {
    state
        .store
        .verify_integrity(
            &state.classification.authority.postgres_tables,
            &state.classification.authority.reference_tables,
            state.require_reference,
        )
        .await
        .map_err(|error| error.to_string())
}

async fn check_release(state: &ReadyState) -> Result<(), String> {
    let Some(world_id) = state.world_id.as_ref() else {
        return Err("active WorldRelease is missing".to_owned());
    };
    let snapshot = state
        .releases
        .get_active_policy_snapshot(world_id)
        .await
        .map_err(active_release_error)?
        .ok_or_else(|| "active WorldRelease is missing".to_owned())?;
    require_loadable_policy_catalog(snapshot.policy().bytes())
        .map(|_| ())
        .map_err(|error| format!("active PolicyCatalog is broken: {error}"))
}

fn active_release_error(error: WorldReleaseError) -> String {
    match error {
        WorldReleaseError::MissingCatalog => "active PolicyCatalog is missing".to_owned(),
        WorldReleaseError::InvalidPolicyCatalog(message) => {
            format!("active PolicyCatalog is broken: {message}")
        }
        error => format!("active WorldRelease is broken: {error}"),
    }
}

async fn check_watermark(state: &ReadyState) -> Result<(), String> {
    let Some(world_id) = state.projection_world_id.as_ref() else {
        return Err("projection watermark is missing".to_owned());
    };
    match state
        .store
        .projection_watermark(world_id, state.watermark_max_age)
        .await
    {
        Ok(ProjectionWatermarkStatus::Current) => Ok(()),
        Ok(ProjectionWatermarkStatus::Missing) => Err("projection watermark is missing".to_owned()),
        Ok(ProjectionWatermarkStatus::Stale) => Err("projection watermark is stale".to_owned()),
        Err(error) => Err(format!("projection watermark is broken: {error}")),
    }
}

async fn check_effect(state: &ReadyState) -> Result<(), String> {
    let Some(url) = state.effect_registration_health_url.as_deref() else {
        return Err("ZoenEffect handler registration is missing".to_owned());
    };
    probe_http(
        &state.http,
        url,
        |status| status == StatusCode::NO_CONTENT,
        "ZoenEffect handler registration is missing",
        "ZoenEffect handler registration is broken",
    )
    .await
}

async fn check_eve(state: &ReadyState) -> Result<(), String> {
    let url = format!("{}/eve/v1/health", state.eve_origin);
    probe_http(
        &state.http,
        &url,
        |status| status == StatusCode::OK,
        "Eve is missing",
        "Eve is broken",
    )
    .await
}

async fn check_auth(state: &ReadyState) -> Result<(), String> {
    let url = format!("{}/login", state.auth_origin);
    probe_http(
        &state.http,
        &url,
        |status| status == StatusCode::OK,
        "Better Auth is missing",
        "Better Auth is broken",
    )
    .await
}

async fn check_storage(state: &ReadyState) -> Result<(), String> {
    let Some(object_store) = state.object_store.as_ref() else {
        return Err("storage is missing".to_owned());
    };
    match tokio::time::timeout(PROBE_TIMEOUT, object_store.probe()).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => Err(format!("storage is broken: {error}")),
        Err(_) => Err("storage is broken".to_owned()),
    }
}

async fn probe_http(
    client: &Client,
    url: &str,
    ok: impl Fn(StatusCode) -> bool,
    missing: &str,
    broken: &str,
) -> Result<(), String> {
    match client.get(url).send().await {
        Ok(response) => {
            let status =
                StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            if ok(status) {
                Ok(())
            } else if status == StatusCode::NOT_FOUND || status == StatusCode::SERVICE_UNAVAILABLE {
                Err(missing.to_owned())
            } else {
                Err(broken.to_owned())
            }
        }
        Err(_) => Err(missing.to_owned()),
    }
}
