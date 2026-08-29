use std::collections::BTreeSet;

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, ActionInput, ActionPreviewHash, ActionProposal, ActorId, CanonicalJson, ClaimId,
    CommitSequence,
    DefinitionDigest, DefinitionId, DefinitionReference, DefinitionRevision,
    DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId, EntityId,
    EvidenceClaim, EvidenceDigest, EvidenceDraft, EvidenceProvenance, ExactInteger, ExactValue,
    ExplanationPayload, ExplanationSubject, ExplanationTarget, GapReason, InputId, IntentDigest,
    OperationId, PolicyDigest, PolicyEvidence, PolicyId, PolicyRevision, PolicyRevisionNumber,
    PrincipalId, ProposalAuthority, ProposalId, RelationId, ResourceId, SourceId, StateBasis,
    StateBasisDigest, TenantId, TimestampMicros, TrustedExecutionContext, ValidTime, WorkloadId,
};

use super::{
    ActionHistorySnapshot, ClaimHistorySnapshot, HistorySnapshot, PayloadAccess, causal_proposal,
    hex_digest, payload_access,
};

const ZERO_DIGEST: &str = "0000000000000000000000000000000000000000000000000000000000000000";

#[test]
fn tenant_scoped_world_claim_is_not_full_without_read() {
    let revision = definition_revision();
    let claim = world_claim(definition_reference(&revision));
    let snapshot = ClaimHistorySnapshot {
        claim,
        definition: Some(revision),
        migration: None,
    };
    let history = HistorySnapshot::Claim(Box::new(snapshot));
    let access = payload_access(&context("principal.request"), &history);
    assert!(matches!(access, PayloadAccess::Redacted));
}

#[test]
fn action_payload_stays_redacted_for_another_principal() {
    let history = HistorySnapshot::Action(Box::new(ActionHistorySnapshot {
        approval: None,
        commit: None,
        commit_claims: Vec::new(),
        definition: None,
        effects: Vec::new(),
        proposal: action_proposal(context("principal.owner")),
        proposal_claims: Vec::new(),
    }));
    let access = payload_access(&context("principal.other"), &history);
    assert!(matches!(access, PayloadAccess::Redacted));

    let HistorySnapshot::Action(snapshot) = history else {
        panic!("test snapshot must contain an Action");
    };
    let mut gaps = Vec::new();
    let proposal = causal_proposal(snapshot.proposal, access, &mut gaps);

    assert!(matches!(
        proposal.inputs.as_slice(),
        [input] if matches!(input.payload, ExplanationPayload::Redacted(_))
    ));
    assert!(gaps.iter().any(|gap| {
        gap.reason == GapReason::Redacted
            && matches!(gap.reference, zoen_core::CausalReference::Proposal(_))
    }));
}

fn world_claim(definition: DefinitionReference) -> EvidenceClaim {
    EvidenceClaim {
        commit_sequence: CommitSequence::new(1).expect("commit sequence"),
        draft: EvidenceDraft {
            claim_id: ClaimId::parse("claim.world.available").expect("claim id"),
            definition,
            entity_id: EntityId::parse("inventory.item.1").expect("entity id"),
            provenance: EvidenceProvenance {
                ingested_at: None,
                observed_at: None,
                source_digest: EvidenceDigest::parse(ZERO_DIGEST).expect("evidence digest"),
                source_id: SourceId::parse("source.world").expect("source id"),
                source_ref: "world fixture".to_owned(),
            },
            relation_id: RelationId::parse("inventory.available").expect("relation id"),
            valid_time: ValidTime::instant(TimestampMicros::new(1)),
            value: ExactValue::Integer(ExactInteger::parse("20").expect("integer")),
        },
    }
}

fn definition_revision() -> DefinitionRevision {
    let canonical_json = CanonicalJson::new(
        include_str!("../../../../e2e/governed-action/definition-direct.canonical.json")
            .trim()
            .to_owned(),
    )
    .expect("canonical definition");
    DefinitionRevision {
        digest: DefinitionDigest::parse(hex_digest(Sha256::digest(canonical_json.as_bytes())))
            .expect("definition digest"),
        canonical_json,
        commit_sequence: CommitSequence::new(1).expect("commit sequence"),
        definition_id: DefinitionId::parse("inventory.governed").expect("definition id"),
        revision: DefinitionRevisionNumber::new(1).expect("definition revision"),
    }
}

fn definition_reference(revision: &DefinitionRevision) -> DefinitionReference {
    DefinitionReference {
        definition_id: revision.definition_id.clone(),
        digest: revision.digest.clone(),
        revision: revision.revision,
    }
}

fn action_proposal(proposed_by: TrustedExecutionContext) -> ActionProposal {
    let revision = definition_revision();
    ActionProposal {
        action_id: ActionId::parse("inventory.requestStock").expect("action id"),
        authority: ProposalAuthority::Ready(PolicyEvidence {
            determining_policies: vec!["permit".to_owned()],
            revision: PolicyRevision {
                digest: PolicyDigest::parse(ZERO_DIGEST).expect("policy digest"),
                id: PolicyId::parse("policy.action").expect("policy id"),
                revision: PolicyRevisionNumber::new(1).expect("policy revision"),
            },
        }),
        canonical_preview_text: "Vou executar requestStock com quantidade 2.".to_owned(),
        definition: definition_reference(&revision),
        execution: None,
        expires_at: TimestampMicros::new(100),
        inputs: vec![ActionInput {
            id: InputId::parse("quantity").expect("input id"),
            value: ExactValue::Integer(ExactInteger::parse("2").expect("integer")),
        }],
        intent_digest: IntentDigest::parse(ZERO_DIGEST).expect("intent digest"),
        operation_id: OperationId::parse("operation.test").expect("operation id"),
        preview_hash: ActionPreviewHash::parse(ZERO_DIGEST).expect("preview hash"),
        proposal_id: ProposalId::parse("proposal.test").expect("proposal id"),
        proposed_at: TimestampMicros::new(1),
        proposed_by,
        resource_id: ResourceId::parse("inventory.item.1").expect("resource id"),
        state_basis: StateBasis {
            dependencies: Vec::new(),
            digest: StateBasisDigest::parse(ZERO_DIGEST).expect("state basis digest"),
            observed_commit_sequence: CommitSequence::new(1).expect("commit sequence"),
        },
        valid_at: TimestampMicros::new(1),
    }
}

fn context(principal: &str) -> TrustedExecutionContext {
    let workload = WorkloadId::parse("workload.test").expect("workload id");
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.test").expect("delegation id"),
        BTreeSet::from([ActionId::parse("inventory.requestStock").expect("action id")]),
        BTreeSet::from([ResourceId::parse("inventory.item.1").expect("resource id")]),
        BTreeSet::from([workload.clone()]),
        TimestampMicros::new(0),
        TimestampMicros::new(100),
    )
    .expect("delegation grant");
    TrustedExecutionContext::new(
        TenantId::parse("tenant.test").expect("tenant id"),
        ActorId::parse("actor.test").expect("actor id"),
        PrincipalId::parse(principal).expect("principal id"),
        workload,
        DelegationChain::new(vec![grant]).expect("delegation chain"),
        zoen_core::Clearance::world_floor(),
    )
}
