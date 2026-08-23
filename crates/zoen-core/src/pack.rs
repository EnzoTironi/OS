use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::{
    ActionId, DefinitionDigest, DefinitionId, DigestError, IdentifierError, RelationId, TenantId,
    TimestampMicros, parse_identifier,
};

macro_rules! pack_id {
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

pack_id!(PackId);
pack_id!(InstallId);
pack_id!(GrantId);
pack_id!(RequirementId);
pack_id!(PublisherId);
pack_id!(FirstSuccessContractId);
pack_id!(PublicKeyId);

/// Content-addressed pack identity. Lowercase 64-char SHA-256 hex of JCS bytes.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PackDigest(String);

impl PackDigest {
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

impl Display for PackDigest {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

macro_rules! sha256_digest_local {
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

sha256_digest_local!(PreviewDigest);
sha256_digest_local!(EvolutionAckDigest);

/// Publisher-owned version string. Never the literal `latest`.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PackVersion(String);

impl PackVersion {
    pub fn parse(value: impl Into<String>) -> Result<Self, PackError> {
        let value = value.into();
        if value.is_empty() || value == "latest" {
            return Err(PackError::InvalidVersion(value));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for PackVersion {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

pub const PACK_FORMAT_V1: &str = "zoen.pack.v1";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IntegrationKind {
    ReadSource,
    WriteEffect,
    HumanExecutor,
    Notification,
    Adapter,
}

impl IntegrationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadSource => "read_source",
            Self::WriteEffect => "write_effect",
            Self::HumanExecutor => "human_executor",
            Self::Notification => "notification",
            Self::Adapter => "adapter",
        }
    }

    pub fn parse(value: &str) -> Result<Self, PackError> {
        match value {
            "read_source" => Ok(Self::ReadSource),
            "write_effect" => Ok(Self::WriteEffect),
            "human_executor" => Ok(Self::HumanExecutor),
            "notification" => Ok(Self::Notification),
            "adapter" => Ok(Self::Adapter),
            _ => Err(PackError::InvalidIntegrationKind(value.to_owned())),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Sensitivity {
    Sensitive,
    NonSensitive,
}

impl Sensitivity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sensitive => "sensitive",
            Self::NonSensitive => "non_sensitive",
        }
    }

    pub fn parse(value: &str) -> Result<Self, PackError> {
        match value {
            "sensitive" => Ok(Self::Sensitive),
            "non_sensitive" => Ok(Self::NonSensitive),
            _ => Err(PackError::InvalidSensitivity(value.to_owned())),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Necessity {
    Required,
    Optional { degrade: DegradationDecl },
}

impl Necessity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Required => "required",
            Self::Optional { .. } => "optional",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DegradationDecl {
    pub mode: String,
    pub action_ids: Vec<ActionId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublisherIdentity {
    pub publisher_id: PublisherId,
    pub display_name: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackPresentation {
    pub title: String,
    pub summary: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OntologyDependency {
    pub definition_id: DefinitionId,
    pub digest: DefinitionDigest,
    pub canonical_json: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IntegrationRequirement {
    pub requirement_id: RequirementId,
    pub kind: IntegrationKind,
    pub sensitivity: Sensitivity,
    pub necessity: Necessity,
    pub scope: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FirstSuccessOutcome {
    ActionCommitted { action_id: ActionId },
    EvidenceRecorded { relation_id: RelationId },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FirstSuccessContract {
    pub contract_id: FirstSuccessContractId,
    pub outcome: FirstSuccessOutcome,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignatureEvidence {
    pub algorithm: String,
    pub public_key_id: PublicKeyId,
    pub signature_b64: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackManifest {
    pub format_version: String,
    pub pack_id: PackId,
    pub version: PackVersion,
    pub publisher: PublisherIdentity,
    pub description: PackPresentation,
    pub ontology_dependencies: Vec<OntologyDependency>,
    pub integration_requirements: Vec<IntegrationRequirement>,
    pub first_success_contract: FirstSuccessContract,
    pub signature: Option<SignatureEvidence>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InstallPhaseKind {
    Installed,
    GrantsResolved,
    Activating,
    Active,
    Failed,
    Superseded,
}

impl InstallPhaseKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Installed => "installed",
            Self::GrantsResolved => "grants_resolved",
            Self::Activating => "activating",
            Self::Active => "active",
            Self::Failed => "failed",
            Self::Superseded => "superseded",
        }
    }

    pub fn parse(value: &str) -> Result<Self, PackError> {
        match value {
            "installed" => Ok(Self::Installed),
            "grants_resolved" => Ok(Self::GrantsResolved),
            "activating" => Ok(Self::Activating),
            "active" => Ok(Self::Active),
            "failed" => Ok(Self::Failed),
            "superseded" => Ok(Self::Superseded),
            _ => Err(PackError::InvalidPhase(value.to_owned())),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActivatedDefinitionRef {
    pub definition_id: DefinitionId,
    pub digest: DefinitionDigest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum InstallPhase {
    Installed,
    GrantsResolved,
    Activating,
    Active {
        activated: Vec<ActivatedDefinitionRef>,
        activated_at: TimestampMicros,
    },
    Failed {
        reason: String,
    },
    Superseded {
        by: InstallId,
    },
}

impl InstallPhase {
    pub fn kind(&self) -> InstallPhaseKind {
        match self {
            Self::Installed => InstallPhaseKind::Installed,
            Self::GrantsResolved => InstallPhaseKind::GrantsResolved,
            Self::Activating => InstallPhaseKind::Activating,
            Self::Active { .. } => InstallPhaseKind::Active,
            Self::Failed { .. } => InstallPhaseKind::Failed,
            Self::Superseded { .. } => InstallPhaseKind::Superseded,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GrantStatus {
    Pending,
    Accepted { at: TimestampMicros, by: String },
    Declined { at: TimestampMicros, by: String },
}

impl GrantStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted { .. } => "accepted",
            Self::Declined { .. } => "declined",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapabilityGrant {
    pub grant_id: GrantId,
    pub requirement_id: RequirementId,
    pub necessity: Necessity,
    pub sensitivity: Sensitivity,
    pub kind: IntegrationKind,
    pub scope: String,
    pub status: GrantStatus,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InstallReceipt {
    pub install_id: InstallId,
    pub tenant_id: TenantId,
    pub pack_digest: PackDigest,
    pub pack_id: PackId,
    pub pack_version: PackVersion,
    pub preview_digest: PreviewDigest,
    pub phase: InstallPhase,
    pub grants: Vec<CapabilityGrant>,
    pub prior_install_id: Option<InstallId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OntologyImpactLine {
    pub definition_id: DefinitionId,
    pub digest: DefinitionDigest,
    pub status: OntologyImpactStatus,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OntologyImpactStatus {
    Missing,
    AlreadyActive,
    CompatibleUpgrade,
    BreakingUpgrade { plan_digest: String },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RequirementImpactLine {
    pub requirement_id: RequirementId,
    pub kind: IntegrationKind,
    pub sensitivity: Sensitivity,
    pub necessity: String,
    pub scope: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PermissionImpactPreview {
    pub pack_digest: PackDigest,
    pub ontology: Vec<OntologyImpactLine>,
    pub requirements: Vec<RequirementImpactLine>,
    pub actions_introduced: Vec<ActionId>,
    pub writes: Vec<RequirementImpactLine>,
    pub reads: Vec<RequirementImpactLine>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackUpdatePermissionDiff {
    pub added_sensitive: Vec<RequirementId>,
    pub reauthorization_required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FirstSuccessEval {
    NotReady,
    Matched {
        outcome_ref: String,
        fired_at: TimestampMicros,
    },
    NotMatched,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PackError {
    DigestMismatch,
    NonCanonicalPack,
    InvalidFormat(String),
    InvalidVersion(String),
    InvalidIntegrationKind(String),
    InvalidSensitivity(String),
    InvalidPhase(String),
    OptionalWithoutDegrade(String),
    SecretEmbedded(String),
    PreviewStale,
    RequiredGrantDeclined(String),
    GrantsUnresolved,
    InvalidPhaseTransition(String),
    MissingDependency(String),
    PackNotFound,
    InstallNotFound,
    Store(String),
    Identifier(IdentifierError),
    Digest(DigestError),
}

impl Display for PackError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => formatter.write_str("pack digest mismatch"),
            Self::NonCanonicalPack => {
                formatter.write_str("pack JSON is not normalized RFC 8785 canonical JSON")
            }
            Self::InvalidFormat(value) => write!(formatter, "invalid pack format: {value}"),
            Self::InvalidVersion(value) => write!(formatter, "invalid pack version: {value}"),
            Self::InvalidIntegrationKind(value) => {
                write!(formatter, "invalid integration kind: {value}")
            }
            Self::InvalidSensitivity(value) => write!(formatter, "invalid sensitivity: {value}"),
            Self::InvalidPhase(value) => write!(formatter, "invalid install phase: {value}"),
            Self::OptionalWithoutDegrade(id) => {
                write!(formatter, "optional requirement {id} missing degrade")
            }
            Self::SecretEmbedded(field) => {
                write!(formatter, "pack embeds secret-shaped field: {field}")
            }
            Self::PreviewStale => formatter.write_str("preview digest is stale"),
            Self::RequiredGrantDeclined(id) => {
                write!(formatter, "required grant declined: {id}")
            }
            Self::GrantsUnresolved => formatter.write_str("required grants are unresolved"),
            Self::InvalidPhaseTransition(message) => {
                write!(formatter, "invalid install phase transition: {message}")
            }
            Self::MissingDependency(id) => write!(formatter, "missing dependency artifact: {id}"),
            Self::PackNotFound => formatter.write_str("pack artifact was not found"),
            Self::InstallNotFound => formatter.write_str("install receipt was not found"),
            Self::Store(message) => write!(formatter, "pack store error: {message}"),
            Self::Identifier(error) => error.fmt(formatter),
            Self::Digest(error) => error.fmt(formatter),
        }
    }
}

impl Error for PackError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Identifier(error) => Some(error),
            Self::Digest(error) => Some(error),
            _ => None,
        }
    }
}

impl From<IdentifierError> for PackError {
    fn from(value: IdentifierError) -> Self {
        Self::Identifier(value)
    }
}

impl From<DigestError> for PackError {
    fn from(value: DigestError) -> Self {
        Self::Digest(value)
    }
}

pub fn required_grants_accepted(grants: &[CapabilityGrant]) -> bool {
    grants.iter().all(|grant| match &grant.necessity {
        Necessity::Required => matches!(grant.status, GrantStatus::Accepted { .. }),
        Necessity::Optional { .. } => !matches!(grant.status, GrantStatus::Pending),
    })
}
