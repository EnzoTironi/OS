use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionProposal, CanonicalDefinition, CanonicalJson, CommitIdentityKind,
    CommitReceipt, DefinitionActivation, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevision, DefinitionRevisionNumber, EffectRequestId, EffectSnapshot, EvidenceClaim,
    EvidenceDraft, EvolutionClassification, ExecutionContext, ExplanationTarget, Expression,
    InputDefinition, OperationId, PolicyEvidence, ProposalId, RelationTarget, TenantId,
    TimestampMicros,
};

mod action;
mod admission;
mod effect;
mod evolution;
mod history;

pub use action::{
    ActionCommitEffect, ActionCommitTransaction, ActionDiscovery, ActionEngine, ActionError,
    ActionStateRead, ActionStateSnapshot, ApproveOutcome, CommitOutcome, CommitPlan,
    CommitPreparation, CommitStoreOutcome, PolicyEvaluator, PolicyOperation, PolicyRequest,
    ProposeCommand, ProposeOutcome, QueryExecutor, QueryPortError, SemanticClaim,
    calculate_state_basis_digest, evaluate_action_state_basis, evaluate_semantic_claims,
    read_action_state_basis, state_basis_digest_matches,
};
pub use effect::{
    EffectAttemptClaim, EffectAttemptClaimCommand, EffectAttemptCommand, EffectEngine, EffectError,
    EffectReconcileCommand, EffectUpdateTransaction, effect_state_after_attempt,
    effect_state_after_evidence,
};
pub use history::{
    ActionHistorySnapshot, ClaimHistorySnapshot, EffectHistorySnapshot, HistoryEngine,
    HistoryError, HistorySnapshot,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionFamily {
    Action,
    ActionEffect,
    ActionInput,
    Computation,
    ComputationInput,
    Relation,
    Type,
    TypeAttribute,
}

impl Display for DefinitionFamily {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::Action => "Action",
            Self::ActionEffect => "Action effect",
            Self::ActionInput => "Action input",
            Self::Computation => "Computation",
            Self::ComputationInput => "Computation input",
            Self::Relation => "Relation",
            Self::Type => "Type",
            Self::TypeAttribute => "Type attribute",
        };
        name.fmt(formatter)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReferenceKind {
    Input,
    Relation,
    Type,
}

impl Display for ReferenceKind {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::Input => "input",
            Self::Relation => "relation",
            Self::Type => "type",
        };
        name.fmt(formatter)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidationError {
    DuplicateId {
        family: DefinitionFamily,
        id: String,
    },
    EmptyFamily(DefinitionFamily),
    UnknownReference {
        id: String,
        kind: ReferenceKind,
        owner: String,
    },
}

impl Display for ValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId { family, id } => {
                write!(formatter, "duplicate {family} id: {id}")
            }
            Self::EmptyFamily(family) => {
                write!(formatter, "definition bundle has no {family} definitions")
            }
            Self::UnknownReference { id, kind, owner } => {
                write!(formatter, "{owner} references unknown {kind}: {id}")
            }
        }
    }
}

impl Error for ValidationError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StoreError {
    Conflict(String),
    Corrupt(String),
    IdentityCollision(CommitIdentityKind),
    InactiveDefinition,
    NotFound,
    OperationMismatch,
    StalePrecondition,
    Unavailable(String),
}

impl Display for StoreError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(message) => write!(formatter, "authority conflict: {message}"),
            Self::Corrupt(message) => write!(formatter, "authority data is corrupt: {message}"),
            Self::IdentityCollision(CommitIdentityKind::EffectRequest) => {
                formatter.write_str("Action EffectRequest identity already exists")
            }
            Self::IdentityCollision(CommitIdentityKind::SemanticRecord) => {
                formatter.write_str("Action semantic record identity already exists")
            }
            Self::InactiveDefinition => {
                formatter.write_str("new work requires the active definition revision")
            }
            Self::NotFound => formatter.write_str("definition revision was not found"),
            Self::OperationMismatch => {
                formatter.write_str("operation identity does not match the proposal")
            }
            Self::StalePrecondition => {
                formatter.write_str("active definition revision does not match the precondition")
            }
            Self::Unavailable(message) => {
                write!(formatter, "authority store unavailable: {message}")
            }
        }
    }
}

impl Error for StoreError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EvidenceValidationError {
    DefinitionReferenceMismatch,
    EmptySourceReference,
    MalformedDefinition(String),
    ReservedClaimId(String),
    UnknownRelation(String),
    ValueTypeMismatch(String),
}

impl Display for EvidenceValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DefinitionReferenceMismatch => {
                formatter.write_str("evidence definition reference does not match stored revision")
            }
            Self::EmptySourceReference => formatter.write_str("evidence source reference is empty"),
            Self::MalformedDefinition(message) => {
                write!(formatter, "stored definition is malformed: {message}")
            }
            Self::ReservedClaimId(claim_id) => {
                write!(
                    formatter,
                    "evidence claim id uses a reserved namespace: {claim_id}"
                )
            }
            Self::UnknownRelation(relation_id) => {
                write!(formatter, "definition has no relation: {relation_id}")
            }
            Self::ValueTypeMismatch(relation_id) => {
                write!(
                    formatter,
                    "evidence value does not match relation target: {relation_id}"
                )
            }
        }
    }
}

impl Error for EvidenceValidationError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecordEvidenceError {
    EventEncoding(String),
    InvalidEvidence(EvidenceValidationError),
    Store(StoreError),
}

impl Display for RecordEvidenceError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EventEncoding(message) => {
                write!(formatter, "failed to encode evidence event: {message}")
            }
            Self::InvalidEvidence(error) => error.fmt(formatter),
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for RecordEvidenceError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidEvidence(error) => Some(error),
            Self::Store(error) => Some(error),
            Self::EventEncoding(_) => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PublishError {
    DigestMismatch,
    EventEncoding(String),
    InvalidCanonicalDefinition(String),
    InvalidDefinition(ValidationError),
    MalformedDefinition(String),
    NonCanonicalDefinition,
    Store(StoreError),
}

impl Display for PublishError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => formatter.write_str("canonical definition digest mismatch"),
            Self::EventEncoding(message) => {
                write!(formatter, "failed to encode publication event: {message}")
            }
            Self::InvalidCanonicalDefinition(message) => {
                write!(formatter, "invalid canonical definition: {message}")
            }
            Self::InvalidDefinition(error) => error.fmt(formatter),
            Self::MalformedDefinition(message) => {
                write!(formatter, "malformed canonical definition JSON: {message}")
            }
            Self::NonCanonicalDefinition => {
                formatter.write_str("definition JSON is not normalized RFC 8785 canonical JSON")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for PublishError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidDefinition(error) => Some(error),
            Self::Store(error) => Some(error),
            Self::DigestMismatch
            | Self::EventEncoding(_)
            | Self::InvalidCanonicalDefinition(_)
            | Self::MalformedDefinition(_)
            | Self::NonCanonicalDefinition => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GetRevisionError {
    DigestMismatch,
    Store(StoreError),
}

impl Display for GetRevisionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => {
                formatter.write_str("stored canonical definition digest mismatch")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for GetRevisionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::DigestMismatch => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PlanEvolutionError {
    InvalidRevision(String),
    Store(StoreError),
}

impl Display for PlanEvolutionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRevision(message) => {
                write!(formatter, "invalid evolution revision: {message}")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for PlanEvolutionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::InvalidRevision(_) => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActivateRevisionError {
    Configuration(String),
    DelegationDenied,
    EventEncoding(String),
    Incompatible(EvolutionClassification),
    InvalidRevision(String),
    PolicyDenied(PolicyEvidence),
    PolicyEvaluation {
        message: String,
        policy: Option<PolicyEvidence>,
    },
    StalePrecondition,
    Store(StoreError),
}

impl Display for ActivateRevisionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Configuration(message) => {
                write!(
                    formatter,
                    "definition activation is misconfigured: {message}"
                )
            }
            Self::DelegationDenied => {
                formatter.write_str("delegation does not permit definition activation")
            }
            Self::EventEncoding(message) => {
                write!(
                    formatter,
                    "failed to encode definition activation event: {message}"
                )
            }
            Self::Incompatible(classification) => {
                write!(
                    formatter,
                    "definition activation requires a compatible plan, got {classification:?}"
                )
            }
            Self::InvalidRevision(message) => {
                write!(formatter, "invalid activation revision: {message}")
            }
            Self::PolicyDenied(_) => formatter.write_str("definition activation was denied"),
            Self::PolicyEvaluation { message, .. } => {
                write!(formatter, "definition activation policy failed: {message}")
            }
            Self::StalePrecondition => {
                formatter.write_str("active definition revision does not match the precondition")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for ActivateRevisionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::Configuration(_)
            | Self::DelegationDenied
            | Self::EventEncoding(_)
            | Self::Incompatible(_)
            | Self::InvalidRevision(_)
            | Self::PolicyDenied(_)
            | Self::PolicyEvaluation { .. }
            | Self::StalePrecondition => None,
        }
    }
}

pub fn decode_canonical_definition(
    canonical_json: &CanonicalJson,
) -> Result<CanonicalDefinition, PublishError> {
    admission::decode(canonical_json)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectionEvent {
    event_type: &'static str,
    event_version: u16,
    payload: String,
}

impl ProjectionEvent {
    pub fn event_type(&self) -> &'static str {
        self.event_type
    }

    pub fn event_version(&self) -> u16 {
        self.event_version
    }

    pub fn payload(&self) -> &str {
        &self.payload
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedDefinitionPublication {
    canonical_json: CanonicalJson,
    definition_id: DefinitionId,
    digest: DefinitionDigest,
    revision: DefinitionRevisionNumber,
    projection_event: ProjectionEvent,
}

impl AdmittedDefinitionPublication {
    fn new(
        canonical_json: CanonicalJson,
        definition_id: DefinitionId,
        digest: DefinitionDigest,
        revision: DefinitionRevisionNumber,
        projection_event: ProjectionEvent,
    ) -> Self {
        Self {
            canonical_json,
            definition_id,
            digest,
            revision,
            projection_event,
        }
    }

    pub fn canonical_json(&self) -> &CanonicalJson {
        &self.canonical_json
    }

    pub fn definition_id(&self) -> &DefinitionId {
        &self.definition_id
    }

    pub fn digest(&self) -> &DefinitionDigest {
        &self.digest
    }

    pub fn revision(&self) -> DefinitionRevisionNumber {
        self.revision
    }

    pub fn projection_event(&self) -> &ProjectionEvent {
        &self.projection_event
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedDefinitionActivation {
    activated_at: TimestampMicros,
    classification: Option<EvolutionClassification>,
    context: ExecutionContext,
    policy: PolicyEvidence,
    previous: Option<DefinitionReference>,
    projection_event: ProjectionEvent,
    target: DefinitionRevision,
}

impl AdmittedDefinitionActivation {
    fn new(
        context: ExecutionContext,
        previous: Option<DefinitionReference>,
        target: DefinitionRevision,
        classification: Option<EvolutionClassification>,
        policy: PolicyEvidence,
        activated_at: TimestampMicros,
    ) -> Result<Self, ActivateRevisionError> {
        let payload = serde_jcs::to_string(&DefinitionActivatedV1 {
            activated_by: context.actor_id().as_str(),
            classification: classification.map(EvolutionClassification::as_str),
            definition_id: target.definition_id.as_str(),
            digest: target.digest.as_str(),
            policy_digest: policy.revision.digest.as_str(),
            policy_id: policy.revision.id.as_str(),
            policy_revision: policy.revision.revision.get(),
            previous_digest: previous.as_ref().map(|reference| reference.digest.as_str()),
            previous_revision: previous.as_ref().map(|reference| reference.revision.get()),
            principal_id: context.principal_id().as_str(),
            revision: target.revision.get(),
            workload_id: context.workload_id().as_str(),
        })
        .map_err(|error| ActivateRevisionError::EventEncoding(error.to_string()))?;
        Ok(Self {
            activated_at,
            classification,
            context,
            policy,
            previous,
            projection_event: ProjectionEvent {
                event_type: "DefinitionActivated",
                event_version: 1,
                payload,
            },
            target,
        })
    }

    pub fn activated_at(&self) -> TimestampMicros {
        self.activated_at
    }

    pub fn context(&self) -> &ExecutionContext {
        &self.context
    }

    pub fn classification(&self) -> Option<EvolutionClassification> {
        self.classification
    }

    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }

    pub fn previous(&self) -> Option<&DefinitionReference> {
        self.previous.as_ref()
    }

    pub fn projection_event(&self) -> &ProjectionEvent {
        &self.projection_event
    }

    pub fn target(&self) -> &DefinitionRevision {
        &self.target
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionActivatedV1<'a> {
    activated_by: &'a str,
    classification: Option<&'a str>,
    definition_id: &'a str,
    digest: &'a str,
    policy_digest: &'a str,
    policy_id: &'a str,
    policy_revision: u64,
    previous_digest: Option<&'a str>,
    previous_revision: Option<u64>,
    principal_id: &'a str,
    revision: u64,
    workload_id: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdmittedEvidence {
    draft: EvidenceDraft,
    projection_event: ProjectionEvent,
}

impl AdmittedEvidence {
    fn new(draft: EvidenceDraft, projection_event: ProjectionEvent) -> Self {
        Self {
            draft,
            projection_event,
        }
    }

    pub fn draft(&self) -> &EvidenceDraft {
        &self.draft
    }

    pub fn projection_event(&self) -> &ProjectionEvent {
        &self.projection_event
    }
}

#[allow(async_fn_in_trait)]
pub trait AuthorityStore: Send + Sync {
    type ActionCommit: ActionCommitTransaction;
    type EffectUpdate: EffectUpdateTransaction;

    async fn activate_revision(
        &self,
        activation: &AdmittedDefinitionActivation,
    ) -> Result<DefinitionActivation, StoreError>;

    async fn begin_action_commit(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<CommitPreparation<Self::ActionCommit>, StoreError>;

    async fn get_approval(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<Option<ActionApproval>, StoreError>;

    async fn get_active_revision(
        &self,
        tenant_id: &TenantId,
        definition_id: &DefinitionId,
    ) -> Result<Option<DefinitionRevision>, StoreError>;

    async fn begin_effect_update(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<Self::EffectUpdate, StoreError>;

    async fn get_effect(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<EffectSnapshot, StoreError>;

    async fn get_operation(
        &self,
        context: &ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<CommitReceipt, StoreError>;

    async fn load_history(
        &self,
        context: &ExecutionContext,
        target: &ExplanationTarget,
    ) -> Result<HistorySnapshot, StoreError>;

    async fn get_proposal(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<ActionProposal, StoreError>;

    async fn publish(
        &self,
        context: &ExecutionContext,
        publication: &AdmittedDefinitionPublication,
    ) -> Result<DefinitionRevision, StoreError>;

    async fn get_revision(
        &self,
        tenant_id: &TenantId,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, StoreError>;

    async fn record_evidence(
        &self,
        context: &ExecutionContext,
        evidence: &AdmittedEvidence,
    ) -> Result<EvidenceClaim, StoreError>;

    async fn save_approval(
        &self,
        context: &ExecutionContext,
        approval: &ActionApproval,
    ) -> Result<ActionApproval, StoreError>;

    async fn save_proposal(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<ActionProposal, StoreError>;
}

pub struct DefinitionEngine<S, P> {
    policy: P,
    store: S,
}

pub struct WorldEngine<S> {
    store: S,
}

impl<S> WorldEngine<S>
where
    S: AuthorityStore,
{
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub async fn record_evidence(
        &self,
        context: &ExecutionContext,
        draft: EvidenceDraft,
    ) -> Result<EvidenceClaim, RecordEvidenceError> {
        let revision = self
            .store
            .get_revision(
                context.tenant_id(),
                &draft.definition.definition_id,
                &draft.definition.digest,
            )
            .await
            .map_err(RecordEvidenceError::Store)?;
        let admitted = admission::admit_evidence(&revision, draft)?;
        self.store
            .record_evidence(context, &admitted)
            .await
            .map_err(RecordEvidenceError::Store)
    }
}

impl<S, P> DefinitionEngine<S, P>
where
    S: AuthorityStore,
    P: PolicyEvaluator,
{
    pub fn new(store: S, policy: P) -> Self {
        Self { policy, store }
    }

    pub async fn publish(
        &self,
        context: &ExecutionContext,
        canonical_bytes: &[u8],
        claimed_digest: DefinitionDigest,
    ) -> Result<DefinitionRevision, PublishError> {
        let publication = admission::admit(canonical_bytes, claimed_digest)?;
        self.store
            .publish(context, &publication)
            .await
            .map_err(PublishError::Store)
    }

    pub async fn get_active_revision(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
    ) -> Result<Option<DefinitionRevision>, GetRevisionError> {
        let revision = self
            .store
            .get_active_revision(context.tenant_id(), definition_id)
            .await
            .map_err(GetRevisionError::Store)?;
        revision
            .map(|revision| {
                verify_digest(&revision.canonical_json, &revision.digest)
                    .then_some(revision)
                    .ok_or(GetRevisionError::DigestMismatch)
            })
            .transpose()
    }

    pub async fn get_revision(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, GetRevisionError> {
        let revision = self
            .store
            .get_revision(context.tenant_id(), definition_id, digest)
            .await
            .map_err(GetRevisionError::Store)?;
        verify_digest(&revision.canonical_json, &revision.digest)
            .then_some(revision)
            .ok_or(GetRevisionError::DigestMismatch)
    }
}

fn verify_digest(canonical_json: &CanonicalJson, expected: &DefinitionDigest) -> bool {
    let actual = Sha256::digest(canonical_json.as_bytes());
    expected
        .as_str()
        .as_bytes()
        .chunks_exact(2)
        .zip(actual)
        .all(|(encoded, actual)| match encoded {
            [high, low] => (hex_value(*high) << 4 | hex_value(*low)) == actual,
            _ => false,
        })
}

fn hex_value(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        _ => 0,
    }
}

fn validate_definition(definition: &CanonicalDefinition) -> Result<(), ValidationError> {
    require_nonempty(DefinitionFamily::Type, definition.types.is_empty())?;
    require_nonempty(DefinitionFamily::Relation, definition.relations.is_empty())?;
    require_nonempty(
        DefinitionFamily::Computation,
        definition.computations.is_empty(),
    )?;
    require_nonempty(DefinitionFamily::Action, definition.actions.is_empty())?;

    ensure_unique(
        DefinitionFamily::Type,
        definition.types.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Relation,
        definition.relations.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Computation,
        definition.computations.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Action,
        definition.actions.iter().map(|item| item.id.as_str()),
    )?;

    let type_ids = definition
        .types
        .iter()
        .map(|item| item.id.as_str())
        .collect::<BTreeSet<_>>();
    let relation_ids = definition
        .relations
        .iter()
        .map(|item| item.id.as_str())
        .collect::<BTreeSet<_>>();

    for item in &definition.types {
        ensure_unique(
            DefinitionFamily::TypeAttribute,
            item.attributes
                .iter()
                .map(|attribute| attribute.id.as_str()),
        )?;
    }

    for item in &definition.relations {
        require_reference(
            &type_ids,
            item.source_type.as_str(),
            ReferenceKind::Type,
            item.id.as_str(),
        )?;
        if let RelationTarget::Type(target) = &item.target {
            require_reference(
                &type_ids,
                target.as_str(),
                ReferenceKind::Type,
                item.id.as_str(),
            )?;
        }
    }

    for item in &definition.computations {
        validate_executable(
            item.id.as_str(),
            DefinitionFamily::ComputationInput,
            &item.inputs,
            &item.expression,
            &relation_ids,
        )?;
    }

    for item in &definition.actions {
        require_nonempty(DefinitionFamily::ActionEffect, item.effects.is_empty())?;
        validate_executable(
            item.id.as_str(),
            DefinitionFamily::ActionInput,
            &item.inputs,
            &item.precondition,
            &relation_ids,
        )?;
        ensure_unique(
            DefinitionFamily::ActionEffect,
            item.effects
                .iter()
                .map(|effect| effect.relation_id.as_str()),
        )?;
        let input_ids = input_ids(&item.inputs);
        for effect in &item.effects {
            require_reference(
                &relation_ids,
                effect.relation_id.as_str(),
                ReferenceKind::Relation,
                item.id.as_str(),
            )?;
            validate_expression(&effect.value, &input_ids, &relation_ids, item.id.as_str())?;
        }
    }

    Ok(())
}

fn require_nonempty(family: DefinitionFamily, is_empty: bool) -> Result<(), ValidationError> {
    if is_empty {
        Err(ValidationError::EmptyFamily(family))
    } else {
        Ok(())
    }
}

fn ensure_unique<'a>(
    family: DefinitionFamily,
    values: impl IntoIterator<Item = &'a str>,
) -> Result<(), ValidationError> {
    let mut seen = BTreeSet::new();
    for value in values {
        if !seen.insert(value) {
            return Err(ValidationError::DuplicateId {
                family,
                id: value.to_owned(),
            });
        }
    }
    Ok(())
}

fn validate_executable(
    owner: &str,
    input_family: DefinitionFamily,
    inputs: &[InputDefinition],
    expression: &Expression,
    relation_ids: &BTreeSet<&str>,
) -> Result<(), ValidationError> {
    ensure_unique(input_family, inputs.iter().map(|input| input.id.as_str()))?;
    validate_expression(expression, &input_ids(inputs), relation_ids, owner)
}

fn input_ids(inputs: &[InputDefinition]) -> BTreeSet<&str> {
    inputs.iter().map(|input| input.id.as_str()).collect()
}

fn validate_expression(
    expression: &Expression,
    input_ids: &BTreeSet<&str>,
    relation_ids: &BTreeSet<&str>,
    owner: &str,
) -> Result<(), ValidationError> {
    match expression {
        Expression::Binary { left, right, .. } => {
            validate_expression(left, input_ids, relation_ids, owner)?;
            validate_expression(right, input_ids, relation_ids, owner)
        }
        Expression::Input(input_id) => {
            require_reference(input_ids, input_id.as_str(), ReferenceKind::Input, owner)
        }
        Expression::Literal(_) => Ok(()),
        Expression::Relation(relation_id) => require_reference(
            relation_ids,
            relation_id.as_str(),
            ReferenceKind::Relation,
            owner,
        ),
    }
}

fn require_reference(
    known: &BTreeSet<&str>,
    id: &str,
    kind: ReferenceKind,
    owner: &str,
) -> Result<(), ValidationError> {
    if known.contains(id) {
        Ok(())
    } else {
        Err(ValidationError::UnknownReference {
            id: id.to_owned(),
            kind,
            owner: owner.to_owned(),
        })
    }
}

#[cfg(test)]
mod tests {
    use zoen_core::{CanonicalJson, DefinitionDigest};

    use super::verify_digest;

    #[test]
    fn verifies_digest_over_canonical_json_bytes() {
        let canonical = CanonicalJson::new("{}").expect("nonempty canonical JSON");
        let digest = DefinitionDigest::parse(
            "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        )
        .expect("valid digest");
        assert!(verify_digest(&canonical, &digest));
    }
}
