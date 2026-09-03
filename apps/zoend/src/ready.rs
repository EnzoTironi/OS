use std::{path::PathBuf, time::Duration};

use axum::{extract::State, http::StatusCode, response::IntoResponse};
use reqwest::Client;
use zoen_adapters::{
    ActiveReleaseStatus, CedarPolicyEvaluator, PostgresAuthorityStore, ProjectionWatermarkStatus,
};
use zoen_core::TenantId;
use zoen_query::ObjectStoreConfig;
use zoend::{config, integrity::StateClassification};

const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone)]
pub struct ReadyState {
    pub auth_origin: String,
    pub cedar_manifest: PathBuf,
    pub classification: std::sync::Arc<StateClassification>,
    pub eve_origin: String,
    pub effect_registration_health_url: Option<String>,
    pub http: Client,
    pub object_store: Option<ObjectStoreConfig>,
    pub require_reference: bool,
    pub store: PostgresAuthorityStore,
    pub tenant_id: Option<TenantId>,
    pub watermark_max_age: Duration,
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
        Ok(Self {
            auth_origin: config::auth_base_url()?,
            cedar_manifest: config::cedar_manifest_path()?,
            classification,
            eve_origin: config::eve_base_url()?,
            effect_registration_health_url: config::effect_registration_health_url()?,
            http,
            object_store: config::object_store_config()?,
            require_reference,
            store,
            tenant_id: config::ready_tenant_id()?,
            watermark_max_age: config::projection_watermark_max_age()?,
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
    let cedar = async { check_cedar(&state.cedar_manifest) };
    let release = check_release(state);
    let watermark = check_watermark(state);
    let effect = check_effect(state);
    let eve = check_eve(state);
    let auth = check_auth(state);
    let storage = check_storage(state);
    let (integrity, cedar, release, watermark, effect, eve, auth, storage) = tokio::join!(
        integrity, cedar, release, watermark, effect, eve, auth, storage
    );
    let mut reasons = Vec::new();
    for result in [
        integrity, cedar, release, watermark, effect, eve, auth, storage,
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

fn check_cedar(path: &std::path::Path) -> Result<(), String> {
    match CedarPolicyEvaluator::from_path(path) {
        Err(error) => {
            let message = error.to_string();
            if message.contains("failed to read") {
                Err("cedar policy is missing".to_owned())
            } else {
                Err(format!("cedar policy is broken: {error}"))
            }
        }
        Ok(policies) if policies.is_empty() => Err("cedar policy is missing".to_owned()),
        Ok(_) => Ok(()),
    }
}

async fn check_release(state: &ReadyState) -> Result<(), String> {
    let Some(tenant_id) = state.tenant_id.as_ref() else {
        return Err("active WorldRelease is missing".to_owned());
    };
    match state.store.active_release(tenant_id).await {
        Ok(ActiveReleaseStatus::Active) => Ok(()),
        Ok(ActiveReleaseStatus::Missing) => Err("active WorldRelease is missing".to_owned()),
        Ok(ActiveReleaseStatus::Stale) => Err("active WorldRelease is stale".to_owned()),
        Err(error) => Err(format!("active WorldRelease is broken: {error}")),
    }
}

async fn check_watermark(state: &ReadyState) -> Result<(), String> {
    let Some(tenant_id) = state.tenant_id.as_ref() else {
        return Err("projection watermark is missing".to_owned());
    };
    match state
        .store
        .projection_watermark(tenant_id, state.watermark_max_age)
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
