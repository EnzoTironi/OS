use std::{collections::BTreeSet, sync::Arc};

use axum::{
    Json, Router,
    extract::{Extension, Path, Query, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use zoen_adapters::{CreateInvite, PostgresIdentityStore};
use zoen_core::{
    AccountId, ActionId, ActorId, ChannelProvider, DelegationChain, DelegationGrant, DelegationId,
    ExternalSubject, IdentityError, InviteToken, MembershipId, PrincipalId, ResourceId,
    RevocationReason, TimestampMicros, UnbindReason, WorkloadId, WorldId,
};

use crate::{
    identity_admin_auth::{
        IdentityAdminActor, authenticate_identity_admin, forbidden, identity_error_response,
        require_account, require_machine,
    },
    session::SessionExchange,
};

#[derive(Clone)]
pub struct IdentityAdminState {
    pub identity: PostgresIdentityStore,
    pub sessions: SessionExchange,
    pub admin_token: Option<String>,
}

pub fn router(state: IdentityAdminState) -> Router {
    let shared = Arc::new(state);
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
        .route("/identity/admin/onboard-tokens", post(mint_onboard_token))
        .route("/identity/admin/admit-whatsapp", post(admit_whatsapp))
        .route("/identity/admin/bootstrap-bound", post(bootstrap_bound))
        .route("/identity/admin/resolve-context", get(resolve_context))
        .route("/identity/admin/resolve-ingress", get(resolve_ingress))
        .layer(middleware::from_fn_with_state(
            shared.clone(),
            require_identity_admin_auth,
        ))
        .with_state(shared)
}

async fn require_identity_admin_auth(
    State(state): State<Arc<IdentityAdminState>>,
    request: Request,
    next: Next,
) -> Response {
    let authorization = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let Some(actor) =
        authenticate_identity_admin(&state.sessions, state.admin_token.as_deref(), authorization)
            .await
    else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "unauthenticated"})),
        )
            .into_response();
    };
    let mut request = request;
    request.extensions_mut().insert(actor);
    next.run(request).await
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
    world_id: String,
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
    world: String,
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
    world_id: String,
    principal_id: String,
    status: String,
    kind: String,
    actor_id: String,
    workload_id: String,
    clearance: Vec<String>,
    delegated_action_ids: Vec<String>,
    delegated_resource_ids: Vec<String>,
    delegated_workload_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotJson {
    account: AccountJson,
    bindings: Vec<BindingJson>,
    memberships: Vec<MembershipJson>,
    personal_world: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextJson {
    membership_id: String,
    clearance: Vec<String>,
    world_id: String,
    principal_id: String,
    actor_id: String,
    workload_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InviteJson {
    #[serde(rename = "inviteId")]
    invite: String,
    #[serde(rename = "worldId")]
    world_id: String,
    #[serde(rename = "principalId")]
    principal: String,
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
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<SubjectBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(&error),
    };
    if let Err(error) = reject_whatsapp_door(&subject) {
        return identity_error(&error);
    }
    match state.identity.ensure_provisional(subject).await {
        Ok(account) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "accountId": account.id.as_str(),
                "status": account_status(&account.status),
            })),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn verify_binding(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<AccountBody>,
) -> impl IntoResponse {
    let account_id = match AccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    match state.identity.verify_binding(account_id).await {
        Ok(binding) => (StatusCode::OK, Json(binding_json(&binding))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn bind_verified(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<BindBody>,
) -> impl IntoResponse {
    let account_id = match AccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(&error),
    };
    if let Err(error) = reject_whatsapp_door(&subject) {
        return identity_error(&error);
    }
    match state
        .identity
        .bind_verified_subject(account_id, subject)
        .await
    {
        Ok(binding) => (StatusCode::OK, Json(binding_json(&binding))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn unbind(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<UnbindBody>,
) -> impl IntoResponse {
    let binding_id = match zoen_core::ChannelBindingId::parse(body.binding_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let binding = match state.identity.get_binding(&binding_id).await {
        Ok(binding) => binding,
        Err(error) => return identity_error(&error),
    };
    if let Some(error) = require_account(&state.identity, &actor, &binding.account_id).await {
        return error;
    }
    let reason = match UnbindReason::parse(&body.reason) {
        Ok(reason) => reason,
        Err(error) => return identity_error(&error),
    };
    match state.identity.unbind(binding_id, reason).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn ensure_personal(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<AccountBody>,
) -> impl IntoResponse {
    let account_id = match AccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Some(error) = require_account(&state.identity, &actor, &account_id).await {
        return error;
    }
    match state.identity.ensure_personal_workspace(account_id).await {
        Ok(membership) => (StatusCode::OK, Json(membership_json(&membership))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn create_invite(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<InviteBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let world_id = match WorldId::parse(body.world_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let principal_id = match PrincipalId::parse(body.principal_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let token = match InviteToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return identity_error(&error),
    };
    let workload_id = match WorkloadId::parse(body.workload_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let actor_id = match ActorId::parse(body.actor_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let delegation = match build_delegation(&workload_id, &body.action_ids, &body.resource_ids) {
        Ok(delegation) => delegation,
        Err(message) => return bad_request(&message),
    };
    match state
        .identity
        .create_invite(CreateInvite {
            actor_id,
            clearance: zoen_core::Clearance::personal_owner(),
            delegation,
            expires_at: TimestampMicros::new(body.expires_at_micros),
            principal_id,
            world_id,
            token: &token,
            workload_id,
        })
        .await
    {
        Ok(invite) => (
            StatusCode::OK,
            Json(InviteJson {
                invite: invite.id.to_string(),
                world_id: invite.world_id.to_string(),
                principal: invite.principal_id.to_string(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn accept_invite(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<AcceptInviteBody>,
) -> impl IntoResponse {
    let account_id = match AccountId::parse(body.account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Some(error) = require_account(&state.identity, &actor, &account_id).await {
        return error;
    }
    let token = match InviteToken::parse(body.token) {
        Ok(token) => token,
        Err(error) => return identity_error(&error),
    };
    match state.identity.accept_invite(account_id, token).await {
        Ok(membership) => (StatusCode::OK, Json(membership_json(&membership))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn revoke_membership(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<RevokeBody>,
) -> impl IntoResponse {
    let membership_id = match MembershipId::parse(body.membership_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let membership = match state.identity.get_membership(&membership_id).await {
        Ok(membership) => membership,
        Err(error) => return identity_error(&error),
    };
    if let Some(error) = require_account(&state.identity, &actor, &membership.account_id).await {
        return error;
    }
    let reason = match RevocationReason::parse(&body.reason) {
        Ok(reason) => reason,
        Err(error) => return identity_error(&error),
    };
    match state
        .identity
        .revoke_membership(membership_id, reason)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn leave_membership(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<LeaveBody>,
) -> impl IntoResponse {
    let membership_id = match MembershipId::parse(body.membership_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let membership = match state.identity.get_membership(&membership_id).await {
        Ok(membership) => membership,
        Err(error) => return identity_error(&error),
    };
    if let Some(error) = require_account(&state.identity, &actor, &membership.account_id).await {
        return error;
    }
    match state.identity.leave_membership(membership_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn plan_merge(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<MergeBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let survivor = match AccountId::parse(body.survivor) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let absorbed = match AccountId::parse(body.absorbed) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state.identity.plan_merge(survivor, absorbed).await {
        Ok(plan) => (
            StatusCode::OK,
            Json(MergePlanJson {
                survivor: plan.survivor.to_string(),
                absorbed: plan.absorbed.to_string(),
                move_bindings: plan
                    .move_bindings
                    .iter()
                    .map(std::string::ToString::to_string)
                    .collect(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn commit_merge(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<CommitMergeBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let survivor = match AccountId::parse(body.survivor) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let absorbed = match AccountId::parse(body.absorbed) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let move_bindings = match body
        .move_bindings
        .into_iter()
        .map(zoen_core::ChannelBindingId::parse)
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(ids) => ids,
        Err(error) => return bad_request(&error.to_string()),
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
        Err(error) => identity_error(&error),
    }
}

async fn snapshot_account(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Path(account_id): Path<String>,
) -> impl IntoResponse {
    let account_id = match AccountId::parse(account_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    if let Some(error) = require_account(&state.identity, &actor, &account_id).await {
        return error;
    }
    match state.identity.snapshot_account(&account_id).await {
        Ok(snapshot) => (StatusCode::OK, Json(snapshot_json(&snapshot))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn resolve_subject(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Query(query): Query<ResolveSubjectQuery>,
) -> impl IntoResponse {
    let subject = match parse_subject(&query.provider, &query.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(&error),
    };
    match state.identity.snapshot_for_verified_subject(&subject).await {
        Ok((_binding, snapshot)) => {
            if let Some(error) =
                require_account(&state.identity, &actor, &snapshot.account.id).await
            {
                return error;
            }
            (StatusCode::OK, Json(snapshot_json(&snapshot))).into_response()
        }
        Err(error) => identity_error(&error),
    }
}

async fn admit_whatsapp(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<SubjectBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(&error),
    };
    if let Err(error) = reject_whatsapp_door(&subject) {
        return identity_error(&error);
    }
    match state.identity.admit_whatsapp(subject).await {
        Ok(snapshot) => (StatusCode::OK, Json(snapshot_json(&snapshot))).into_response(),
        Err(error) => identity_error(&error),
    }
}

async fn mint_onboard_token(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<SubjectBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let subject = match parse_subject(&body.provider, &body.subject_key) {
        Ok(subject) => subject,
        Err(error) => return identity_error(&error),
    };
    if let Err(error) = reject_whatsapp_door(&subject) {
        return identity_error(&error);
    }
    let hours = std::env::var("ZOEN_ONBOARD_TTL_HOURS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0 && *value <= 168)
        .unwrap_or(24);
    match state
        .identity
        .mint_onboard_token(subject, std::time::Duration::from_secs(hours * 3600))
        .await
    {
        Ok(minted) => {
            let origin = public_origin();
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "token": minted.token,
                    "href": format!("{origin}/onboard/{}", minted.token),
                    "expiresAtMicros": minted.expires_at.get(),
                })),
            )
                .into_response()
        }
        Err(error) => identity_error(&error),
    }
}

fn public_origin() -> String {
    std::env::var("ZOEN_PUBLIC_ORIGIN")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "https://app.zoen.local".to_owned())
}

async fn bootstrap_bound(
    State(state): State<Arc<IdentityAdminState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    let verified = match state.sessions.verify_door(authorization).await {
        Ok(verified) => verified,
        Err(error) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": error.to_string()})),
            )
                .into_response();
        }
    };
    let subject =
        match ExternalSubject::new(ChannelProvider::AuthDoor, verified.door_user_key.clone()) {
            Ok(subject) => subject,
            Err(error) => return identity_error(&error),
        };
    let account = match state.identity.ensure_provisional(subject.clone()).await {
        Ok(account) => account,
        Err(error) => return identity_error(&error),
    };
    let snapshot = match state.identity.snapshot_account(&account.id).await {
        Ok(snapshot) => snapshot,
        Err(error) => return identity_error(&error),
    };
    let already_verified = snapshot.bindings.iter().any(|binding| {
        binding.subject == subject && matches!(binding.status, zoen_core::BindingStatus::Verified)
    });
    if !already_verified && let Err(error) = state.identity.verify_binding(account.id.clone()).await
    {
        return identity_error(&error);
    }
    let membership = match state
        .identity
        .ensure_personal_workspace(account.id.clone())
        .await
    {
        Ok(membership) => membership,
        Err(error) => return identity_error(&error),
    };
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "accountId": account.id.as_str(),
            "membershipId": membership.id.as_str(),
            "worldId": membership.world_id.as_str(),
            "principalId": membership.principal_id.as_str(),
            "doorUserKey": verified.door_user_key,
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
    let world = match WorldId::parse(query.world) {
        Ok(tenant) => tenant,
        Err(error) => return bad_request(&error.to_string()),
    };
    match state
        .sessions
        .resolve_membership(authorization, Some(&world))
        .await
    {
        Ok((membership, context)) => (
            StatusCode::OK,
            Json(ContextJson {
                membership_id: membership.id.to_string(),
                clearance: context.clearance().to_token_strings(),
                world_id: context.world_id().to_string(),
                principal_id: context.principal_id().to_string(),
                actor_id: context.actor_id().to_string(),
                workload_id: context.workload_id().to_string(),
            }),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

#[derive(Debug, Deserialize)]
struct ResolveIngressQuery {
    provider: Option<String>,
    #[serde(rename = "subjectKey")]
    subject_key: Option<String>,
    world: String,
}

async fn resolve_ingress(
    State(state): State<Arc<IdentityAdminState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Query(query): Query<ResolveIngressQuery>,
) -> impl IntoResponse {
    let world = match WorldId::parse(query.world) {
        Ok(world) => world,
        Err(error) => return bad_request(&error.to_string()),
    };
    if query.provider.is_some() != query.subject_key.is_some() {
        return bad_request("provider and subjectKey must be provided together");
    }
    let result = if let (Some(provider), Some(subject_key)) =
        (query.provider.as_deref(), query.subject_key.as_deref())
    {
        if let Some(error) = require_machine(&actor) {
            return error;
        }
        let subject = match parse_subject(provider, subject_key) {
            Ok(subject) => subject,
            Err(error) => return identity_error(&error),
        };
        state.identity.resolve_bound_ingress(&subject, &world).await
    } else {
        let IdentityAdminActor::Door(verified) = &actor else {
            return forbidden();
        };
        let subject =
            match ExternalSubject::new(ChannelProvider::AuthDoor, verified.door_user_key.clone()) {
                Ok(subject) => subject,
                Err(error) => return identity_error(&error),
            };
        state.identity.resolve_bound_ingress(&subject, &world).await
    };
    match result {
        Ok(ingress) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "accountId": ingress.account.id.as_str(),
                "accountStatus": account_status(&ingress.account.status),
                "bindingId": ingress.binding.id.as_str(),
                "bindingProvider": ingress.binding.subject.provider.as_str(),
                "membershipId": ingress.membership.id.as_str(),
                "worldId": ingress.world_id.as_str(),
                "principalId": ingress.membership.principal_id.as_str(),
                "activeReleaseDigest": ingress.active_release_digest,
            })),
        )
            .into_response(),
        Err(error) => identity_error(&error),
    }
}

fn parse_subject(provider: &str, subject_key: &str) -> Result<ExternalSubject, IdentityError> {
    let provider = ChannelProvider::parse(provider)?;
    ExternalSubject::new(provider, subject_key.to_owned())
}

fn reject_whatsapp_door(subject: &ExternalSubject) -> Result<(), IdentityError> {
    subject.reject_if_whatsapp_door(std::env::var("ZOEN_WHATSAPP_DOOR_E164").ok().as_deref())
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
        personal_world: snapshot.personal_world.clone(),
    }
}

fn binding_json(binding: &zoen_core::ChannelBinding) -> BindingJson {
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
    let effective_grant = membership.delegation.grants().last();
    MembershipJson {
        membership_id: membership.id.to_string(),
        account_id: membership.account_id.to_string(),
        world_id: membership.world_id.to_string(),
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
        }
        .to_owned(),
        actor_id: membership.actor_id.to_string(),
        workload_id: membership.workload_id.to_string(),
        clearance: membership.clearance.to_token_strings(),
        delegated_action_ids: effective_grant
            .map(|grant| grant.actions().iter().map(ToString::to_string).collect())
            .unwrap_or_default(),
        delegated_resource_ids: effective_grant
            .map(|grant| grant.resources().iter().map(ToString::to_string).collect())
            .unwrap_or_default(),
        delegated_workload_ids: effective_grant
            .map(|grant| grant.workloads().iter().map(ToString::to_string).collect())
            .unwrap_or_default(),
    }
}

fn identity_error(error: &IdentityError) -> axum::response::Response {
    identity_error_response(error)
}

fn bad_request(message: &str) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}
