use std::collections::{BTreeMap, BTreeSet};
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
semantic_id!(ActorId);
semantic_id!(ApprovalId);
semantic_id!(ClaimId);
semantic_id!(ComputationId);
semantic_id!(DelegationId);
semantic_id!(DefinitionId);
semantic_id!(EntityId);
semantic_id!(EffectRequestId);
semantic_id!(InputId);
semantic_id!(OperationId);
semantic_id!(PolicyId);
semantic_id!(PrincipalId);
semantic_id!(ProposalId);
semantic_id!(RelationId);
semantic_id!(ResourceId);
semantic_id!(SourceId);
semantic_id!(TenantId);
semantic_id!(TypeId);
semantic_id!(UnitId);
semantic_id!(WorkloadId);

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

macro_rules! sha256_digest {
    ($name:ident) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
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

        impl Display for $name {
            fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

sha256_digest!(IntentDigest);
sha256_digest!(PolicyDigest);
sha256_digest!(StateBasisDigest);

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
pub enum ExpressionEvaluationError {
    IntegerOutOfRange(&'static str),
    IntegerOverflow(&'static str),
    InvalidOperands,
    MissingInput(InputId),
}

impl Display for ExpressionEvaluationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IntegerOutOfRange(side) => {
                write!(formatter, "{side} integer exceeds i128")
            }
            Self::IntegerOverflow(operation) => {
                write!(formatter, "integer {operation} overflowed i128")
            }
            Self::InvalidOperands => {
                formatter.write_str("expression requires exact integer operands")
            }
            Self::MissingInput(input_id) => {
                write!(formatter, "missing expression input {}", input_id.as_str())
            }
        }
    }
}

impl Error for ExpressionEvaluationError {}

pub fn expression_relations(expression: &Expression) -> BTreeSet<RelationId> {
    let mut relations = BTreeSet::new();
    collect_expression_relations(expression, &mut relations);
    relations
}

pub fn evaluate_expression(
    expression: &Expression,
    inputs: &BTreeMap<InputId, ExactValue>,
    relations: &BTreeMap<RelationId, Vec<SemanticValue>>,
) -> Result<Vec<SemanticValue>, ExpressionEvaluationError> {
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
                    let mut dependencies =
                        Vec::with_capacity(left.dependencies.len() + right.dependencies.len());
                    dependencies.extend(left.dependencies.iter().cloned());
                    dependencies.extend(right.dependencies.iter().cloned());
                    values.push(SemanticValue {
                        dependencies,
                        value: apply_expression_operator(*operator, &left.value, &right.value)?,
                    });
                }
            }
            Ok(values)
        }
        Expression::Input(input_id) => inputs
            .get(input_id)
            .cloned()
            .map(|value| {
                vec![SemanticValue {
                    dependencies: Vec::new(),
                    value,
                }]
            })
            .ok_or_else(|| ExpressionEvaluationError::MissingInput(input_id.clone())),
        Expression::Literal(value) => Ok(vec![SemanticValue {
            dependencies: Vec::new(),
            value: value.clone(),
        }]),
        Expression::Relation(relation_id) => {
            Ok(relations.get(relation_id).cloned().unwrap_or_default())
        }
    }
}

fn collect_expression_relations(expression: &Expression, relations: &mut BTreeSet<RelationId>) {
    match expression {
        Expression::Binary { left, right, .. } => {
            collect_expression_relations(left, relations);
            collect_expression_relations(right, relations);
        }
        Expression::Relation(relation_id) => {
            relations.insert(relation_id.clone());
        }
        Expression::Input(_) | Expression::Literal(_) => {}
    }
}

fn apply_expression_operator(
    operator: BinaryOperator,
    left: &ExactValue,
    right: &ExactValue,
) -> Result<ExactValue, ExpressionEvaluationError> {
    let (ExactValue::Integer(left), ExactValue::Integer(right)) = (left, right) else {
        return Err(ExpressionEvaluationError::InvalidOperands);
    };
    let left = left
        .as_str()
        .parse::<i128>()
        .map_err(|_| ExpressionEvaluationError::IntegerOutOfRange("left"))?;
    let right = right
        .as_str()
        .parse::<i128>()
        .map_err(|_| ExpressionEvaluationError::IntegerOutOfRange("right"))?;
    match operator {
        BinaryOperator::Add => checked_expression_integer(left.checked_add(right), "addition"),
        BinaryOperator::GreaterThan => Ok(ExactValue::Bool(left > right)),
        BinaryOperator::Multiply => {
            checked_expression_integer(left.checked_mul(right), "multiplication")
        }
        BinaryOperator::Subtract => {
            checked_expression_integer(left.checked_sub(right), "subtraction")
        }
    }
}

fn checked_expression_integer(
    value: Option<i128>,
    operation: &'static str,
) -> Result<ExactValue, ExpressionEvaluationError> {
    let value = value.ok_or(ExpressionEvaluationError::IntegerOverflow(operation))?;
    ExactInteger::parse(value.to_string())
        .map(ExactValue::Integer)
        .map_err(|_| ExpressionEvaluationError::IntegerOverflow(operation))
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
pub struct TrustedExecutionContext {
    tenant_id: TenantId,
    actor_id: ActorId,
    delegation: DelegationChain,
    principal_id: PrincipalId,
    workload_id: WorkloadId,
}

impl TrustedExecutionContext {
    pub fn new(
        tenant_id: TenantId,
        actor_id: ActorId,
        principal_id: PrincipalId,
        workload_id: WorkloadId,
        delegation: DelegationChain,
    ) -> Self {
        Self {
            tenant_id,
            actor_id,
            delegation,
            principal_id,
            workload_id,
        }
    }

    pub fn actor_id(&self) -> &ActorId {
        &self.actor_id
    }

    pub fn delegation(&self) -> &DelegationChain {
        &self.delegation
    }

    pub fn principal_id(&self) -> &PrincipalId {
        &self.principal_id
    }

    pub fn tenant_id(&self) -> &TenantId {
        &self.tenant_id
    }

    pub fn workload_id(&self) -> &WorkloadId {
        &self.workload_id
    }
}

pub type ExecutionContext = TrustedExecutionContext;

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
pub enum DelegationError {
    EmptyChain,
    EmptyScope(DelegationId),
    ExpandedAction(DelegationId),
    ExpandedResource(DelegationId),
    ExpandedTime(DelegationId),
    ExpandedWorkload(DelegationId),
    InvalidTime(DelegationId),
}

impl Display for DelegationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyChain => formatter.write_str("delegation chain is empty"),
            Self::EmptyScope(id) => write!(formatter, "delegation {id} has an empty scope"),
            Self::ExpandedAction(id) => {
                write!(formatter, "delegation {id} expands its parent Action scope")
            }
            Self::ExpandedResource(id) => {
                write!(
                    formatter,
                    "delegation {id} expands its parent resource scope"
                )
            }
            Self::ExpandedTime(id) => {
                write!(formatter, "delegation {id} expands its parent time scope")
            }
            Self::ExpandedWorkload(id) => {
                write!(
                    formatter,
                    "delegation {id} expands its parent workload scope"
                )
            }
            Self::InvalidTime(id) => {
                write!(formatter, "delegation {id} has an invalid time scope")
            }
        }
    }
}

impl Error for DelegationError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationGrant {
    actions: BTreeSet<ActionId>,
    expires_at: TimestampMicros,
    id: DelegationId,
    not_before: TimestampMicros,
    resources: BTreeSet<ResourceId>,
    workloads: BTreeSet<WorkloadId>,
}

impl DelegationGrant {
    pub fn new(
        id: DelegationId,
        actions: BTreeSet<ActionId>,
        resources: BTreeSet<ResourceId>,
        workloads: BTreeSet<WorkloadId>,
        not_before: TimestampMicros,
        expires_at: TimestampMicros,
    ) -> Result<Self, DelegationError> {
        if actions.is_empty() || resources.is_empty() || workloads.is_empty() {
            return Err(DelegationError::EmptyScope(id));
        }
        if not_before >= expires_at {
            return Err(DelegationError::InvalidTime(id));
        }
        Ok(Self {
            actions,
            expires_at,
            id,
            not_before,
            resources,
            workloads,
        })
    }

    pub fn expires_at(&self) -> TimestampMicros {
        self.expires_at
    }

    pub fn actions(&self) -> &BTreeSet<ActionId> {
        &self.actions
    }

    pub fn id(&self) -> &DelegationId {
        &self.id
    }

    pub fn not_before(&self) -> TimestampMicros {
        self.not_before
    }

    pub fn resources(&self) -> &BTreeSet<ResourceId> {
        &self.resources
    }

    pub fn workloads(&self) -> &BTreeSet<WorkloadId> {
        &self.workloads
    }

    pub fn permits(
        &self,
        action_id: &ActionId,
        resource_id: &ResourceId,
        workload_id: &WorkloadId,
        at: TimestampMicros,
    ) -> bool {
        self.actions.contains(action_id)
            && self.resources.contains(resource_id)
            && self.workloads.contains(workload_id)
            && self.not_before <= at
            && at < self.expires_at
    }

    fn is_subset_of(&self, parent: &Self) -> Result<(), DelegationError> {
        if !self.actions.is_subset(&parent.actions) {
            return Err(DelegationError::ExpandedAction(self.id.clone()));
        }
        if !self.resources.is_subset(&parent.resources) {
            return Err(DelegationError::ExpandedResource(self.id.clone()));
        }
        if !self.workloads.is_subset(&parent.workloads) {
            return Err(DelegationError::ExpandedWorkload(self.id.clone()));
        }
        if self.not_before < parent.not_before || self.expires_at > parent.expires_at {
            return Err(DelegationError::ExpandedTime(self.id.clone()));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegationChain {
    grants: Vec<DelegationGrant>,
}

impl DelegationChain {
    pub fn new(grants: Vec<DelegationGrant>) -> Result<Self, DelegationError> {
        if grants.is_empty() {
            return Err(DelegationError::EmptyChain);
        }
        for pair in grants.windows(2) {
            pair[1].is_subset_of(&pair[0])?;
        }
        Ok(Self { grants })
    }

    pub fn grants(&self) -> &[DelegationGrant] {
        &self.grants
    }

    pub fn permits(
        &self,
        action_id: &ActionId,
        resource_id: &ResourceId,
        workload_id: &WorkloadId,
        at: TimestampMicros,
    ) -> bool {
        self.grants
            .last()
            .is_some_and(|grant| grant.permits(action_id, resource_id, workload_id, at))
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

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PolicyRevisionNumber(u64);

impl PolicyRevisionNumber {
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    pub fn get(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyRevision {
    pub digest: PolicyDigest,
    pub id: PolicyId,
    pub revision: PolicyRevisionNumber,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PolicyEvidence {
    pub determining_policies: Vec<String>,
    pub revision: PolicyRevision,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PolicyEvaluation {
    Deny(PolicyEvidence),
    EvaluationError {
        message: String,
        revision: Option<PolicyRevision>,
    },
    Permit(PolicyEvidence),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionInput {
    pub id: InputId,
    pub value: ExactValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StateDependency {
    pub claim_id: ClaimId,
    pub commit_sequence: CommitSequence,
    pub entity_id: EntityId,
    pub relation_id: RelationId,
    pub source_digest: EvidenceDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StateBasis {
    pub dependencies: Vec<StateDependency>,
    pub digest: StateBasisDigest,
    pub observed_commit_sequence: CommitSequence,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalAuthority {
    AwaitingApproval(PolicyEvidence),
    Ready(PolicyEvidence),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionProposal {
    pub action_id: ActionId,
    pub authority: ProposalAuthority,
    pub definition: DefinitionReference,
    pub expires_at: TimestampMicros,
    pub inputs: Vec<ActionInput>,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub proposal_id: ProposalId,
    pub proposed_at: TimestampMicros,
    pub proposed_by: TrustedExecutionContext,
    pub resource_id: ResourceId,
    pub state_basis: StateBasis,
    pub valid_at: TimestampMicros,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionApproval {
    pub approval_id: ApprovalId,
    pub approved_at: TimestampMicros,
    pub approved_by: TrustedExecutionContext,
    pub expires_at: TimestampMicros,
    pub policy: PolicyEvidence,
    pub proposal_id: ProposalId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommitIdentityKind {
    EffectRequest,
    SemanticRecord,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitReceipt {
    pub action_id: ActionId,
    pub commit_sequence: CommitSequence,
    pub committed_by: TrustedExecutionContext,
    pub definition: DefinitionReference,
    pub effect_request_ids: Vec<EffectRequestId>,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub policy: PolicyEvidence,
    pub proposal_id: ProposalId,
    pub record_ids: Vec<ClaimId>,
}

#[cfg(test)]
mod tests {
    use std::collections::{BTreeMap, BTreeSet};

    use super::{
        ActionId, BinaryOperator, DefinitionDigest, DelegationChain, DelegationError,
        DelegationGrant, DelegationId, ExactDecimal, ExactInteger, ExactValue, Expression, InputId,
        RelationId, ResourceId, SemanticValue, TimestampMicros, ValidTime, WorkloadId,
        evaluate_expression,
    };

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
    fn expression_evaluation_uses_typed_input_and_relation_bindings() {
        let input_id = InputId::parse("quantity").expect("input");
        let relation_id = RelationId::parse("inventory.available").expect("relation");
        let expression = Expression::Binary {
            left: Box::new(Expression::Relation(relation_id.clone())),
            operator: BinaryOperator::GreaterThan,
            right: Box::new(Expression::Input(input_id.clone())),
        };
        let inputs = BTreeMap::from([(
            input_id,
            ExactValue::Integer(ExactInteger::parse("2").expect("integer")),
        )]);
        let relations = BTreeMap::from([(
            relation_id,
            vec![SemanticValue {
                dependencies: Vec::new(),
                value: ExactValue::Integer(ExactInteger::parse("6").expect("integer")),
            }],
        )]);

        let values = evaluate_expression(&expression, &inputs, &relations).expect("evaluation");

        assert_eq!(
            values,
            vec![SemanticValue {
                dependencies: Vec::new(),
                value: ExactValue::Bool(true),
            }]
        );
    }

    #[test]
    fn digest_requires_lowercase_sha256_hex() {
        assert!(DefinitionDigest::parse("a".repeat(64)).is_ok());
        assert!(DefinitionDigest::parse("A".repeat(64)).is_err());
        assert!(DefinitionDigest::parse("a".repeat(63)).is_err());
    }

    #[test]
    fn child_delegation_cannot_expand_any_scope_dimension() {
        let parent = delegation(
            "delegation.parent",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            10,
            100,
        );
        let child = delegation(
            "delegation.child",
            ["action.other"],
            ["resource.item"],
            ["workload.agent"],
            20,
            90,
        );
        assert!(matches!(
            DelegationChain::new(vec![parent, child]),
            Err(DelegationError::ExpandedAction(_))
        ));

        let parent = delegation(
            "delegation.parent",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            10,
            100,
        );
        let child = delegation(
            "delegation.child",
            ["action.purchase"],
            ["resource.other"],
            ["workload.agent"],
            20,
            90,
        );
        assert!(matches!(
            DelegationChain::new(vec![parent, child]),
            Err(DelegationError::ExpandedResource(_))
        ));

        let parent = delegation(
            "delegation.parent",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            10,
            100,
        );
        let child = delegation(
            "delegation.child",
            ["action.purchase"],
            ["resource.item"],
            ["workload.human"],
            20,
            90,
        );
        assert!(matches!(
            DelegationChain::new(vec![parent, child]),
            Err(DelegationError::ExpandedWorkload(_))
        ));

        let parent = delegation(
            "delegation.parent",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            10,
            100,
        );
        let child = delegation(
            "delegation.child",
            ["action.purchase"],
            ["resource.item"],
            ["workload.agent"],
            5,
            90,
        );
        assert!(matches!(
            DelegationChain::new(vec![parent, child]),
            Err(DelegationError::ExpandedTime(_))
        ));
    }

    #[test]
    fn narrowed_delegation_authorizes_only_the_leaf_scope() {
        let chain = DelegationChain::new(vec![
            delegation(
                "delegation.parent",
                ["action.purchase", "action.return"],
                ["resource.item", "resource.other"],
                ["workload.agent", "workload.human"],
                10,
                100,
            ),
            delegation(
                "delegation.child",
                ["action.purchase"],
                ["resource.item"],
                ["workload.agent"],
                20,
                90,
            ),
        ])
        .expect("narrowed chain");
        assert!(chain.permits(
            &ActionId::parse("action.purchase").expect("action"),
            &ResourceId::parse("resource.item").expect("resource"),
            &WorkloadId::parse("workload.agent").expect("workload"),
            TimestampMicros::new(50),
        ));
        assert!(!chain.permits(
            &ActionId::parse("action.return").expect("action"),
            &ResourceId::parse("resource.item").expect("resource"),
            &WorkloadId::parse("workload.agent").expect("workload"),
            TimestampMicros::new(50),
        ));
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

    fn delegation<const A: usize, const R: usize, const W: usize>(
        id: &str,
        actions: [&str; A],
        resources: [&str; R],
        workloads: [&str; W],
        not_before: i64,
        expires_at: i64,
    ) -> DelegationGrant {
        DelegationGrant::new(
            DelegationId::parse(id).expect("delegation"),
            actions
                .into_iter()
                .map(|value| ActionId::parse(value).expect("action"))
                .collect::<BTreeSet<_>>(),
            resources
                .into_iter()
                .map(|value| ResourceId::parse(value).expect("resource"))
                .collect::<BTreeSet<_>>(),
            workloads
                .into_iter()
                .map(|value| WorkloadId::parse(value).expect("workload"))
                .collect::<BTreeSet<_>>(),
            TimestampMicros::new(not_before),
            TimestampMicros::new(expires_at),
        )
        .expect("delegation grant")
    }
}
