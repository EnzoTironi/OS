use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    EffectAttempt, EffectAttemptId, EffectAttemptResult, EffectEvidence, EffectEvidenceDigest,
    EffectEvidenceId, EffectEvidenceOutcome, EffectIdempotencyKey, EffectKnowledgeState,
    EffectRequest, EffectRequestId, EffectSnapshot, ExecutionContext, HumanTaskError,
    ProviderOperationId, SourceId, TimestampMicros, WorkloadId,
};

use crate::human::{is_human_task_payload, parse_human_task_contract};
use crate::{AuthorityStore, StoreError};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptCommand {
    pub attempt_id: EffectAttemptId,
    pub observed_at: TimestampMicros,
    pub result: EffectAttemptResult,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptClaimCommand {
    pub adapter_execution_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptClaim {
    pub attempt_id: EffectAttemptId,
    pub request: EffectRequest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectReconcileCommand {
    pub digest: EffectEvidenceDigest,
    pub evidence_id: EffectEvidenceId,
    pub idempotency_key: EffectIdempotencyKey,
    pub observed_at: TimestampMicros,
    pub outcome: EffectEvidenceOutcome,
    pub provider_operation_id: ProviderOperationId,
    pub source_id: SourceId,
    pub source_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EffectError {
    AttemptIdentityConflict,
    EvidenceIdentityConflict,
    ForbiddenWorkload,
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
            Self::ForbiddenWorkload => {
                formatter.write_str("workload is not authorized for this effect operation")
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
            | Self::ForbiddenWorkload
            | Self::InvalidEvidence(_)
            | Self::UnsafeRetry(_) => None,
        }
    }
}

#[allow(async_fn_in_trait)]
pub trait EffectUpdateTransaction: Send {
    fn snapshot(&self) -> &EffectSnapshot;

    async fn claimed_attempt(
        &mut self,
        adapter_execution_id: &str,
    ) -> Result<Option<EffectAttemptId>, StoreError>;

    async fn open_claim(&mut self) -> Result<Option<(String, EffectAttemptId)>, StoreError>;

    async fn commit_claim(
        self,
        adapter_execution_id: &str,
        attempt_id: &EffectAttemptId,
    ) -> Result<(), StoreError>;

    async fn has_claim(&mut self, attempt_id: &EffectAttemptId) -> Result<bool, StoreError>;

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
    allowed_executor_workloads: BTreeSet<WorkloadId>,
    reconciler_workload_id: WorkloadId,
    store: S,
    worker_workload_id: WorkloadId,
}

impl<S> EffectEngine<S>
where
    S: AuthorityStore,
{
    pub fn new(
        store: S,
        worker_workload_id: WorkloadId,
        reconciler_workload_id: WorkloadId,
    ) -> Self {
        Self {
            allowed_executor_workloads: BTreeSet::new(),
            reconciler_workload_id,
            store,
            worker_workload_id,
        }
    }

    pub fn with_allowed_executor_workloads(
        mut self,
        allowed_executor_workloads: BTreeSet<WorkloadId>,
    ) -> Self {
        self.allowed_executor_workloads = allowed_executor_workloads;
        self
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

    pub async fn claim_attempt(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectAttemptClaimCommand,
    ) -> Result<EffectAttemptClaim, EffectError> {
        if command.adapter_execution_id.is_empty() {
            return Err(EffectError::InvalidEvidence(
                "adapter execution id is empty".to_owned(),
            ));
        }
        let mut transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let request = transaction.snapshot().request.clone();
        self.require_attempt_authority(context, &request)?;
        if is_human_task_payload(&request.payload) {
            refuse_expired_human_task(&request, TimestampMicros::new(now_micros()))?;
        }
        if let Some(attempt_id) = transaction
            .claimed_attempt(&command.adapter_execution_id)
            .await
            .map_err(EffectError::Store)?
        {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Ok(EffectAttemptClaim {
                attempt_id,
                request,
            });
        }
        if is_human_task_payload(&request.payload) {
            if let Some((existing_adapter, _)) =
                transaction.open_claim().await.map_err(EffectError::Store)?
            {
                if existing_adapter != command.adapter_execution_id {
                    transaction.rollback().await.map_err(EffectError::Store)?;
                    return Err(EffectError::AttemptIdentityConflict);
                }
            }
        }
        if !matches!(
            request.state,
            EffectKnowledgeState::NotAttempted | EffectKnowledgeState::DefinitelyNotSent
        ) {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::UnsafeRetry(request.state));
        }
        let attempt_id = mint_attempt_id(
            context,
            effect_request_id,
            command.adapter_execution_id.as_str(),
        )?;
        transaction
            .commit_claim(&command.adapter_execution_id, &attempt_id)
            .await
            .map_err(EffectError::Store)?;
        Ok(EffectAttemptClaim {
            attempt_id,
            request,
        })
    }

    pub async fn record_attempt(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectAttemptCommand,
    ) -> Result<EffectSnapshot, EffectError> {
        let mut transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let snapshot = transaction.snapshot().clone();
        self.require_attempt_authority(context, &snapshot.request)?;
        if is_human_executor_workload(self, context)
            && matches!(
                command.result,
                EffectAttemptResult::Confirmed { .. }
                    | EffectAttemptResult::ConfirmedNoEffect { .. }
            )
        {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "human executor cannot record confirmed outcomes".to_owned(),
            ));
        }
        if let Some(existing) = snapshot
            .attempts
            .iter()
            .find(|attempt| attempt.attempt_id == command.attempt_id)
        {
            let same = attempt_matches(existing, &command);
            let result = snapshot;
            transaction.rollback().await.map_err(EffectError::Store)?;
            return if same {
                Ok(result)
            } else {
                Err(EffectError::AttemptIdentityConflict)
            };
        }
        if !transaction
            .has_claim(&command.attempt_id)
            .await
            .map_err(EffectError::Store)?
        {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "attempt was not claimed by the effect worker".to_owned(),
            ));
        }
        let resulting_state = effect_state_after_attempt(snapshot.request.state, &command.result);
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
        self.require_reconciler(context)?;
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
        if command.idempotency_key != snapshot.request.idempotency_key {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::InvalidEvidence(
                "evidence idempotency key does not match the request".to_owned(),
            ));
        }
        let resulting_state = effect_state_after_evidence(snapshot.request.state, command.outcome);
        transaction
            .commit_reconciliation(&command, resulting_state)
            .await
            .map_err(EffectError::Store)
    }

    fn require_attempt_authority(
        &self,
        context: &ExecutionContext,
        request: &EffectRequest,
    ) -> Result<(), EffectError> {
        if is_human_task_payload(&request.payload) {
            if self
                .allowed_executor_workloads
                .contains(context.workload_id())
            {
                Ok(())
            } else {
                Err(EffectError::ForbiddenWorkload)
            }
        } else if context.workload_id() == &self.worker_workload_id {
            Ok(())
        } else {
            Err(EffectError::ForbiddenWorkload)
        }
    }

    fn require_reconciler(&self, context: &ExecutionContext) -> Result<(), EffectError> {
        if context.workload_id() == &self.reconciler_workload_id {
            Ok(())
        } else {
            Err(EffectError::ForbiddenWorkload)
        }
    }
}

fn is_human_executor_workload<S>(engine: &EffectEngine<S>, context: &ExecutionContext) -> bool {
    engine
        .allowed_executor_workloads
        .contains(context.workload_id())
}

fn refuse_expired_human_task(
    request: &EffectRequest,
    now: TimestampMicros,
) -> Result<(), EffectError> {
    let contract = parse_human_task_contract(&request.payload)
        .map_err(|error| EffectError::InvalidEvidence(error.to_string()))?;
    if now.get() > contract.expiry.get() {
        return Err(EffectError::InvalidEvidence(
            HumanTaskError::Expired.to_string(),
        ));
    }
    Ok(())
}

fn now_micros() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| i64::try_from(duration.as_micros()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

pub fn effect_state_after_attempt(
    current: EffectKnowledgeState,
    result: &EffectAttemptResult,
) -> EffectKnowledgeState {
    let observed = match result {
        EffectAttemptResult::DefinitelyNotSent { .. } => EffectKnowledgeState::DefinitelyNotSent,
        EffectAttemptResult::Unknown { .. } => EffectKnowledgeState::Unknown,
        EffectAttemptResult::AcceptedPending { .. } => EffectKnowledgeState::AcceptedPending,
        EffectAttemptResult::Confirmed { .. } => EffectKnowledgeState::Confirmed,
        EffectAttemptResult::ConfirmedNoEffect { .. } => EffectKnowledgeState::ConfirmedNoEffect,
    };
    match (current, observed) {
        (EffectKnowledgeState::Contradicted, _) => EffectKnowledgeState::Contradicted,
        (EffectKnowledgeState::Confirmed, EffectKnowledgeState::ConfirmedNoEffect)
        | (EffectKnowledgeState::Confirmed, EffectKnowledgeState::DefinitelyNotSent)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::Confirmed) => {
            EffectKnowledgeState::Contradicted
        }
        (EffectKnowledgeState::Confirmed, _)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::AcceptedPending)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::DefinitelyNotSent)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::ConfirmedNoEffect)
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::Unknown) => current,
        _ => observed,
    }
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
    existing.observed_at == command.observed_at && existing.result == command.result
}

fn evidence_matches(existing: &EffectEvidence, command: &EffectReconcileCommand) -> bool {
    existing.digest == command.digest
        && evidence_semantics_match(existing, command)
        && existing.observed_at == command.observed_at
        && existing.source_id == command.source_id
        && existing.source_ref == command.source_ref
}

fn evidence_semantics_match(existing: &EffectEvidence, command: &EffectReconcileCommand) -> bool {
    existing.idempotency_key == command.idempotency_key
        && existing.outcome == command.outcome
        && existing.provider_operation_id == command.provider_operation_id
}

fn mint_attempt_id(
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
    adapter_execution_id: &str,
) -> Result<EffectAttemptId, EffectError> {
    let digest = Sha256::digest(
        format!(
            "{}\0{}\0{}",
            context.tenant_id().as_str(),
            effect_request_id.as_str(),
            adapter_execution_id
        )
        .as_bytes(),
    );
    EffectAttemptId::parse(format!("attempt.{}", hex_digest(&digest)))
        .map_err(|error| EffectError::InvalidEvidence(error.to_string()))
}

fn hex_digest(digest: &[u8]) -> String {
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
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

    use super::{effect_state_after_attempt, effect_state_after_evidence};

    #[test]
    fn ambiguous_attempt_stays_unknown() {
        let result = EffectAttemptResult::Unknown {
            provider_operation_id: None,
            reason: UnknownEffectReason::TimeoutAfterPossibleDelivery,
            response_digest: None,
        };
        assert_eq!(
            effect_state_after_attempt(EffectKnowledgeState::NotAttempted, &result),
            EffectKnowledgeState::Unknown
        );
    }

    #[test]
    fn claimed_attempt_is_folded_after_independent_evidence() {
        let result = EffectAttemptResult::DefinitelyNotSent {
            reason: zoen_core::DefinitelyNotSentReason::TimeoutBeforeSend,
        };
        assert_eq!(
            effect_state_after_attempt(EffectKnowledgeState::Confirmed, &result),
            EffectKnowledgeState::Contradicted
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
