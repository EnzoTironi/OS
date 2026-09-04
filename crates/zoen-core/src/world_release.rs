//! Private `WorldRelease` content and domain-tagged RFC 8785 `ReleaseDigest`.

use std::{
    error::Error,
    fmt::{Display, Formatter, Write as _},
};

use crate::{
    DigestError, IdentifierError, JcsError, PolicyEvidence, PrincipalId, TimestampMicros,
    canonicalize_json, encode_hex, parse_identifier, sha256::sha256,
};

pub const WORLD_RELEASE_SCHEMA: &str = "zoen.world-release.v1";
pub const WORLD_RELEASE_PREVIEW_SCHEMA: &str = "zoen.world-release-preview.v1";
pub const WORLD_POLICY_CATALOG_SCHEMA: &str = "zoen.policy-catalog.v1";
pub const WORLD_KERNEL_AUTHORITY_DEFINITION: &str = "zoen.world.kernel.authority";
/// SHA-256 of the stable authority domain `zoen.world-kernel-authority.v1`.
pub const WORLD_KERNEL_AUTHORITY_DEFINITION_DIGEST: &str =
    "3dfddf9c946656d9ce19ccaacecba5db3d284417c1c3f1f9d0ee710163e42dfc";
pub const WORLD_KERNEL_AUTHORITY_RESOURCE: &str = "zoen.world.kernel";
pub const WORLD_RELEASE_PUBLISH_ACTION: &str = "zoen.world.release.publish";
pub const WORLD_RELEASE_PREVIEW_ACTION: &str = "zoen.world.release.preview";
pub const WORLD_RELEASE_DECIDE_ACTION: &str = "zoen.world.release.decide";
pub const WORLD_RELEASE_ACTIVATE_ACTION: &str = "zoen.world.release.activate";
pub const WORLD_RELEASE_AUTHORITY_RESOURCE: &str = "zoen.world.release";
pub const WORLD_RELEASE_AUTHORITY_DEFINITION: &str = "zoen.world.release.authority";
/// SHA-256 of the stable authority domain `zoen.world-release-authority.v1`.
pub const WORLD_RELEASE_AUTHORITY_DEFINITION_DIGEST: &str =
    "e39d2372b5e94449657447a9a2109ed5e5f2e18bc424639ee25627e849f03862";

macro_rules! catalog_digest {
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

            #[must_use]
            pub fn from_sha256(bytes: [u8; 32]) -> Self {
                Self(encode_hex(&bytes))
            }
        }

        impl Display for $name {
            fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

catalog_digest!(OntologyCatalogDigest);
catalog_digest!(PolicyCatalogDigest);
catalog_digest!(ExecutorCatalogDigest);
catalog_digest!(ComponentCatalogDigest);

macro_rules! catalog_blob {
    ($name:ident, $digest:ident) => {
        /// Immutable content-addressed catalog blob. Digest is derived from bytes.
        #[derive(Clone, Debug, Eq, PartialEq)]
        pub struct $name {
            digest: $digest,
            bytes: Vec<u8>,
        }

        impl $name {
            /// Hash `bytes` with SHA-256 and assign the catalog digest.
            ///
            /// Callers cannot supply an unrelated digest.
            #[must_use]
            pub fn from_bytes(bytes: Vec<u8>) -> Self {
                let digest = $digest::from_sha256(sha256(&bytes));
                Self { digest, bytes }
            }

            #[must_use]
            pub fn digest(&self) -> &$digest {
                &self.digest
            }

            #[must_use]
            pub fn bytes(&self) -> &[u8] {
                &self.bytes
            }
        }
    };
}

catalog_blob!(OntologyCatalog, OntologyCatalogDigest);
catalog_blob!(PolicyCatalog, PolicyCatalogDigest);
catalog_blob!(ExecutorCatalog, ExecutorCatalogDigest);
catalog_blob!(ComponentCatalog, ComponentCatalogDigest);

/// The four catalog blobs bound by one `WorldRelease`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleaseCatalogs {
    ontology: OntologyCatalog,
    policy: PolicyCatalog,
    executors: ExecutorCatalog,
    components: ComponentCatalog,
}

impl WorldReleaseCatalogs {
    #[must_use]
    pub fn new(
        ontology: OntologyCatalog,
        policy: PolicyCatalog,
        executors: ExecutorCatalog,
        components: ComponentCatalog,
    ) -> Self {
        Self {
            ontology,
            policy,
            executors,
            components,
        }
    }

    #[must_use]
    pub fn ontology(&self) -> &OntologyCatalog {
        &self.ontology
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyCatalog {
        &self.policy
    }

    #[must_use]
    pub fn executors(&self) -> &ExecutorCatalog {
        &self.executors
    }

    #[must_use]
    pub fn components(&self) -> &ComponentCatalog {
        &self.components
    }

    /// Derive release content from these blobs. Catalog digests cannot drift.
    #[must_use]
    pub fn content(&self, world: WorldId, parent: Option<ReleaseDigest>) -> WorldReleaseContent {
        WorldReleaseContent::new(
            world,
            parent,
            self.ontology.digest().clone(),
            self.policy.digest().clone(),
            self.executors.digest().clone(),
            self.components.digest().clone(),
        )
    }

    /// True when `release` binds exactly these four catalog digests.
    #[must_use]
    pub fn binds(&self, release: &WorldRelease) -> bool {
        release.content().ontology() == self.ontology.digest()
            && release.content().policy() == self.policy.digest()
            && release.content().executors() == self.executors.digest()
            && release.content().components() == self.components.digest()
    }
}

/// World identity for release content. Distinct from legacy `TenantId` spelling.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct WorldId(String);

impl WorldId {
    /// # Errors
    ///
    /// Returns [`IdentifierError`] when `value` is not a valid identifier.
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
        parse_identifier(value.into(), "WorldId").map(Self)
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for WorldId {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Content-addressed release identity. Lowercase 64-char SHA-256 hex.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ReleaseDigest(String);

impl ReleaseDigest {
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

    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl Display for ReleaseDigest {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Content-addressed activation preview identity. Lowercase 64-char SHA-256 hex.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ReleasePreviewDigest(String);

impl ReleasePreviewDigest {
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

    #[must_use]
    pub fn from_sha256(bytes: [u8; 32]) -> Self {
        Self(encode_hex(&bytes))
    }
}

impl Display for ReleasePreviewDigest {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Catalog digest tuple bound into a release preview.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReleaseCatalogSnapshot {
    ontology: OntologyCatalogDigest,
    policy: PolicyCatalogDigest,
    executors: ExecutorCatalogDigest,
    components: ComponentCatalogDigest,
}

impl ReleaseCatalogSnapshot {
    #[must_use]
    pub fn new(
        ontology: OntologyCatalogDigest,
        policy: PolicyCatalogDigest,
        executors: ExecutorCatalogDigest,
        components: ComponentCatalogDigest,
    ) -> Self {
        Self {
            ontology,
            policy,
            executors,
            components,
        }
    }

    #[must_use]
    pub fn ontology(&self) -> &OntologyCatalogDigest {
        &self.ontology
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyCatalogDigest {
        &self.policy
    }

    #[must_use]
    pub fn executors(&self) -> &ExecutorCatalogDigest {
        &self.executors
    }

    #[must_use]
    pub fn components(&self) -> &ComponentCatalogDigest {
        &self.components
    }
}

/// Deterministic activation impact preview. Digest is derived; callers cannot supply it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleasePreviewContent {
    world: WorldId,
    release: ReleaseDigest,
    current_active: Option<ReleaseDigest>,
    candidate: ReleaseCatalogSnapshot,
    current: Option<ReleaseCatalogSnapshot>,
}

impl WorldReleasePreviewContent {
    /// Build preview content. Does not accept a preview digest.
    #[must_use]
    pub fn new(
        world: WorldId,
        release: ReleaseDigest,
        current_active: Option<ReleaseDigest>,
        candidate: ReleaseCatalogSnapshot,
        current: Option<ReleaseCatalogSnapshot>,
    ) -> Self {
        Self {
            world,
            release,
            current_active,
            candidate,
            current,
        }
    }

    #[must_use]
    pub fn world(&self) -> &WorldId {
        &self.world
    }

    #[must_use]
    pub fn release(&self) -> &ReleaseDigest {
        &self.release
    }

    #[must_use]
    pub fn current_active(&self) -> Option<&ReleaseDigest> {
        self.current_active.as_ref()
    }

    #[must_use]
    pub fn candidate(&self) -> &ReleaseCatalogSnapshot {
        &self.candidate
    }

    #[must_use]
    pub fn current(&self) -> Option<&ReleaseCatalogSnapshot> {
        self.current.as_ref()
    }

    /// RFC 8785 JCS UTF-8 bytes for the domain-tagged preview digest document.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::Canonicalize`] when JCS fails.
    pub fn canonical_jcs(&self) -> Result<String, WorldReleaseError> {
        let document = preview_document_json(self);
        canonicalize_json(&document).map_err(WorldReleaseError::Canonicalize)
    }
}

/// Complete activation preview: derived digest plus private content.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleasePreview {
    id: ReleasePreviewDigest,
    content: WorldReleasePreviewContent,
    canonical_jcs: String,
}

impl WorldReleasePreview {
    /// Receive content, canonicalize, hash, and assign [`ReleasePreviewDigest`].
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when JCS fails.
    pub fn from_content(content: WorldReleasePreviewContent) -> Result<Self, WorldReleaseError> {
        let canonical_jcs = content.canonical_jcs()?;
        let id = ReleasePreviewDigest::from_sha256(sha256(canonical_jcs.as_bytes()));
        Ok(Self {
            id,
            content,
            canonical_jcs,
        })
    }

    #[must_use]
    pub fn id(&self) -> &ReleasePreviewDigest {
        &self.id
    }

    #[must_use]
    pub fn content(&self) -> &WorldReleasePreviewContent {
        &self.content
    }

    #[must_use]
    pub fn canonical_jcs(&self) -> &str {
        &self.canonical_jcs
    }
}

/// Owner decision over one activation preview. Outside `ReleaseDigest`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReleaseDecisionOutcome {
    Approve,
    Reject,
}

impl ReleaseDecisionOutcome {
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::Conflict`] when `value` is not approve/reject.
    pub fn parse(value: &str) -> Result<Self, WorldReleaseError> {
        match value {
            "approve" => Ok(Self::Approve),
            "reject" => Ok(Self::Reject),
            other => Err(WorldReleaseError::Conflict(format!(
                "decision must be approve or reject, got {other}"
            ))),
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Approve => "approve",
            Self::Reject => "reject",
        }
    }
}

/// Durable Decide record for one preview. Never enters `ReleaseDigest`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleaseDecision {
    preview: ReleasePreviewDigest,
    release: ReleaseDigest,
    world: WorldId,
    decided_at: TimestampMicros,
    decided_by: PrincipalId,
    outcome: ReleaseDecisionOutcome,
}

impl WorldReleaseDecision {
    #[must_use]
    pub fn new(
        preview: ReleasePreviewDigest,
        release: ReleaseDigest,
        world: WorldId,
        decided_at: TimestampMicros,
        decided_by: PrincipalId,
        outcome: ReleaseDecisionOutcome,
    ) -> Self {
        Self {
            preview,
            release,
            world,
            decided_at,
            decided_by,
            outcome,
        }
    }

    #[must_use]
    pub fn preview(&self) -> &ReleasePreviewDigest {
        &self.preview
    }

    #[must_use]
    pub fn release(&self) -> &ReleaseDigest {
        &self.release
    }

    #[must_use]
    pub fn world(&self) -> &WorldId {
        &self.world
    }

    #[must_use]
    pub fn decided_at(&self) -> TimestampMicros {
        self.decided_at
    }

    #[must_use]
    pub fn decided_by(&self) -> &PrincipalId {
        &self.decided_by
    }

    #[must_use]
    pub fn outcome(&self) -> ReleaseDecisionOutcome {
        self.outcome
    }
}

/// Immutable release content. Fields stay private; digest derivation owns identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleaseContent {
    world: WorldId,
    parent: Option<ReleaseDigest>,
    ontology: OntologyCatalogDigest,
    policy: PolicyCatalogDigest,
    executors: ExecutorCatalogDigest,
    components: ComponentCatalogDigest,
}

impl WorldReleaseContent {
    /// Build release content. Does not accept a digest.
    #[must_use]
    pub fn new(
        world: WorldId,
        parent: Option<ReleaseDigest>,
        ontology: OntologyCatalogDigest,
        policy: PolicyCatalogDigest,
        executors: ExecutorCatalogDigest,
        components: ComponentCatalogDigest,
    ) -> Self {
        Self {
            world,
            parent,
            ontology,
            policy,
            executors,
            components,
        }
    }

    #[must_use]
    pub fn world(&self) -> &WorldId {
        &self.world
    }

    #[must_use]
    pub fn parent(&self) -> Option<&ReleaseDigest> {
        self.parent.as_ref()
    }

    #[must_use]
    pub fn ontology(&self) -> &OntologyCatalogDigest {
        &self.ontology
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyCatalogDigest {
        &self.policy
    }

    #[must_use]
    pub fn executors(&self) -> &ExecutorCatalogDigest {
        &self.executors
    }

    #[must_use]
    pub fn components(&self) -> &ComponentCatalogDigest {
        &self.components
    }

    /// RFC 8785 JCS UTF-8 bytes for the domain-tagged digest document.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::Canonicalize`] when JCS fails.
    pub fn canonical_jcs(&self) -> Result<String, WorldReleaseError> {
        let document = digest_document_json(self);
        canonicalize_json(&document).map_err(WorldReleaseError::Canonicalize)
    }
}

/// Complete release: derived digest plus private content.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldRelease {
    id: ReleaseDigest,
    content: WorldReleaseContent,
    canonical_jcs: String,
}

impl WorldRelease {
    /// Receive content, canonicalize, hash, and assign [`ReleaseDigest`].
    ///
    /// Callers cannot supply an unrelated digest. There is no constructor that
    /// accepts `(content, digest)`.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when JCS fails.
    pub fn from_content(content: WorldReleaseContent) -> Result<Self, WorldReleaseError> {
        let canonical_jcs = content.canonical_jcs()?;
        let id = ReleaseDigest::from_sha256(sha256(canonical_jcs.as_bytes()));
        Ok(Self {
            id,
            content,
            canonical_jcs,
        })
    }

    #[must_use]
    pub fn id(&self) -> &ReleaseDigest {
        &self.id
    }

    #[must_use]
    pub fn content(&self) -> &WorldReleaseContent {
        &self.content
    }

    #[must_use]
    pub fn canonical_jcs(&self) -> &str {
        &self.canonical_jcs
    }
}

/// Publication metadata. Never enters `ReleaseDigest`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorldReleasePublication {
    release: ReleaseDigest,
    published_at: TimestampMicros,
    published_by: PrincipalId,
    policy: PolicyEvidence,
}

impl WorldReleasePublication {
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::MissingPolicy`] when policy evidence is empty.
    pub fn new(
        release: ReleaseDigest,
        published_at: TimestampMicros,
        published_by: PrincipalId,
        policy: PolicyEvidence,
    ) -> Result<Self, WorldReleaseError> {
        if policy.determining_policies.is_empty()
            || policy.revision.id.as_str().is_empty()
            || policy.revision.digest.as_str().is_empty()
        {
            return Err(WorldReleaseError::MissingPolicy);
        }
        Ok(Self {
            release,
            published_at,
            published_by,
            policy,
        })
    }

    #[must_use]
    pub fn release(&self) -> &ReleaseDigest {
        &self.release
    }

    #[must_use]
    pub fn published_at(&self) -> TimestampMicros {
        self.published_at
    }

    #[must_use]
    pub fn published_by(&self) -> &PrincipalId {
        &self.published_by
    }

    #[must_use]
    pub fn policy(&self) -> &PolicyEvidence {
        &self.policy
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorldReleaseError {
    Canonicalize(JcsError),
    Digest(DigestError),
    Identifier(IdentifierError),
    MissingPolicy,
    MissingCatalog,
    MixedCatalogs,
    InvalidPolicyCatalog(String),
    NotBuilder,
    NotOwner,
    CallerSuppliedDigest,
    WorldMismatch,
    NotFound,
    MissingApproval,
    Rejected,
    StalePreview,
    Conflict(String),
    Store(String),
}

impl Display for WorldReleaseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Canonicalize(error) => write!(formatter, "world release JCS failed: {error}"),
            Self::Digest(error) => error.fmt(formatter),
            Self::Identifier(error) => error.fmt(formatter),
            Self::MissingPolicy => {
                formatter.write_str("world release publication requires policy evidence")
            }
            Self::MissingCatalog => {
                formatter.write_str("world release publish requires catalog bytes")
            }
            Self::MixedCatalogs => formatter
                .write_str("cannot mix catalog bytes from one candidate with digests from another"),
            Self::InvalidPolicyCatalog(message) => write!(
                formatter,
                "policy catalog must contain a loadable Cedar bundle: {message}"
            ),
            Self::NotBuilder => formatter.write_str("principal is not a builder for this World"),
            Self::NotOwner => formatter.write_str("principal is not the owner of this World"),
            Self::CallerSuppliedDigest => {
                formatter.write_str("caller cannot supply a ReleaseDigest for WorldRelease content")
            }
            Self::WorldMismatch => {
                formatter.write_str("release digest does not belong to this World")
            }
            Self::NotFound => formatter.write_str("world release was not found"),
            Self::MissingApproval => {
                formatter.write_str("activation requires an approving decision")
            }
            Self::Rejected => formatter.write_str("release activation was rejected"),
            Self::StalePreview => formatter.write_str("release preview is stale"),
            Self::Conflict(message) => write!(formatter, "world release conflict: {message}"),
            Self::Store(message) => write!(formatter, "world release store error: {message}"),
        }
    }
}

impl Error for WorldReleaseError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Canonicalize(error) => Some(error),
            Self::Digest(error) => Some(error),
            Self::Identifier(error) => Some(error),
            _ => None,
        }
    }
}

impl From<DigestError> for WorldReleaseError {
    fn from(value: DigestError) -> Self {
        Self::Digest(value)
    }
}

impl From<IdentifierError> for WorldReleaseError {
    fn from(value: IdentifierError) -> Self {
        Self::Identifier(value)
    }
}

fn digest_document_json(content: &WorldReleaseContent) -> String {
    let mut out = String::with_capacity(256);
    out.push('{');
    write_member(&mut out, "schema", Some(WORLD_RELEASE_SCHEMA), true);
    write_member(&mut out, "world", Some(content.world.as_str()), false);
    out.push(',');
    write_json_string(&mut out, "parent");
    out.push(':');
    match &content.parent {
        Some(parent) => {
            out.push('"');
            out.push_str(parent.as_str());
            out.push('"');
        }
        None => out.push_str("null"),
    }
    write_member(&mut out, "ontology", Some(content.ontology.as_str()), false);
    write_member(&mut out, "policy", Some(content.policy.as_str()), false);
    write_member(
        &mut out,
        "executors",
        Some(content.executors.as_str()),
        false,
    );
    write_member(
        &mut out,
        "components",
        Some(content.components.as_str()),
        false,
    );
    out.push('}');
    out
}

fn preview_document_json(content: &WorldReleasePreviewContent) -> String {
    let mut out = String::with_capacity(512);
    out.push('{');
    write_member(&mut out, "schema", Some(WORLD_RELEASE_PREVIEW_SCHEMA), true);
    write_member(&mut out, "world", Some(content.world.as_str()), false);
    write_member(&mut out, "release", Some(content.release.as_str()), false);
    out.push(',');
    write_json_string(&mut out, "currentActive");
    out.push(':');
    match &content.current_active {
        Some(digest) => {
            out.push('"');
            out.push_str(digest.as_str());
            out.push('"');
        }
        None => out.push_str("null"),
    }
    out.push(',');
    write_json_string(&mut out, "candidate");
    out.push(':');
    write_catalog_snapshot_json(&mut out, &content.candidate);
    out.push(',');
    write_json_string(&mut out, "current");
    out.push(':');
    match &content.current {
        Some(snapshot) => write_catalog_snapshot_json(&mut out, snapshot),
        None => out.push_str("null"),
    }
    out.push('}');
    out
}

fn write_catalog_snapshot_json(out: &mut String, snapshot: &ReleaseCatalogSnapshot) {
    out.push('{');
    write_member(out, "components", Some(snapshot.components.as_str()), true);
    write_member(out, "executors", Some(snapshot.executors.as_str()), false);
    write_member(out, "ontology", Some(snapshot.ontology.as_str()), false);
    write_member(out, "policy", Some(snapshot.policy.as_str()), false);
    out.push('}');
}

fn write_member(out: &mut String, key: &str, value: Option<&str>, first: bool) {
    if !first {
        out.push(',');
    }
    write_json_string(out, key);
    out.push(':');
    match value {
        Some(text) => {
            out.push('"');
            out.push_str(text);
            out.push('"');
        }
        None => out.push_str("null"),
    }
}

fn write_json_string(out: &mut String, text: &str) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if u32::from(ch) < 0x20 => {
                let code = u32::from(ch);
                let _ = write!(out, "\\u{code:04x}");
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

/// Schema tag for the public-verb ontology catalog blob (§8.3 / W2-05).
pub const WORLD_ONTOLOGY_CATALOG_SCHEMA: &str = "zoen.ontology-catalog.v1";

/// The seven public verbs on the governed catalog.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum PublicVerb {
    Discover,
    Query,
    Propose,
    Decide,
    Commit,
    Explain,
    Execute,
}

impl PublicVerb {
    pub const ALL: [Self; 7] = [
        Self::Discover,
        Self::Query,
        Self::Propose,
        Self::Decide,
        Self::Commit,
        Self::Explain,
        Self::Execute,
    ];

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Discover => "Discover",
            Self::Query => "Query",
            Self::Propose => "Propose",
            Self::Decide => "Decide",
            Self::Commit => "Commit",
            Self::Explain => "Explain",
            Self::Execute => "Execute",
        }
    }

    #[must_use]
    pub fn action_id(self) -> &'static str {
        match self {
            Self::Discover => "zoen.world.discover",
            Self::Query => "zoen.world.query",
            Self::Propose => "zoen.world.propose",
            Self::Decide => "zoen.world.decide",
            Self::Commit => "zoen.world.commit",
            Self::Explain => "zoen.world.explain",
            Self::Execute => "zoen.world.execute",
        }
    }

    /// # Errors
    ///
    /// Returns the input when it is not one of the seven public verbs.
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "Discover" => Ok(Self::Discover),
            "Query" => Ok(Self::Query),
            "Propose" => Ok(Self::Propose),
            "Decide" => Ok(Self::Decide),
            "Commit" => Ok(Self::Commit),
            "Explain" => Ok(Self::Explain),
            "Execute" => Ok(Self::Execute),
            other => Err(format!("unknown public verb {other}")),
        }
    }
}

impl Display for PublicVerb {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_str())
    }
}
