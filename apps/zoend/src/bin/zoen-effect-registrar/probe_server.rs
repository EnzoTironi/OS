//! Probe server exposing registrar liveness and registration status.
//!
//! `GET /health` answers 204 once exact registration verifies, else 503.
//! `GET /status` serves the current registration document.

use std::sync::{Arc, Mutex};

use axum::{Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};

use super::registration::RegistrationState;

/// Shared registration state.
pub type SharedState = Arc<Mutex<RegistrationState>>;

/// Build the probe router.
pub fn router(state: SharedState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .with_state(state)
}

async fn health(State(state): State<SharedState>) -> impl IntoResponse {
    let ready = state.lock().is_ok_and(|guard| guard.ready);
    if ready {
        (StatusCode::NO_CONTENT, String::new())
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, String::new())
    }
}

async fn status(State(state): State<SharedState>) -> impl IntoResponse {
    let document = state.lock().map(|guard| {
        let mut object = serde_json::Map::new();
        object.insert(
            "artifact".to_owned(),
            serde_json::Value::from(guard.artifact.clone()),
        );
        if let Some(deployment_id) = guard.deployment_id.clone() {
            object.insert(
                "deploymentId".to_owned(),
                serde_json::Value::from(deployment_id),
            );
        }
        object.insert("ready".to_owned(), serde_json::Value::from(guard.ready));
        object.insert(
            "reason".to_owned(),
            serde_json::Value::from(guard.reason.clone()),
        );
        object.insert(
            "updatedAt".to_owned(),
            serde_json::Value::from(guard.updated_at.clone()),
        );
        serde_json::Value::Object(object)
    });
    match document {
        Ok(document) => (StatusCode::OK, axum::Json(document)).into_response(),
        Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            "registration state is unavailable".to_owned(),
        )
            .into_response(),
    }
}
