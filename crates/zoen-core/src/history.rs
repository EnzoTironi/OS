use crate::{
    ActionApproval, ActionId, ActionProposal, ClaimId, CommitReceipt, CommitSequence,
    ComputationId, DefinitionReference, EffectAttemptId, EffectEvidenceId, EffectRequestId,
    EffectSnapshot, EvidenceClaim, OperationId, PayloadDigest, PolicyRevision, ProposalId,
    RelationId, StateBasis, StateBasisDigest,
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
pub enum ExplanationDisclosure {
    Full,
    RedactPayloads,
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
pub struct CausalClaim {
    pub claim: EvidenceClaim,
    pub value_redaction: Option<PayloadRedaction>,
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
pub struct CausalEffect {
    pub dispatches: Vec<EffectDispatchEvidence>,
    pub payload_redaction: Option<PayloadRedaction>,
    pub snapshot: EffectSnapshot,
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
    pub proposal: ActionProposal,
    pub proposal_state_basis: CausalStateBasis,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CausalClaimExplanation {
    pub claim: CausalClaim,
    pub definition: Option<DefinitionEvidence>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExplanationSubject {
    Action(Box<CausalActionExplanation>),
    Claim(CausalClaimExplanation),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
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
