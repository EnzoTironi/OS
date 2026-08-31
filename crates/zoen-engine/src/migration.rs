use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    ActionId, DefinitionElementKind, DefinitionReference, EvolutionClassification,
    MigrationElement, MigrationProgress, MigrationRecipe, MigrationRecord, MigrationRuleKind,
    OperationId, PolicyEvaluation, PolicyEvidence, ResourceId, TimestampMicros,
};

use crate::{
    AuthorityStore, DefinitionEngine, PolicyEvaluator, PolicyOperation, PolicyRequest, StoreError,
    admission, decode_canonical_definition, directory_projection,
};

mod codec;
mod model;
mod validation;

pub use codec::decode_migration_plan;
use codec::{batch_digest, digest, encode_migration_plan, evolution_assessment_digest};
pub use model::{
    AdmittedMigrationBatch, AdmittedMigrationPlan, AdmittedMigrationRecord, MigrationBatchPreflight,
};
use validation::build_plan;

const MIGRATION_ACTION_ID: &str = "zoen.definition.migrate";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MigrationError {
    Configuration(String),
    DelegationDenied,
    InvalidEvidence(String),
    InvalidPlan(String),
    PolicyDenied(PolicyEvidence),
    PolicyEvaluation {
        message: String,
        policy: Option<PolicyEvidence>,
    },
    Store(StoreError),
}

impl Display for MigrationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Configuration(message) => {
                write!(formatter, "migration is misconfigured: {message}")
            }
            Self::DelegationDenied => {
                formatter.write_str("delegation does not permit definition migration")
            }
            Self::InvalidEvidence(message) => {
                write!(formatter, "invalid migration evidence: {message}")
            }
            Self::InvalidPlan(message) => write!(formatter, "invalid migration plan: {message}"),
            Self::PolicyDenied(_) => formatter.write_str("definition migration was denied"),
            Self::PolicyEvaluation { message, .. } => {
                write!(formatter, "definition migration policy failed: {message}")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for MigrationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::Configuration(_)
            | Self::DelegationDenied
            | Self::InvalidEvidence(_)
            | Self::InvalidPlan(_)
            | Self::PolicyDenied(_)
            | Self::PolicyEvaluation { .. } => None,
        }
    }
}

impl<S, P> DefinitionEngine<S, P>
where
    S: AuthorityStore,
    P: PolicyEvaluator,
{
    /// Prepare a migration plan from a recipe and evolution assessment.
    ///
    /// # Errors
    ///
    /// Returns [`MigrationError`] when the plan is invalid, policy denies the action, or the store fails.
    pub async fn prepare_migration(
        &self,
        context: &zoen_core::ExecutionContext,
        recipe: MigrationRecipe,
        prepared_at: TimestampMicros,
    ) -> Result<MigrationProgress, MigrationError> {
        let assessment = self
            .plan_evolution(
                context,
                &recipe.definition_id,
                &recipe.from_digest,
                &recipe.to_digest,
            )
            .await
            .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?;
        let source = self
            .store
            .get_revision(
                context.tenant_id(),
                &recipe.definition_id,
                &recipe.from_digest,
            )
            .await
            .map_err(MigrationError::Store)?;
        let target = self
            .store
            .get_revision(
                context.tenant_id(),
                &recipe.definition_id,
                &recipe.to_digest,
            )
            .await
            .map_err(MigrationError::Store)?;
        let source_definition = decode_canonical_definition(&source.canonical_json)
            .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?;
        let target_definition = decode_canonical_definition(&target.canonical_json)
            .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?;
        let assessment_digest = evolution_assessment_digest(&assessment)?;
        let plan = build_plan(
            recipe,
            &assessment,
            &source_definition,
            &target_definition,
            assessment_digest,
        )?;
        let policy = self
            .authorize_migration(
                context,
                &plan.to,
                plan.classification,
                PolicyOperation::PrepareMigration,
                prepared_at,
            )
            .await?;
        let canonical_plan = encode_migration_plan(&plan)?;
        let intent_digest = digest(canonical_plan.as_bytes())?;
        self.store
            .prepare_migration(&AdmittedMigrationPlan {
                canonical_plan,
                context: context.clone(),
                intent_digest,
                plan,
                policy,
                prepared_at,
            })
            .await
            .map_err(MigrationError::Store)
    }

    /// Apply one batch of migration records to a prepared plan.
    ///
    /// # Errors
    ///
    /// Returns [`MigrationError`] when the batch does not match the plan, policy denies the
    /// action, evidence is invalid, or the store fails.
    pub async fn apply_migration_batch(
        &self,
        context: &zoen_core::ExecutionContext,
        operation_id: &OperationId,
        batch_index: u32,
        records: Vec<MigrationRecord>,
        applied_at: TimestampMicros,
    ) -> Result<MigrationProgress, MigrationError> {
        let intent_digest = batch_digest(operation_id, batch_index, &records)?;
        match self
            .store
            .preflight_migration_batch(
                context.tenant_id(),
                operation_id,
                batch_index,
                &intent_digest,
            )
            .await
            .map_err(MigrationError::Store)?
        {
            MigrationBatchPreflight::Replayed(progress) => return Ok(*progress),
            MigrationBatchPreflight::Mismatch => {
                return Err(MigrationError::Store(StoreError::OperationMismatch));
            }
            MigrationBatchPreflight::Ready => {}
        }
        let migration = self
            .store
            .get_migration(context.tenant_id(), operation_id)
            .await
            .map_err(MigrationError::Store)?;
        let policy = self
            .authorize_migration(
                context,
                &migration.plan.to,
                migration.plan.classification,
                PolicyOperation::ApplyMigrationBatch,
                applied_at,
            )
            .await?;
        let target = self
            .store
            .get_revision(
                context.tenant_id(),
                &migration.plan.to.definition_id,
                &migration.plan.to.digest,
            )
            .await
            .map_err(MigrationError::Store)?;
        let admitted = admit_migration_records(&target, &migration.plan.rules, &records)?;
        self.store
            .apply_migration_batch(&AdmittedMigrationBatch {
                batch_index,
                context: context.clone(),
                intent_digest,
                migration,
                policy,
                records: admitted,
            })
            .await
            .map_err(MigrationError::Store)
    }

    /// Load a stored migration by operation id.
    ///
    /// # Errors
    ///
    /// Returns [`MigrationError::Store`] when the authority store cannot load the migration.
    pub async fn get_migration(
        &self,
        context: &zoen_core::ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<MigrationProgress, MigrationError> {
        self.store
            .get_migration(context.tenant_id(), operation_id)
            .await
            .map_err(MigrationError::Store)
    }

    async fn authorize_migration(
        &self,
        context: &zoen_core::ExecutionContext,
        target: &DefinitionReference,
        classification: EvolutionClassification,
        operation: PolicyOperation,
        at: TimestampMicros,
    ) -> Result<PolicyEvidence, MigrationError> {
        let action_id = ActionId::parse(MIGRATION_ACTION_ID)
            .map_err(|error| MigrationError::Configuration(error.to_string()))?;
        let resource_id = ResourceId::parse(target.definition_id.as_str())
            .map_err(|error| MigrationError::Configuration(error.to_string()))?;
        if !context
            .delegation()
            .permits(&action_id, &resource_id, context.workload_id(), at)
        {
            return Err(MigrationError::DelegationDenied);
        }
        let projection =
            directory_projection(context, &resource_id).map_err(MigrationError::Configuration)?;
        match self
            .policy
            .evaluate(&PolicyRequest {
                action_id: &action_id,
                approved: false,
                classification: Some(classification),
                context,
                definition: target,
                inputs: &[],
                operation,
                projection: Some(&projection),
                resource_id: &resource_id,
                written_classification: None,
            })
            .await
        {
            PolicyEvaluation::Permit(policy) => Ok(policy),
            PolicyEvaluation::Deny(policy) => Err(MigrationError::PolicyDenied(policy)),
            PolicyEvaluation::EvaluationError { message, revision } => {
                Err(MigrationError::PolicyEvaluation {
                    message,
                    policy: revision.map(|revision| PolicyEvidence {
                        determining_policies: Vec::new(),
                        revision,
                    }),
                })
            }
        }
    }
}

fn admit_migration_records(
    target: &zoen_core::DefinitionRevision,
    rules: &[zoen_core::MigrationRule],
    records: &[MigrationRecord],
) -> Result<Vec<AdmittedMigrationRecord>, MigrationError> {
    let mut admitted = Vec::with_capacity(records.len());
    let mut source_claim_ids = BTreeSet::new();
    let mut target_claim_ids = BTreeSet::new();
    for record in records {
        let rule = rules
            .iter()
            .find(|rule| rule.id == record.rule_id)
            .ok_or_else(|| {
                MigrationError::InvalidPlan(format!(
                    "batch record names unknown rule {}",
                    record.rule_id
                ))
            })?;
        let target_element = MigrationElement {
            element: DefinitionElementKind::Relation,
            id: record.target.relation_id.as_str().to_owned(),
        };
        if !rule.targets.contains(&target_element) {
            return Err(MigrationError::InvalidPlan(format!(
                "rule {} does not target Relation {}",
                rule.id, record.target.relation_id
            )));
        }
        match rule.kind {
            MigrationRuleKind::PreserveMeaning if record.source_claim_ids.len() != 1 => {
                return Err(MigrationError::InvalidPlan(format!(
                    "preserve_meaning rule {} requires one source claim",
                    rule.id
                )));
            }
            MigrationRuleKind::Transform if record.source_claim_ids.is_empty() => {
                return Err(MigrationError::InvalidPlan(format!(
                    "transform rule {} requires source claims",
                    rule.id
                )));
            }
            MigrationRuleKind::Recompute if !record.source_claim_ids.is_empty() => {
                return Err(MigrationError::InvalidPlan(format!(
                    "recompute rule {} does not accept source claims",
                    rule.id
                )));
            }
            MigrationRuleKind::Supersede => {
                return Err(MigrationError::InvalidPlan(format!(
                    "supersede rule {} has no successor record",
                    rule.id
                )));
            }
            MigrationRuleKind::PreserveMeaning
            | MigrationRuleKind::Transform
            | MigrationRuleKind::Recompute => {}
        }
        if !record
            .source_claim_ids
            .iter()
            .all(|claim_id| source_claim_ids.insert(claim_id.clone()))
        {
            return Err(MigrationError::InvalidPlan(
                "a source claim may be resolved only once per batch".to_owned(),
            ));
        }
        if !target_claim_ids.insert(record.target.claim_id.clone()) {
            return Err(MigrationError::InvalidPlan(
                "a target claim may appear only once per batch".to_owned(),
            ));
        }
        let evidence = admission::admit_evidence(target, record.target.clone())
            .map_err(|error| MigrationError::InvalidEvidence(error.to_string()))?;
        admitted.push(AdmittedMigrationRecord {
            evidence,
            kind: rule.kind,
            rule_id: record.rule_id.clone(),
            source_claim_ids: record.source_claim_ids.clone(),
        });
    }
    Ok(admitted)
}
