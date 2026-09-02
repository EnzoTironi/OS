use std::{env, error::Error, io, net::IpAddr, time::Duration};

use axum::{
    Router,
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::any,
};
use reqwest::{Client, Url};

const BODY_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Clone)]
struct DoorState {
    client: Client,
    origin: String,
}

pub fn origin_from_env() -> Result<String, Box<dyn Error + Send + Sync>> {
    let raw = env::var("ZOEN_AUTH_BASE_URL").map_err(|error| match error {
        env::VarError::NotPresent => invalid_origin("ZOEN_AUTH_BASE_URL is required"),
        not_unicode @ env::VarError::NotUnicode(_) => {
            Box::new(not_unicode) as Box<dyn Error + Send + Sync>
        }
    })?;
    let trimmed = raw.trim();
    let url = Url::parse(trimmed)
        .map_err(|error| invalid_origin(format!("ZOEN_AUTH_BASE_URL is invalid: {error}")))?;
    let valid = url.scheme() == "http"
        && url.host_str().is_some_and(host_is_loopback)
        && url.port().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none();
    if !valid {
        return Err(invalid_origin(
            "ZOEN_AUTH_BASE_URL must be an explicit loopback HTTP origin",
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

pub fn router(origin: String) -> Router {
    Router::new()
        .route("/", any(proxy_door))
        .route("/login", any(proxy_door))
        .route("/api/auth", any(proxy_door))
        .route("/api/auth/{*path}", any(proxy_door))
        .route("/device", any(proxy_door))
        .route("/onboard/done", any(proxy_door))
        .with_state(DoorState {
            client: door_client(),
            origin,
        })
}

fn door_client() -> Client {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("TLS backend cannot be initialized")
}

async fn proxy_door(State(state): State<DoorState>, request: Request) -> Response {
    let path_and_query = request
        .uri()
        .path_and_query()
        .map_or("/", axum::http::uri::PathAndQuery::as_str);
    let url = format!("{}{path_and_query}", state.origin);
    let Ok(method) = reqwest::Method::from_bytes(request.method().as_str().as_bytes()) else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let headers = request.headers().clone();
    let Ok(body) = axum::body::to_bytes(request.into_body(), BODY_LIMIT).await else {
        return StatusCode::PAYLOAD_TOO_LARGE.into_response();
    };
    forward(&state.client, &state.origin, method, url, headers, body).await
}

async fn forward(
    client: &Client,
    door_origin: &str,
    method: reqwest::Method,
    url: String,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let origin = inbound_origin(&headers);
    let mut upstream = client.request(method, url).timeout(Duration::from_secs(15));
    for (name, value) in &headers {
        if hop_by_hop(name) {
            continue;
        }
        if name == header::ORIGIN
            && let Some(rewritten) = rewrite_loopback_origin(value, door_origin)
        {
            upstream = upstream.header(name, rewritten);
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
                if name == header::LOCATION
                    && let Some(rewritten) = origin
                        .as_deref()
                        .and_then(|origin| rewrite_loopback_location(value, origin))
                {
                    builder = builder.header(name, rewritten);
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

fn rewrite_loopback_origin(origin: &HeaderValue, door_origin: &str) -> Option<HeaderValue> {
    let raw = origin.to_str().ok()?;
    let url = reqwest::Url::parse(raw).ok()?;
    let host = url.host_str()?;
    if !host_is_loopback(host) || raw == door_origin {
        return None;
    }
    HeaderValue::from_str(door_origin).ok()
}

fn inbound_origin(headers: &HeaderMap) -> Option<String> {
    let host = header_csv_first(headers, "x-forwarded-host")
        .or_else(|| header_csv_first(headers, header::HOST.as_str()))?;
    let proto = header_csv_first(headers, "x-forwarded-proto").unwrap_or_else(|| "http".to_owned());
    Some(format!("{proto}://{host}"))
}

fn header_csv_first(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(name)?.to_str().ok()?;
    let first = raw.split(',').next()?.trim();
    if first.is_empty() {
        None
    } else {
        Some(first.to_owned())
    }
}

fn rewrite_loopback_location(location: &HeaderValue, origin: &str) -> Option<HeaderValue> {
    let raw = location.to_str().ok()?;
    let url = reqwest::Url::parse(raw).ok()?;
    let host = url.host_str()?;
    if !host_is_loopback(host) {
        return None;
    }
    let mut next = reqwest::Url::parse(origin).ok()?;
    next.set_path(url.path());
    next.set_query(url.query());
    HeaderValue::from_str(next.as_str()).ok()
}

fn host_is_loopback(host: &str) -> bool {
    let host = host.trim_matches(|c| c == '[' || c == ']');
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
}

fn invalid_origin(message: impl Into<String>) -> Box<dyn Error + Send + Sync> {
    io::Error::new(io::ErrorKind::InvalidInput, message.into()).into()
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
