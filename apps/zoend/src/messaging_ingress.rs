use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
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
        .route("/channels/whatsapp/advertise", get(whatsapp_advertise))
        .route("/channels/whatsapp/inbound", post(whatsapp_inbound))
        .route("/channels/telegram/advertise", get(telegram_advertise))
        .route("/channels/telegram/inbound", post(telegram_inbound))
        .with_state(Arc::new(state))
}

async fn whatsapp_advertise(State(state): State<Arc<IngressState>>) -> Response {
    proxy(
        &state,
        reqwest::Method::GET,
        "/advertise",
        None,
        None,
        "whatsapp_not_advertised",
    )
    .await
}

async fn whatsapp_inbound(State(state): State<Arc<IngressState>>, body: Bytes) -> Response {
    proxy(
        &state,
        reqwest::Method::POST,
        "/inbound",
        Some(body),
        None,
        "whatsapp_not_advertised",
    )
    .await
}

async fn telegram_advertise(State(state): State<Arc<IngressState>>) -> Response {
    proxy(
        &state,
        reqwest::Method::GET,
        "/advertise",
        None,
        None,
        "telegram_not_advertised",
    )
    .await
}

async fn telegram_inbound(
    State(state): State<Arc<IngressState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let secret = headers
        .get("x-telegram-bot-api-secret-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    proxy(
        &state,
        reqwest::Method::POST,
        "/inbound",
        Some(body),
        secret.as_deref(),
        "telegram_not_advertised",
    )
    .await
}

async fn proxy(
    state: &IngressState,
    method: reqwest::Method,
    path: &str,
    body: Option<Bytes>,
    secret_token: Option<&str>,
    missing_error: &'static str,
) -> Response {
    let Some(base) = state.gateway_url.as_deref() else {
        return unavailable(missing_error, "messaging_gateway_url_missing");
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
    if let Some(secret) = secret_token {
        request = request.header("x-telegram-bot-api-secret-token", secret);
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
        Err(_) => unavailable(missing_error, "messaging_gateway_unreachable"),
    }
}

fn unavailable(error: &'static str, reason: &'static str) -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({
            "error": error,
            "reason": reason
        })),
    )
        .into_response()
}
