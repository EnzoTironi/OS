use std::{
    error::Error,
    fmt::{Display, Formatter},
    future::Future,
    pin::Pin,
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use zoen_core::{
    ActionId, ActionInput, CapabilityId, CapabilityManifestDigest, ClaimId, CommitSequence,
    ComponentDigest, ComponentExecutionEvidence, ComponentInterface, DefinitionReference, EntityId,
    ExactInteger, ExactValue, ExecutionContext, ExecutionId, ExecutionRequestDigest,
    ExecutionResultDigest, IntentDigest, OperationId, ProposalId, ResourceId, SemanticSelection,
    TimestampMicros,
};

pub const COMPONENT_INTERFACE_V1: &str = "zoen:code-mode/computation@1.0.0";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComputationCapability {
    Action {
        action_id: ActionId,
        definition: DefinitionReference,
        expires_at: TimestampMicros,
        id: CapabilityId,
        proposed_at: TimestampMicros,
        resource_id: ResourceId,
        valid_at: TimestampMicros,
    },
    Explain {
        id: CapabilityId,
    },
    Query {
        definition: DefinitionReference,
        entity_id: EntityId,
        id: CapabilityId,
        selection: SemanticSelection,
        valid_at: TimestampMicros,
    },
}

impl ComputationCapability {
    #[must_use]
    pub fn id(&self) -> &CapabilityId {
        match self {
            Self::Action { id, .. } | Self::Explain { id } | Self::Query { id, .. } => id,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapabilityManifest {
    capabilities: Vec<ComputationCapability>,
    digest: CapabilityManifestDigest,
    interface: ComponentInterface,
}

impl CapabilityManifest {
    /// Build a capability manifest with a stable digest.
    ///
    /// # Errors
    ///
    /// Returns [`ComputationContractError::DuplicateCapability`] when two capabilities share an
    /// id, or [`ComputationContractError::Encoding`] when the canonical manifest cannot be hashed.
    pub fn new(
        interface: ComponentInterface,
        mut capabilities: Vec<ComputationCapability>,
    ) -> Result<Self, ComputationContractError> {
        capabilities.sort_by(|left, right| left.id().cmp(right.id()));
        if capabilities
            .windows(2)
            .any(|pair| pair[0].id() == pair[1].id())
        {
            return Err(ComputationContractError::DuplicateCapability);
        }
        let digest = manifest_digest(&interface, &capabilities)?;
        Ok(Self {
            capabilities,
            digest,
            interface,
        })
    }

    #[must_use]
    pub fn capabilities(&self) -> &[ComputationCapability] {
        &self.capabilities
    }

    #[must_use]
    pub fn capability_ids(&self) -> Vec<CapabilityId> {
        self.capabilities
            .iter()
            .map(|capability| capability.id().clone())
            .collect()
    }

    #[must_use]
    pub fn digest(&self) -> &CapabilityManifestDigest {
        &self.digest
    }

    #[must_use]
    pub fn interface(&self) -> &ComponentInterface {
        &self.interface
    }

    /// RFC 8785 JCS of the capability manifest.
    ///
    /// # Errors
    ///
    /// Returns [`ComputationContractError::Encoding`] when the manifest cannot be serialized.
    pub fn canonical_json(&self) -> Result<String, ComputationContractError> {
        canonical_manifest(&self.interface, &self.capabilities)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ComputationLimits {
    deadline_millis: u64,
    fuel: u64,
    instances: usize,
    memories: usize,
    memory_bytes: usize,
    table_elements: usize,
    tables: usize,
}

impl ComputationLimits {
    /// Construct resource limits. Every bound must be nonzero.
    ///
    /// # Errors
    ///
    /// Returns [`ComputationContractError::ZeroLimit`] when any bound is zero.
    pub fn new(
        fuel: u64,
        memory_bytes: usize,
        table_elements: usize,
        instances: usize,
        tables: usize,
        memories: usize,
        deadline_millis: u64,
    ) -> Result<Self, ComputationContractError> {
        if fuel == 0
            || memory_bytes == 0
            || table_elements == 0
            || instances == 0
            || tables == 0
            || memories == 0
            || deadline_millis == 0
        {
            return Err(ComputationContractError::ZeroLimit);
        }
        Ok(Self {
            deadline_millis,
            fuel,
            instances,
            memories,
            memory_bytes,
            table_elements,
            tables,
        })
    }

    #[must_use]
    pub fn deadline_millis(self) -> u64 {
        self.deadline_millis
    }

    #[must_use]
    pub fn fuel(self) -> u64 {
        self.fuel
    }

    #[must_use]
    pub fn instances(self) -> usize {
        self.instances
    }

    #[must_use]
    pub fn memories(self) -> usize {
        self.memories
    }

    #[must_use]
    pub fn memory_bytes(self) -> usize {
        self.memory_bytes
    }

    #[must_use]
    pub fn table_elements(self) -> usize {
        self.table_elements
    }

    #[must_use]
    pub fn tables(self) -> usize {
        self.tables
    }
}

impl Default for ComputationLimits {
    fn default() -> Self {
        Self {
            deadline_millis: 2_000,
            fuel: 5_000_000,
            instances: 4,
            memories: 2,
            memory_bytes: 8 * 1024 * 1024,
            table_elements: 1_024,
            tables: 2,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComponentArtifact {
    pub bytes: Vec<u8>,
    pub claimed_digest: ComponentDigest,
    pub interface: ComponentInterface,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublishedComponent {
    pub digest: ComponentDigest,
    pub interface: ComponentInterface,
    pub size_bytes: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComputationRequest {
    pub component_digest: ComponentDigest,
    pub execution_id: ExecutionId,
    pub input: Vec<u8>,
    pub limits: ComputationLimits,
    pub manifest: CapabilityManifest,
}

impl ComputationRequest {
    #[must_use]
    pub fn evidence(&self) -> ComponentExecutionEvidence {
        ComponentExecutionEvidence::new(
            self.manifest.capability_ids(),
            self.manifest.digest().clone(),
            self.component_digest.clone(),
            self.execution_id.clone(),
            self.manifest.interface().clone(),
        )
    }

    #[must_use]
    pub fn input_digest(&self) -> ExecutionRequestDigest {
        digest_bytes(&self.input)
    }

    #[must_use]
    pub fn request_digest(&self) -> ExecutionRequestDigest {
        let mut hasher = Sha256::new();
        hash_field(&mut hasher, self.component_digest.as_str());
        hash_field(&mut hasher, self.manifest.digest().as_str());
        hash_field(&mut hasher, self.input_digest().as_str());
        hash_field(&mut hasher, &self.limits.fuel().to_string());
        hash_field(&mut hasher, &self.limits.memory_bytes().to_string());
        hash_field(&mut hasher, &self.limits.table_elements().to_string());
        hash_field(&mut hasher, &self.limits.instances().to_string());
        hash_field(&mut hasher, &self.limits.tables().to_string());
        hash_field(&mut hasher, &self.limits.memories().to_string());
        hash_field(&mut hasher, &self.limits.deadline_millis().to_string());
        ExecutionRequestDigest::from_sha256(hasher.finalize().into())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostQueryRequest {
    pub capability_id: CapabilityId,
    pub entity_id: EntityId,
    pub selection: SemanticSelection,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostSemanticValue {
    pub claim_ids: Vec<ClaimId>,
    pub value: ExactValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostQueryResult {
    pub actual_commit_sequence: CommitSequence,
    pub values: Vec<HostSemanticValue>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostExplainRequest {
    pub capability_id: CapabilityId,
    pub claim_id: ClaimId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostExplainResult {
    pub complete: bool,
    pub explanation_digest: ExecutionResultDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostProposeRequest {
    pub action_id: ActionId,
    pub capability_id: CapabilityId,
    pub inputs: Vec<ActionInput>,
    pub operation_id: OperationId,
    pub proposal_id: ProposalId,
    pub resource_id: ResourceId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostProposalOutcome {
    AwaitingApproval {
        intent_digest: IntentDigest,
        operation_id: OperationId,
        proposal_id: ProposalId,
    },
    Denied,
    EvaluationError,
    PreconditionDenied,
    Ready {
        intent_digest: IntentDigest,
        operation_id: OperationId,
        proposal_id: ProposalId,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostCommitRequest {
    pub capability_id: CapabilityId,
    pub intent_digest: IntentDigest,
    pub operation_id: OperationId,
    pub proposal_id: ProposalId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostCommitOutcome {
    Committed {
        action_id: ActionId,
        commit_sequence: CommitSequence,
        intent_digest: IntentDigest,
        operation_id: OperationId,
        proposal_id: ProposalId,
        recovered: bool,
    },
    Denied,
    EvaluationError,
    IdentityCollision,
    OperationMismatch,
    Stale,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HostCallError {
    CapabilityDenied(String),
    CapabilityUnavailable(CapabilityId),
    InvalidRequest(String),
    ProviderUnavailable(String),
}

pub trait ComputationHost: Send {
    fn query(
        &mut self,
        request: HostQueryRequest,
    ) -> HostCallFuture<'_, Result<HostQueryResult, HostCallError>>;

    fn explain(
        &mut self,
        request: HostExplainRequest,
    ) -> HostCallFuture<'_, Result<HostExplainResult, HostCallError>>;

    fn propose<'a>(
        &'a mut self,
        request: HostProposeRequest,
        evidence: &'a ComponentExecutionEvidence,
    ) -> HostCallFuture<'a, Result<HostProposalOutcome, HostCallError>>;

    fn commit(
        &mut self,
        request: HostCommitRequest,
    ) -> HostCallFuture<'_, Result<HostCommitOutcome, HostCallError>>;
}

pub type HostCallFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramActionOutcome {
    AwaitingApproval {
        intent_digest: IntentDigest,
        operation_id: OperationId,
        proposal_id: ProposalId,
    },
    Committed {
        action_id: ActionId,
        commit_sequence: CommitSequence,
        intent_digest: IntentDigest,
        operation_id: OperationId,
        proposal_id: ProposalId,
        recovered: bool,
    },
    Denied,
    NotRequested,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComputationOutput {
    pub action: ProgramActionOutcome,
    pub aggregate: ExactInteger,
    pub explanation_complete: bool,
    pub selected_claim_id: Option<ClaimId>,
    pub selected_values: u32,
    pub values_scanned: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompletedComputation {
    pub fuel_consumed: u64,
    pub output: ComputationOutput,
    pub result_digest: ExecutionResultDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComputationOutcome {
    CapabilityDenied(String),
    CapabilityUnavailable(CapabilityId),
    Completed(CompletedComputation),
    DeadlineExceeded,
    FuelExhausted,
    HostUnavailable,
    InterfaceMismatch,
    MalformedComponent,
    MemoryLimitExceeded,
    TrapAfterActionRequest,
    TrapBeforeActionRequest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComputationExecution {
    pub evidence: ComponentExecutionEvidence,
    pub outcome: ComputationOutcome,
    pub request_digest: ExecutionRequestDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComputationContractError {
    DuplicateCapability,
    Encoding(String),
    ZeroLimit,
}

impl Display for ComputationContractError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateCapability => formatter.write_str("capability ids must be unique"),
            Self::Encoding(message) => write!(formatter, "failed to encode manifest: {message}"),
            Self::ZeroLimit => formatter.write_str("computation resource limits must be nonzero"),
        }
    }
}

impl Error for ComputationContractError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComponentAdmissionError {
    DigestMismatch,
    Empty,
    InterfaceMismatch,
    Malformed,
    Store(String),
    TooLarge,
    UndeclaredImport(String),
}

impl Display for ComponentAdmissionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => {
                formatter.write_str("component digest does not match its bytes")
            }
            Self::Empty => formatter.write_str("component bytes are empty"),
            Self::InterfaceMismatch => {
                formatter.write_str("component does not implement the declared interface")
            }
            Self::Malformed => formatter.write_str("component bytes are malformed"),
            Self::Store(message) => write!(formatter, "component store unavailable: {message}"),
            Self::TooLarge => formatter.write_str("component exceeds the configured size limit"),
            Self::UndeclaredImport(name) => {
                write!(formatter, "component imports undeclared capability {name}")
            }
        }
    }
}

impl Error for ComponentAdmissionError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ComputationError {
    IdentityCollision,
    Store(String),
}

impl Display for ComputationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::IdentityCollision => {
                formatter.write_str("execution id identifies a different request")
            }
            Self::Store(message) => write!(formatter, "execution store unavailable: {message}"),
        }
    }
}

impl Error for ComputationError {}

pub trait ComputationExecutor: Send + Sync {
    fn publish(
        &self,
        context: &ExecutionContext,
        artifact: ComponentArtifact,
    ) -> impl std::future::Future<Output = Result<PublishedComponent, ComponentAdmissionError>> + Send;

    fn execute<H>(
        &self,
        context: &ExecutionContext,
        request: ComputationRequest,
        host: H,
    ) -> impl std::future::Future<Output = Result<ComputationExecution, ComputationError>> + Send
    where
        H: ComputationHost + 'static;
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestView<'a> {
    capabilities: Vec<CapabilityView<'a>>,
    interface: &'a str,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum CapabilityView<'a> {
    Action {
        action_id: &'a str,
        definition: DefinitionView<'a>,
        expires_at_micros: i64,
        id: &'a str,
        proposed_at_micros: i64,
        resource_id: &'a str,
        valid_at_micros: i64,
    },
    Explain {
        id: &'a str,
    },
    Query {
        definition: DefinitionView<'a>,
        entity_id: &'a str,
        id: &'a str,
        selection: SelectionView<'a>,
        valid_at_micros: i64,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionView<'a> {
    definition_id: &'a str,
    digest: &'a str,
    revision: u64,
}

#[derive(Serialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
enum SelectionView<'a> {
    Computation(&'a str),
    Relation(&'a str),
}

fn canonical_manifest(
    interface: &ComponentInterface,
    capabilities: &[ComputationCapability],
) -> Result<String, ComputationContractError> {
    let capabilities = capabilities
        .iter()
        .map(|capability| match capability {
            ComputationCapability::Action {
                action_id,
                definition,
                expires_at,
                id,
                proposed_at,
                resource_id,
                valid_at,
            } => CapabilityView::Action {
                action_id: action_id.as_str(),
                definition: definition_view(definition),
                expires_at_micros: expires_at.get(),
                id: id.as_str(),
                proposed_at_micros: proposed_at.get(),
                resource_id: resource_id.as_str(),
                valid_at_micros: valid_at.get(),
            },
            ComputationCapability::Explain { id } => CapabilityView::Explain { id: id.as_str() },
            ComputationCapability::Query {
                definition,
                entity_id,
                id,
                selection,
                valid_at,
            } => CapabilityView::Query {
                definition: definition_view(definition),
                entity_id: entity_id.as_str(),
                id: id.as_str(),
                selection: selection_view(selection),
                valid_at_micros: valid_at.get(),
            },
        })
        .collect();
    serde_jcs::to_string(&ManifestView {
        capabilities,
        interface: interface.as_str(),
    })
    .map_err(|error| ComputationContractError::Encoding(error.to_string()))
}

fn definition_view(reference: &DefinitionReference) -> DefinitionView<'_> {
    DefinitionView {
        definition_id: reference.definition_id.as_str(),
        digest: reference.digest.as_str(),
        revision: reference.revision.get(),
    }
}

fn selection_view(selection: &SemanticSelection) -> SelectionView<'_> {
    match selection {
        SemanticSelection::Computation(id) => SelectionView::Computation(id.as_str()),
        SemanticSelection::Relation(id) => SelectionView::Relation(id.as_str()),
    }
}

fn manifest_digest(
    interface: &ComponentInterface,
    capabilities: &[ComputationCapability],
) -> Result<CapabilityManifestDigest, ComputationContractError> {
    Ok(CapabilityManifestDigest::from_sha256(
        Sha256::digest(canonical_manifest(interface, capabilities)?.as_bytes()).into(),
    ))
}

fn digest_bytes(bytes: &[u8]) -> ExecutionRequestDigest {
    ExecutionRequestDigest::from_sha256(Sha256::digest(bytes).into())
}

fn hash_field(hasher: &mut Sha256, field: &str) {
    hasher.update((field.len() as u64).to_be_bytes());
    hasher.update(field.as_bytes());
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        CapabilityId, ComponentInterface, DefinitionDigest, DefinitionId, DefinitionReference,
        DefinitionRevisionNumber, EntityId, RelationId, SemanticSelection, TimestampMicros,
    };

    use super::{
        COMPONENT_INTERFACE_V1, CapabilityManifest, ComputationCapability, ComputationLimits,
    };

    #[test]
    fn manifest_digest_is_order_independent() {
        let definition = DefinitionReference {
            definition_id: DefinitionId::parse("inventory.definition").expect("definition id"),
            digest: DefinitionDigest::parse(
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            )
            .expect("digest"),
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
        };
        let first = ComputationCapability::Query {
            definition: definition.clone(),
            entity_id: EntityId::parse("inventory.item.1").expect("entity"),
            id: CapabilityId::parse("query.first").expect("capability"),
            selection: SemanticSelection::Relation(
                RelationId::parse("inventory.onHand").expect("relation"),
            ),
            valid_at: TimestampMicros::new(1),
        };
        let second = ComputationCapability::Explain {
            id: CapabilityId::parse("explain.selected").expect("capability"),
        };
        let interface = ComponentInterface::parse(COMPONENT_INTERFACE_V1).expect("interface");
        let ordered =
            CapabilityManifest::new(interface.clone(), vec![first.clone(), second.clone()])
                .expect("manifest");
        let reversed = CapabilityManifest::new(interface, vec![second, first]).expect("manifest");
        assert_eq!(ordered.digest(), reversed.digest());
        assert_eq!(ordered.canonical_json(), reversed.canonical_json());
    }

    #[test]
    fn resource_limits_reject_zero() {
        assert!(ComputationLimits::new(1, 1, 1, 1, 1, 1, 0).is_err());
    }
}
