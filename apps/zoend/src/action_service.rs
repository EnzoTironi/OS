use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use buffa::MessageView;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::{CedarPolicyEvaluator, PostgresAuthorityStore};
use zoen_core::{
    ActionApproval, ActionInput as CoreActionInput, ActionProposal, ApprovalId,
    CommitIdentityKind as CoreCommitIdentityKind, CommitReceipt,
    ComponentExecutionEvidence as CoreComponentExecutionEvidence, LineageRole as CoreLineageRole,
    OperationId, PolicyEvaluation, PolicyEvidence as CorePolicyEvidence, ProposalAuthority,
    ProposalId, ResourceId, StateBasis as CoreStateBasis, TimestampMicros, TrustedExecutionContext,
};
use zoen_engine::{
    ActionEngine, ActionError, ApproveOutcome, CommitOutcome, ProposeCommand, ProposeOutcome,
    StoreError,
};
use zoen_query::QueryRuntime;

use crate::auth::SessionRegistry;
use crate::proto::zoen::action::v1::{
    ActionCapability, ActionInput, ActionService, Approval, ApproveRequest, ApproveResponse,
    CommitIdentityKind, CommitReceipt as ProtocolCommitReceipt, CommitRequest, CommitResponse,
    CommitStatus, ComponentExecutionEvidence, DelegationGrant, DiscoverRequest, DiscoverResponse,
    GetOperationStatusRequest, GetOperationStatusResponse, PolicyDecision, PolicyEvidence,
    PolicyRevision, Proposal, ProposalStatus, ProposeRequest, ProposeResponse, StateBasis,
    StateDependency, TrustedContext,
};
use crate::world_service::{
    invalid, parse_definition_reference, parse_exact_value, parse_timestamp,
    to_definition_reference, to_exact_value, to_timestamp,
};

pub struct ActionServiceImpl {
    engine: ActionEngine<PostgresAuthorityStore, QueryRuntime, Arc<CedarPolicyEvaluator>>,
    sessions: SessionRegistry,
}

impl ActionServiceImpl {
    pub fn new(
        engine: ActionEngine<PostgresAuthorityStore, QueryRuntime, Arc<CedarPolicyEvaluator>>,
        sessions: SessionRegistry,
    ) -> Self {
        Self { engine, sessions }
    }
}

impl ActionService for ActionServiceImpl {
    async fn discover(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, DiscoverRequest>,
    ) -> ServiceResult<DiscoverResponse> {
        let trusted = self.sessions.trusted_context(&context).await?;
        let definition = request
            .definition
            .as_option()
            .ok_or_else(|| invalid("definition is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let definition = parse_definition_reference(&definition)?;
        let resource_id =
            ResourceId::parse(request.resource_id).map_err(|error| invalid(error.to_string()))?;
        let actions = self
            .engine
            .discover(&trusted, &definition, &resource_id, now()?)
            .await
            .map_err(map_action_error)?
            .into_iter()
            .map(|discovery| to_capability(discovery.action_id.as_str(), discovery.evaluation))
            .collect();
        Response::ok(DiscoverResponse {
            actions,
            trusted_context: Some(to_trusted_context(&trusted)).into(),
            ..Default::default()
        })
    }

    async fn propose(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ProposeRequest>,
    ) -> ServiceResult<ProposeResponse> {
        let trusted = self.sessions.trusted_context(&context).await?;
        let definition = request
            .definition
            .as_option()
            .ok_or_else(|| invalid("definition is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let valid_at = request
            .valid_at
            .as_option()
            .ok_or_else(|| invalid("valid_at is required"))?;
        let expires_at = request
            .expires_at
            .as_option()
            .ok_or_else(|| invalid("expires_at is required"))?;
        let inputs = request
            .inputs
            .iter()
            .map(|input| {
                let value = input
                    .value
                    .as_option()
                    .ok_or_else(|| invalid("Action input value is required"))?
                    .to_owned_message()
                    .map_err(|error| invalid(error.to_string()))?;
                Ok(CoreActionInput {
                    id: zoen_core::InputId::parse(input.input_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    value: parse_exact_value(&value)?,
                })
            })
            .collect::<Result<Vec<_>, ConnectError>>()?;
        let valid_at = valid_at
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let expires_at = expires_at
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let proposed_at = now()?;
        let outcome = self
            .engine
            .propose(
                &trusted,
                ProposeCommand {
                    action_id: zoen_core::ActionId::parse(request.action_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    definition: parse_definition_reference(&definition)?,
                    execution: None,
                    expires_at: parse_timestamp(&expires_at)?,
                    inputs,
                    operation_id: OperationId::parse(request.operation_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    proposal_id: ProposalId::parse(request.proposal_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    proposed_at,
                    resource_id: ResourceId::parse(request.resource_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    valid_at: parse_timestamp(&valid_at)?,
                },
            )
            .await
            .map_err(map_action_error)?;
        let trusted_context = Some(to_trusted_context(&trusted)).into();
        match outcome {
            ProposeOutcome::Accepted(proposal) => Response::ok(ProposeResponse {
                decision: PolicyDecision::Permit.into(),
                proposal: Some(to_proposal(*proposal)).into(),
                trusted_context,
                ..Default::default()
            }),
            ProposeOutcome::Denied(policy) => Response::ok(ProposeResponse {
                decision: PolicyDecision::Deny.into(),
                policy: Some(to_policy_evidence(policy)).into(),
                trusted_context,
                ..Default::default()
            }),
            ProposeOutcome::PreconditionDenied(state_basis) => Response::ok(ProposeResponse {
                decision: PolicyDecision::Deny.into(),
                state_basis: Some(to_state_basis(state_basis)).into(),
                trusted_context,
                ..Default::default()
            }),
            ProposeOutcome::EvaluationError { message, policy } => Response::ok(ProposeResponse {
                decision: PolicyDecision::EvaluationError.into(),
                evaluation_error: message,
                policy: policy.map(to_policy_evidence).into(),
                trusted_context,
                ..Default::default()
            }),
        }
    }

    async fn approve(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ApproveRequest>,
    ) -> ServiceResult<ApproveResponse> {
        let trusted = self.sessions.trusted_context(&context).await?;
        let expires_at = request
            .expires_at
            .as_option()
            .ok_or_else(|| invalid("expires_at is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let outcome = self
            .engine
            .approve(
                &trusted,
                &ProposalId::parse(request.proposal_id)
                    .map_err(|error| invalid(error.to_string()))?,
                ApprovalId::parse(request.approval_id)
                    .map_err(|error| invalid(error.to_string()))?,
                now()?,
                parse_timestamp(&expires_at)?,
            )
            .await
            .map_err(map_action_error)?;
        match outcome {
            ApproveOutcome::Approved(approval) => Response::ok(ApproveResponse {
                approval: Some(to_approval(approval)).into(),
                decision: PolicyDecision::Permit.into(),
                ..Default::default()
            }),
            ApproveOutcome::Denied(policy) => Response::ok(ApproveResponse {
                decision: PolicyDecision::Deny.into(),
                policy: Some(to_policy_evidence(policy)).into(),
                ..Default::default()
            }),
            ApproveOutcome::EvaluationError { message, policy } => Response::ok(ApproveResponse {
                decision: PolicyDecision::EvaluationError.into(),
                evaluation_error: message,
                policy: policy.map(to_policy_evidence).into(),
                ..Default::default()
            }),
        }
    }

    async fn commit(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, CommitRequest>,
    ) -> ServiceResult<CommitResponse> {
        let trusted = self.sessions.trusted_context(&context).await?;
        let proposal_id =
            ProposalId::parse(request.proposal_id).map_err(|error| invalid(error.to_string()))?;
        let operation_id =
            OperationId::parse(request.operation_id).map_err(|error| invalid(error.to_string()))?;
        let outcome = self
            .engine
            .commit(&trusted, &proposal_id, &operation_id, now()?)
            .await;
        match outcome {
            Ok(CommitOutcome::Committed(receipt)) => Response::ok(CommitResponse {
                receipt: Some(to_commit_receipt(*receipt)).into(),
                status: CommitStatus::Committed.into(),
                ..Default::default()
            }),
            Ok(CommitOutcome::Stale(current)) => Response::ok(CommitResponse {
                current_state_basis: Some(to_state_basis(current)).into(),
                status: CommitStatus::Stale.into(),
                ..Default::default()
            }),
            Ok(CommitOutcome::Denied(policy)) => Response::ok(CommitResponse {
                policy: Some(to_policy_evidence(policy)).into(),
                status: CommitStatus::Denied.into(),
                ..Default::default()
            }),
            Ok(CommitOutcome::EvaluationError { message, policy }) => {
                Response::ok(CommitResponse {
                    error: message,
                    policy: policy.map(to_policy_evidence).into(),
                    status: CommitStatus::EvaluationError.into(),
                    ..Default::default()
                })
            }
            Ok(CommitOutcome::IdentityCollision(kind)) => Response::ok(CommitResponse {
                collision_kind: to_commit_identity_kind(kind).into(),
                status: CommitStatus::IdentityCollision.into(),
                ..Default::default()
            }),
            Ok(CommitOutcome::OperationMismatch) => Response::ok(CommitResponse {
                status: CommitStatus::OperationMismatch.into(),
                ..Default::default()
            }),
            Err(ActionError::Store(StoreError::Conflict(message))) => {
                Response::ok(CommitResponse {
                    error: message,
                    status: CommitStatus::Conflict.into(),
                    ..Default::default()
                })
            }
            Err(error) => Err(map_action_error(error)),
        }
    }

    async fn get_operation_status(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, GetOperationStatusRequest>,
    ) -> ServiceResult<GetOperationStatusResponse> {
        let trusted = self.sessions.trusted_context(&context).await?;
        let operation_id =
            OperationId::parse(request.operation_id).map_err(|error| invalid(error.to_string()))?;
        let receipt = self
            .engine
            .operation_status(&trusted, &operation_id)
            .await
            .map_err(map_action_error)?;
        Response::ok(GetOperationStatusResponse {
            receipt: Some(to_commit_receipt(receipt)).into(),
            status: CommitStatus::Committed.into(),
            ..Default::default()
        })
    }
}

fn to_capability(action_id: &str, evaluation: PolicyEvaluation) -> ActionCapability {
    match evaluation {
        PolicyEvaluation::Permit(policy) => ActionCapability {
            action_id: action_id.to_owned(),
            decision: PolicyDecision::Permit.into(),
            policy: Some(to_policy_evidence(policy)).into(),
            ..Default::default()
        },
        PolicyEvaluation::Deny(policy) => ActionCapability {
            action_id: action_id.to_owned(),
            decision: PolicyDecision::Deny.into(),
            policy: Some(to_policy_evidence(policy)).into(),
            ..Default::default()
        },
        PolicyEvaluation::EvaluationError { message, revision } => ActionCapability {
            action_id: action_id.to_owned(),
            decision: PolicyDecision::EvaluationError.into(),
            evaluation_error: message,
            policy: revision
                .map(|revision| {
                    to_policy_evidence(CorePolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    })
                })
                .into(),
            ..Default::default()
        },
    }
}

pub(crate) fn to_trusted_context(context: &TrustedExecutionContext) -> TrustedContext {
    TrustedContext {
        actor_id: context.actor_id().as_str().to_owned(),
        delegation: context
            .delegation()
            .grants()
            .iter()
            .map(|grant| DelegationGrant {
                action_ids: grant
                    .actions()
                    .iter()
                    .map(|id| id.as_str().to_owned())
                    .collect(),
                delegation_id: grant.id().as_str().to_owned(),
                expires_at: Some(to_timestamp(grant.expires_at())).into(),
                not_before: Some(to_timestamp(grant.not_before())).into(),
                resource_ids: grant
                    .resources()
                    .iter()
                    .map(|id| id.as_str().to_owned())
                    .collect(),
                workload_ids: grant
                    .workloads()
                    .iter()
                    .map(|id| id.as_str().to_owned())
                    .collect(),
                ..Default::default()
            })
            .collect(),
        principal_id: context.principal_id().as_str().to_owned(),
        tenant_id: context.tenant_id().as_str().to_owned(),
        workload_id: context.workload_id().as_str().to_owned(),
        ..Default::default()
    }
}

pub(crate) fn to_policy_evidence(evidence: CorePolicyEvidence) -> PolicyEvidence {
    PolicyEvidence {
        determining_policy_ids: evidence.determining_policies,
        revision: Some(PolicyRevision {
            digest: evidence.revision.digest.as_str().to_owned(),
            policy_id: evidence.revision.id.as_str().to_owned(),
            revision: evidence.revision.revision.get(),
            ..Default::default()
        })
        .into(),
        ..Default::default()
    }
}

pub(crate) fn to_proposal(proposal: ActionProposal) -> Proposal {
    let (status, policy) = match &proposal.authority {
        ProposalAuthority::AwaitingApproval(policy) => {
            (ProposalStatus::AwaitingApproval, policy.clone())
        }
        ProposalAuthority::Ready(policy) => (ProposalStatus::Ready, policy.clone()),
    };
    Proposal {
        action_id: proposal.action_id.as_str().to_owned(),
        definition: Some(to_definition_reference(proposal.definition)).into(),
        execution: proposal.execution.map(to_component_execution).into(),
        expires_at: Some(to_timestamp(proposal.expires_at)).into(),
        inputs: proposal
            .inputs
            .into_iter()
            .map(|input| ActionInput {
                input_id: input.id.as_str().to_owned(),
                value: Some(to_exact_value(input.value)).into(),
                ..Default::default()
            })
            .collect(),
        intent_digest: proposal.intent_digest.as_str().to_owned(),
        operation_id: proposal.operation_id.as_str().to_owned(),
        policy: Some(to_policy_evidence(policy)).into(),
        proposal_id: proposal.proposal_id.as_str().to_owned(),
        proposed_at: Some(to_timestamp(proposal.proposed_at)).into(),
        proposed_by: proposal.proposed_by.actor_id().as_str().to_owned(),
        resource_id: proposal.resource_id.as_str().to_owned(),
        state_basis: Some(to_state_basis(proposal.state_basis)).into(),
        status: status.into(),
        valid_at: Some(to_timestamp(proposal.valid_at)).into(),
        ..Default::default()
    }
}

pub(crate) fn to_component_execution(
    evidence: CoreComponentExecutionEvidence,
) -> ComponentExecutionEvidence {
    ComponentExecutionEvidence {
        capability_ids: evidence
            .capability_ids()
            .iter()
            .map(|capability| capability.as_str().to_owned())
            .collect(),
        capability_manifest_digest: evidence.capability_manifest_digest().as_str().to_owned(),
        component_digest: evidence.component_digest().as_str().to_owned(),
        component_interface: evidence.interface().as_str().to_owned(),
        execution_id: evidence.execution_id().as_str().to_owned(),
        ..Default::default()
    }
}

pub(crate) fn to_approval(approval: ActionApproval) -> Approval {
    Approval {
        approval_id: approval.approval_id.as_str().to_owned(),
        approved_at: Some(to_timestamp(approval.approved_at)).into(),
        approved_by: approval.approved_by.actor_id().as_str().to_owned(),
        expires_at: Some(to_timestamp(approval.expires_at)).into(),
        policy: Some(to_policy_evidence(approval.policy)).into(),
        proposal_id: approval.proposal_id.as_str().to_owned(),
        ..Default::default()
    }
}

pub(crate) fn to_state_basis(state_basis: CoreStateBasis) -> StateBasis {
    StateBasis {
        dependencies: state_basis
            .dependencies
            .into_iter()
            .map(|dependency| StateDependency {
                claim_id: dependency.claim_id.as_str().to_owned(),
                commit_sequence: dependency.commit_sequence.get(),
                entity_id: dependency.entity_id.as_str().to_owned(),
                relation_id: dependency.relation_id.as_str().to_owned(),
                role: match dependency.role {
                    CoreLineageRole::ComputationDependency => {
                        crate::proto::zoen::world::v1::LineageRole::ComputationDependency
                    }
                    CoreLineageRole::Rival => crate::proto::zoen::world::v1::LineageRole::Rival,
                    CoreLineageRole::Supporting => {
                        crate::proto::zoen::world::v1::LineageRole::Supporting
                    }
                }
                .into(),
                source_digest: dependency.source_digest.as_str().to_owned(),
                source_id: dependency.source_id.as_str().to_owned(),
                source_ref: dependency.source_ref,
                ..Default::default()
            })
            .collect(),
        digest: state_basis.digest.as_str().to_owned(),
        observed_commit_sequence: state_basis.observed_commit_sequence.get(),
        ..Default::default()
    }
}

pub(crate) fn to_commit_receipt(receipt: CommitReceipt) -> ProtocolCommitReceipt {
    ProtocolCommitReceipt {
        action_id: receipt.action_id.as_str().to_owned(),
        commit_sequence: receipt.commit_sequence.get(),
        commit_state_basis: receipt.commit_state_basis.map(to_state_basis).into(),
        definition: Some(to_definition_reference(receipt.definition)).into(),
        effect_request_ids: receipt
            .effect_request_ids
            .into_iter()
            .map(|id| id.as_str().to_owned())
            .collect(),
        intent_digest: receipt.intent_digest.as_str().to_owned(),
        operation_id: receipt.operation_id.as_str().to_owned(),
        policy: Some(to_policy_evidence(receipt.policy)).into(),
        proposal_id: receipt.proposal_id.as_str().to_owned(),
        record_ids: receipt
            .record_ids
            .into_iter()
            .map(|id| id.as_str().to_owned())
            .collect(),
        ..Default::default()
    }
}

fn to_commit_identity_kind(kind: CoreCommitIdentityKind) -> CommitIdentityKind {
    match kind {
        CoreCommitIdentityKind::EffectRequest => CommitIdentityKind::EffectRequest,
        CoreCommitIdentityKind::SemanticRecord => CommitIdentityKind::SemanticRecord,
    }
}

fn now() -> Result<TimestampMicros, ConnectError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    let micros = i64::try_from(duration.as_micros())
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    Ok(TimestampMicros::new(micros))
}

fn map_action_error(error: ActionError) -> ConnectError {
    let code = match &error {
        ActionError::ApprovalExpired
        | ActionError::ApprovalOutsideBounds
        | ActionError::Evaluation(_)
        | ActionError::ExpiredProposal
        | ActionError::InactiveDefinition => ErrorCode::FailedPrecondition,
        ActionError::Definition(_) | ActionError::Input(_) => ErrorCode::InvalidArgument,
        ActionError::DelegationDenied => ErrorCode::PermissionDenied,
        ActionError::Store(error) => return crate::service::map_store_error(error.clone()),
    };
    ConnectError::new(code, error.to_string())
}
