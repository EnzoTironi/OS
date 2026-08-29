use buffa::MessageView;
use connectrpc::{ConnectError, RequestContext, Response, ServiceRequest, ServiceResult};
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::{
    ActionProposal as CoreActionProposal, ActionProposalStructure,
    CausalActionExplanation as CoreCausalActionExplanation,
    CausalActionInput as CoreCausalActionInput, CausalActionProposal as CoreCausalActionProposal,
    CausalClaim as CoreCausalClaim, CausalClaimExplanation as CoreCausalClaimExplanation,
    CausalCommit as CoreCausalCommit, CausalEffect as CoreCausalEffect,
    CausalEffectRequestStructure, CausalExplanation as CoreCausalExplanation,
    CausalMigration as CoreCausalMigration, CausalReference as CoreCausalReference,
    CausalStateBasis as CoreCausalStateBasis, DecisionReference,
    DefinitionEvidence as CoreDefinitionEvidence,
    EffectDispatchEvidence as CoreEffectDispatchEvidence,
    EffectDispatchOutcome as CoreEffectDispatchOutcome, EffectRequest as CoreEffectRequest,
    EvidenceClass as CoreEvidenceClass, ExplanationGap as CoreExplanationGap, ExplanationPayload,
    ExplanationSubject, ExplanationTarget as CoreTarget, GapReason as CoreGapReason,
    PayloadRedaction as CorePayloadRedaction, PolicyDecisionEvidence as CorePolicyDecisionEvidence,
    PolicyDecisionStage as CorePolicyDecisionStage, PolicyEvidence as CorePolicyEvidence,
    PolicyRevision as CorePolicyRevision, RedactionReason as CoreRedactionReason,
    StateBasisStage as CoreStateBasisStage, ValidTime as CoreValidTime,
};
use zoen_engine::{HistoryEngine, HistoryError};

use crate::action_service::{
    to_approval, to_commit_receipt, to_policy_evidence, to_proposal, to_state_basis,
    to_trusted_context,
};
use crate::effect_service::{to_attempt, to_evidence, to_reconciliation, to_request};
use crate::proto::zoen::action::v1::PolicyRevision;
use crate::proto::zoen::history::v1::{
    CausalActionExplanation, CausalActionInput, CausalActionProposal, CausalClaim,
    CausalClaimExplanation, CausalCommit, CausalEffect, CausalEffectRequest, CausalExplanation,
    CausalMigration, CausalReference, CausalStateBasis, DefinitionEvidence, EffectDispatchEvidence,
    EffectDispatchOutcome, EvidenceClass, ExplainRequest, ExplainResponse, ExplanationGap,
    ExplanationTarget, GapReason, HistoryService, PayloadRedaction, PolicyDecisionEvidence,
    PolicyDecisionStage, RedactionReason, StateBasisStage, causal_action_input, causal_claim,
    causal_effect_request, causal_explanation, causal_reference, explanation_target,
};
use crate::proto::zoen::world::v1::{
    EvidenceClaim as ProtocolEvidenceClaim, EvidenceProvenance, MigrationOrigin, TemporalInterval,
    ValidTime as ProtocolValidTime, valid_time,
};
use crate::session::SessionExchange;
use crate::world_service::{invalid, to_definition_reference, to_exact_value, to_timestamp};

pub struct HistoryServiceImpl {
    engine: HistoryEngine<PostgresAuthorityStore>,
    sessions: SessionExchange,
}

impl HistoryServiceImpl {
    pub fn new(engine: HistoryEngine<PostgresAuthorityStore>, sessions: SessionExchange) -> Self {
        Self { engine, sessions }
    }
}

impl HistoryService for HistoryServiceImpl {
    async fn explain(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ExplainRequest>,
    ) -> ServiceResult<ExplainResponse> {
        let trusted = {
            let tenant = SessionExchange::tenant_from_header(&context)?;
            self.sessions
                .resolve(SessionExchange::bearer_from(&context), tenant.as_ref())
                .await?
        };
        let target = request
            .target
            .as_option()
            .ok_or_else(|| invalid("explanation target is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let target = parse_target(target)?;
        let explanation = self
            .engine
            .explain(&trusted, target)
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
                causal_explanation::Subject::Claim(Box::new(to_claim_explanation(*claim)))
            }
        }),
        target: Some(to_target(explanation.target)).into(),
        ..Default::default()
    }
}

fn to_action(action: CoreCausalActionExplanation) -> CausalActionExplanation {
    let proposed_by = to_trusted_context(&action.proposal.structure.proposed_by);
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
        proposal: Some(to_causal_proposal(action.proposal)).into(),
        proposal_state_basis: Some(to_causal_state_basis(action.proposal_state_basis)).into(),
        proposed_by: Some(proposed_by).into(),
        ..Default::default()
    }
}

fn to_causal_proposal(proposal: CoreCausalActionProposal) -> CausalActionProposal {
    let ActionProposalStructure {
        action_id,
        authority,
        definition,
        execution,
        expires_at,
        intent_digest,
        operation_id,
        proposal_id,
        proposed_at,
        proposed_by,
        resource_id,
        state_basis,
        valid_at,
    } = proposal.structure;
    let structure = to_proposal(CoreActionProposal {
        action_id,
        authority,
        canonical_preview_text: String::new(),
        definition,
        execution,
        expires_at,
        inputs: Vec::new(),
        intent_digest,
        operation_id,
        preview_hash: zoen_core::ActionPreviewHash::parse(
            "0000000000000000000000000000000000000000000000000000000000000000",
        )
        .expect("history preview hash placeholder"),
        proposal_id,
        proposed_at,
        proposed_by,
        resource_id,
        state_basis,
        valid_at,
    });
    CausalActionProposal {
        inputs: proposal
            .inputs
            .into_iter()
            .map(to_causal_action_input)
            .collect(),
        structure: Some(structure).into(),
        ..Default::default()
    }
}

fn to_causal_action_input(input: CoreCausalActionInput) -> CausalActionInput {
    CausalActionInput {
        input_id: input.id.as_str().to_owned(),
        payload: Some(match input.payload {
            ExplanationPayload::Value(value) => {
                causal_action_input::Payload::Value(Box::new(to_exact_value(value)))
            }
            ExplanationPayload::Redacted(redaction) => {
                causal_action_input::Payload::Redaction(Box::new(to_payload_redaction(redaction)))
            }
        }),
        ..Default::default()
    }
}

fn to_claim_explanation(explanation: CoreCausalClaimExplanation) -> CausalClaimExplanation {
    CausalClaimExplanation {
        claim: Some(to_causal_claim(explanation.claim)).into(),
        definition: explanation.definition.map(to_definition).into(),
        migration: explanation.migration.map(to_migration).into(),
        ..Default::default()
    }
}

fn to_migration(migration: CoreCausalMigration) -> CausalMigration {
    CausalMigration {
        origin: Some(MigrationOrigin {
            operation_id: migration.origin.operation_id.as_str().to_owned(),
            rule_id: migration.origin.rule_id.as_str().to_owned(),
            rule_kind: migration.origin.kind.as_str().to_owned(),
            source_claim_ids: migration
                .origin
                .source_claim_ids
                .iter()
                .map(|claim_id| claim_id.as_str().to_owned())
                .collect(),
            ..Default::default()
        })
        .into(),
        source_claims: migration
            .source_claims
            .into_iter()
            .map(to_causal_claim)
            .collect(),
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
    let structure = causal.structure;
    let payload = match causal.payload {
        ExplanationPayload::Value(value) => {
            causal_claim::Payload::Value(Box::new(to_exact_value(value)))
        }
        ExplanationPayload::Redacted(redaction) => {
            causal_claim::Payload::Redaction(Box::new(to_payload_redaction(redaction)))
        }
    };
    CausalClaim {
        commit_sequence: structure.commit_sequence.get(),
        payload: Some(payload),
        structure: Some(ProtocolEvidenceClaim {
            claim_id: structure.claim_id.as_str().to_owned(),
            definition: Some(to_definition_reference(structure.definition)).into(),
            entity_id: structure.entity_id.as_str().to_owned(),
            provenance: Some(EvidenceProvenance {
                ingested_at: structure.provenance.ingested_at.map(to_timestamp).into(),
                observed_at: structure.provenance.observed_at.map(to_timestamp).into(),
                source_digest: structure.provenance.source_digest.as_str().to_owned(),
                source_id: structure.provenance.source_id.as_str().to_owned(),
                source_ref: structure.provenance.source_ref,
                ..Default::default()
            })
            .into(),
            relation_id: structure.relation_id.as_str().to_owned(),
            valid_time: Some(to_valid_time(structure.valid_time)).into(),
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
    let CausalEffectRequestStructure {
        commit_sequence,
        effect_request_id,
        idempotency_key,
        intent_digest,
        operation_id,
        request_digest,
        state,
    } = effect.request.structure;
    let request = to_request(CoreEffectRequest {
        commit_sequence,
        effect_request_id,
        idempotency_key,
        intent_digest,
        operation_id,
        payload: Vec::new(),
        request_digest,
        state,
    });
    CausalEffect {
        attempts: effect.attempts.into_iter().map(to_attempt).collect(),
        dispatches: effect.dispatches.into_iter().map(to_dispatch).collect(),
        evidence: effect.evidence.into_iter().map(to_evidence).collect(),
        reconciliations: effect
            .reconciliations
            .into_iter()
            .map(to_reconciliation)
            .collect(),
        request: Some(CausalEffectRequest {
            payload: Some(match effect.request.payload {
                ExplanationPayload::Value(value) => causal_effect_request::Payload::Value(value),
                ExplanationPayload::Redacted(redaction) => {
                    causal_effect_request::Payload::Redaction(Box::new(to_payload_redaction(
                        redaction,
                    )))
                }
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
