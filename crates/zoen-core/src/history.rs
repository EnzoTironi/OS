use crate::{
    ActionApproval, ActionId, ClaimId, CommitReceipt, CommitSequence, ComponentExecutionEvidence,
    ComputationId, DefinitionReference, EffectAttempt, EffectAttemptId, EffectEvidence,
    EffectEvidenceId, EffectIdempotencyKey, EffectKnowledgeState, EffectReconciliation,
    EffectRequestDigest, EffectRequestId, EntityId, EvidenceProvenance, ExactValue, InputId,
    IntentDigest, MigrationOrigin, OperationId, PayloadDigest, PolicyRevision, ProposalAuthority,
    ProposalId, RelationId, ResourceId, StateBasis, StateBasisDigest, TimestampMicros,
    TrustedExecutionContext, ValidTime,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecisionReference {
    Proposal(ProposalId),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExplanationTarget {
    Operation(OperationId),
    Claim(ClaimId),
    EffectRequest(EffectRequestId),
    Decision(DecisionReference),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateBasisStage {
    Proposal,
    Commit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PolicyDecisionStage {
    Proposal,
    Approval,
    Commit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RedactionReason {
    ProtectedPayload,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayloadRedaction {
    pub digest: PayloadDigest,
    pub reason: RedactionReason,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExplanationPayload<T> {
    Value(T),
    Redacted(PayloadRedaction),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EffectDispatchOutcome {
    Accepted,
    InvalidResponse,
    Rejected,
    SchedulerUnavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectDispatchEvidence {
    pub attempt_number: u32,
    pub error: Option<String>,
    pub outcome: EffectDispatchOutcome,
    pub scheduler_invocation_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalActionInput {
    pub id: InputId,
    pub payload: ExplanationPayload<ExactValue>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionProposalStructure {
    pub action_id: ActionId,
    pub authority: ProposalAuthority,
    pub definition: DefinitionReference,
    pub execution: Option<ComponentExecutionEvidence>,
    pub expires_at: TimestampMicros,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub proposal_id: ProposalId,
    pub proposed_at: TimestampMicros,
    pub proposed_by: TrustedExecutionContext,
    pub resource_id: ResourceId,
    pub state_basis: StateBasis,
    pub valid_at: TimestampMicros,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalActionProposal {
    pub inputs: Vec<CausalActionInput>,
    pub structure: ActionProposalStructure,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalClaimStructure {
    pub claim_id: ClaimId,
    pub commit_sequence: CommitSequence,
    pub definition: DefinitionReference,
    pub entity_id: EntityId,
    pub provenance: EvidenceProvenance,
    pub relation_id: RelationId,
    pub valid_time: ValidTime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalClaim {
    pub payload: ExplanationPayload<ExactValue>,
    pub structure: CausalClaimStructure,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalStateBasis {
    pub basis: StateBasis,
    pub claims: Vec<CausalClaim>,
    pub stage: StateBasisStage,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionEvidence {
    pub action_id: Option<ActionId>,
    pub computation_ids: Vec<ComputationId>,
    pub digest_verified: bool,
    pub published_at: CommitSequence,
    pub reference: DefinitionReference,
    pub relation_ids: Vec<RelationId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyDecisionEvidence {
    pub policy: PolicyRevision,
    pub determining_policies: Vec<String>,
    pub stage: PolicyDecisionStage,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalEffectRequestStructure {
    pub commit_sequence: CommitSequence,
    pub effect_request_id: EffectRequestId,
    pub idempotency_key: EffectIdempotencyKey,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub request_digest: EffectRequestDigest,
    pub state: EffectKnowledgeState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalEffectRequest {
    pub payload: ExplanationPayload<Vec<u8>>,
    pub structure: CausalEffectRequestStructure,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalEffect {
    pub attempts: Vec<EffectAttempt>,
    pub dispatches: Vec<EffectDispatchEvidence>,
    pub evidence: Vec<EffectEvidence>,
    pub reconciliations: Vec<EffectReconciliation>,
    pub request: CausalEffectRequest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalCommit {
    pub receipt: CommitReceipt,
    pub records: Vec<CausalClaim>,
    pub state_basis: Option<CausalStateBasis>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalActionExplanation {
    pub approval: Option<ActionApproval>,
    pub commit: Option<CausalCommit>,
    pub definition: Option<DefinitionEvidence>,
    pub effects: Vec<CausalEffect>,
    pub policies: Vec<PolicyDecisionEvidence>,
    pub proposal: CausalActionProposal,
    pub proposal_state_basis: CausalStateBasis,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalMigration {
    pub origin: MigrationOrigin,
    pub source_claims: Vec<CausalClaim>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalClaimExplanation {
    pub claim: CausalClaim,
    pub definition: Option<DefinitionEvidence>,
    pub migration: Option<CausalMigration>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExplanationSubject {
    Action(Box<CausalActionExplanation>),
    Claim(Box<CausalClaimExplanation>),
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum EvidenceClass {
    Action,
    Approval,
    CommitSequence,
    CommitStateBasis,
    CommittedRecord,
    DefinitionRevision,
    Dependency,
    EffectAttempt,
    EffectDispatch,
    EffectEvidence,
    EffectReconciliation,
    EffectRequest,
    Intent,
    Operation,
    Payload,
    PolicyRevision,
    Proposal,
    ProposalStateBasis,
    TrustedContext,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GapReason {
    Corrupt,
    Missing,
    Redacted,
    Unavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CausalReference {
    Action(ActionId),
    Approval(crate::ApprovalId),
    Claim(ClaimId),
    Definition(DefinitionReference),
    EffectAttempt(EffectAttemptId),
    EffectEvidence(EffectEvidenceId),
    EffectRequest(EffectRequestId),
    Operation(OperationId),
    Policy(PolicyRevision),
    Proposal(ProposalId),
    StateBasis(StateBasisDigest),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExplanationGap {
    pub class: EvidenceClass,
    pub detail: String,
    pub reason: GapReason,
    pub reference: CausalReference,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalExplanation {
    pub complete: bool,
    pub gaps: Vec<ExplanationGap>,
    pub subject: ExplanationSubject,
    pub target: ExplanationTarget,
}
