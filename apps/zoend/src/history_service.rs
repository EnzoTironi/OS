use buffa::MessageView;
use connectrpc::{ConnectError, RequestContext, Response, ServiceRequest, ServiceResult};
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::{
    CausalActionExplanation as CoreCausalActionExplanation, CausalClaim as CoreCausalClaim,
    CausalClaimExplanation as CoreCausalClaimExplanation, CausalCommit as CoreCausalCommit,
    CausalEffect as CoreCausalEffect, CausalExplanation as CoreCausalExplanation,
    CausalReference as CoreCausalReference, CausalStateBasis as CoreCausalStateBasis,
    DecisionReference, DefinitionEvidence as CoreDefinitionEvidence,
    EffectDispatchEvidence as CoreEffectDispatchEvidence,
    EffectDispatchOutcome as CoreEffectDispatchOutcome, EvidenceClaim,
    EvidenceClass as CoreEvidenceClass, ExplanationDisclosure as CoreExplanationDisclosure,
    ExplanationGap as CoreExplanationGap, ExplanationSubject, ExplanationTarget as CoreTarget,
    GapReason as CoreGapReason, PayloadRedaction as CorePayloadRedaction,
    PolicyDecisionEvidence as CorePolicyDecisionEvidence,
    PolicyDecisionStage as CorePolicyDecisionStage, PolicyEvidence as CorePolicyEvidence,
    PolicyRevision as CorePolicyRevision, RedactionReason as CoreRedactionReason,
    StateBasisStage as CoreStateBasisStage, ValidTime as CoreValidTime,
};
use zoen_engine::{HistoryEngine, HistoryError};

use crate::action_service::{
    to_approval, to_commit_receipt, to_policy_evidence, to_proposal, to_state_basis,
    to_trusted_context,
};
use crate::auth::SessionRegistry;
use crate::effect_service::{to_attempt, to_evidence, to_reconciliation, to_request};
use crate::proto::zoen::action::v1::PolicyRevision;
use crate::proto::zoen::history::v1::{
    CausalActionExplanation, CausalClaim, CausalClaimExplanation, CausalCommit, CausalEffect,
    CausalEffectRequest, CausalExplanation, CausalReference, CausalStateBasis, DefinitionEvidence,
    EffectDispatchEvidence, EffectDispatchOutcome, EvidenceClass, ExplainRequest, ExplainResponse,
    ExplanationDisclosure, ExplanationGap, ExplanationTarget, GapReason, HistoryService,
    PayloadRedaction, PolicyDecisionEvidence, PolicyDecisionStage, RedactionReason,
    StateBasisStage, causal_claim, causal_effect_request, causal_explanation, causal_reference,
    explanation_target,
};
use crate::proto::zoen::world::v1::{
    EvidenceClaim as ProtocolEvidenceClaim, EvidenceProvenance, TemporalInterval,
    ValidTime as ProtocolValidTime, valid_time,
};
use crate::world_service::{invalid, to_definition_reference, to_exact_value, to_timestamp};

pub struct HistoryServiceImpl {
    engine: HistoryEngine<PostgresAuthorityStore>,
    sessions: SessionRegistry,
}

impl HistoryServiceImpl {
    pub fn new(engine: HistoryEngine<PostgresAuthorityStore>, sessions: SessionRegistry) -> Self {
        Self { engine, sessions }
    }
}

impl HistoryService for HistoryServiceImpl {
    async fn explain(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ExplainRequest>,
    ) -> ServiceResult<ExplainResponse> {
        let trusted = self.sessions.trusted_context(&context)?;
        let target = request
            .target
            .as_option()
            .ok_or_else(|| invalid("explanation target is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let target = parse_target(target)?;
        let disclosure = match request.disclosure.as_known() {
            Some(ExplanationDisclosure::Full) => CoreExplanationDisclosure::Full,
            Some(ExplanationDisclosure::RedactPayloads) => {
                CoreExplanationDisclosure::RedactPayloads
            }
            Some(ExplanationDisclosure::Unspecified) | None => {
                return Err(invalid("explanation disclosure is required"));
            }
        };
        let explanation = self
            .engine
            .explain(&trusted, target, disclosure)
            .await
            .map_err(map_history_error)?;
        Response::ok(ExplainResponse {
            explanation: Some(to_explanation(explanation)).into(),
            ..Default::default()
        })
    }
}

fn parse_target(target: ExplanationTarget) -> Result<CoreTarget, ConnectError> {
    match target
        .target
        .ok_or_else(|| invalid("explanation target variant is required"))?
    {
        explanation_target::Target::OperationId(value) => zoen_core::OperationId::parse(value)
            .map(CoreTarget::Operation)
            .map_err(|error| invalid(error.to_string())),
        explanation_target::Target::ClaimId(value) => zoen_core::ClaimId::parse(value)
            .map(CoreTarget::Claim)
            .map_err(|error| invalid(error.to_string())),
        explanation_target::Target::EffectRequestId(value) => {
            zoen_core::EffectRequestId::parse(value)
                .map(CoreTarget::EffectRequest)
                .map_err(|error| invalid(error.to_string()))
        }
        explanation_target::Target::ProposalId(value) => zoen_core::ProposalId::parse(value)
            .map(DecisionReference::Proposal)
            .map(CoreTarget::Decision)
            .map_err(|error| invalid(error.to_string())),
    }
}

fn to_explanation(explanation: CoreCausalExplanation) -> CausalExplanation {
    CausalExplanation {
        complete: explanation.complete,
        gaps: explanation.gaps.into_iter().map(to_gap).collect(),
        subject: Some(match explanation.subject {
            ExplanationSubject::Action(action) => {
                causal_explanation::Subject::Action(Box::new(to_action(*action)))
            }
            ExplanationSubject::Claim(claim) => {
                causal_explanation::Subject::Claim(Box::new(to_claim_explanation(claim)))
            }
        }),
        target: Some(to_target(explanation.target)).into(),
        ..Default::default()
    }
}

fn to_action(action: CoreCausalActionExplanation) -> CausalActionExplanation {
    let proposed_by = to_trusted_context(&action.proposal.proposed_by);
    let (approval, approved_by) = match action.approval {
        Some(approval) => {
            let approved_by = to_trusted_context(&approval.approved_by);
            (Some(to_approval(approval)), Some(approved_by))
        }
        None => (None, None),
    };
    CausalActionExplanation {
        approval: approval.into(),
        approved_by: approved_by.into(),
        commit: action.commit.map(to_commit).into(),
        definition: action.definition.map(to_definition).into(),
        effects: action.effects.into_iter().map(to_effect).collect(),
        policies: action.policies.into_iter().map(to_policy).collect(),
        proposal: Some(to_proposal(action.proposal)).into(),
        proposal_state_basis: Some(to_causal_state_basis(action.proposal_state_basis)).into(),
        proposed_by: Some(proposed_by).into(),
        ..Default::default()
    }
}

fn to_claim_explanation(explanation: CoreCausalClaimExplanation) -> CausalClaimExplanation {
    CausalClaimExplanation {
        claim: Some(to_causal_claim(explanation.claim)).into(),
        definition: explanation.definition.map(to_definition).into(),
        ..Default::default()
    }
}

fn to_commit(commit: CoreCausalCommit) -> CausalCommit {
    let committed_by = to_trusted_context(&commit.receipt.committed_by);
    CausalCommit {
        committed_by: Some(committed_by).into(),
        receipt: Some(to_commit_receipt(commit.receipt)).into(),
        records: commit.records.into_iter().map(to_causal_claim).collect(),
        state_basis: commit.state_basis.map(to_causal_state_basis).into(),
        ..Default::default()
    }
}

fn to_causal_state_basis(state_basis: CoreCausalStateBasis) -> CausalStateBasis {
    CausalStateBasis {
        basis: Some(to_state_basis(state_basis.basis)).into(),
        claims: state_basis
            .claims
            .into_iter()
            .map(to_causal_claim)
            .collect(),
        stage: match state_basis.stage {
            CoreStateBasisStage::Proposal => StateBasisStage::Proposal,
            CoreStateBasisStage::Commit => StateBasisStage::Commit,
        }
        .into(),
        ..Default::default()
    }
}

fn to_causal_claim(causal: CoreCausalClaim) -> CausalClaim {
    let EvidenceClaim {
        commit_sequence,
        draft,
    } = causal.claim;
    let payload = match causal.value_redaction {
        Some(redaction) => {
            causal_claim::Payload::Redaction(Box::new(to_payload_redaction(redaction)))
        }
        None => causal_claim::Payload::Value(Box::new(to_exact_value(draft.value.clone()))),
    };
    CausalClaim {
        commit_sequence: commit_sequence.get(),
        payload: Some(payload),
        structure: Some(ProtocolEvidenceClaim {
            claim_id: draft.claim_id.as_str().to_owned(),
            definition: Some(to_definition_reference(draft.definition)).into(),
            entity_id: draft.entity_id.as_str().to_owned(),
            provenance: Some(EvidenceProvenance {
                source_digest: draft.provenance.source_digest.as_str().to_owned(),
                source_id: draft.provenance.source_id.as_str().to_owned(),
                source_ref: draft.provenance.source_ref,
                ..Default::default()
            })
            .into(),
            relation_id: draft.relation_id.as_str().to_owned(),
            valid_time: Some(to_valid_time(draft.valid_time)).into(),
            ..Default::default()
        })
        .into(),
        ..Default::default()
    }
}

fn to_valid_time(valid_time: CoreValidTime) -> ProtocolValidTime {
    ProtocolValidTime {
        value: Some(match valid_time {
            CoreValidTime::Instant(at) => valid_time::Value::Instant(Box::new(to_timestamp(at))),
            CoreValidTime::Interval { start, end } => {
                valid_time::Value::Interval(Box::new(TemporalInterval {
                    end: Some(to_timestamp(end)).into(),
                    start: Some(to_timestamp(start)).into(),
                    ..Default::default()
                }))
            }
        }),
        ..Default::default()
    }
}

fn to_definition(definition: CoreDefinitionEvidence) -> DefinitionEvidence {
    DefinitionEvidence {
        action_id: definition
            .action_id
            .map(|id| id.as_str().to_owned())
            .unwrap_or_default(),
        computation_ids: definition
            .computation_ids
            .into_iter()
            .map(|id| id.as_str().to_owned())
            .collect(),
        digest_verified: definition.digest_verified,
        published_at_commit_sequence: definition.published_at.get(),
        reference: Some(to_definition_reference(definition.reference)).into(),
        relation_ids: definition
            .relation_ids
            .into_iter()
            .map(|id| id.as_str().to_owned())
            .collect(),
        ..Default::default()
    }
}

fn to_policy(policy: CorePolicyDecisionEvidence) -> PolicyDecisionEvidence {
    PolicyDecisionEvidence {
        policy: Some(to_policy_evidence(CorePolicyEvidence {
            determining_policies: policy.determining_policies,
            revision: policy.policy,
        }))
        .into(),
        stage: match policy.stage {
            CorePolicyDecisionStage::Proposal => PolicyDecisionStage::Proposal,
            CorePolicyDecisionStage::Approval => PolicyDecisionStage::Approval,
            CorePolicyDecisionStage::Commit => PolicyDecisionStage::Commit,
        }
        .into(),
        ..Default::default()
    }
}

fn to_effect(effect: CoreCausalEffect) -> CausalEffect {
    let snapshot = effect.snapshot;
    let payload = snapshot.request.payload.clone();
    let mut request = to_request(snapshot.request);
    request.payload.clear();
    CausalEffect {
        attempts: snapshot.attempts.into_iter().map(to_attempt).collect(),
        dispatches: effect.dispatches.into_iter().map(to_dispatch).collect(),
        evidence: snapshot.evidence.into_iter().map(to_evidence).collect(),
        reconciliations: snapshot
            .reconciliations
            .into_iter()
            .map(to_reconciliation)
            .collect(),
        request: Some(CausalEffectRequest {
            payload: Some(match effect.payload_redaction {
                Some(redaction) => causal_effect_request::Payload::Redaction(Box::new(
                    to_payload_redaction(redaction),
                )),
                None => causal_effect_request::Payload::Value(payload),
            }),
            structure: Some(request).into(),
            ..Default::default()
        })
        .into(),
        ..Default::default()
    }
}

fn to_dispatch(dispatch: CoreEffectDispatchEvidence) -> EffectDispatchEvidence {
    EffectDispatchEvidence {
        attempt_number: dispatch.attempt_number,
        error: dispatch.error.unwrap_or_default(),
        outcome: match dispatch.outcome {
            CoreEffectDispatchOutcome::Accepted => EffectDispatchOutcome::Accepted,
            CoreEffectDispatchOutcome::InvalidResponse => EffectDispatchOutcome::InvalidResponse,
            CoreEffectDispatchOutcome::Rejected => EffectDispatchOutcome::Rejected,
            CoreEffectDispatchOutcome::SchedulerUnavailable => {
                EffectDispatchOutcome::SchedulerUnavailable
            }
        }
        .into(),
        scheduler_invocation_id: dispatch.scheduler_invocation_id.unwrap_or_default(),
        ..Default::default()
    }
}

fn to_payload_redaction(redaction: CorePayloadRedaction) -> PayloadRedaction {
    PayloadRedaction {
        digest: redaction.digest.as_str().to_owned(),
        reason: match redaction.reason {
            CoreRedactionReason::ProtectedPayload => RedactionReason::ProtectedPayload,
        }
        .into(),
        ..Default::default()
    }
}

fn to_gap(gap: CoreExplanationGap) -> ExplanationGap {
    ExplanationGap {
        class: match gap.class {
            CoreEvidenceClass::Action => EvidenceClass::Action,
            CoreEvidenceClass::Approval => EvidenceClass::Approval,
            CoreEvidenceClass::CommitSequence => EvidenceClass::CommitSequence,
            CoreEvidenceClass::CommitStateBasis => EvidenceClass::CommitStateBasis,
            CoreEvidenceClass::CommittedRecord => EvidenceClass::CommittedRecord,
            CoreEvidenceClass::DefinitionRevision => EvidenceClass::DefinitionRevision,
            CoreEvidenceClass::Dependency => EvidenceClass::Dependency,
            CoreEvidenceClass::EffectAttempt => EvidenceClass::EffectAttempt,
            CoreEvidenceClass::EffectDispatch => EvidenceClass::EffectDispatch,
            CoreEvidenceClass::EffectEvidence => EvidenceClass::EffectEvidence,
            CoreEvidenceClass::EffectReconciliation => EvidenceClass::EffectReconciliation,
            CoreEvidenceClass::EffectRequest => EvidenceClass::EffectRequest,
            CoreEvidenceClass::Intent => EvidenceClass::Intent,
            CoreEvidenceClass::Operation => EvidenceClass::Operation,
            CoreEvidenceClass::Payload => EvidenceClass::Payload,
            CoreEvidenceClass::PolicyRevision => EvidenceClass::PolicyRevision,
            CoreEvidenceClass::Proposal => EvidenceClass::Proposal,
            CoreEvidenceClass::ProposalStateBasis => EvidenceClass::ProposalStateBasis,
            CoreEvidenceClass::TrustedContext => EvidenceClass::TrustedContext,
        }
        .into(),
        detail: gap.detail,
        reason: match gap.reason {
            CoreGapReason::Corrupt => GapReason::Corrupt,
            CoreGapReason::Missing => GapReason::Missing,
            CoreGapReason::Redacted => GapReason::Redacted,
            CoreGapReason::Unavailable => GapReason::Unavailable,
        }
        .into(),
        reference: Some(to_reference(gap.reference)).into(),
        ..Default::default()
    }
}

fn to_reference(reference: CoreCausalReference) -> CausalReference {
    CausalReference {
        reference: Some(match reference {
            CoreCausalReference::Action(id) => {
                causal_reference::Reference::ActionId(id.as_str().to_owned())
            }
            CoreCausalReference::Approval(id) => {
                causal_reference::Reference::ApprovalId(id.as_str().to_owned())
            }
            CoreCausalReference::Claim(id) => {
                causal_reference::Reference::ClaimId(id.as_str().to_owned())
            }
            CoreCausalReference::Definition(reference) => causal_reference::Reference::Definition(
                Box::new(to_definition_reference(reference)),
            ),
            CoreCausalReference::EffectAttempt(id) => {
                causal_reference::Reference::EffectAttemptId(id.as_str().to_owned())
            }
            CoreCausalReference::EffectEvidence(id) => {
                causal_reference::Reference::EffectEvidenceId(id.as_str().to_owned())
            }
            CoreCausalReference::EffectRequest(id) => {
                causal_reference::Reference::EffectRequestId(id.as_str().to_owned())
            }
            CoreCausalReference::Operation(id) => {
                causal_reference::Reference::OperationId(id.as_str().to_owned())
            }
            CoreCausalReference::Policy(policy) => {
                causal_reference::Reference::Policy(Box::new(to_policy_revision(policy)))
            }
            CoreCausalReference::Proposal(id) => {
                causal_reference::Reference::ProposalId(id.as_str().to_owned())
            }
            CoreCausalReference::StateBasis(digest) => {
                causal_reference::Reference::StateBasisDigest(digest.as_str().to_owned())
            }
        }),
        ..Default::default()
    }
}

fn to_policy_revision(revision: CorePolicyRevision) -> PolicyRevision {
    PolicyRevision {
        digest: revision.digest.as_str().to_owned(),
        policy_id: revision.id.as_str().to_owned(),
        revision: revision.revision.get(),
        ..Default::default()
    }
}

fn to_target(target: CoreTarget) -> ExplanationTarget {
    ExplanationTarget {
        target: Some(match target {
            CoreTarget::Operation(id) => {
                explanation_target::Target::OperationId(id.as_str().to_owned())
            }
            CoreTarget::Claim(id) => explanation_target::Target::ClaimId(id.as_str().to_owned()),
            CoreTarget::EffectRequest(id) => {
                explanation_target::Target::EffectRequestId(id.as_str().to_owned())
            }
            CoreTarget::Decision(DecisionReference::Proposal(id)) => {
                explanation_target::Target::ProposalId(id.as_str().to_owned())
            }
        }),
        ..Default::default()
    }
}

fn map_history_error(error: HistoryError) -> ConnectError {
    match error {
        HistoryError::Store(error) => crate::service::map_store_error(error),
    }
}
