use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionId, ActionProposal, CausalActionExplanation, CausalClaim,
    CausalClaimExplanation, CausalCommit, CausalEffect, CausalExplanation, CausalReference,
    CausalStateBasis, CommitReceipt, DecisionReference, DefinitionEvidence, DefinitionReference,
    DefinitionRevision, EffectDispatchEvidence, EffectKnowledgeState, EffectSnapshot,
    EvidenceClaim, EvidenceClass, ExactValue, ExplanationDisclosure, ExplanationGap,
    ExplanationSubject, ExplanationTarget, GapReason, PayloadDigest, PayloadRedaction,
    PolicyDecisionEvidence, PolicyDecisionStage, ProposalAuthority, RedactionReason,
    StateBasisStage, StateDependency, TrustedExecutionContext, expression_relations,
};

use crate::{
    AuthorityStore, StoreError, calculate_state_basis_digest, decode_canonical_definition,
};

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
pub struct ClaimHistorySnapshot {
    pub claim: EvidenceClaim,
    pub definition: Option<DefinitionRevision>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HistorySnapshot {
    Action(Box<ActionHistorySnapshot>),
    Claim(ClaimHistorySnapshot),
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
        disclosure: ExplanationDisclosure,
    ) -> Result<CausalExplanation, HistoryError> {
        let snapshot = self
            .store
            .load_history(context, &target)
            .await
            .map_err(HistoryError::Store)?;
        let mut gaps = Vec::new();
        let subject = match snapshot {
            HistorySnapshot::Action(snapshot) => ExplanationSubject::Action(Box::new(
                explain_action(context, &target, *snapshot, disclosure, &mut gaps),
            )),
            HistorySnapshot::Claim(snapshot) => {
                ExplanationSubject::Claim(explain_claim(snapshot, disclosure, &mut gaps))
            }
        };
        Ok(CausalExplanation {
            complete: gaps.is_empty(),
            gaps,
            subject,
            target,
        })
    }
}

fn explain_action(
    context: &TrustedExecutionContext,
    target: &ExplanationTarget,
    snapshot: ActionHistorySnapshot,
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalActionExplanation {
    let proposal_reference = CausalReference::Proposal(snapshot.proposal.proposal_id.clone());
    verify_context(
        context,
        &snapshot.proposal.proposed_by,
        proposal_reference.clone(),
        gaps,
    );
    verify_target(target, &snapshot, gaps);

    let definition = definition_evidence(
        snapshot.definition,
        Some(&snapshot.proposal.action_id),
        &snapshot.proposal.definition,
        gaps,
    );
    let proposal_state_basis = state_basis(
        snapshot.proposal.state_basis.clone(),
        snapshot.proposal_claims,
        StateBasisStage::Proposal,
        disclosure,
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
        verify_context(
            context,
            &approval.approved_by,
            CausalReference::Approval(approval.approval_id.clone()),
            gaps,
        );
        let approval_policy = policy_evidence(&approval.policy, PolicyDecisionStage::Approval);
        verify_policy(&approval_policy, gaps);
        policies.push(approval_policy);
    }

    let commit = snapshot.commit.map(|receipt| {
        verify_context(
            context,
            &receipt.committed_by,
            CausalReference::Operation(receipt.operation_id.clone()),
            gaps,
        );
        let commit_policy = policy_evidence(&receipt.policy, PolicyDecisionStage::Commit);
        verify_policy(&commit_policy, gaps);
        policies.push(commit_policy);
        commit_evidence(receipt, snapshot.commit_claims, disclosure, gaps)
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
        .map(|effect| effect_evidence(effect, disclosure, gaps))
        .collect::<Vec<_>>();
    if let Some(commit) = &commit {
        for effect_request_id in &commit.receipt.effect_request_ids {
            if !effects
                .iter()
                .any(|effect| effect.snapshot.request.effect_request_id == *effect_request_id)
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
        proposal: snapshot.proposal,
        proposal_state_basis,
    }
}

fn explain_claim(
    snapshot: ClaimHistorySnapshot,
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalClaimExplanation {
    let reference = snapshot.claim.draft.definition.clone();
    let relation = snapshot.claim.draft.relation_id.clone();
    let definition =
        definition_evidence(snapshot.definition, None, &reference, gaps).map(|mut evidence| {
            evidence.relation_ids = vec![relation];
            evidence
        });
    CausalClaimExplanation {
        claim: causal_claim(snapshot.claim, disclosure, gaps),
        definition,
    }
}

fn definition_evidence(
    revision: Option<DefinitionRevision>,
    action_id: Option<&ActionId>,
    expected: &DefinitionReference,
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
    let mut relation_ids = Vec::new();
    let mut computation_ids = Vec::new();
    if let Some(decoded) = decoded {
        if let Some(action_id) = action_id {
            if let Some(action) = decoded
                .actions
                .iter()
                .find(|action| action.id == *action_id)
            {
                relation_ids.extend(expression_relations(&action.precondition));
                relation_ids.extend(
                    action
                        .effects
                        .iter()
                        .map(|effect| effect.relation_id.clone()),
                );
                relation_ids.sort();
                relation_ids.dedup();
            } else {
                gaps.push(gap(
                    EvidenceClass::Action,
                    GapReason::Corrupt,
                    CausalReference::Action(action_id.clone()),
                    "the pinned definition revision does not contain the historical Action",
                ));
            }
        }
        computation_ids = decoded
            .computations
            .iter()
            .filter(|computation| {
                expression_relations(&computation.expression)
                    .iter()
                    .any(|relation| relation_ids.contains(relation))
            })
            .map(|computation| computation.id.clone())
            .collect();
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
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalStateBasis {
    let reference = CausalReference::StateBasis(basis.digest.clone());
    match calculate_state_basis_digest(&basis.dependencies) {
        Ok(actual) if actual == basis.digest => {}
        Ok(_) | Err(_) => gaps.push(gap(
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
        .map(|claim| causal_claim(claim, disclosure, gaps))
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
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalCommit {
    let operation_reference = CausalReference::Operation(receipt.operation_id.clone());
    let state_basis = receipt.commit_state_basis.clone().map(|basis| {
        state_basis(
            basis,
            claims_for_dependencies(&claims, receipt.commit_state_basis.as_ref()),
            StateBasisStage::Commit,
            disclosure,
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
        .map(|claim| causal_claim(claim, disclosure, gaps))
        .collect();
    CausalCommit {
        receipt,
        records,
        state_basis,
    }
}

fn effect_evidence(
    snapshot: EffectHistorySnapshot,
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalEffect {
    let request = &snapshot.snapshot.request;
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
    if snapshot.dispatches.is_empty() {
        gaps.push(gap(
            EvidenceClass::EffectDispatch,
            GapReason::Missing,
            reference.clone(),
            "the EffectRequest has no durable scheduler dispatch evidence",
        ));
    }
    for attempt in &snapshot.snapshot.attempts {
        if attempt.request_digest != request.request_digest {
            gaps.push(gap(
                EvidenceClass::EffectAttempt,
                GapReason::Corrupt,
                CausalReference::EffectAttempt(attempt.attempt_id.clone()),
                "the connector attempt references a different EffectRequest digest",
            ));
        }
    }
    if !matches!(request.state, EffectKnowledgeState::NotAttempted)
        && snapshot.snapshot.attempts.is_empty()
    {
        gaps.push(gap(
            EvidenceClass::EffectAttempt,
            GapReason::Missing,
            reference.clone(),
            "the effect knowledge state requires connector attempt evidence",
        ));
    }
    for evidence in &snapshot.snapshot.evidence {
        if evidence.idempotency_key != request.idempotency_key {
            gaps.push(gap(
                EvidenceClass::EffectEvidence,
                GapReason::Corrupt,
                CausalReference::EffectEvidence(evidence.evidence_id.clone()),
                "the reconciliation evidence references a different idempotency key",
            ));
        }
        if !snapshot
            .snapshot
            .reconciliations
            .iter()
            .any(|reconciliation| reconciliation.evidence_id == evidence.evidence_id)
        {
            gaps.push(gap(
                EvidenceClass::EffectReconciliation,
                GapReason::Missing,
                CausalReference::EffectEvidence(evidence.evidence_id.clone()),
                "effect evidence has no durable reconciliation record",
            ));
        }
    }
    let payload_redaction = match disclosure {
        ExplanationDisclosure::Full => None,
        ExplanationDisclosure::RedactPayloads => {
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
            Some(redaction)
        }
    };
    CausalEffect {
        dispatches: snapshot.dispatches,
        payload_redaction,
        snapshot: snapshot.snapshot,
    }
}

fn causal_claim(
    claim: EvidenceClaim,
    disclosure: ExplanationDisclosure,
    gaps: &mut Vec<ExplanationGap>,
) -> CausalClaim {
    let value_redaction = match disclosure {
        ExplanationDisclosure::Full => None,
        ExplanationDisclosure::RedactPayloads => {
            let redaction = PayloadRedaction {
                digest: payload_digest(&claim.draft.value),
                reason: RedactionReason::ProtectedPayload,
            };
            gaps.push(gap(
                EvidenceClass::Payload,
                GapReason::Redacted,
                CausalReference::Claim(claim.draft.claim_id.clone()),
                "the semantic claim value is protected",
            ));
            Some(redaction)
        }
    };
    CausalClaim {
        claim,
        value_redaction,
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
        ExplanationTarget::Claim(claim_id) => snapshot
            .commit_claims
            .iter()
            .any(|claim| claim.draft.claim_id == *claim_id),
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

fn verify_context(
    request: &TrustedExecutionContext,
    historical: &TrustedExecutionContext,
    reference: CausalReference,
    gaps: &mut Vec<ExplanationGap>,
) {
    if request.tenant_id() != historical.tenant_id() {
        gaps.push(gap(
            EvidenceClass::TrustedContext,
            GapReason::Corrupt,
            reference,
            "the durable trusted context belongs to a different tenant",
        ));
    }
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
