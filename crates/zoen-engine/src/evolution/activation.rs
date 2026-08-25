use zoen_core::{
    ActionId, ActivationPrecondition, CanonicalDefinition, DefinitionActivation,
    DefinitionActivationKind, DefinitionDigest, DefinitionId, DefinitionRevision,
    EvolutionClassification, EvolutionPlan, ExecutionContext, PolicyEvaluation, PolicyEvidence,
    ResourceId, TimestampMicros,
};

use super::{plan, reference};
use crate::{
    ActivateRevisionError, AdmittedDefinitionActivation, AuthorityStore,
    DefinitionActivationAdmission, DefinitionEngine, PlanEvolutionError, PolicyEvaluator,
    PolicyOperation, PolicyRequest, StoreError, decode_canonical_definition, verify_digest,
};

const DEFINITION_ACTIVATION_ACTION_ID: &str = "zoen.definition.activate";
const DEFINITION_ROLLBACK_ACTION_ID: &str = "zoen.definition.rollback";

impl<S, P> DefinitionEngine<S, P>
where
    S: AuthorityStore,
    P: PolicyEvaluator,
{
    pub async fn activate_revision(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
        precondition: &ActivationPrecondition,
        activated_at: TimestampMicros,
    ) -> Result<DefinitionActivation, ActivateRevisionError> {
        let target = self
            .store
            .get_revision(context.tenant_id(), definition_id, digest)
            .await
            .map_err(ActivateRevisionError::Store)?;
        let target_definition =
            decode_revision(&target).map_err(ActivateRevisionError::InvalidRevision)?;
        let previous = self
            .store
            .get_active_revision(context.tenant_id(), definition_id)
            .await
            .map_err(ActivateRevisionError::Store)?;
        if !precondition_matches(precondition, previous.as_ref()) {
            return Err(ActivateRevisionError::StalePrecondition);
        }
        let classification = previous
            .as_ref()
            .map(|previous_revision| {
                let previous_definition = decode_revision(previous_revision)
                    .map_err(ActivateRevisionError::InvalidRevision)?;
                Ok(plan(
                    previous_revision,
                    &previous_definition,
                    &target,
                    &target_definition,
                )
                .classification)
            })
            .transpose()?;
        let migration_operation_id = match classification {
            Some(EvolutionClassification::Forbidden) => {
                return Err(ActivateRevisionError::Incompatible(
                    EvolutionClassification::Forbidden,
                ));
            }
            Some(
                EvolutionClassification::RequiresMigration | EvolutionClassification::Breaking,
            ) => {
                let previous_reference = previous
                    .as_ref()
                    .map(reference)
                    .ok_or(ActivateRevisionError::MigrationIncomplete)?;
                Some(
                    self.store
                        .get_completed_migration(
                            context.tenant_id(),
                            &previous_reference,
                            &reference(&target),
                        )
                        .await
                        .map_err(ActivateRevisionError::Store)?
                        .map(|migration| migration.plan.operation_id)
                        .ok_or(ActivateRevisionError::MigrationIncomplete)?,
                )
            }
            Some(EvolutionClassification::Compatible) | None => None,
        };

        let action_id = ActionId::parse(DEFINITION_ACTIVATION_ACTION_ID)
            .map_err(|error| ActivateRevisionError::Configuration(error.to_string()))?;
        let resource_id = ResourceId::parse(definition_id.as_str())
            .map_err(|error| ActivateRevisionError::Configuration(error.to_string()))?;
        if !context.delegation().permits(
            &action_id,
            &resource_id,
            context.workload_id(),
            activated_at,
        ) {
            return Err(ActivateRevisionError::DelegationDenied);
        }
        let target_reference = reference(&target);
        let policy = match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &action_id,
                approved: false,
                classification,
                context,
                definition: &target_reference,
                inputs: &[],
                operation: PolicyOperation::ActivateRevision,
                projection: None,
                resource_id: &resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => policy,
            PolicyEvaluation::Deny(policy) => {
                return Err(ActivateRevisionError::PolicyDenied(policy));
            }
            PolicyEvaluation::EvaluationError { message, revision } => {
                return Err(ActivateRevisionError::PolicyEvaluation {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
        };
        let activation = AdmittedDefinitionActivation::new(
            context.clone(),
            previous.as_ref().map(reference),
            target,
            DefinitionActivationAdmission {
                activated_at,
                classification,
                kind: DefinitionActivationKind::Activation,
                migration_operation_id,
                policy,
            },
        )?;
        self.store
            .activate_revision(&activation)
            .await
            .map_err(|error| match error {
                StoreError::StalePrecondition => ActivateRevisionError::StalePrecondition,
                error => ActivateRevisionError::Store(error),
            })
    }

    pub async fn rollback_revision(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
        precondition: &ActivationPrecondition,
        activated_at: TimestampMicros,
    ) -> Result<DefinitionActivation, ActivateRevisionError> {
        let target = self
            .store
            .get_revision(context.tenant_id(), definition_id, digest)
            .await
            .map_err(ActivateRevisionError::Store)?;
        decode_revision(&target).map_err(ActivateRevisionError::InvalidRevision)?;
        let previous = self
            .store
            .get_active_revision(context.tenant_id(), definition_id)
            .await
            .map_err(ActivateRevisionError::Store)?;
        if !precondition_matches(precondition, previous.as_ref()) {
            return Err(ActivateRevisionError::StalePrecondition);
        }
        let target_reference = reference(&target);
        if previous
            .as_ref()
            .is_none_or(|current| current.digest == target.digest)
            || !self
                .store
                .revision_was_active(context.tenant_id(), &target_reference)
                .await
                .map_err(ActivateRevisionError::Store)?
        {
            return Err(ActivateRevisionError::InvalidRollbackTarget);
        }
        let action_id = ActionId::parse(DEFINITION_ROLLBACK_ACTION_ID)
            .map_err(|error| ActivateRevisionError::Configuration(error.to_string()))?;
        let resource_id = ResourceId::parse(definition_id.as_str())
            .map_err(|error| ActivateRevisionError::Configuration(error.to_string()))?;
        if !context.delegation().permits(
            &action_id,
            &resource_id,
            context.workload_id(),
            activated_at,
        ) {
            return Err(ActivateRevisionError::DelegationDenied);
        }
        let current_reference = previous
            .as_ref()
            .map(reference)
            .ok_or(ActivateRevisionError::InvalidRollbackTarget)?;
        let policy = match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &action_id,
                approved: false,
                classification: None,
                context,
                definition: &current_reference,
                inputs: &[],
                operation: PolicyOperation::RollbackRevision,
                projection: None,
                resource_id: &resource_id,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => policy,
            PolicyEvaluation::Deny(policy) => {
                return Err(ActivateRevisionError::PolicyDenied(policy));
            }
            PolicyEvaluation::EvaluationError { message, revision } => {
                return Err(ActivateRevisionError::PolicyEvaluation {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                });
            }
        };
        let activation = AdmittedDefinitionActivation::new(
            context.clone(),
            previous.as_ref().map(reference),
            target,
            DefinitionActivationAdmission {
                activated_at,
                classification: None,
                kind: DefinitionActivationKind::Rollback,
                migration_operation_id: None,
                policy,
            },
        )?;
        self.store
            .activate_revision(&activation)
            .await
            .map_err(|error| match error {
                StoreError::StalePrecondition => ActivateRevisionError::StalePrecondition,
                error => ActivateRevisionError::Store(error),
            })
    }

    pub async fn plan_evolution(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
        from_digest: &DefinitionDigest,
        to_digest: &DefinitionDigest,
    ) -> Result<EvolutionPlan, PlanEvolutionError> {
        let from_revision = self
            .store
            .get_revision(context.tenant_id(), definition_id, from_digest)
            .await
            .map_err(PlanEvolutionError::Store)?;
        let to_revision = self
            .store
            .get_revision(context.tenant_id(), definition_id, to_digest)
            .await
            .map_err(PlanEvolutionError::Store)?;
        let from = decode_revision(&from_revision).map_err(PlanEvolutionError::InvalidRevision)?;
        let to = decode_revision(&to_revision).map_err(PlanEvolutionError::InvalidRevision)?;
        Ok(plan(&from_revision, &from, &to_revision, &to))
    }
}

fn decode_revision(revision: &DefinitionRevision) -> Result<CanonicalDefinition, String> {
    if !verify_digest(&revision.canonical_json, &revision.digest) {
        return Err("stored digest does not match canonical content".to_owned());
    }
    decode_canonical_definition(&revision.canonical_json).map_err(|error| error.to_string())
}

fn precondition_matches(
    precondition: &ActivationPrecondition,
    active: Option<&DefinitionRevision>,
) -> bool {
    match precondition {
        ActivationPrecondition::NoActiveRevision => active.is_none(),
        ActivationPrecondition::ActiveDigest(expected) => {
            active.is_some_and(|revision| revision.digest == *expected)
        }
    }
}
