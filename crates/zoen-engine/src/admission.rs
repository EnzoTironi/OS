use std::cmp::Ordering;
use std::fmt::Display;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use zoen_core::{
    ActionDefinition, ActionEffect, ActionId, ActionOutputDefinition, BinaryOperator,
    CanonicalDefinition, CanonicalJson, Cardinality, ComputationDefinition, ComputationId,
    DefinitionDigest, DefinitionId, DefinitionRevision, DefinitionRevisionNumber, DefinitionSchema,
    EntityId, EvidenceDraft, ExactDecimal, ExactInteger, ExactValue, Expression, InputDefinition,
    InputId, OutputId, RelationDefinition, RelationId, RelationTarget, TypeDefinition, TypeId,
    UnitId, ValueType,
};

use crate::metrics::{record_admit_latency, record_jcs_mismatch};
use crate::{
    AdmittedDefinitionPublication, AdmittedEvidence, EvidenceValidationError, ProjectionEvent,
    PublishError, RecordEvidenceError, verify_digest,
};

mod validation;

use validation::validate_definition;
pub use validation::{DefinitionFamily, ReferenceKind, ValidationError};

pub(crate) fn admit(
    bytes: &[u8],
    claimed_digest: DefinitionDigest,
) -> Result<AdmittedDefinitionPublication, PublishError> {
    let started = Instant::now();
    let result = admit_inner(bytes, claimed_digest);
    record_admit_latency(started);
    result
}

fn admit_inner(
    bytes: &[u8],
    claimed_digest: DefinitionDigest,
) -> Result<AdmittedDefinitionPublication, PublishError> {
    let canonical = zoen_core::canonicalize_json_bytes(bytes)
        .map_err(|error| PublishError::MalformedDefinition(error.to_string()))?;
    if canonical.as_bytes() != bytes {
        record_jcs_mismatch();
        return Err(PublishError::NonCanonicalDefinition);
    }
    let mut dto = serde_json::from_str::<CanonicalDefinitionDto>(&canonical)
        .map_err(|error| PublishError::MalformedDefinition(error.to_string()))?;
    normalize(&mut dto);
    let via_serde_jcs = serde_jcs::to_vec(&dto)
        .map_err(|error| PublishError::MalformedDefinition(error.to_string()))?;
    if via_serde_jcs != bytes {
        record_jcs_mismatch();
        return Err(PublishError::NonCanonicalDefinition);
    }
    let canonical_json = CanonicalJson::new(canonical)
        .ok_or_else(|| PublishError::MalformedDefinition("empty document".to_owned()))?;
    if !verify_digest(&canonical_json, &claimed_digest) {
        return Err(PublishError::DigestMismatch);
    }

    let definition = decode(&canonical_json)?;
    let event = ProjectionEvent::definition_published(
        &definition.id,
        definition.revision,
        &claimed_digest,
    )?;
    Ok(AdmittedDefinitionPublication::new(
        canonical_json,
        definition.id,
        claimed_digest,
        definition.revision,
        event,
    ))
}

pub(crate) fn admit_evidence(
    revision: &DefinitionRevision,
    draft: EvidenceDraft,
) -> Result<AdmittedEvidence, RecordEvidenceError> {
    if draft.claim_id.as_str().starts_with("claim.action.") {
        return Err(RecordEvidenceError::InvalidEvidence(
            EvidenceValidationError::ReservedClaimId(draft.claim_id.as_str().to_owned()),
        ));
    }
    admit_evidence_draft(revision, draft)
}

pub(crate) fn admit_action_effect(
    revision: &DefinitionRevision,
    draft: EvidenceDraft,
) -> Result<AdmittedEvidence, RecordEvidenceError> {
    admit_evidence_draft(revision, draft)
}

fn admit_evidence_draft(
    revision: &DefinitionRevision,
    draft: EvidenceDraft,
) -> Result<AdmittedEvidence, RecordEvidenceError> {
    if revision.definition_id != draft.definition.definition_id
        || revision.digest != draft.definition.digest
        || revision.revision != draft.definition.revision
    {
        return Err(RecordEvidenceError::InvalidEvidence(
            EvidenceValidationError::DefinitionReferenceMismatch,
        ));
    }
    if draft.provenance.source_ref.trim().is_empty() {
        return Err(RecordEvidenceError::InvalidEvidence(
            EvidenceValidationError::EmptySourceReference,
        ));
    }

    let definition = decode(&revision.canonical_json).map_err(|error| {
        RecordEvidenceError::InvalidEvidence(EvidenceValidationError::MalformedDefinition(
            error.to_string(),
        ))
    })?;
    let relation = definition
        .relations
        .iter()
        .find(|relation| relation.id == draft.relation_id)
        .ok_or_else(|| {
            RecordEvidenceError::InvalidEvidence(EvidenceValidationError::UnknownRelation(
                draft.relation_id.as_str().to_owned(),
            ))
        })?;
    let value_matches_target = match &relation.target {
        RelationTarget::Type(_) => matches!(&draft.value, ExactValue::Entity(_)),
        RelationTarget::Value(value_type) => value_matches(value_type, &draft.value),
    };
    if !value_matches_target {
        return Err(RecordEvidenceError::InvalidEvidence(
            EvidenceValidationError::ValueTypeMismatch(draft.relation_id.as_str().to_owned()),
        ));
    }

    let event = ProjectionEvent::claim_recorded(&draft)?;
    Ok(AdmittedEvidence::new(draft, event))
}

pub fn decode_canonical_definition(
    canonical_json: &CanonicalJson,
) -> Result<CanonicalDefinition, PublishError> {
    decode(canonical_json)
}

fn decode(canonical_json: &CanonicalJson) -> Result<CanonicalDefinition, PublishError> {
    let dto = serde_json::from_str::<CanonicalDefinitionDto>(canonical_json.as_str())
        .map_err(|error| PublishError::MalformedDefinition(error.to_string()))?;
    let definition = convert_definition(dto)?;
    validate_definition(&definition).map_err(PublishError::InvalidDefinition)?;
    Ok(definition)
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

fn normalize(dto: &mut CanonicalDefinitionDto) {
    dto.actions
        .sort_by(|left, right| compare_code_points(&left.id, &right.id));
    for action in &mut dto.actions {
        action
            .effects
            .sort_by(|left, right| compare_code_points(&left.relation_id, &right.relation_id));
        sort_inputs(&mut action.inputs);
        action
            .outputs
            .sort_by(|left, right| compare_code_points(&left.id, &right.id));
    }
    dto.computations
        .sort_by(|left, right| compare_code_points(&left.id, &right.id));
    for computation in &mut dto.computations {
        sort_inputs(&mut computation.inputs);
    }
    dto.relations
        .sort_by(|left, right| compare_code_points(&left.id, &right.id));
    dto.types
        .sort_by(|left, right| compare_code_points(&left.id, &right.id));
    for definition_type in &mut dto.types {
        sort_inputs(&mut definition_type.attributes);
    }
}

fn sort_inputs(inputs: &mut [InputDefinitionDto]) {
    inputs.sort_by(|left, right| compare_code_points(&left.id, &right.id));
}

fn compare_code_points(left: &str, right: &str) -> Ordering {
    left.chars().cmp(right.chars())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionPublishedV1<'a> {
    definition_id: &'a str,
    digest: &'a str,
    revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimRecordedV1<'a> {
    claim_id: &'a str,
    definition_id: &'a str,
    digest: &'a str,
    revision: u64,
}

impl ProjectionEvent {
    fn definition_published(
        definition_id: &DefinitionId,
        revision: DefinitionRevisionNumber,
        digest: &DefinitionDigest,
    ) -> Result<Self, PublishError> {
        let payload = serde_jcs::to_string(&DefinitionPublishedV1 {
            definition_id: definition_id.as_str(),
            digest: digest.as_str(),
            revision: revision.get(),
        })
        .map_err(|error| PublishError::EventEncoding(error.to_string()))?;
        Ok(Self {
            event_type: "DefinitionPublished",
            event_version: 1,
            payload,
        })
    }

    fn claim_recorded(draft: &EvidenceDraft) -> Result<Self, RecordEvidenceError> {
        let payload = serde_jcs::to_string(&ClaimRecordedV1 {
            claim_id: draft.claim_id.as_str(),
            definition_id: draft.definition.definition_id.as_str(),
            digest: draft.definition.digest.as_str(),
            revision: draft.definition.revision.get(),
        })
        .map_err(|error| RecordEvidenceError::EventEncoding(error.to_string()))?;
        Ok(Self {
            event_type: "ClaimRecorded",
            event_version: 1,
            payload,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CanonicalDefinitionDto {
    actions: Vec<ActionDefinitionDto>,
    computations: Vec<ComputationDefinitionDto>,
    definition_id: String,
    relations: Vec<RelationDefinitionDto>,
    revision: u64,
    schema: DefinitionSchemaDto,
    types: Vec<TypeDefinitionDto>,
}

#[derive(Deserialize, Serialize)]
enum DefinitionSchemaDto {
    #[serde(rename = "zoen.definition.v1")]
    V1,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InputDefinitionDto {
    id: String,
    value_type: ValueTypeDto,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypeDefinitionDto {
    attributes: Vec<InputDefinitionDto>,
    id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum RelationTargetDto {
    Type { type_id: String },
    Value { value_type: ValueTypeDto },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RelationDefinitionDto {
    cardinality: CardinalityDto,
    id: String,
    source_type: String,
    target: RelationTargetDto,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum CardinalityDto {
    Many,
    One,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComputationDefinitionDto {
    expression: ExpressionDto,
    id: String,
    inputs: Vec<InputDefinitionDto>,
    returns: ValueTypeDto,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionEffectDto {
    relation_id: String,
    value: ExpressionDto,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionDefinitionDto {
    effects: Vec<ActionEffectDto>,
    id: String,
    inputs: Vec<InputDefinitionDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    outputs: Vec<ActionOutputDefinitionDto>,
    precondition: ExpressionDto,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionOutputDefinitionDto {
    id: String,
    value_type: ValueTypeDto,
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum ValueTypeDto {
    Bool,
    Decimal,
    Entity { type_id: String },
    Integer,
    Quantity { unit: String },
    Text,
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum ExactValueDto {
    Bool { value: bool },
    Decimal { value: String },
    Entity { value: String },
    Integer { value: String },
    Quantity { amount: String, unit: String },
    Text { value: String },
}

#[derive(Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum ExpressionDto {
    Binary {
        left: Box<ExpressionDto>,
        operator: BinaryOperatorDto,
        right: Box<ExpressionDto>,
    },
    Input {
        input_id: String,
    },
    Literal {
        value: ExactValueDto,
    },
    Relation {
        relation_id: String,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum BinaryOperatorDto {
    Add,
    GreaterThan,
    Multiply,
    Subtract,
}

fn convert_definition(dto: CanonicalDefinitionDto) -> Result<CanonicalDefinition, PublishError> {
    Ok(CanonicalDefinition {
        actions: dto
            .actions
            .into_iter()
            .map(convert_action)
            .collect::<Result<_, _>>()?,
        computations: dto
            .computations
            .into_iter()
            .map(convert_computation)
            .collect::<Result<_, _>>()?,
        id: DefinitionId::parse(dto.definition_id).map_err(invalid)?,
        relations: dto
            .relations
            .into_iter()
            .map(convert_relation)
            .collect::<Result<_, _>>()?,
        revision: DefinitionRevisionNumber::new(dto.revision).ok_or_else(|| {
            PublishError::InvalidCanonicalDefinition("revision must be positive".to_owned())
        })?,
        schema: match dto.schema {
            DefinitionSchemaDto::V1 => DefinitionSchema::V1,
        },
        types: dto
            .types
            .into_iter()
            .map(convert_type)
            .collect::<Result<_, _>>()?,
    })
}

fn convert_type(dto: TypeDefinitionDto) -> Result<TypeDefinition, PublishError> {
    Ok(TypeDefinition {
        attributes: dto
            .attributes
            .into_iter()
            .map(convert_input)
            .collect::<Result<_, _>>()?,
        id: TypeId::parse(dto.id).map_err(invalid)?,
    })
}

fn convert_relation(dto: RelationDefinitionDto) -> Result<RelationDefinition, PublishError> {
    Ok(RelationDefinition {
        cardinality: match dto.cardinality {
            CardinalityDto::Many => Cardinality::Many,
            CardinalityDto::One => Cardinality::One,
        },
        id: RelationId::parse(dto.id).map_err(invalid)?,
        source_type: TypeId::parse(dto.source_type).map_err(invalid)?,
        target: match dto.target {
            RelationTargetDto::Type { type_id } => {
                RelationTarget::Type(TypeId::parse(type_id).map_err(invalid)?)
            }
            RelationTargetDto::Value { value_type } => {
                RelationTarget::Value(convert_value_type(value_type)?)
            }
        },
    })
}

fn convert_computation(
    dto: ComputationDefinitionDto,
) -> Result<ComputationDefinition, PublishError> {
    Ok(ComputationDefinition {
        expression: convert_expression(dto.expression)?,
        id: ComputationId::parse(dto.id).map_err(invalid)?,
        inputs: dto
            .inputs
            .into_iter()
            .map(convert_input)
            .collect::<Result<_, _>>()?,
        returns: convert_value_type(dto.returns)?,
    })
}

fn convert_action(dto: ActionDefinitionDto) -> Result<ActionDefinition, PublishError> {
    Ok(ActionDefinition {
        effects: dto
            .effects
            .into_iter()
            .map(|effect| {
                Ok(ActionEffect {
                    relation_id: RelationId::parse(effect.relation_id).map_err(invalid)?,
                    value: convert_expression(effect.value)?,
                })
            })
            .collect::<Result<_, PublishError>>()?,
        id: ActionId::parse(dto.id).map_err(invalid)?,
        inputs: dto
            .inputs
            .into_iter()
            .map(convert_input)
            .collect::<Result<_, _>>()?,
        outputs: dto
            .outputs
            .into_iter()
            .map(|output| {
                Ok(ActionOutputDefinition {
                    id: OutputId::parse(output.id).map_err(invalid)?,
                    value_type: convert_value_type(output.value_type)?,
                })
            })
            .collect::<Result<_, PublishError>>()?,
        precondition: convert_expression(dto.precondition)?,
    })
}

fn convert_input(dto: InputDefinitionDto) -> Result<InputDefinition, PublishError> {
    Ok(InputDefinition {
        id: InputId::parse(dto.id).map_err(invalid)?,
        value_type: convert_value_type(dto.value_type)?,
    })
}

fn convert_value_type(dto: ValueTypeDto) -> Result<ValueType, PublishError> {
    Ok(match dto {
        ValueTypeDto::Bool => ValueType::Bool,
        ValueTypeDto::Decimal => ValueType::Decimal,
        ValueTypeDto::Entity { type_id } => ValueType::Entity {
            type_id: TypeId::parse(type_id).map_err(invalid)?,
        },
        ValueTypeDto::Integer => ValueType::Integer,
        ValueTypeDto::Quantity { unit } => ValueType::Quantity {
            unit: UnitId::parse(unit).map_err(invalid)?,
        },
        ValueTypeDto::Text => ValueType::Text,
    })
}

fn convert_expression(dto: ExpressionDto) -> Result<Expression, PublishError> {
    Ok(match dto {
        ExpressionDto::Binary {
            left,
            operator,
            right,
        } => Expression::Binary {
            left: Box::new(convert_expression(*left)?),
            operator: match operator {
                BinaryOperatorDto::Add => BinaryOperator::Add,
                BinaryOperatorDto::GreaterThan => BinaryOperator::GreaterThan,
                BinaryOperatorDto::Multiply => BinaryOperator::Multiply,
                BinaryOperatorDto::Subtract => BinaryOperator::Subtract,
            },
            right: Box::new(convert_expression(*right)?),
        },
        ExpressionDto::Input { input_id } => {
            Expression::Input(InputId::parse(input_id).map_err(invalid)?)
        }
        ExpressionDto::Literal { value } => Expression::Literal(convert_exact_value(value)?),
        ExpressionDto::Relation { relation_id } => {
            Expression::Relation(RelationId::parse(relation_id).map_err(invalid)?)
        }
    })
}

fn convert_exact_value(dto: ExactValueDto) -> Result<ExactValue, PublishError> {
    Ok(match dto {
        ExactValueDto::Bool { value } => ExactValue::Bool(value),
        ExactValueDto::Decimal { value } => {
            ExactValue::Decimal(ExactDecimal::parse(value).map_err(invalid)?)
        }
        ExactValueDto::Entity { value } => {
            ExactValue::Entity(EntityId::parse(value).map_err(invalid)?)
        }
        ExactValueDto::Integer { value } => {
            ExactValue::Integer(ExactInteger::parse(value).map_err(invalid)?)
        }
        ExactValueDto::Quantity { amount, unit } => ExactValue::Quantity {
            amount: ExactDecimal::parse(amount).map_err(invalid)?,
            unit: UnitId::parse(unit).map_err(invalid)?,
        },
        ExactValueDto::Text { value } => ExactValue::Text(value),
    })
}

fn invalid(error: impl Display) -> PublishError {
    PublishError::InvalidCanonicalDefinition(error.to_string())
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};
    use zoen_core::{DefinitionDigest, EntityId, ExactValue, TypeId, ValueType};

    use super::{
        CanonicalDefinitionDto, ExactValueDto, ValueTypeDto, admit, convert_exact_value,
        convert_value_type, value_matches,
    };
    use crate::PublishError;

    const INVENTORY: &str =
        include_str!("../../../packages/ontology/fixtures/inventory.canonical.json");
    const SCALE: &str = include_str!("../../../e2e/scale/definition.canonical.json");

    #[test]
    fn admission_converts_entity_value_type_and_exact_value() {
        let value_type = convert_value_type(ValueTypeDto::Entity {
            type_id: "inventory.Location".to_owned(),
        })
        .expect("entity type");
        assert_eq!(
            value_type,
            ValueType::Entity {
                type_id: TypeId::parse("inventory.Location").expect("type"),
            }
        );
        let value = convert_exact_value(ExactValueDto::Entity {
            value: "inventory.location.wh-1".to_owned(),
        })
        .expect("entity value");
        assert_eq!(
            value,
            ExactValue::Entity(EntityId::parse("inventory.location.wh-1").expect("entity"))
        );
        assert!(value_matches(&value_type, &value));
        assert!(!value_matches(
            &value_type,
            &ExactValue::Text("wh-1".to_owned())
        ));
    }

    #[test]
    fn admission_rejects_noncanonical_exact_integers() {
        for value in ["01", "+1", "-0"] {
            let canonical = with_integer(value);
            let error = admit(canonical.as_bytes(), digest(canonical.as_bytes()))
                .expect_err("noncanonical integer must fail admission");
            assert!(
                matches!(error, PublishError::InvalidCanonicalDefinition(_)),
                "{value}: {error}"
            );
        }
    }

    #[test]
    fn admission_keeps_canonical_integers_beyond_i64() {
        let canonical = with_integer("9223372036854775808");
        admit(canonical.as_bytes(), digest(canonical.as_bytes()))
            .expect("canonical integer must remain unbounded during admission");
    }

    #[test]
    fn scale_e2e_definition_is_rfc8785_normalized() {
        let raw = SCALE.trim();
        let mut dto = serde_json::from_str::<CanonicalDefinitionDto>(raw).expect("scale fixture");
        super::normalize(&mut dto);
        let expected = serde_jcs::to_string(&dto).expect("canonical JSON");
        assert_eq!(raw, expected, "expected RFC 8785:\n{expected}");
        admit(raw.as_bytes(), digest(raw.as_bytes())).expect("scale fixture must admit");
    }

    #[test]
    fn admission_jcs_matches_shared_rfc8785_vectors() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../testdata/jcs");
        for group in ["rfc8785", "zoen"] {
            let dir = root.join(group);
            for entry in std::fs::read_dir(&dir).expect("testdata") {
                let entry = entry.expect("entry");
                let name = entry.file_name();
                let name = name.to_string_lossy();
                let Some(stem) = name.strip_suffix(".json") else {
                    continue;
                };
                let input = std::fs::read(dir.join(format!("{stem}.json"))).expect("input");
                let expected =
                    String::from_utf8(std::fs::read(dir.join(format!("{stem}.jcs"))).expect("jcs"))
                        .expect("utf8");
                let via_core = zoen_core::canonicalize_json_bytes(&input).expect(stem);
                let parsed: serde_json::Value = serde_json::from_slice(&input).expect("json");
                let via_serde = serde_jcs::to_string(&parsed).expect("serde_jcs");
                assert_eq!(via_core, expected, "{group}/{stem} zoen-core");
                assert_eq!(via_serde, expected, "{group}/{stem} serde_jcs");
            }
        }
    }

    #[test]
    fn admission_rejects_non_jcs_bytes_via_zoen_core() {
        let raw = INVENTORY.trim();
        let spaced = raw.replacen('{', "{ ", 1);
        assert_ne!(spaced.as_bytes(), raw.as_bytes());
        let before = crate::metrics::jcs_mismatch_total();
        let error = admit(spaced.as_bytes(), digest(spaced.as_bytes()))
            .expect_err("zoen-core must reject non-canonical bytes");
        assert_eq!(error, PublishError::NonCanonicalDefinition);
        assert!(crate::metrics::jcs_mismatch_total() > before);
    }

    #[test]
    fn historical_inventory_definition_digest_is_not_silently_rehashed() {
        let canonical = INVENTORY.trim();
        let pinned = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../packages/ontology/fixtures/inventory.sha256"),
        )
        .expect("inventory.sha256");
        let pinned = pinned.trim();
        assert_eq!(digest(canonical.as_bytes()).as_str(), pinned);
        admit(canonical.as_bytes(), digest(canonical.as_bytes()))
            .expect("historical inventory must still admit");
    }

    #[test]
    fn admission_normalizes_unordered_families_before_comparing_bytes() {
        let mut dto =
            serde_json::from_str::<CanonicalDefinitionDto>(INVENTORY.trim()).expect("fixture");
        dto.types.reverse();
        let reordered = serde_jcs::to_vec(&dto).expect("canonical JSON");
        let error = admit(&reordered, digest(&reordered))
            .expect_err("non-normalized family order must fail admission");
        assert_eq!(error, PublishError::NonCanonicalDefinition);
    }

    fn with_integer(value: &str) -> String {
        INVENTORY.trim().replace(
            r#"{"amount":"0.125","kind":"quantity","unit":"kg"}"#,
            &format!(r#"{{"kind":"integer","value":"{value}"}}"#),
        )
    }

    fn digest(bytes: &[u8]) -> DefinitionDigest {
        let encoded = Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        DefinitionDigest::parse(encoded).expect("SHA-256 digest")
    }
}
