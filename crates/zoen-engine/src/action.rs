use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionDefinition, ActionId, ActionInput, ActionProposal, ApprovalId, ClaimId,
    CommitReceipt, Consistency, DefinitionReference, EntityId, EvidenceDigest, EvidenceDraft,
    EvidenceProvenance, ExactInteger, ExactValue, ExecutionContext, Expression, InputId,
    IntentDigest, LineageDependency, OperationId, PolicyEvaluation, PolicyEvidence,
    ProposalAuthority, ProposalId, RelationId, ResourceId, SemanticQuery, SemanticResult,
    SemanticSelection, StateBasis, StateBasisDigest, StateDependency, TimestampMicros,
    TrustedExecutionContext, ValidTime, ValueType,
};

use crate::{AuthorityStore, StoreError, decode_canonical_definition};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PolicyOperation {
    Approve,
    Commit,
    Discover,
    RequestApproval,
}

#[derive(Clone, Debug)]
pub struct PolicyRequest<'a> {
    pub action_id: &'a ActionId,
    pub approved: bool,
    pub context: &'a TrustedExecutionContext,
    pub definition: &'a DefinitionReference,
    pub inputs: &'a [ActionInput],
    pub operation: PolicyOperation,
    pub resource_id: &'a ResourceId,
}

#[allow(async_fn_in_trait)]
pub trait PolicyEvaluator: Send + Sync {
    async fn evaluate(&self, request: &PolicyRequest<'_>) -> PolicyEvaluation;
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
    Accepted(ActionProposal),
    Denied(PolicyEvidence),
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
    Committed(CommitReceipt),
    Denied(PolicyEvidence),
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
    },
    Stale(StateBasis),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CommitStoreOutcome {
    Committed(CommitReceipt),
    Stale(StateBasis),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitPlan {
    pub effects: Vec<EvidenceDraft>,
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
    Input(String),
    OperationMismatch,
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
            Self::Input(message) => write!(formatter, "invalid Action input: {message}"),
            Self::OperationMismatch => {
                formatter.write_str("operation identity does not match the proposal")
            }
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
            | Self::Input(_)
            | Self::OperationMismatch => None,
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
            .get_revision(
                context.tenant_id(),
                &definition.definition_id,
                &definition.digest,
            )
            .await
            .map_err(ActionError::Store)?;
        if canonical.revision != definition.revision {
            return Err(ActionError::Definition(
                "definition digest and revision do not match".to_owned(),
            ));
        }
        let decoded = decode_canonical_definition(&canonical.canonical_json)
            .map_err(|error| ActionError::Definition(error.to_string()))?;
        let mut discoveries = Vec::with_capacity(decoded.actions.len());
        for action in decoded.actions {
            let evaluation =
                if context
                    .delegation()
                    .permits(&action.id, resource_id, context.workload_id(), at)
                {
                    self.policy
                        .evaluate(&PolicyRequest {
                            action_id: &action.id,
                            approved: false,
                            context,
                            definition,
                            inputs: &[],
                            operation: PolicyOperation::Discover,
                            resource_id,
                        })
                        .await
                } else {
                    return Err(ActionError::DelegationDenied);
                };
            discoveries.push(ActionDiscovery {
                action_id: action.id,
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
        let action = self
            .load_action(context, &command.definition, &command.action_id)
            .await?;
        validate_inputs(&action, &command.inputs)?;
        let state_basis = self
            .evaluate_precondition(
                context,
                &command.definition,
                &command.resource_id,
                &action,
                &command.inputs,
                command.valid_at,
            )
            .await?;
        let direct = self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &command.action_id,
                approved: false,
                context,
                definition: &command.definition,
                inputs: &command.inputs,
                operation: PolicyOperation::Commit,
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
                        context,
                        definition: &command.definition,
                        inputs: &command.inputs,
                        operation: PolicyOperation::RequestApproval,
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
        let proposal = ActionProposal {
            action_id: command.action_id,
            authority,
            definition: command.definition,
            expires_at: command.expires_at,
            inputs: command.inputs,
            intent_digest,
            operation_id: command.operation_id,
            proposal_id: command.proposal_id,
            proposed_at: command.proposed_at,
            proposed_by: context.actor_id().clone(),
            resource_id: command.resource_id,
            state_basis,
            valid_at: command.valid_at,
        };
        let saved = self
            .store
            .save_proposal(context, &proposal)
            .await
            .map_err(ActionError::Store)?;
        Ok(ProposeOutcome::Accepted(saved))
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
        match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &proposal.action_id,
                approved: false,
                context,
                definition: &proposal.definition,
                inputs: &proposal.inputs,
                operation: PolicyOperation::Approve,
                resource_id: &proposal.resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => {
                let approval = ActionApproval {
                    approval_id,
                    approved_at,
                    approved_by: context.actor_id().clone(),
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
        committed_at: TimestampMicros,
    ) -> Result<CommitOutcome, ActionError> {
        let proposal = self
            .store
            .get_proposal(context, proposal_id)
            .await
            .map_err(ActionError::Store)?;
        if &proposal.operation_id != operation_id {
            return Err(ActionError::OperationMismatch);
        }
        if committed_at >= proposal.expires_at {
            return Err(ActionError::ExpiredProposal);
        }
        authorize_delegation(
            context,
            &proposal.action_id,
            &proposal.resource_id,
            committed_at,
        )?;
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
                    _ => return Err(ActionError::ApprovalExpired),
                }
            }
        };
        let policy = match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &proposal.action_id,
                approved: approval.is_some(),
                context,
                definition: &proposal.definition,
                inputs: &proposal.inputs,
                operation: PolicyOperation::Commit,
                resource_id: &proposal.resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(evidence) => evidence,
            PolicyEvaluation::Deny(evidence) => return Ok(CommitOutcome::Denied(evidence)),
            PolicyEvaluation::EvaluationError { message, revision } => {
                return Ok(CommitOutcome::EvaluationError {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
        };
        let action = self
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await?;
        let current_basis = self
            .evaluate_precondition(
                context,
                &proposal.definition,
                &proposal.resource_id,
                &action,
                &proposal.inputs,
                proposal.valid_at,
            )
            .await?;
        if current_basis.digest != proposal.state_basis.digest {
            return Ok(CommitOutcome::Stale(current_basis));
        }
        let effects = build_effects(&proposal, &action)?;
        match self
            .store
            .commit_action(
                context,
                &CommitPlan {
                    effects,
                    policy,
                    proposal,
                },
            )
            .await
            .map_err(ActionError::Store)?
        {
            CommitStoreOutcome::Committed(receipt) => Ok(CommitOutcome::Committed(receipt)),
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
    ) -> Result<ActionDefinition, ActionError> {
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
        decoded
            .actions
            .into_iter()
            .find(|action| action.id == *action_id)
            .ok_or_else(|| {
                ActionError::Definition(format!("definition has no Action: {action_id}"))
            })
    }

    async fn evaluate_precondition(
        &self,
        context: &TrustedExecutionContext,
        definition: &DefinitionReference,
        resource_id: &ResourceId,
        action: &ActionDefinition,
        inputs: &[ActionInput],
        valid_at: TimestampMicros,
    ) -> Result<StateBasis, ActionError> {
        let entity_id = EntityId::parse(resource_id.as_str())
            .map_err(|error| ActionError::Input(error.to_string()))?;
        let mut relations = BTreeSet::new();
        collect_relations(&action.precondition, &mut relations);
        let mut values = BTreeMap::<RelationId, Vec<ExactValue>>::new();
        let mut dependencies = Vec::new();
        let mut observed = None;
        for relation_id in relations {
            let result = self
                .query
                .execute(
                    context,
                    &SemanticQuery {
                        consistency: Consistency::Strong,
                        definition: definition.clone(),
                        entity_id: entity_id.clone(),
                        selection: SemanticSelection::Relation(relation_id.clone()),
                        valid_at,
                    },
                )
                .await
                .map_err(|error| ActionError::Evaluation(error.to_string()))?;
            observed = Some(result.actual_commit_sequence);
            values.insert(
                relation_id,
                result
                    .values
                    .iter()
                    .map(|value| value.value.clone())
                    .collect(),
            );
            dependencies.extend(
                result
                    .values
                    .into_iter()
                    .flat_map(|value| value.dependencies)
                    .map(state_dependency),
            );
        }
        let input_values = inputs
            .iter()
            .map(|input| (input.id.clone(), input.value.clone()))
            .collect::<BTreeMap<_, _>>();
        let evaluated = evaluate_expression(&action.precondition, &input_values, &values)?;
        if !evaluated
            .iter()
            .any(|value| matches!(value, ExactValue::Bool(true)))
        {
            return Err(ActionError::Evaluation(
                "Action precondition is not satisfied".to_owned(),
            ));
        }
        dependencies.sort_by(|left, right| {
            (
                left.relation_id.as_str(),
                left.claim_id.as_str(),
                left.commit_sequence,
            )
                .cmp(&(
                    right.relation_id.as_str(),
                    right.claim_id.as_str(),
                    right.commit_sequence,
                ))
        });
        dependencies.dedup();
        let observed_commit_sequence = observed.ok_or_else(|| {
            ActionError::Evaluation("Action precondition has no state dependency".to_owned())
        })?;
        let digest = calculate_state_basis_digest(&dependencies)?;
        Ok(StateBasis {
            dependencies,
            digest,
            observed_commit_sequence,
        })
    }
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
        | (ValueType::Integer, ExactValue::Integer(_))
        | (ValueType::Text, ExactValue::Text(_)) => true,
        (ValueType::Quantity { unit: expected }, ExactValue::Quantity { unit: actual, .. }) => {
            expected == actual
        }
        _ => false,
    }
}

fn collect_relations(expression: &Expression, relations: &mut BTreeSet<RelationId>) {
    match expression {
        Expression::Binary { left, right, .. } => {
            collect_relations(left, relations);
            collect_relations(right, relations);
        }
        Expression::Relation(relation_id) => {
            relations.insert(relation_id.clone());
        }
        Expression::Input(_) | Expression::Literal(_) => {}
    }
}

fn evaluate_expression(
    expression: &Expression,
    inputs: &BTreeMap<InputId, ExactValue>,
    relations: &BTreeMap<RelationId, Vec<ExactValue>>,
) -> Result<Vec<ExactValue>, ActionError> {
    match expression {
        Expression::Binary {
            left,
            operator,
            right,
        } => {
            let left = evaluate_expression(left, inputs, relations)?;
            let right = evaluate_expression(right, inputs, relations)?;
            let mut values = Vec::with_capacity(left.len().saturating_mul(right.len()));
            for left in &left {
                for right in &right {
                    values.push(apply_operator(*operator, left, right)?);
                }
            }
            Ok(values)
        }
        Expression::Input(input_id) => inputs
            .get(input_id)
            .cloned()
            .map(|value| vec![value])
            .ok_or_else(|| ActionError::Input(format!("missing input {}", input_id.as_str()))),
        Expression::Literal(value) => Ok(vec![value.clone()]),
        Expression::Relation(relation_id) => {
            Ok(relations.get(relation_id).cloned().unwrap_or_default())
        }
    }
}

fn apply_operator(
    operator: zoen_core::BinaryOperator,
    left: &ExactValue,
    right: &ExactValue,
) -> Result<ExactValue, ActionError> {
    let (ExactValue::Integer(left), ExactValue::Integer(right)) = (left, right) else {
        return Err(ActionError::Evaluation(
            "V1 Action expression requires exact integer operands".to_owned(),
        ));
    };
    let left = left
        .as_str()
        .parse::<i128>()
        .map_err(|_| ActionError::Evaluation("left integer exceeds i128".to_owned()))?;
    let right = right
        .as_str()
        .parse::<i128>()
        .map_err(|_| ActionError::Evaluation("right integer exceeds i128".to_owned()))?;
    match operator {
        zoen_core::BinaryOperator::Add => checked_integer(left.checked_add(right), "addition"),
        zoen_core::BinaryOperator::GreaterThan => Ok(ExactValue::Bool(left > right)),
        zoen_core::BinaryOperator::Multiply => {
            checked_integer(left.checked_mul(right), "multiplication")
        }
        zoen_core::BinaryOperator::Subtract => {
            checked_integer(left.checked_sub(right), "subtraction")
        }
    }
}

fn checked_integer(value: Option<i128>, operation: &str) -> Result<ExactValue, ActionError> {
    let value = value
        .ok_or_else(|| ActionError::Evaluation(format!("integer {operation} overflowed i128")))?;
    ExactInteger::parse(value.to_string())
        .map(ExactValue::Integer)
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

fn state_dependency(dependency: LineageDependency) -> StateDependency {
    StateDependency {
        claim_id: dependency.claim_id,
        commit_sequence: dependency.commit_sequence,
        entity_id: dependency.entity_id,
        relation_id: dependency.relation_id,
        source_digest: dependency.source_digest,
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
        hash_field(&mut hasher, dependency.source_digest.as_str());
    }
    StateBasisDigest::parse(hex_digest(hasher.finalize()))
        .map_err(|error| ActionError::Evaluation(error.to_string()))
}

fn intent_digest(
    context: &TrustedExecutionContext,
    command: &ProposeCommand,
    state_basis: &StateBasis,
) -> Result<IntentDigest, ActionError> {
    let mut hasher = Sha256::new();
    hash_field(&mut hasher, context.tenant_id().as_str());
    hash_field(&mut hasher, command.proposal_id.as_str());
    hash_field(&mut hasher, command.operation_id.as_str());
    hash_field(&mut hasher, command.definition.definition_id.as_str());
    hash_field(&mut hasher, command.definition.digest.as_str());
    hash_field(&mut hasher, &command.definition.revision.get().to_string());
    hash_field(&mut hasher, command.action_id.as_str());
    hash_field(&mut hasher, command.resource_id.as_str());
    for input in &command.inputs {
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
            let values = evaluate_expression(&effect.value, &inputs, &BTreeMap::new())?;
            let [value] = values.as_slice() else {
                return Err(ActionError::Evaluation(
                    "Action effect must produce exactly one value".to_owned(),
                ));
            };
            Ok(EvidenceDraft {
                claim_id: ClaimId::parse(format!(
                    "claim.{}.{}",
                    proposal.proposal_id.as_str(),
                    index
                ))
                .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                definition: proposal.definition.clone(),
                entity_id: resource.clone(),
                provenance: EvidenceProvenance {
                    source_digest: EvidenceDigest::parse(proposal.intent_digest.as_str())
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_id: zoen_core::SourceId::parse("zoen.action")
                        .map_err(|error| ActionError::Evaluation(error.to_string()))?,
                    source_ref: format!("urn:zoen:proposal:{}", proposal.proposal_id.as_str()),
                },
                relation_id: effect.relation_id.clone(),
                valid_time: ValidTime::instant(proposal.valid_at),
                value: value.clone(),
            })
        })
        .collect()
}

fn value_key(value: &ExactValue) -> String {
    match value {
        ExactValue::Bool(value) => format!("bool:{value}"),
        ExactValue::Decimal(value) => format!("decimal:{}", value.as_str()),
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

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
