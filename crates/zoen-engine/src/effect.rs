use std::error::Error;
use std::fmt::{Display, Formatter};

use zoen_core::{
    EffectAttempt, EffectAttemptId, EffectAttemptResult, EffectEvidence, EffectEvidenceDigest,
    EffectEvidenceId, EffectEvidenceOutcome, EffectKnowledgeState, EffectRequestDigest,
    EffectRequestId, EffectSnapshot, ExecutionContext, ExternalOperationId, SourceId, TenantId,
    TimestampMicros,
};

use crate::{AuthorityStore, StoreError};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptCommand {
    pub attempt_id: EffectAttemptId,
    pub external_operation_id: ExternalOperationId,
    pub observed_at: TimestampMicros,
    pub request_digest: EffectRequestDigest,
    pub result: EffectAttemptResult,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectReconcileCommand {
    pub digest: EffectEvidenceDigest,
    pub evidence_id: EffectEvidenceId,
    pub external_operation_id: ExternalOperationId,
    pub observed_at: TimestampMicros,
    pub outcome: EffectEvidenceOutcome,
    pub source_id: SourceId,
    pub source_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectScheduleCommand {
    pub effect_request_id: EffectRequestId,
    pub tenant_id: TenantId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScheduledEffect {
    pub invocation_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EffectScheduleError {
    InvalidResponse(String),
    Rejected(String),
    Unavailable(String),
}

impl Display for EffectScheduleError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidResponse(message) => {
                write!(formatter, "Restate returned an invalid response: {message}")
            }
            Self::Rejected(message) => {
                write!(formatter, "Restate rejected the invocation: {message}")
            }
            Self::Unavailable(message) => write!(formatter, "Restate is unavailable: {message}"),
        }
    }
}

impl Error for EffectScheduleError {}

#[allow(async_fn_in_trait)]
pub trait EffectScheduler: Send + Sync {
    async fn schedule(
        &self,
        command: &EffectScheduleCommand,
    ) -> Result<ScheduledEffect, EffectScheduleError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EffectError {
    AttemptIdentityConflict,
    EvidenceIdentityConflict,
    InvalidEvidence(String),
    Store(StoreError),
    UnsafeRetry(EffectKnowledgeState),
}

impl Display for EffectError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AttemptIdentityConflict => {
                formatter.write_str("attempt identity already describes different evidence")
            }
            Self::EvidenceIdentityConflict => {
                formatter.write_str("evidence identity or digest describes different evidence")
            }
            Self::InvalidEvidence(message) => {
                write!(formatter, "invalid effect evidence: {message}")
            }
            Self::Store(error) => error.fmt(formatter),
            Self::UnsafeRetry(state) => write!(
                formatter,
                "effect in state {} cannot be attempted automatically",
                state_name(*state)
            ),
        }
    }
}

impl Error for EffectError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::AttemptIdentityConflict
            | Self::EvidenceIdentityConflict
            | Self::InvalidEvidence(_)
            | Self::UnsafeRetry(_) => None,
        }
    }
}

#[allow(async_fn_in_trait)]
pub trait EffectUpdateTransaction: Send {
    fn snapshot(&self) -> &EffectSnapshot;

    async fn commit_attempt(
        self,
        command: &EffectAttemptCommand,
        resulting_state: EffectKnowledgeState,
    ) -> Result<EffectSnapshot, StoreError>;

    async fn commit_reconciliation(
        self,
        command: &EffectReconcileCommand,
        resulting_state: EffectKnowledgeState,
    ) -> Result<EffectSnapshot, StoreError>;

    async fn rollback(self) -> Result<(), StoreError>;
}

pub struct EffectEngine<S> {
    store: S,
}

impl<S> EffectEngine<S>
where
    S: AuthorityStore,
{
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub async fn get(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<EffectSnapshot, EffectError> {
        self.store
            .get_effect(context, effect_request_id)
            .await
            .map_err(EffectError::Store)
    }

    pub async fn record_attempt(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectAttemptCommand,
    ) -> Result<EffectSnapshot, EffectError> {
        let transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let snapshot = transaction.snapshot();
        if let Some(existing) = snapshot
            .attempts
            .iter()
            .find(|attempt| attempt.attempt_id == command.attempt_id)
        {
            let same = attempt_matches(existing, &command);
            let result = snapshot.clone();
            transaction.rollback().await.map_err(EffectError::Store)?;
            return if same {
                Ok(result)
            } else {
                Err(EffectError::AttemptIdentityConflict)
            };
        }
        if command.external_operation_id != snapshot.request.external_operation_id {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "attempt external operation does not match the request".to_owned(),
            ));
        }
        if command.request_digest != snapshot.request.request_digest {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "attempt request digest does not match the request".to_owned(),
            ));
        }
        let resulting_state = effect_state_after_attempt(snapshot.request.state, &command.result)?;
        transaction
            .commit_attempt(&command, resulting_state)
            .await
            .map_err(EffectError::Store)
    }

    pub async fn reconcile(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectReconcileCommand,
    ) -> Result<EffectSnapshot, EffectError> {
        if command.source_ref.is_empty() {
            return Err(EffectError::InvalidEvidence(
                "source reference is empty".to_owned(),
            ));
        }
        let transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let snapshot = transaction.snapshot();
        if let Some(existing) = snapshot
            .evidence
            .iter()
            .find(|evidence| evidence.evidence_id == command.evidence_id)
        {
            let same = evidence_matches(existing, &command);
            let result = snapshot.clone();
            transaction.rollback().await.map_err(EffectError::Store)?;
            return if same {
                Ok(result)
            } else {
                Err(EffectError::EvidenceIdentityConflict)
            };
        }
        if let Some(existing) = snapshot
            .evidence
            .iter()
            .find(|evidence| evidence.digest == command.digest)
        {
            let same = evidence_semantics_match(existing, &command);
            let result = snapshot.clone();
            transaction.rollback().await.map_err(EffectError::Store)?;
            return if same {
                Ok(result)
            } else {
                Err(EffectError::EvidenceIdentityConflict)
            };
        }
        if command.external_operation_id != snapshot.request.external_operation_id {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "evidence external operation does not match the request".to_owned(),
            ));
        }
        let resulting_state = effect_state_after_evidence(snapshot.request.state, command.outcome);
        transaction
            .commit_reconciliation(&command, resulting_state)
            .await
            .map_err(EffectError::Store)
    }
}

pub fn effect_state_after_attempt(
    current: EffectKnowledgeState,
    result: &EffectAttemptResult,
) -> Result<EffectKnowledgeState, EffectError> {
    if !matches!(
        current,
        EffectKnowledgeState::NotAttempted | EffectKnowledgeState::DefinitelyNotSent
    ) {
        return Err(EffectError::UnsafeRetry(current));
    }
    Ok(match result {
        EffectAttemptResult::DefinitelyNotSent { .. } => EffectKnowledgeState::DefinitelyNotSent,
        EffectAttemptResult::Unknown { .. } => EffectKnowledgeState::Unknown,
        EffectAttemptResult::AcceptedPending { .. } => EffectKnowledgeState::AcceptedPending,
        EffectAttemptResult::Confirmed { .. } => EffectKnowledgeState::Confirmed,
        EffectAttemptResult::ConfirmedNoEffect { .. } => EffectKnowledgeState::ConfirmedNoEffect,
    })
}

pub fn effect_state_after_evidence(
    current: EffectKnowledgeState,
    outcome: EffectEvidenceOutcome,
) -> EffectKnowledgeState {
    match (current, outcome) {
        (EffectKnowledgeState::Contradicted, _)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectEvidenceOutcome::Confirmed)
        | (EffectKnowledgeState::Confirmed, EffectEvidenceOutcome::NoEffect) => {
            EffectKnowledgeState::Contradicted
        }
        (_, EffectEvidenceOutcome::Confirmed) => EffectKnowledgeState::Confirmed,
        (_, EffectEvidenceOutcome::NoEffect) => EffectKnowledgeState::ConfirmedNoEffect,
    }
}

fn attempt_matches(existing: &EffectAttempt, command: &EffectAttemptCommand) -> bool {
    existing.external_operation_id == command.external_operation_id
        && existing.observed_at == command.observed_at
        && existing.request_digest == command.request_digest
        && existing.result == command.result
}

fn evidence_matches(existing: &EffectEvidence, command: &EffectReconcileCommand) -> bool {
    existing.digest == command.digest
        && evidence_semantics_match(existing, command)
        && existing.observed_at == command.observed_at
        && existing.source_id == command.source_id
        && existing.source_ref == command.source_ref
}

fn evidence_semantics_match(existing: &EffectEvidence, command: &EffectReconcileCommand) -> bool {
    existing.external_operation_id == command.external_operation_id
        && existing.outcome == command.outcome
}

fn state_name(state: EffectKnowledgeState) -> &'static str {
    match state {
        EffectKnowledgeState::NotAttempted => "not_attempted",
        EffectKnowledgeState::DefinitelyNotSent => "definitely_not_sent",
        EffectKnowledgeState::Unknown => "unknown",
        EffectKnowledgeState::AcceptedPending => "accepted_pending",
        EffectKnowledgeState::Confirmed => "confirmed",
        EffectKnowledgeState::ConfirmedNoEffect => "confirmed_no_effect",
        EffectKnowledgeState::Contradicted => "contradicted",
    }
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        EffectAttemptResult, EffectEvidenceOutcome, EffectKnowledgeState, UnknownEffectReason,
    };

    use super::{EffectError, effect_state_after_attempt, effect_state_after_evidence};

    #[test]
    fn ambiguous_attempt_stays_unknown_and_cannot_be_retried() {
        let result = EffectAttemptResult::Unknown {
            reason: UnknownEffectReason::TimeoutAfterPossibleDelivery,
            response_digest: None,
        };
        assert_eq!(
            effect_state_after_attempt(EffectKnowledgeState::NotAttempted, &result),
            Ok(EffectKnowledgeState::Unknown)
        );
        assert_eq!(
            effect_state_after_attempt(EffectKnowledgeState::Unknown, &result),
            Err(EffectError::UnsafeRetry(EffectKnowledgeState::Unknown))
        );
    }

    #[test]
    fn opposing_independent_evidence_creates_a_typed_contradiction() {
        let confirmed = effect_state_after_evidence(
            EffectKnowledgeState::AcceptedPending,
            EffectEvidenceOutcome::Confirmed,
        );
        assert_eq!(confirmed, EffectKnowledgeState::Confirmed);
        assert_eq!(
            effect_state_after_evidence(confirmed, EffectEvidenceOutcome::NoEffect),
            EffectKnowledgeState::Contradicted
        );
    }
}
