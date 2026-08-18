use std::error::Error;
use std::fmt::{Display, Formatter};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentifierError {
    kind: &'static str,
    value: String,
}

impl Display for IdentifierError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "invalid {}: {:?}", self.kind, self.value)
    }
}

impl Error for IdentifierError {}

macro_rules! semantic_id {
    ($name:ident) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
                parse_identifier(value.into(), stringify!($name)).map(Self)
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl Display for $name {
            fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

semantic_id!(ActionId);
semantic_id!(ComputationId);
semantic_id!(DefinitionId);
semantic_id!(InputId);
semantic_id!(RelationId);
semantic_id!(TenantId);
semantic_id!(TypeId);
semantic_id!(UnitId);

fn parse_identifier(value: String, kind: &'static str) -> Result<String, IdentifierError> {
    let mut characters = value.chars();
    let first_is_valid = characters
        .next()
        .is_some_and(|character| character.is_ascii_alphabetic());
    let rest_is_valid = characters
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-'));
    if first_is_valid && rest_is_valid {
        Ok(value)
    } else {
        Err(IdentifierError { kind, value })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DigestError(String);

impl Display for DigestError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "invalid SHA-256 digest: {:?}", self.0)
    }
}

impl Error for DigestError {}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DefinitionDigest(String);

impl DefinitionDigest {
    pub fn parse(value: impl Into<String>) -> Result<Self, DigestError> {
        let value = value.into();
        if value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
        {
            Ok(Self(value))
        } else {
            Err(DigestError(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for DefinitionDigest {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct DefinitionRevisionNumber(u64);

impl DefinitionRevisionNumber {
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub fn get(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CommitSequence(u64);

impl CommitSequence {
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub fn get(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CanonicalJson(String);

impl CanonicalJson {
    pub fn new(value: impl Into<String>) -> Option<Self> {
        let value = value.into();
        (!value.is_empty()).then_some(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactDecimalError(String);

impl Display for ExactDecimalError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "noncanonical exact decimal: {:?}", self.0)
    }
}

impl Error for ExactDecimalError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactDecimal(String);

impl ExactDecimal {
    pub fn parse(value: impl Into<String>) -> Result<Self, ExactDecimalError> {
        let value = value.into();
        if is_canonical_decimal(&value) {
            Ok(Self(value))
        } else {
            Err(ExactDecimalError(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn is_canonical_decimal(value: &str) -> bool {
    let magnitude = value.strip_prefix('-').unwrap_or(value);
    if magnitude.is_empty() || magnitude == "0" && value.starts_with('-') {
        return false;
    }

    let mut parts = magnitude.split('.');
    let integer = parts.next().unwrap_or_default();
    let fraction = parts.next();
    if parts.next().is_some()
        || integer.is_empty()
        || !integer.bytes().all(|byte| byte.is_ascii_digit())
        || integer.len() > 1 && integer.starts_with('0')
    {
        return false;
    }

    match fraction {
        None => true,
        Some(fraction) => {
            !fraction.is_empty()
                && fraction.bytes().all(|byte| byte.is_ascii_digit())
                && !fraction.ends_with('0')
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValueType {
    Bool,
    Decimal,
    Integer,
    Quantity { unit: UnitId },
    Text,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExactValue {
    Bool(bool),
    Decimal(ExactDecimal),
    Integer(i64),
    Quantity { amount: ExactDecimal, unit: UnitId },
    Text(String),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BinaryOperator {
    Add,
    GreaterThan,
    Multiply,
    Subtract,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Expression {
    Binary {
        left: Box<Expression>,
        operator: BinaryOperator,
        right: Box<Expression>,
    },
    Input(InputId),
    Literal(ExactValue),
    Relation(RelationId),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputDefinition {
    pub id: InputId,
    pub value_type: ValueType,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypeDefinition {
    pub attributes: Vec<InputDefinition>,
    pub id: TypeId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RelationTarget {
    Type(TypeId),
    Value(ValueType),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cardinality {
    Many,
    One,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelationDefinition {
    pub cardinality: Cardinality,
    pub id: RelationId,
    pub source_type: TypeId,
    pub target: RelationTarget,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComputationDefinition {
    pub expression: Expression,
    pub id: ComputationId,
    pub inputs: Vec<InputDefinition>,
    pub returns: ValueType,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionEffect {
    pub relation_id: RelationId,
    pub value: Expression,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionDefinition {
    pub effects: Vec<ActionEffect>,
    pub id: ActionId,
    pub inputs: Vec<InputDefinition>,
    pub precondition: Expression,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionSchema {
    V1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CanonicalDefinition {
    pub actions: Vec<ActionDefinition>,
    pub computations: Vec<ComputationDefinition>,
    pub id: DefinitionId,
    pub relations: Vec<RelationDefinition>,
    pub revision: DefinitionRevisionNumber,
    pub schema: DefinitionSchema,
    pub types: Vec<TypeDefinition>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublicationRequest {
    pub canonical_json: CanonicalJson,
    pub definition: CanonicalDefinition,
    pub digest: DefinitionDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionRevision {
    pub canonical_json: CanonicalJson,
    pub commit_sequence: CommitSequence,
    pub definition_id: DefinitionId,
    pub digest: DefinitionDigest,
    pub revision: DefinitionRevisionNumber,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecutionContext {
    pub tenant_id: TenantId,
}

#[cfg(test)]
mod tests {
    use super::{DefinitionDigest, ExactDecimal};

    #[test]
    fn exact_decimal_accepts_only_canonical_forms() {
        for accepted in ["0", "12", "-12", "0.125", "-0.125", "12.5"] {
            assert!(ExactDecimal::parse(accepted).is_ok(), "{accepted}");
        }
        for rejected in ["", "-0", "01", "1.0", "1.", ".1", "+1", "1e2"] {
            assert!(ExactDecimal::parse(rejected).is_err(), "{rejected}");
        }
    }

    #[test]
    fn digest_requires_lowercase_sha256_hex() {
        assert!(DefinitionDigest::parse("a".repeat(64)).is_ok());
        assert!(DefinitionDigest::parse("A".repeat(64)).is_err());
        assert!(DefinitionDigest::parse("a".repeat(63)).is_err());
    }
}
