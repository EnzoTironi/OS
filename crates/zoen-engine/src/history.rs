use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionId, ActionProposal, ActionProposalStructure, CausalActionExplanation,
    CausalActionInput, CausalActionProposal, CausalClaim, CausalClaimExplanation,
    CausalClaimStructure, CausalCommit, CausalEffect, CausalEffectRequest,
    CausalEffectRequestStructure, CausalExplanation, CausalMigration, CausalReference,
    CausalStateBasis, CommitReceipt, DecisionReference, DefinitionEvidence, DefinitionReference,
    DefinitionRevision, EffectDispatchEvidence, EffectKnowledgeState, EffectSnapshot,
    EvidenceClaim, EvidenceClass, ExactValue, ExplanationGap, ExplanationPayload,
    ExplanationSubject, ExplanationTarget, GapReason, LineageRole, MigrationOrigin, PayloadDigest,
    PayloadRedaction, PolicyDecisionEvidence, PolicyDecisionStage, ProposalAuthority,
    RedactionReason, StateBasisStage, StateDependency, TrustedExecutionContext,
    expression_relations,
};

use crate::{AuthorityStore, StoreError, decode_canonical_definition, state_basis_digest_matches};

const DECISION_REQUIRED_CLASSES: &[EvidenceClass] = &[
    EvidenceClass::Action,
    EvidenceClass::DefinitionRevision,
    EvidenceClass::Dependency,
    EvidenceClass::Payload,
    EvidenceClass::PolicyRevision,
    EvidenceClass::Proposal,
    EvidenceClass::ProposalStateBasis,
    EvidenceClass::TrustedContext,
];

const OPERATION_REQUIRED_CLASSES: &[EvidenceClass] = &[
    EvidenceClass::Action,
    EvidenceClass::CommitSequence,
    EvidenceClass::CommitStateBasis,
    EvidenceClass::CommittedRecord,
    EvidenceClass::DefinitionRevision,
    EvidenceClass::Dependency,
    EvidenceClass::EffectAttempt,
    EvidenceClass::EffectDispatch,
    EvidenceClass::EffectRequest,
    EvidenceClass::Operation,
    EvidenceClass::Payload,
    EvidenceClass::PolicyRevision,
    EvidenceClass::Proposal,
    EvidenceClass::ProposalStateBasis,
    EvidenceClass::TrustedContext,
];

const ACTION_CLAIM_REQUIRED_CLASSES: &[EvidenceClass] = &[
    EvidenceClass::Action,
    EvidenceClass::CommitSequence,
    EvidenceClass::CommitStateBasis,
    EvidenceClass::CommittedRecord,
    EvidenceClass::DefinitionRevision,
    EvidenceClass::Dependency,
    EvidenceClass::EffectAttempt,
    EvidenceClass::EffectDispatch,
    EvidenceClass::EffectRequest,
    EvidenceClass::Operation,
    EvidenceClass::Payload,
    EvidenceClass::PolicyRevision,
    EvidenceClass::Proposal,
    EvidenceClass::ProposalStateBasis,
    EvidenceClass::TrustedContext,
];

const EFFECT_REQUEST_REQUIRED_CLASSES: &[EvidenceClass] = &[
    EvidenceClass::Action,
    EvidenceClass::CommitSequence,
    EvidenceClass::CommitStateBasis,
    EvidenceClass::CommittedRecord,
    EvidenceClass::DefinitionRevision,
    EvidenceClass::Dependency,
    EvidenceClass::EffectAttempt,
    EvidenceClass::EffectDispatch,
    EvidenceClass::EffectRequest,
    EvidenceClass::Operation,
    EvidenceClass::Payload,
    EvidenceClass::PolicyRevision,
    EvidenceClass::Proposal,
    EvidenceClass::ProposalStateBasis,
    EvidenceClass::TrustedContext,
];

const WORLD_CLAIM_REQUIRED_CLASSES: &[EvidenceClass] = &[
    EvidenceClass::CommitSequence,
    EvidenceClass::CommittedRecord,
    EvidenceClass::DefinitionRevision,
    EvidenceClass::Payload,
];

#[derive(Clone, Copy)]
enum PayloadAccess {
    Full,
    Redacted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectHistorySnapshot {
    pub dispatches: Vec<EffectDispatchEvidence>,
    pub snapshot: EffectSnapshot,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionHistorySnapshot {
    pub approval: Option<ActionApproval>,
    pub commit: Option<CommitReceipt>,
    pub commit_claims: Vec<EvidenceClaim>,
    pub definition: Option<DefinitionRevision>,
    pub effects: Vec<EffectHistorySnapshot>,
    pub proposal: ActionProposal,
    pub proposal_claims: Vec<EvidenceClaim>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationHistorySnapshot {
    pub origin: MigrationOrigin,
    pub source_claims: Vec<EvidenceClaim>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimHistorySnapshot {
    pub claim: EvidenceClaim,
    pub definition: Option<DefinitionRevision>,
    pub migration: Option<MigrationHistorySnapshot>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HistorySnapshot {
    Action(Box<ActionHistorySnapshot>),
    Claim(Box<ClaimHistorySnapshot>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HistoryError {
    Store(StoreError),
}

impl Display for HistoryError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for HistoryError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
        }
    }
}

pub struct HistoryEngine<S> {
    store: S,
}

impl<S> HistoryEngine<S>
where
    S: AuthorityStore,
{
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub async fn explain(
        &self,
        context: &TrustedExecutionContext,
        target: ExplanationTarget,
    ) -> Result<CausalExplanation, HistoryError> {
        let snapshot = self
            .store
            .load_history(context, &target)
            .await
            .map_err(HistoryError::Store)?;
        ensure_snapshot_tenant(context, &snapshot).map_err(HistoryError::Store)?;
        let access = payload_access(context, &snapshot);
        let mut gaps = Vec::new();
        let subject = match snapshot {
            HistorySnapshot::Action(snapshot) => ExplanationSubject::Action(Box::new(
                explain_action(&target, *snapshot, access, &mut gaps),
            )),
            HistorySnapshot::Claim(snapshot) => {
                ExplanationSubject::Claim(Box::new(explain_claim(*snapshot, access, &mut gaps)))
            }
        };
        let complete = explanation_complete(&target, &subject, &gaps);
        Ok(CausalExplanation {
            complete,
            gaps,
            subject,
            target,
        })
    }
}

fn explain_action(
    target: &ExplanationTarget,
    snapshot: ActionHistorySnapshot,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalActionExplanation {
    let proposal_reference = CausalReference::Proposal(snapshot.proposal.proposal_id.clone());
    verify_target(target, &snapshot, gaps);

    let mut dependencies = snapshot.proposal.state_basis.dependencies.clone();
    if let Some(commit_basis) = snapshot
        .commit
        .as_ref()
        .and_then(|receipt| receipt.commit_state_basis.as_ref())
    {
        dependencies.extend(commit_basis.dependencies.iter().cloned());
    }
    let definition = definition_evidence(
        snapshot.definition,
        Some(&snapshot.proposal.action_id),
        &snapshot.proposal.definition,
        &dependencies,
        gaps,
    );
    let proposal_state_basis = state_basis(
        snapshot.proposal.state_basis.clone(),
        snapshot.proposal_claims,
        StateBasisStage::Proposal,
        access,
        gaps,
    );

    let proposal_policy = policy_evidence(
        proposal_policy(&snapshot.proposal),
        PolicyDecisionStage::Proposal,
    );
    verify_policy(&proposal_policy, gaps);
    let mut policies = vec![proposal_policy];

    if matches!(
        snapshot.proposal.authority,
        ProposalAuthority::AwaitingApproval(_)
    ) && snapshot.approval.is_none()
    {
        gaps.push(gap(
            EvidenceClass::Approval,
            GapReason::Missing,
            proposal_reference.clone(),
            "the proposal requires an approval, but no durable approval exists",
        ));
    }

    if let Some(approval) = &snapshot.approval {
        let approval_policy = policy_evidence(&approval.policy, PolicyDecisionStage::Approval);
        verify_policy(&approval_policy, gaps);
        policies.push(approval_policy);
    }

    let commit = snapshot.commit.map(|receipt| {
        let commit_policy = policy_evidence(&receipt.policy, PolicyDecisionStage::Commit);
        verify_policy(&commit_policy, gaps);
        policies.push(commit_policy);
        commit_evidence(receipt, snapshot.commit_claims, access, gaps)
    });

    if requires_commit(target) && commit.is_none() {
        gaps.push(gap(
            EvidenceClass::Operation,
            GapReason::Missing,
            proposal_reference,
            "the explanation target requires a committed operation",
        ));
    }

    let effects = snapshot
        .effects
        .into_iter()
        .map(|effect| effect_evidence(effect, access, gaps))
        .collect::<Vec<_>>();
    if let Some(commit) = &commit {
        for effect_request_id in &commit.receipt.effect_request_ids {
            if !effects
                .iter()
                .any(|effect| effect.request.structure.effect_request_id == *effect_request_id)
            {
                gaps.push(gap(
                    EvidenceClass::EffectRequest,
                    GapReason::Missing,
                    CausalReference::EffectRequest(effect_request_id.clone()),
                    "the operation references an EffectRequest that is unavailable",
                ));
            }
        }
    }

    CausalActionExplanation {
        approval: snapshot.approval,
        commit,
        definition,
        effects,
        policies,
        proposal: causal_proposal(snapshot.proposal, access, gaps),
        proposal_state_basis,
    }
}

fn explain_claim(
    snapshot: ClaimHistorySnapshot,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalClaimExplanation {
    let reference = snapshot.claim.draft.definition.clone();
    let relation = snapshot.claim.draft.relation_id.clone();
    let definition = definition_evidence(snapshot.definition, None, &reference, &[], gaps).map(
        |mut evidence| {
            evidence.relation_ids = vec![relation];
            evidence
        },
    );
    let migration = snapshot.migration.map(|migration| CausalMigration {
        origin: migration.origin,
        source_claims: migration
            .source_claims
            .into_iter()
            .map(|claim| causal_claim(claim, access, gaps))
            .collect(),
    });
    CausalClaimExplanation {
        claim: causal_claim(snapshot.claim, access, gaps),
        definition,
        migration,
    }
}

fn definition_evidence(
    revision: Option<DefinitionRevision>,
    action_id: Option<&ActionId>,
    expected: &DefinitionReference,
    dependencies: &[StateDependency],
    gaps: &mut Vec<ExplanationGap>,
) -> Option<DefinitionEvidence> {
    let Some(revision) = revision else {
        gaps.push(gap(
            EvidenceClass::DefinitionRevision,
            GapReason::Missing,
            CausalReference::Definition(expected.clone()),
            "the pinned definition revision is unavailable",
        ));
        return None;
    };
    let reference = DefinitionReference {
        definition_id: revision.definition_id.clone(),
        digest: revision.digest.clone(),
        revision: revision.revision,
    };
    let digest_verified =
        hex_digest(Sha256::digest(revision.canonical_json.as_bytes())) == revision.digest.as_str();
    if reference != *expected || !digest_verified {
        gaps.push(gap(
            EvidenceClass::DefinitionRevision,
            GapReason::Corrupt,
            CausalReference::Definition(expected.clone()),
            "the stored definition identity or content digest does not match the historical reference",
        ));
    }
    let decoded = match decode_canonical_definition(&revision.canonical_json) {
        Ok(decoded) => Some(decoded),
        Err(error) => {
            gaps.push(gap(
                EvidenceClass::DefinitionRevision,
                GapReason::Corrupt,
                CausalReference::Definition(expected.clone()),
                format!("the stored definition cannot be decoded: {error}"),
            ));
            None
        }
    };
    let mut relation_ids = dependencies
        .iter()
        .map(|dependency| dependency.relation_id.clone())
        .collect::<Vec<_>>();
    relation_ids.sort();
    relation_ids.dedup();
    let mut computation_ids = Vec::new();
    if let Some(decoded) = decoded {
        if let Some(action_id) = action_id {
            if !decoded.actions.iter().any(|action| action.id == *action_id) {
                gaps.push(gap(
                    EvidenceClass::Action,
                    GapReason::Corrupt,
                    CausalReference::Action(action_id.clone()),
                    "the pinned definition revision does not contain the historical Action",
                ));
            }
        }
        let computation_relations = dependencies
            .iter()
            .filter(|dependency| dependency.role == LineageRole::ComputationDependency)
            .map(|dependency| dependency.relation_id.clone())
            .collect::<BTreeSet<_>>();
        if !computation_relations.is_empty() {
            computation_ids = decoded
                .computations
                .iter()
                .filter(|computation| {
                    let required = expression_relations(&computation.expression);
                    !required.is_empty()
                        && required
                            .iter()
                            .all(|relation| computation_relations.contains(relation))
                })
                .map(|computation| computation.id.clone())
                .collect();
        }
    }
    Some(DefinitionEvidence {
        action_id: action_id.cloned(),
        computation_ids,
        digest_verified,
        published_at: revision.commit_sequence,
        reference,
        relation_ids,
    })
}

fn state_basis(
    basis: zoen_core::StateBasis,
    claims: Vec<EvidenceClaim>,
    stage: StateBasisStage,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalStateBasis {
    let reference = CausalReference::StateBasis(basis.digest.clone());
    match state_basis_digest_matches(&basis.dependencies, &basis.digest) {
        Ok(true) => {}
        Ok(false) | Err(_) => gaps.push(gap(
            match stage {
                StateBasisStage::Proposal => EvidenceClass::ProposalStateBasis,
                StateBasisStage::Commit => EvidenceClass::CommitStateBasis,
            },
            GapReason::Corrupt,
            reference.clone(),
            "the StateBasis digest does not match its durable dependencies",
        )),
    }
    for dependency in &basis.dependencies {
        match claims
            .iter()
            .find(|claim| claim.draft.claim_id == dependency.claim_id)
        {
            Some(claim) if dependency_matches_claim(dependency, claim) => {}
            Some(_) => gaps.push(gap(
                EvidenceClass::Dependency,
                GapReason::Corrupt,
                CausalReference::Claim(dependency.claim_id.clone()),
                "the dependency reference does not match the durable claim",
            )),
            None => gaps.push(gap(
                EvidenceClass::Dependency,
                GapReason::Missing,
                CausalReference::Claim(dependency.claim_id.clone()),
                "the StateBasis dependency claim is unavailable",
            )),
        }
    }
    let claims = claims
        .into_iter()
        .map(|claim| causal_claim(claim, access, gaps))
        .collect();
    CausalStateBasis {
        basis,
        claims,
        stage,
    }
}

fn commit_evidence(
    receipt: CommitReceipt,
    claims: Vec<EvidenceClaim>,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalCommit {
    let operation_reference = CausalReference::Operation(receipt.operation_id.clone());
    let state_basis = receipt.commit_state_basis.clone().map(|basis| {
        state_basis(
            basis,
            claims_for_dependencies(&claims, receipt.commit_state_basis.as_ref()),
            StateBasisStage::Commit,
            access,
            gaps,
        )
    });
    if state_basis.is_none() {
        gaps.push(gap(
            EvidenceClass::CommitStateBasis,
            GapReason::Missing,
            operation_reference,
            "the operation has no durable commit-time revalidation basis",
        ));
    }
    for claim_id in &receipt.record_ids {
        if !claims.iter().any(|claim| claim.draft.claim_id == *claim_id) {
            gaps.push(gap(
                EvidenceClass::CommittedRecord,
                GapReason::Missing,
                CausalReference::Claim(claim_id.clone()),
                "the operation references a committed semantic record that is unavailable",
            ));
        }
    }
    let records = claims
        .into_iter()
        .filter(|claim| receipt.record_ids.contains(&claim.draft.claim_id))
        .map(|claim| causal_claim(claim, access, gaps))
        .collect();
    CausalCommit {
        receipt,
        records,
        state_basis,
    }
}

fn effect_evidence(
    snapshot: EffectHistorySnapshot,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalEffect {
    let EffectHistorySnapshot {
        dispatches,
        snapshot,
    } = snapshot;
    let EffectSnapshot {
        attempts,
        evidence,
        reconciliations,
        request,
    } = snapshot;
    let reference = CausalReference::EffectRequest(request.effect_request_id.clone());
    let actual_digest_bytes: [u8; 32] = Sha256::digest(&request.payload).into();
    let actual_digest = hex_digest(actual_digest_bytes);
    if actual_digest != request.request_digest.as_str() {
        gaps.push(gap(
            EvidenceClass::EffectRequest,
            GapReason::Corrupt,
            reference.clone(),
            "the EffectRequest payload does not match its durable digest",
        ));
    }
    if dispatches.is_empty() {
        gaps.push(gap(
            EvidenceClass::EffectDispatch,
            GapReason::Missing,
            reference.clone(),
            "the EffectRequest has no durable scheduler dispatch evidence",
        ));
    }
    for attempt in &attempts {
        if attempt.request_digest != request.request_digest {
            gaps.push(gap(
                EvidenceClass::EffectAttempt,
                GapReason::Corrupt,
                CausalReference::EffectAttempt(attempt.attempt_id.clone()),
                "the connector attempt references a different EffectRequest digest",
            ));
        }
    }
    if !matches!(request.state, EffectKnowledgeState::NotAttempted) && attempts.is_empty() {
        gaps.push(gap(
            EvidenceClass::EffectAttempt,
            GapReason::Missing,
            reference.clone(),
            "the effect knowledge state requires connector attempt evidence",
        ));
    }
    for item in &evidence {
        if item.idempotency_key != request.idempotency_key {
            gaps.push(gap(
                EvidenceClass::EffectEvidence,
                GapReason::Corrupt,
                CausalReference::EffectEvidence(item.evidence_id.clone()),
                "the reconciliation evidence references a different idempotency key",
            ));
        }
        if !reconciliations
            .iter()
            .any(|reconciliation| reconciliation.evidence_id == item.evidence_id)
        {
            gaps.push(gap(
                EvidenceClass::EffectReconciliation,
                GapReason::Missing,
                CausalReference::EffectEvidence(item.evidence_id.clone()),
                "effect evidence has no durable reconciliation record",
            ));
        }
    }
    let payload = match access {
        PayloadAccess::Full => ExplanationPayload::Value(request.payload),
        PayloadAccess::Redacted => {
            let redaction = PayloadRedaction {
                digest: PayloadDigest::from_sha256(actual_digest_bytes),
                reason: RedactionReason::ProtectedPayload,
            };
            gaps.push(gap(
                EvidenceClass::Payload,
                GapReason::Redacted,
                reference,
                "the EffectRequest payload is protected",
            ));
            ExplanationPayload::Redacted(redaction)
        }
    };
    CausalEffect {
        attempts,
        dispatches,
        evidence,
        reconciliations,
        request: CausalEffectRequest {
            payload,
            structure: CausalEffectRequestStructure {
                commit_sequence: request.commit_sequence,
                effect_request_id: request.effect_request_id,
                idempotency_key: request.idempotency_key,
                intent_digest: request.intent_digest,
                operation_id: request.operation_id,
                request_digest: request.request_digest,
                state: request.state,
            },
        },
    }
}

fn causal_claim(
    claim: EvidenceClaim,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalClaim {
    let commit_sequence = claim.commit_sequence;
    let draft = claim.draft;
    let payload = match access {
        PayloadAccess::Full => ExplanationPayload::Value(draft.value),
        PayloadAccess::Redacted => {
            let redaction = PayloadRedaction {
                digest: payload_digest(&draft.value),
                reason: RedactionReason::ProtectedPayload,
            };
            gaps.push(gap(
                EvidenceClass::Payload,
                GapReason::Redacted,
                CausalReference::Claim(draft.claim_id.clone()),
                "the semantic claim value is protected",
            ));
            ExplanationPayload::Redacted(redaction)
        }
    };
    CausalClaim {
        payload,
        structure: CausalClaimStructure {
            claim_id: draft.claim_id,
            commit_sequence,
            definition: draft.definition,
            entity_id: draft.entity_id,
            provenance: draft.provenance,
            relation_id: draft.relation_id,
            valid_time: draft.valid_time,
        },
    }
}

fn causal_proposal(
    proposal: ActionProposal,
    access: PayloadAccess,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalActionProposal {
    let reference = CausalReference::Proposal(proposal.proposal_id.clone());
    let inputs = proposal
        .inputs
        .into_iter()
        .map(|input| {
            let payload = match access {
                PayloadAccess::Full => ExplanationPayload::Value(input.value),
                PayloadAccess::Redacted => {
                    let redaction = PayloadRedaction {
                        digest: payload_digest(&input.value),
                        reason: RedactionReason::ProtectedPayload,
                    };
                    gaps.push(gap(
                        EvidenceClass::Payload,
                        GapReason::Redacted,
                        reference.clone(),
                        "the Action proposal input is protected",
                    ));
                    ExplanationPayload::Redacted(redaction)
                }
            };
            CausalActionInput {
                id: input.id,
                payload,
            }
        })
        .collect();
    CausalActionProposal {
        inputs,
        structure: ActionProposalStructure {
            action_id: proposal.action_id,
            authority: proposal.authority,
            definition: proposal.definition,
            execution: proposal.execution,
            expires_at: proposal.expires_at,
            intent_digest: proposal.intent_digest,
            operation_id: proposal.operation_id,
            proposal_id: proposal.proposal_id,
            proposed_at: proposal.proposed_at,
            proposed_by: proposal.proposed_by,
            resource_id: proposal.resource_id,
            state_basis: proposal.state_basis,
            valid_at: proposal.valid_at,
        },
    }
}

fn verify_target(
    target: &ExplanationTarget,
    snapshot: &ActionHistorySnapshot,
    gaps: &mut Vec<ExplanationGap>,
) {
    let matches = match target {
        ExplanationTarget::Operation(operation_id) => snapshot
            .commit
            .as_ref()
            .is_some_and(|receipt| receipt.operation_id == *operation_id),
        ExplanationTarget::Claim(claim_id) => {
            snapshot
                .proposal
                .state_basis
                .dependencies
                .iter()
                .any(|dependency| dependency.claim_id == *claim_id)
                || snapshot
                    .commit_claims
                    .iter()
                    .any(|claim| claim.draft.claim_id == *claim_id)
                || snapshot
                    .commit
                    .as_ref()
                    .and_then(|receipt| receipt.commit_state_basis.as_ref())
                    .is_some_and(|basis| {
                        basis
                            .dependencies
                            .iter()
                            .any(|dependency| dependency.claim_id == *claim_id)
                    })
        }
        ExplanationTarget::EffectRequest(effect_request_id) => snapshot
            .effects
            .iter()
            .any(|effect| effect.snapshot.request.effect_request_id == *effect_request_id),
        ExplanationTarget::Decision(DecisionReference::Proposal(proposal_id)) => {
            snapshot.proposal.proposal_id == *proposal_id
        }
    };
    if !matches {
        gaps.push(gap(
            target_class(target),
            GapReason::Corrupt,
            target_reference(target),
            "the resolved history does not contain the requested target",
        ));
    }
}

fn ensure_snapshot_tenant(
    request: &TrustedExecutionContext,
    snapshot: &HistorySnapshot,
) -> Result<(), StoreError> {
    let HistorySnapshot::Action(snapshot) = snapshot else {
        return Ok(());
    };
    let tenant_matches = snapshot.proposal.proposed_by.tenant_id() == request.tenant_id()
        && snapshot
            .approval
            .as_ref()
            .is_none_or(|approval| approval.approved_by.tenant_id() == request.tenant_id())
        && snapshot
            .commit
            .as_ref()
            .is_none_or(|receipt| receipt.committed_by.tenant_id() == request.tenant_id());
    if tenant_matches {
        Ok(())
    } else {
        Err(StoreError::NotFound)
    }
}

fn payload_access(request: &TrustedExecutionContext, snapshot: &HistorySnapshot) -> PayloadAccess {
    match snapshot {
        HistorySnapshot::Action(snapshot)
            if snapshot.proposal.proposed_by.principal_id() == request.principal_id() =>
        {
            PayloadAccess::Full
        }
        HistorySnapshot::Claim(_) => PayloadAccess::Full,
        HistorySnapshot::Action(_) => PayloadAccess::Redacted,
    }
}

fn explanation_complete(
    target: &ExplanationTarget,
    subject: &ExplanationSubject,
    gaps: &[ExplanationGap],
) -> bool {
    let required = required_classes(target, subject);
    let observed = observed_classes(subject);
    required.iter().all(|required_class| {
        observed.contains(required_class) && !gaps.iter().any(|gap| gap.class == *required_class)
    })
}

fn required_classes(
    target: &ExplanationTarget,
    subject: &ExplanationSubject,
) -> Vec<EvidenceClass> {
    let base = match (target, subject) {
        (ExplanationTarget::Decision(_), _) => DECISION_REQUIRED_CLASSES,
        (ExplanationTarget::Operation(_), _) => OPERATION_REQUIRED_CLASSES,
        (ExplanationTarget::Claim(_), ExplanationSubject::Action(_)) => {
            ACTION_CLAIM_REQUIRED_CLASSES
        }
        (ExplanationTarget::Claim(_), ExplanationSubject::Claim(_)) => WORLD_CLAIM_REQUIRED_CLASSES,
        (ExplanationTarget::EffectRequest(_), _) => EFFECT_REQUEST_REQUIRED_CLASSES,
    };
    let mut required = base.to_vec();
    if base.contains(&EvidenceClass::EffectRequest)
        && matches!(subject, ExplanationSubject::Action(action) if action.effects.iter().any(|effect| {
            matches!(
                effect.request.structure.state,
                EffectKnowledgeState::Confirmed
                    | EffectKnowledgeState::ConfirmedNoEffect
                    | EffectKnowledgeState::Contradicted
            )
        }))
    {
        required.push(EvidenceClass::EffectEvidence);
        required.push(EvidenceClass::EffectReconciliation);
    }
    required
}

fn observed_classes(subject: &ExplanationSubject) -> BTreeSet<EvidenceClass> {
    match subject {
        ExplanationSubject::Action(action) => observed_action_classes(action),
        ExplanationSubject::Claim(claim) => observed_claim_classes(claim),
    }
}

fn observed_action_classes(action: &CausalActionExplanation) -> BTreeSet<EvidenceClass> {
    let mut observed = BTreeSet::from([
        EvidenceClass::Action,
        EvidenceClass::Proposal,
        EvidenceClass::ProposalStateBasis,
        EvidenceClass::TrustedContext,
    ]);
    if action.approval.is_some() {
        observed.insert(EvidenceClass::Approval);
    }
    if action.definition.is_some() {
        observed.insert(EvidenceClass::DefinitionRevision);
    }
    if !action.proposal_state_basis.basis.dependencies.is_empty() {
        observed.insert(EvidenceClass::Dependency);
    }
    if !action.policies.is_empty() {
        observed.insert(EvidenceClass::PolicyRevision);
    }
    if action_payloads_are_visible(action) {
        observed.insert(EvidenceClass::Payload);
    }
    if let Some(commit) = &action.commit {
        observed.insert(EvidenceClass::CommitSequence);
        observed.insert(EvidenceClass::Operation);
        if commit.state_basis.is_some() {
            observed.insert(EvidenceClass::CommitStateBasis);
        }
        if !commit.records.is_empty() {
            observed.insert(EvidenceClass::CommittedRecord);
        }
    }
    if !action.effects.is_empty() {
        observed.insert(EvidenceClass::EffectRequest);
    }
    if action
        .effects
        .iter()
        .any(|effect| !effect.dispatches.is_empty())
    {
        observed.insert(EvidenceClass::EffectDispatch);
    }
    if action
        .effects
        .iter()
        .any(|effect| !effect.attempts.is_empty())
    {
        observed.insert(EvidenceClass::EffectAttempt);
    }
    if action
        .effects
        .iter()
        .any(|effect| !effect.evidence.is_empty())
    {
        observed.insert(EvidenceClass::EffectEvidence);
    }
    if action
        .effects
        .iter()
        .any(|effect| !effect.reconciliations.is_empty())
    {
        observed.insert(EvidenceClass::EffectReconciliation);
    }
    observed
}

fn observed_claim_classes(claim: &CausalClaimExplanation) -> BTreeSet<EvidenceClass> {
    let mut observed = BTreeSet::from([
        EvidenceClass::CommitSequence,
        EvidenceClass::CommittedRecord,
    ]);
    if claim.definition.is_some() {
        observed.insert(EvidenceClass::DefinitionRevision);
    }
    if matches!(&claim.claim.payload, ExplanationPayload::Value(_)) {
        observed.insert(EvidenceClass::Payload);
    }
    observed
}

fn action_payloads_are_visible(action: &CausalActionExplanation) -> bool {
    action
        .proposal
        .inputs
        .iter()
        .all(|input| matches!(&input.payload, ExplanationPayload::Value(_)))
        && action
            .proposal_state_basis
            .claims
            .iter()
            .all(|claim| matches!(&claim.payload, ExplanationPayload::Value(_)))
        && action.commit.as_ref().is_none_or(|commit| {
            commit
                .records
                .iter()
                .all(|claim| matches!(&claim.payload, ExplanationPayload::Value(_)))
                && commit.state_basis.as_ref().is_none_or(|basis| {
                    basis
                        .claims
                        .iter()
                        .all(|claim| matches!(&claim.payload, ExplanationPayload::Value(_)))
                })
        })
        && action
            .effects
            .iter()
            .all(|effect| matches!(&effect.request.payload, ExplanationPayload::Value(_)))
}

fn verify_policy(policy: &PolicyDecisionEvidence, gaps: &mut Vec<ExplanationGap>) {
    if policy.determining_policies.is_empty() {
        gaps.push(gap(
            EvidenceClass::PolicyRevision,
            GapReason::Missing,
            CausalReference::Policy(policy.policy.clone()),
            "the policy decision has no determining policy evidence",
        ));
    }
}

fn policy_evidence(
    evidence: &zoen_core::PolicyEvidence,
    stage: PolicyDecisionStage,
) -> PolicyDecisionEvidence {
    PolicyDecisionEvidence {
        determining_policies: evidence.determining_policies.clone(),
        policy: evidence.revision.clone(),
        stage,
    }
}

fn proposal_policy(proposal: &ActionProposal) -> &zoen_core::PolicyEvidence {
    match &proposal.authority {
        ProposalAuthority::AwaitingApproval(policy) | ProposalAuthority::Ready(policy) => policy,
    }
}

fn dependency_matches_claim(dependency: &StateDependency, claim: &EvidenceClaim) -> bool {
    dependency.commit_sequence == claim.commit_sequence
        && dependency.entity_id == claim.draft.entity_id
        && dependency.relation_id == claim.draft.relation_id
        && dependency.source_digest == claim.draft.provenance.source_digest
        && dependency.source_id == claim.draft.provenance.source_id
        && dependency.source_ref == claim.draft.provenance.source_ref
}

fn claims_for_dependencies(
    claims: &[EvidenceClaim],
    basis: Option<&zoen_core::StateBasis>,
) -> Vec<EvidenceClaim> {
    basis
        .into_iter()
        .flat_map(|basis| basis.dependencies.iter())
        .filter_map(|dependency| {
            claims
                .iter()
                .find(|claim| claim.draft.claim_id == dependency.claim_id)
                .cloned()
        })
        .collect()
}

fn requires_commit(target: &ExplanationTarget) -> bool {
    !matches!(target, ExplanationTarget::Decision(_))
}

fn target_class(target: &ExplanationTarget) -> EvidenceClass {
    match target {
        ExplanationTarget::Operation(_) => EvidenceClass::Operation,
        ExplanationTarget::Claim(_) => EvidenceClass::CommittedRecord,
        ExplanationTarget::EffectRequest(_) => EvidenceClass::EffectRequest,
        ExplanationTarget::Decision(_) => EvidenceClass::Proposal,
    }
}

fn target_reference(target: &ExplanationTarget) -> CausalReference {
    match target {
        ExplanationTarget::Operation(id) => CausalReference::Operation(id.clone()),
        ExplanationTarget::Claim(id) => CausalReference::Claim(id.clone()),
        ExplanationTarget::EffectRequest(id) => CausalReference::EffectRequest(id.clone()),
        ExplanationTarget::Decision(DecisionReference::Proposal(id)) => {
            CausalReference::Proposal(id.clone())
        }
    }
}

fn payload_digest(value: &ExactValue) -> PayloadDigest {
    let encoded = match value {
        ExactValue::Bool(value) => format!("bool:{value}"),
        ExactValue::Decimal(value) => format!("decimal:{}", value.as_str()),
        ExactValue::Entity(value) => format!("entity:{}", value.as_str()),
        ExactValue::Integer(value) => format!("integer:{}", value.as_str()),
        ExactValue::Quantity { amount, unit } => {
            format!("quantity:{}:{}", amount.as_str(), unit.as_str())
        }
        ExactValue::Text(value) => format!("text:{value}"),
    };
    PayloadDigest::from_sha256(Sha256::digest(encoded.as_bytes()).into())
}

fn gap(
    class: EvidenceClass,
    reason: GapReason,
    reference: CausalReference,
    detail: impl Into<String>,
) -> ExplanationGap {
    ExplanationGap {
        class,
        detail: detail.into(),
        reason,
        reference,
    }
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    include!("tests/history_access.rs");
}
