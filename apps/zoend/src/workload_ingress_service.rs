use std::collections::BTreeSet;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Json;
use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{post, put};
use serde::{Deserialize, Serialize};
use zoen_adapters::{
    IssueWorkloadCredential, PostgresExternalSignalStore, PostgresWorkloadCredentialStore,
};
use zoen_core::{
    ActionId, ActorId, AudienceClass, DelegationChain, DelegationGrant, DelegationId, DigestRef,
    DurableEventId, ExternalSignalDraft, IdentityError, IngressAllowance, PrincipalId,
    ProjectedCapabilityKind, RateBudgetPolicy, ResourceId, ServerAllowId, SignalSourceIdentity,
    SignalTrustDisposition, SourceClass, TenantId, TimestampMicros, WorkloadCredentialId,
    WorkloadId, WorkloadRevocationReason, offer_external_signal_as_evidence_candidate,
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
            "/workload/admin/credentials/{credential_id}/revoke",
            post(revoke_credential),
        )
        .route("/workload/authenticate", post(authenticate))
        .route("/workload/signals", put(accept_signal))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueBody {
    tenant_id: String,
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
    reason: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IssuedJson {
    credential_id: String,
    api_key_once: String,
    tenant_id: String,
    principal_id: String,
    workload_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionJson {
    credential_id: String,
    tenant_id: String,
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
    tenant_id: String,
    principal_id: String,
    trust_disposition: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceOfferJson {
    signal_id: String,
    tenant_id: String,
    payload_digest_ref: String,
    source_digest_ref: String,
    workload_credential_id: String,
}

async fn issue_credential(
    State(state): State<Arc<WorkloadIngressState>>,
    headers: HeaderMap,
    Json(body): Json<IssueBody>,
) -> impl IntoResponse {
    if let Err(response) = require_ops_bearer(&state, &headers).await {
        return *response;
    }
    let expires_at = TimestampMicros::new(body.expires_at_micros);
    let delegation = match build_delegation(&body.delegation, &body.workload_id) {
        Ok(value) => value,
        Err(message) => return bad_request(message),
    };
    let allowed_ingress = match parse_ingress(&body.allowed_ingress) {
        Ok(value) => value,
        Err(message) => return bad_request(message),
    };
    let cmd = IssueWorkloadCredential {
        tenant_id: match TenantId::parse(body.tenant_id) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        workload_id: match WorkloadId::parse(body.workload_id) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        principal_id: match PrincipalId::parse(body.principal_id) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        actor_id: match ActorId::parse(body.actor_id) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
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
                Err(error) => return identity_error(error),
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
                tenant_id: issued.credential.tenant_id.to_string(),
                principal_id: issued.credential.principal_id.to_string(),
                workload_id: issued.credential.workload_id.to_string(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(error),
    }
}

async fn revoke_credential(
    State(state): State<Arc<WorkloadIngressState>>,
    headers: HeaderMap,
    axum::extract::Path(credential_id): axum::extract::Path<String>,
    Json(body): Json<RevokeBody>,
) -> impl IntoResponse {
    if let Err(response) = require_ops_bearer(&state, &headers).await {
        return *response;
    }
    let id = match WorkloadCredentialId::parse(credential_id) {
        Ok(value) => value,
        Err(error) => return bad_request(error.to_string()),
    };
    let reason = match WorkloadRevocationReason::parse(body.reason.as_deref().unwrap_or("admin")) {
        Ok(value) => value,
        Err(error) => return identity_error(error),
    };
    match state.credentials.revoke(&id, reason).await {
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
        Err(error) => identity_error(error),
    }
}

async fn authenticate(
    State(state): State<Arc<WorkloadIngressState>>,
    Json(body): Json<AuthenticateBody>,
) -> impl IntoResponse {
    let (credential, tec) = if let Some(api_key) = body.api_key.as_deref() {
        match state.credentials.resolve_api_key(api_key).await {
            Ok(value) => value,
            Err(error) => return identity_error(error),
        }
    } else {
        return bad_request("apiKey required".to_owned());
    };

    let exchange_token = state
        .sessions
        .register_workload_exchange(credential.id.clone(), tec.clone());
    let discoverable_scopes = credential
        .delegation
        .grants()
        .iter()
        .flat_map(|grant| {
            grant.actions().iter().map(|action| ScopeJson {
                kind: "action".to_owned(),
                definition_id: action.to_string(),
                resource_id: grant.resources().iter().next().map(|id| id.to_string()),
            })
        })
        .collect::<Vec<_>>();

    (
        StatusCode::OK,
        Json(SessionJson {
            credential_id: credential.id.to_string(),
            tenant_id: tec.tenant_id().to_string(),
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
        Err(error) => return identity_error(error),
    };
    let credential = match state.credentials.get(&credential_id).await {
        Ok(value) => value,
        Err(error) => return identity_error(error),
    };
    let now = TimestampMicros::new(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_micros() as i64)
            .unwrap_or(0),
    );
    if let Err(error) = zoen_core::trusted_context_from_workload_credential(&credential, now) {
        return identity_error(error);
    }
    if let Err(error) = state.credentials.consume_accept_budget(&credential).await {
        return identity_error(error);
    }

    let draft = ExternalSignalDraft {
        durable_event_id: match DurableEventId::parse(body.durable_event_id) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        source: SignalSourceIdentity {
            class: match SourceClass::parse(body.source.class) {
                Ok(value) => value,
                Err(error) => return identity_error(error),
            },
            external_id: body.source.external_id,
            audience_class: match body.source.audience_class {
                Some(value) => match AudienceClass::parse(value) {
                    Ok(value) => Some(value),
                    Err(error) => return identity_error(error),
                },
                None => None,
            },
        },
        payload_digest_ref: match DigestRef::parse(body.payload_digest_ref) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        source_digest_ref: match DigestRef::parse(body.source_digest_ref) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
        trust_disposition: match SignalTrustDisposition::parse(
            body.trust_disposition
                .as_deref()
                .unwrap_or("evidence_candidate"),
        ) {
            Ok(value) => value,
            Err(error) => return bad_request(error.to_string()),
        },
    };

    match state.signals.accept(&tec, &credential, draft).await {
        Ok((signal, duplicate)) => {
            let evidence_candidate = offer_external_signal_as_evidence_candidate(&signal)
                .ok()
                .map(|offer| EvidenceOfferJson {
                    signal_id: offer.signal_id.to_string(),
                    tenant_id: offer.tenant_id.to_string(),
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
                        tenant_id: signal.tenant_id.to_string(),
                        principal_id: signal.principal_id.to_string(),
                        trust_disposition: signal.trust_disposition.as_str().to_owned(),
                    },
                    duplicate,
                    evidence_candidate,
                }),
            )
                .into_response()
        }
        Err(error) => identity_error(error),
    }
}

async fn require_ops_bearer(
    state: &WorkloadIngressState,
    headers: &HeaderMap,
) -> Result<(), Box<axum::response::Response>> {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    state
        .sessions
        .verify_door(authorization)
        .await
        .map(|_| ())
        .map_err(|error| {
            Box::new(
                (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": error.to_string() })),
                )
                    .into_response(),
            )
        })
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

fn identity_error(error: IdentityError) -> axum::response::Response {
    let status = match error {
        IdentityError::Unauthenticated
        | IdentityError::WorkloadCredentialInactive
        | IdentityError::WorkloadCredentialExpired => StatusCode::UNAUTHORIZED,
        IdentityError::WorkloadCredentialNotFound => StatusCode::NOT_FOUND,
        IdentityError::IngressNotAllowed | IdentityError::RateBudgetExceeded => {
            StatusCode::FORBIDDEN
        }
        IdentityError::Conflict(_) => StatusCode::CONFLICT,
        _ => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(serde_json::json!({ "error": error.to_string() })),
    )
        .into_response()
}

fn bad_request(message: String) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}
