//! Authenticated `EffectService` client for the production handler.
//!
//! Workload API keys exchange for short-lived tokens; `Unauthenticated`
//! responses trigger exactly one re-authentication, mirroring the reference.

use std::{error::Error, fmt, time::Duration};

use buffa::EnumValue;
use connectrpc::client::{CallOptions, ClientConfig, HttpClient};
use sha2::{Digest, Sha256};
use zoen_proto::zoen::effect::v1::{
    ClaimAttemptRequest, EffectAttemptInput, EffectAttemptOutcome, EffectAttemptReason,
    EffectServiceClient as ProtoEffectServiceClient, GetEffectRequest, RecordAttemptRequest,
};

use super::{
    config::{EffectHandlerConfig, IdentityConfig, read_api_key},
    connector::{ConnectorOutcome, DefinitelyNotSentReason, UnknownReason},
};

/// Largest dispatch version accepted (`2^53 - 1`, matching the reference).
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// Inspected effect shape driving dispatch decisions.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum EffectKind {
    /// Generic external effect executed through the connector.
    External,
    /// Human-executor effect refused by the generic connector.
    Human,
}

/// Knowledge state plus payload class for one effect request.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct EffectInspection {
    /// Latest knowledge commit sequence across request, attempts, evidence.
    pub knowledge_commit_sequence: u64,
    /// Payload class.
    pub kind: EffectKind,
}

/// Claimed attempt dispatched to the connector.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AttemptClaim {
    /// Claimed attempt id.
    pub attempt_id: String,
    /// Effect request id.
    pub effect_request_id: String,
    /// Provider idempotency key.
    pub idempotency_key: String,
    /// Base64 request payload.
    pub payload_base64: String,
    /// Hex SHA-256 over the raw payload.
    pub request_digest: String,
}

/// Authenticated session returned by the workload exchange.
#[derive(Clone, Debug)]
struct WorkloadSession {
    actor_id: String,
    exchange_token: String,
    principal_id: String,
    world_id: String,
    workload_id: String,
}

/// Step failure: terminal rejections vs retried errors.
#[derive(Debug)]
pub enum ServiceError {
    /// The attempt cannot succeed; Restate must not retry.
    Terminal(String),
    /// Transient failure; the journaled step retries.
    Retryable(String),
}

impl fmt::Display for ServiceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Terminal(message) | Self::Retryable(message) => formatter.write_str(message),
        }
    }
}

impl Error for ServiceError {}

type ServiceResult<T> = Result<T, ServiceError>;

/// Authenticated `EffectService` client.
#[derive(Clone)]
pub struct EffectServiceClient {
    authentication_url: String,
    client: ProtoEffectServiceClient<HttpClient>,
    http: reqwest::Client,
    identity: IdentityConfig,
    timeout: Duration,
}

impl EffectServiceClient {
    /// Build the client from validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError::Retryable`] when an HTTP client cannot be built.
    pub fn new(config: &EffectHandlerConfig) -> Result<Self, ServiceError> {
        let timeout = Duration::from_millis(config.effect_service.request_timeout_ms);
        let http = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|error| ServiceError::Retryable(error.to_string()))?;
        let base = config.effect_service.zoend_url.trim_end_matches('/');
        let transport = HttpClient::plaintext();
        let rpc_config = ClientConfig::new(
            base.parse()
                .map_err(|error| ServiceError::Retryable(format!("invalid zoend URL: {error}")))?,
        );
        Ok(Self {
            authentication_url: format!("{base}/workload/authenticate"),
            client: ProtoEffectServiceClient::new(transport, rpc_config),
            http,
            identity: config.identity.clone(),
            timeout,
        })
    }

    /// Fetch the snapshot and classify the payload.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError`] when the service is unavailable or the
    /// snapshot is missing, mismatched, or unsupported.
    pub async fn inspect_effect(&self, effect_request_id: &str) -> ServiceResult<EffectInspection> {
        let request = GetEffectRequest {
            effect_request_id: effect_request_id.to_owned(),
            ..Default::default()
        };
        let response = self
            .with_authentication("get effect", |options| {
                self.client
                    .get_effect_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        let snapshot = response.snapshot.into_option().ok_or_else(|| {
            ServiceError::Terminal("EffectService returned no effect request".to_owned())
        })?;
        let request_snapshot = snapshot.request.as_option().ok_or_else(|| {
            ServiceError::Terminal("EffectService returned no effect request".to_owned())
        })?;
        if request_snapshot.effect_request_id.as_str() != effect_request_id {
            return Err(ServiceError::Terminal(
                "EffectService returned a different effect request".to_owned(),
            ));
        }
        Ok(EffectInspection {
            knowledge_commit_sequence: latest_commit_sequence(&snapshot)?,
            kind: if is_human_task_payload(&request_snapshot.payload) {
                EffectKind::Human
            } else {
                EffectKind::External
            },
        })
    }

    /// Claim one attempt for this invocation.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError`] when the claim is unavailable, mismatched, or
    /// carries a wrong payload digest.
    pub async fn claim_attempt(
        &self,
        effect_request_id: &str,
        adapter_execution_id: &str,
        expected_knowledge_commit_sequence: u64,
    ) -> ServiceResult<AttemptClaim> {
        if adapter_execution_id.is_empty() {
            return Err(ServiceError::Terminal(
                "Restate supplied an empty invocation id".to_owned(),
            ));
        }
        let request = ClaimAttemptRequest {
            effect_request_id: effect_request_id.to_owned(),
            adapter_execution_id: adapter_execution_id.to_owned(),
            expected_knowledge_commit_sequence,
            ..Default::default()
        };
        let response = self
            .with_authentication("claim effect attempt", |options| {
                self.client
                    .claim_attempt_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        let claim = response.claim.into_option().ok_or_else(|| {
            ServiceError::Terminal("EffectService returned no attempt claim".to_owned())
        })?;
        let claimed_request = claim.request.as_option().ok_or_else(|| {
            ServiceError::Terminal("EffectService returned no attempt claim".to_owned())
        })?;
        if claimed_request.effect_request_id.as_str() != effect_request_id {
            return Err(ServiceError::Terminal(
                "EffectService claimed a different effect request".to_owned(),
            ));
        }
        if hex_sha256(&claimed_request.payload) != claimed_request.request_digest.as_str() {
            return Err(ServiceError::Terminal(
                "EffectService returned an effect payload with the wrong digest".to_owned(),
            ));
        }
        let attempt_id = claim.attempt_id.clone();
        let claimed_effect_request_id = claimed_request.effect_request_id.clone();
        let idempotency_key = claimed_request.idempotency_key.clone();
        let request_digest = claimed_request.request_digest.clone();
        if attempt_id.is_empty()
            || claimed_effect_request_id.is_empty()
            || idempotency_key.is_empty()
            || !is_hex64(&request_digest)
        {
            return Err(ServiceError::Terminal(
                "EffectService returned a malformed claim".to_owned(),
            ));
        }
        Ok(AttemptClaim {
            attempt_id,
            effect_request_id: claimed_effect_request_id,
            idempotency_key,
            payload_base64: base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &claimed_request.payload,
            ),
            request_digest,
        })
    }

    /// Record the connector outcome for a claimed attempt.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError`] when the record call fails or the service
    /// does not echo the recorded snapshot.
    pub async fn record_attempt(
        &self,
        claim: &AttemptClaim,
        outcome: &ConnectorOutcome,
    ) -> ServiceResult<()> {
        let (attempt_outcome, reason) = attempt_result(outcome);
        let (seconds, nanos) = timestamp_from_micros(observed_micros(outcome)?);
        let request = RecordAttemptRequest {
            effect_request_id: claim.effect_request_id.clone(),
            attempt: buffa::MessageField::some(EffectAttemptInput {
                attempt_id: claim.attempt_id.clone(),
                provider_operation_id: provider_operation_id(outcome).to_owned(),
                outcome: EnumValue::from(attempt_outcome),
                reason: EnumValue::from(reason),
                response_digest: response_digest(outcome).to_owned(),
                observed_at: buffa::MessageField::some(buffa_types::google::protobuf::Timestamp {
                    seconds,
                    nanos,
                    ..Default::default()
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let response = self
            .with_authentication("record effect attempt", |options| {
                self.client
                    .record_attempt_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        let snapshot_effect_request_id = response
            .snapshot
            .into_option()
            .and_then(|snapshot| snapshot.request.into_option())
            .map(|request| request.effect_request_id.clone());
        if snapshot_effect_request_id.as_deref() != Some(claim.effect_request_id.as_str()) {
            return Err(ServiceError::Terminal(
                "EffectService did not return the recorded effect snapshot".to_owned(),
            ));
        }
        Ok(())
    }

    /// Prove the worker credential still authenticates.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError`] when authentication fails.
    pub async fn require_current_worker_authentication(&self) -> ServiceResult<()> {
        self.authenticate().await.map(|_| ())
    }

    async fn with_authentication<T, F, Fut>(
        &self,
        operation_name: &str,
        operation: F,
    ) -> ServiceResult<T>
    where
        F: Fn(CallOptions) -> Fut,
        Fut: Future<Output = Result<T, connectrpc::ConnectError>>,
    {
        let first = self.authenticate().await?;
        match operation(self.call_options(&first)).await {
            Ok(value) => Ok(value),
            Err(error) => {
                if !is_unauthenticated(&error) {
                    return Err(map_service_error(operation_name, &error));
                }
                println!("effect service session rejected; reauthenticating once");
                let second = self.authenticate().await?;
                match operation(self.call_options(&second)).await {
                    Ok(value) => Ok(value),
                    Err(error) => Err(map_service_error(operation_name, &error)),
                }
            }
        }
    }

    fn call_options(&self, session: &WorkloadSession) -> CallOptions {
        CallOptions::default()
            .with_timeout(self.timeout)
            .with_header(
                "authorization",
                format!("Bearer {}", session.exchange_token),
            )
            .with_header("x-zoen-tenant", self.identity.world_id.clone())
    }

    async fn authenticate(&self) -> ServiceResult<WorkloadSession> {
        let api_key = read_api_key(&self.identity.api_key_file).map_err(|error| {
            ServiceError::Retryable(format!("effect worker API key is unavailable: {error}"))
        })?;
        let response = self
            .http
            .post(&self.authentication_url)
            .json(&serde_json::json!({ "apiKey": api_key }))
            .send()
            .await
            .map_err(|error| {
                ServiceError::Retryable(format!(
                    "workload credential exchange is unavailable: {error}"
                ))
            })?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            if response.status().is_server_error() || [401, 404, 429].contains(&status) {
                return Err(ServiceError::Retryable(format!(
                    "workload credential exchange returned HTTP {status}"
                )));
            }
            return Err(ServiceError::Terminal(format!(
                "workload credential exchange rejected the API key with HTTP {status}"
            )));
        }
        let document: serde_json::Value = response.json().await.map_err(|error| {
            ServiceError::Terminal(format!(
                "workload credential exchange returned malformed JSON: {error}"
            ))
        })?;
        let session = parse_session(&document)?;
        if session.world_id != self.identity.world_id
            || session.workload_id != self.identity.workload_id
            || session.principal_id != self.identity.principal_id
            || session.actor_id != self.identity.actor_id
        {
            return Err(ServiceError::Terminal(
                "workload credential exchange returned a mismatched identity".to_owned(),
            ));
        }
        Ok(session)
    }
}

fn parse_session(document: &serde_json::Value) -> ServiceResult<WorkloadSession> {
    let malformed = || {
        ServiceError::Terminal(
            "workload credential exchange returned a malformed session".to_owned(),
        )
    };
    let object = document.as_object().ok_or_else(malformed)?;
    if object.len() != 7 {
        return Err(malformed());
    }
    let get = |key: &str| {
        object
            .get(key)
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .ok_or_else(malformed)
    };
    let scopes = object.get("discoverableScopes").ok_or_else(malformed)?;
    validate_scopes(scopes)?;
    get("credentialId")?;
    Ok(WorkloadSession {
        actor_id: get("actorId")?,
        exchange_token: get("exchangeToken")?,
        principal_id: get("principalId")?,
        world_id: get("tenantId")?,
        workload_id: get("workloadId")?,
    })
}

fn validate_scopes(scopes: &serde_json::Value) -> ServiceResult<()> {
    let malformed = || {
        ServiceError::Terminal(
            "workload credential exchange returned a malformed session".to_owned(),
        )
    };
    let items = scopes.as_array().ok_or_else(malformed)?;
    for item in items {
        let scope = item.as_object().ok_or_else(malformed)?;
        if scope.len() != 3 {
            return Err(malformed());
        }
        for key in ["definitionId", "kind"] {
            let valid = scope
                .get(key)
                .and_then(serde_json::Value::as_str)
                .is_some_and(|value| !value.is_empty());
            if !valid {
                return Err(malformed());
            }
        }
        match scope.get("resourceId") {
            Some(serde_json::Value::Null | serde_json::Value::String(_)) => (),
            Some(_) | None => return Err(malformed()),
        }
    }
    Ok(())
}

fn latest_commit_sequence(
    snapshot: &zoen_proto::zoen::effect::v1::EffectSnapshot,
) -> ServiceResult<u64> {
    let request = snapshot.request.as_option().ok_or_else(|| {
        ServiceError::Terminal("EffectService returned no effect request".to_owned())
    })?;
    let mut latest = request.commit_sequence;
    for attempt in &snapshot.attempts {
        latest = latest.max(attempt.commit_sequence);
    }
    for evidence in &snapshot.evidence {
        latest = latest.max(evidence.commit_sequence);
    }
    for reconciliation in &snapshot.reconciliations {
        latest = latest.max(reconciliation.commit_sequence);
    }
    if latest == 0 || latest > MAX_SAFE_INTEGER {
        return Err(ServiceError::Terminal(
            "EffectService returned an unsupported knowledge commit sequence".to_owned(),
        ));
    }
    Ok(latest)
}

fn is_human_task_payload(payload: &[u8]) -> bool {
    let document: serde_json::Value = match serde_json::from_slice(payload) {
        Ok(document) => document,
        Err(_) => return false,
    };
    let Some(object) = document.as_object() else {
        return false;
    };
    object.get("executorClass") == Some(&serde_json::Value::from("human_executor"))
        && object
            .get("schemaVersion")
            .is_some_and(|version| version.as_u64() == Some(1) || version.as_f64() == Some(1.0))
}

fn is_unauthenticated(error: &connectrpc::ConnectError) -> bool {
    error.code == connectrpc::ErrorCode::Unauthenticated
}

fn map_service_error(operation_name: &str, error: &connectrpc::ConnectError) -> ServiceError {
    if is_transient_code(error.code) {
        return ServiceError::Retryable(error.to_string());
    }
    ServiceError::Terminal(format!("{operation_name} failed: {error}"))
}

fn is_transient_code(code: connectrpc::ErrorCode) -> bool {
    matches!(
        code,
        connectrpc::ErrorCode::Aborted
            | connectrpc::ErrorCode::Canceled
            | connectrpc::ErrorCode::DeadlineExceeded
            | connectrpc::ErrorCode::Internal
            | connectrpc::ErrorCode::ResourceExhausted
            | connectrpc::ErrorCode::Unavailable
            | connectrpc::ErrorCode::Unknown
    )
}

fn attempt_result(outcome: &ConnectorOutcome) -> (EffectAttemptOutcome, EffectAttemptReason) {
    match outcome {
        ConnectorOutcome::DefinitelyNotSent { reason, .. } => (
            EffectAttemptOutcome::DefinitelyNotSent,
            match reason {
                DefinitelyNotSentReason::CredentialRevoked => {
                    EffectAttemptReason::CredentialRevoked
                }
                DefinitelyNotSentReason::TimeoutBeforeSend => {
                    EffectAttemptReason::TimeoutBeforeSend
                }
            },
        ),
        ConnectorOutcome::Unknown { reason, .. } => (
            EffectAttemptOutcome::Unknown,
            match reason {
                UnknownReason::ProviderUnavailable | UnknownReason::ResponseBodyReadError => {
                    EffectAttemptReason::ProviderUnavailable
                }
                UnknownReason::ResponseParseError => EffectAttemptReason::ResponseParseError,
                UnknownReason::ResponseSchemaError => EffectAttemptReason::ResponseSchemaError,
                UnknownReason::TimeoutAfterPossibleDelivery => {
                    EffectAttemptReason::TimeoutAfterPossibleDelivery
                }
            },
        ),
        ConnectorOutcome::AcceptedPending { .. } => (
            EffectAttemptOutcome::AcceptedPending,
            EffectAttemptReason::Unspecified,
        ),
        ConnectorOutcome::Confirmed { .. } => (
            EffectAttemptOutcome::Confirmed,
            EffectAttemptReason::Unspecified,
        ),
        ConnectorOutcome::ConfirmedNoEffect { .. } => (
            EffectAttemptOutcome::ConfirmedNoEffect,
            EffectAttemptReason::Unspecified,
        ),
    }
}

fn observed_micros(outcome: &ConnectorOutcome) -> ServiceResult<&str> {
    let observed = match outcome {
        ConnectorOutcome::DefinitelyNotSent {
            observed_at_micros, ..
        }
        | ConnectorOutcome::Unknown {
            observed_at_micros, ..
        }
        | ConnectorOutcome::AcceptedPending {
            observed_at_micros, ..
        }
        | ConnectorOutcome::Confirmed {
            observed_at_micros, ..
        }
        | ConnectorOutcome::ConfirmedNoEffect {
            observed_at_micros, ..
        } => observed_at_micros.as_str(),
    };
    if observed.bytes().all(|byte| byte.is_ascii_digit()) && !observed.is_empty() {
        Ok(observed)
    } else {
        Err(ServiceError::Terminal(
            "connector reported a malformed observation timestamp".to_owned(),
        ))
    }
}

fn timestamp_from_micros(value: &str) -> (i64, i32) {
    let micros = value.parse::<u64>().unwrap_or(u64::MAX);
    let seconds = micros / 1_000_000;
    let nanos = (micros % 1_000_000) * 1_000;
    let seconds = i64::try_from(seconds).unwrap_or(i64::MAX);
    let nanos = i32::try_from(nanos).unwrap_or(0);
    (seconds, nanos)
}

fn provider_operation_id(outcome: &ConnectorOutcome) -> &str {
    match outcome {
        ConnectorOutcome::Unknown {
            provider_operation_id,
            ..
        } => provider_operation_id.as_deref().unwrap_or(""),
        ConnectorOutcome::AcceptedPending {
            provider_operation_id,
            ..
        }
        | ConnectorOutcome::Confirmed {
            provider_operation_id,
            ..
        }
        | ConnectorOutcome::ConfirmedNoEffect {
            provider_operation_id,
            ..
        } => provider_operation_id.as_str(),
        ConnectorOutcome::DefinitelyNotSent { .. } => "",
    }
}

fn response_digest(outcome: &ConnectorOutcome) -> &str {
    match outcome {
        ConnectorOutcome::Unknown {
            response_digest, ..
        } => response_digest.as_deref().unwrap_or(""),
        ConnectorOutcome::AcceptedPending {
            response_digest, ..
        }
        | ConnectorOutcome::Confirmed {
            response_digest, ..
        }
        | ConnectorOutcome::ConfirmedNoEffect {
            response_digest, ..
        } => response_digest.as_str(),
        ConnectorOutcome::DefinitelyNotSent { .. } => "",
    }
}

fn hex_sha256(value: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(value);
    let mut hex = String::with_capacity(64);
    for byte in digest {
        hex.push(HEX[usize::from(byte >> 4)] as char);
        hex.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    hex
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}
