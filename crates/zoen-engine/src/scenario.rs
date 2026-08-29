use std::error::Error;
use std::fmt::{Display, Formatter};

use zoen_core::{
    ActionProposal, CommitSequence, PolicyEvidence, ProposalAuthority, ProposalId,
    ScenarioId, TimestampMicros, TrustedExecutionContext, WORLD_WHO_CAN_ACTION,
    mac_write_permitted,
};

use crate::action::{
    ActionCommitEffect, ActionEngine, ActionError, PolicyEvaluator, PolicyOperation, PolicyRequest,
    QueryExecutor, authorize_delegation, build_effects, effect_evaluation_relations,
    effect_request_id, share_or_join_effects, written_classified_as_tokens,
};
use crate::action_preview::bind_proposal_preview;
use crate::{
    AuthorityStore, MAC_DETERMINING_POLICY, StoreError, admission, read_action_state_basis,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScenarioStatus {
    Open,
    Applied,
    Discarded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Scenario {
    pub scenario_id: ScenarioId,
    pub base_commit_sequence: CommitSequence,
    pub status: ScenarioStatus,
    pub created_principal_id: String,
    pub proposal_ids: Vec<ProposalId>,
    pub applied_commit_sequence: Option<CommitSequence>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ApplyOutcome {
    Committed {
        commit_sequence: CommitSequence,
    },
    Denied {
        evidence: PolicyEvidence,
        proposal_id: ProposalId,
    },
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
        proposal_id: ProposalId,
    },
    Conflict(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScenarioError {
    NotFound,
    NotOpen,
    Store(StoreError),
    Action(ActionError),
    Invalid(String),
}

impl Display for ScenarioError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => formatter.write_str("scenario was not found"),
            Self::NotOpen => formatter.write_str("scenario is not open"),
            Self::Store(error) => write!(formatter, "{error}"),
            Self::Action(error) => write!(formatter, "{error}"),
            Self::Invalid(message) => write!(formatter, "{message}"),
        }
    }
}

impl Error for ScenarioError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScenarioProposalPlan {
    pub proposal: ActionProposal,
    pub effects: Vec<ActionCommitEffect>,
    pub policy: PolicyEvidence,
}

pub struct ScenarioEngine<S, Q, P> {
    action: ActionEngine<S, Q, P>,
    store: S,
}

impl<S, Q, P> ScenarioEngine<S, Q, P>
where
    S: AuthorityStore + Clone,
    Q: QueryExecutor,
    P: PolicyEvaluator,
{
    pub fn new(store: S, action: ActionEngine<S, Q, P>) -> Self {
        Self { action, store }
    }

    pub async fn create(
        &self,
        context: &TrustedExecutionContext,
        scenario_id: ScenarioId,
    ) -> Result<Scenario, ScenarioError> {
        let head = match self.store.current_head(context).await {
            Ok(head) => head,
            Err(StoreError::NotFound) => {
                return Err(ScenarioError::Invalid(
                    "tenant has no authoritative snapshot".to_owned(),
                ));
            }
            Err(error) => return Err(ScenarioError::Store(error)),
        };
        self.store
            .insert_open_scenario(context, &scenario_id, head)
            .await
            .map_err(ScenarioError::Store)
    }

    pub async fn apply(
        &self,
        context: &TrustedExecutionContext,
        scenario_id: &ScenarioId,
        committed_at: TimestampMicros,
    ) -> Result<ApplyOutcome, ScenarioError> {
        let scenario = self
            .store
            .get_scenario(context, scenario_id)
            .await
            .map_err(ScenarioError::Store)?;
        if scenario.status != ScenarioStatus::Open {
            return Ok(ApplyOutcome::Conflict("scenario is not open".to_owned()));
        }
        if scenario.proposal_ids.is_empty() {
            return Ok(ApplyOutcome::Conflict(
                "scenario has no stacked proposals".to_owned(),
            ));
        }
        let head = self
            .store
            .current_head(context)
            .await
            .map_err(ScenarioError::Store)?;
        if scenario.base_commit_sequence != head {
            return Ok(ApplyOutcome::Conflict(format!(
                "scenario base {} diverged from head {}",
                scenario.base_commit_sequence.get(),
                head.get()
            )));
        }

        let mut plans = Vec::with_capacity(scenario.proposal_ids.len());
        for proposal_id in &scenario.proposal_ids {
            let proposal = self
                .store
                .get_proposal(context, proposal_id)
                .await
                .map_err(ScenarioError::Store)?;
            match self
                .prepare_proposal(context, &proposal, committed_at)
                .await?
            {
                PrepareResult::Ready(plan) => plans.push(*plan),
                PrepareResult::Denied {
                    evidence,
                    proposal_id,
                } => {
                    return Ok(ApplyOutcome::Denied {
                        evidence,
                        proposal_id,
                    });
                }
                PrepareResult::EvaluationError {
                    message,
                    policy,
                    proposal_id,
                } => {
                    return Ok(ApplyOutcome::EvaluationError {
                        message,
                        policy,
                        proposal_id,
                    });
                }
            }
        }

        let commit_sequence = self
            .store
            .commit_scenario_package(context, &scenario, &plans)
            .await
            .map_err(ScenarioError::Store)?;
        Ok(ApplyOutcome::Committed { commit_sequence })
    }

    pub async fn discard(
        &self,
        context: &TrustedExecutionContext,
        scenario_id: &ScenarioId,
    ) -> Result<Scenario, ScenarioError> {
        let scenario = self
            .store
            .get_scenario(context, scenario_id)
            .await
            .map_err(ScenarioError::Store)?;
        if scenario.status != ScenarioStatus::Open {
            return Err(ScenarioError::NotOpen);
        }
        self.store
            .mark_scenario_discarded(context, scenario_id)
            .await
            .map_err(ScenarioError::Store)?;
        Ok(Scenario {
            status: ScenarioStatus::Discarded,
            ..scenario
        })
    }

    async fn prepare_proposal(
        &self,
        context: &TrustedExecutionContext,
        proposal: &ActionProposal,
        committed_at: TimestampMicros,
    ) -> Result<PrepareResult, ScenarioError> {
        if proposal.action_id.as_str() == WORLD_WHO_CAN_ACTION {
            return Err(ScenarioError::Invalid(
                "zoen.world.whoCan is Discover/Read, not a mutation".to_owned(),
            ));
        }
        if bind_proposal_preview(
            &proposal.action_id,
            &proposal.resource_id,
            &proposal.inputs,
            &proposal.preview_hash,
            &proposal.canonical_preview_text,
            Some(proposal.preview_hash.as_str()),
        )
        .is_err()
        {
            return Ok(PrepareResult::EvaluationError {
                message: "preview hash mismatch".to_owned(),
                policy: None,
                proposal_id: proposal.proposal_id.clone(),
            });
        }
        if committed_at >= proposal.expires_at {
            return Err(ScenarioError::Action(ActionError::ExpiredProposal));
        }
        authorize_delegation(
            context,
            &proposal.action_id,
            &proposal.resource_id,
            &proposal.definition.definition_id,
            committed_at,
        )
        .map_err(ScenarioError::Action)?;
        let approval = match &proposal.authority {
            ProposalAuthority::Ready(_) => None,
            ProposalAuthority::AwaitingApproval(_) => {
                let approval = self
                    .store
                    .get_approval(context, &proposal.proposal_id)
                    .await
                    .map_err(ScenarioError::Store)?;
                match approval {
                    Some(approval) if committed_at < approval.expires_at => Some(approval),
                    _ => return Err(ScenarioError::Action(ActionError::ApprovalExpired)),
                }
            }
        };
        let loaded = self
            .action
            .load_action(context, &proposal.definition, &proposal.action_id)
            .await
            .map_err(ScenarioError::Action)?;
        let projection = self
            .action
            .load_world_projection(
                context,
                &loaded.definition,
                &loaded.revision,
                &loaded.action,
                &proposal.resource_id,
                proposal.valid_at,
            )
            .await
            .map_err(ScenarioError::Action)?;
        let policy = match self
            .action
            .policy()
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
            zoen_core::PolicyEvaluation::Permit(evidence) => evidence,
            zoen_core::PolicyEvaluation::Deny(evidence) => {
                return Ok(PrepareResult::Denied {
                    evidence,
                    proposal_id: proposal.proposal_id.clone(),
                });
            }
            zoen_core::PolicyEvaluation::EvaluationError { message, revision } => {
                return Ok(PrepareResult::EvaluationError {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                    proposal_id: proposal.proposal_id.clone(),
                });
            }
        };
        let relation_ids = effect_evaluation_relations(&loaded.action);
        let snapshot = self
            .action
            .load_relation_snapshot(
                context,
                &loaded.revision,
                &proposal.resource_id,
                relation_ids,
                proposal.valid_at,
                "Action effect relations used different authority cuts",
            )
            .await
            .map_err(ScenarioError::Action)?;
        let relation_values = read_action_state_basis(&loaded.action, &loaded.definition, snapshot)
            .map_err(ScenarioError::Action)?
            .values;
        let join = self
            .action
            .join_input_labels(context, proposal, &loaded.definition, &loaded.revision)
            .await
            .map_err(ScenarioError::Action)?;
        let drafts = share_or_join_effects(
            build_effects(proposal, &loaded.action, &relation_values)
                .map_err(ScenarioError::Action)?,
            proposal,
            join.as_ref(),
        )
        .map_err(ScenarioError::Action)?;
        let written = written_classified_as_tokens(&drafts).map_err(ScenarioError::Action)?;
        if !written.is_empty() && !mac_write_permitted(context.clearance(), &written) {
            return Ok(PrepareResult::Denied {
                evidence: PolicyEvidence {
                    determining_policies: vec![MAC_DETERMINING_POLICY.to_owned()],
                    revision: policy.revision,
                },
                proposal_id: proposal.proposal_id.clone(),
            });
        }
        let effects = drafts
            .into_iter()
            .enumerate()
            .map(|(index, draft)| {
                let evidence = admission::admit_action_effect(&loaded.revision, draft)
                    .map_err(|error| ScenarioError::Invalid(error.to_string()))?;
                Ok(ActionCommitEffect {
                    effect_request_id: effect_request_id(&proposal.operation_id, index)
                        .map_err(ScenarioError::Action)?,
                    request_payload: evidence.projection_event().payload().as_bytes().to_vec(),
                    evidence,
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok(PrepareResult::Ready(Box::new(ScenarioProposalPlan {
            proposal: proposal.clone(),
            effects,
            policy,
        })))
    }
}

enum PrepareResult {
    Ready(Box<ScenarioProposalPlan>),
    Denied {
        evidence: PolicyEvidence,
        proposal_id: ProposalId,
    },
    EvaluationError {
        message: String,
        policy: Option<PolicyEvidence>,
        proposal_id: ProposalId,
    },
}
