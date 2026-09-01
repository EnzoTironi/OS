use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter, Write as _},
};

mod action_preview;
mod conversation;
mod effect;
mod expression;
mod external_signal;
mod history;
mod human;
mod identity;
pub mod jcs;
mod migration;
mod pack;

pub use action_preview::{
    ACTION_PREVIEW_LOCALE, ACTION_PREVIEW_SCHEMA, ActionPreviewDocument, ActionPreviewInput,
    canonical_preview_text,
};
pub use conversation::{
    CONVERSATION_STAGE_CAP, ConversationStage, ConversationStageError, ConversationStageId,
};
pub use effect::{
    DefinitelyNotSentReason, EffectAttempt, EffectAttemptResult, EffectEvidence,
    EffectEvidenceOutcome, EffectKnowledgeState, EffectReconciliation, EffectRequest,
    EffectRequestIdentity, EffectSnapshot, UnknownEffectReason,
};
pub use expression::{
    BinaryOperator, ExactDecimal, ExactDecimalError, ExactInteger, ExactIntegerError, ExactValue,
    Expression, ExpressionEvaluationError, ValueType, evaluate_expression, expression_relations,
};
pub use external_signal::{
    DigestRef, EvidenceCandidateOffer, ExternalSignal, ExternalSignalDraft, ExternalSignalError,
    SignalSourceIdentity, SignalTrustDisposition, offer_external_signal_as_evidence_candidate,
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
    AccountMergePlan, AccountStatus, AudienceClass, BindingStatus, ChannelProvider,
    ClassificationToken, Clearance, DelegationTemplateId, DurableEventId, ExternalBinding,
    ExternalBindingId, ExternalSignalId, ExternalSubject, IdentityError, IngressAllowance, Invite,
    InviteId, InviteToken, MachineToken, Membership, MembershipId, MembershipKind,
    MembershipStatus, OpaqueSessionToken, ProjectedCapabilityKind, RateBudgetPolicy,
    RevocationReason, ServerAllowId, SessionCredential, SessionId, SourceClass, UnbindReason,
    VerifiedSessionEvidence, VerifiedWorkloadEvidence, WORLD_FLOOR, WORLD_TOP, WorkloadCredential,
    WorkloadCredentialId, WorkloadCredentialLookupKey, WorkloadCredentialStatus,
    WorkloadEvidenceKind, WorkloadExchangeToken, WorkloadRevocationReason, WorkloadSecretId,
    ZoenAccount, ZoenAccountId, encode_channel_credential, join_labels, mac_write_permitted,
    resource_label, trusted_context_from_membership, trusted_context_from_workload_credential,
};
pub use jcs::{JcsError, canonicalize_json, canonicalize_json_bytes, is_canonical_digest_hex};
pub use migration::{
    MigrationArtifactDependency, MigrationDependency, MigrationElement, MigrationLineage,
    MigrationObligation, MigrationObligationSource, MigrationOrigin, MigrationPlan,
    MigrationPostcondition, MigrationProgress, MigrationRecipe, MigrationRecord, MigrationRule,
    MigrationRuleKind, MigrationStatus,
};
pub use pack::{
    ActivatedDefinitionRef, AttributionEvent, AttributionEventId, AttributionEventKind,
    CapabilityGrant, CatalogEntry, CreatorAttributionDigestRow, CreatorAttributionSummary,
    DegradationDecl, DeprecationRecord, EvolutionAckDigest, FirstSuccessContract,
    FirstSuccessContractId, FirstSuccessEval, FirstSuccessOutcome, GrantId, GrantStatus, InstallId,
    InstallPhase, InstallPhaseKind, InstallReceipt, IntegrationKind, IntegrationRequirement,
    Necessity, ObjectSource, ObjectStoreConflictReason, ObjectStorePutResult, OntologyDependency,
    OntologyImpactLine, OntologyImpactStatus, OpenResult, OpenTrust, PACK_FORMAT_V1, PackDigest,
    PackError, PackId, PackManifest, PackObject, PackObjectOntology, PackPresentation,
    PackUpdatePermissionDiff, PackVersion, PackVisibility, PermissionImpactPreview, PreviewDigest,
    PublicKeyId, PublisherId, PublisherIdentity, PublisherKey, PublisherKeyStatus, ReferralId,
    RequirementId, RequirementImpactLine, Sensitivity, ShareInstallPolicy, ShareRefRecord,
    ShareResolve, ShareToken, SignatureEvidence, required_grants_accepted,
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
            /// # Errors
            ///
            /// Returns [`IdentifierError`] when `value` is not a valid identifier.
            pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
                parse_identifier(value.into(), stringify!($name)).map(Self)
            }

            #[must_use]
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
semantic_id!(ScenarioId);
semantic_id!(SourceId);
semantic_id!(TenantId);
semantic_id!(TypeId);
semantic_id!(UnitId);
semantic_id!(WorkloadId);

pub const WORLD_READ_ACTION: &str = "zoen.world.read";
pub const WORLD_INVITE_ACTION: &str = "zoen.world.invite";
pub const WORLD_SHARE_ACTION: &str = "zoen.world.share";
pub const WORLD_RESERVE_ACTION: &str = "zoen.world.reserve";
pub const WORLD_WHO_CAN_ACTION: &str = "zoen.world.whoCan";
pub const CLASSIFIED_AS_RELATION: &str = "zoen.classifiedAs";
pub const SHARED_WITH_RELATION: &str = "zoen.sharedWith";

/// # Panics
///
/// Panics when [`WORLD_READ_ACTION`] is not a valid identifier.
#[must_use]
pub fn world_read_action() -> ActionId {
    ActionId::parse(WORLD_READ_ACTION).expect("dest kernel Action id")
}

/// # Panics
///
/// Panics when [`WORLD_INVITE_ACTION`] is not a valid identifier.
#[must_use]
pub fn world_invite_action() -> ActionId {
    ActionId::parse(WORLD_INVITE_ACTION).expect("dest kernel Action id")
}

/// # Panics
///
/// Panics when [`WORLD_SHARE_ACTION`] is not a valid identifier.
#[must_use]
pub fn world_share_action() -> ActionId {
    ActionId::parse(WORLD_SHARE_ACTION).expect("dest kernel Action id")
}

/// # Panics
///
/// Panics when [`WORLD_RESERVE_ACTION`] is not a valid identifier.
#[must_use]
pub fn world_reserve_action() -> ActionId {
    ActionId::parse(WORLD_RESERVE_ACTION).expect("dest kernel Action id")
}

/// # Panics
///
/// Panics when [`WORLD_WHO_CAN_ACTION`] is not a valid identifier.
#[must_use]
pub fn world_who_can_action() -> ActionId {
    ActionId::parse(WORLD_WHO_CAN_ACTION).expect("dest kernel Action id")
}

/// # Panics
///
/// Panics when [`CLASSIFIED_AS_RELATION`] is not a valid identifier.
#[must_use]
pub fn classified_as_relation() -> RelationId {
    RelationId::parse(CLASSIFIED_AS_RELATION).expect("dest classification Relation id")
}

/// # Panics
///
/// Panics when [`SHARED_WITH_RELATION`] is not a valid identifier.
#[must_use]
pub fn shared_with_relation() -> RelationId {
    RelationId::parse(SHARED_WITH_RELATION).expect("dest share Relation id")
}

#[must_use]
pub fn allows_empty_action_effects(action_id: &ActionId) -> bool {
    matches!(
        action_id.as_str(),
        WORLD_INVITE_ACTION | WORLD_WHO_CAN_ACTION
    )
}

impl ResourceId {
    /// A grant on `self` covers `self` and dotted children (`self.leaf`).
    /// `personal.note` covers `personal.note.deadbeef`. It does not cover a
    /// neighbor (`personal.note2`) or a sibling lake (`personal.reminder.1`).
    #[must_use]
    pub fn covers(&self, other: &Self) -> bool {
        if self == other {
            return true;
        }
        other
            .as_str()
            .strip_prefix(self.as_str())
            .is_some_and(|rest| rest.as_bytes().first() == Some(&b'.') && rest.len() > 1)
    }
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ComponentInterface(String);

impl ComponentInterface {
    /// # Errors
    ///
    /// Returns [`IdentifierError`] when `value` is empty, longer than 200 bytes, or
    /// contains a character outside the component-interface alphabet.
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

    #[must_use]
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
    /// # Errors
    ///
    /// Returns [`DigestError`] when `value` is not 64 lowercase hex characters.
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

    #[must_use]
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
    /// # Errors
    ///
    /// Returns [`DigestError`] when `value` is not 64 lowercase hex characters.
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

    #[must_use]
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
            /// # Errors
            ///
            /// Returns [`DigestError`] when `value` is not 64 lowercase hex characters.
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

            #[must_use]
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
sha256_digest!(ActionPreviewHash);

#[must_use]
pub fn encode_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

impl CapabilityManifestDigest {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl ComponentDigest {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl ExecutionRequestDigest {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl ExecutionResultDigest {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl PayloadDigest {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl ActionPreviewHash {
    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }

    /// Compare two parsed digests without an early exit on the first mismatch.
    #[must_use]
    pub fn constant_time_eq(&self, other: &Self) -> bool {
        let left = self.0.as_bytes();
        let right = other.0.as_bytes();
        if left.len() != right.len() {
            return false;
        }
        let mut diff = 0u8;
        for (a, b) in left.iter().zip(right.iter()) {
            diff |= a ^ b;
        }
        diff == 0
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct DefinitionRevisionNumber(u64);

impl DefinitionRevisionNumber {
    #[must_use]
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    #[must_use]
    pub fn get(self) -> u64 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct CommitSequence(u64);

impl CommitSequence {
    #[must_use]
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    #[must_use]
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

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[must_use]
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
    #[must_use]
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
    #[must_use]
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
    clearance: crate::Clearance,
    channel_subject: Option<Box<crate::ExternalSubject>>,
}

impl TrustedExecutionContext {
    #[must_use]
    pub fn new(
        tenant_id: TenantId,
        actor_id: ActorId,
        principal_id: PrincipalId,
        workload_id: WorkloadId,
        delegation: DelegationChain,
        clearance: crate::Clearance,
    ) -> Self {
        Self {
            tenant_id,
            actor_id,
            delegation,
            principal_id,
            workload_id,
            clearance,
            channel_subject: None,
        }
    }

    /// Attach the channel subject the caller presented, so proposals and
    /// commits carry the provider-native sender (e.g. the `WhatsApp` waId)
    /// alongside the converged membership principal.
    #[must_use]
    pub fn with_channel_subject(mut self, subject: crate::ExternalSubject) -> Self {
        self.channel_subject = Some(Box::new(subject));
        self
    }

    /// The provider-native channel subject the caller authenticated with, when
    /// the session credential was a channel credential.
    #[must_use]
    pub fn channel_subject(&self) -> Option<&crate::ExternalSubject> {
        self.channel_subject.as_deref()
    }

    #[must_use]
    pub fn actor_id(&self) -> &ActorId {
        &self.actor_id
    }

    #[must_use]
    pub fn clearance(&self) -> &crate::Clearance {
        &self.clearance
    }

    #[must_use]
    pub fn delegation(&self) -> &DelegationChain {
        &self.delegation
    }

    #[must_use]
    pub fn principal_id(&self) -> &PrincipalId {
        &self.principal_id
    }

    #[must_use]
    pub fn tenant_id(&self) -> &TenantId {
        &self.tenant_id
    }

    #[must_use]
    pub fn workload_id(&self) -> &WorkloadId {
        &self.workload_id
    }
}

pub type ExecutionContext = TrustedExecutionContext;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct TimestampMicros(i64);

impl TimestampMicros {
    #[must_use]
    pub fn new(value: i64) -> Self {
        Self(value)
    }

    #[must_use]
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
    /// # Errors
    ///
    /// Returns [`DelegationError::EmptyScope`] when any scope set is empty, or
    /// [`DelegationError::InvalidTime`] when `not_before` is not before `expires_at`.
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

    #[must_use]
    pub fn expires_at(&self) -> TimestampMicros {
        self.expires_at
    }

    #[must_use]
    pub fn actions(&self) -> &BTreeSet<ActionId> {
        &self.actions
    }

    #[must_use]
    pub fn id(&self) -> &DelegationId {
        &self.id
    }

    #[must_use]
    pub fn not_before(&self) -> TimestampMicros {
        self.not_before
    }

    #[must_use]
    pub fn resources(&self) -> &BTreeSet<ResourceId> {
        &self.resources
    }

    #[must_use]
    pub fn workloads(&self) -> &BTreeSet<WorkloadId> {
        &self.workloads
    }

    #[must_use]
    pub fn permits(
        &self,
        action_id: &ActionId,
        resource_id: &ResourceId,
        workload_id: &WorkloadId,
        at: TimestampMicros,
    ) -> bool {
        self.actions.contains(action_id)
            && self
                .resources
                .iter()
                .any(|granted| granted.covers(resource_id))
            && self.workloads.contains(workload_id)
            && self.not_before <= at
            && at < self.expires_at
    }

    fn is_subset_of(&self, parent: &Self) -> Result<(), DelegationError> {
        if !self.actions.is_subset(&parent.actions) {
            return Err(DelegationError::ExpandedAction(self.id.clone()));
        }
        if !self.resources.iter().all(|resource| {
            parent
                .resources
                .iter()
                .any(|granted| granted.covers(resource))
        }) {
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
    /// # Errors
    ///
    /// Returns [`DelegationError::EmptyChain`] when `grants` is empty, or an expansion
    /// error when a child grant is not a subset of its parent.
    pub fn new(grants: Vec<DelegationGrant>) -> Result<Self, DelegationError> {
        if grants.is_empty() {
            return Err(DelegationError::EmptyChain);
        }
        for pair in grants.windows(2) {
            pair[1].is_subset_of(&pair[0])?;
        }
        Ok(Self { grants })
    }

    #[must_use]
    pub fn grants(&self) -> &[DelegationGrant] {
        &self.grants
    }

    #[must_use]
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
    #[must_use]
    pub fn instant(at: TimestampMicros) -> Self {
        Self::Instant(at)
    }

    /// # Errors
    ///
    /// Returns [`ValidTimeError`] when `end` is not after `start`.
    pub fn interval(start: TimestampMicros, end: TimestampMicros) -> Result<Self, ValidTimeError> {
        if start < end {
            Ok(Self::Interval { start, end })
        } else {
            Err(ValidTimeError { start, end })
        }
    }

    #[must_use]
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
    pub ingested_at: Option<TimestampMicros>,
    pub observed_at: Option<TimestampMicros>,
    pub source_digest: EvidenceDigest,
    pub source_id: SourceId,
    pub source_ref: String,
}

impl EvidenceProvenance {
    #[must_use]
    pub fn same_intent(&self, other: &Self) -> bool {
        self.observed_at == other.observed_at
            && self.source_digest == other.source_digest
            && self.source_id == other.source_id
            && self.source_ref == other.source_ref
    }
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

impl EvidenceDraft {
    #[must_use]
    pub fn same_intent(&self, other: &Self) -> bool {
        self.claim_id == other.claim_id
            && self.definition == other.definition
            && self.entity_id == other.entity_id
            && self.relation_id == other.relation_id
            && self.valid_time == other.valid_time
            && self.value == other.value
            && self.provenance.same_intent(&other.provenance)
    }
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
pub enum SemanticQuery {
    ByEntity {
        consistency: Consistency,
        definition: DefinitionReference,
        entity_id: EntityId,
        scenario_id: Option<ScenarioId>,
        selection: SemanticSelection,
        valid_at: TimestampMicros,
    },
    ByType {
        consistency: Consistency,
        definition: DefinitionReference,
        limit: u32,
        page_token: String,
        scenario_id: Option<ScenarioId>,
        type_id: TypeId,
        valid_at: TimestampMicros,
    },
}

impl SemanticQuery {
    #[must_use]
    pub fn consistency(&self) -> &Consistency {
        match self {
            Self::ByEntity { consistency, .. } | Self::ByType { consistency, .. } => consistency,
        }
    }

    #[must_use]
    pub fn definition(&self) -> &DefinitionReference {
        match self {
            Self::ByEntity { definition, .. } | Self::ByType { definition, .. } => definition,
        }
    }

    #[must_use]
    pub fn valid_at(&self) -> TimestampMicros {
        match self {
            Self::ByEntity { valid_at, .. } | Self::ByType { valid_at, .. } => *valid_at,
        }
    }

    #[must_use]
    pub fn scenario_id(&self) -> Option<&ScenarioId> {
        match self {
            Self::ByEntity { scenario_id, .. } | Self::ByType { scenario_id, .. } => {
                scenario_id.as_ref()
            }
        }
    }
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
    pub next_page_token: String,
    pub valid_at: TimestampMicros,
    pub values: Vec<SemanticValue>,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct PolicyRevisionNumber(u64);

impl PolicyRevisionNumber {
    #[must_use]
    pub fn new(value: u64) -> Option<Self> {
        (value > 0).then_some(Self(value))
    }

    #[must_use]
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
    #[must_use]
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
    #[must_use]
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

    #[must_use]
    pub fn capability_ids(&self) -> &[CapabilityId] {
        &self.capability_ids
    }

    #[must_use]
    pub fn capability_manifest_digest(&self) -> &CapabilityManifestDigest {
        &self.capability_manifest_digest
    }

    #[must_use]
    pub fn component_digest(&self) -> &ComponentDigest {
        &self.component_digest
    }

    #[must_use]
    pub fn execution_id(&self) -> &ExecutionId {
        &self.execution_id
    }

    #[must_use]
    pub fn interface(&self) -> &ComponentInterface {
        &self.interface
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionProposal {
    pub action_id: ActionId,
    pub authority: ProposalAuthority,
    pub canonical_preview_text: String,
    pub definition: DefinitionReference,
    pub execution: Option<ComponentExecutionEvidence>,
    pub expires_at: TimestampMicros,
    pub inputs: Vec<ActionInput>,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub preview_hash: ActionPreviewHash,
    pub proposal_id: ProposalId,
    pub proposed_at: TimestampMicros,
    pub proposed_by: TrustedExecutionContext,
    pub resource_id: ResourceId,
    pub scenario_id: Option<ScenarioId>,
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
