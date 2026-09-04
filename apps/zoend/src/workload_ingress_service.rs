use std::{
    collections::BTreeSet,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, post, put},
};
use serde::{Deserialize, Serialize};
use zoen_adapters::{
    IssueWorkloadCredential, PostgresExternalSignalStore, PostgresWorkloadCredentialStore,
};
use zoen_core::{
    ActionId, ActorId, AudienceClass, DelegationChain, DelegationGrant, DelegationId, DigestRef,
    DurableEventId, ExternalSignalDraft, IdentityError, IngressAllowance, PrincipalId,
    ProjectedCapabilityKind, RateBudgetPolicy, ResourceId, ServerAllowId, SignalSourceIdentity,
    SignalTrustDisposition, SourceClass, TimestampMicros, WORKLOAD_CREDENTIALS_RESOURCE,
    WORKLOAD_MANAGE_CREDENTIALS_ACTION, WorkloadCredentialId, WorkloadId, WorkloadRevocationReason,
    WorldId, offer_external_signal_as_evidence_candidate,
};

use crate::session::SessionExchange;

#[derive(Clone)]
pub struct WorkloadIngressState {
    pub credentials: PostgresWorkloadCredentialStore,
    pub signals: PostgresExternalSignalStore,
    pub sessions: SessionExchange,
}

pub fn router(state: WorkloadIngressState) -> Router {
    Router::new()
        .route("/workload/admin/credentials", post(issue_credential))
        .route(
            "/workload/admin/credentials/{credential_id}",
            delete(revoke_credential),
        )
        .route("/workload/authenticate", post(authenticate))
        .route("/workload/signals", put(accept_signal))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueBody {
    world_id: String,
    workload_id: String,
    principal_id: String,
    actor_id: String,
    delegation: Vec<DelegationBody>,
    allowed_ingress: Vec<IngressBody>,
    rate_budget: RateBudgetBody,
    expires_at_micros: i64,
    audience_class: Option<String>,
    jwt_issuer: Option<String>,
    jwt_subject: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DelegationBody {
    id: String,
    actions: Vec<String>,
    resources: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum IngressBody {
    ApiEvent {
        #[serde(rename = "sourceClass")]
        source_class: String,
    },
    McpOutbound {
        #[serde(rename = "capabilityKinds")]
        capability_kinds: Vec<String>,
    },
    McpInboundRead {
        #[serde(rename = "serverAllowlist")]
        server_allowlist: Vec<String>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RateBudgetBody {
    max_accepts_per_minute: u32,
    max_commits_per_hour: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticateBody {
    api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptSignalBody {
    durable_event_id: String,
    source: SignalSourceBody,
    payload_digest_ref: String,
    source_digest_ref: String,
    trust_disposition: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignalSourceBody {
    class: String,
    external_id: String,
    audience_class: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevokeBody {
    world_id: String,
    reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssuedJson {
    credential_id: String,
    api_key_once: String,
    #[serde(rename = "tenantId")]
    world_id: String,
    principal_id: String,
    workload_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionJson {
    credential_id: String,
    #[serde(rename = "tenantId")]
    world_id: String,
    principal_id: String,
    workload_id: String,
    actor_id: String,
    exchange_token: String,
    discoverable_scopes: Vec<ScopeJson>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScopeJson {
    kind: String,
    definition_id: String,
    resource_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AcceptSignalJson {
    signal: SignalJson,
    duplicate: bool,
    evidence_candidate: Option<EvidenceOfferJson>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignalJson {
    id: String,
    durable_event_id: String,
    workload_credential_id: String,
    world_id: String,
    principal_id: String,
    trust_disposition: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceOfferJson {
    signal_id: String,
    world_id: String,
    payload_digest_ref: String,
    source_digest_ref: String,
    workload_credential_id: String,
}

async fn issue_credential(
    State(state): State<Arc<WorkloadIngressState>>,
    headers: HeaderMap,
    Json(body): Json<IssueBody>,
) -> impl IntoResponse {
    let world_id = match WorldId::parse(&body.world_id) {
        Ok(value) => value,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Err(response) = require_credential_operator(&state, &headers, &world_id).await {
        return *response;
    }
    let expires_at = TimestampMicros::new(body.expires_at_micros);
    let delegation = match build_delegation(&body.delegation, &body.workload_id) {
        Ok(value) => value,
        Err(message) => return bad_request(&message),
    };
    let allowed_ingress = match parse_ingress(&body.allowed_ingress) {
        Ok(value) => value,
        Err(message) => return bad_request(&message),
    };
    let cmd = IssueWorkloadCredential {
        world_id,
        workload_id: match WorkloadId::parse(body.workload_id) {
            Ok(value) => value,
            Err(error) => return bad_request(&error.to_string()),
        },
        principal_id: match PrincipalId::parse(body.principal_id) {
            Ok(value) => value,
            Err(error) => return bad_request(&error.to_string()),
        },
        actor_id: match ActorId::parse(body.actor_id) {
            Ok(value) => value,
            Err(error) => return bad_request(&error.to_string()),
        },
        delegation,
        allowed_ingress,
        rate_budget: RateBudgetPolicy {
            max_accepts_per_minute: body.rate_budget.max_accepts_per_minute,
            max_commits_per_hour: body.rate_budget.max_commits_per_hour,
        },
        expires_at,
        audience_class: match body.audience_class {
            Some(value) => match AudienceClass::parse(value) {
                Ok(value) => Some(value),
                Err(error) => return identity_error(&error),
            },
            None => None,
        },
        jwt_issuer: body.jwt_issuer,
        jwt_subject: body.jwt_subject,
        clearance: zoen_core::Clearance::world_floor(),
    };
    match state.credentials.issue(cmd).await {
        Ok(issued) => (
            StatusCode::OK,
            Json(IssuedJson {
                credential_id: issued.credential.id.to_string(),
                api_key_once: issued.api_key_once,
                world_id: issued.credential.world_id.to_string(),
                principal_id: issued.credential.principal_id.to_string(),
                workload_id: issued.credential.workload_id.to_string(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn revoke_credential(
    State(state): State<Arc<WorkloadIngressState>>,
    headers: HeaderMap,
    axum::extract::Path(credential_id): axum::extract::Path<String>,
    Json(body): Json<RevokeBody>,
) -> impl IntoResponse {
    let world_id = match WorldId::parse(body.world_id) {
        Ok(value) => value,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Err(response) = require_credential_operator(&state, &headers, &world_id).await {
        return *response;
    }
    let id = match WorkloadCredentialId::parse(credential_id) {
        Ok(value) => value,
        Err(error) => return bad_request(&error.to_string()),
    };
    let reason = match WorkloadRevocationReason::parse(body.reason.as_deref().unwrap_or("admin")) {
        Ok(value) => value,
        Err(error) => return identity_error(&error),
    };
    match state.credentials.revoke(&world_id, &id, reason).await {
        Ok(credential) => {
            state
                .sessions
                .invalidate_workload_credential(&credential.id);
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "credentialId": credential.id.to_string(),
                    "status": "revoked",
                })),
            )
                .into_response()
        }
        Err(error) => identity_error(&error),
    }
}

async fn authenticate(
    State(state): State<Arc<WorkloadIngressState>>,
    Json(body): Json<AuthenticateBody>,
) -> impl IntoResponse {
    let (credential, tec) = if let Some(api_key) = body.api_key.as_deref() {
        match state.credentials.resolve_api_key(api_key).await {
            Ok(value) => value,
            Err(error) => return identity_error(&error),
        }
    } else {
        return bad_request("apiKey required");
    };

    let exchange_token = match state
        .sessions
        .register_workload_exchange(&credential.id, tec.clone())
    {
        Ok(token) => token,
        Err(error) => return identity_error(&error),
    };
    let discoverable_scopes = credential
        .delegation
        .grants()
        .iter()
        .flat_map(|grant| {
            grant.actions().iter().map(|action| ScopeJson {
                kind: "action".to_owned(),
                definition_id: action.to_string(),
                resource_id: grant
                    .resources()
                    .iter()
                    .next()
                    .map(std::string::ToString::to_string),
            })
        })
        .collect::<Vec<_>>();

    (
        StatusCode::OK,
        Json(SessionJson {
            credential_id: credential.id.to_string(),
            world_id: tec.world_id().to_string(),
            principal_id: tec.principal_id().to_string(),
            workload_id: tec.workload_id().to_string(),
            actor_id: tec.actor_id().to_string(),
            exchange_token,
            discoverable_scopes,
        }),
    )
        .into_response()
}

async fn accept_signal(
    State(state): State<Arc<WorkloadIngressState>>,
    headers: HeaderMap,
    Json(body): Json<AcceptSignalBody>,
) -> impl IntoResponse {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let (credential_id, tec) = match state
        .sessions
        .resolve_workload_exchange(authorization)
        .await
    {
        Ok(value) => value,
        Err(error) => return identity_error(&error),
    };
    let credential = match state.credentials.get(&credential_id).await {
        Ok(value) => value,
        Err(error) => return identity_error(&error),
    };
    let now = now_micros();
    if let Err(error) = zoen_core::trusted_context_from_workload_credential(&credential, now) {
        return identity_error(&error);
    }
    if let Err(error) = state.credentials.consume_accept_budget(&credential).await {
        return identity_error(&error);
    }

    let draft = match parse_signal_draft(body) {
        Ok(draft) => draft,
        Err(error) => return *error,
    };

    match state.signals.accept(&tec, &credential, draft).await {
        Ok((signal, duplicate)) => {
            let evidence_candidate = offer_external_signal_as_evidence_candidate(&signal)
                .ok()
                .map(|offer| EvidenceOfferJson {
                    signal_id: offer.signal_id.to_string(),
                    world_id: offer.world_id.to_string(),
                    payload_digest_ref: offer.payload_digest_ref.as_str().to_owned(),
                    source_digest_ref: offer.source_digest_ref.as_str().to_owned(),
                    workload_credential_id: offer.workload_credential_id.to_string(),
                });
            (
                StatusCode::OK,
                Json(AcceptSignalJson {
                    signal: SignalJson {
                        id: signal.id.to_string(),
                        durable_event_id: signal.durable_event_id.to_string(),
                        workload_credential_id: signal.workload_credential_id.to_string(),
                        world_id: signal.world_id.to_string(),
                        principal_id: signal.principal_id.to_string(),
                        trust_disposition: signal.trust_disposition.as_str().to_owned(),
                    },
                    duplicate,
                    evidence_candidate,
                }),
            )
                .into_response()
        }
        Err(error) => identity_error(&error),
    }
}

fn parse_signal_draft(
    body: AcceptSignalBody,
) -> Result<ExternalSignalDraft, Box<axum::response::Response>> {
    Ok(ExternalSignalDraft {
        durable_event_id: DurableEventId::parse(body.durable_event_id)
            .map_err(|error| Box::new(bad_request(&error.to_string())))?,
        source: SignalSourceIdentity {
            class: SourceClass::parse(body.source.class)
                .map_err(|error| Box::new(identity_error(&error)))?,
            external_id: body.source.external_id,
            audience_class: match body.source.audience_class {
                Some(value) => Some(
                    AudienceClass::parse(value)
                        .map_err(|error| Box::new(identity_error(&error)))?,
                ),
                None => None,
            },
        },
        payload_digest_ref: DigestRef::parse(body.payload_digest_ref)
            .map_err(|error| Box::new(bad_request(&error.to_string())))?,
        source_digest_ref: DigestRef::parse(body.source_digest_ref)
            .map_err(|error| Box::new(bad_request(&error.to_string())))?,
        trust_disposition: SignalTrustDisposition::parse(
            body.trust_disposition
                .as_deref()
                .unwrap_or("evidence_candidate"),
        )
        .map_err(|error| Box::new(bad_request(&error.to_string())))?,
    })
}

fn now_micros() -> TimestampMicros {
    TimestampMicros::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()
            .and_then(|duration| i64::try_from(duration.as_micros()).ok())
            .unwrap_or(0),
    )
}

async fn require_credential_operator(
    state: &WorkloadIngressState,
    headers: &HeaderMap,
    world_id: &WorldId,
) -> Result<(), Box<axum::response::Response>> {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let (_, context) = state
        .sessions
        .resolve_membership(authorization, Some(world_id))
        .await
        .map_err(|error| Box::new(identity_error(&error)))?;
    let action = ActionId::parse(WORKLOAD_MANAGE_CREDENTIALS_ACTION)
        .map_err(|error| Box::new(internal_error(&error.to_string())))?;
    let resource = ResourceId::parse(WORKLOAD_CREDENTIALS_RESOURCE)
        .map_err(|error| Box::new(internal_error(&error.to_string())))?;
    if context
        .delegation()
        .permits(&action, &resource, context.workload_id(), now_micros())
    {
        return Ok(());
    }
    Err(Box::new(
        (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "workload credential administration is not delegated"
            })),
        )
            .into_response(),
    ))
}

fn build_delegation(
    items: &[DelegationBody],
    workload_id: &str,
) -> Result<DelegationChain, String> {
    let workload = WorkloadId::parse(workload_id.to_owned()).map_err(|error| error.to_string())?;
    let grants = items
        .iter()
        .map(|item| {
            let actions = item
                .actions
                .iter()
                .cloned()
                .map(ActionId::parse)
                .collect::<Result<BTreeSet<_>, _>>()
                .map_err(|error| error.to_string())?;
            let resources = item
                .resources
                .clone()
                .unwrap_or_default()
                .into_iter()
                .map(ResourceId::parse)
                .collect::<Result<BTreeSet<_>, _>>()
                .map_err(|error| error.to_string())?;
            DelegationGrant::new(
                DelegationId::parse(item.id.clone()).map_err(|error| error.to_string())?,
                actions,
                resources,
                BTreeSet::from([workload.clone()]),
                TimestampMicros::new(i64::MIN / 2),
                TimestampMicros::new(i64::MAX / 2),
            )
            .map_err(|error| error.to_string())
        })
        .collect::<Result<Vec<_>, _>>()?;
    DelegationChain::new(grants).map_err(|error| error.to_string())
}

fn parse_ingress(items: &[IngressBody]) -> Result<Vec<IngressAllowance>, String> {
    items
        .iter()
        .map(|item| match item {
            IngressBody::ApiEvent { source_class } => Ok(IngressAllowance::ApiEvent {
                source_class: SourceClass::parse(source_class.clone())
                    .map_err(|error| error.to_string())?,
            }),
            IngressBody::McpOutbound { capability_kinds } => {
                Ok(IngressAllowance::OutboundProjected {
                    capability_kinds: capability_kinds
                        .iter()
                        .map(|kind| ProjectedCapabilityKind::parse(kind))
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|error| error.to_string())?,
                })
            }
            IngressBody::McpInboundRead { server_allowlist } => {
                Ok(IngressAllowance::InboundServerAllow {
                    server_allowlist: server_allowlist
                        .iter()
                        .cloned()
                        .map(ServerAllowId::parse)
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|error| error.to_string())?,
                })
            }
        })
        .collect()
}

fn identity_error(error: &IdentityError) -> axum::response::Response {
    let status = match error {
        IdentityError::Unauthenticated
        | IdentityError::InvalidSessionToken
        | IdentityError::WorkloadCredentialInactive
        | IdentityError::WorkloadCredentialExpired => StatusCode::UNAUTHORIZED,
        IdentityError::MembershipNotFound
        | IdentityError::MembershipInactive
        | IdentityError::SubjectUnbound => StatusCode::FORBIDDEN,
        IdentityError::WorkloadCredentialNotFound => StatusCode::NOT_FOUND,
        IdentityError::IngressNotAllowed | IdentityError::RateBudgetExceeded => {
            StatusCode::FORBIDDEN
        }
        IdentityError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
        IdentityError::Conflict(_) => StatusCode::CONFLICT,
        _ => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(serde_json::json!({ "error": error.to_string() })),
    )
        .into_response()
}

fn internal_error(message: &str) -> axum::response::Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": message })),
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
