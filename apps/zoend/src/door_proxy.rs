use std::time::Duration;

use axum::Router;
use axum::body::{Body, Bytes};
use axum::extract::{Request, State};
use axum::http::{HeaderName, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use reqwest::Client;

const DOOR: &str = "http://127.0.0.1:58704";
const BODY_LIMIT: usize = 8 * 1024 * 1024;

pub fn router() -> Router {
    Router::new()
        .route("/api/auth", any(proxy_door))
        .route("/api/auth/{*path}", any(proxy_door))
        .route("/.well-known/openid-configuration", any(proxy_door))
        .route("/device", any(proxy_door))
        .route("/onboard/done", any(proxy_door))
        .with_state(Client::new())
}

async fn proxy_door(State(client): State<Client>, request: Request) -> Response {
    let path_and_query = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let url = format!("{DOOR}{path_and_query}");
    let method = match reqwest::Method::from_bytes(request.method().as_str().as_bytes()) {
        Ok(method) => method,
        Err(_) => return StatusCode::BAD_GATEWAY.into_response(),
    };
    let headers = request.headers().clone();
    let body = match axum::body::to_bytes(request.into_body(), BODY_LIMIT).await {
        Ok(body) => body,
        Err(_) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
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
    for (name, value) in headers.iter() {
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
            for (name, value) in response_headers.iter() {
                if hop_by_hop(name) {
                    continue;
                }
                builder = builder.header(name, value);
            }
            builder
                .body(Body::from(bytes))
                .unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
        }
        Err(_) => (StatusCode::BAD_GATEWAY, "auth_door_unreachable\n").into_response(),
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
