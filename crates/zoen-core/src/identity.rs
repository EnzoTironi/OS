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

/// Cross-channel logical person. Never equal to phone/email/OIDC sub.
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
    MergedInto { survivor: ZoenAccountId },
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
        Ok(Self {
            provider,
            subject_key,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ChannelProvider {
    WebOidc,
    WhatsApp,
    Telegram,
}

impl ChannelProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::WebOidc => "web_oidc",
            Self::WhatsApp => "whatsapp",
            Self::Telegram => "telegram",
        }
    }

    pub fn parse(value: &str) -> Result<Self, IdentityError> {
        match value {
            "web_oidc" => Ok(Self::WebOidc),
            "whatsapp" => Ok(Self::WhatsApp),
            "telegram" => Ok(Self::Telegram),
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
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MembershipKind {
    Personal,
    Invite { invite_id: InviteId },
    EnterpriseOidc { idp_issuer: String, idp_subject: String },
}

/// Authentication evidence after JWT validation. Not a TrustedExecutionContext.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedOidcSubject {
    pub issuer: String,
    pub audience: String,
    pub subject: String,
    pub actor_id: Option<ActorId>,
    pub expires_at: TimestampMicros,
    /// Hint only. Authoritative tenant comes from Membership + request.
    pub requested_tenant_hint: Option<TenantId>,
    pub principal_hint: Option<PrincipalId>,
    pub workload_hint: Option<WorkloadId>,
    pub delegation_hint: Option<DelegationChain>,
}

impl VerifiedOidcSubject {
    /// Bound subjects must resolve through Membership. This constructor only
    /// exists so callers cannot smuggle claims into a TrustedExecutionContext
    /// without an Active membership on the directory path.
    pub fn into_unbound_execution_context(
        self,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        let tenant_id = self
            .requested_tenant_hint
            .ok_or(IdentityError::MissingClaimTenant)?;
        let principal_id = self
            .principal_hint
            .ok_or(IdentityError::MissingClaimPrincipal)?;
        let workload_id = self
            .workload_hint
            .ok_or(IdentityError::MissingClaimWorkload)?;
        let actor_id = self.actor_id.ok_or(IdentityError::MissingClaimActor)?;
        let delegation = self
            .delegation_hint
            .ok_or(IdentityError::MissingClaimDelegation)?;
        Ok(TrustedExecutionContext::new(
            tenant_id,
            actor_id,
            principal_id,
            workload_id,
            delegation,
        ))
    }
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BindingProof {
    /// Harness / ops verified the channel subject out of band.
    HarnessVerified,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnterpriseAssertion {
    pub idp_issuer: String,
    pub idp_subject: String,
    pub tenant_id: TenantId,
    pub principal_id: PrincipalId,
    pub workload_id: WorkloadId,
    pub actor_id: ActorId,
    pub delegation: DelegationChain,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum IdentityError {
    AccountMerged { survivor: ZoenAccountId },
    AccountNotFound,
    AlreadyBound,
    AlreadyConsumed,
    BindingNotFound,
    Conflict(String),
    InvalidInviteToken,
    InvalidProvider,
    InvalidRevocationReason,
    InvalidSubject,
    InvalidUnbindReason,
    InviteExpired,
    InviteNotFound,
    InviteTenantMismatch,
    MembershipInactive,
    MembershipNotFound,
    MissingClaimActor,
    MissingClaimDelegation,
    MissingClaimPrincipal,
    MissingClaimTenant,
    MissingClaimWorkload,
    PersonalExists,
    SubjectUnbound,
    Unavailable(String),
    Unauthenticated,
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
            Self::InvalidInviteToken => formatter.write_str("invalid invite token"),
            Self::InvalidProvider => formatter.write_str("invalid channel provider"),
            Self::InvalidRevocationReason => formatter.write_str("invalid revocation reason"),
            Self::InvalidSubject => formatter.write_str("invalid external subject"),
            Self::InvalidUnbindReason => formatter.write_str("invalid unbind reason"),
            Self::InviteExpired => formatter.write_str("invite expired"),
            Self::InviteNotFound => formatter.write_str("invite not found"),
            Self::InviteTenantMismatch => {
                formatter.write_str("invite cannot retarget another tenant")
            }
            Self::MembershipInactive => formatter.write_str("membership is not active"),
            Self::MembershipNotFound => formatter.write_str("membership not found"),
            Self::MissingClaimActor => formatter.write_str("OIDC token missing actor_id claim"),
            Self::MissingClaimDelegation => {
                formatter.write_str("OIDC token missing zoen_delegation claim")
            }
            Self::MissingClaimPrincipal => {
                formatter.write_str("OIDC token missing principal_id claim")
            }
            Self::MissingClaimTenant => formatter.write_str("OIDC token missing tenant_id claim"),
            Self::MissingClaimWorkload => {
                formatter.write_str("OIDC token missing workload_id claim")
            }
            Self::PersonalExists => formatter.write_str("personal workspace already exists"),
            Self::SubjectUnbound => formatter.write_str("OIDC subject has no verified binding"),
            Self::Unavailable(message) => write!(formatter, "identity store unavailable: {message}"),
            Self::Unauthenticated => formatter.write_str("unauthenticated"),
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
        )),
        MembershipStatus::Revoked { .. } | MembershipStatus::Left { .. } => {
            Err(IdentityError::MembershipInactive)
        }
    }
}
