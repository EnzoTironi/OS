use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Json;
use axum::Router;
use reqwest::Client;
use serde_json::json;

#[derive(Clone)]
pub struct IngressState {
    pub gateway_url: Option<String>,
    pub client: Client,
}

pub fn from_env() -> IngressState {
    let gateway_url = std::env::var("ZOEN_MESSAGING_GATEWAY_URL")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty());
    IngressState {
        client: Client::new(),
        gateway_url,
    }
}

pub fn router(state: IngressState) -> Router {
    Router::new()
        .route("/channels/whatsapp/advertise", get(advertise))
        .route("/channels/whatsapp/inbound", post(inbound))
        .with_state(Arc::new(state))
}

async fn advertise(State(state): State<Arc<IngressState>>) -> Response {
    proxy(&state, reqwest::Method::GET, "/advertise", None).await
}

async fn inbound(State(state): State<Arc<IngressState>>, body: Bytes) -> Response {
    proxy(&state, reqwest::Method::POST, "/inbound", Some(body)).await
}

async fn proxy(
    state: &IngressState,
    method: reqwest::Method,
    path: &str,
    body: Option<Bytes>,
) -> Response {
    let Some(base) = state.gateway_url.as_deref() else {
        return unavailable("messaging_gateway_url_missing");
    };
    let url = format!("{base}{path}");
    let mut request = state
        .client
        .request(method, url)
        .timeout(Duration::from_secs(15));
    if let Some(payload) = body {
        request = request
            .header("content-type", "application/json")
            .body(payload);
    }
    match request.send().await {
        Ok(upstream) => {
            let status =
                StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let bytes = upstream.bytes().await.unwrap_or_default();
            Response::builder()
                .status(status)
                .header("content-type", "application/json")
                .body(axum::body::Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Err(_) => unavailable("messaging_gateway_unreachable"),
    }
}

fn unavailable(reason: &'static str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "error": "whatsapp_not_advertised",
            "reason": reason
        })),
    )
        .into_response()
}
