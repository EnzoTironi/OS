//! `WorldKernel`: seven public verbs on one active `WorldRelease` catalog.

use std::{
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    CommitSequence, ComponentCatalogDigest, ExecutorCatalogDigest, OntologyCatalogDigest,
    PolicyCatalogDigest, PrincipalId, PublicVerb, ReleaseDigest, WorldId,
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

    /// # Errors
    ///
    /// Returns the input when it is not a known surface.
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "cli" => Ok(Self::Cli),
            "connect" => Ok(Self::Connect),
            "mcp" => Ok(Self::Mcp),
            "eve" => Ok(Self::Eve),
            other => Err(format!("unknown kernel surface {other}")),
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
    pub outcome: KernelDecisionOutcome,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelReceipt {
    pub proposal_id: String,
    pub receipt_id: String,
    pub release_digest: ReleaseDigest,
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
    pub membership: String,
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

/// Request to plant a governed object and its principal/membership grants.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelPlantObject {
    pub object_id: String,
    pub object_type: String,
    pub fields_jcs: String,
    pub grants: Vec<KernelObjectGrant>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelObjectGrant {
    pub principal: PrincipalId,
    pub membership: String,
}
