//! Durable HTTP connector invocation with fail-closed outcome mapping.
//!
//! Pre-send transport failures map to `definitely_not_sent`; every other
//! failure mode maps to `unknown`, exactly like the behavioral reference.
//! Retryable provider statuses surface as retryable step errors.

use std::{error::Error, fmt, time::Duration};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::config::ConnectorConfig;

/// Validated connector outcome (wire-compatible with the provider contract).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConnectorOutcome {
    /// The request provably never reached the provider.
    DefinitelyNotSent {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        reason: DefinitelyNotSentReason,
    },
    /// Delivery is uncertain; the reconciler owns the truth.
    Unknown {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(
            rename = "providerOperationId",
            skip_serializing_if = "Option::is_none"
        )]
        provider_operation_id: Option<String>,
        reason: UnknownReason,
        #[serde(rename = "responseDigest", skip_serializing_if = "Option::is_none")]
        response_digest: Option<String>,
    },
    /// Accepted by the provider; completion arrives via reconciliation.
    AcceptedPending {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    /// Provider confirmed the effect.
    Confirmed {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
    /// Provider confirmed the request had no effect.
    ConfirmedNoEffect {
        #[serde(rename = "observedAtMicros")]
        observed_at_micros: String,
        #[serde(rename = "providerOperationId")]
        provider_operation_id: String,
        #[serde(rename = "responseDigest")]
        response_digest: String,
    },
}

/// Pre-send failure reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DefinitelyNotSentReason {
    /// Provider credential was revoked before sending.
    CredentialRevoked,
    /// The request timed out before bytes left the worker.
    TimeoutBeforeSend,
}

/// Uncertain-delivery failure reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnknownReason {
    /// Provider endpoint was unreachable after a possible send.
    ProviderUnavailable,
    /// Response body could not be read.
    ResponseBodyReadError,
    /// Response body was not JSON.
    ResponseParseError,
    /// Response JSON violated the outcome schema.
    ResponseSchemaError,
    /// The request timed out after possible delivery.
    TimeoutAfterPossibleDelivery,
}

impl ConnectorOutcome {
    /// Outcome discriminator for the handler response.
    #[must_use]
    pub fn kind(&self) -> &'static str {
        match self {
            Self::DefinitelyNotSent { .. } => "definitely_not_sent",
            Self::Unknown { .. } => "unknown",
            Self::AcceptedPending { .. } => "accepted_pending",
            Self::Confirmed { .. } => "confirmed",
            Self::ConfirmedNoEffect { .. } => "confirmed_no_effect",
        }
    }
}

/// Claimed attempt dispatched to the connector.
#[derive(Clone, Debug)]
pub struct DispatchRequest {
    /// Effect request id.
    pub effect_request_id: String,
    /// Provider idempotency key.
    pub idempotency_key: String,
    /// Base64 request payload.
    pub payload_base64: String,
    /// Hex SHA-256 over the raw payload.
    pub request_digest: String,
}

/// Connector invocation failure: terminal rejections vs retried errors.
#[derive(Debug)]
pub enum ConnectorError {
    /// Provider rejected the request; retrying cannot help.
    Terminal(String),
    /// Transient failure; the journaled step retries.
    Retryable(String),
}

impl fmt::Display for ConnectorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Terminal(message) | Self::Retryable(message) => formatter.write_str(message),
        }
    }
}

impl Error for ConnectorError {}

/// HTTP connector client.
#[derive(Clone, Debug)]
pub struct ConnectorClient {
    caller_token: String,
    credential_ref: String,
    http: reqwest::Client,
    world_id: String,
    timeout: Duration,
    url: String,
}

impl ConnectorClient {
    /// Build a connector client from validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`ConnectorError::Retryable`] when the HTTP client cannot be built.
    pub fn new(config: &ConnectorConfig, world_id: &str) -> Result<Self, ConnectorError> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_millis(config.request_timeout_ms))
            .build()
            .map_err(|error| ConnectorError::Retryable(error.to_string()))?;
        Ok(Self {
            caller_token: config.caller_token.clone(),
            credential_ref: config.credential_ref.clone(),
            http,
            world_id: world_id.to_owned(),
            timeout: Duration::from_millis(config.request_timeout_ms),
            url: config.url.clone(),
        })
    }

    /// Invoke the connector and classify the outcome.
    ///
    /// # Errors
    ///
    /// Returns [`ConnectorError::Terminal`] when the provider rejects the
    /// request and [`ConnectorError::Retryable`] on transient statuses.
    pub async fn invoke(
        &self,
        request: &DispatchRequest,
    ) -> Result<ConnectorOutcome, ConnectorError> {
        let response = match self
            .http
            .post(&self.url)
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", self.caller_token),
            )
            .json(&serde_json::json!({
                "credentialRef": self.credential_ref,
                "effectRequestId": request.effect_request_id,
                "idempotencyKey": request.idempotency_key,
                "payloadBase64": request.payload_base64,
                "requestDigest": request.request_digest,
                "tenantId": self.world_id,
            }))
            .timeout(self.timeout)
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                return Ok(if error.is_connect() {
                    ConnectorOutcome::DefinitelyNotSent {
                        observed_at_micros: now_micros(),
                        reason: DefinitelyNotSentReason::TimeoutBeforeSend,
                    }
                } else {
                    ConnectorOutcome::Unknown {
                        observed_at_micros: now_micros(),
                        provider_operation_id: None,
                        reason: UnknownReason::TimeoutAfterPossibleDelivery,
                        response_digest: None,
                    }
                });
            }
        };

        if !response.status().is_success() {
            let status = response.status().as_u16();
            if response.status().is_server_error() || [408, 425, 429].contains(&status) {
                return Err(ConnectorError::Retryable(format!(
                    "effect connector returned HTTP {status}"
                )));
            }
            return Err(ConnectorError::Terminal(format!(
                "effect connector rejected the request with HTTP {status}"
            )));
        }

        let Ok(body) = response.bytes().await else {
            return Ok(ConnectorOutcome::Unknown {
                observed_at_micros: now_micros(),
                provider_operation_id: None,
                reason: UnknownReason::ProviderUnavailable,
                response_digest: None,
            });
        };
        let digest = hex_sha256(&body);
        let document: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(document) => document,
            Err(_) => {
                return Ok(ConnectorOutcome::Unknown {
                    observed_at_micros: now_micros(),
                    provider_operation_id: None,
                    reason: UnknownReason::ResponseParseError,
                    response_digest: Some(digest),
                });
            }
        };
        match parse_outcome(&document) {
            Some(outcome) => Ok(outcome),
            None => Ok(ConnectorOutcome::Unknown {
                observed_at_micros: now_micros(),
                provider_operation_id: None,
                reason: UnknownReason::ResponseSchemaError,
                response_digest: Some(digest),
            }),
        }
    }
}

fn parse_outcome(document: &serde_json::Value) -> Option<ConnectorOutcome> {
    let object = document.as_object()?;
    let kind = object.get("kind")?.as_str()?;
    let observed = object.get("observedAtMicros")?.as_str()?;
    if !is_decimal(observed) {
        return None;
    }
    match kind {
        "definitely_not_sent" => {
            if object.len() != 3 {
                return None;
            }
            let reason = match object.get("reason")?.as_str()? {
                "credential_revoked" => DefinitelyNotSentReason::CredentialRevoked,
                "timeout_before_send" => DefinitelyNotSentReason::TimeoutBeforeSend,
                _ => return None,
            };
            Some(ConnectorOutcome::DefinitelyNotSent {
                observed_at_micros: observed.to_owned(),
                reason,
            })
        }
        "unknown" => {
            let reason = match object.get("reason")?.as_str()? {
                "provider_unavailable" => UnknownReason::ProviderUnavailable,
                "response_body_read_error" => UnknownReason::ResponseBodyReadError,
                "response_parse_error" => UnknownReason::ResponseParseError,
                "response_schema_error" => UnknownReason::ResponseSchemaError,
                "timeout_after_possible_delivery" => UnknownReason::TimeoutAfterPossibleDelivery,
                _ => return None,
            };
            let provider_operation_id = match object.get("providerOperationId") {
                None => None,
                Some(value) => {
                    let id = value.as_str()?;
                    if id.is_empty() {
                        return None;
                    }
                    Some(id.to_owned())
                }
            };
            let response_digest = match object.get("responseDigest") {
                None => None,
                Some(value) => {
                    let digest = value.as_str()?;
                    if !is_hex64(digest) {
                        return None;
                    }
                    Some(digest.to_owned())
                }
            };
            let expected = 3
                + usize::from(provider_operation_id.is_some())
                + usize::from(response_digest.is_some());
            if object.len() != expected {
                return None;
            }
            Some(ConnectorOutcome::Unknown {
                observed_at_micros: observed.to_owned(),
                provider_operation_id,
                reason,
                response_digest,
            })
        }
        "accepted_pending" | "confirmed" | "confirmed_no_effect" => {
            if object.len() != 4 {
                return None;
            }
            let provider_operation_id = object.get("providerOperationId")?.as_str()?;
            if provider_operation_id.is_empty() {
                return None;
            }
            let response_digest = object.get("responseDigest")?.as_str()?;
            if !is_hex64(response_digest) {
                return None;
            }
            let observed_at_micros = observed.to_owned();
            match kind {
                "accepted_pending" => Some(ConnectorOutcome::AcceptedPending {
                    observed_at_micros,
                    provider_operation_id: provider_operation_id.to_owned(),
                    response_digest: response_digest.to_owned(),
                }),
                "confirmed" => Some(ConnectorOutcome::Confirmed {
                    observed_at_micros,
                    provider_operation_id: provider_operation_id.to_owned(),
                    response_digest: response_digest.to_owned(),
                }),
                _ => Some(ConnectorOutcome::ConfirmedNoEffect {
                    observed_at_micros,
                    provider_operation_id: provider_operation_id.to_owned(),
                    response_digest: response_digest.to_owned(),
                }),
            }
        }
        _ => None,
    }
}

fn is_decimal(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn hex_sha256(body: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(body);
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push(HEX[usize::from(byte >> 4)] as char);
        hex.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    hex
}

/// Current time in microseconds with millisecond precision.
#[must_use]
pub fn now_micros() -> String {
    let millis = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => duration.as_millis(),
        Err(_) => 0,
    };
    (millis.saturating_mul(1000)).to_string()
}
