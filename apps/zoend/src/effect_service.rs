use buffa::MessageView;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::{
    DefinitelyNotSentReason, EffectAttempt as CoreEffectAttempt, EffectAttemptId,
    EffectAttemptResult, EffectEvidence as CoreEffectEvidence, EffectEvidenceDigest,
    EffectEvidenceId, EffectEvidenceOutcome as CoreEffectEvidenceOutcome,
    EffectKnowledgeState as CoreEffectKnowledgeState,
    EffectReconciliation as CoreEffectReconciliation, EffectRequest as CoreEffectRequest,
    EffectRequestDigest, EffectRequestId, EffectResponseDigest,
    EffectSnapshot as CoreEffectSnapshot, ExternalOperationId, SourceId,
};
use zoen_engine::{EffectAttemptCommand, EffectEngine, EffectError, EffectReconcileCommand};

use crate::auth::SessionRegistry;
use crate::proto::zoen::effect::v1::{
    EffectAttempt, EffectAttemptInput, EffectAttemptOutcome, EffectAttemptReason, EffectEvidence,
    EffectEvidenceInput, EffectEvidenceOutcome, EffectKnowledgeState, EffectReconciliation,
    EffectRequest, EffectService, EffectSnapshot, GetEffectRequest, GetEffectResponse,
    ReconcileRequest, ReconcileResponse, RecordAttemptRequest, RecordAttemptResponse,
};
use crate::world_service::{invalid, parse_timestamp, to_timestamp};

pub struct EffectServiceImpl {
    engine: EffectEngine<PostgresAuthorityStore>,
    sessions: SessionRegistry,
}

impl EffectServiceImpl {
    pub fn new(engine: EffectEngine<PostgresAuthorityStore>, sessions: SessionRegistry) -> Self {
        Self { engine, sessions }
    }
}

impl EffectService for EffectServiceImpl {
    async fn get_effect(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, GetEffectRequest>,
    ) -> ServiceResult<GetEffectResponse> {
        let execution_context = self.sessions.trusted_context(&context)?;
        let effect_request_id = EffectRequestId::parse(request.effect_request_id)
            .map_err(|error| invalid(error.to_string()))?;
        let snapshot = self
            .engine
            .get(&execution_context, &effect_request_id)
            .await
            .map_err(map_effect_error)?;
        Response::ok(GetEffectResponse {
            snapshot: Some(to_snapshot(snapshot)).into(),
            ..Default::default()
        })
    }

    async fn record_attempt(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, RecordAttemptRequest>,
    ) -> ServiceResult<RecordAttemptResponse> {
        let execution_context = self.sessions.trusted_context(&context)?;
        let effect_request_id = EffectRequestId::parse(request.effect_request_id)
            .map_err(|error| invalid(error.to_string()))?;
        let attempt = request
            .attempt
            .as_option()
            .ok_or_else(|| invalid("attempt is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let snapshot = self
            .engine
            .record_attempt(
                &execution_context,
                &effect_request_id,
                parse_attempt(attempt)?,
            )
            .await
            .map_err(map_effect_error)?;
        Response::ok(RecordAttemptResponse {
            snapshot: Some(to_snapshot(snapshot)).into(),
            ..Default::default()
        })
    }

    async fn reconcile(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ReconcileRequest>,
    ) -> ServiceResult<ReconcileResponse> {
        let execution_context = self.sessions.trusted_context(&context)?;
        let effect_request_id = EffectRequestId::parse(request.effect_request_id)
            .map_err(|error| invalid(error.to_string()))?;
        let evidence = request
            .evidence
            .as_option()
            .ok_or_else(|| invalid("evidence is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let snapshot = self
            .engine
            .reconcile(
                &execution_context,
                &effect_request_id,
                parse_evidence(evidence)?,
            )
            .await
            .map_err(map_effect_error)?;
        Response::ok(ReconcileResponse {
            snapshot: Some(to_snapshot(snapshot)).into(),
            ..Default::default()
        })
    }
}

fn parse_attempt(attempt: EffectAttemptInput) -> Result<EffectAttemptCommand, ConnectError> {
    let observed_at = attempt
        .observed_at
        .as_option()
        .ok_or_else(|| invalid("attempt observed_at is required"))?;
    let outcome = attempt
        .outcome
        .as_known()
        .ok_or_else(|| invalid("attempt outcome is unknown"))?;
    let reason = attempt
        .reason
        .as_known()
        .ok_or_else(|| invalid("attempt reason is unknown"))?;
    let result = match (outcome, reason, attempt.response_digest.as_str()) {
        (EffectAttemptOutcome::DefinitelyNotSent, EffectAttemptReason::CredentialRevoked, "") => {
            EffectAttemptResult::DefinitelyNotSent {
                reason: DefinitelyNotSentReason::CredentialRevoked,
            }
        }
        (EffectAttemptOutcome::DefinitelyNotSent, EffectAttemptReason::TimeoutBeforeSend, "") => {
            EffectAttemptResult::DefinitelyNotSent {
                reason: DefinitelyNotSentReason::TimeoutBeforeSend,
            }
        }
        (EffectAttemptOutcome::Unknown, reason, response_digest) => EffectAttemptResult::Unknown {
            reason: parse_unknown_reason(reason)?,
            response_digest: (!response_digest.is_empty())
                .then(|| EffectResponseDigest::parse(response_digest))
                .transpose()
                .map_err(|error| invalid(error.to_string()))?,
        },
        (
            EffectAttemptOutcome::AcceptedPending,
            EffectAttemptReason::Unspecified,
            response_digest,
        ) => EffectAttemptResult::AcceptedPending {
            response_digest: parse_response_digest(response_digest)?,
        },
        (EffectAttemptOutcome::Confirmed, EffectAttemptReason::Unspecified, response_digest) => {
            EffectAttemptResult::Confirmed {
                response_digest: parse_response_digest(response_digest)?,
            }
        }
        (
            EffectAttemptOutcome::ConfirmedNoEffect,
            EffectAttemptReason::Unspecified,
            response_digest,
        ) => EffectAttemptResult::ConfirmedNoEffect {
            response_digest: parse_response_digest(response_digest)?,
        },
        _ => {
            return Err(invalid(
                "attempt outcome, reason, and response digest are inconsistent",
            ));
        }
    };
    Ok(EffectAttemptCommand {
        attempt_id: EffectAttemptId::parse(attempt.attempt_id)
            .map_err(|error| invalid(error.to_string()))?,
        external_operation_id: ExternalOperationId::parse(attempt.external_operation_id)
            .map_err(|error| invalid(error.to_string()))?,
        observed_at: parse_timestamp(observed_at)?,
        request_digest: EffectRequestDigest::parse(attempt.request_digest)
            .map_err(|error| invalid(error.to_string()))?,
        result,
    })
}

fn parse_evidence(evidence: EffectEvidenceInput) -> Result<EffectReconcileCommand, ConnectError> {
    let observed_at = evidence
        .observed_at
        .as_option()
        .ok_or_else(|| invalid("evidence observed_at is required"))?;
    let outcome = match evidence.outcome.as_known() {
        Some(EffectEvidenceOutcome::Confirmed) => CoreEffectEvidenceOutcome::Confirmed,
        Some(EffectEvidenceOutcome::NoEffect) => CoreEffectEvidenceOutcome::NoEffect,
        Some(EffectEvidenceOutcome::Unspecified) | None => {
            return Err(invalid("evidence outcome is required"));
        }
    };
    Ok(EffectReconcileCommand {
        digest: EffectEvidenceDigest::parse(evidence.evidence_digest)
            .map_err(|error| invalid(error.to_string()))?,
        evidence_id: EffectEvidenceId::parse(evidence.evidence_id)
            .map_err(|error| invalid(error.to_string()))?,
        external_operation_id: ExternalOperationId::parse(evidence.external_operation_id)
            .map_err(|error| invalid(error.to_string()))?,
        observed_at: parse_timestamp(observed_at)?,
        outcome,
        source_id: SourceId::parse(evidence.source_id)
            .map_err(|error| invalid(error.to_string()))?,
        source_ref: evidence.source_ref,
    })
}

fn parse_unknown_reason(
    reason: EffectAttemptReason,
) -> Result<zoen_core::UnknownEffectReason, ConnectError> {
    match reason {
        EffectAttemptReason::ProviderUnavailable => {
            Ok(zoen_core::UnknownEffectReason::ProviderUnavailable)
        }
        EffectAttemptReason::ResponseParseError => {
            Ok(zoen_core::UnknownEffectReason::ResponseParseError)
        }
        EffectAttemptReason::ResponseSchemaError => {
            Ok(zoen_core::UnknownEffectReason::ResponseSchemaError)
        }
        EffectAttemptReason::TimeoutAfterPossibleDelivery => {
            Ok(zoen_core::UnknownEffectReason::TimeoutAfterPossibleDelivery)
        }
        EffectAttemptReason::Unspecified
        | EffectAttemptReason::CredentialRevoked
        | EffectAttemptReason::TimeoutBeforeSend => Err(invalid(
            "attempt reason does not describe an unknown outcome",
        )),
    }
}

fn parse_response_digest(value: &str) -> Result<EffectResponseDigest, ConnectError> {
    EffectResponseDigest::parse(value).map_err(|error| invalid(error.to_string()))
}

fn to_snapshot(snapshot: CoreEffectSnapshot) -> EffectSnapshot {
    EffectSnapshot {
        attempts: snapshot.attempts.into_iter().map(to_attempt).collect(),
        evidence: snapshot.evidence.into_iter().map(to_evidence).collect(),
        reconciliations: snapshot
            .reconciliations
            .into_iter()
            .map(to_reconciliation)
            .collect(),
        request: Some(to_request(snapshot.request)).into(),
        ..Default::default()
    }
}

fn to_request(request: CoreEffectRequest) -> EffectRequest {
    EffectRequest {
        commit_sequence: request.commit_sequence.get(),
        effect_request_id: request.effect_request_id.as_str().to_owned(),
        external_operation_id: request.external_operation_id.as_str().to_owned(),
        intent_digest: request.intent_digest.as_str().to_owned(),
        operation_id: request.operation_id.as_str().to_owned(),
        payload: request.payload,
        request_digest: request.request_digest.as_str().to_owned(),
        state: to_state(request.state).into(),
        ..Default::default()
    }
}

fn to_attempt(attempt: CoreEffectAttempt) -> EffectAttempt {
    let (outcome, reason, response_digest) = match attempt.result {
        EffectAttemptResult::DefinitelyNotSent { reason } => (
            EffectAttemptOutcome::DefinitelyNotSent,
            match reason {
                DefinitelyNotSentReason::CredentialRevoked => {
                    EffectAttemptReason::CredentialRevoked
                }
                DefinitelyNotSentReason::TimeoutBeforeSend => {
                    EffectAttemptReason::TimeoutBeforeSend
                }
            },
            String::new(),
        ),
        EffectAttemptResult::Unknown {
            reason,
            response_digest,
        } => (
            EffectAttemptOutcome::Unknown,
            match reason {
                zoen_core::UnknownEffectReason::ProviderUnavailable => {
                    EffectAttemptReason::ProviderUnavailable
                }
                zoen_core::UnknownEffectReason::ResponseParseError => {
                    EffectAttemptReason::ResponseParseError
                }
                zoen_core::UnknownEffectReason::ResponseSchemaError => {
                    EffectAttemptReason::ResponseSchemaError
                }
                zoen_core::UnknownEffectReason::TimeoutAfterPossibleDelivery => {
                    EffectAttemptReason::TimeoutAfterPossibleDelivery
                }
            },
            response_digest
                .map(|digest| digest.as_str().to_owned())
                .unwrap_or_default(),
        ),
        EffectAttemptResult::AcceptedPending { response_digest } => (
            EffectAttemptOutcome::AcceptedPending,
            EffectAttemptReason::Unspecified,
            response_digest.as_str().to_owned(),
        ),
        EffectAttemptResult::Confirmed { response_digest } => (
            EffectAttemptOutcome::Confirmed,
            EffectAttemptReason::Unspecified,
            response_digest.as_str().to_owned(),
        ),
        EffectAttemptResult::ConfirmedNoEffect { response_digest } => (
            EffectAttemptOutcome::ConfirmedNoEffect,
            EffectAttemptReason::Unspecified,
            response_digest.as_str().to_owned(),
        ),
    };
    EffectAttempt {
        attempt_id: attempt.attempt_id.as_str().to_owned(),
        commit_sequence: attempt.commit_sequence.get(),
        external_operation_id: attempt.external_operation_id.as_str().to_owned(),
        observed_at: Some(to_timestamp(attempt.observed_at)).into(),
        outcome: outcome.into(),
        reason: reason.into(),
        request_digest: attempt.request_digest.as_str().to_owned(),
        response_digest,
        ..Default::default()
    }
}

fn to_evidence(evidence: CoreEffectEvidence) -> EffectEvidence {
    EffectEvidence {
        commit_sequence: evidence.commit_sequence.get(),
        evidence_digest: evidence.digest.as_str().to_owned(),
        evidence_id: evidence.evidence_id.as_str().to_owned(),
        external_operation_id: evidence.external_operation_id.as_str().to_owned(),
        observed_at: Some(to_timestamp(evidence.observed_at)).into(),
        outcome: match evidence.outcome {
            CoreEffectEvidenceOutcome::Confirmed => EffectEvidenceOutcome::Confirmed,
            CoreEffectEvidenceOutcome::NoEffect => EffectEvidenceOutcome::NoEffect,
        }
        .into(),
        source_id: evidence.source_id.as_str().to_owned(),
        source_ref: evidence.source_ref,
        ..Default::default()
    }
}

fn to_reconciliation(reconciliation: CoreEffectReconciliation) -> EffectReconciliation {
    EffectReconciliation {
        commit_sequence: reconciliation.commit_sequence.get(),
        evidence_id: reconciliation.evidence_id.as_str().to_owned(),
        previous_state: to_state(reconciliation.previous_state).into(),
        resulting_state: to_state(reconciliation.resulting_state).into(),
        ..Default::default()
    }
}

fn to_state(state: CoreEffectKnowledgeState) -> EffectKnowledgeState {
    match state {
        CoreEffectKnowledgeState::NotAttempted => EffectKnowledgeState::NotAttempted,
        CoreEffectKnowledgeState::DefinitelyNotSent => EffectKnowledgeState::DefinitelyNotSent,
        CoreEffectKnowledgeState::Unknown => EffectKnowledgeState::Unknown,
        CoreEffectKnowledgeState::AcceptedPending => EffectKnowledgeState::AcceptedPending,
        CoreEffectKnowledgeState::Confirmed => EffectKnowledgeState::Confirmed,
        CoreEffectKnowledgeState::ConfirmedNoEffect => EffectKnowledgeState::ConfirmedNoEffect,
        CoreEffectKnowledgeState::Contradicted => EffectKnowledgeState::Contradicted,
    }
}

fn map_effect_error(error: EffectError) -> ConnectError {
    match error {
        EffectError::AttemptIdentityConflict | EffectError::EvidenceIdentityConflict => {
            ConnectError::new(ErrorCode::AlreadyExists, error.to_string())
        }
        EffectError::InvalidEvidence(_) => {
            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
        }
        EffectError::Store(error) => crate::service::map_store_error(error),
        EffectError::UnsafeRetry(_) => {
            ConnectError::new(ErrorCode::FailedPrecondition, error.to_string())
        }
    }
}
