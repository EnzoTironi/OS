//! Production `ZoenEffect` Restate virtual object.
//!
//! Journaled dispatch pipeline: inspect, claim, invoke the connector, and
//! record — each step revalidating the exact-registration lease.

use std::time::Duration;

use restate_sdk::{
    context::{ContextSideEffects, ObjectContext, RunFuture},
    errors::{HandlerError, TerminalError},
    serde::Json,
};
use serde::{Deserialize, Serialize};

use super::{
    config::is_semantic_id,
    connector::{ConnectorClient, ConnectorOutcome, DispatchRequest},
    effect_service::{
        AttemptClaim, EffectInspection, EffectKind, EffectServiceClient, ServiceError,
    },
    lease::{LeaseError, RegistrationLease},
};

/// Largest dispatch version accepted (`2^53 - 1`, matching the reference).
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// Production effect handler state shared across invocations.
#[derive(Clone)]
pub struct ZoenEffect {
    artifact_revision: String,
    connector: ConnectorClient,
    effect_service: EffectServiceClient,
    lease: RegistrationLease,
    world_id: String,
}

/// Dispatch input validated against the frozen contract.
#[derive(Clone, Debug)]
struct DispatchCommand {
    dispatch_version: u64,
    effect_request_id: String,
    world_id: String,
}

/// Handler response.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct DispatchOutput {
    #[serde(rename = "attemptId")]
    attempt_id: String,
    outcome: String,
}

impl ZoenEffect {
    /// Build the handler from validated configuration.
    ///
    /// # Errors
    ///
    /// Returns [`ServiceError`] or [`LeaseError`] when a downstream client
    /// cannot be constructed.
    pub fn new(
        world_id: String,
        artifact_revision: String,
        connector: ConnectorClient,
        effect_service: EffectServiceClient,
        lease: RegistrationLease,
    ) -> Self {
        Self {
            artifact_revision,
            connector,
            effect_service,
            lease,
            world_id,
        }
    }
}

#[restate_sdk::object(name = "ZoenEffect")]
impl ZoenEffect {
    // Execute one claimed effect attempt through the generic connector.
    #[handler(name = "execute")]
    async fn execute(
        &self,
        ctx: ObjectContext<'_>,
        input: Json<serde_json::Value>,
    ) -> Result<Json<DispatchOutput>, HandlerError> {
        let command = parse_dispatch_input(&input.into_inner())?;
        if command.world_id != self.world_id {
            return Err(TerminalError::new(
                "effect invocation tenant does not match the worker credential",
            )
            .into());
        }
        let expected_key = format!(
            "{}:{}:{}",
            command.world_id, command.effect_request_id, command.dispatch_version
        );
        if ctx.key() != expected_key {
            return Err(TerminalError::new(
                "effect invocation key does not match its dispatch identity",
            )
            .into());
        }

        let inspection = self.inspect(&ctx, &command).await?;
        if inspection.knowledge_commit_sequence != command.dispatch_version {
            return Err(TerminalError::new(
                "effect dispatch version does not match current knowledge",
            )
            .into());
        }
        if inspection.kind == EffectKind::Human {
            return Err(TerminalError::new(
                "human-executor effect cannot run through the generic connector",
            )
            .into());
        }

        let claim = self.claim(&ctx, &command).await?;
        let outcome = self.invoke_connector(&ctx, &claim).await?;
        self.record(&ctx, &claim, &outcome).await?;

        Ok(Json(DispatchOutput {
            attempt_id: claim.attempt_id.clone(),
            outcome: outcome.kind().to_owned(),
        }))
    }
}

impl ZoenEffect {
    async fn inspect(
        &self,
        ctx: &ObjectContext<'_>,
        command: &DispatchCommand,
    ) -> Result<EffectInspection, HandlerError> {
        let lease = self.lease.clone();
        let service = self.effect_service.clone();
        let revision = self.artifact_revision.clone();
        let effect_request_id = command.effect_request_id.clone();
        ctx.run(move || {
            let lease = lease.clone();
            let service = service.clone();
            async move {
                lease
                    .require_current(&revision)
                    .await
                    .map_err(map_lease_error)?;
                service
                    .inspect_effect(&effect_request_id)
                    .await
                    .map_err(map_service_error)
                    .map(Json)
            }
        })
        .name("inspect effect payload class")
        .await
        .map_err(HandlerError::from)
        .map(Json::into_inner)
    }

    async fn claim(
        &self,
        ctx: &ObjectContext<'_>,
        command: &DispatchCommand,
    ) -> Result<AttemptClaim, HandlerError> {
        let lease = self.lease.clone();
        let service = self.effect_service.clone();
        let revision = self.artifact_revision.clone();
        let command = command.clone();
        let invocation_id = ctx.invocation_id().to_owned();
        ctx.run(move || {
            let lease = lease.clone();
            let service = service.clone();
            let command = command.clone();
            async move {
                lease
                    .require_current(&revision)
                    .await
                    .map_err(map_lease_error)?;
                service
                    .claim_attempt(
                        &command.effect_request_id,
                        &invocation_id,
                        command.dispatch_version,
                    )
                    .await
                    .map_err(map_service_error)
                    .map(Json)
            }
        })
        .name("claim effect attempt")
        .await
        .map_err(HandlerError::from)
        .map(Json::into_inner)
    }

    async fn invoke_connector(
        &self,
        ctx: &ObjectContext<'_>,
        claim: &AttemptClaim,
    ) -> Result<ConnectorOutcome, HandlerError> {
        let lease = self.lease.clone();
        let service = self.effect_service.clone();
        let connector = self.connector.clone();
        let revision = self.artifact_revision.clone();
        let claim = claim.clone();
        ctx.run(move || {
            let lease = lease.clone();
            let service = service.clone();
            let connector = connector.clone();
            let claim = claim.clone();
            async move {
                lease
                    .require_current(&revision)
                    .await
                    .map_err(map_lease_error)?;
                service
                    .require_current_worker_authentication()
                    .await
                    .map_err(map_service_error)?;
                connector
                    .invoke(&DispatchRequest {
                        effect_request_id: claim.effect_request_id.clone(),
                        idempotency_key: claim.idempotency_key.clone(),
                        payload_base64: claim.payload_base64.clone(),
                        request_digest: claim.request_digest.clone(),
                    })
                    .await
                    .map_err(map_connector_error)
                    .map(Json)
            }
        })
        .name("invoke external connector")
        .retry_policy(
            restate_sdk::context::RunRetryPolicy::new()
                .initial_delay(Duration::from_millis(100))
                .exponentiation_factor(2.0)
                .max_delay(Duration::from_millis(5000)),
        )
        .await
        .map_err(HandlerError::from)
        .map(Json::into_inner)
    }

    async fn record(
        &self,
        ctx: &ObjectContext<'_>,
        claim: &AttemptClaim,
        outcome: &ConnectorOutcome,
    ) -> Result<(), HandlerError> {
        let service = self.effect_service.clone();
        let claim = claim.clone();
        let outcome = outcome.clone();
        ctx.run(move || {
            let service = service.clone();
            let claim = claim.clone();
            let outcome = outcome.clone();
            async move {
                service
                    .record_attempt(&claim, &outcome)
                    .await
                    .map_err(map_service_error)?;
                Ok(Json(true))
            }
        })
        .name("record effect attempt")
        .await
        .map_err(HandlerError::from)
        .map(|_| ())
    }
}

fn parse_dispatch_input(input: &serde_json::Value) -> Result<DispatchCommand, HandlerError> {
    let malformed = || HandlerError::from(TerminalError::new("effect dispatch input is malformed"));
    let object = input.as_object().ok_or_else(malformed)?;
    if object.len() != 3 {
        return Err(malformed());
    }
    let dispatch_version = object
        .get("dispatchVersion")
        .and_then(serde_json::Value::as_u64)
        .filter(|version| *version >= 1 && *version <= MAX_SAFE_INTEGER)
        .ok_or_else(malformed)?;
    let effect_request_id = object
        .get("effectRequestId")
        .and_then(serde_json::Value::as_str)
        .filter(|value| is_semantic_id(value))
        .ok_or_else(malformed)?;
    let world_id = object
        .get("tenantId")
        .and_then(serde_json::Value::as_str)
        .filter(|value| is_semantic_id(value))
        .ok_or_else(malformed)?;
    Ok(DispatchCommand {
        dispatch_version,
        effect_request_id: effect_request_id.to_owned(),
        world_id: world_id.to_owned(),
    })
}

fn map_service_error(error: ServiceError) -> HandlerError {
    match error {
        ServiceError::Terminal(message) => HandlerError::from(TerminalError::new(message)),
        ServiceError::Retryable(message) => HandlerError::from(StepRetryable(message)),
    }
}

fn map_connector_error(error: super::connector::ConnectorError) -> HandlerError {
    match error {
        super::connector::ConnectorError::Terminal(message) => {
            HandlerError::from(TerminalError::new(message))
        }
        super::connector::ConnectorError::Retryable(message) => {
            HandlerError::from(StepRetryable(message))
        }
    }
}

fn map_lease_error(error: LeaseError) -> HandlerError {
    HandlerError::from(StepRetryable(error.0))
}

/// Retryable journaled-step failure.
#[derive(Debug)]
struct StepRetryable(String);

impl std::fmt::Display for StepRetryable {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for StepRetryable {}
