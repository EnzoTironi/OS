use crate::{
    CommitSequence, EffectAttemptId, EffectEvidenceDigest, EffectEvidenceId, EffectIdempotencyKey,
    EffectRequestDigest, EffectRequestId, EffectResponseDigest, IntentDigest, OperationId,
    ProviderOperationId, SourceId, TimestampMicros,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EffectKnowledgeState {
    NotAttempted,
    DefinitelyNotSent,
    Unknown,
    AcceptedPending,
    Confirmed,
    ConfirmedNoEffect,
    Contradicted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DefinitelyNotSentReason {
    CredentialRevoked,
    TimeoutBeforeSend,
    /// Pre-send validation (for example digest pinning) refused delivery; the
    /// provider operation id and response digest carry the rejection evidence.
    ValidationFailed {
        provider_operation_id: ProviderOperationId,
        response_digest: EffectResponseDigest,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnknownEffectReason {
    ProviderUnavailable,
    ResponseParseError,
    ResponseSchemaError,
    TimeoutAfterPossibleDelivery,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EffectAttemptResult {
    DefinitelyNotSent {
        reason: DefinitelyNotSentReason,
    },
    Unknown {
        provider_operation_id: Option<ProviderOperationId>,
        reason: UnknownEffectReason,
        response_digest: Option<EffectResponseDigest>,
    },
    AcceptedPending {
        provider_operation_id: ProviderOperationId,
        response_digest: EffectResponseDigest,
    },
    Confirmed {
        provider_operation_id: ProviderOperationId,
        response_digest: EffectResponseDigest,
    },
    ConfirmedNoEffect {
        provider_operation_id: ProviderOperationId,
        response_digest: EffectResponseDigest,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectRequestIdentity {
    pub effect_request_id: EffectRequestId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectRequest {
    pub commit_sequence: CommitSequence,
    pub identity: EffectRequestIdentity,
    pub idempotency_key: EffectIdempotencyKey,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub payload: Vec<u8>,
    pub request_digest: EffectRequestDigest,
    pub state: EffectKnowledgeState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectAttempt {
    pub attempt_id: EffectAttemptId,
    pub commit_sequence: CommitSequence,
    pub observed_at: TimestampMicros,
    pub request_digest: EffectRequestDigest,
    pub result: EffectAttemptResult,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EffectEvidenceOutcome {
    Confirmed,
    NoEffect,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectEvidence {
    pub commit_sequence: CommitSequence,
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
pub struct EffectReconciliation {
    pub commit_sequence: CommitSequence,
    pub evidence_id: EffectEvidenceId,
    pub previous_state: EffectKnowledgeState,
    pub resulting_state: EffectKnowledgeState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectSnapshot {
    pub attempts: Vec<EffectAttempt>,
    pub evidence: Vec<EffectEvidence>,
    pub reconciliations: Vec<EffectReconciliation>,
    pub request: EffectRequest,
}
