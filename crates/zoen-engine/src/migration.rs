use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, CommitSequence, DefinitionDigest, DefinitionElementKind,
    DefinitionImpactApplicability, DefinitionImpactArea, DefinitionReference,
    DefinitionRevisionNumber, EntityId, EvidenceDraft, EvolutionClassification, ExactValue,
    IntentDigest, MigrationArtifactDependency, MigrationDependency, MigrationElement,
    MigrationPlan, MigrationPostcondition, MigrationProgress, MigrationRecord, MigrationRule,
    MigrationRuleId, MigrationRuleKind, OperationId, PolicyEvaluation, PolicyEvidence, RelationId,
    ResourceId, TimestampMicros, ValidTime,
};

use crate::{
    AdmittedEvidence, AuthorityStore, DefinitionEngine, PolicyEvaluator, PolicyOperation,
    PolicyRequest, RecordEvidenceError, StoreError, admission, decode_canonical_definition,
};

const MIGRATION_ACTION_ID: &str = "zoen.definition.migrate";
const MIGRATION_PLAN_SCHEMA: &str = "zoen.migration.v1";

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

#[derive(Clone, Debug)]
pub struct AdmittedMigrationPlan {
    canonical_plan: String,
    context: zoen_core::ExecutionContext,
    intent_digest: IntentDigest,
    plan: MigrationPlan,
    policy: PolicyEvidence,
    prepared_at: TimestampMicros,
}

impl AdmittedMigrationPlan {
    pub fn canonical_plan(&self) -> &str {
        &self.canonical_plan
    }

    pub fn context(&self) -> &zoen_core::ExecutionContext {
        &self.context
    }

    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    pub fn plan(&self) -> &MigrationPlan {
        &self.plan
    }

    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    pub fn prepared_at(&self) -> TimestampMicros {
        self.prepared_at
    }
}

#[derive(Clone, Debug)]
pub struct AdmittedMigrationRecord {
    evidence: AdmittedEvidence,
    kind: MigrationRuleKind,
    rule_id: MigrationRuleId,
    source_claim_ids: Vec<zoen_core::ClaimId>,
}

impl AdmittedMigrationRecord {
    pub fn evidence(&self) -> &AdmittedEvidence {
        &self.evidence
    }

    pub fn kind(&self) -> MigrationRuleKind {
        self.kind
    }

    pub fn rule_id(&self) -> &MigrationRuleId {
        &self.rule_id
    }

    pub fn source_claim_ids(&self) -> &[zoen_core::ClaimId] {
        &self.source_claim_ids
    }
}

#[derive(Clone, Debug)]
pub struct AdmittedMigrationBatch {
    batch_index: u32,
    context: zoen_core::ExecutionContext,
    intent_digest: IntentDigest,
    migration: MigrationProgress,
    policy: PolicyEvidence,
    records: Vec<AdmittedMigrationRecord>,
}

impl AdmittedMigrationBatch {
    pub fn batch_index(&self) -> u32 {
        self.batch_index
    }

    pub fn context(&self) -> &zoen_core::ExecutionContext {
        &self.context
    }

    pub fn intent_digest(&self) -> &IntentDigest {
        &self.intent_digest
    }

    pub fn migration(&self) -> &MigrationProgress {
        &self.migration
    }

    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    pub fn records(&self) -> &[AdmittedMigrationRecord] {
        &self.records
    }
}

impl<S, P> DefinitionEngine<S, P>
where
    S: AuthorityStore,
    P: PolicyEvaluator,
{
    pub async fn prepare_migration(
        &self,
        context: &zoen_core::ExecutionContext,
        plan: MigrationPlan,
        prepared_at: TimestampMicros,
    ) -> Result<MigrationProgress, MigrationError> {
        validate_plan_shape(&plan)?;
        let assessment = self
            .plan_evolution(
                context,
                &plan.from.definition_id,
                &plan.from.digest,
                &plan.to.digest,
            )
            .await
            .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?;
        validate_plan_against_assessment(&plan, &assessment)?;
        let target = self
            .store
            .get_revision(context.tenant_id(), &plan.to.definition_id, &plan.to.digest)
            .await
            .map_err(MigrationError::Store)?;
        let target_definition = decode_canonical_definition(&target.canonical_json)
            .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?;
        for postcondition in &plan.postconditions {
            if !target_definition
                .relations
                .iter()
                .any(|relation| relation.id == postcondition.relation_id)
            {
                return Err(MigrationError::InvalidPlan(format!(
                    "postcondition names unknown target Relation {}",
                    postcondition.relation_id
                )));
            }
        }
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

    pub async fn apply_migration_batch(
        &self,
        context: &zoen_core::ExecutionContext,
        operation_id: &OperationId,
        batch_index: u32,
        records: Vec<MigrationRecord>,
        applied_at: TimestampMicros,
    ) -> Result<MigrationProgress, MigrationError> {
        let migration = self
            .store
            .get_migration(context.tenant_id(), operation_id)
            .await
            .map_err(MigrationError::Store)?;
        if batch_index >= migration.plan.expected_batches {
            return Err(MigrationError::InvalidPlan(format!(
                "batch index {batch_index} is outside expected batch count {}",
                migration.plan.expected_batches
            )));
        }
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
        let mut admitted = Vec::with_capacity(records.len());
        for record in &records {
            let rule = migration
                .plan
                .rules
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
            if rule.kind != MigrationRuleKind::Recompute && record.source_claim_ids.is_empty() {
                return Err(MigrationError::InvalidPlan(format!(
                    "rule {} requires source claims",
                    rule.id
                )));
            }
            let evidence = admission::admit_evidence(&target, record.target.clone())
                .map_err(migration_evidence_error)?;
            admitted.push(AdmittedMigrationRecord {
                evidence,
                kind: rule.kind,
                rule_id: record.rule_id.clone(),
                source_claim_ids: record.source_claim_ids.clone(),
            });
        }
        let intent_digest = batch_digest(operation_id, batch_index, &records)?;
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
                resource_id: &resource_id,
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

fn validate_plan_shape(plan: &MigrationPlan) -> Result<(), MigrationError> {
    if plan.format_version != 1 {
        return Err(MigrationError::InvalidPlan(
            "format_version must be 1".to_owned(),
        ));
    }
    if plan.expected_batches == 0 {
        return Err(MigrationError::InvalidPlan(
            "expected_batches must be positive".to_owned(),
        ));
    }
    if plan.from.definition_id != plan.to.definition_id {
        return Err(MigrationError::InvalidPlan(
            "source and target definition IDs differ".to_owned(),
        ));
    }
    if !matches!(
        plan.classification,
        EvolutionClassification::RequiresMigration | EvolutionClassification::Breaking
    ) {
        return Err(MigrationError::InvalidPlan(
            "only requires_migration or breaking assessments accept a MigrationPlan".to_owned(),
        ));
    }
    if plan.rules.is_empty() {
        return Err(MigrationError::InvalidPlan(
            "at least one migration rule is required".to_owned(),
        ));
    }
    let rule_ids = plan
        .rules
        .iter()
        .map(|rule| rule.id.clone())
        .collect::<BTreeSet<_>>();
    if rule_ids.len() != plan.rules.len() {
        return Err(MigrationError::InvalidPlan(
            "migration rule IDs must be unique".to_owned(),
        ));
    }
    if plan
        .postconditions
        .iter()
        .any(|postcondition| postcondition.minimum_record_count == 0)
    {
        return Err(MigrationError::InvalidPlan(
            "postcondition record counts must be positive".to_owned(),
        ));
    }
    Ok(())
}

fn validate_plan_against_assessment(
    plan: &MigrationPlan,
    assessment: &zoen_core::EvolutionPlan,
) -> Result<(), MigrationError> {
    if plan.from != assessment.from || plan.to != assessment.to {
        return Err(MigrationError::InvalidPlan(
            "plan source or target does not match the published revision pair".to_owned(),
        ));
    }
    if plan.classification != assessment.classification {
        return Err(MigrationError::InvalidPlan(format!(
            "plan classification {:?} does not match assessment {:?}",
            plan.classification, assessment.classification
        )));
    }
    let expected_elements = assessment
        .changes
        .iter()
        .map(|change| MigrationElement {
            element: change.element,
            id: change.id.clone(),
        })
        .collect::<BTreeSet<_>>();
    let actual_elements = plan
        .affected_elements
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if actual_elements != expected_elements || actual_elements.len() != plan.affected_elements.len()
    {
        return Err(MigrationError::InvalidPlan(
            "affected_elements does not match the complete semantic diff".to_owned(),
        ));
    }
    let expected_artifacts = assessment
        .impacts
        .iter()
        .filter(|impact| impact.applicability == DefinitionImpactApplicability::Applicable)
        .filter(|impact| {
            matches!(
                impact.area,
                DefinitionImpactArea::QueryAndMaterializationArtifacts
                    | DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts
                    | DefinitionImpactArea::PolicyAndAuthorityContracts
            )
        })
        .flat_map(|impact| {
            impact
                .affected
                .iter()
                .cloned()
                .map(|id| MigrationArtifactDependency {
                    area: impact.area,
                    id,
                })
        })
        .collect::<BTreeSet<_>>();
    let actual_artifacts = plan
        .artifact_dependencies
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if actual_artifacts != expected_artifacts
        || actual_artifacts.len() != plan.artifact_dependencies.len()
    {
        return Err(MigrationError::InvalidPlan(
            "artifact_dependencies omits or adds query, generated, or authority impact".to_owned(),
        ));
    }
    let covered_elements = plan
        .rules
        .iter()
        .flat_map(|rule| rule.sources.iter().chain(&rule.targets))
        .cloned()
        .collect::<BTreeSet<_>>();
    if covered_elements != expected_elements {
        return Err(MigrationError::InvalidPlan(
            "migration rules do not cover every affected semantic identity".to_owned(),
        ));
    }
    Ok(())
}

fn migration_evidence_error(error: RecordEvidenceError) -> MigrationError {
    MigrationError::InvalidEvidence(error.to_string())
}

fn digest(bytes: &[u8]) -> Result<IntentDigest, MigrationError> {
    IntentDigest::parse(hex_digest(Sha256::digest(bytes)))
        .map_err(|error| MigrationError::Configuration(error.to_string()))
}

fn batch_digest(
    operation_id: &OperationId,
    batch_index: u32,
    records: &[MigrationRecord],
) -> Result<IntentDigest, MigrationError> {
    let document = MigrationBatchDocument {
        batch_index,
        operation_id: operation_id.as_str().to_owned(),
        records: records.iter().map(MigrationRecordDocument::from).collect(),
        schema: "zoen.migration.batch.v1".to_owned(),
    };
    let canonical = serde_jcs::to_vec(&document)
        .map_err(|error| MigrationError::Configuration(error.to_string()))?;
    digest(&canonical)
}

fn encode_migration_plan(plan: &MigrationPlan) -> Result<String, MigrationError> {
    serde_jcs::to_string(&MigrationPlanDocument::from(plan))
        .map_err(|error| MigrationError::Configuration(error.to_string()))
}

pub fn decode_migration_plan(source: &str) -> Result<MigrationPlan, String> {
    let document =
        serde_json::from_str::<MigrationPlanDocument>(source).map_err(|error| error.to_string())?;
    if document.schema != MIGRATION_PLAN_SCHEMA {
        return Err("unknown migration plan schema".to_owned());
    }
    let normalized = serde_jcs::to_string(&document).map_err(|error| error.to_string())?;
    if normalized != source {
        return Err("migration plan is not canonical JSON".to_owned());
    }
    MigrationPlan::try_from(document)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationPlanDocument {
    affected_elements: Vec<MigrationElementDocument>,
    artifact_dependencies: Vec<MigrationArtifactDocument>,
    classification: String,
    dependencies: Vec<MigrationDependencyDocument>,
    expected_batches: u32,
    format_version: u32,
    from: DefinitionReferenceDocument,
    operation_id: String,
    postconditions: Vec<MigrationPostconditionDocument>,
    rules: Vec<MigrationRuleDocument>,
    schema: String,
    to: DefinitionReferenceDocument,
}

impl From<&MigrationPlan> for MigrationPlanDocument {
    fn from(plan: &MigrationPlan) -> Self {
        Self {
            affected_elements: plan
                .affected_elements
                .iter()
                .map(MigrationElementDocument::from)
                .collect(),
            artifact_dependencies: plan
                .artifact_dependencies
                .iter()
                .map(MigrationArtifactDocument::from)
                .collect(),
            classification: plan.classification.as_str().to_owned(),
            dependencies: plan
                .dependencies
                .iter()
                .map(MigrationDependencyDocument::from)
                .collect(),
            expected_batches: plan.expected_batches,
            format_version: plan.format_version,
            from: DefinitionReferenceDocument::from(&plan.from),
            operation_id: plan.operation_id.as_str().to_owned(),
            postconditions: plan
                .postconditions
                .iter()
                .map(MigrationPostconditionDocument::from)
                .collect(),
            rules: plan.rules.iter().map(MigrationRuleDocument::from).collect(),
            schema: MIGRATION_PLAN_SCHEMA.to_owned(),
            to: DefinitionReferenceDocument::from(&plan.to),
        }
    }
}

impl TryFrom<MigrationPlanDocument> for MigrationPlan {
    type Error = String;

    fn try_from(document: MigrationPlanDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            affected_elements: document
                .affected_elements
                .into_iter()
                .map(MigrationElement::try_from)
                .collect::<Result<_, _>>()?,
            artifact_dependencies: document
                .artifact_dependencies
                .into_iter()
                .map(MigrationArtifactDependency::try_from)
                .collect::<Result<_, _>>()?,
            classification: parse_classification(&document.classification)?,
            dependencies: document
                .dependencies
                .into_iter()
                .map(MigrationDependency::try_from)
                .collect::<Result<_, _>>()?,
            expected_batches: document.expected_batches,
            format_version: document.format_version,
            from: DefinitionReference::try_from(document.from)?,
            operation_id: OperationId::parse(document.operation_id)
                .map_err(|error| error.to_string())?,
            postconditions: document
                .postconditions
                .into_iter()
                .map(MigrationPostcondition::try_from)
                .collect::<Result<_, _>>()?,
            rules: document
                .rules
                .into_iter()
                .map(MigrationRule::try_from)
                .collect::<Result<_, _>>()?,
            to: DefinitionReference::try_from(document.to)?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DefinitionReferenceDocument {
    definition_id: String,
    digest: String,
    revision: u64,
}

impl From<&DefinitionReference> for DefinitionReferenceDocument {
    fn from(reference: &DefinitionReference) -> Self {
        Self {
            definition_id: reference.definition_id.as_str().to_owned(),
            digest: reference.digest.as_str().to_owned(),
            revision: reference.revision.get(),
        }
    }
}

impl TryFrom<DefinitionReferenceDocument> for DefinitionReference {
    type Error = String;

    fn try_from(document: DefinitionReferenceDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            definition_id: zoen_core::DefinitionId::parse(document.definition_id)
                .map_err(|error| error.to_string())?,
            digest: DefinitionDigest::parse(document.digest).map_err(|error| error.to_string())?,
            revision: DefinitionRevisionNumber::new(document.revision)
                .ok_or_else(|| "definition revision must be positive".to_owned())?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationElementDocument {
    element: String,
    id: String,
}

impl From<&MigrationElement> for MigrationElementDocument {
    fn from(element: &MigrationElement) -> Self {
        Self {
            element: element_name(element.element).to_owned(),
            id: element.id.clone(),
        }
    }
}

impl TryFrom<MigrationElementDocument> for MigrationElement {
    type Error = String;

    fn try_from(document: MigrationElementDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            element: parse_element(&document.element)?,
            id: document.id,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationArtifactDocument {
    area: String,
    id: String,
}

impl From<&MigrationArtifactDependency> for MigrationArtifactDocument {
    fn from(artifact: &MigrationArtifactDependency) -> Self {
        Self {
            area: impact_area_name(artifact.area).to_owned(),
            id: artifact.id.clone(),
        }
    }
}

impl TryFrom<MigrationArtifactDocument> for MigrationArtifactDependency {
    type Error = String;

    fn try_from(document: MigrationArtifactDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            area: parse_impact_area(&document.area)?,
            id: document.id,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationRuleDocument {
    id: String,
    kind: String,
    sources: Vec<MigrationElementDocument>,
    targets: Vec<MigrationElementDocument>,
}

impl From<&MigrationRule> for MigrationRuleDocument {
    fn from(rule: &MigrationRule) -> Self {
        Self {
            id: rule.id.as_str().to_owned(),
            kind: rule.kind.as_str().to_owned(),
            sources: rule
                .sources
                .iter()
                .map(MigrationElementDocument::from)
                .collect(),
            targets: rule
                .targets
                .iter()
                .map(MigrationElementDocument::from)
                .collect(),
        }
    }
}

impl TryFrom<MigrationRuleDocument> for MigrationRule {
    type Error = String;

    fn try_from(document: MigrationRuleDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            id: MigrationRuleId::parse(document.id).map_err(|error| error.to_string())?,
            kind: parse_rule_kind(&document.kind)?,
            sources: document
                .sources
                .into_iter()
                .map(MigrationElement::try_from)
                .collect::<Result<_, _>>()?,
            targets: document
                .targets
                .into_iter()
                .map(MigrationElement::try_from)
                .collect::<Result<_, _>>()?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationDependencyDocument {
    claim_id: String,
    commit_sequence: u64,
    entity_id: String,
    relation_id: String,
}

impl From<&MigrationDependency> for MigrationDependencyDocument {
    fn from(dependency: &MigrationDependency) -> Self {
        Self {
            claim_id: dependency.claim_id.as_str().to_owned(),
            commit_sequence: dependency.commit_sequence.get(),
            entity_id: dependency.entity_id.as_str().to_owned(),
            relation_id: dependency.relation_id.as_str().to_owned(),
        }
    }
}

impl TryFrom<MigrationDependencyDocument> for MigrationDependency {
    type Error = String;

    fn try_from(document: MigrationDependencyDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            claim_id: zoen_core::ClaimId::parse(document.claim_id)
                .map_err(|error| error.to_string())?,
            commit_sequence: CommitSequence::new(document.commit_sequence)
                .ok_or_else(|| "migration dependency commit must be positive".to_owned())?,
            entity_id: EntityId::parse(document.entity_id).map_err(|error| error.to_string())?,
            relation_id: RelationId::parse(document.relation_id)
                .map_err(|error| error.to_string())?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MigrationPostconditionDocument {
    minimum_record_count: u64,
    relation_id: String,
}

impl From<&MigrationPostcondition> for MigrationPostconditionDocument {
    fn from(postcondition: &MigrationPostcondition) -> Self {
        Self {
            minimum_record_count: postcondition.minimum_record_count,
            relation_id: postcondition.relation_id.as_str().to_owned(),
        }
    }
}

impl TryFrom<MigrationPostconditionDocument> for MigrationPostcondition {
    type Error = String;

    fn try_from(document: MigrationPostconditionDocument) -> Result<Self, Self::Error> {
        Ok(Self {
            minimum_record_count: document.minimum_record_count,
            relation_id: RelationId::parse(document.relation_id)
                .map_err(|error| error.to_string())?,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationBatchDocument {
    batch_index: u32,
    operation_id: String,
    records: Vec<MigrationRecordDocument>,
    schema: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationRecordDocument {
    rule_id: String,
    source_claim_ids: Vec<String>,
    target: EvidenceDraftDocument,
}

impl From<&MigrationRecord> for MigrationRecordDocument {
    fn from(record: &MigrationRecord) -> Self {
        Self {
            rule_id: record.rule_id.as_str().to_owned(),
            source_claim_ids: record
                .source_claim_ids
                .iter()
                .map(|claim_id| claim_id.as_str().to_owned())
                .collect(),
            target: EvidenceDraftDocument::from(&record.target),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EvidenceDraftDocument {
    claim_id: String,
    definition: DefinitionReferenceDocument,
    entity_id: String,
    relation_id: String,
    source_digest: String,
    source_id: String,
    source_ref: String,
    valid_from_micros: i64,
    valid_to_micros: Option<i64>,
    value: String,
}

impl From<&EvidenceDraft> for EvidenceDraftDocument {
    fn from(draft: &EvidenceDraft) -> Self {
        let (valid_from_micros, valid_to_micros) = match draft.valid_time {
            ValidTime::Instant(at) => (at.get(), None),
            ValidTime::Interval { start, end } => (start.get(), Some(end.get())),
        };
        Self {
            claim_id: draft.claim_id.as_str().to_owned(),
            definition: DefinitionReferenceDocument::from(&draft.definition),
            entity_id: draft.entity_id.as_str().to_owned(),
            relation_id: draft.relation_id.as_str().to_owned(),
            source_digest: draft.provenance.source_digest.as_str().to_owned(),
            source_id: draft.provenance.source_id.as_str().to_owned(),
            source_ref: draft.provenance.source_ref.clone(),
            valid_from_micros,
            valid_to_micros,
            value: value_key(&draft.value),
        }
    }
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

fn parse_classification(value: &str) -> Result<EvolutionClassification, String> {
    match value {
        "compatible" => Ok(EvolutionClassification::Compatible),
        "requires_migration" => Ok(EvolutionClassification::RequiresMigration),
        "breaking" => Ok(EvolutionClassification::Breaking),
        "forbidden" => Ok(EvolutionClassification::Forbidden),
        _ => Err(format!("unknown evolution classification {value:?}")),
    }
}

fn element_name(element: DefinitionElementKind) -> &'static str {
    match element {
        DefinitionElementKind::Type => "type",
        DefinitionElementKind::Relation => "relation",
        DefinitionElementKind::Computation => "computation",
        DefinitionElementKind::Action => "action",
    }
}

fn parse_element(value: &str) -> Result<DefinitionElementKind, String> {
    match value {
        "type" => Ok(DefinitionElementKind::Type),
        "relation" => Ok(DefinitionElementKind::Relation),
        "computation" => Ok(DefinitionElementKind::Computation),
        "action" => Ok(DefinitionElementKind::Action),
        _ => Err(format!("unknown definition element kind {value:?}")),
    }
}

fn impact_area_name(area: DefinitionImpactArea) -> &'static str {
    match area {
        DefinitionImpactArea::Types => "types",
        DefinitionImpactArea::Relations => "relations",
        DefinitionImpactArea::Computations => "computations",
        DefinitionImpactArea::Actions => "actions",
        DefinitionImpactArea::DomainPackageDependencies => "domain_package_dependencies",
        DefinitionImpactArea::StoredSemanticRecords => "stored_semantic_records",
        DefinitionImpactArea::QueryAndMaterializationArtifacts => {
            "query_and_materialization_artifacts"
        }
        DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts => {
            "generated_sdk_and_surface_artifacts"
        }
        DefinitionImpactArea::PolicyAndWasmReferences => "policy_and_wasm_references",
        DefinitionImpactArea::PolicyAndAuthorityContracts => "policy_and_authority_contracts",
        DefinitionImpactArea::WasmComponents => "wasm_components",
    }
}

fn parse_impact_area(value: &str) -> Result<DefinitionImpactArea, String> {
    match value {
        "types" => Ok(DefinitionImpactArea::Types),
        "relations" => Ok(DefinitionImpactArea::Relations),
        "computations" => Ok(DefinitionImpactArea::Computations),
        "actions" => Ok(DefinitionImpactArea::Actions),
        "domain_package_dependencies" => Ok(DefinitionImpactArea::DomainPackageDependencies),
        "stored_semantic_records" => Ok(DefinitionImpactArea::StoredSemanticRecords),
        "query_and_materialization_artifacts" => {
            Ok(DefinitionImpactArea::QueryAndMaterializationArtifacts)
        }
        "generated_sdk_and_surface_artifacts" => {
            Ok(DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts)
        }
        "policy_and_wasm_references" => Ok(DefinitionImpactArea::PolicyAndWasmReferences),
        "policy_and_authority_contracts" => Ok(DefinitionImpactArea::PolicyAndAuthorityContracts),
        "wasm_components" => Ok(DefinitionImpactArea::WasmComponents),
        _ => Err(format!("unknown definition impact area {value:?}")),
    }
}

fn parse_rule_kind(value: &str) -> Result<MigrationRuleKind, String> {
    match value {
        "preserve_meaning" => Ok(MigrationRuleKind::PreserveMeaning),
        "recompute" => Ok(MigrationRuleKind::Recompute),
        "supersede" => Ok(MigrationRuleKind::Supersede),
        "transform" => Ok(MigrationRuleKind::Transform),
        _ => Err(format!("unknown migration rule kind {value:?}")),
    }
}

fn hex_digest(bytes: impl AsRef<[u8]>) -> String {
    bytes
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
