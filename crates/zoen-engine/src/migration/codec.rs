use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use zoen_core::{
    CommitSequence, DefinitionDigest, DefinitionElementKind, DefinitionImpactArea,
    DefinitionReference, DefinitionRevisionNumber, EntityId, EvidenceDraft,
    EvolutionClassification, ExactValue, IntentDigest, MigrationArtifactDependency,
    MigrationDependency, MigrationElement, MigrationPlan, MigrationPostcondition, MigrationRecord,
    MigrationRule, MigrationRuleId, MigrationRuleKind, OperationId, RelationId, ValidTime,
};

use super::MigrationError;

const MIGRATION_PLAN_SCHEMA: &str = "zoen.migration.v1";

pub(super) fn digest(bytes: &[u8]) -> Result<IntentDigest, MigrationError> {
    IntentDigest::parse(hex_digest(Sha256::digest(bytes)))
        .map_err(|error| MigrationError::Configuration(error.to_string()))
}

pub(super) fn batch_digest(
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

pub(super) fn encode_migration_plan(plan: &MigrationPlan) -> Result<String, MigrationError> {
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
