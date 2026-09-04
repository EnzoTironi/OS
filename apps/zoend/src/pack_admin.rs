use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::post,
};
use connectrpc::{ConnectError, ErrorCode};
use serde::Deserialize;
use zoen_adapters::{PostgresAuthorityStore, PostgresPackStore, ReleaseCedarEvaluator};
use zoen_core::{
    ActivatedDefinitionRef, ActivationPrecondition, DefinitionDigest, DefinitionId,
    EvolutionAckDigest, ExecutionContext, FirstSuccessEval, GrantId, GrantStatus, InstallId,
    InstallPhase, Necessity, PackDigest, PackError, PackManifest, PreviewDigest, TenantId,
    TimestampMicros,
};
use zoen_engine::DefinitionEngine;

use crate::session::SessionExchange;

pub struct PackAdminState {
    pub packs: PostgresPackStore,
    pub definitions: DefinitionEngine<PostgresAuthorityStore, Arc<ReleaseCedarEvaluator>>,
    pub sessions: SessionExchange,
}

pub fn router(state: PackAdminState) -> Router {
    Router::new()
        .route("/pack/admin/verify-and-stage", post(verify_and_stage))
        .route("/pack/admin/preview-install", post(preview_install))
        .route("/pack/admin/install", post(install))
        .route("/pack/admin/get-install", post(get_install))
        .route("/pack/admin/decide-grants", post(decide_grants))
        .route("/pack/admin/activate-installed", post(activate_installed))
        .route("/pack/admin/preview-update", post(preview_update))
        .route(
            "/pack/admin/evaluate-first-success",
            post(evaluate_first_success),
        )
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyBody {
    tenant_id: String,
    manifest_jcs: String,
    expected_digest: Option<String>,
    ontology_artifacts: Vec<OntologyArtifactBody>,
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
struct DigestBody {
    tenant_id: String,
    pack_digest: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallBody {
    tenant_id: String,
    pack_digest: String,
    preview_digest: String,
    prior_install_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallIdBody {
    tenant_id: String,
    install_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DecideBody {
    tenant_id: String,
    install_id: String,
    decisions: Vec<GrantDecisionBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrantDecisionBody {
    grant_id: String,
    accept: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateBody {
    tenant_id: String,
    install_id: String,
    evolution_ack_digest: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePreviewBody {
    tenant_id: String,
    from_pack_digest: String,
    to_pack_digest: String,
}

async fn verify_and_stage(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<VerifyBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let expected = match body.expected_digest.map(PackDigest::parse).transpose() {
        Ok(value) => value,
        Err(error) => return bad_request(&error.to_string()),
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
    match state
        .packs
        .verify_and_stage(
            context.tenant_id(),
            context.principal_id().as_str(),
            body.manifest_jcs.as_bytes(),
            expected.as_ref(),
            &ontology_artifacts,
        )
        .await
    {
        Ok((digest, manifest)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "packDigest": digest.as_str(),
                "packId": manifest.pack_id.as_str(),
                "version": manifest.version.as_str(),
                "publisherId": manifest.publisher.publisher_id.as_str(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn preview_install(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<DigestBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let digest = match PackDigest::parse(body.pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .packs
        .derive_preview(context.tenant_id(), &digest)
        .await
    {
        Ok((preview, preview_digest)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "previewDigest": preview_digest.as_str(),
                "writes": preview.writes.iter().map(requirement_json).collect::<Vec<_>>(),
                "reads": preview.reads.iter().map(requirement_json).collect::<Vec<_>>(),
                "requirements": preview.requirements.iter().map(requirement_json).collect::<Vec<_>>(),
                "ontology": preview.ontology.iter().map(|line| serde_json::json!({
                    "definitionId": line.definition_id.as_str(),
                    "digest": line.digest.as_str(),
                    "status": match &line.status {
                        zoen_core::OntologyImpactStatus::Missing => "missing",
                        zoen_core::OntologyImpactStatus::AlreadyActive => "already_active",
                        zoen_core::OntologyImpactStatus::CompatibleUpgrade => "compatible_upgrade",
                        zoen_core::OntologyImpactStatus::BreakingUpgrade { .. } => "breaking_upgrade",
                    },
                })).collect::<Vec<_>>(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn install(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<InstallBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let pack_digest = match PackDigest::parse(body.pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let preview_digest = match PreviewDigest::parse(body.preview_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let prior = match body.prior_install_id.map(InstallId::parse).transpose() {
        Ok(value) => value,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .packs
        .install(
            context.tenant_id(),
            &pack_digest,
            &preview_digest,
            prior.as_ref(),
            context.principal_id().as_str(),
        )
        .await
    {
        Ok(receipt) => (StatusCode::OK, Json(receipt_json(&receipt))).into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn get_install(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<InstallIdBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let install_id = match InstallId::parse(body.install_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .packs
        .get_install(context.tenant_id(), &install_id)
        .await
    {
        Ok(receipt) => (StatusCode::OK, Json(receipt_json(&receipt))).into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn decide_grants(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<DecideBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let install_id = match InstallId::parse(body.install_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let mut decisions = Vec::new();
    for decision in body.decisions {
        let grant_id = match GrantId::parse(decision.grant_id) {
            Ok(id) => id,
            Err(error) => return bad_request(&error.to_string()),
        };
        decisions.push((grant_id, decision.accept));
    }
    match state
        .packs
        .decide_grants(
            context.tenant_id(),
            &install_id,
            &decisions,
            context.principal_id().as_str(),
        )
        .await
    {
        Ok(receipt) => (StatusCode::OK, Json(receipt_json(&receipt))).into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn activate_installed(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<ActivateBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let install_id = match InstallId::parse(body.install_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let evolution_ack = match EvolutionAckDigest::parse(body.evolution_ack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let receipt = match state
        .packs
        .mark_activating(context.tenant_id(), &install_id, &evolution_ack)
        .await
    {
        Ok(receipt) => receipt,
        Err(error) => return pack_error(&error),
    };
    if matches!(receipt.phase, InstallPhase::Active { .. }) {
        return (StatusCode::OK, Json(receipt_json(&receipt))).into_response();
    }
    let manifest = match state
        .packs
        .load_manifest(context.tenant_id(), &receipt.pack_digest)
        .await
    {
        Ok(manifest) => manifest,
        Err(error) => return pack_error(&error),
    };
    let activated = match activate_ontology_dependencies(&state, &context, &manifest).await {
        Ok(activated) => activated,
        Err(error) => return *error,
    };
    match state
        .packs
        .mark_active(context.tenant_id(), &install_id, activated)
        .await
    {
        Ok(receipt) => (StatusCode::OK, Json(receipt_json(&receipt))).into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn activate_ontology_dependencies(
    state: &PackAdminState,
    context: &ExecutionContext,
    manifest: &PackManifest,
) -> Result<Vec<ActivatedDefinitionRef>, Box<axum::response::Response>> {
    let mut activated = Vec::new();
    for dependency in &manifest.ontology_dependencies {
        if let Err(error) = state
            .definitions
            .publish(
                context,
                dependency.canonical_json.as_bytes(),
                dependency.digest.clone(),
                now_micros(),
            )
            .await
        {
            return Err(Box::new(connect_error_response(
                &crate::service::map_publish_error(error),
            )));
        }
        let active = match state
            .definitions
            .get_active_revision(context, &dependency.definition_id)
            .await
        {
            Ok(active) => active,
            Err(error) => {
                return Err(Box::new(pack_error(&PackError::Store(error.to_string()))));
            }
        };
        let precondition = match active.as_ref() {
            None => ActivationPrecondition::NoActiveRevision,
            Some(revision) if revision.digest.as_str() == dependency.digest.as_str() => {
                activated.push(ActivatedDefinitionRef {
                    definition_id: dependency.definition_id.clone(),
                    digest: dependency.digest.clone(),
                });
                continue;
            }
            Some(revision) => ActivationPrecondition::ActiveDigest(revision.digest.clone()),
        };
        match state
            .definitions
            .activate_revision(
                context,
                &dependency.definition_id,
                &dependency.digest,
                &precondition,
                now_micros(),
            )
            .await
        {
            Ok(_) => activated.push(ActivatedDefinitionRef {
                definition_id: dependency.definition_id.clone(),
                digest: dependency.digest.clone(),
            }),
            Err(error) => {
                return Err(Box::new(connect_error_response(
                    &crate::service::map_activate_error(error),
                )));
            }
        }
    }
    Ok(activated)
}

async fn preview_update(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<UpdatePreviewBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let from = match PackDigest::parse(body.from_pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    let to = match PackDigest::parse(body.to_pack_digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .packs
        .permission_diff(context.tenant_id(), &from, &to)
        .await
    {
        Ok(diff) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "reauthorizationRequired": diff.reauthorization_required,
                "addedSensitive": diff.added_sensitive.iter().map(zoen_core::RequirementId::as_str).collect::<Vec<_>>(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

async fn evaluate_first_success(
    State(state): State<Arc<PackAdminState>>,
    headers: HeaderMap,
    Json(body): Json<InstallIdBody>,
) -> impl IntoResponse {
    let context = match require_context(&state, &headers, &body.tenant_id).await {
        Ok(context) => context,
        Err(error) => return context_error(error),
    };
    let install_id = match InstallId::parse(body.install_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .packs
        .evaluate_first_success(context.tenant_id(), &install_id)
        .await
    {
        Ok(FirstSuccessEval::NotReady) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "not_ready" })),
        )
            .into_response(),
        Ok(FirstSuccessEval::NotMatched) => (
            StatusCode::OK,
            Json(serde_json::json!({ "status": "not_matched" })),
        )
            .into_response(),
        Ok(FirstSuccessEval::Matched {
            outcome_ref,
            fired_at,
        }) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "status": "matched",
                "outcomeRef": outcome_ref,
                "firedAtMicros": fired_at.get(),
            })),
        )
            .into_response(),
        Err(error) => pack_error(&error),
    }
}

enum ContextError {
    Unauthorized(String),
    Forbidden(String),
    BadRequest(String),
}

async fn require_context(
    state: &PackAdminState,
    headers: &HeaderMap,
    tenant_id: &str,
) -> Result<ExecutionContext, ContextError> {
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

fn requirement_json(line: &zoen_core::RequirementImpactLine) -> serde_json::Value {
    serde_json::json!({
        "requirementId": line.requirement_id.as_str(),
        "kind": line.kind.as_str(),
        "sensitivity": line.sensitivity.as_str(),
        "necessity": line.necessity,
        "scope": line.scope,
    })
}

fn receipt_json(receipt: &zoen_core::InstallReceipt) -> serde_json::Value {
    serde_json::json!({
        "installId": receipt.install_id.as_str(),
        "packDigest": receipt.pack_digest.as_str(),
        "packId": receipt.pack_id.as_str(),
        "packVersion": receipt.pack_version.as_str(),
        "previewDigest": receipt.preview_digest.as_str(),
        "phase": receipt.phase.kind().as_str(),
        "priorInstallId": receipt.prior_install_id.as_ref().map(InstallId::as_str),
        "grants": receipt.grants.iter().map(|grant| serde_json::json!({
            "grantId": grant.grant_id.as_str(),
            "requirementId": grant.requirement_id.as_str(),
            "necessity": grant.necessity.as_str(),
            "sensitivity": grant.sensitivity.as_str(),
            "kind": grant.kind.as_str(),
            "scope": grant.scope,
            "status": grant.status.as_str(),
            "optional": matches!(grant.necessity, Necessity::Optional { .. }),
            "accepted": matches!(grant.status, GrantStatus::Accepted { .. }),
            "declined": matches!(grant.status, GrantStatus::Declined { .. }),
            "pending": matches!(grant.status, GrantStatus::Pending),
        })).collect::<Vec<_>>(),
        "activated": match &receipt.phase {
            InstallPhase::Active { activated, .. } => activated.iter().map(|item| serde_json::json!({
                "definitionId": item.definition_id.as_str(),
                "digest": item.digest.as_str(),
            })).collect::<Vec<_>>(),
            _ => Vec::new(),
        },
    })
}

fn pack_error(error: &PackError) -> axum::response::Response {
    let status = match &error {
        PackError::DigestMismatch
        | PackError::NonCanonicalPack
        | PackError::InvalidFormat(_)
        | PackError::InvalidVersion(_)
        | PackError::OptionalWithoutDegrade(_)
        | PackError::SecretEmbedded(_)
        | PackError::Identifier(_)
        | PackError::Digest(_)
        | PackError::SignatureInvalid
        | PackError::PublisherKeyUnknown
        | PackError::VisibilityDenied
        | PackError::PublicRegistryDisabled => StatusCode::BAD_REQUEST,
        PackError::PreviewStale
        | PackError::RequiredGrantDeclined(_)
        | PackError::GrantsUnresolved
        | PackError::InvalidPhaseTransition(_)
        | PackError::MissingDependency(_) => StatusCode::PRECONDITION_FAILED,
        PackError::PackNotFound | PackError::InstallNotFound | PackError::ShareNotFound => {
            StatusCode::NOT_FOUND
        }
        PackError::VersionBytesMismatch => StatusCode::CONFLICT,
        PackError::ShareExpired => StatusCode::GONE,
        PackError::Store(_)
        | PackError::InvalidIntegrationKind(_)
        | PackError::InvalidSensitivity(_)
        | PackError::InvalidPhase(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (
        status,
        Json(serde_json::json!({ "error": error.to_string() })),
    )
        .into_response()
}

fn connect_error_response(error: &ConnectError) -> axum::response::Response {
    let status = match error.code {
        ErrorCode::InvalidArgument => StatusCode::BAD_REQUEST,
        ErrorCode::Unauthenticated => StatusCode::UNAUTHORIZED,
        ErrorCode::PermissionDenied => StatusCode::FORBIDDEN,
        ErrorCode::NotFound => StatusCode::NOT_FOUND,
        ErrorCode::AlreadyExists => StatusCode::CONFLICT,
        ErrorCode::FailedPrecondition => StatusCode::PRECONDITION_FAILED,
        ErrorCode::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
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
