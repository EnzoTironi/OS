use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    ActionApproval, ActionProposal, CanonicalJson, CommitIdentityKind, CommitReceipt,
    DefinitionActivation, DefinitionDigest, DefinitionId, DefinitionReference, DefinitionRevision,
    DefinitionRevisionNumber, EffectRequestId, EffectSnapshot, EvidenceClaim, EvidenceDraft,
    EvolutionClassification, ExecutionContext, ExplanationTarget, IntentDigest, OperationId,
    PolicyEvidence, ProposalId, TenantId, TimestampMicros,
};

mod action;
mod admission;
mod effect;
mod evolution;
mod history;
mod migration;

pub use action::{
    ActionCommitEffect, ActionCommitTransaction, ActionDiscovery, ActionEngine, ActionError,
    ActionStateRead, ActionStateSnapshot, ApproveOutcome, CommitOutcome, CommitPlan,
    CommitPreparation, CommitStoreOutcome, PolicyEvaluator, PolicyOperation, PolicyRequest,
    ProposeCommand, ProposeOutcome, QueryExecutor, QueryPortError, SemanticClaim,
    calculate_state_basis_digest, evaluate_action_state_basis, evaluate_semantic_claims,
    read_action_state_basis, state_basis_digest_matches,
};
pub use admission::{
    DefinitionFamily, ReferenceKind, ValidationError, decode_canonical_definition,
};
pub use effect::{
    EffectAttemptClaim, EffectAttemptClaimCommand, EffectAttemptCommand, EffectEngine, EffectError,
    EffectReconcileCommand, EffectUpdateTransaction, effect_state_after_attempt,
    effect_state_after_evidence,
};
pub use history::{
    ActionHistorySnapshot, ClaimHistorySnapshot, EffectHistorySnapshot, HistoryEngine,
    HistoryError, HistorySnapshot, MigrationHistorySnapshot,
};
pub use migration::{
    AdmittedMigrationBatch, AdmittedMigrationPlan, AdmittedMigrationRecord,
    MigrationBatchPreflight, MigrationError, decode_migration_plan,
};

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
    InvalidRollbackTarget,
    InvalidRevision(String),
    MigrationIncomplete,
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
            Self::InvalidRollbackTarget => {
                formatter.write_str("rollback target was not a prior active revision")
            }
            Self::MigrationIncomplete => {
                formatter.write_str("required migration is not complete for the revision pair")
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
            | Self::InvalidRollbackTarget
            | Self::InvalidRevision(_)
            | Self::MigrationIncomplete
            | Self::PolicyDenied(_)
            | Self::PolicyEvaluation { .. }
            | Self::StalePrecondition => None,
        }
    }
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
    kind: zoen_core::DefinitionActivationKind,
    migration_operation_id: Option<OperationId>,
    policy: PolicyEvidence,
    previous: Option<DefinitionReference>,
    projection_event: ProjectionEvent,
    target: DefinitionRevision,
}

struct DefinitionActivationAdmission {
    activated_at: TimestampMicros,
    classification: Option<EvolutionClassification>,
    kind: zoen_core::DefinitionActivationKind,
    migration_operation_id: Option<OperationId>,
    policy: PolicyEvidence,
}

impl AdmittedDefinitionActivation {
    fn new(
        context: ExecutionContext,
        previous: Option<DefinitionReference>,
        target: DefinitionRevision,
        admission: DefinitionActivationAdmission,
    ) -> Result<Self, ActivateRevisionError> {
        let DefinitionActivationAdmission {
            activated_at,
            classification,
            kind,
            migration_operation_id,
            policy,
        } = admission;
        let payload = serde_jcs::to_string(&DefinitionActivatedV1 {
            activated_by: context.actor_id().as_str(),
            classification: classification.map(EvolutionClassification::as_str),
            definition_id: target.definition_id.as_str(),
            digest: target.digest.as_str(),
            kind: kind.as_str(),
            migration_operation_id: migration_operation_id.as_ref().map(OperationId::as_str),
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
            kind,
            migration_operation_id,
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

    pub fn kind(&self) -> zoen_core::DefinitionActivationKind {
        self.kind
    }

    pub fn migration_operation_id(&self) -> Option<&OperationId> {
        self.migration_operation_id.as_ref()
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
    kind: &'a str,
    migration_operation_id: Option<&'a str>,
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

    async fn apply_migration_batch(
        &self,
        batch: &AdmittedMigrationBatch,
    ) -> Result<zoen_core::MigrationProgress, StoreError>;

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

    async fn get_migration(
        &self,
        tenant_id: &TenantId,
        operation_id: &OperationId,
    ) -> Result<zoen_core::MigrationProgress, StoreError>;

    async fn get_completed_migration(
        &self,
        tenant_id: &TenantId,
        from: &DefinitionReference,
        to: &DefinitionReference,
    ) -> Result<Option<zoen_core::MigrationProgress>, StoreError>;

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

    async fn prepare_migration(
        &self,
        migration: &AdmittedMigrationPlan,
    ) -> Result<zoen_core::MigrationProgress, StoreError>;

    async fn preflight_migration_batch(
        &self,
        tenant_id: &TenantId,
        operation_id: &OperationId,
        batch_index: u32,
        intent_digest: &IntentDigest,
    ) -> Result<MigrationBatchPreflight, StoreError>;

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

    async fn revision_was_active(
        &self,
        tenant_id: &TenantId,
        revision: &DefinitionReference,
    ) -> Result<bool, StoreError>;
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
