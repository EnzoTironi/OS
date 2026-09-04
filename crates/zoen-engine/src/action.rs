use std::{
    collections::{BTreeMap, BTreeSet},
    error::Error,
    fmt::{Display, Formatter},
    sync::Arc,
};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionDefinition, ActionId, ActionInput, ActionProposal, ApprovalId,
    CanonicalDefinition, ClaimId, ClassificationToken, CommitIdentityKind, CommitReceipt,
    ComponentExecutionEvidence, Consistency, DefinitionId, DefinitionReference, DefinitionRevision,
    EffectRequestId, EntityId, EvidenceDigest, EvidenceDraft, EvidenceProvenance, ExactValue,
    ExecutionContext, IntentDigest, LineageRole, OperationId, PolicyEvaluation, PolicyEvidence,
    PreconditionEvaluation, PrincipalId, ProposalAuthority, ProposalId, RelationId, RelationTarget,
    ResourceId, ScenarioId, SemanticQuery, SemanticResult, SemanticSelection, SemanticValue,
    StateBasis, StateBasisDigest, StateDependency, TenantId, TimestampMicros,
    TrustedExecutionContext, TypeId, ValidTime, WORLD_SHARE_ACTION, classified_as_relation,
    encode_hex, evaluate_expression, expression_relations, join_labels,
};

use crate::{
    AdmittedEvidence, AuthorityStore, StoreError,
    action_preview::{bind_proposal_preview, build_action_preview, preview_hash},
    admission, decode_canonical_definition,
};

mod state_basis;

pub use state_basis::{
    ActionStateRead, ActionStateSnapshot, SemanticClaim, evaluate_action_state_basis,
    evaluate_semantic_claims, read_action_state_basis,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PolicyOperation {
    ActivateRelease,
    ActivateRevision,
    ApplyMigrationBatch,
    Approve,
    Commit,
    Decide,
    DecideRelease,
    Discover,
    Execute,
    Explain,
    PrepareMigration,
    PreviewRelease,
    Propose,
    PublishRelease,
    PublishDefinition,
    Query,
    Read,
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
    pub classification: BTreeSet<ClassificationToken>,
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
    pub written_classification: Option<&'a BTreeSet<ClassificationToken>>,
}

pub(crate) struct LoadRelationSnapshotRequest<'a> {
    pub context: &'a TrustedExecutionContext,
    pub revision: &'a DefinitionRevision,
    pub resource_id: &'a ResourceId,
    pub relations: BTreeSet<RelationId>,
    pub scenario_id: Option<ScenarioId>,
    pub valid_at: TimestampMicros,
    pub authority_cut_error: &'static str,
}

pub(crate) struct LoadWorldProjectionRequest<'a> {
    pub context: &'a TrustedExecutionContext,
    pub definition: &'a CanonicalDefinition,
    pub revision: &'a DefinitionRevision,
    pub action: &'a ActionDefinition,
    pub resource_id: &'a ResourceId,
    pub scenario_id: Option<ScenarioId>,
    pub valid_at: TimestampMicros,
}

pub trait PolicyEvaluator: Send + Sync {
    fn evaluate(
        &self,
        request: &PolicyRequest<'_>,
    ) -> impl std::future::Future<Output = PolicyEvaluation> + Send;
}

impl<T> PolicyEvaluator for Arc<T>
where
    T: PolicyEvaluator + ?Sized,
{
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation {
        self.as_ref().evaluate(request).await
    }
}

/// Build a directory-only policy projection for a resource.
///
/// # Errors
///
/// Returns an error when `resource_id` is not a valid entity id.
pub fn directory_projection(
    context: &TrustedExecutionContext,
    resource_id: &ResourceId,
) -> Result<PolicyWorldProjection, String> {
    let entity_id = EntityId::parse(resource_id.as_str()).map_err(|error| error.to_string())?;
    Ok(PolicyWorldProjection {
        membership: PolicyMembershipProjection {
            principal_id: context.principal_id().clone(),
            tenant_id: context.tenant_id().clone(),
        },
        neighbors: Vec::new(),
        resource: PolicyObjectProjection {
            classification: BTreeSet::new(),
            entity_id,
            links: Vec::new(),
            object_type: None,
        },
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QueryPortError {
    Corrupt(String),
    Evaluation(String),
    Freshness {
        available: Option<u64>,
        requested: u64,
    },
    Invalid(String),
    Unavailable(String),
}

impl Display for QueryPortError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Corrupt(message) => write!(formatter, "query data is corrupt: {message}"),
            Self::Evaluation(message) => write!(formatter, "query evaluation failed: {message}"),
            Self::Freshness {
                available,
                requested,
            } => write!(
                formatter,
                "projection watermark {available:?} is below requested commit {requested}"
            ),
            Self::Invalid(message) => write!(formatter, "invalid semantic query: {message}"),
            Self::Unavailable(message) => write!(formatter, "query source unavailable: {message}"),
        }
    }
}

impl Error for QueryPortError {}

pub trait QueryExecutor: Send + Sync {
    fn execute(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
    ) -> impl std::future::Future<Output = Result<SemanticResult, QueryPortError>> + Send;
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
    PreviewMismatch,
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

enum StartedCommit<T> {
    Outcome(CommitOutcome),
    Ready {
        proposal: Box<ActionProposal>,
        transaction: T,
    },
}

async fn abort_commit<T: ActionCommitTransaction>(
    transaction: T,
    outcome: Result<CommitOutcome, ActionError>,
) -> Result<CommitOutcome, ActionError> {
    transaction.rollback().await.map_err(ActionError::Store)?;
    outcome
}

pub trait ActionCommitTransaction: Send {
    fn commit(
        self,
        plan: &CommitPlan,
    ) -> impl std::future::Future<Output = Result<CommitStoreOutcome, StoreError>> + Send;
    fn rollback(self) -> impl std::future::Future<Output = Result<(), StoreError>> + Send;
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
    pub scenario_id: Option<ScenarioId>,
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

    pub(crate) fn policy(&self) -> &P {
        &self.policy
    }

    pub(crate) async fn preview_overlay_drafts(
        &self,
        context: &TrustedExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<Vec<EvidenceDraft>, ActionError> {
        let loaded = self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await?;
        let relation_ids = effect_evaluation_relations(&loaded.action);
        let snapshot = self
            .load_relation_snapshot(LoadRelationSnapshotRequest {
                context,
                revision: &loaded.revision,
                resource_id: &proposal.resource_id,
                relations: relation_ids,
                scenario_id: proposal.scenario_id.clone(),
                valid_at: proposal.valid_at,
                authority_cut_error: "Action effect relations used different authority cuts",
            })
            .await?;
        let relation_values =
            read_action_state_basis(&loaded.action, &loaded.definition, &snapshot)?.values;
        let join = self
            .join_input_labels(context, proposal, &loaded.definition, &loaded.revision)
            .await?;
        share_or_join_effects(
            build_effects(proposal, &loaded.action, &relation_values)?,
            proposal,
            join.as_ref(),
        )
    }

    /// Discover Actions the caller may request on a resource.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError`] when the definition is inactive, decoding fails, or the store fails.
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
            if !delegation_allows(
                context,
                &action.id,
                resource_id,
                &definition.definition_id,
                at,
            ) {
                continue;
            }
            let projection = self
                .load_world_projection(LoadWorldProjectionRequest {
                    context,
                    definition: &decoded,
                    revision: &canonical,
                    action,
                    resource_id,
                    scenario_id: None,
                    valid_at: at,
                })
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
                    written_classification: None,
                })
                .await;
            discoveries.push(ActionDiscovery {
                action_id: action.id.clone(),
                evaluation,
            });
        }
        Ok(discoveries)
    }

    /// Propose an Action. Direct commit or approval is decided by policy.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError`] when the proposal is expired, inputs are invalid, delegation
    /// denies the Action, evaluation fails, or the store fails.
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
            &command.definition.definition_id,
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
                command.scenario_id.clone(),
                command.valid_at,
            )
            .await?;
        let state_basis = match precondition {
            PreconditionEvaluation::Satisfied(state_basis) => state_basis,
            PreconditionEvaluation::Unsatisfied(state_basis) => {
                return Ok(ProposeOutcome::PreconditionDenied(state_basis));
            }
        };
        let authority = match self
            .resolve_propose_authority(context, &command, &loaded)
            .await?
        {
            Ok(authority) => authority,
            Err(outcome) => return Ok(outcome),
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
            scenario_id: command.scenario_id,
            state_basis,
            valid_at: command.valid_at,
        };
        let saved = if proposal.scenario_id.is_some() {
            let drafts = self.preview_overlay_drafts(context, &proposal).await?;
            self.store
                .save_proposal_in_scenario(context, &proposal, &drafts)
                .await
                .map_err(ActionError::Store)?
        } else {
            self.store
                .save_proposal(context, &proposal)
                .await
                .map_err(ActionError::Store)?
        };
        Ok(ProposeOutcome::Accepted(Box::new(saved)))
    }

    /// Record an approval for a proposal that is awaiting approval.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError`] when approval bounds are invalid, delegation denies the Action,
    /// or the store fails.
    pub async fn approve(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
        approval_id: ApprovalId,
        approved_at: TimestampMicros,
        expires_at: TimestampMicros,
        preview_hash: Option<&str>,
    ) -> Result<ApproveOutcome, ActionError> {
        let proposal = self
            .store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)?;
        if bind_proposal_preview(
            &proposal.action_id,
            &proposal.resource_id,
            &proposal.inputs,
            &proposal.preview_hash,
            &proposal.canonical_preview_text,
            preview_hash,
        )
        .is_err()
        {
            return Ok(ApproveOutcome::PreviewMismatch);
        }
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
            &proposal.definition.definition_id,
            approved_at,
        )?;
        let loaded = self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await?;
        let projection = self
            .load_world_projection(LoadWorldProjectionRequest {
                context,
                definition: &loaded.definition,
                revision: &loaded.revision,
                action: &loaded.action,
                resource_id: &proposal.resource_id,
                scenario_id: proposal.scenario_id.clone(),
                valid_at: proposal.valid_at,
            })
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
                written_classification: None,
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
                    policy: policy_from_revision(revision),
                })
            }
        }
    }

    /// Commit an accepted proposal under a held operation lock.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError`] when the store fails, the proposal is expired, approval is
    /// missing or expired, delegation does not permit the Action, or effect assembly fails.
    pub async fn commit(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
        operation_id: &OperationId,
        preview_hash: Option<&str>,
        committed_at: TimestampMicros,
    ) -> Result<CommitOutcome, ActionError> {
        let (proposal, transaction) = match self
            .start_commit(context, proposal_id, operation_id)
            .await?
        {
            StartedCommit::Ready {
                proposal,
                transaction,
            } => (*proposal, transaction),
            StartedCommit::Outcome(outcome) => return Ok(outcome),
        };
        if bind_proposal_preview(
            &proposal.action_id,
            &proposal.resource_id,
            &proposal.inputs,
            &proposal.preview_hash,
            &proposal.canonical_preview_text,
            preview_hash,
        )
        .is_err()
        {
            return abort_commit(transaction, Ok(CommitOutcome::PreviewMismatch)).await;
        }
        if committed_at >= proposal.expires_at {
            return abort_commit(transaction, Err(ActionError::ExpiredProposal)).await;
        }
        if let Err(error) = authorize_delegation(
            context,
            &proposal.action_id,
            &proposal.resource_id,
            &proposal.definition.definition_id,
            committed_at,
        ) {
            return abort_commit(transaction, Err(error)).await;
        }
        let (loaded, policy) = match self
            .resolve_commit_policy(context, &proposal, committed_at)
            .await
        {
            Ok(Ok(ready)) => ready,
            Ok(Err(outcome)) => return abort_commit(transaction, Ok(outcome)).await,
            Err(error) => return abort_commit(transaction, Err(error)).await,
        };
        let effects = match self
            .assemble_commit_plan(context, &proposal, &loaded, &policy)
            .await
        {
            Ok(Ok(effects)) => effects,
            Ok(Err(outcome)) => return abort_commit(transaction, Ok(outcome)).await,
            Err(error) => return abort_commit(transaction, Err(error)).await,
        };
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

    async fn start_commit(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
        operation_id: &OperationId,
    ) -> Result<StartedCommit<S::ActionCommit>, ActionError> {
        let proposal = self
            .store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)?;
        if proposal.scenario_id.is_some() {
            return Err(ActionError::Evaluation(
                "scenario-scoped proposals commit only via scenario apply".to_owned(),
            ));
        }
        if &proposal.operation_id != operation_id {
            return Ok(StartedCommit::Outcome(CommitOutcome::OperationMismatch));
        }
        match self
            .store
            .begin_action_commit(context, &proposal)
            .await
            .map_err(ActionError::Store)?
        {
            crate::CommitPreparation::OperationMismatch => {
                Ok(StartedCommit::Outcome(CommitOutcome::OperationMismatch))
            }
            crate::CommitPreparation::Ready(transaction) => Ok(StartedCommit::Ready {
                proposal: Box::new(proposal),
                transaction,
            }),
            crate::CommitPreparation::Replayed(receipt) => {
                Ok(StartedCommit::Outcome(CommitOutcome::Committed(receipt)))
            }
        }
    }

    async fn resolve_propose_authority(
        &self,
        context: &TrustedExecutionContext,
        command: &ProposeCommand,
        loaded: &LoadedAction,
    ) -> Result<Result<ProposalAuthority, ProposeOutcome>, ActionError> {
        let projection = self
            .load_world_projection(LoadWorldProjectionRequest {
                context,
                definition: &loaded.definition,
                revision: &loaded.revision,
                action: &loaded.action,
                resource_id: &command.resource_id,
                scenario_id: command.scenario_id.clone(),
                valid_at: command.valid_at,
            })
            .await?;
        match self
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
                written_classification: None,
            })
            .await
        {
            PolicyEvaluation::Permit(evidence) => Ok(Ok(ProposalAuthority::Ready(evidence))),
            PolicyEvaluation::EvaluationError { message, revision } => {
                Ok(Err(ProposeOutcome::EvaluationError {
                    message,
                    policy: policy_from_revision(revision),
                }))
            }
            PolicyEvaluation::Deny(_) => match self
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
                    written_classification: None,
                })
                .await
            {
                PolicyEvaluation::Permit(evidence) => {
                    Ok(Ok(ProposalAuthority::AwaitingApproval(evidence)))
                }
                PolicyEvaluation::Deny(evidence) => Ok(Err(ProposeOutcome::Denied(evidence))),
                PolicyEvaluation::EvaluationError { message, revision } => {
                    Ok(Err(ProposeOutcome::EvaluationError {
                        message,
                        policy: policy_from_revision(revision),
                    }))
                }
            },
        }
    }

    async fn resolve_commit_policy(
        &self,
        context: &TrustedExecutionContext,
        proposal: &ActionProposal,
        committed_at: TimestampMicros,
    ) -> Result<Result<(LoadedAction, PolicyEvidence), CommitOutcome>, ActionError> {
        let approval = match &proposal.authority {
            ProposalAuthority::Ready(_) => None,
            ProposalAuthority::AwaitingApproval(_) => {
                match self
                    .store
                    .get_approval(context, &proposal.proposal_id)
                    .await
                    .map_err(ActionError::Store)?
                {
                    Some(approval) if committed_at < approval.expires_at => Some(approval),
                    _ => return Err(ActionError::ApprovalExpired),
                }
            }
        };
        let loaded = self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await?;
        let projection = self
            .load_world_projection(LoadWorldProjectionRequest {
                context,
                definition: &loaded.definition,
                revision: &loaded.revision,
                action: &loaded.action,
                resource_id: &proposal.resource_id,
                scenario_id: proposal.scenario_id.clone(),
                valid_at: proposal.valid_at,
            })
            .await?;
        match self
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
                written_classification: None,
            })
            .await
        {
            PolicyEvaluation::Permit(evidence) => Ok(Ok((loaded, evidence))),
            PolicyEvaluation::Deny(evidence) => Ok(Err(CommitOutcome::Denied(evidence))),
            PolicyEvaluation::EvaluationError { message, revision } => {
                Ok(Err(CommitOutcome::EvaluationError {
                    message,
                    policy: policy_from_revision(revision),
                }))
            }
        }
    }

    async fn assemble_commit_plan(
        &self,
        context: &TrustedExecutionContext,
        proposal: &ActionProposal,
        loaded: &LoadedAction,
        policy: &PolicyEvidence,
    ) -> Result<Result<Vec<ActionCommitEffect>, CommitOutcome>, ActionError> {
        let snapshot = self
            .load_relation_snapshot(LoadRelationSnapshotRequest {
                context,
                revision: &loaded.revision,
                resource_id: &proposal.resource_id,
                relations: effect_evaluation_relations(&loaded.action),
                scenario_id: proposal.scenario_id.clone(),
                valid_at: proposal.valid_at,
                authority_cut_error: "Action effect relations used different authority cuts",
            })
            .await?;
        let relation_values =
            read_action_state_basis(&loaded.action, &loaded.definition, &snapshot)?.values;
        let human_request_payload = if crate::is_human_executor_action(&proposal.action_id) {
            Some(
                crate::mint_human_task_contract_payload(proposal)
                    .map_err(|error| ActionError::Evaluation(error.to_string()))?,
            )
        } else {
            None
        };
        let join = self
            .join_input_labels(context, proposal, &loaded.definition, &loaded.revision)
            .await?;
        let drafts = share_or_join_effects(
            build_effects(proposal, &loaded.action, &relation_values)?,
            proposal,
            join.as_ref(),
        )?;
        let written = written_classified_as_tokens(&drafts)?;
        if !written.is_empty() && !zoen_core::mac_write_permitted(context.clearance(), &written) {
            return Ok(Err(CommitOutcome::Denied(PolicyEvidence {
                determining_policies: vec![crate::MAC_DETERMINING_POLICY.to_owned()],
                revision: policy.revision.clone(),
            })));
        }
        drafts
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
            .collect::<Result<Vec<_>, _>>()
            .map(Ok)
    }

    /// Load the commit receipt for an operation.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError::Store`] when the authority store cannot load the operation.
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

    /// Load a stored Action proposal.
    ///
    /// # Errors
    ///
    /// Returns [`ActionError::Store`] when the authority store cannot load the proposal.
    pub async fn get_proposal(
        &self,
        context: &TrustedExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<ActionProposal, ActionError> {
        self.store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)
    }

    pub(crate) async fn load_action(
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

    pub(crate) async fn evaluate_precondition(
        &self,
        context: &TrustedExecutionContext,
        resource_id: &ResourceId,
        loaded: &LoadedAction,
        inputs: &[ActionInput],
        scenario_id: Option<ScenarioId>,
        valid_at: TimestampMicros,
    ) -> Result<PreconditionEvaluation, ActionError> {
        let snapshot = self
            .load_relation_snapshot(LoadRelationSnapshotRequest {
                context,
                revision: &loaded.revision,
                resource_id,
                relations: expression_relations(&loaded.action.precondition),
                scenario_id,
                valid_at,
                authority_cut_error: "Action precondition relations used different authority cuts",
            })
            .await?;
        evaluate_action_state_basis(&loaded.action, &loaded.definition, inputs, &snapshot)
    }

    pub(crate) async fn load_relation_snapshot(
        &self,
        request: LoadRelationSnapshotRequest<'_>,
    ) -> Result<ActionStateSnapshot, ActionError> {
        let entity_id = EntityId::parse(request.resource_id.as_str())
            .map_err(|error| ActionError::Input(error.to_string()))?;
        let mut values = BTreeMap::<RelationId, Vec<SemanticValue>>::new();
        let mut observed = None;
        for relation_id in request.relations {
            let consistency = match observed {
                Some(cut) => Consistency::Snapshot(cut),
                None => Consistency::Strong,
            };
            let result = self
                .query
                .execute(
                    request.context,
                    &SemanticQuery::ByEntity {
                        consistency,
                        definition: DefinitionReference {
                            definition_id: request.revision.definition_id.clone(),
                            digest: request.revision.digest.clone(),
                            revision: request.revision.revision,
                        },
                        entity_id: entity_id.clone(),
                        scenario_id: request.scenario_id.clone(),
                        selection: SemanticSelection::Relation(relation_id.clone()),
                        valid_at: request.valid_at,
                    },
                )
                .await
                .map_err(|error| ActionError::Evaluation(error.to_string()))?;
            if observed.is_some_and(|cut| cut != result.actual_commit_sequence) {
                return Err(ActionError::Evaluation(
                    request.authority_cut_error.to_owned(),
                ));
            }
            observed = Some(result.actual_commit_sequence);
            values.insert(relation_id, result.values);
        }
        Ok(ActionStateSnapshot {
            observed_commit_sequence: observed.unwrap_or(request.revision.commit_sequence),
            relations: values,
        })
    }

    pub(crate) async fn load_world_projection(
        &self,
        request: LoadWorldProjectionRequest<'_>,
    ) -> Result<PolicyWorldProjection, ActionError> {
        let entity_id = EntityId::parse(request.resource_id.as_str())
            .map_err(|error| ActionError::Input(error.to_string()))?;
        let object_type = action_resource_type(request.action, request.definition);
        let mut load_relations = BTreeSet::new();
        let classified_as = classified_as_relation();
        if request
            .definition
            .relations
            .iter()
            .any(|relation| relation.id == classified_as)
        {
            load_relations.insert(classified_as.clone());
        }
        if let Some(object_type) = &object_type {
            for relation in &request.definition.relations {
                if relation.source_type == *object_type
                    && matches!(relation.target, RelationTarget::Type(_))
                {
                    load_relations.insert(relation.id.clone());
                }
            }
        }
        let snapshot = self
            .load_relation_snapshot(LoadRelationSnapshotRequest {
                context: request.context,
                revision: request.revision,
                resource_id: request.resource_id,
                relations: load_relations,
                scenario_id: request.scenario_id,
                valid_at: request.valid_at,
                authority_cut_error: "Action policy projection relations used different authority cuts",
            })
            .await?;
        let classification = classification_from_values(
            snapshot
                .relations
                .get(&classified_as)
                .map_or(&[], Vec::as_slice),
        )?;
        let mut seen = BTreeSet::from([entity_id.clone()]);
        let mut neighbors = Vec::new();
        let mut links = Vec::new();
        if let Some(object_type) = &object_type {
            for relation in &request.definition.relations {
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
                            classification: BTreeSet::new(),
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
                principal_id: request.context.principal_id().clone(),
                tenant_id: request.context.tenant_id().clone(),
            },
            neighbors,
            resource: PolicyObjectProjection {
                classification,
                entity_id,
                links,
                object_type,
            },
        })
    }

    pub(crate) async fn join_input_labels(
        &self,
        context: &TrustedExecutionContext,
        proposal: &ActionProposal,
        definition: &CanonicalDefinition,
        revision: &DefinitionRevision,
    ) -> Result<Option<BTreeSet<ClassificationToken>>, ActionError> {
        let classified_as = classified_as_relation();
        if !definition
            .relations
            .iter()
            .any(|relation| relation.id == classified_as)
        {
            return Ok(None);
        }
        let mut labels = Vec::new();
        for input in &proposal.inputs {
            let ExactValue::Entity(entity_id) = &input.value else {
                continue;
            };
            let resource_id = ResourceId::parse(entity_id.as_str())
                .map_err(|error| ActionError::Evaluation(error.to_string()))?;
            let snapshot = self
                .load_relation_snapshot(LoadRelationSnapshotRequest {
                    context,
                    revision,
                    resource_id: &resource_id,
                    relations: BTreeSet::from([classified_as.clone()]),
                    scenario_id: proposal.scenario_id.clone(),
                    valid_at: proposal.valid_at,
                    authority_cut_error: "join classification relations used different authority cuts",
                })
                .await?;
            labels.push(classification_from_values(
                snapshot
                    .relations
                    .get(&classified_as)
                    .map_or(&[], Vec::as_slice),
            )?);
        }
        if labels.is_empty() {
            Ok(None)
        } else {
            Ok(Some(join_labels(labels)))
        }
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

pub(crate) struct LoadedAction {
    pub(crate) action: ActionDefinition,
    pub(crate) definition: CanonicalDefinition,
    pub(crate) revision: DefinitionRevision,
}

pub(crate) fn authorize_delegation(
    context: &TrustedExecutionContext,
    action_id: &ActionId,
    resource_id: &ResourceId,
    lake: &DefinitionId,
    at: TimestampMicros,
) -> Result<(), ActionError> {
    if delegation_allows(context, action_id, resource_id, lake, at) {
        Ok(())
    } else {
        Err(ActionError::DelegationDenied)
    }
}

/// Instance grant, dotted child of a granted type root, or the lake itself.
/// `personal.memory` + `personal.createReminder` covers `personal.reminder.{hex}`.
fn delegation_allows(
    context: &TrustedExecutionContext,
    action_id: &ActionId,
    resource_id: &ResourceId,
    lake: &DefinitionId,
    at: TimestampMicros,
) -> bool {
    let workload = context.workload_id();
    let chain = context.delegation();
    if chain.permits(action_id, resource_id, workload, at) {
        return true;
    }
    match ResourceId::parse(lake.as_str()) {
        Ok(lake) if lake != *resource_id => chain.permits(action_id, &lake, workload, at),
        _ => false,
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
        if !admission::value_matches(&expected.value_type, value) {
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

/// Hash ordered state dependencies into a state-basis digest.
///
/// # Errors
///
/// Returns [`ActionError::Evaluation`] when the digest hex is not a valid SHA-256 digest.
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
    StateBasisDigest::parse(encode_hex(hasher.finalize().as_ref()))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

/// Compare a stored state-basis digest with a recomputed digest.
///
/// # Errors
///
/// Returns [`ActionError::Evaluation`] when the recomputed digest cannot be encoded.
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
    IntentDigest::parse(encode_hex(hasher.finalize().as_ref()))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

fn classification_from_values(
    values: &[SemanticValue],
) -> Result<BTreeSet<ClassificationToken>, ActionError> {
    let mut tokens = BTreeSet::new();
    for value in values {
        let ExactValue::Text(token) = &value.value else {
            return Err(ActionError::Evaluation(
                "classifiedAs values must be text tokens".to_owned(),
            ));
        };
        tokens.insert(
            ClassificationToken::parse(token.clone())
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
        );
    }
    Ok(tokens)
}

pub(crate) fn written_classified_as_tokens(
    drafts: &[EvidenceDraft],
) -> Result<BTreeSet<ClassificationToken>, ActionError> {
    let classified_as = classified_as_relation();
    let mut tokens = BTreeSet::new();
    for draft in drafts {
        if draft.relation_id != classified_as {
            continue;
        }
        let ExactValue::Text(token) = &draft.value else {
            return Err(ActionError::Evaluation(
                "classifiedAs effect must write a text token".to_owned(),
            ));
        };
        tokens.insert(
            ClassificationToken::parse(token.clone())
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
        );
    }
    Ok(tokens)
}

pub(crate) fn share_or_join_effects(
    drafts: Vec<EvidenceDraft>,
    proposal: &ActionProposal,
    join: Option<&BTreeSet<ClassificationToken>>,
) -> Result<Vec<EvidenceDraft>, ActionError> {
    if proposal.action_id.as_str() == WORLD_SHARE_ACTION {
        let classified_as = classified_as_relation();
        if drafts
            .iter()
            .any(|draft| draft.relation_id == classified_as)
        {
            return Err(ActionError::Evaluation(
                "share never rewrites classifiedAs".to_owned(),
            ));
        }
        return Ok(drafts);
    }
    stamp_join_label(drafts, proposal, join)
}

fn stamp_join_label(
    mut drafts: Vec<EvidenceDraft>,
    proposal: &ActionProposal,
    join: Option<&BTreeSet<ClassificationToken>>,
) -> Result<Vec<EvidenceDraft>, ActionError> {
    let Some(join) = join else {
        return Ok(drafts);
    };
    let classified_as = classified_as_relation();
    let mut written = BTreeSet::new();
    for draft in &drafts {
        if draft.relation_id != classified_as {
            continue;
        }
        let ExactValue::Text(token) = &draft.value else {
            return Err(ActionError::Evaluation(
                "classifiedAs effect must write a text token".to_owned(),
            ));
        };
        written.insert(
            ClassificationToken::parse(token.clone())
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
        );
    }
    if written.is_empty() {
        let start = drafts.len();
        for (offset, token) in join.iter().enumerate() {
            drafts.push(EvidenceDraft {
                claim_id: ClaimId::parse(format!(
                    "claim.action.{}.{}",
                    proposal.operation_id.as_str(),
                    start + offset
                ))
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                definition: proposal.definition.clone(),
                entity_id: EntityId::parse(proposal.resource_id.as_str())
                    .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                provenance: EvidenceProvenance {
                    ingested_at: None,
                    observed_at: None,
                    source_digest: EvidenceDigest::parse(proposal.intent_digest.as_str())
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_id: zoen_core::SourceId::parse("zoen.action")
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_ref: format!("urn:zoen:proposal:{}", proposal.proposal_id.as_str()),
                },
                relation_id: classified_as.clone(),
                valid_time: ValidTime::instant(proposal.valid_at),
                value: ExactValue::Text(token.as_str().to_owned()),
            });
        }
        return Ok(drafts);
    }
    if !join.iter().all(|token| written.contains(token)) {
        return Err(ActionError::Evaluation(
            "output classification does not dominate join of inputs".to_owned(),
        ));
    }
    Ok(drafts)
}

pub(crate) fn build_effects(
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

pub(crate) fn effect_evaluation_relations(action: &ActionDefinition) -> BTreeSet<RelationId> {
    let mut relations = expression_relations(&action.precondition);
    relations.extend(
        action
            .effects
            .iter()
            .flat_map(|effect| expression_relations(&effect.value)),
    );
    relations
}

pub(crate) fn effect_request_id(
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

fn policy_from_revision(revision: Option<zoen_core::PolicyRevision>) -> Option<PolicyEvidence> {
    revision.map(|revision| PolicyEvidence {
        determining_policies: Vec::new(),
        revision,
    })
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        ActionEffect, ActionInput, BinaryOperator, CommitSequence, ExactDecimal, Expression,
        InputDefinition, InputId, SourceId, TypeId, UnitId, ValueType,
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
            calculate_state_basis_digest(std::slice::from_ref(&dependency))
                .expect("current digest"),
            current
        );
        assert!(
            !state_basis_digest_matches(std::slice::from_ref(&dependency), &legacy)
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
