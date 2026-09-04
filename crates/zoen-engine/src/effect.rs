use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter},
};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, CommitSequence, EffectAttempt, EffectAttemptId, EffectAttemptResult, EffectEvidence,
    EffectEvidenceDigest, EffectEvidenceId, EffectEvidenceOutcome, EffectIdempotencyKey,
    EffectKnowledgeState, EffectRequest, EffectRequestId, EffectSnapshot, ExecutionContext,
    HumanTaskError, IdentifierError, ProviderOperationId, ResourceId, SourceId, TimestampMicros,
    WorkloadId,
};

use crate::{
    AuthorityStore, StoreError,
    human::{is_human_task_payload, parse_human_task_contract},
};

const EFFECT_EXECUTE_ACTION: &str = "zoen.effect.execute";
const EFFECT_RECONCILE_ACTION: &str = "zoen.effect.reconcile";
const EFFECT_REQUESTS_RESOURCE: &str = "zoen.effect.requests";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptCommand {
    pub attempt_id: EffectAttemptId,
    pub observed_at: TimestampMicros,
    pub result: EffectAttemptResult,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttemptClaimCommand {
    pub adapter_execution_id: String,
    pub expected_knowledge_commit_sequence: CommitSequence,
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
    DispatchVersionMismatch,
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
            Self::DispatchVersionMismatch => {
                formatter.write_str("effect dispatch version does not match current knowledge")
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
            | Self::DispatchVersionMismatch
            | Self::EvidenceIdentityConflict
            | Self::ForbiddenWorkload
            | Self::InvalidEvidence(_)
            | Self::UnsafeRetry(_) => None,
        }
    }
}

fn latest_knowledge_commit_sequence(snapshot: &EffectSnapshot) -> CommitSequence {
    let mut latest = snapshot.request.commit_sequence;
    for attempt in &snapshot.attempts {
        latest = latest.max(attempt.commit_sequence);
    }
    for evidence in &snapshot.evidence {
        latest = latest.max(evidence.commit_sequence);
    }
    for reconciliation in &snapshot.reconciliations {
        latest = latest.max(reconciliation.commit_sequence);
    }
    latest
}

pub trait EffectUpdateTransaction: Send {
    fn snapshot(&self) -> &EffectSnapshot;

    fn claimed_attempt(
        &mut self,
        adapter_execution_id: &str,
    ) -> impl std::future::Future<Output = Result<Option<EffectAttemptId>, StoreError>> + Send;

    fn open_claim(
        &mut self,
    ) -> impl std::future::Future<Output = Result<Option<(String, EffectAttemptId)>, StoreError>> + Send;

    fn commit_claim(
        self,
        adapter_execution_id: &str,
        attempt_id: &EffectAttemptId,
    ) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;

    fn has_claim(
        &mut self,
        attempt_id: &EffectAttemptId,
    ) -> impl std::future::Future<Output = Result<bool, StoreError>> + Send;

    fn commit_attempt(
        self,
        command: &EffectAttemptCommand,
        resulting_state: EffectKnowledgeState,
    ) -> impl std::future::Future<Output = Result<EffectSnapshot, StoreError>> + Send;

    fn commit_reconciliation(
        self,
        command: &EffectReconcileCommand,
        resulting_state: EffectKnowledgeState,
    ) -> impl std::future::Future<Output = Result<EffectSnapshot, StoreError>> + Send;

    fn rollback(self) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;
}

pub struct EffectEngine<S> {
    allowed_executor_workloads: BTreeSet<WorkloadId>,
    execute_action_id: ActionId,
    reconciler_workload_id: WorkloadId,
    reconcile_action_id: ActionId,
    requests_resource_id: ResourceId,
    store: S,
    worker_workload_id: WorkloadId,
}

impl<S> EffectEngine<S>
where
    S: AuthorityStore,
{
    /// Build an effect engine with the canonical execution and reconciliation scopes.
    ///
    /// # Errors
    ///
    /// Returns [`IdentifierError`] if a built-in effect Action or resource id is invalid.
    pub fn new(
        store: S,
        worker_workload_id: WorkloadId,
        reconciler_workload_id: WorkloadId,
    ) -> Result<Self, IdentifierError> {
        Ok(Self {
            allowed_executor_workloads: BTreeSet::new(),
            execute_action_id: ActionId::parse(EFFECT_EXECUTE_ACTION)?,
            reconciler_workload_id,
            reconcile_action_id: ActionId::parse(EFFECT_RECONCILE_ACTION)?,
            requests_resource_id: ResourceId::parse(EFFECT_REQUESTS_RESOURCE)?,
            store,
            worker_workload_id,
        })
    }

    #[must_use]
    pub fn with_allowed_executor_workloads(
        mut self,
        allowed_executor_workloads: BTreeSet<WorkloadId>,
    ) -> Self {
        self.allowed_executor_workloads = allowed_executor_workloads;
        self
    }

    /// Load the durable effect snapshot.
    ///
    /// # Errors
    ///
    /// Returns [`EffectError::Store`] when the authority store cannot load the effect.
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

    /// Claim an attempt identity for a worker or human executor.
    ///
    /// # Errors
    ///
    /// Returns [`EffectError`] when evidence is invalid, the workload is forbidden, retry is
    /// unsafe, attempt identity collides, or the store fails.
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
        self.require_execution_grant(context, TimestampMicros::new(now_micros()))?;
        let mut transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let request = transaction.snapshot().request.clone();
        if latest_knowledge_commit_sequence(transaction.snapshot())
            != command.expected_knowledge_commit_sequence
        {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::DispatchVersionMismatch);
        }
        let now = TimestampMicros::new(now_micros());
        if let Err(error) = self.require_attempt_authority(context, &request, now) {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(error);
        }
        if is_human_task_payload(&request.payload) {
            refuse_expired_human_task(&request, now)?;
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
        if is_human_task_payload(&request.payload)
            && let Some((existing_adapter, _)) =
                transaction.open_claim().await.map_err(EffectError::Store)?
            && existing_adapter != command.adapter_execution_id
        {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(EffectError::AttemptIdentityConflict);
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

    /// Record a claimed attempt outcome.
    ///
    /// # Errors
    ///
    /// Returns [`EffectError`] when the workload is forbidden, the attempt was not claimed,
    /// identity collides, or the store fails.
    pub async fn record_attempt(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectAttemptCommand,
    ) -> Result<EffectSnapshot, EffectError> {
        self.require_execution_grant(context, TimestampMicros::new(now_micros()))?;
        let mut transaction = self
            .store
            .begin_effect_update(context, effect_request_id)
            .await
            .map_err(EffectError::Store)?;
        let snapshot = transaction.snapshot().clone();
        if let Err(error) = self.require_attempt_authority(
            context,
            &snapshot.request,
            TimestampMicros::new(now_micros()),
        ) {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(error);
        }
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

    /// Record independent reconciliation evidence for an effect.
    ///
    /// # Errors
    ///
    /// Returns [`EffectError`] when the caller is not the reconciler, evidence is invalid,
    /// identity collides, or the store fails.
    pub async fn reconcile(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
        command: EffectReconcileCommand,
    ) -> Result<EffectSnapshot, EffectError> {
        self.require_reconciler(context, TimestampMicros::new(now_micros()))?;
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
        if let Err(error) = self.require_reconciler(context, TimestampMicros::new(now_micros())) {
            transaction.rollback().await.map_err(EffectError::Store)?;
            return Err(error);
        }
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
        at: TimestampMicros,
    ) -> Result<(), EffectError> {
        let role_allows = if is_human_task_payload(&request.payload) {
            self.allowed_executor_workloads
                .contains(context.workload_id())
        } else {
            context.workload_id() == &self.worker_workload_id
        };
        if role_allows {
            self.require_execution_grant(context, at)
        } else {
            Err(EffectError::ForbiddenWorkload)
        }
    }

    fn require_execution_grant(
        &self,
        context: &ExecutionContext,
        at: TimestampMicros,
    ) -> Result<(), EffectError> {
        if context.delegation().permits(
            &self.execute_action_id,
            &self.requests_resource_id,
            context.workload_id(),
            at,
        ) {
            Ok(())
        } else {
            Err(EffectError::ForbiddenWorkload)
        }
    }

    fn require_reconciler(
        &self,
        context: &ExecutionContext,
        at: TimestampMicros,
    ) -> Result<(), EffectError> {
        if context.workload_id() == &self.reconciler_workload_id
            && context.delegation().permits(
                &self.reconcile_action_id,
                &self.requests_resource_id,
                context.workload_id(),
                at,
            )
        {
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
        .map_or(0, |duration| {
            i64::try_from(duration.as_micros()).unwrap_or(i64::MAX)
        })
}

#[must_use]
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
        (
            EffectKnowledgeState::Confirmed,
            EffectKnowledgeState::ConfirmedNoEffect | EffectKnowledgeState::DefinitelyNotSent,
        )
        | (EffectKnowledgeState::ConfirmedNoEffect, EffectKnowledgeState::Confirmed) => {
            EffectKnowledgeState::Contradicted
        }
        (EffectKnowledgeState::Confirmed, _)
        | (
            EffectKnowledgeState::ConfirmedNoEffect,
            EffectKnowledgeState::AcceptedPending
            | EffectKnowledgeState::DefinitelyNotSent
            | EffectKnowledgeState::ConfirmedNoEffect
            | EffectKnowledgeState::Unknown,
        ) => current,
        _ => observed,
    }
}

#[must_use]
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
            context.world_id().as_str(),
            effect_request_id.as_str(),
            adapter_execution_id
        )
        .as_bytes(),
    );
    EffectAttemptId::parse(format!("attempt.{}", zoen_core::encode_hex(&digest)))
        .map_err(|error| EffectError::InvalidEvidence(error.to_string()))
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
