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
semantic_id!(ClaimId);
semantic_id!(ComputationId);
semantic_id!(DefinitionId);
semantic_id!(EntityId);
semantic_id!(InputId);
semantic_id!(RelationId);
semantic_id!(SourceId);
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceDigest(String);

impl EvidenceDigest {
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

impl Display for EvidenceDigest {
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
pub struct ExactIntegerError(String);

impl Display for ExactIntegerError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "noncanonical exact integer: {:?}", self.0)
    }
}

impl Error for ExactIntegerError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactInteger(String);

impl ExactInteger {
    pub fn parse(value: impl Into<String>) -> Result<Self, ExactIntegerError> {
        let value = value.into();
        if is_canonical_integer(&value) {
            Ok(Self(value))
        } else {
            Err(ExactIntegerError(value))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn is_canonical_integer(value: &str) -> bool {
    match value.as_bytes() {
        [b'0'] => true,
        [b'-', first, rest @ ..] | [first, rest @ ..] => {
            matches!(first, b'1'..=b'9') && rest.iter().all(u8::is_ascii_digit)
        }
        [] => false,
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
    Integer(ExactInteger),
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

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct TimestampMicros(i64);

impl TimestampMicros {
    pub fn new(value: i64) -> Self {
        Self(value)
    }

    pub fn get(self) -> i64 {
        self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidTimeError {
    start: TimestampMicros,
    end: TimestampMicros,
}

impl Display for ValidTimeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "valid-time interval end {} must be after start {}",
            self.end.get(),
            self.start.get()
        )
    }
}

impl Error for ValidTimeError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidTime {
    Instant(TimestampMicros),
    Interval {
        start: TimestampMicros,
        end: TimestampMicros,
    },
}

impl ValidTime {
    pub fn instant(at: TimestampMicros) -> Self {
        Self::Instant(at)
    }

    pub fn interval(start: TimestampMicros, end: TimestampMicros) -> Result<Self, ValidTimeError> {
        if start < end {
            Ok(Self::Interval { start, end })
        } else {
            Err(ValidTimeError { start, end })
        }
    }

    pub fn contains(&self, at: TimestampMicros) -> bool {
        match self {
            Self::Instant(instant) => *instant == at,
            Self::Interval { start, end } => *start <= at && at < *end,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionReference {
    pub definition_id: DefinitionId,
    pub digest: DefinitionDigest,
    pub revision: DefinitionRevisionNumber,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceProvenance {
    pub source_digest: EvidenceDigest,
    pub source_id: SourceId,
    pub source_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceDraft {
    pub claim_id: ClaimId,
    pub definition: DefinitionReference,
    pub entity_id: EntityId,
    pub provenance: EvidenceProvenance,
    pub relation_id: RelationId,
    pub valid_time: ValidTime,
    pub value: ExactValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceClaim {
    pub commit_sequence: CommitSequence,
    pub draft: EvidenceDraft,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Consistency {
    Strong,
    AtLeast(CommitSequence),
    Snapshot(CommitSequence),
    Eventual,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SemanticSelection {
    Computation(ComputationId),
    Relation(RelationId),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SemanticQuery {
    pub consistency: Consistency,
    pub definition: DefinitionReference,
    pub entity_id: EntityId,
    pub selection: SemanticSelection,
    pub valid_at: TimestampMicros,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum LineageRole {
    ComputationDependency,
    Rival,
    Supporting,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LineageDependency {
    pub claim_id: ClaimId,
    pub commit_sequence: CommitSequence,
    pub entity_id: EntityId,
    pub relation_id: RelationId,
    pub role: LineageRole,
    pub source_digest: EvidenceDigest,
    pub source_id: SourceId,
    pub source_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SemanticValue {
    pub dependencies: Vec<LineageDependency>,
    pub value: ExactValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SemanticResult {
    pub actual_commit_sequence: CommitSequence,
    pub definition: DefinitionReference,
    pub knowledge_cut: CommitSequence,
    pub valid_at: TimestampMicros,
    pub values: Vec<SemanticValue>,
}

#[cfg(test)]
mod tests {
    use super::{DefinitionDigest, ExactDecimal, ExactInteger, TimestampMicros, ValidTime};

    #[test]
    fn exact_integer_accepts_only_canonical_unbounded_forms() {
        for accepted in [
            "0",
            "12",
            "-12",
            "9223372036854775808",
            "-9223372036854775809",
        ] {
            let integer = ExactInteger::parse(accepted).expect("canonical integer");
            assert_eq!(integer.as_str(), accepted);
        }
        for rejected in ["", "-0", "01", "001", "+1", "1.0", "1e2"] {
            assert!(ExactInteger::parse(rejected).is_err(), "{rejected}");
        }
    }

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

    #[test]
    fn valid_time_distinguishes_instants_and_half_open_intervals() {
        let instant = ValidTime::instant(TimestampMicros::new(10));
        assert!(instant.contains(TimestampMicros::new(10)));
        assert!(!instant.contains(TimestampMicros::new(11)));

        let interval = ValidTime::interval(TimestampMicros::new(10), TimestampMicros::new(20))
            .expect("ordered interval");
        assert!(interval.contains(TimestampMicros::new(10)));
        assert!(interval.contains(TimestampMicros::new(19)));
        assert!(!interval.contains(TimestampMicros::new(20)));
        assert!(ValidTime::interval(TimestampMicros::new(20), TimestampMicros::new(20)).is_err());
    }
}
