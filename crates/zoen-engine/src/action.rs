use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::Arc;

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionDefinition, ActionId, ActionInput, ActionProposal, ApprovalId,
    CanonicalDefinition, ClaimId, CommitIdentityKind, CommitReceipt, ComponentExecutionEvidence,
    Consistency, DefinitionReference, DefinitionRevision, EffectRequestId, EntityId,
    EvidenceDigest, EvidenceDraft, EvidenceProvenance, ExactValue, ExecutionContext, IntentDigest,
    LineageRole, OperationId, PolicyEvaluation, PolicyEvidence, PreconditionEvaluation,
    PrincipalId, ProposalAuthority, ProposalId, RelationId, RelationTarget, ResourceId,
    SemanticQuery, SemanticResult, SemanticSelection, SemanticValue, StateBasis, StateBasisDigest,
    StateDependency, TenantId, TimestampMicros, TrustedExecutionContext, TypeId, ValidTime,
    ValueType, evaluate_expression, expression_relations,
};

use crate::action_preview::{bind_preview_hash, build_action_preview, preview_hash};
use crate::{AdmittedEvidence, AuthorityStore, StoreError, admission, decode_canonical_definition};

mod state_basis;

pub use state_basis::{
    ActionStateRead, ActionStateSnapshot, SemanticClaim, evaluate_action_state_basis,
    evaluate_semantic_claims, read_action_state_basis,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PolicyOperation {
    ActivateRevision,
    ApplyMigrationBatch,
    Approve,
    Commit,
    Discover,
    PrepareMigration,
    RequestApproval,
    RollbackRevision,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyMembershipProjection {
    pub principal_id: PrincipalId,
    pub tenant_id: TenantId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyLinkProjection {
    pub relation_id: RelationId,
    pub targets: Vec<EntityId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyObjectProjection {
    pub entity_id: EntityId,
    pub links: Vec<PolicyLinkProjection>,
    pub object_type: Option<TypeId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyWorldProjection {
    pub membership: PolicyMembershipProjection,
    pub neighbors: Vec<PolicyObjectProjection>,
    pub resource: PolicyObjectProjection,
}

#[derive(Clone, Debug)]
pub struct PolicyRequest<'a> {
    pub action_id: &'a ActionId,
    pub approved: bool,
    pub classification: Option<zoen_core::EvolutionClassification>,
    pub context: &'a TrustedExecutionContext,
    pub definition: &'a DefinitionReference,
    pub inputs: &'a [ActionInput],
    pub operation: PolicyOperation,
    pub projection: Option<&'a PolicyWorldProjection>,
    pub resource_id: &'a ResourceId,
}

#[allow(async_fn_in_trait)]
pub trait PolicyEvaluator: Send + Sync {
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation;
}

impl<T> PolicyEvaluator for Arc<T>
where
    T: PolicyEvaluator + ?Sized,
{
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation {
        self.as_ref().evaluate(request).await
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QueryPortError {
    Corrupt(String),
    Evaluation(String),
    Invalid(String),
    Unavailable(String),
}

impl Display for QueryPortError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Corrupt(message) => write!(formatter, "query data is corrupt: {message}"),
            Self::Evaluation(message) => write!(formatter, "query evaluation failed: {message}"),
            Self::Invalid(message) => write!(formatter, "invalid semantic query: {message}"),
            Self::Unavailable(message) => write!(formatter, "query source unavailable: {message}"),
        }
    }
}

impl Error for QueryPortError {}

#[allow(async_fn_in_trait)]
pub trait QueryExecutor: Send + Sync {
    async fn execute(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
    ) -> Result<SemanticResult, QueryPortError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionDiscovery {
    pub action_id: ActionId,
    pub evaluation: PolicyEvaluation,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposeOutcome {
    Accepted(Box<ActionProposal>),
    Denied(PolicyEvidence),
    PreconditionDenied(StateBasis),
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ApproveOutcome {
    Approved(ActionApproval),
    Denied(PolicyEvidence),
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitOutcome {
    Committed(Box<CommitReceipt>),
    Denied(PolicyEvidence),
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
    },
    IdentityCollision(CommitIdentityKind),
    OperationMismatch,
    PreviewMismatch,
    Stale(StateBasis),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitStoreOutcome {
    Committed(Box<CommitReceipt>),
    IdentityCollision(CommitIdentityKind),
    OperationMismatch,
    Stale(StateBasis),
}

pub enum CommitPreparation<T> {
    OperationMismatch,
    Ready(T),
    Replayed(Box<CommitReceipt>),
}

#[allow(async_fn_in_trait)]
pub trait ActionCommitTransaction: Send {
    async fn commit(self, plan: &CommitPlan) -> Result<CommitStoreOutcome, StoreError>;
    async fn rollback(self) -> Result<(), StoreError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionCommitEffect {
    pub effect_request_id: EffectRequestId,
    pub evidence: AdmittedEvidence,
    pub request_payload: Vec<u8>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitPlan {
    pub effects: Vec<ActionCommitEffect>,
    pub policy: PolicyEvidence,
    pub proposal: ActionProposal,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionError {
    ApprovalExpired,
    ApprovalOutsideBounds,
    Definition(String),
    DelegationDenied,
    Evaluation(String),
    ExpiredProposal,
    InactiveDefinition,
    Input(String),
    Store(StoreError),
}

impl Display for ActionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ApprovalExpired => formatter.write_str("approval expiry must be in the future"),
            Self::ApprovalOutsideBounds => {
                formatter.write_str("approval expiry exceeds proposal or delegation bounds")
            }
            Self::Definition(message) => write!(formatter, "invalid Action definition: {message}"),
            Self::DelegationDenied => {
                formatter.write_str("trusted delegation does not permit this Action and resource")
            }
            Self::Evaluation(message) => write!(formatter, "Action evaluation failed: {message}"),
            Self::ExpiredProposal => formatter.write_str("Action proposal has expired"),
            Self::InactiveDefinition => {
                formatter.write_str("Action proposals require the active definition revision")
            }
            Self::Input(message) => write!(formatter, "invalid Action input: {message}"),
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for ActionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::ApprovalExpired
            | Self::ApprovalOutsideBounds
            | Self::Definition(_)
            | Self::DelegationDenied
            | Self::Evaluation(_)
            | Self::ExpiredProposal
            | Self::InactiveDefinition
            | Self::Input(_) => None,
        }
    }
}

pub struct ActionEngine<S, Q, P> {
    policy: P,
    query: Q,
    store: S,
}

pub struct ProposeCommand {
    pub action_id: ActionId,
    pub definition: DefinitionReference,
    pub execution: Option<ComponentExecutionEvidence>,
    pub expires_at: TimestampMicros,
    pub inputs: Vec<ActionInput>,
    pub operation_id: OperationId,
    pub proposal_id: ProposalId,
    pub proposed_at: TimestampMicros,
    pub resource_id: ResourceId,
    pub valid_at: TimestampMicros,
}

impl<S, Q, P> ActionEngine<S, Q, P>
where
    S: AuthorityStore,
    Q: QueryExecutor,
    P: PolicyEvaluator,
{
    pub fn new(store: S, query: Q, policy: P) -> Self {
        Self {
            policy,
            query,
            store,
        }
    }

    pub async fn discover(
        &self,
        context: &TrustedExecutionContext,
        definition: &DefinitionReference,
        resource_id: &ResourceId,
        at: TimestampMicros,
    ) -> Result<Vec<ActionDiscovery>, ActionError> {
        let canonical = self
            .store
            .get_active_revision(context.tenant_id(), &definition.definition_id)
            .await
            .map_err(ActionError::Store)?
            .ok_or(ActionError::InactiveDefinition)?;
        if canonical.digest != definition.digest || canonical.revision != definition.revision {
            return Err(ActionError::InactiveDefinition);
        }
        let decoded = decode_canonical_definition(&canonical.canonical_json)
            .map_err(|error| ActionError::Definition(error.to_string()))?;
        let mut discoveries = Vec::with_capacity(decoded.actions.len());
        for action in &decoded.actions {
            if !context
                .delegation()
                .permits(&action.id, resource_id, context.workload_id(), at)
            {
                continue;
            }
            let projection = self
                .load_world_projection(context, &decoded, &canonical, action, resource_id, at)
                .await?;
            let evaluation = self
                .policy
                .evaluate(&PolicyRequest {
                    action_id: &action.id,
                    approved: false,
                    classification: None,
                    context,
                    definition,
                    inputs: &[],
                    operation: PolicyOperation::Discover,
                    projection: Some(&projection),
                    resource_id,
                })
                .await;
            discoveries.push(ActionDiscovery {
                action_id: action.id.clone(),
                evaluation,
            });
        }
        Ok(discoveries)
    }

    pub async fn propose(
        &self,
        context: &TrustedExecutionContext,
        command: ProposeCommand,
    ) -> Result<ProposeOutcome, ActionError> {
        if command.proposed_at >= command.expires_at {
            return Err(ActionError::ExpiredProposal);
        }
        authorize_delegation(
            context,
            &command.action_id,
            &command.resource_id,
            command.proposed_at,
        )?;
        let loaded = self
            .load_action(context, &command.definition, &command.action_id)
            .await?;
        validate_inputs(&loaded.action, &command.inputs)?;
        let precondition = self
            .evaluate_precondition(
                context,
                &command.resource_id,
                &loaded,
                &command.inputs,
                command.valid_at,
            )
            .await?;
        let state_basis = match precondition {
            PreconditionEvaluation::Satisfied(state_basis) => state_basis,
            PreconditionEvaluation::Unsatisfied(state_basis) => {
                return Ok(ProposeOutcome::PreconditionDenied(state_basis));
            }
        };
        let projection = self
            .load_world_projection(
                context,
                &loaded.definition,
                &loaded.revision,
                &loaded.action,
                &command.resource_id,
                command.valid_at,
            )
            .await?;
        let direct = self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &command.action_id,
                approved: false,
                classification: None,
                context,
                definition: &command.definition,
                inputs: &command.inputs,
                operation: PolicyOperation::Commit,
                projection: Some(&projection),
                resource_id: &command.resource_id,
            })
            .await;
        let authority = match direct {
            PolicyEvaluation::Permit(evidence) => ProposalAuthority::Ready(evidence),
            PolicyEvaluation::EvaluationError { message, revision } => {
                return Ok(ProposeOutcome::EvaluationError {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
            PolicyEvaluation::Deny(_) => {
                match self
                    .policy
                    .evaluate(&PolicyRequest {
                        action_id: &command.action_id,
                        approved: false,
                        classification: None,
                        context,
                        definition: &command.definition,
                        inputs: &command.inputs,
                        operation: PolicyOperation::RequestApproval,
                        projection: Some(&projection),
                        resource_id: &command.resource_id,
                    })
                    .await
                {
                    PolicyEvaluation::Permit(evidence) => {
                        ProposalAuthority::AwaitingApproval(evidence)
                    }
                    PolicyEvaluation::Deny(evidence) => {
                        return Ok(ProposeOutcome::Denied(evidence));
                    }
                    PolicyEvaluation::EvaluationError { message, revision } => {
                        return Ok(ProposeOutcome::EvaluationError {
                            message,
                            policy: revision.map(|revision| PolicyEvidence {
                                determining_policies: Vec::new(),
                                revision,
                            }),
                        });
                    }
                }
            }
        };
        let intent_digest = intent_digest(context, &command, &state_basis)?;
        let preview =
            build_action_preview(&command.action_id, &command.resource_id, &command.inputs);
        let preview_hash = preview_hash(&preview)?;
        let proposal = ActionProposal {
            action_id: command.action_id,
            authority,
            canonical_preview_text: preview.canonical_preview_text,
            definition: command.definition,
            execution: command.execution,
            expires_at: command.expires_at,
            inputs: command.inputs,
            intent_digest,
            operation_id: command.operation_id,
            preview_hash,
            proposal_id: command.proposal_id,
            proposed_at: command.proposed_at,
            proposed_by: context.clone(),
            resource_id: command.resource_id,
            state_basis,
            valid_at: command.valid_at,
        };
        let saved = self
            .store
            .save_proposal(context, &proposal)
            .await
            .map_err(ActionError::Store)?;
        Ok(ProposeOutcome::Accepted(Box::new(saved)))
    }

    pub async fn approve(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
        approval_id: ApprovalId,
        approved_at: TimestampMicros,
        expires_at: TimestampMicros,
    ) -> Result<ApproveOutcome, ActionError> {
        let proposal = self
            .store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)?;
        if approved_at >= expires_at {
            return Err(ActionError::ApprovalExpired);
        }
        if expires_at > proposal.expires_at
            || context
                .delegation()
                .grants()
                .last()
                .is_none_or(|grant| expires_at > grant.expires_at())
        {
            return Err(ActionError::ApprovalOutsideBounds);
        }
        authorize_delegation(
            context,
            &proposal.action_id,
            &proposal.resource_id,
            approved_at,
        )?;
        let loaded = self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await?;
        let projection = self
            .load_world_projection(
                context,
                &loaded.definition,
                &loaded.revision,
                &loaded.action,
                &proposal.resource_id,
                proposal.valid_at,
            )
            .await?;
        match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &proposal.action_id,
                approved: false,
                classification: None,
                context,
                definition: &proposal.definition,
                inputs: &proposal.inputs,
                operation: PolicyOperation::Approve,
                projection: Some(&projection),
                resource_id: &proposal.resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => {
                let approval = ActionApproval {
                    approval_id,
                    approved_at,
                    approved_by: context.clone(),
                    expires_at,
                    policy,
                    proposal_id: proposal.proposal_id,
                };
                let saved = self
                    .store
                    .save_approval(context, &approval)
                    .await
                    .map_err(ActionError::Store)?;
                Ok(ApproveOutcome::Approved(saved))
            }
            PolicyEvaluation::Deny(evidence) => Ok(ApproveOutcome::Denied(evidence)),
            PolicyEvaluation::EvaluationError { message, revision } => {
                Ok(ApproveOutcome::EvaluationError {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                })
            }
        }
    }

    pub async fn commit(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
        operation_id: &OperationId,
        preview_hash: Option<&str>,
        committed_at: TimestampMicros,
    ) -> Result<CommitOutcome, ActionError> {
        let proposal = self
            .store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)?;
        if &proposal.operation_id != operation_id {
            return Ok(CommitOutcome::OperationMismatch);
        }
        if bind_preview_hash(&proposal.preview_hash, preview_hash).is_err() {
            return Ok(CommitOutcome::PreviewMismatch);
        }
        let transaction = match self
            .store
            .begin_action_commit(context, &proposal)
            .await
            .map_err(ActionError::Store)?
        {
            crate::CommitPreparation::OperationMismatch => {
                return Ok(CommitOutcome::OperationMismatch);
            }
            crate::CommitPreparation::Ready(transaction) => transaction,
            crate::CommitPreparation::Replayed(receipt) => {
                return Ok(CommitOutcome::Committed(receipt));
            }
        };
        if committed_at >= proposal.expires_at {
            transaction.rollback().await.map_err(ActionError::Store)?;
            return Err(ActionError::ExpiredProposal);
        }
        if let Err(error) = authorize_delegation(
            context,
            &proposal.action_id,
            &proposal.resource_id,
            committed_at,
        ) {
            transaction.rollback().await.map_err(ActionError::Store)?;
            return Err(error);
        }
        let approval = match &proposal.authority {
            ProposalAuthority::Ready(_) => None,
            ProposalAuthority::AwaitingApproval(_) => {
                let approval = self
                    .store
                    .get_approval(context, &proposal.proposal_id)
                    .await
                    .map_err(ActionError::Store)?;
                match approval {
                    Some(approval) if committed_at < approval.expires_at => Some(approval),
                    _ => {
                        transaction.rollback().await.map_err(ActionError::Store)?;
                        return Err(ActionError::ApprovalExpired);
                    }
                }
            }
        };
        let loaded = match self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await
        {
            Ok(loaded) => loaded,
            Err(error) => {
                transaction.rollback().await.map_err(ActionError::Store)?;
                return Err(error);
            }
        };
        let projection = match self
            .load_world_projection(
                context,
                &loaded.definition,
                &loaded.revision,
                &loaded.action,
                &proposal.resource_id,
                proposal.valid_at,
            )
            .await
        {
            Ok(projection) => projection,
            Err(error) => {
                transaction.rollback().await.map_err(ActionError::Store)?;
                return Err(error);
            }
        };
        let policy = match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &proposal.action_id,
                approved: approval.is_some(),
                classification: None,
                context,
                definition: &proposal.definition,
                inputs: &proposal.inputs,
                operation: PolicyOperation::Commit,
                projection: Some(&projection),
                resource_id: &proposal.resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(evidence) => evidence,
            PolicyEvaluation::Deny(evidence) => {
                transaction.rollback().await.map_err(ActionError::Store)?;
                return Ok(CommitOutcome::Denied(evidence));
            }
            PolicyEvaluation::EvaluationError { message, revision } => {
                transaction.rollback().await.map_err(ActionError::Store)?;
                return Ok(CommitOutcome::EvaluationError {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
        };
        let relation_ids = effect_evaluation_relations(&loaded.action);
        let snapshot = self
            .load_relation_snapshot(
                context,
                &loaded.revision,
                &proposal.resource_id,
                relation_ids,
                proposal.valid_at,
                "Action effect relations used different authority cuts",
            )
            .await?;
        let relation_values =
            read_action_state_basis(&loaded.action, &loaded.definition, snapshot)?.values;
        let human_request_payload = if crate::is_human_executor_action(&proposal.action_id) {
            Some(
                crate::mint_human_task_contract_payload(&proposal)
                    .map_err(|error| ActionError::Evaluation(error.to_string()))?,
            )
        } else {
            None
        };
        let effects = build_effects(&proposal, &loaded.action, &relation_values)?
            .into_iter()
            .enumerate()
            .map(|(index, draft)| {
                let evidence = admission::admit_action_effect(&loaded.revision, draft)
                    .map_err(|error| ActionError::Evaluation(error.to_string()))?;
                let request_payload = human_request_payload
                    .clone()
                    .unwrap_or_else(|| evidence.projection_event().payload().as_bytes().to_vec());
                Ok(ActionCommitEffect {
                    effect_request_id: effect_request_id(&proposal.operation_id, index)?,
                    evidence,
                    request_payload,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        match transaction
            .commit(&CommitPlan {
                effects,
                policy,
                proposal,
            })
            .await
            .map_err(ActionError::Store)?
        {
            CommitStoreOutcome::Committed(receipt) => Ok(CommitOutcome::Committed(receipt)),
            CommitStoreOutcome::IdentityCollision(kind) => {
                Ok(CommitOutcome::IdentityCollision(kind))
            }
            CommitStoreOutcome::OperationMismatch => Ok(CommitOutcome::OperationMismatch),
            CommitStoreOutcome::Stale(basis) => Ok(CommitOutcome::Stale(basis)),
        }
    }

    pub async fn operation_status(
        &self,
        context: &TrustedExecutionContext,
        operation_id: &OperationId,
    ) -> Result<CommitReceipt, ActionError> {
        self.store
            .get_operation(context, operation_id)
            .await
            .map_err(ActionError::Store)
    }

    async fn load_action(
        &self,
        context: &TrustedExecutionContext,
        definition: &DefinitionReference,
        action_id: &ActionId,
    ) -> Result<LoadedAction, ActionError> {
        let revision = self
            .store
            .get_revision(
                context.tenant_id(),
                &definition.definition_id,
                &definition.digest,
            )
            .await
            .map_err(ActionError::Store)?;
        if revision.revision != definition.revision {
            return Err(ActionError::Definition(
                "definition digest and revision do not match".to_owned(),
            ));
        }
        let decoded = decode_canonical_definition(&revision.canonical_json)
            .map_err(|error| ActionError::Definition(error.to_string()))?;
        let action = decoded
            .actions
            .iter()
            .find(|action| action.id == *action_id)
            .cloned()
            .ok_or_else(|| {
                ActionError::Definition(format!("definition has no Action: {action_id}"))
            })?;
        Ok(LoadedAction {
            action,
            definition: decoded,
            revision,
        })
    }

    async fn evaluate_precondition(
        &self,
        context: &TrustedExecutionContext,
        resource_id: &ResourceId,
        loaded: &LoadedAction,
        inputs: &[ActionInput],
        valid_at: TimestampMicros,
    ) -> Result<PreconditionEvaluation, ActionError> {
        let snapshot = self
            .load_relation_snapshot(
                context,
                &loaded.revision,
                resource_id,
                expression_relations(&loaded.action.precondition),
                valid_at,
                "Action precondition relations used different authority cuts",
            )
            .await?;
        evaluate_action_state_basis(&loaded.action, &loaded.definition, inputs, snapshot)
    }

    async fn load_relation_snapshot(
        &self,
        context: &TrustedExecutionContext,
        revision: &DefinitionRevision,
        resource_id: &ResourceId,
        relations: BTreeSet<RelationId>,
        valid_at: TimestampMicros,
        authority_cut_error: &'static str,
    ) -> Result<ActionStateSnapshot, ActionError> {
        let entity_id = EntityId::parse(resource_id.as_str())
            .map_err(|error| ActionError::Input(error.to_string()))?;
        let mut values = BTreeMap::<RelationId, Vec<SemanticValue>>::new();
        let mut observed = None;
        for relation_id in relations {
            let consistency = match observed {
                Some(cut) => Consistency::Snapshot(cut),
                None => Consistency::Strong,
            };
            let result = self
                .query
                .execute(
                    context,
                    &SemanticQuery::ByEntity {
                        consistency,
                        definition: DefinitionReference {
                            definition_id: revision.definition_id.clone(),
                            digest: revision.digest.clone(),
                            revision: revision.revision,
                        },
                        entity_id: entity_id.clone(),
                        selection: SemanticSelection::Relation(relation_id.clone()),
                        valid_at,
                    },
                )
                .await
                .map_err(|error| ActionError::Evaluation(error.to_string()))?;
            if observed.is_some_and(|cut| cut != result.actual_commit_sequence) {
                return Err(ActionError::Evaluation(authority_cut_error.to_owned()));
            }
            observed = Some(result.actual_commit_sequence);
            values.insert(relation_id, result.values);
        }
        Ok(ActionStateSnapshot {
            observed_commit_sequence: observed.unwrap_or(revision.commit_sequence),
            relations: values,
        })
    }

    async fn load_world_projection(
        &self,
        context: &TrustedExecutionContext,
        definition: &CanonicalDefinition,
        revision: &DefinitionRevision,
        action: &ActionDefinition,
        resource_id: &ResourceId,
        valid_at: TimestampMicros,
    ) -> Result<PolicyWorldProjection, ActionError> {
        let entity_id = EntityId::parse(resource_id.as_str())
            .map_err(|error| ActionError::Input(error.to_string()))?;
        let object_type = action_resource_type(action, definition);
        let mut link_relations = BTreeSet::new();
        if let Some(object_type) = &object_type {
            for relation in &definition.relations {
                if relation.source_type == *object_type
                    && matches!(relation.target, RelationTarget::Type(_))
                {
                    link_relations.insert(relation.id.clone());
                }
            }
        }
        let snapshot = self
            .load_relation_snapshot(
                context,
                revision,
                resource_id,
                link_relations,
                valid_at,
                "Action policy projection relations used different authority cuts",
            )
            .await?;
        let mut seen = BTreeSet::from([entity_id.clone()]);
        let mut neighbors = Vec::new();
        let mut links = Vec::new();
        if let Some(object_type) = &object_type {
            for relation in &definition.relations {
                if relation.source_type != *object_type {
                    continue;
                }
                let RelationTarget::Type(target_type) = &relation.target else {
                    continue;
                };
                let mut targets = Vec::new();
                for value in snapshot.relations.get(&relation.id).into_iter().flatten() {
                    let ExactValue::Entity(target) = &value.value else {
                        continue;
                    };
                    if seen.insert(target.clone()) {
                        neighbors.push(PolicyObjectProjection {
                            entity_id: target.clone(),
                            links: Vec::new(),
                            object_type: Some(target_type.clone()),
                        });
                    }
                    targets.push(target.clone());
                }
                if !targets.is_empty() {
                    links.push(PolicyLinkProjection {
                        relation_id: relation.id.clone(),
                        targets,
                    });
                }
            }
        }
        Ok(PolicyWorldProjection {
            membership: PolicyMembershipProjection {
                principal_id: context.principal_id().clone(),
                tenant_id: context.tenant_id().clone(),
            },
            neighbors,
            resource: PolicyObjectProjection {
                entity_id,
                links,
                object_type,
            },
        })
    }
}

fn action_resource_type(
    action: &ActionDefinition,
    definition: &CanonicalDefinition,
) -> Option<TypeId> {
    let mut types = BTreeSet::new();
    let mut relation_ids = expression_relations(&action.precondition);
    relation_ids.extend(
        action
            .effects
            .iter()
            .map(|effect| effect.relation_id.clone()),
    );
    for relation_id in relation_ids {
        if let Some(relation) = definition
            .relations
            .iter()
            .find(|relation| relation.id == relation_id)
        {
            types.insert(relation.source_type.clone());
        }
    }
    if types.len() == 1 {
        types.pop_first()
    } else {
        None
    }
}

struct LoadedAction {
    action: ActionDefinition,
    definition: CanonicalDefinition,
    revision: DefinitionRevision,
}

fn authorize_delegation(
    context: &TrustedExecutionContext,
    action_id: &ActionId,
    resource_id: &ResourceId,
    at: TimestampMicros,
) -> Result<(), ActionError> {
    if context
        .delegation()
        .permits(action_id, resource_id, context.workload_id(), at)
    {
        Ok(())
    } else {
        Err(ActionError::DelegationDenied)
    }
}

fn validate_inputs(action: &ActionDefinition, inputs: &[ActionInput]) -> Result<(), ActionError> {
    let mut supplied = BTreeMap::new();
    for input in inputs {
        if supplied.insert(&input.id, &input.value).is_some() {
            return Err(ActionError::Input(format!("duplicate input {}", input.id)));
        }
    }
    for expected in &action.inputs {
        let value = supplied
            .get(&expected.id)
            .ok_or_else(|| ActionError::Input(format!("missing input {}", expected.id.as_str())))?;
        if !value_matches(&expected.value_type, value) {
            return Err(ActionError::Input(format!(
                "input {} has the wrong value type",
                expected.id.as_str()
            )));
        }
    }
    if supplied.len() != action.inputs.len() {
        return Err(ActionError::Input(
            "request contains an undeclared input".to_owned(),
        ));
    }
    Ok(())
}

fn value_matches(value_type: &ValueType, value: &ExactValue) -> bool {
    match (value_type, value) {
        (ValueType::Bool, ExactValue::Bool(_))
        | (ValueType::Decimal, ExactValue::Decimal(_))
        | (ValueType::Entity { .. }, ExactValue::Entity(_))
        | (ValueType::Integer, ExactValue::Integer(_))
        | (ValueType::Text, ExactValue::Text(_)) => true,
        (ValueType::Quantity { unit: expected }, ExactValue::Quantity { unit: actual, .. }) => {
            expected == actual
        }
        _ => false,
    }
}

pub fn calculate_state_basis_digest(
    dependencies: &[StateDependency],
) -> Result<StateBasisDigest, ActionError> {
    let mut hasher = Sha256::new();
    for dependency in dependencies {
        hash_field(&mut hasher, dependency.claim_id.as_str());
        hash_field(&mut hasher, &dependency.commit_sequence.get().to_string());
        hash_field(&mut hasher, dependency.entity_id.as_str());
        hash_field(&mut hasher, dependency.relation_id.as_str());
        hash_field(&mut hasher, lineage_role_name(dependency.role));
        hash_field(&mut hasher, dependency.source_digest.as_str());
        hash_field(&mut hasher, dependency.source_id.as_str());
        hash_field(&mut hasher, &dependency.source_ref);
    }
    StateBasisDigest::parse(hex_digest(hasher.finalize()))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

pub fn state_basis_digest_matches(
    dependencies: &[StateDependency],
    expected: &StateBasisDigest,
) -> Result<bool, ActionError> {
    Ok(calculate_state_basis_digest(dependencies)? == *expected)
}

fn intent_digest(
    context: &TrustedExecutionContext,
    command: &ProposeCommand,
    state_basis: &StateBasis,
) -> Result<IntentDigest, ActionError> {
    let mut hasher = Sha256::new();
    hash_field(&mut hasher, context.tenant_id().as_str());
    hash_field(&mut hasher, command.definition.definition_id.as_str());
    hash_field(&mut hasher, command.definition.digest.as_str());
    hash_field(&mut hasher, &command.definition.revision.get().to_string());
    hash_field(&mut hasher, command.action_id.as_str());
    hash_field(&mut hasher, command.resource_id.as_str());
    hash_field(&mut hasher, &command.valid_at.get().to_string());
    if let Some(execution) = &command.execution {
        hash_field(&mut hasher, execution.execution_id().as_str());
        hash_field(&mut hasher, execution.component_digest().as_str());
        hash_field(&mut hasher, execution.interface().as_str());
        hash_field(&mut hasher, execution.capability_manifest_digest().as_str());
        for capability_id in execution.capability_ids() {
            hash_field(&mut hasher, capability_id.as_str());
        }
    }
    let mut inputs = command.inputs.iter().collect::<Vec<_>>();
    inputs.sort_by(|left, right| left.id.cmp(&right.id));
    for input in inputs {
        hash_field(&mut hasher, input.id.as_str());
        hash_field(&mut hasher, &value_key(&input.value));
    }
    hash_field(&mut hasher, state_basis.digest.as_str());
    IntentDigest::parse(hex_digest(hasher.finalize()))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

fn build_effects(
    proposal: &ActionProposal,
    action: &ActionDefinition,
    relations: &BTreeMap<RelationId, Vec<SemanticValue>>,
) -> Result<Vec<EvidenceDraft>, ActionError> {
    let inputs = proposal
        .inputs
        .iter()
        .map(|input| (input.id.clone(), input.value.clone()))
        .collect::<BTreeMap<_, _>>();
    let resource = EntityId::parse(proposal.resource_id.as_str())
        .map_err(|error| ActionError::Evaluation(error.to_string()))?;
    action
        .effects
        .iter()
        .enumerate()
        .map(|(index, effect)| {
            let values = evaluate_expression(&effect.value, &inputs, relations)
                .map_err(|error| ActionError::Evaluation(error.to_string()))?;
            let [value] = values.as_slice() else {
                return Err(ActionError::Evaluation(
                    "Action effect must produce exactly one value".to_owned(),
                ));
            };
            Ok(EvidenceDraft {
                claim_id: ClaimId::parse(format!(
                    "claim.action.{}.{}",
                    proposal.operation_id.as_str(),
                    index
                ))
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                definition: proposal.definition.clone(),
                entity_id: resource.clone(),
                provenance: EvidenceProvenance {
                    ingested_at: None,
                    observed_at: None,
                    source_digest: EvidenceDigest::parse(proposal.intent_digest.as_str())
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_id: zoen_core::SourceId::parse("zoen.action")
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_ref: format!("urn:zoen:proposal:{}", proposal.proposal_id.as_str()),
                },
                relation_id: effect.relation_id.clone(),
                valid_time: ValidTime::instant(proposal.valid_at),
                value: value.value.clone(),
            })
        })
        .collect()
}

fn effect_evaluation_relations(action: &ActionDefinition) -> BTreeSet<RelationId> {
    let mut relations = expression_relations(&action.precondition);
    relations.extend(
        action
            .effects
            .iter()
            .flat_map(|effect| expression_relations(&effect.value)),
    );
    relations
}

fn effect_request_id(
    operation_id: &OperationId,
    index: usize,
) -> Result<EffectRequestId, ActionError> {
    EffectRequestId::parse(format!("effect.action.{}.{}", operation_id.as_str(), index))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

fn value_key(value: &ExactValue) -> String {
    match value {
        ExactValue::Bool(value) => format!("bool:{value}"),
        ExactValue::Decimal(value) => format!("decimal:{}", value.as_str()),
        ExactValue::Entity(value) => format!("entity:{}", value.as_str()),
        ExactValue::Integer(value) => format!("integer:{}", value.as_str()),
        ExactValue::Quantity { amount, unit } => {
            format!("quantity:{}:{}", amount.as_str(), unit.as_str())
        }
        ExactValue::Text(value) => format!("text:{value}"),
    }
}

fn hash_field(hasher: &mut Sha256, value: &str) {
    hasher.update(value.len().to_be_bytes());
    hasher.update(value.as_bytes());
}

fn lineage_role_name(role: LineageRole) -> &'static str {
    match role {
        LineageRole::ComputationDependency => "computation_dependency",
        LineageRole::Rival => "rival",
        LineageRole::Supporting => "supporting",
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
    use zoen_core::{
        ActionEffect, ActionInput, BinaryOperator, CommitSequence, ExactDecimal, Expression,
        InputDefinition, InputId, SourceId, TypeId, UnitId,
    };

    use super::*;

    #[test]
    fn legacy_state_basis_digest_is_rejected_after_rehash() {
        let dependency = StateDependency {
            claim_id: ClaimId::parse("claim.available.legacy").expect("claim"),
            commit_sequence: CommitSequence::new(7).expect("commit sequence"),
            entity_id: EntityId::parse("inventory.item.1").expect("entity"),
            relation_id: RelationId::parse("inventory.available").expect("relation"),
            role: LineageRole::Supporting,
            source_digest: EvidenceDigest::parse("a".repeat(64)).expect("source digest"),
            source_id: SourceId::parse("source.legacy").expect("source"),
            source_ref: "urn:legacy:available".to_owned(),
        };
        let legacy = StateBasisDigest::parse(
            "8ebb0d95ed2d1236760a0d9b59ef6557dda60807aa7b155771b241ed0b5b9b85",
        )
        .expect("legacy digest");
        let current = StateBasisDigest::parse(
            "a9648fdbe91735d691111f00502696633bbc1f13dc4853d6c605c0bde49feac8",
        )
        .expect("current digest");

        assert_eq!(
            calculate_state_basis_digest(&[dependency.clone()]).expect("current digest"),
            current
        );
        assert!(
            !state_basis_digest_matches(&[dependency.clone()], &legacy)
                .expect("legacy must not verify")
        );
        assert!(state_basis_digest_matches(&[dependency], &current).expect("current must verify"));
    }

    #[test]
    fn effect_relation_reads_use_precondition_dependencies() {
        let relation_id = RelationId::parse("inventory.reserved").expect("relation");
        let action = ActionDefinition {
            effects: vec![ActionEffect {
                relation_id: relation_id.clone(),
                value: Expression::Binary {
                    left: Box::new(Expression::Relation(relation_id.clone())),
                    operator: BinaryOperator::Add,
                    right: Box::new(Expression::Literal(ExactValue::Quantity {
                        amount: ExactDecimal::parse("1").expect("quantity"),
                        unit: UnitId::parse("each").expect("unit"),
                    })),
                },
            }],
            id: ActionId::parse("inventory.reserve").expect("action"),
            inputs: Vec::new(),
            outputs: Vec::new(),
            precondition: Expression::Binary {
                left: Box::new(Expression::Relation(relation_id.clone())),
                operator: BinaryOperator::GreaterThan,
                right: Box::new(Expression::Literal(ExactValue::Quantity {
                    amount: ExactDecimal::parse("0").expect("quantity"),
                    unit: UnitId::parse("each").expect("unit"),
                })),
            },
        };

        assert_eq!(
            effect_evaluation_relations(&action),
            BTreeSet::from([relation_id])
        );
    }

    #[test]
    fn effect_relation_reads_join_precondition_and_effect_snapshots() {
        let available_id = RelationId::parse("inventory.available").expect("relation");
        let reserved_id = RelationId::parse("inventory.reserved").expect("relation");
        let action = ActionDefinition {
            effects: vec![ActionEffect {
                relation_id: reserved_id.clone(),
                value: Expression::Relation(reserved_id.clone()),
            }],
            id: ActionId::parse("inventory.reserve").expect("action"),
            inputs: Vec::new(),
            outputs: Vec::new(),
            precondition: Expression::Binary {
                left: Box::new(Expression::Relation(available_id.clone())),
                operator: BinaryOperator::GreaterThan,
                right: Box::new(Expression::Literal(ExactValue::Quantity {
                    amount: ExactDecimal::parse("0").expect("quantity"),
                    unit: UnitId::parse("each").expect("unit"),
                })),
            },
        };

        assert_eq!(
            effect_evaluation_relations(&action),
            BTreeSet::from([available_id, reserved_id])
        );
    }

    #[test]
    fn validate_inputs_accepts_entity_and_rejects_text() {
        let location = InputId::parse("location").expect("input");
        let action = ActionDefinition {
            effects: vec![ActionEffect {
                relation_id: RelationId::parse("inventory.location").expect("relation"),
                value: Expression::Input(location.clone()),
            }],
            id: ActionId::parse("inventory.assignLocation").expect("action"),
            inputs: vec![InputDefinition {
                id: location.clone(),
                value_type: ValueType::Entity {
                    type_id: TypeId::parse("inventory.Location").expect("type"),
                },
            }],
            outputs: Vec::new(),
            precondition: Expression::Literal(ExactValue::Bool(true)),
        };
        let entity = ActionInput {
            id: location.clone(),
            value: ExactValue::Entity(EntityId::parse("inventory.location.wh-1").expect("entity")),
        };
        assert!(validate_inputs(&action, &[entity]).is_ok());
        let text = ActionInput {
            id: location,
            value: ExactValue::Text("wh-1".to_owned()),
        };
        let error = validate_inputs(&action, &[text]).expect_err("text is not an entity");
        assert!(
            matches!(error, ActionError::Input(message) if message.contains("wrong value type"))
        );
    }
}
