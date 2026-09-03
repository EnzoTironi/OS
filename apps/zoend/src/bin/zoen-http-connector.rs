use std::{
    collections::HashMap,
    env,
    error::Error,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::{Request, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use reqwest::{Client, Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

type HttpError = (StatusCode, String);

#[derive(Clone)]
struct ConnectorState {
    caller_token: Arc<String>,
    client: Client,
    credentials: Arc<HashMap<String, CredentialBinding>>,
    provider: Url,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CredentialBinding {
    secret: String,
    tenant_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConnectorRequest {
    credential_ref: String,
    effect_request_id: String,
    idempotency_key: String,
    payload_base64: String,
    request_digest: String,
    tenant_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatusRequest {
    credential_ref: String,
    idempotency_key: String,
    tenant_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadinessRequest {
    credential_ref: String,
    tenant_id: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ConnectorResponse {
    DefinitelyNotSent {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        reason: &'static str,
    },
    Unknown {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(
            rename = "providerOperationId",
            skip_serializing_if = "Option::is_none"
        )]
        provider_operation_id: Option<String>,
        reason: &'static str,
        #[serde(rename = "responseDigest", skip_serializing_if = "Option::is_none")]
        response_digest: Option<String>,
    },
    AcceptedPending {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    Confirmed {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    ConfirmedNoEffect {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderRequest<'a> {
    effect_request_id: &'a str,
    idempotency_key: &'a str,
    payload_base64: &'a str,
    request_digest: &'a str,
    tenant_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderResponse {
    outcome: String,
    provider_operation_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderStatusResponse {
    evidence_digest: String,
    idempotency_key: String,
    observed_at_micros: String,
    outcome: String,
    provider_operation_id: String,
    source_ref: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let listen_address = env::var("ZOEN_CONNECTOR_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8081".to_owned())
        .parse::<SocketAddr>()?;
    let provider = env::var("ZOEN_CONNECTOR_PROVIDER_URL")?.parse::<Url>()?;
    require_secure_provider_url(&provider)?;
    let credentials = serde_json::from_str::<HashMap<String, CredentialBinding>>(&env::var(
        "ZOEN_CONNECTOR_CREDENTIALS",
    )?)?;
    let caller_token = env::var("ZOEN_CONNECTOR_CALLER_TOKEN")?;
    if caller_token.is_empty() {
        return Err("ZOEN_CONNECTOR_CALLER_TOKEN must be nonempty".into());
    }
    let timeout = Duration::from_millis(
        env::var("ZOEN_CONNECTOR_PROVIDER_TIMEOUT_MS")
            .unwrap_or_else(|_| "5000".to_owned())
            .parse::<u64>()?,
    );
    let state = ConnectorState {
        caller_token: Arc::new(caller_token),
        client: Client::builder()
            .redirect(Policy::none())
            .timeout(timeout)
            .build()?,
        credentials: Arc::new(credentials),
        provider,
    };
    let protected = Router::new()
        .route("/v1/effects", post(execute))
        .route("/v1/effects/probe", post(probe_readiness))
        .route("/v1/effects/status", post(query_status))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            authenticate_request,
        ));
    let application = Router::new()
        .route("/health", get(|| async { StatusCode::NO_CONTENT }))
        .merge(protected)
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(listen_address).await?;
    axum::serve(listener, application)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn probe_readiness(
    State(state): State<ConnectorState>,
    Json(request): Json<ReadinessRequest>,
) -> Result<StatusCode, HttpError> {
    let binding = state
        .credentials
        .get(&request.credential_ref)
        .ok_or_else(|| {
            (
                StatusCode::FAILED_DEPENDENCY,
                "credential reference is unavailable".to_owned(),
            )
        })?;
    require_tenant(binding, &request.tenant_id)?;
    Ok(StatusCode::NO_CONTENT)
}

fn require_secure_provider_url(provider: &Url) -> Result<(), Box<dyn Error + Send + Sync>> {
    if !provider.username().is_empty() || provider.password().is_some() {
        return Err("ZOEN_CONNECTOR_PROVIDER_URL must not contain user information".into());
    }
    let host = provider
        .host_str()
        .ok_or("ZOEN_CONNECTOR_PROVIDER_URL must contain a host")?;
    if provider.scheme() == "https" || (provider.scheme() == "http" && is_loopback_host(host)) {
        return Ok(());
    }
    Err("ZOEN_CONNECTOR_PROVIDER_URL must use HTTPS outside loopback".into())
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .trim_start_matches('[')
            .trim_end_matches(']')
            .parse::<IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

async fn execute(
    State(state): State<ConnectorState>,
    Json(request): Json<ConnectorRequest>,
) -> Result<Json<ConnectorResponse>, HttpError> {
    let payload = STANDARD
        .decode(request.payload_base64.as_bytes())
        .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string()))?;
    if sha256(&payload) != request.request_digest {
        return Err((
            StatusCode::BAD_REQUEST,
            "request digest does not match the payload".to_owned(),
        ));
    }
    let Some(binding) = state.credentials.get(&request.credential_ref) else {
        return Ok(Json(ConnectorResponse::DefinitelyNotSent {
            observed_at_micros: observed_at_micros(),
            reason: "credential_revoked",
        }));
    };
    require_tenant(binding, &request.tenant_id)?;
    let response = state
        .client
        .post(state.provider.clone())
        .bearer_auth(&binding.secret)
        .header("idempotency-key", &request.idempotency_key)
        .json(&ProviderRequest {
            effect_request_id: &request.effect_request_id,
            idempotency_key: &request.idempotency_key,
            payload_base64: &request.payload_base64,
            request_digest: &request.request_digest,
            tenant_id: &request.tenant_id,
        })
        .send()
        .await;
    match response {
        Ok(response) => provider_outcome(response).await,
        Err(error) => Ok(Json(provider_send_error(&error))),
    }
}

fn provider_send_error(error: &reqwest::Error) -> ConnectorResponse {
    if error.is_connect() {
        ConnectorResponse::DefinitelyNotSent {
            observed_at_micros: observed_at_micros(),
            reason: "timeout_before_send",
        }
    } else if error.is_timeout() {
        ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            provider_operation_id: None,
            reason: "timeout_after_possible_delivery",
            response_digest: None,
        }
    } else {
        ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            provider_operation_id: None,
            reason: "provider_unavailable",
            response_digest: None,
        }
    }
}

async fn provider_outcome(
    response: reqwest::Response,
) -> Result<Json<ConnectorResponse>, HttpError> {
    let status = response.status();
    let Ok(body) = response.bytes().await else {
        return Ok(Json(ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            provider_operation_id: None,
            reason: "response_body_read_error",
            response_digest: None,
        }));
    };
    let response_digest = sha256(&body);
    if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN)
        || !matches!(status, StatusCode::OK | StatusCode::ACCEPTED)
    {
        return Ok(Json(ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            provider_operation_id: None,
            reason: "provider_unavailable",
            response_digest: Some(response_digest),
        }));
    }
    let provider = match serde_json::from_slice::<ProviderResponse>(&body) {
        Ok(provider) => provider,
        Err(_) if serde_json::from_slice::<serde_json::Value>(&body).is_err() => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                provider_operation_id: None,
                reason: "response_parse_error",
                response_digest: Some(response_digest),
            }));
        }
        Err(_) => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                provider_operation_id: None,
                reason: "response_schema_error",
                response_digest: Some(response_digest),
            }));
        }
    };
    let observed_at_micros = observed_at_micros();
    Ok(Json(match (status, provider.outcome.as_str()) {
        (StatusCode::ACCEPTED, "accepted_pending") => ConnectorResponse::AcceptedPending {
            observed_at_micros,
            provider_operation_id: provider.provider_operation_id,
            response_digest,
        },
        (StatusCode::OK, "confirmed") => ConnectorResponse::Confirmed {
            observed_at_micros,
            provider_operation_id: provider.provider_operation_id,
            response_digest,
        },
        (StatusCode::OK, "confirmed_no_effect") => ConnectorResponse::ConfirmedNoEffect {
            observed_at_micros,
            provider_operation_id: provider.provider_operation_id,
            response_digest,
        },
        _ => ConnectorResponse::Unknown {
            observed_at_micros,
            provider_operation_id: Some(provider.provider_operation_id),
            reason: "response_schema_error",
            response_digest: Some(response_digest),
        },
    }))
}

async fn query_status(
    State(state): State<ConnectorState>,
    Json(request): Json<StatusRequest>,
) -> Result<Json<ProviderStatusResponse>, HttpError> {
    let binding = state
        .credentials
        .get(&request.credential_ref)
        .ok_or_else(|| {
            (
                StatusCode::FAILED_DEPENDENCY,
                "credential reference is unavailable".to_owned(),
            )
        })?;
    require_tenant(binding, &request.tenant_id)?;
    let mut url = state.provider.clone();
    url.path_segments_mut()
        .map_err(|()| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "provider URL cannot hold path segments".to_owned(),
            )
        })?
        .extend(["by-idempotency", request.idempotency_key.as_str()]);
    let response = state
        .client
        .get(url)
        .bearer_auth(&binding.secret)
        .send()
        .await
        .map_err(|error| (StatusCode::BAD_GATEWAY, error.to_string()))?;
    if response.status() == StatusCode::NOT_FOUND {
        return Err((
            StatusCode::NOT_FOUND,
            "provider operation not found".to_owned(),
        ));
    }
    let response = response
        .error_for_status()
        .map_err(|error| (StatusCode::BAD_GATEWAY, error.to_string()))?;
    let status = response
        .json::<ProviderStatusResponse>()
        .await
        .map_err(|error| (StatusCode::BAD_GATEWAY, error.to_string()))?;
    if status.idempotency_key != request.idempotency_key {
        return Err((
            StatusCode::BAD_GATEWAY,
            "provider status returned a different idempotency key".to_owned(),
        ));
    }
    Ok(Json(status))
}

async fn authenticate_request(
    State(state): State<ConnectorState>,
    request: Request,
    next: Next,
) -> Result<Response, HttpError> {
    authenticate(&state, request.headers())?;
    Ok(next.run(request).await)
}

fn authenticate(state: &ConnectorState, headers: &HeaderMap) -> Result<(), HttpError> {
    let provided = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let expected = format!("Bearer {}", state.caller_token);
    if Sha256::digest(provided.as_bytes()) == Sha256::digest(expected.as_bytes()) {
        Ok(())
    } else {
        Err((
            StatusCode::UNAUTHORIZED,
            "invalid connector caller credentials".to_owned(),
        ))
    }
}

fn require_tenant(binding: &CredentialBinding, tenant_id: &str) -> Result<(), HttpError> {
    if binding.tenant_id == tenant_id {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            "credential reference is not bound to the requested tenant".to_owned(),
        ))
    }
}

fn sha256(value: &[u8]) -> String {
    zoen_core::encode_hex(Sha256::digest(value).as_slice())
}

fn observed_at_micros() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_micros()).ok())
        .unwrap_or(i64::MAX)
        .to_string()
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
}
