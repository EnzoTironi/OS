use std::time::Duration;

use axum::{
    Router,
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderName, StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use reqwest::Client;

const WORKSHOP: &str = "http://127.0.0.1:58707";

/// Production keeps the workshop on the same host behind this proxy. E2E
/// runs it on a per-scenario port, so the upstream is overridable.
fn workshop_upstream() -> String {
    std::env::var("ZOEN_WORKSHOP_UPSTREAM").unwrap_or_else(|_| WORKSHOP.to_string())
}
const BODY_LIMIT: usize = 8 * 1024 * 1024;

pub fn router() -> Router {
    Router::new()
        .route("/apps", any(proxy_apps))
        .route("/apps/{*path}", any(proxy_apps))
        .route("/zoen", any(proxy_apps))
        .route("/zoen/{*path}", any(proxy_apps))
        .with_state(Client::new())
}

async fn proxy_apps(State(client): State<Client>, request: Request) -> Response {
    let path_and_query = request
        .uri()
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str);
    let url = format!("{}{path_and_query}", workshop_upstream());
    let Ok(method) = reqwest::Method::from_bytes(request.method().as_str().as_bytes()) else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let headers = request.headers().clone();
    let Ok(body) = axum::body::to_bytes(request.into_body(), BODY_LIMIT).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    forward(&client, method, url, headers, body).await
}

async fn forward(
    client: &Client,
    method: reqwest::Method,
    url: String,
    headers: axum::http::HeaderMap,
    body: Bytes,
) -> Response {
    let mut upstream = client.request(method, url).timeout(Duration::from_secs(15));
    for (name, value) in &headers {
        if hop_by_hop(name) {
            continue;
        }
        upstream = upstream.header(name, value);
    }
    match upstream.body(body).send().await {
        Ok(response) => {
            let status =
                StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let response_headers = response.headers().clone();
            let bytes = response.bytes().await.unwrap_or_default();
            let mut builder = Response::builder().status(status);
            for (name, value) in &response_headers {
                if hop_by_hop(name) {
                    continue;
                }
                builder = builder.header(name, value);
            }
            builder
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Err(_) => (StatusCode::BAD_GATEWAY, "workshop_unreachable\n").into_response(),
    }
}

fn hop_by_hop(name: &HeaderName) -> bool {
    name == header::CONNECTION
        || name == header::HOST
        || name == header::PROXY_AUTHENTICATE
        || name == header::PROXY_AUTHORIZATION
        || name == header::TE
        || name == header::TRAILER
        || name == header::TRANSFER_ENCODING
        || name == header::UPGRADE
        || name == header::CONTENT_LENGTH
        || name.as_str().eq_ignore_ascii_case("keep-alive")
}
