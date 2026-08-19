use std::collections::HashMap;
use std::env;
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone)]
struct ConnectorState {
    client: Client,
    credentials: Arc<HashMap<String, String>>,
    provider: Url,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConnectorRequest {
    credential_ref: String,
    effect_request_id: String,
    external_operation_id: String,
    payload_base64: String,
    request_digest: String,
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
        reason: &'static str,
        #[serde(rename = "responseDigest", skip_serializing_if = "Option::is_none")]
        response_digest: Option<String>,
    },
    AcceptedPending {
        #[serde(rename = "externalOperationId")]
        external_operation_id: String,
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    Confirmed {
        #[serde(rename = "externalOperationId")]
        external_operation_id: String,
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    ConfirmedNoEffect {
        #[serde(rename = "externalOperationId")]
        external_operation_id: String,
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderRequest<'a> {
    effect_request_id: &'a str,
    external_operation_id: &'a str,
    payload_base64: &'a str,
    request_digest: &'a str,
    tenant_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProviderResponse {
    external_operation_id: String,
    outcome: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let listen_address = env::var("ZOEN_CONNECTOR_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8081".to_owned())
        .parse::<SocketAddr>()?;
    let provider = env::var("ZOEN_CONNECTOR_PROVIDER_URL")?.parse::<Url>()?;
    let credentials =
        serde_json::from_str::<HashMap<String, String>>(&env::var("ZOEN_CONNECTOR_CREDENTIALS")?)?;
    let timeout = Duration::from_millis(
        env::var("ZOEN_CONNECTOR_PROVIDER_TIMEOUT_MS")
            .unwrap_or_else(|_| "5000".to_owned())
            .parse::<u64>()?,
    );
    let state = ConnectorState {
        client: Client::builder().timeout(timeout).build()?,
        credentials: Arc::new(credentials),
        provider,
    };
    let application = Router::new()
        .route("/health", get(|| async { StatusCode::NO_CONTENT }))
        .route("/v1/effects", post(execute))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(listen_address).await?;
    axum::serve(listener, application)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn execute(
    State(state): State<ConnectorState>,
    Json(request): Json<ConnectorRequest>,
) -> Result<Json<ConnectorResponse>, (StatusCode, String)> {
    let payload = STANDARD
        .decode(request.payload_base64.as_bytes())
        .map_err(|error| (StatusCode::BAD_REQUEST, error.to_string()))?;
    if sha256(&payload) != request.request_digest {
        return Err((
            StatusCode::BAD_REQUEST,
            "request digest does not match the payload".to_owned(),
        ));
    }
    let Some(credential) = state.credentials.get(&request.credential_ref) else {
        return Ok(Json(ConnectorResponse::DefinitelyNotSent {
            observed_at_micros: observed_at_micros(),
            reason: "credential_revoked",
        }));
    };
    let response = state
        .client
        .post(state.provider.clone())
        .bearer_auth(credential)
        .header(
            "idempotency-key",
            format!(
                "{}:{}",
                request.tenant_id, request.effect_request_id
            ),
        )
        .json(&ProviderRequest {
            effect_request_id: &request.effect_request_id,
            external_operation_id: &request.external_operation_id,
            payload_base64: &request.payload_base64,
            request_digest: &request.request_digest,
            tenant_id: &request.tenant_id,
        })
        .send()
        .await;
    let response = match response {
        Ok(response) => response,
        Err(error) if error.is_connect() => {
            return Ok(Json(ConnectorResponse::DefinitelyNotSent {
                observed_at_micros: observed_at_micros(),
                reason: "timeout_before_send",
            }));
        }
        Err(error) if error.is_timeout() => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                reason: "timeout_after_possible_delivery",
                response_digest: None,
            }));
        }
        Err(_) => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                reason: "provider_unavailable",
                response_digest: None,
            }));
        }
    };
    let status = response.status();
    let body = response.bytes().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            format!("provider response body could not be read: {error}"),
        )
    })?;
    let response_digest = sha256(&body);
    if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
        return Ok(Json(ConnectorResponse::DefinitelyNotSent {
            observed_at_micros: observed_at_micros(),
            reason: "credential_revoked",
        }));
    }
    if !matches!(status, StatusCode::OK | StatusCode::ACCEPTED) {
        return Ok(Json(ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            reason: "provider_unavailable",
            response_digest: Some(response_digest),
        }));
    }
    let value = match serde_json::from_slice::<serde_json::Value>(&body) {
        Ok(value) => value,
        Err(_) => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                reason: "response_parse_error",
                response_digest: Some(response_digest),
            }));
        }
    };
    let provider = match serde_json::from_value::<ProviderResponse>(value) {
        Ok(provider) => provider,
        Err(_) => {
            return Ok(Json(ConnectorResponse::Unknown {
                observed_at_micros: observed_at_micros(),
                reason: "response_schema_error",
                response_digest: Some(response_digest),
            }));
        }
    };
    if provider.external_operation_id != request.external_operation_id {
        return Ok(Json(ConnectorResponse::Unknown {
            observed_at_micros: observed_at_micros(),
            reason: "response_schema_error",
            response_digest: Some(response_digest),
        }));
    }
    let observed_at_micros = observed_at_micros();
    match (status, provider.outcome.as_str()) {
        (StatusCode::ACCEPTED, "accepted_pending") => {
            Ok(Json(ConnectorResponse::AcceptedPending {
                external_operation_id: provider.external_operation_id,
                observed_at_micros,
                response_digest,
            }))
        }
        (StatusCode::OK, "confirmed") => Ok(Json(ConnectorResponse::Confirmed {
            external_operation_id: provider.external_operation_id,
            observed_at_micros,
            response_digest,
        })),
        (StatusCode::OK, "confirmed_no_effect") => {
            Ok(Json(ConnectorResponse::ConfirmedNoEffect {
                external_operation_id: provider.external_operation_id,
                observed_at_micros,
                response_digest,
            }))
        }
        _ => Ok(Json(ConnectorResponse::Unknown {
            observed_at_micros,
            reason: "response_schema_error",
            response_digest: Some(response_digest),
        })),
    }
}

fn sha256(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
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
    let _ = tokio::signal::ctrl_c().await;
}
