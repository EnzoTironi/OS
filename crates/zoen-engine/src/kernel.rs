//! `WorldKernel`: seven public verbs on one active `WorldRelease` catalog.

use std::{
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    ActorId, CommitSequence, ComponentCatalogDigest, ExecutorCatalogDigest, MembershipId,
    OntologyCatalogDigest, PolicyCatalogDigest, PrincipalId, PublicVerb, ReleaseDigest, WorkloadId,
    WorldId,
};

use crate::{AuthorizedObjectSetPlanDigest, TrustedAuthorityDigest};

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
    pub trusted_authority_digest: Option<TrustedAuthorityDigest>,
    pub authority_cut: Option<CommitSequence>,
    pub authorized_plan_digest: AuthorizedObjectSetPlanDigest,
    pub authorized_count: u32,
    pub objects: Vec<KernelAuthorizedObject>,
    pub next_cursor: String,
    pub page_digest: String,
    pub explanation_jcs: String,
}

/// Caller selector for a contextual identifier query. Every field is cursor-bound.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentifierSelector {
    pub value: String,
    pub scheme: Option<String>,
    pub object_type: Option<String>,
    pub venue_entity_id: Option<String>,
    pub mic: Option<String>,
    pub currency: Option<String>,
    pub share_class: Option<String>,
    pub provider: Option<String>,
    pub identifier_level: Option<String>,
    pub valid_at_micros: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentifierContext {
    pub venue_entity_id: Option<String>,
    pub mic: Option<String>,
    pub currency: Option<String>,
    pub share_class: Option<String>,
    pub provider: Option<String>,
    pub identifier_level: Option<String>,
}

/// One outgoing typed link whose target passed the same authority restriction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelAuthorizedLink {
    pub link_assertion_id: String,
    pub link_type: String,
    pub target_object_id: String,
    pub target_object_type: String,
    pub target_type_assignment_id: String,
    pub evidence_ref: String,
}

/// One typed candidate that survived identifier filters and source entitlement.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentifierCandidate {
    pub identifier_assignment_id: String,
    pub object_id: String,
    pub object_type: String,
    pub type_assignment_id: String,
    pub scheme: String,
    pub value: String,
    pub context: KernelIdentifierContext,
    pub valid_start_micros: i64,
    pub valid_end_micros: Option<i64>,
    pub evidence_ref: String,
    pub links: Vec<KernelAuthorizedLink>,
}

/// Authorized contextual-identifier candidates, paged by a fully bound sealed cursor.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelIdentifierQueryPage {
    pub basis: GovernedCatalogBasis,
    pub surface: KernelSurface,
    pub decision: KernelPolicyDecision,
    pub membership: MembershipId,
    pub selector: KernelIdentifierSelector,
    pub budget_id: String,
    pub page_limit: u32,
    pub authorized_count: u32,
    pub candidates: Vec<KernelIdentifierCandidate>,
    pub next_cursor: String,
    pub compute_digest: String,
    pub explanation_jcs: String,
}
