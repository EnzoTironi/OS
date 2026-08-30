use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::{
    ActorId, DelegationChain, IdentifierError, PrincipalId, TenantId, TimestampMicros,
    TrustedExecutionContext, WorkloadId,
};

macro_rules! identity_id {
    ($name:ident) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
                crate::parse_identifier(value.into(), stringify!($name)).map(Self)
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

identity_id!(ZoenAccountId);
identity_id!(ExternalBindingId);
identity_id!(MembershipId);
identity_id!(InviteId);
identity_id!(DelegationTemplateId);

pub const WORLD_FLOOR: &str = "zoen.world.floor";
pub const WORLD_TOP: &str = "zoen.world.top";

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionId(String);

impl SessionId {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 200 {
            return Err(IdentityError::InvalidSessionToken);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for SessionId {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ClassificationToken(String);

impl ClassificationToken {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        crate::parse_identifier(value.into(), "ClassificationToken")
            .map(Self)
            .map_err(|_| IdentityError::InvalidClearance)
    }

    pub fn world_floor() -> Self {
        Self(WORLD_FLOOR.to_owned())
    }

    pub fn top() -> Self {
        Self(WORLD_TOP.to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Clearance {
    tokens: BTreeSet<ClassificationToken>,
}

impl Clearance {
    pub fn from_tokens(
        tokens: impl IntoIterator<Item = ClassificationToken>,
    ) -> Result<Self, IdentityError> {
        let tokens: BTreeSet<_> = tokens.into_iter().collect();
        if tokens.is_empty() {
            return Err(IdentityError::MissingClearance);
        }
        Ok(Self { tokens })
    }

    pub fn from_token_strings(
        values: impl IntoIterator<Item = impl Into<String>>,
    ) -> Result<Self, IdentityError> {
        let tokens = values
            .into_iter()
            .map(ClassificationToken::parse)
            .collect::<Result<Vec<_>, _>>()?;
        Self::from_tokens(tokens)
    }

    pub fn world_floor() -> Self {
        Self {
            tokens: BTreeSet::from([ClassificationToken::world_floor()]),
        }
    }

    pub fn personal_owner() -> Self {
        Self {
            tokens: BTreeSet::from([
                ClassificationToken::world_floor(),
                ClassificationToken::top(),
            ]),
        }
    }

    pub fn tokens(&self) -> &BTreeSet<ClassificationToken> {
        &self.tokens
    }

    pub fn to_token_strings(&self) -> Vec<String> {
        self.tokens
            .iter()
            .map(|token| token.as_str().to_owned())
            .collect()
    }

    pub fn dominates(&self, label: &BTreeSet<ClassificationToken>) -> bool {
        label.iter().all(|token| self.tokens.contains(token))
    }
}

pub fn resource_label(
    tokens: impl IntoIterator<Item = ClassificationToken>,
) -> BTreeSet<ClassificationToken> {
    let tokens: BTreeSet<_> = tokens.into_iter().collect();
    if tokens.is_empty() {
        BTreeSet::from([ClassificationToken::top()])
    } else {
        tokens
    }
}

pub fn mac_write_permitted(clearance: &Clearance, written: &BTreeSet<ClassificationToken>) -> bool {
    clearance.dominates(&resource_label(written.iter().cloned()))
}

pub fn join_labels(
    labels: impl IntoIterator<Item = BTreeSet<ClassificationToken>>,
) -> BTreeSet<ClassificationToken> {
    let mut joined = BTreeSet::new();
    let mut saw_input = false;
    for label in labels {
        saw_input = true;
        joined.extend(resource_label(label));
    }
    if saw_input {
        joined
    } else {
        BTreeSet::from([ClassificationToken::top()])
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OpaqueSessionToken(String);

impl OpaqueSessionToken {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 4096 {
            return Err(IdentityError::InvalidSessionToken);
        }
        if value.split('.').count() == 3 {
            return Err(IdentityError::InvalidSessionToken);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkloadExchangeToken(String);

impl WorkloadExchangeToken {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if !value.starts_with("wlx.") || value.len() > 200 {
            return Err(IdentityError::Unauthenticated);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MachineToken(String);

impl MachineToken {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 4096 {
            return Err(IdentityError::Unauthenticated);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionCredential {
    Door(OpaqueSessionToken),
    Workload(WorkloadExchangeToken),
    Channel {
        machine: MachineToken,
        subject: ExternalSubject,
    },
}

impl SessionCredential {
    pub fn from_authorization(header: Option<&str>) -> Result<Self, IdentityError> {
        let token = header
            .and_then(|value| value.strip_prefix("Bearer "))
            .filter(|value| !value.is_empty())
            .ok_or(IdentityError::Unauthenticated)?;
        if token.starts_with("wlx.") {
            Ok(Self::Workload(WorkloadExchangeToken::parse(token)?))
        } else {
            Ok(Self::Door(OpaqueSessionToken::parse(token)?))
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedSessionEvidence {
    pub door_user_key: String,
    pub expires_at: TimestampMicros,
    pub session_id: SessionId,
}

/// Cross-channel logical person. Never equal to a channel subject.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ZoenAccount {
    pub id: ZoenAccountId,
    pub status: AccountStatus,
    pub created_at: TimestampMicros,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccountStatus {
    Provisional,
    Verified,
    /// Survivor keeps bindings; loser retains historical id for explainability.
    MergedInto {
        survivor: ZoenAccountId,
    },
}

/// Provider-native sender. Never used as TenantPrincipal / PrincipalId.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct ExternalSubject {
    pub provider: ChannelProvider,
    pub subject_key: String,
}

impl ExternalSubject {
    pub fn new(
        provider: ChannelProvider,
        subject_key: impl Into<String>,
    ) -> Result<Self, IdentityError> {
        let subject_key = subject_key.into();
        if subject_key.is_empty() || subject_key.len() > 200 {
            return Err(IdentityError::InvalidSubject);
        }
        if provider == ChannelProvider::WhatsApp && !is_whatsapp_person_subject(&subject_key) {
            return Err(IdentityError::InvalidSubject);
        }
        Ok(Self {
            provider,
            subject_key,
        })
    }

    /// Fail closed when the WhatsApp door cannot be distinguished from a person.
    /// Missing or empty door is `InvalidSubject`. A configured door that matches
    /// this subject is also `InvalidSubject`.
    pub fn reject_if_whatsapp_door(&self, door_e164: Option<&str>) -> Result<(), IdentityError> {
        if self.provider != ChannelProvider::WhatsApp {
            return Ok(());
        }
        let Some(door) = door_e164.map(str::trim).filter(|value| !value.is_empty()) else {
            return Err(IdentityError::InvalidSubject);
        };
        let door_digits = whatsapp_digits(door);
        let subject_digits = whatsapp_digits(&self.subject_key);
        if !door_digits.is_empty() && door_digits == subject_digits {
            return Err(IdentityError::InvalidSubject);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ChannelProvider {
    AuthDoor,
    WhatsApp,
    Telegram,
    Linq,
}

fn whatsapp_digits(value: &str) -> String {
    value.chars().filter(|ch| ch.is_ascii_digit()).collect()
}

fn is_whatsapp_person_subject(subject_key: &str) -> bool {
    if let Some(digits) = subject_key.strip_prefix('+') {
        return digits.len() >= 7
            && digits.len() <= 15
            && digits.as_bytes()[0].is_ascii_digit()
            && digits.as_bytes()[0] != b'0'
            && digits.bytes().all(|byte| byte.is_ascii_digit());
    }
    let Some((user, server)) = subject_key.split_once('@') else {
        return false;
    };
    if server != "s.whatsapp.net" && server != "c.us" {
        return false;
    }
    user.len() >= 7
        && user.len() <= 15
        && user.as_bytes()[0].is_ascii_digit()
        && user.as_bytes()[0] != b'0'
        && user.bytes().all(|byte| byte.is_ascii_digit())
}

impl ChannelProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::AuthDoor => "auth_door",
            Self::WhatsApp => "whatsapp",
            Self::Telegram => "telegram",
            Self::Linq => "linq",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "auth_door" => Ok(Self::AuthDoor),
            "whatsapp" => Ok(Self::WhatsApp),
            "telegram" => Ok(Self::Telegram),
            "linq" => Ok(Self::Linq),
            _ => Err(IdentityError::InvalidProvider),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BindingStatus {
    Provisional,
    Verified,
    Unbound {
        unbound_at: TimestampMicros,
        reason: UnbindReason,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnbindReason {
    Recycle,
    Merge,
    Admin,
    UserRequest,
}

impl UnbindReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Recycle => "recycle",
            Self::Merge => "merge",
            Self::Admin => "admin",
            Self::UserRequest => "user_request",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "recycle" => Ok(Self::Recycle),
            "merge" => Ok(Self::Merge),
            "admin" => Ok(Self::Admin),
            "user_request" => Ok(Self::UserRequest),
            _ => Err(IdentityError::InvalidUnbindReason),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalBinding {
    pub id: ExternalBindingId,
    pub account_id: ZoenAccountId,
    pub subject: ExternalSubject,
    pub status: BindingStatus,
    pub verified_at: Option<TimestampMicros>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MembershipStatus {
    Active,
    Revoked {
        at: TimestampMicros,
        reason: RevocationReason,
    },
    Left {
        at: TimestampMicros,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RevocationReason {
    Admin,
    Security,
    Merge,
}

impl RevocationReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Security => "security",
            Self::Merge => "merge",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "admin" => Ok(Self::Admin),
            "security" => Ok(Self::Security),
            "merge" => Ok(Self::Merge),
            _ => Err(IdentityError::InvalidRevocationReason),
        }
    }
}

/// Explicit account ↔ workspace relation. Source of tenant/principal for TEC.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Membership {
    pub id: MembershipId,
    pub account_id: ZoenAccountId,
    pub tenant_id: TenantId,
    pub principal_id: PrincipalId,
    pub status: MembershipStatus,
    pub kind: MembershipKind,
    pub delegation_template_id: Option<DelegationTemplateId>,
    pub workload_id: WorkloadId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub clearance: Clearance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MembershipKind {
    Personal,
    Invite { invite_id: InviteId },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invite {
    pub id: InviteId,
    pub tenant_id: TenantId,
    pub principal_id: PrincipalId,
    pub token_hash: [u8; 32],
    pub expires_at: TimestampMicros,
    pub consumed_at: Option<TimestampMicros>,
    pub workload_id: WorkloadId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub clearance: Clearance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InviteToken(String);

impl InviteToken {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 200 {
            return Err(IdentityError::InvalidInviteToken);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountMergePlan {
    pub survivor: ZoenAccountId,
    pub absorbed: ZoenAccountId,
    /// Bindings may move; memberships and Personal tenants do NOT copy.
    pub move_bindings: Vec<ExternalBindingId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IdentityError {
    AccountMerged { survivor: ZoenAccountId },
    AccountNotFound,
    AlreadyBound,
    AlreadyConsumed,
    BindingNotFound,
    Conflict(String),
    IngressNotAllowed,
    InvalidInviteToken,
    InvalidProvider,
    InvalidRevocationReason,
    InvalidSubject,
    InvalidUnbindReason,
    InvalidClearance,
    InvalidSessionToken,
    InviteExpired,
    InviteNotFound,
    InviteTenantMismatch,
    MembershipInactive,
    MembershipNotFound,
    MissingClearance,
    PersonalExists,
    RateBudgetExceeded,
    SecretNotShownTwice,
    SubjectUnbound,
    Unavailable(String),
    Unauthenticated,
    WorkloadCredentialExpired,
    WorkloadCredentialInactive,
    WorkloadCredentialNotFound,
}

impl Display for IdentityError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::AccountMerged { survivor } => {
                write!(formatter, "account merged into {survivor}")
            }
            Self::AccountNotFound => formatter.write_str("account not found"),
            Self::AlreadyBound => formatter.write_str("external subject already bound"),
            Self::AlreadyConsumed => formatter.write_str("invite already consumed"),
            Self::BindingNotFound => formatter.write_str("binding not found"),
            Self::Conflict(message) => write!(formatter, "identity conflict: {message}"),
            Self::IngressNotAllowed => formatter.write_str("ingress not allowed for credential"),
            Self::InvalidInviteToken => formatter.write_str("invalid invite token"),
            Self::InvalidProvider => formatter.write_str("invalid channel provider"),
            Self::InvalidRevocationReason => formatter.write_str("invalid revocation reason"),
            Self::InvalidSubject => formatter.write_str("invalid external subject"),
            Self::InvalidUnbindReason => formatter.write_str("invalid unbind reason"),
            Self::InvalidClearance => formatter.write_str("invalid clearance token"),
            Self::InvalidSessionToken => formatter.write_str("invalid session token"),
            Self::InviteExpired => formatter.write_str("invite expired"),
            Self::InviteNotFound => formatter.write_str("invite not found"),
            Self::InviteTenantMismatch => {
                formatter.write_str("invite cannot retarget another tenant")
            }
            Self::MembershipInactive => formatter.write_str("membership is not active"),
            Self::MembershipNotFound => formatter.write_str("membership not found"),
            Self::MissingClearance => formatter.write_str("clearance is required"),
            Self::PersonalExists => formatter.write_str("personal workspace already exists"),
            Self::RateBudgetExceeded => formatter.write_str("workload rate budget exceeded"),
            Self::SecretNotShownTwice => formatter.write_str("workload secret shown only once"),
            Self::SubjectUnbound => formatter.write_str("subject has no verified binding"),
            Self::Unavailable(message) => {
                write!(formatter, "identity store unavailable: {message}")
            }
            Self::Unauthenticated => formatter.write_str("unauthenticated"),
            Self::WorkloadCredentialExpired => formatter.write_str("workload credential expired"),
            Self::WorkloadCredentialInactive => {
                formatter.write_str("workload credential is not active")
            }
            Self::WorkloadCredentialNotFound => {
                formatter.write_str("workload credential not found")
            }
        }
    }
}

impl Error for IdentityError {}

/// Build TEC from an Active membership only. Claim hints never enter here.
pub fn trusted_context_from_membership(
    membership: &Membership,
) -> Result<TrustedExecutionContext, IdentityError> {
    match membership.status {
        MembershipStatus::Active => Ok(TrustedExecutionContext::new(
            membership.tenant_id.clone(),
            membership.actor_id.clone(),
            membership.principal_id.clone(),
            membership.workload_id.clone(),
            membership.delegation.clone(),
            membership.clearance.clone(),
        )),
        MembershipStatus::Revoked { .. } | MembershipStatus::Left { .. } => {
            Err(IdentityError::MembershipInactive)
        }
    }
}

identity_id!(WorkloadCredentialId);
identity_id!(ExternalSignalId);
identity_id!(WorkloadSecretId);
identity_id!(DurableEventId);

/// Directory authority for programmatic workloads. Not a Membership.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkloadCredential {
    pub id: WorkloadCredentialId,
    pub tenant_id: TenantId,
    pub principal_id: PrincipalId,
    pub workload_id: WorkloadId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
    pub status: WorkloadCredentialStatus,
    pub allowed_ingress: Vec<IngressAllowance>,
    pub rate_budget: RateBudgetPolicy,
    pub expires_at: TimestampMicros,
    pub audience_class: Option<AudienceClass>,
    pub secret_id: WorkloadSecretId,
    pub created_at: TimestampMicros,
    pub rotated_at: Option<TimestampMicros>,
    pub clearance: Clearance,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkloadCredentialStatus {
    Active,
    Revoked {
        at: TimestampMicros,
        reason: WorkloadRevocationReason,
    },
    Expired {
        at: TimestampMicros,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WorkloadRevocationReason {
    Admin,
    Security,
    Rotation,
    Compromise,
}

impl WorkloadRevocationReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Security => "security",
            Self::Rotation => "rotation",
            Self::Compromise => "compromise",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "admin" => Ok(Self::Admin),
            "security" => Ok(Self::Security),
            "rotation" => Ok(Self::Rotation),
            "compromise" => Ok(Self::Compromise),
            _ => Err(IdentityError::InvalidRevocationReason),
        }
    }
}

/// Closed ingress scope. No write-mutation variant.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IngressAllowance {
    ApiEvent {
        source_class: SourceClass,
    },
    OutboundProjected {
        capability_kinds: Vec<ProjectedCapabilityKind>,
    },
    InboundServerAllow {
        server_allowlist: Vec<ServerAllowId>,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectedCapabilityKind {
    Discover,
    Query,
    Explain,
    Propose,
    CommitOrRecover,
}

impl ProjectedCapabilityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Discover => "discover",
            Self::Query => "query",
            Self::Explain => "explain",
            Self::Propose => "propose",
            Self::CommitOrRecover => "commit_or_recover",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "discover" => Ok(Self::Discover),
            "query" => Ok(Self::Query),
            "explain" => Ok(Self::Explain),
            "propose" => Ok(Self::Propose),
            "commit_or_recover" => Ok(Self::CommitOrRecover),
            _ => Err(IdentityError::Conflict(format!(
                "unknown projected capability kind: {value}"
            ))),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateBudgetPolicy {
    pub max_accepts_per_minute: u32,
    pub max_commits_per_hour: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AudienceClass(String);

impl AudienceClass {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 200 {
            return Err(IdentityError::Conflict("invalid audience class".to_owned()));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SourceClass(String);

impl SourceClass {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 200 {
            return Err(IdentityError::Conflict("invalid source class".to_owned()));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerAllowId(String);

impl ServerAllowId {
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentityError> {
        let value = value.into();
        if value.is_empty() || value.len() > 200 {
            return Err(IdentityError::Conflict(
                "invalid server allow id".to_owned(),
            ));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Authentication evidence after API-key or workload-JWT verification.
/// Never a TrustedExecutionContext.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedWorkloadEvidence {
    pub credential_lookup_key: WorkloadCredentialLookupKey,
    pub evidence_kind: WorkloadEvidenceKind,
    pub expires_at: TimestampMicros,
    pub requested_tenant_hint: Option<TenantId>,
    pub principal_hint: Option<PrincipalId>,
    pub workload_hint: Option<WorkloadId>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkloadEvidenceKind {
    ApiKey {
        key_id: WorkloadSecretId,
    },
    WorkloadJwt {
        issuer: String,
        audience: String,
        subject: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WorkloadCredentialLookupKey {
    SecretId(WorkloadSecretId),
    JwtSubject { issuer: String, subject: String },
}

/// Build TEC from an Active, non-expired WorkloadCredential only.
/// Claim / body hints never enter here.
pub fn trusted_context_from_workload_credential(
    credential: &WorkloadCredential,
    now: TimestampMicros,
) -> Result<TrustedExecutionContext, IdentityError> {
    if credential.expires_at.get() <= now.get() {
        return Err(IdentityError::WorkloadCredentialExpired);
    }
    match &credential.status {
        WorkloadCredentialStatus::Active => Ok(TrustedExecutionContext::new(
            credential.tenant_id.clone(),
            credential.actor_id.clone(),
            credential.principal_id.clone(),
            credential.workload_id.clone(),
            credential.delegation.clone(),
            credential.clearance.clone(),
        )),
        WorkloadCredentialStatus::Revoked { .. } => Err(IdentityError::WorkloadCredentialInactive),
        WorkloadCredentialStatus::Expired { .. } => Err(IdentityError::WorkloadCredentialExpired),
    }
}

#[cfg(test)]
mod tests {
    use super::{ChannelProvider, IdentityError};

    #[test]
    fn channel_provider_parses_linq() {
        assert_eq!(ChannelProvider::parse("linq"), Ok(ChannelProvider::Linq));
        assert_eq!(ChannelProvider::Linq.as_str(), "linq");
    }

    #[test]
    fn channel_provider_rejects_unknown() {
        assert_eq!(
            ChannelProvider::parse("not_a_provider"),
            Err(IdentityError::InvalidProvider)
        );
    }

    #[test]
    fn whatsapp_subject_accepts_e164_and_person_jid() {
        use super::ExternalSubject;
        ExternalSubject::new(ChannelProvider::WhatsApp, "+5511999999999").expect("e164");
        ExternalSubject::new(ChannelProvider::WhatsApp, "553199941160@s.whatsapp.net")
            .expect("jid");
        ExternalSubject::new(ChannelProvider::WhatsApp, "553199941160@c.us").expect("c.us");
    }

    #[test]
    fn whatsapp_subject_rejects_group_lid_and_short() {
        use super::ExternalSubject;
        assert_eq!(
            ExternalSubject::new(ChannelProvider::WhatsApp, "120363000000000000@g.us")
                .expect_err("group"),
            IdentityError::InvalidSubject
        );
        assert_eq!(
            ExternalSubject::new(ChannelProvider::WhatsApp, "146454777753827@lid")
                .expect_err("lid"),
            IdentityError::InvalidSubject
        );
        assert_eq!(
            ExternalSubject::new(ChannelProvider::WhatsApp, "+12").expect_err("short"),
            IdentityError::InvalidSubject
        );
    }

    #[test]
    fn whatsapp_door_fails_closed_without_env_and_on_match() {
        use super::ExternalSubject;
        let person =
            ExternalSubject::new(ChannelProvider::WhatsApp, "+5511999999999").expect("person");
        let door = ExternalSubject::new(ChannelProvider::WhatsApp, "+553798136141").expect("door");
        assert_eq!(
            person.reject_if_whatsapp_door(None),
            Err(IdentityError::InvalidSubject)
        );
        assert_eq!(
            person.reject_if_whatsapp_door(Some("   ")),
            Err(IdentityError::InvalidSubject)
        );
        assert_eq!(
            door.reject_if_whatsapp_door(Some("+553798136141")),
            Err(IdentityError::InvalidSubject)
        );
        assert_eq!(
            person.reject_if_whatsapp_door(Some("+553798136141")),
            Ok(())
        );
        let telegram = ExternalSubject::new(ChannelProvider::Telegram, "user-1").expect("telegram");
        assert_eq!(telegram.reject_if_whatsapp_door(None), Ok(()));
    }
}
