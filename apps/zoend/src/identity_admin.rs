use std::collections::BTreeSet;
use std::sync::Arc;

use axum::Json;
use axum::Router;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use serde::{Deserialize, Serialize};
use zoen_adapters::{CreateInvite, PostgresIdentityStore};
use zoen_core::{
    ActionId, ActorId, BindingProof, ChannelProvider, DelegationChain, DelegationGrant,
    DelegationId, ExternalSubject, IdentityError, InviteToken, MembershipId, PrincipalId,
    ResourceId, RevocationReason, TenantId, TimestampMicros, UnbindReason, WorkloadId,
    ZoenAccountId,
};

use crate::auth::SessionRegistry;

#[derive(Clone)]
pub struct IdentityAdminState {
    pub identity: PostgresIdentityStore,
    pub sessions: SessionRegistry,
}

pub fn router(state: IdentityAdminState) -> Router {
    Router::new()
        .route("/identity/admin/provisional", post(ensure_provisional))
        .route("/identity/admin/verify-binding", post(verify_binding))
        .route("/identity/admin/bind-verified", post(bind_verified))
        .route("/identity/admin/unbind", post(unbind))
        .route("/identity/admin/personal", post(ensure_personal))
        .route("/identity/admin/invites", post(create_invite))
        .route("/identity/admin/accept-invite", post(accept_invite))
        .route("/identity/admin/revoke", post(revoke_membership))
        .route("/identity/admin/leave", post(leave_membership))
        .route("/identity/admin/plan-merge", post(plan_merge))
        .route("/identity/admin/commit-merge", post(commit_merge))
        .route(
            "/identity/admin/accounts/{account_id}",
            get(snapshot_account),
        )
        .route("/identity/admin/resolve-subject", get(resolve_subject))
        .route("/identity/admin/bootstrap-bound", post(bootstrap_bound))
        .route("/identity/admin/resolve-context", get(resolve_context))
        .with_state(Arc::new(state))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubjectBody {
    provider: String,
    subject_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountBody {
    account_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BindBody {
    account_id: String,
    provider: String,
    subject_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnbindBody {
    binding_id: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteBody {
    tenant_id: String,
    principal_id: String,
    token: String,
    expires_at_micros: i64,
    workload_id: String,
    actor_id: String,
    action_ids: Vec<String>,
    resource_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptInviteBody {
    account_id: String,
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevokeBody {
    membership_id: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeaveBody {
    membership_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergeBody {
    survivor: String,
    absorbed: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitMergeBody {
    survivor: String,
    absorbed: String,
    move_bindings: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ResolveQuery {
    tenant: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveSubjectQuery {
    provider: String,
    subject_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountJson {
    account_id: String,
    status: String,
    merged_into: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BindingJson {
    binding_id: String,
    account_id: String,
    provider: String,
    subject_key: String,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MembershipJson {
    membership_id: String,
    account_id: String,
    tenant_id: String,
    principal_id: String,
    status: String,
    kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotJson {
    account: AccountJson,
    bindings: Vec<BindingJson>,
    memberships: Vec<MembershipJson>,
    personal_tenant: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextJson {
    tenant_id: String,
    principal_id: String,
    actor_id: String,
    workload_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InviteJson {
    invite_id: String,
    tenant_id: String,
    principal_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MergePlanJson {
    survivor: String,
    absorbed: String,
    move_bindings: Vec<String>,
}

async fn ensure_provisional(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<SubjectBody>,
) -> impl IntoResponse {
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(error),
    };
    match state.identity.ensure_provisional(subject).await {
        Ok(account) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "accountId": account.id.as_str(),
                "status": account_status(&account.status),
            })),
        )
            .into_response(),
        Err(error) => identity_error(error),
    }
}

async fn verify_binding(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<AccountBody>,
) -> impl IntoResponse {
    let account_id = match ZoenAccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    match state
        .identity
        .verify_binding(account_id, BindingProof::HarnessVerified)
        .await
    {
        Ok(binding) => (StatusCode::OK, Json(binding_json(&binding))).into_response(),
        Err(error) => identity_error(error),
    }
}

async fn bind_verified(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<BindBody>,
) -> impl IntoResponse {
    let account_id = match ZoenAccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(error),
    };
    match state
        .identity
        .bind_verified_subject(account_id, subject)
        .await
    {
        Ok(binding) => (StatusCode::OK, Json(binding_json(&binding))).into_response(),
        Err(error) => identity_error(error),
    }
}

async fn unbind(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<UnbindBody>,
) -> impl IntoResponse {
    let binding_id = match zoen_core::ExternalBindingId::parse(body.binding_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let reason = match UnbindReason::parse(&body.reason) {
        Ok(reason) => reason,
        Err(error) => return identity_error(error),
    };
    match state.identity.unbind(binding_id, reason).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(error),
    }
}

async fn ensure_personal(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<AccountBody>,
) -> impl IntoResponse {
    let account_id = match ZoenAccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    match state.identity.ensure_personal_workspace(account_id).await {
        Ok(membership) => (StatusCode::OK, Json(membership_json(&membership))).into_response(),
        Err(error) => identity_error(error),
    }
}

async fn create_invite(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<InviteBody>,
) -> impl IntoResponse {
    let tenant_id = match TenantId::parse(body.tenant_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let principal_id = match PrincipalId::parse(body.principal_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let token = match InviteToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return identity_error(error),
    };
    let workload_id = match WorkloadId::parse(body.workload_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let actor_id = match ActorId::parse(body.actor_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let delegation = match build_delegation(&workload_id, &body.action_ids, &body.resource_ids) {
        Ok(delegation) => delegation,
        Err(message) => return bad_request(message),
    };
    match state
        .identity
        .create_invite(CreateInvite {
            actor_id,
            delegation,
            expires_at: TimestampMicros::new(body.expires_at_micros),
            principal_id,
            tenant_id,
            token: &token,
            workload_id,
        })
        .await
    {
        Ok(invite) => (
            StatusCode::OK,
            Json(InviteJson {
                invite_id: invite.id.to_string(),
                tenant_id: invite.tenant_id.to_string(),
                principal_id: invite.principal_id.to_string(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(error),
    }
}

async fn accept_invite(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<AcceptInviteBody>,
) -> impl IntoResponse {
    let account_id = match ZoenAccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let token = match InviteToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return identity_error(error),
    };
    match state.identity.accept_invite(account_id, token).await {
        Ok(membership) => (StatusCode::OK, Json(membership_json(&membership))).into_response(),
        Err(error) => identity_error(error),
    }
}

async fn revoke_membership(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<RevokeBody>,
) -> impl IntoResponse {
    let membership_id = match MembershipId::parse(body.membership_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let reason = match RevocationReason::parse(&body.reason) {
        Ok(reason) => reason,
        Err(error) => return identity_error(error),
    };
    match state
        .identity
        .revoke_membership(membership_id, reason)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(error),
    }
}

async fn leave_membership(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<LeaveBody>,
) -> impl IntoResponse {
    let membership_id = match MembershipId::parse(body.membership_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    match state.identity.leave_membership(membership_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(error),
    }
}

async fn plan_merge(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<MergeBody>,
) -> impl IntoResponse {
    let survivor = match ZoenAccountId::parse(body.survivor) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let absorbed = match ZoenAccountId::parse(body.absorbed) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    match state.identity.plan_merge(survivor, absorbed).await {
        Ok(plan) => (
            StatusCode::OK,
            Json(MergePlanJson {
                survivor: plan.survivor.to_string(),
                absorbed: plan.absorbed.to_string(),
                move_bindings: plan.move_bindings.iter().map(|id| id.to_string()).collect(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(error),
    }
}

async fn commit_merge(
    State(state): State<Arc<IdentityAdminState>>,
    Json(body): Json<CommitMergeBody>,
) -> impl IntoResponse {
    let survivor = match ZoenAccountId::parse(body.survivor) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let absorbed = match ZoenAccountId::parse(body.absorbed) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let move_bindings = match body
        .move_bindings
        .into_iter()
        .map(zoen_core::ExternalBindingId::parse)
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(ids) => ids,
        Err(error) => return bad_request(error.to_string()),
    };
    match state
        .identity
        .commit_merge(zoen_core::AccountMergePlan {
            survivor,
            absorbed,
            move_bindings,
        })
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(error),
    }
}

async fn snapshot_account(
    State(state): State<Arc<IdentityAdminState>>,
    Path(account_id): Path<String>,
) -> impl IntoResponse {
    let account_id = match ZoenAccountId::parse(account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    match state.identity.snapshot_account(&account_id).await {
        Ok(snapshot) => (StatusCode::OK, Json(snapshot_json(&snapshot))).into_response(),
        Err(error) => identity_error(error),
    }
}

async fn resolve_subject(
    State(state): State<Arc<IdentityAdminState>>,
    Query(query): Query<ResolveSubjectQuery>,
) -> impl IntoResponse {
    let subject = match parse_subject(&query.provider, &query.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(error),
    };
    match state.identity.snapshot_for_verified_subject(&subject).await {
        Ok((_binding, snapshot)) => {
            (StatusCode::OK, Json(snapshot_json(&snapshot))).into_response()
        }
        Err(error) => identity_error(error),
    }
}

async fn bootstrap_bound(
    State(state): State<Arc<IdentityAdminState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let verified = match state.sessions.verify_bearer(authorization) {
        Ok(verified) => verified,
        Err(error) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": error.to_string()})),
            )
                .into_response();
        }
    };
    let subject = match ExternalSubject::new(ChannelProvider::WebOidc, verified.subject.clone()) {
        Ok(subject) => subject,
        Err(error) => return identity_error(error),
    };
    let account = match state.identity.ensure_provisional(subject.clone()).await {
        Ok(account) => account,
        Err(error) => return identity_error(error),
    };
    let snapshot = match state.identity.snapshot_account(&account.id).await {
        Ok(snapshot) => snapshot,
        Err(error) => return identity_error(error),
    };
    let already_verified = snapshot.bindings.iter().any(|binding| {
        binding.subject == subject && matches!(binding.status, zoen_core::BindingStatus::Verified)
    });
    if !already_verified {
        if let Err(error) = state
            .identity
            .verify_binding(account.id.clone(), BindingProof::HarnessVerified)
            .await
        {
            return identity_error(error);
        }
    }
    let membership = match state
        .identity
        .ensure_personal_workspace(account.id.clone())
        .await
    {
        Ok(membership) => membership,
        Err(error) => return identity_error(error),
    };
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "accountId": account.id.as_str(),
            "membershipId": membership.id.as_str(),
            "tenantId": membership.tenant_id.as_str(),
            "principalId": membership.principal_id.as_str(),
            "oidcSubject": verified.subject,
        })),
    )
        .into_response()
}

async fn resolve_context(
    State(state): State<Arc<IdentityAdminState>>,
    headers: HeaderMap,
    Query(query): Query<ResolveQuery>,
) -> impl IntoResponse {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    // Build a synthetic request context via execution_context path.
    match state.sessions.verify_bearer(authorization) {
        Ok(verified) => {
            let tenant = match TenantId::parse(query.tenant) {
                Ok(tenant) => tenant,
                Err(error) => return bad_request(error.to_string()),
            };
            match state.identity.resolve_for_tenant(&verified, &tenant).await {
                Ok(context) => (
                    StatusCode::OK,
                    Json(ContextJson {
                        tenant_id: context.tenant_id().to_string(),
                        principal_id: context.principal_id().to_string(),
                        actor_id: context.actor_id().to_string(),
                        workload_id: context.workload_id().to_string(),
                    }),
                )
                    .into_response(),
                Err(error) => identity_error(error),
            }
        }
        Err(error) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": error.to_string()})),
        )
            .into_response(),
    }
}

fn parse_subject(provider: &str, subject_key: &str) -> Result<ExternalSubject, IdentityError> {
    let provider = ChannelProvider::parse(provider)?;
    ExternalSubject::new(provider, subject_key.to_owned())
}

fn build_delegation(
    workload_id: &WorkloadId,
    action_ids: &[String],
    resource_ids: &[String],
) -> Result<DelegationChain, String> {
    let actions = action_ids
        .iter()
        .cloned()
        .map(ActionId::parse)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|error| error.to_string())?;
    let resources = resource_ids
        .iter()
        .cloned()
        .map(ResourceId::parse)
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|error| error.to_string())?;
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.invite").map_err(|error| error.to_string())?,
        actions,
        resources,
        BTreeSet::from([workload_id.clone()]),
        TimestampMicros::new(i64::MIN / 2),
        TimestampMicros::new(i64::MAX / 2),
    )
    .map_err(|error| error.to_string())?;
    DelegationChain::new(vec![grant]).map_err(|error| error.to_string())
}

fn account_status(status: &zoen_core::AccountStatus) -> &'static str {
    match status {
        zoen_core::AccountStatus::Provisional => "provisional",
        zoen_core::AccountStatus::Verified => "verified",
        zoen_core::AccountStatus::MergedInto { .. } => "merged_into",
    }
}

fn snapshot_json(snapshot: &zoen_adapters::AccountSnapshot) -> SnapshotJson {
    SnapshotJson {
        account: AccountJson {
            account_id: snapshot.account.id.to_string(),
            status: account_status(&snapshot.account.status).to_owned(),
            merged_into: match &snapshot.account.status {
                zoen_core::AccountStatus::MergedInto { survivor } => Some(survivor.to_string()),
                _ => None,
            },
        },
        bindings: snapshot.bindings.iter().map(binding_json).collect(),
        memberships: snapshot.memberships.iter().map(membership_json).collect(),
        personal_tenant: snapshot.personal_tenant.clone(),
    }
}

fn binding_json(binding: &zoen_core::ExternalBinding) -> BindingJson {
    BindingJson {
        binding_id: binding.id.to_string(),
        account_id: binding.account_id.to_string(),
        provider: binding.subject.provider.as_str().to_owned(),
        subject_key: binding.subject.subject_key.clone(),
        status: match binding.status {
            zoen_core::BindingStatus::Provisional => "provisional",
            zoen_core::BindingStatus::Verified => "verified",
            zoen_core::BindingStatus::Unbound { .. } => "unbound",
        }
        .to_owned(),
    }
}

fn membership_json(membership: &zoen_core::Membership) -> MembershipJson {
    MembershipJson {
        membership_id: membership.id.to_string(),
        account_id: membership.account_id.to_string(),
        tenant_id: membership.tenant_id.to_string(),
        principal_id: membership.principal_id.to_string(),
        status: match membership.status {
            zoen_core::MembershipStatus::Active => "active",
            zoen_core::MembershipStatus::Revoked { .. } => "revoked",
            zoen_core::MembershipStatus::Left { .. } => "left",
        }
        .to_owned(),
        kind: match membership.kind {
            zoen_core::MembershipKind::Personal => "personal",
            zoen_core::MembershipKind::Invite { .. } => "invite",
            zoen_core::MembershipKind::EnterpriseOidc { .. } => "enterprise_oidc",
        }
        .to_owned(),
    }
}

fn identity_error(error: IdentityError) -> axum::response::Response {
    identity_error_response(error)
}

fn identity_error_response(error: IdentityError) -> axum::response::Response {
    let status = match error {
        IdentityError::Unauthenticated | IdentityError::SubjectUnbound => StatusCode::UNAUTHORIZED,
        IdentityError::AccountNotFound
        | IdentityError::BindingNotFound
        | IdentityError::InviteNotFound
        | IdentityError::MembershipNotFound => StatusCode::NOT_FOUND,
        IdentityError::AlreadyBound
        | IdentityError::AlreadyConsumed
        | IdentityError::InviteExpired
        | IdentityError::MembershipInactive
        | IdentityError::AccountMerged { .. }
        | IdentityError::InviteTenantMismatch
        | IdentityError::Conflict(_)
        | IdentityError::PersonalExists => StatusCode::CONFLICT,
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
