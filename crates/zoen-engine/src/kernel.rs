//! `WorldKernel`: seven public verbs on one active `WorldRelease` catalog.

use std::{
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    ActorId, ComponentCatalogDigest, ExecutorCatalogDigest, MembershipId, OntologyCatalogDigest,
    PolicyCatalogDigest, PrincipalId, PublicVerb, ReleaseDigest, WorkloadId, WorldId,
};

/// Product surface that invoked the kernel. Semantics stay identical.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum KernelSurface {
    Cli,
    Connect,
    Mcp,
    Eve,
}

impl KernelSurface {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::Connect => "connect",
            Self::Mcp => "mcp",
            Self::Eve => "eve",
        }
    }
}

impl Display for KernelSurface {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Catalog digests bound by the active release.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernedCatalogBasis {
    pub world: WorldId,
    pub release_digest: ReleaseDigest,
    pub ontology: OntologyCatalogDigest,
    pub policy: PolicyCatalogDigest,
    pub executors: ExecutorCatalogDigest,
    pub components: ComponentCatalogDigest,
    pub public_verbs: Vec<PublicVerb>,
}

/// Discover result shared by every surface.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelDiscoverResult {
    pub basis: GovernedCatalogBasis,
    pub surface: KernelSurface,
    pub decision: KernelPolicyDecision,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelPolicyDecision {
    Permit,
    Deny,
    Error(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelProposal {
    pub proposal_id: String,
    pub world: WorldId,
    pub release_digest: ReleaseDigest,
    pub principal: PrincipalId,
    pub membership: MembershipId,
    pub actor: ActorId,
    pub workload: WorkloadId,
    pub preview_hash: String,
    pub input_jcs: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KernelDecisionOutcome {
    Approve,
    Reject,
}

impl KernelDecisionOutcome {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Approve => "approve",
            Self::Reject => "reject",
        }
    }

    /// # Errors
    ///
    /// Returns the input when it is not approve|reject.
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "approve" => Ok(Self::Approve),
            "reject" => Ok(Self::Reject),
            other => Err(format!("unknown decision outcome {other}")),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelDecision {
    pub proposal_id: String,
    pub principal: PrincipalId,
    pub membership: MembershipId,
    pub actor: ActorId,
    pub workload: WorkloadId,
    pub outcome: KernelDecisionOutcome,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelReceipt {
    pub proposal_id: String,
    pub receipt_id: String,
    pub release_digest: ReleaseDigest,
    pub principal: PrincipalId,
    pub membership: MembershipId,
    pub actor: ActorId,
    pub workload: WorkloadId,
    pub explanation_jcs: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelExplanation {
    pub receipt_id: String,
    pub proposal_id: String,
    pub release_digest: ReleaseDigest,
    pub explanation_jcs: String,
    pub surface: KernelSurface,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelExecution {
    pub receipt_id: String,
    pub execution_id: String,
    pub release_digest: ReleaseDigest,
    pub principal: PrincipalId,
    pub membership: MembershipId,
    pub actor: ActorId,
    pub workload: WorkloadId,
}

/// Planted ObjectKey with optional grants for typed query.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelMintObject {
    pub entity_id: String,
    pub grants: Vec<KernelTypedGrant>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelTypedGrant {
    pub principal_id: String,
    pub membership_id: String,
    pub object_type: String,
}

/// Authorized typed object row (private ObjectKey + verified TypeAssignmentRef).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelTypedObject {
    pub key_world: String,
    pub key_entity: String,
    pub type_id: String,
    pub assignment_id: String,
    pub evidence_ref: String,
    pub valid_start_micros: i64,
    pub valid_end_micros: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelTypedObjectPage {
    pub world: String,
    pub object_type: String,
    pub valid_at_micros: i64,
    pub objects: Vec<KernelTypedObject>,
    pub authorized_count: u64,
}

/// FIN-01 identity candidate (never silently selected).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentityCandidate {
    pub world: String,
    pub entity: String,
    pub type_id: String,
    pub assignment_id: String,
    pub venue: Option<String>,
    pub currency: Option<String>,
    pub identifier_level: String,
    pub identifier_scheme: String,
    pub identifier_value: String,
    pub evidence_ref: String,
    pub valid_start_micros: i64,
    pub valid_end_micros: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentityResolve {
    pub query: String,
    pub candidates: Vec<KernelIdentityCandidate>,
    /// Always false/empty: FIN-01 forbids silent first-match selection.
    pub selected: Option<String>,
    pub fin01_artifact: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelError {
    Conflict(String),
    Denied(String),
    NotFound(String),
    Store(String),
}

impl Display for KernelError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(message)
            | Self::Denied(message)
            | Self::NotFound(message)
            | Self::Store(message) => formatter.write_str(message),
        }
    }
}

impl Error for KernelError {}

/// One authorized object visible after pre-discovery entitlement.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelAuthorizedObject {
    pub object_id: String,
    pub object_type: String,
    pub fields_jcs: String,
}

/// Sealed object-set page issued only after authorize-before-discovery.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelQueryPage {
    pub basis: GovernedCatalogBasis,
    pub surface: KernelSurface,
    pub decision: KernelPolicyDecision,
    pub membership: MembershipId,
    pub object_type: String,
    pub budget_id: String,
    pub page_limit: u32,
    pub authorized_count: u32,
    pub objects: Vec<KernelAuthorizedObject>,
    pub next_cursor: String,
    pub compute_digest: String,
    pub explanation_jcs: String,
}
