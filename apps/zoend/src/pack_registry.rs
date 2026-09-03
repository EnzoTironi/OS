use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
};
use connectrpc::ErrorCode;
use serde::Deserialize;
use zoen_adapters::{PostgresPackRegistryStore, PutObjectInput, RecordAttributionInput};
use zoen_core::{
    AttributionEventKind, DefinitionDigest, DefinitionId, ObjectSource, ObjectStorePutResult,
    OpenResult, PackDigest, PackError, PackId, PackVisibility, PublicKeyId, PublisherId,
    PublisherKey, PublisherKeyStatus, ReferralId, ShareInstallPolicy, ShareResolve, ShareToken,
    SignatureEvidence, TenantId, TimestampMicros, WorldId,
};

use crate::session::SessionExchange;

pub struct PackRegistryState {
    pub registry: PostgresPackRegistryStore,
    pub sessions: SessionExchange,
}

pub fn router(state: PackRegistryState) -> Router {
    Router::new()
        .route("/pack/registry/keys", post(register_key))
        .route("/pack/registry/objects", post(put_object))
        .route("/pack/registry/open", post(open_object))
        .route("/pack/registry/share", post(mint_share))
        .route("/pack/registry/share/resolve", post(resolve_share))
        .route("/pack/registry/search", get(search_public))
        .route("/pack/registry/attribution", post(record_attribution))
        .route(
            "/pack/registry/attribution/summary",
            post(attribution_summary),
        )
        .route("/pack/registry/config", post(set_config))
        .route("/pack/registry/reindex", post(reindex))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterKeyBody {
    public_key_id: String,
    publisher_id: String,
    algorithm: String,
    public_key_pem: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutBody {
    tenant_id: String,
    manifest_jcs: String,
    ontology_artifacts: Vec<OntologyArtifactBody>,
    signature: SignatureBody,
    visibility: VisibilityBody,
    categories: Vec<String>,
    outcome_label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OntologyArtifactBody {
    definition_id: String,
    digest: String,
    canonical_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignatureBody {
    algorithm: String,
    public_key_id: String,
    signature_b64: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
enum VisibilityBody {
    #[serde(rename = "public")]
    Public,
    #[serde(rename = "private", rename_all = "camelCase")]
    Private { tenant_allowlist: Vec<String> },
    #[serde(rename = "local")]
    Local,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenBody {
    tenant_id: Option<String>,
    pack_digest: String,
    #[serde(default)]
    source: Option<OpenSourceBody>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
enum OpenSourceBody {
    #[serde(rename = "registry", rename_all = "camelCase")]
    Registry { endpoint: String },
    #[serde(rename = "inline", rename_all = "camelCase")]
    Inline {
        manifest_jcs: String,
        signature: SignatureBody,
        ontology_artifacts: Vec<OntologyArtifactBody>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MintShareBody {
    tenant_id: String,
    pack_digest: String,
    publisher_id: String,
    referral_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveShareBody {
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttributionBody {
    tenant_id: Option<String>,
    kind: String,
    pack_digest: String,
    publisher_id: String,
    referral_id: String,
    share_token: Option<String>,
    idempotency_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttributionSummaryBody {
    #[serde(rename = "tenantId")]
    tenant: String,
    #[serde(rename = "publisherId")]
    publisher: String,
    #[serde(rename = "packId")]
    pack: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigBody {
    tenant_id: String,
    public_registry_enabled: bool,
}

async fn register_key(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<RegisterKeyBody>,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    let key = match build_key(&body) {
        Ok(key) => key,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state.registry.register_publisher_key(&key).await {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "publicKeyId": key.public_key_id.as_str(),
                "publisherId": key.publisher_id.as_str(),
                "status": key.status.as_str(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn put_object(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<PutBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let mut ontology_artifacts = Vec::new();
    for artifact in body.ontology_artifacts {
        let definition_id = match DefinitionId::parse(artifact.definition_id) {
            Ok(id) => id,
            Err(error) => return bad_request(&error.to_string()),
        };
        let digest = match DefinitionDigest::parse(artifact.digest) {
            Ok(digest) => digest,
            Err(error) => return bad_request(&error.to_string()),
        };
        ontology_artifacts.push((definition_id, digest, artifact.canonical_json));
    }
    let signature = match parse_signature(body.signature) {
        Ok(signature) => signature,
        Err(error) => return bad_request(&error.to_string()),
    };
    let visibility = match body.visibility {
        VisibilityBody::Public => PackVisibility::Public,
        VisibilityBody::Private { tenant_allowlist } => {
            let mut world_allowlist = Vec::new();
            for value in tenant_allowlist {
                match WorldId::parse(value) {
                    Ok(world) => world_allowlist.push(world),
                    Err(error) => return bad_request(&error.to_string()),
                }
            }
            PackVisibility::Private { world_allowlist }
        }
        VisibilityBody::Local => PackVisibility::Local,
    };
    match state
        .registry
        .put_object(PutObjectInput {
            manifest_jcs: body.manifest_jcs,
            ontology_artifacts,
            signature,
            visibility,
            categories: body.categories,
            outcome_label: body.outcome_label,
            stored_by: context.principal_id().as_str().to_owned(),
        })
        .await
    {
        Ok(ObjectStorePutResult::Created { pack_digest }) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "kind": "created",
                "packDigest": pack_digest.as_str(),
                "objectStored": true,
                "catalogProjected": true,
            })),
        )
            .into_response(),
        Ok(ObjectStorePutResult::IdempotentReplay { pack_digest }) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "kind": "idempotentReplay",
                "packDigest": pack_digest.as_str(),
                "objectStored": true,
                "catalogProjected": true,
            })),
        )
            .into_response(),
        Ok(ObjectStorePutResult::Conflict { reason }) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "kind": "conflict",
                "reason": reason.as_str(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn open_object(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<OpenBody>,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    let digest = match PackDigest::parse(body.pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let viewer_tenant = body.tenant_id.as_deref();
    let source = match body.source.unwrap_or(OpenSourceBody::Registry {
        endpoint: "public".to_owned(),
    }) {
        OpenSourceBody::Registry { endpoint } => ObjectSource::Registry { endpoint },
        OpenSourceBody::Inline {
            manifest_jcs,
            signature,
            ontology_artifacts,
        } => {
            let signature = match parse_signature(signature) {
                Ok(signature) => signature,
                Err(error) => return bad_request(&error.to_string()),
            };
            let mut ontology = Vec::new();
            for artifact in ontology_artifacts {
                let definition_id = match DefinitionId::parse(artifact.definition_id) {
                    Ok(id) => id,
                    Err(error) => return bad_request(&error.to_string()),
                };
                let definition_digest = match DefinitionDigest::parse(artifact.digest) {
                    Ok(digest) => digest,
                    Err(error) => return bad_request(&error.to_string()),
                };
                ontology.push(zoen_core::PackObjectOntology {
                    definition_id,
                    definition_digest,
                    canonical_json: artifact.canonical_json,
                });
            }
            ObjectSource::Inline {
                object: zoen_core::PackObject {
                    pack_digest: digest.clone(),
                    format_version: zoen_core::PACK_FORMAT_V1.to_owned(),
                    manifest_jcs,
                    signature,
                    ontology,
                    lock_jcs: String::new(),
                    stored_at: now_micros(),
                    stored_by: "inline".to_owned(),
                },
            }
        }
    };
    match state.registry.open(&digest, source, viewer_tenant).await {
        Ok(result) => open_json(result),
        Err(error) => pack_error(&error),
    }
}

async fn mint_share(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<MintShareBody>,
) -> impl IntoResponse {
    if let Err(error) = require_context(&state, &headers, &body.tenant_id).await {
        return context_error(error);
    }
    let digest = match PackDigest::parse(body.pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let publisher_id = match PublisherId::parse(body.publisher_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let referral_id = match ReferralId::parse(
        body.referral_id
            .unwrap_or_else(|| format!("ref_{}", now_micros().get())),
    ) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .registry
        .mint_share(&digest, &publisher_id, &referral_id)
        .await
    {
        Ok(token) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "token": token.as_str(),
                "packDigest": digest.as_str(),
                "publisherId": publisher_id.as_str(),
                "referralId": referral_id.as_str(),
                "uri": format!("zoen://pack/s/{}", token.as_str()),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn resolve_share(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<ResolveShareBody>,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    let token = match ShareToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state.registry.resolve_share(&token).await {
        Ok(ShareResolve::Ok {
            pack_digest,
            publisher_id,
            referral_id,
            presentation,
            install_policy,
        }) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "kind": "ok",
                "packDigest": pack_digest.as_str(),
                "publisherId": publisher_id.as_str(),
                "referralId": referral_id.as_str(),
                "presentation": {
                    "title": presentation.title,
                    "summary": presentation.summary,
                    "outcomeLabel": presentation.title,
                },
                "installPolicy": match install_policy {
                    ShareInstallPolicy::Allowed => serde_json::json!({ "status": "allowed" }),
                    ShareInstallPolicy::Blocked { advisory_id } => serde_json::json!({
                        "status": "blocked",
                        "advisoryId": advisory_id,
                    }),
                },
            })),
        )
            .into_response(),
        Ok(ShareResolve::NotFound) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "kind": "notFound" })),
        )
            .into_response(),
        Ok(ShareResolve::Expired) => (
            StatusCode::GONE,
            Json(serde_json::json!({ "kind": "expired" })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn search_public(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    match state.registry.search_public(None).await {
        Ok(entries) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "entries": entries.iter().map(|entry| serde_json::json!({
                    "packDigest": entry.pack_digest.as_str(),
                    "packId": entry.pack_id.as_str(),
                    "version": entry.version.as_str(),
                    "publisherId": entry.publisher_id.as_str(),
                    "outcomeLabel": entry.outcome_label,
                    "categories": entry.categories,
                    "visibility": entry.visibility.as_str(),
                })).collect::<Vec<_>>(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn record_attribution(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<AttributionBody>,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    let kind = match AttributionEventKind::parse(&body.kind) {
        Ok(kind) => kind,
        Err(error) => return bad_request(&error.to_string()),
    };
    let digest = match PackDigest::parse(body.pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let publisher_id = match PublisherId::parse(body.publisher_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let referral_id = match ReferralId::parse(body.referral_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .registry
        .record_attribution(RecordAttributionInput {
            kind,
            pack_digest: &digest,
            publisher_id: &publisher_id,
            referral_id: &referral_id,
            share_token: body.share_token.as_deref(),
            tenant_id: body.tenant_id.as_deref(),
            idempotency_key: &body.idempotency_key,
        })
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "recorded": true })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn attribution_summary(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<AttributionSummaryBody>,
) -> impl IntoResponse {
    if let Err(error) = require_context(&state, &headers, &body.tenant).await {
        return context_error(error);
    }
    let publisher_id = match PublisherId::parse(body.publisher) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let pack_id = match PackId::parse(body.pack) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .registry
        .creator_attribution(&publisher_id, &pack_id)
        .await
    {
        Ok(summary) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "packId": summary.pack_id.as_str(),
                "publisherId": summary.publisher_id.as_str(),
                "visits": summary.visits,
                "installs": summary.installs,
                "firstSuccessCount": summary.first_success_count,
                "byDigest": summary.by_digest.iter().map(|row| serde_json::json!({
                    "packDigest": row.pack_digest.as_str(),
                    "installs": row.installs,
                    "firstSuccess": row.first_success,
                })).collect::<Vec<_>>(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn set_config(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
    Json(body): Json<ConfigBody>,
) -> impl IntoResponse {
    if let Err(error) = require_context(&state, &headers, &body.tenant_id).await {
        return context_error(error);
    }
    match state
        .registry
        .set_public_registry_enabled(body.public_registry_enabled)
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "publicRegistryEnabled": body.public_registry_enabled,
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn reindex(
    State(state): State<Arc<PackRegistryState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(error) = require_bearer(&state, &headers).await {
        return context_error(error);
    }
    match state.registry.reindex().await {
        Ok((objects_scanned, entries_upserted)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "objectsScanned": objects_scanned,
                "entriesUpserted": entries_upserted,
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

fn build_key(body: &RegisterKeyBody) -> Result<PublisherKey, PackError> {
    Ok(PublisherKey {
        public_key_id: PublicKeyId::parse(body.public_key_id.clone())?,
        publisher_id: PublisherId::parse(body.publisher_id.clone())?,
        algorithm: body.algorithm.clone(),
        public_key_pem: body.public_key_pem.clone(),
        status: PublisherKeyStatus::Active,
        valid_from: now_micros(),
        valid_to: None,
    })
}

fn parse_signature(body: SignatureBody) -> Result<SignatureEvidence, PackError> {
    Ok(SignatureEvidence {
        algorithm: body.algorithm,
        public_key_id: PublicKeyId::parse(body.public_key_id)?,
        signature_b64: body.signature_b64,
    })
}

fn open_json(result: OpenResult) -> axum::response::Response {
    match result {
        OpenResult::Opened {
            pack_digest,
            manifest,
            manifest_jcs,
            ontology_artifacts,
            signature_verified,
            ..
        } => (
            StatusCode::OK,
            Json(serde_json::json!({
                "kind": "opened",
                "packDigest": pack_digest.as_str(),
                "bytesHash": pack_digest.as_str(),
                "signatureVerified": signature_verified,
                "manifestJcs": manifest_jcs,
                "packId": manifest.pack_id.as_str(),
                "version": manifest.version.as_str(),
                "publisherId": manifest.publisher.publisher_id.as_str(),
                "ontologyArtifacts": ontology_artifacts.iter().map(|artifact| serde_json::json!({
                    "definitionId": artifact.definition_id.as_str(),
                    "digest": artifact.definition_digest.as_str(),
                    "canonicalJson": artifact.canonical_json,
                })).collect::<Vec<_>>(),
            })),
        )
            .into_response(),
        OpenResult::DigestMismatch { expected, actual } => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "kind": "digestMismatch",
                "expected": expected.as_str(),
                "actual": actual.as_str(),
            })),
        )
            .into_response(),
        OpenResult::SignatureInvalid => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "kind": "signatureInvalid" })),
        )
            .into_response(),
        OpenResult::PublisherKeyUnknown => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "kind": "publisherKeyUnknown" })),
        )
            .into_response(),
        OpenResult::ObjectNotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "kind": "objectNotFound" })),
        )
            .into_response(),
        OpenResult::VisibilityDenied => (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "kind": "visibilityDenied" })),
        )
            .into_response(),
    }
}

enum ContextError {
    Unauthorized(String),
    Forbidden(String),
    BadRequest(String),
}

async fn require_bearer(
    state: &PackRegistryState,
    headers: &HeaderMap,
) -> Result<(), ContextError> {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    state
        .sessions
        .resolve(authorization, None)
        .await
        .map(|_| ())
        .map_err(|error| map_resolve_error(&error))
}

async fn require_context(
    state: &PackRegistryState,
    headers: &HeaderMap,
    tenant_id: &str,
) -> Result<zoen_core::ExecutionContext, ContextError> {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let claimed =
        TenantId::parse(tenant_id).map_err(|error| ContextError::BadRequest(error.to_string()))?;
    let context = state
        .sessions
        .resolve(authorization, Some(&claimed))
        .await
        .map_err(|error| map_resolve_error(&error))?;
    if context.tenant_id() != &claimed {
        return Err(ContextError::Forbidden(
            "payload tenant does not match the trusted session".to_owned(),
        ));
    }
    Ok(context)
}

fn map_resolve_error(error: &connectrpc::ConnectError) -> ContextError {
    match error.code {
        ErrorCode::Unauthenticated => ContextError::Unauthorized(error.to_string()),
        ErrorCode::InvalidArgument => ContextError::BadRequest(error.to_string()),
        _ => ContextError::Forbidden(error.to_string()),
    }
}

fn context_error(error: ContextError) -> axum::response::Response {
    match error {
        ContextError::Unauthorized(message) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
        ContextError::Forbidden(message) => (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": message })),
        )
            .into_response(),
        ContextError::BadRequest(message) => bad_request(&message),
    }
}

fn pack_error(error: &PackError) -> axum::response::Response {
    let status = match &error {
        PackError::DigestMismatch
        | PackError::NonCanonicalPack
        | PackError::InvalidFormat(_)
        | PackError::InvalidVersion(_)
        | PackError::SecretEmbedded(_)
        | PackError::SignatureInvalid
        | PackError::PublisherKeyUnknown
        | PackError::Identifier(_)
        | PackError::Digest(_) => StatusCode::BAD_REQUEST,
        PackError::VisibilityDenied | PackError::PublicRegistryDisabled => StatusCode::FORBIDDEN,
        PackError::VersionBytesMismatch => StatusCode::CONFLICT,
        PackError::PackNotFound | PackError::ShareNotFound | PackError::InstallNotFound => {
            StatusCode::NOT_FOUND
        }
        PackError::ShareExpired => StatusCode::GONE,
        PackError::MissingDependency(_) => StatusCode::PRECONDITION_FAILED,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (
        status,
        Json(serde_json::json!({ "error": error.to_string() })),
    )
        .into_response()
}

fn bad_request(message: &str) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn now_micros() -> TimestampMicros {
    TimestampMicros::new(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|duration| i64::try_from(duration.as_micros()).ok())
            .unwrap_or(0),
    )
}
