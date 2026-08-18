use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};
use zoen_core::{
    ActionDefinition, ActionEffect, ActionId, BinaryOperator, CanonicalDefinition, CanonicalJson,
    Cardinality, ComputationDefinition, ComputationId, DefinitionId, DefinitionRevisionNumber,
    DefinitionSchema, ExactDecimal, ExactValue, Expression, InputDefinition, InputId,
    RelationDefinition, RelationId, RelationTarget, TypeDefinition, TypeId, UnitId, ValueType,
};

#[derive(Debug)]
pub enum CanonicalParseError {
    Invalid(String),
    Malformed(String),
    NonCanonical,
}

impl Display for CanonicalParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => write!(formatter, "invalid canonical definition: {message}"),
            Self::Malformed(message) => {
                write!(formatter, "malformed canonical definition JSON: {message}")
            }
            Self::NonCanonical => formatter.write_str("definition JSON is not RFC 8785 canonical"),
        }
    }
}

impl Error for CanonicalParseError {}

pub struct ParsedCanonical {
    pub canonical_json: CanonicalJson,
    pub definition: CanonicalDefinition,
}

pub fn parse_canonical(bytes: &[u8]) -> Result<ParsedCanonical, CanonicalParseError> {
    let dto = serde_json::from_slice::<CanonicalDefinitionDto>(bytes)
        .map_err(|error| CanonicalParseError::Malformed(error.to_string()))?;
    let normalized = serde_jcs::to_vec(&dto)
        .map_err(|error| CanonicalParseError::Malformed(error.to_string()))?;
    if normalized != bytes {
        return Err(CanonicalParseError::NonCanonical);
    }
    let canonical_json = String::from_utf8(bytes.to_vec())
        .map_err(|error| CanonicalParseError::Malformed(error.to_string()))?;
    Ok(ParsedCanonical {
        canonical_json: CanonicalJson::new(canonical_json)
            .ok_or_else(|| CanonicalParseError::Malformed("empty document".to_owned()))?,
        definition: convert_definition(dto)?,
    })
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
    precondition: ExpressionDto,
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

fn convert_definition(
    dto: CanonicalDefinitionDto,
) -> Result<CanonicalDefinition, CanonicalParseError> {
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
        revision: DefinitionRevisionNumber::new(dto.revision)
            .ok_or_else(|| CanonicalParseError::Invalid("revision must be positive".to_owned()))?,
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

fn convert_type(dto: TypeDefinitionDto) -> Result<TypeDefinition, CanonicalParseError> {
    Ok(TypeDefinition {
        attributes: dto
            .attributes
            .into_iter()
            .map(convert_input)
            .collect::<Result<_, _>>()?,
        id: TypeId::parse(dto.id).map_err(invalid)?,
    })
}

fn convert_relation(dto: RelationDefinitionDto) -> Result<RelationDefinition, CanonicalParseError> {
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
) -> Result<ComputationDefinition, CanonicalParseError> {
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

fn convert_action(dto: ActionDefinitionDto) -> Result<ActionDefinition, CanonicalParseError> {
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
            .collect::<Result<_, CanonicalParseError>>()?,
        id: ActionId::parse(dto.id).map_err(invalid)?,
        inputs: dto
            .inputs
            .into_iter()
            .map(convert_input)
            .collect::<Result<_, _>>()?,
        precondition: convert_expression(dto.precondition)?,
    })
}

fn convert_input(dto: InputDefinitionDto) -> Result<InputDefinition, CanonicalParseError> {
    Ok(InputDefinition {
        id: InputId::parse(dto.id).map_err(invalid)?,
        value_type: convert_value_type(dto.value_type)?,
    })
}

fn convert_value_type(dto: ValueTypeDto) -> Result<ValueType, CanonicalParseError> {
    Ok(match dto {
        ValueTypeDto::Bool => ValueType::Bool,
        ValueTypeDto::Decimal => ValueType::Decimal,
        ValueTypeDto::Integer => ValueType::Integer,
        ValueTypeDto::Quantity { unit } => ValueType::Quantity {
            unit: UnitId::parse(unit).map_err(invalid)?,
        },
        ValueTypeDto::Text => ValueType::Text,
    })
}

fn convert_expression(dto: ExpressionDto) -> Result<Expression, CanonicalParseError> {
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

fn convert_exact_value(dto: ExactValueDto) -> Result<ExactValue, CanonicalParseError> {
    Ok(match dto {
        ExactValueDto::Bool { value } => ExactValue::Bool(value),
        ExactValueDto::Decimal { value } => {
            ExactValue::Decimal(ExactDecimal::parse(value).map_err(invalid)?)
        }
        ExactValueDto::Integer { value } => ExactValue::Integer(
            value
                .parse::<i64>()
                .map_err(|error| CanonicalParseError::Invalid(error.to_string()))?,
        ),
        ExactValueDto::Quantity { amount, unit } => ExactValue::Quantity {
            amount: ExactDecimal::parse(amount).map_err(invalid)?,
            unit: UnitId::parse(unit).map_err(invalid)?,
        },
        ExactValueDto::Text { value } => ExactValue::Text(value),
    })
}

fn invalid(error: impl Display) -> CanonicalParseError {
    CanonicalParseError::Invalid(error.to_string())
}
