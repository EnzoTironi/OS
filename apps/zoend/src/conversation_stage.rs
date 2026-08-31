use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use axum::{
    Json, Router,
    extract::{Extension, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post,
};
use serde::{Deserialize, Serialize};
use zoen_adapters::{CedarPolicyEvaluator, PostgresIdentityStore};
use zoen_core::{
    ConversationStage, ConversationStageId, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, EntityId, MembershipId, PolicyEvaluation, TenantId, TimestampMicros,
    trusted_context_from_membership,
};
use zoen_engine::ReadEngine;
use zoen_query::QueryRuntime;

use crate::{
    identity_admin_auth::{
        IdentityAdminActor, authenticate_identity_admin, identity_error_response, require_machine,
    },
    session::SessionExchange,
};

#[derive(Clone)]
pub struct ConversationStageState {
    pub admin_token: Option<String>,
    pub identity: PostgresIdentityStore,
    pub read: ReadEngine<QueryRuntime, Arc<CedarPolicyEvaluator>>,
    pub sessions: SessionExchange,
    pub stages: Arc<Mutex<BTreeMap<(String, String), ConversationStage>>>,
}

pub fn router(state: ConversationStageState) -> Router {
    let shared = Arc::new(state);
    Router::new()
        .route("/conversation/stages", post(plant_stage))
        .route("/conversation/who-can", post(who_can))
        .layer(middleware::from_fn_with_state(
            shared.clone(),
            require_conversation_auth,
        ))
        .with_state(shared)
}

async fn require_conversation_auth(
    State(state): State<Arc<ConversationStageState>>,
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
struct PlantStageBody {
    tenant_id: String,
    stage_id: String,
    membership_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WhoCanBody {
    tenant_id: String,
    stage_id: String,
    definition_id: String,
    digest: String,
    revision: u64,
    entity_id: String,
    valid_at_micros: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WhoCanPermit {
    membership_id: String,
    principal_id: String,
}

async fn plant_stage(
    State(state): State<Arc<ConversationStageState>>,
    Extension(actor): Extension<IdentityAdminActor>,
    Json(body): Json<PlantStageBody>,
) -> impl IntoResponse {
    if let Some(error) = require_machine(&actor) {
        return error;
    }
    let tenant_id = match TenantId::parse(body.tenant_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let stage_id = match ConversationStageId::parse(body.stage_id) {
        Ok(id) => id,
        Err(error) => return bad_request(&error.to_string()),
    };
    let mut members = Vec::with_capacity(body.membership_ids.len());
    for raw in body.membership_ids {
        match MembershipId::parse(raw) {
            Ok(id) => members.push(id),
            Err(error) => return bad_request(&error.to_string()),
        }
    }
    let observed = members.len();
    let conversation = ConversationStage::plant(stage_id.clone(), tenant_id.clone(), members);
    state
        .stages
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert((tenant_id.to_string(), stage_id.to_string()), conversation);
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "stageId": stage_id.as_str(),
            "tenantId": tenant_id.as_str(),
            "members": observed,
        })),
    )
        .into_response()
}

async fn who_can(
    State(state): State<Arc<ConversationStageState>>,
    headers: axum::http::HeaderMap,
    Json(body): Json<WhoCanBody>,
) -> impl IntoResponse {
    let query = match parse_who_can_query(body) {
        Ok(query) => query,
        Err(error) => return *error,
    };
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    if let Err(error) = state
        .sessions
        .resolve_membership(authorization, Some(&query.tenant_id))
        .await
    {
        return identity_error_response(&error);
    }
    let members = match load_stage_members(&state, &query.tenant_id, &query.stage_id) {
        Ok(members) => members,
        Err(error) => return *error,
    };
    let mut permits = Vec::new();
    for membership_id in members {
        match authorize_stage_member(&state, &query, &membership_id).await {
            Ok(Some(permit)) => permits.push(permit),
            Ok(None) => {}
            Err(error) => return error,
        }
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({ "permits": permits })),
    )
        .into_response()
}

struct WhoCanQuery {
    tenant_id: TenantId,
    stage_id: ConversationStageId,
    definition: DefinitionReference,
    entity_id: EntityId,
    valid_at: TimestampMicros,
}

fn parse_who_can_query(body: WhoCanBody) -> Result<WhoCanQuery, Box<Response>> {
    let tenant_id = TenantId::parse(body.tenant_id)
        .map_err(|error| Box::new(bad_request(&error.to_string())))?;
    let stage_id = ConversationStageId::parse(body.stage_id)
        .map_err(|error| Box::new(bad_request(&error.to_string())))?;
    let definition_id = DefinitionId::parse(body.definition_id)
        .map_err(|error| Box::new(bad_request(&error.to_string())))?;
    let digest = DefinitionDigest::parse(body.digest)
        .map_err(|error| Box::new(bad_request(&error.to_string())))?;
    let Some(revision) = DefinitionRevisionNumber::new(body.revision) else {
        return Err(Box::new(bad_request(
            "definition revision must be positive",
        )));
    };
    let entity_id = EntityId::parse(body.entity_id)
        .map_err(|error| Box::new(bad_request(&error.to_string())))?;
    Ok(WhoCanQuery {
        tenant_id,
        stage_id,
        definition: DefinitionReference {
            definition_id,
            digest,
            revision,
        },
        entity_id,
        valid_at: TimestampMicros::new(body.valid_at_micros),
    })
}

fn load_stage_members(
    state: &ConversationStageState,
    tenant_id: &TenantId,
    stage_id: &ConversationStageId,
) -> Result<Vec<MembershipId>, Box<Response>> {
    let guard = state
        .stages
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let conversation = guard
        .get(&(tenant_id.to_string(), stage_id.to_string()))
        .cloned()
        .ok_or_else(|| {
            Box::new(
                (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "conversation stage not found"})),
                )
                    .into_response(),
            )
        })?;
    conversation
        .who_can()
        .map(<[MembershipId]>::to_vec)
        .map_err(|error| {
            Box::new(
                (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": error.to_string()})),
                )
                    .into_response(),
            )
        })
}

async fn authorize_stage_member(
    state: &ConversationStageState,
    query: &WhoCanQuery,
    membership_id: &MembershipId,
) -> Result<Option<WhoCanPermit>, Response> {
    let membership = state
        .identity
        .get_membership(membership_id)
        .await
        .map_err(|_| incomplete_stage())?;
    if membership.tenant_id != query.tenant_id {
        return Err(incomplete_stage());
    }
    let context = trusted_context_from_membership(&membership)
        .map_err(|error| identity_error_response(&error))?;
    match state
        .read
        .authorize_entity(
            &context,
            &query.definition,
            &query.entity_id,
            query.valid_at,
        )
        .await
    {
        Ok(PolicyEvaluation::Permit(_)) => Ok(Some(WhoCanPermit {
            membership_id: membership.id.to_string(),
            principal_id: membership.principal_id.to_string(),
        })),
        Ok(PolicyEvaluation::Deny(_)) => Ok(None),
        Ok(PolicyEvaluation::EvaluationError { message, .. }) => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": message})),
        )
            .into_response()),
        Err(error) => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": error.to_string()})),
        )
            .into_response()),
    }
}

fn incomplete_stage() -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "error": "conversation stage member set is incomplete; fail closed, no group reply"
        })),
    )
        .into_response()
}

fn bad_request(message: &str) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}
