use std::{error::Error, time::Duration};

use axum::{
    Router,
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderName, StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use reqwest::Client;

const BODY_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Clone)]
struct EveProxy {
    client: Client,
    origin: String,
}

pub fn router() -> Result<Router, Box<dyn Error + Send + Sync>> {
    Ok(Router::new()
        .route("/eve/v1", any(proxy_eve))
        .route("/eve/v1/{*path}", any(proxy_eve))
        .route("/.well-known/workflow", any(proxy_eve))
        .route("/.well-known/workflow/{*path}", any(proxy_eve))
        .with_state(EveProxy {
            client: Client::new(),
            origin: zoend::config::eve_base_url()?,
        }))
}

async fn proxy_eve(State(eve): State<EveProxy>, request: Request) -> Response {
    let path_and_query = request
        .uri()
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str);
    let url = format!("{}{path_and_query}", eve.origin);
    let Ok(method) = reqwest::Method::from_bytes(request.method().as_str().as_bytes()) else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let headers = request.headers().clone();
    let Ok(body) = axum::body::to_bytes(request.into_body(), BODY_LIMIT).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    forward(&eve.client, method, url, headers, body).await
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
        Err(_) => (StatusCode::BAD_GATEWAY, "eve_unreachable\n").into_response(),
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
