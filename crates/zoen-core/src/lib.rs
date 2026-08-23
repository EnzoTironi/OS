use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

mod effect;
mod expression;
mod history;
mod human;
mod identity;
mod migration;
mod pack;

pub use effect::{
    DefinitelyNotSentReason, EffectAttempt, EffectAttemptResult, EffectEvidence,
    EffectEvidenceOutcome, EffectKnowledgeState, EffectReconciliation, EffectRequest,
    EffectSnapshot, UnknownEffectReason,
};
pub use expression::{
    BinaryOperator, ExactDecimal, ExactDecimalError, ExactInteger, ExactIntegerError, ExactValue,
    Expression, ExpressionEvaluationError, ValueType, evaluate_expression, expression_relations,
};
pub use history::{
    ActionProposalStructure, CausalActionExplanation, CausalActionInput, CausalActionProposal,
    CausalClaim, CausalClaimExplanation, CausalClaimStructure, CausalCommit, CausalEffect,
    CausalEffectRequest, CausalEffectRequestStructure, CausalExplanation, CausalMigration,
    CausalReference, CausalStateBasis, DecisionReference, DefinitionEvidence,
    EffectDispatchEvidence, EffectDispatchOutcome, EvidenceClass, ExplanationGap,
    ExplanationPayload, ExplanationSubject, ExplanationTarget, GapReason, PayloadRedaction,
    PolicyDecisionEvidence, PolicyDecisionStage, RedactionReason, StateBasisStage,
};
pub use human::{
    ArtifactRef, DisclosureClass, EffectPayloadKind, EvidenceFieldSpec,
    HUMAN_TASK_INSTRUCTION_MAX_CHARS, HUMAN_TASK_SCHEMA_VERSION, HumanContactRef,
    HumanExecutorClass, HumanInputValue, HumanTaskBounds, HumanTaskContract, HumanTaskError,
    HumanTaskPacket, OperatorReport, ReconciliationPolicy, map_operator_report,
    project_human_task_packet_from_contract, validate_human_task_contract,
};
pub use identity::{
    AccountMergePlan, AccountStatus, BindingProof, BindingStatus, ChannelProvider,
    DelegationTemplateId, EnterpriseAssertion, ExternalBinding, ExternalBindingId, ExternalSubject,
    IdentityError, Invite, InviteId, InviteToken, Membership, MembershipId, MembershipKind,
    MembershipStatus, RevocationReason, UnbindReason, VerifiedOidcSubject, ZoenAccount,
    ZoenAccountId, trusted_context_from_membership,
};
pub use migration::{
    MigrationArtifactDependency, MigrationDependency, MigrationElement, MigrationLineage,
    MigrationObligation, MigrationObligationSource, MigrationOrigin, MigrationPlan,
    MigrationPostcondition, MigrationProgress, MigrationRecipe, MigrationRecord, MigrationRule,
    MigrationRuleKind, MigrationStatus,
};
pub use pack::{
    ActivatedDefinitionRef, CapabilityGrant, DegradationDecl, EvolutionAckDigest,
    FirstSuccessContract, FirstSuccessContractId, FirstSuccessEval, FirstSuccessOutcome, GrantId,
    GrantStatus, InstallId, InstallPhase, InstallPhaseKind, InstallReceipt, IntegrationKind,
    IntegrationRequirement, Necessity, OntologyDependency, OntologyImpactLine,
    OntologyImpactStatus, PACK_FORMAT_V1, PackDigest, PackError, PackId, PackManifest,
    PackPresentation, PackUpdatePermissionDiff, PackVersion, PermissionImpactPreview,
    PreviewDigest, PublicKeyId, PublisherId, PublisherIdentity, RequirementId,
    RequirementImpactLine, Sensitivity, SignatureEvidence, required_grants_accepted,
};

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
semantic_id!(CapabilityId);
semantic_id!(ClaimId);
semantic_id!(ComputationId);
semantic_id!(DelegationId);
semantic_id!(DefinitionId);
semantic_id!(EntityId);
semantic_id!(EffectAttemptId);
semantic_id!(EffectEvidenceId);
semantic_id!(EffectIdempotencyKey);
semantic_id!(EffectRequestId);
semantic_id!(InputId);
semantic_id!(MigrationRuleId);
semantic_id!(OperationId);
semantic_id!(ExecutionId);
semantic_id!(OutputId);
semantic_id!(PolicyId);
semantic_id!(PrincipalId);
semantic_id!(ProposalId);
semantic_id!(ProviderOperationId);
semantic_id!(RelationId);
semantic_id!(ResourceId);
semantic_id!(SourceId);
semantic_id!(TenantId);
semantic_id!(TypeId);
semantic_id!(UnitId);
semantic_id!(WorkloadId);

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ComponentInterface(String);

impl ComponentInterface {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
        let value = value.into();
        let valid = !value.is_empty()
            && value.len() <= 200
            && value.bytes().all(|byte| {
                byte.is_ascii_alphanumeric()
                    || matches!(byte, b'.' | b':' | b'/' | b'@' | b'_' | b'-')
            });
        if valid {
            Ok(Self(value))
        } else {
            Err(IdentifierError {
                kind: "ComponentInterface",
                value,
            })
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for ComponentInterface {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

pub(crate) fn parse_identifier(
    value: String,
    kind: &'static str,
) -> Result<String, IdentifierError> {
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
sha256_digest!(CapabilityManifestDigest);
sha256_digest!(ComponentDigest);
sha256_digest!(EffectEvidenceDigest);
sha256_digest!(EffectRequestDigest);
sha256_digest!(EffectResponseDigest);
sha256_digest!(PayloadDigest);
sha256_digest!(PolicyDigest);
sha256_digest!(ExecutionRequestDigest);
sha256_digest!(ExecutionResultDigest);
sha256_digest!(StateBasisDigest);

impl CapabilityManifestDigest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

impl ComponentDigest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

impl ExecutionRequestDigest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

impl ExecutionResultDigest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

impl PayloadDigest {
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
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
pub struct ActionOutputDefinition {
    pub id: OutputId,
    pub value_type: ValueType,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionDefinition {
    pub effects: Vec<ActionEffect>,
    pub id: ActionId,
    pub inputs: Vec<InputDefinition>,
    pub outputs: Vec<ActionOutputDefinition>,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvolutionClassification {
    Compatible,
    RequiresMigration,
    Breaking,
    Forbidden,
}

impl EvolutionClassification {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Compatible => "compatible",
            Self::RequiresMigration => "requires_migration",
            Self::Breaking => "breaking",
            Self::Forbidden => "forbidden",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActivationPrecondition {
    NoActiveRevision,
    ActiveDigest(DefinitionDigest),
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum DefinitionElementKind {
    Type,
    Relation,
    Computation,
    Action,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionChangeKind {
    Added,
    Removed,
    Modified,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionChange {
    pub change: DefinitionChangeKind,
    pub classification: EvolutionClassification,
    pub element: DefinitionElementKind,
    pub id: String,
    pub rationale: String,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum DefinitionImpactArea {
    Types,
    Relations,
    Computations,
    Actions,
    DomainPackageDependencies,
    StoredSemanticRecords,
    QueryAndMaterializationArtifacts,
    GeneratedSdkAndSurfaceArtifacts,
    PolicyAndWasmReferences,
    PolicyAndAuthorityContracts,
    WasmComponents,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionImpactApplicability {
    Applicable,
    NotApplicable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionImpact {
    pub affected: Vec<String>,
    pub applicability: DefinitionImpactApplicability,
    pub area: DefinitionImpactArea,
    pub rationale: String,
    pub unaffected: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvolutionPlan {
    pub changes: Vec<DefinitionChange>,
    pub classification: EvolutionClassification,
    pub from: DefinitionReference,
    pub impacts: Vec<DefinitionImpact>,
    pub to: DefinitionReference,
}

impl EvolutionPlan {
    pub fn migration_required(&self) -> bool {
        matches!(
            self.classification,
            EvolutionClassification::RequiresMigration
                | EvolutionClassification::Breaking
                | EvolutionClassification::Forbidden
        )
    }
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
    pub migration: Option<MigrationOrigin>,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionActivationKind {
    Activation,
    Rollback,
}

impl DefinitionActivationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Activation => "activation",
            Self::Rollback => "rollback",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DefinitionActivation {
    pub activated_at: TimestampMicros,
    pub activated_by: ActorId,
    pub active: DefinitionReference,
    pub classification: Option<EvolutionClassification>,
    pub commit_sequence: CommitSequence,
    pub kind: DefinitionActivationKind,
    pub migration_operation_id: Option<OperationId>,
    pub policy: PolicyEvidence,
    pub previous: Option<DefinitionReference>,
    pub principal_id: PrincipalId,
    pub workload_id: WorkloadId,
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
    pub role: LineageRole,
    pub source_digest: EvidenceDigest,
    pub source_id: SourceId,
    pub source_ref: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StateBasis {
    pub dependencies: Vec<StateDependency>,
    pub digest: StateBasisDigest,
    pub observed_commit_sequence: CommitSequence,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreconditionEvaluation {
    Satisfied(StateBasis),
    Unsatisfied(StateBasis),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalAuthority {
    AwaitingApproval(PolicyEvidence),
    Ready(PolicyEvidence),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComponentExecutionEvidence {
    capability_ids: Vec<CapabilityId>,
    capability_manifest_digest: CapabilityManifestDigest,
    component_digest: ComponentDigest,
    execution_id: ExecutionId,
    interface: ComponentInterface,
}

impl ComponentExecutionEvidence {
    pub fn new(
        mut capability_ids: Vec<CapabilityId>,
        capability_manifest_digest: CapabilityManifestDigest,
        component_digest: ComponentDigest,
        execution_id: ExecutionId,
        interface: ComponentInterface,
    ) -> Self {
        capability_ids.sort();
        capability_ids.dedup();
        Self {
            capability_ids,
            capability_manifest_digest,
            component_digest,
            execution_id,
            interface,
        }
    }

    pub fn capability_ids(&self) -> &[CapabilityId] {
        &self.capability_ids
    }

    pub fn capability_manifest_digest(&self) -> &CapabilityManifestDigest {
        &self.capability_manifest_digest
    }

    pub fn component_digest(&self) -> &ComponentDigest {
        &self.component_digest
    }

    pub fn execution_id(&self) -> &ExecutionId {
        &self.execution_id
    }

    pub fn interface(&self) -> &ComponentInterface {
        &self.interface
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionProposal {
    pub action_id: ActionId,
    pub authority: ProposalAuthority,
    pub definition: DefinitionReference,
    pub execution: Option<ComponentExecutionEvidence>,
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
    pub commit_state_basis: Option<StateBasis>,
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
mod tests;
