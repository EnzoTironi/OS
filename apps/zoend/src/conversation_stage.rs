use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use axum::Json;
use axum::Router;
use axum::extract::{Extension, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use serde::{Deserialize, Serialize};
use zoen_adapters::{CedarPolicyEvaluator, PostgresIdentityStore};
use zoen_core::{
    ConversationStage, ConversationStageId, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, EntityId, MembershipId, PolicyEvaluation, TenantId, TimestampMicros,
    trusted_context_from_membership,
};
use zoen_engine::ReadEngine;
use zoen_query::QueryRuntime;

use crate::identity_admin_auth::{
    IdentityAdminActor, authenticate_identity_admin, identity_error_response, require_machine,
};
use crate::session::SessionExchange;

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
        Err(error) => return bad_request(error.to_string()),
    };
    let stage_id = match ConversationStageId::parse(body.stage_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let mut members = Vec::with_capacity(body.membership_ids.len());
    for raw in body.membership_ids {
        match MembershipId::parse(raw) {
            Ok(id) => members.push(id),
            Err(error) => return bad_request(error.to_string()),
        }
    }
    let observed = members.len();
    let stage = ConversationStage::plant(stage_id.clone(), tenant_id.clone(), members);
    state
        .stages
        .lock()
        .expect("conversation stage lock")
        .insert((tenant_id.to_string(), stage_id.to_string()), stage);
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
    let tenant_id = match TenantId::parse(body.tenant_id.clone()) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let authorization = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    if let Err(error) = state
        .sessions
        .resolve_membership(authorization, Some(&tenant_id))
        .await
    {
        return identity_error_response(error);
    }
    let stage_id = match ConversationStageId::parse(body.stage_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let stage = {
        let guard = state.stages.lock().expect("conversation stage lock");
        match guard.get(&(tenant_id.to_string(), stage_id.to_string())) {
            Some(stage) => stage.clone(),
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({"error": "conversation stage not found"})),
                )
                    .into_response();
            }
        }
    };
    let members = match stage.who_can() {
        Ok(members) => members.to_vec(),
        Err(error) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": error.to_string()})),
            )
                .into_response();
        }
    };
    let definition_id = match DefinitionId::parse(body.definition_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let digest = match DefinitionDigest::parse(body.digest) {
        Ok(digest) => digest,
        Err(error) => return bad_request(error.to_string()),
    };
    let Some(revision) = DefinitionRevisionNumber::new(body.revision) else {
        return bad_request("definition revision must be positive".to_owned());
    };
    let entity_id = match EntityId::parse(body.entity_id) {
        Ok(id) => id,
        Err(error) => return bad_request(error.to_string()),
    };
    let definition = DefinitionReference {
        definition_id,
        digest,
        revision,
    };
    let valid_at = TimestampMicros::new(body.valid_at_micros);
    let mut permits = Vec::new();
    for membership_id in members {
        let membership = match state.identity.get_membership(&membership_id).await {
            Ok(membership) => membership,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "error": "conversation stage member set is incomplete; fail closed, no group reply"
                    })),
                )
                    .into_response();
            }
        };
        if membership.tenant_id != tenant_id {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "conversation stage member set is incomplete; fail closed, no group reply"
                })),
            )
                .into_response();
        }
        let context = match trusted_context_from_membership(&membership) {
            Ok(context) => context,
            Err(error) => return identity_error_response(error),
        };
        match state
            .read
            .authorize_entity(&context, &definition, &entity_id, valid_at)
            .await
        {
            Ok(PolicyEvaluation::Permit(_)) => permits.push(WhoCanPermit {
                membership_id: membership.id.to_string(),
                principal_id: membership.principal_id.to_string(),
            }),
            Ok(PolicyEvaluation::Deny(_)) => {}
            Ok(PolicyEvaluation::EvaluationError { message, .. }) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": message})),
                )
                    .into_response();
            }
            Err(error) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": error.to_string()})),
                )
                    .into_response();
            }
        }
    }
    (
        StatusCode::OK,
        Json(serde_json::json!({ "permits": permits })),
    )
        .into_response()
}

fn bad_request(message: String) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}
