use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
    time::{SystemTime, UNIX_EPOCH},
};

use connectrpc::{ConnectError, ErrorCode, RequestContext};
use zoen_adapters::{PostgresIdentityStore, PostgresWorkloadCredentialStore, SessionDoor};
use zoen_core::{
    ChannelProvider, ExternalSubject, IdentityError, MachineToken, Membership, OpaqueSessionToken,
    SessionCredential, TenantId, TimestampMicros, TrustedExecutionContext, VerifiedSessionEvidence,
    WorkloadCredentialId, WorkloadExchangeToken, trusted_context_from_workload_credential,
};

#[derive(Clone)]
pub struct SessionExchange {
    credentials: PostgresWorkloadCredentialStore,
    directory: PostgresIdentityStore,
    door: SessionDoor,
    machine: Option<MachineToken>,
    workload_exchanges: Arc<Mutex<HashMap<String, WorkloadCredentialId>>>,
}

impl SessionExchange {
    /// Build a session exchange over an already-connected door.
    #[must_use]
    pub fn from_door(
        door: SessionDoor,
        directory: PostgresIdentityStore,
        credentials: PostgresWorkloadCredentialStore,
        machine: Option<MachineToken>,
    ) -> Self {
        Self {
            credentials,
            directory,
            door,
            machine,
            workload_exchanges: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[must_use]
    pub fn bearer_from(request_context: &RequestContext) -> Option<&str> {
        request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok())
    }

    /// Read an optional tenant id from `x-zoen-tenant`.
    ///
    /// # Errors
    ///
    /// Returns an invalid-argument Connect error when the header is present but
    /// not a valid tenant id.
    pub fn tenant_from_header(
        request_context: &RequestContext,
    ) -> Result<Option<TenantId>, ConnectError> {
        match request_context
            .header("x-zoen-tenant")
            .and_then(|value| value.to_str().ok())
        {
            Some(raw) => Ok(Some(TenantId::parse(raw).map_err(|error| {
                ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
            })?)),
            None => Ok(None),
        }
    }

    #[must_use]
    pub fn register_workload_exchange(
        &self,
        credential_id: WorkloadCredentialId,
        _context: TrustedExecutionContext,
    ) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let token = format!("wlx.{nanos:x}");
        self.workload_map().insert(token.clone(), credential_id);
        token
    }

    pub fn invalidate_workload_credential(&self, credential_id: &WorkloadCredentialId) {
        self.workload_map()
            .retain(|_, stored| stored != credential_id);
    }

    /// Verify a Better Auth door session. Workload and channel credentials fail
    /// closed.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError::Unauthenticated`] when the credential is missing
    /// or is not a door session, or when door verification fails.
    pub async fn verify_door(
        &self,
        authorization: Option<&str>,
    ) -> Result<VerifiedSessionEvidence, IdentityError> {
        let credential = SessionCredential::from_authorization(authorization)?;
        match credential {
            SessionCredential::Door(token) => self.door.verify(&token).await,
            SessionCredential::Workload(_) | SessionCredential::Channel { .. } => {
                Err(IdentityError::Unauthenticated)
            }
        }
    }

    /// Resolve a trusted execution context from a door, workload, or channel
    /// credential.
    ///
    /// # Errors
    ///
    /// Returns a Connect error when the session cannot be authenticated or the
    /// membership cannot be resolved.
    pub async fn resolve(
        &self,
        authorization: Option<&str>,
        tenant_hint: Option<&TenantId>,
    ) -> Result<TrustedExecutionContext, ConnectError> {
        let credential =
            SessionCredential::from_authorization(authorization).map_err(map_identity_error)?;
        self.resolve_credential(credential, tenant_hint)
            .await
            .map_err(map_identity_error)
    }

    /// Resolve the door membership for the caller.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError`] when the credential is not a door session or
    /// the membership cannot be resolved.
    pub async fn resolve_membership(
        &self,
        authorization: Option<&str>,
        tenant_hint: Option<&TenantId>,
    ) -> Result<(Membership, TrustedExecutionContext), IdentityError> {
        let credential = SessionCredential::from_authorization(authorization)?;
        match credential {
            SessionCredential::Door(token) => self.membership_for_door(&token, tenant_hint).await,
            SessionCredential::Workload(_) | SessionCredential::Channel { .. } => {
                Err(IdentityError::Unauthenticated)
            }
        }
    }

    async fn resolve_credential(
        &self,
        credential: SessionCredential,
        tenant_hint: Option<&TenantId>,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        match credential {
            SessionCredential::Door(token) => {
                let (_, context) = self.membership_for_door(&token, tenant_hint).await?;
                Ok(context)
            }
            SessionCredential::Workload(token) => self.resolve_workload(&token).await,
            SessionCredential::Channel { machine, subject } => {
                self.resolve_channel(machine, subject, tenant_hint).await
            }
        }
    }

    async fn membership_for_door(
        &self,
        token: &OpaqueSessionToken,
        tenant_hint: Option<&TenantId>,
    ) -> Result<(Membership, TrustedExecutionContext), IdentityError> {
        let evidence = self.door.verify(token).await?;
        let subject = ExternalSubject::new(ChannelProvider::AuthDoor, evidence.door_user_key)?;
        let tenant = tenant_hint.ok_or(IdentityError::MembershipNotFound)?;
        self.directory.resolve_for_subject(&subject, tenant).await
    }

    /// Resolve a live workload exchange token to its credential and context.
    ///
    /// # Errors
    ///
    /// Returns [`IdentityError::Unauthenticated`] when the token is not a live
    /// workload exchange, or when the credential cannot be loaded.
    pub async fn resolve_workload_exchange(
        &self,
        authorization: Option<&str>,
    ) -> Result<(WorkloadCredentialId, TrustedExecutionContext), IdentityError> {
        let credential = SessionCredential::from_authorization(authorization)?;
        match credential {
            SessionCredential::Workload(token) => {
                let context = self.resolve_workload(&token).await?;
                let credential_id = self
                    .workload_map()
                    .get(token.as_str())
                    .cloned()
                    .ok_or(IdentityError::Unauthenticated)?;
                Ok((credential_id, context))
            }
            SessionCredential::Door(_) | SessionCredential::Channel { .. } => {
                Err(IdentityError::Unauthenticated)
            }
        }
    }

    async fn resolve_workload(
        &self,
        token: &WorkloadExchangeToken,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        let credential_id = self
            .workload_map()
            .get(token.as_str())
            .cloned()
            .ok_or(IdentityError::Unauthenticated)?;
        let credential = self.credentials.get(&credential_id).await?;
        trusted_context_from_workload_credential(&credential, now_micros())
    }

    fn workload_map(&self) -> MutexGuard<'_, HashMap<String, WorkloadCredentialId>> {
        self.workload_exchanges
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    async fn resolve_channel(
        &self,
        machine: MachineToken,
        subject: ExternalSubject,
        tenant_hint: Option<&TenantId>,
    ) -> Result<TrustedExecutionContext, IdentityError> {
        let expected = self
            .machine
            .as_ref()
            .ok_or(IdentityError::Unauthenticated)?;
        if !constant_time_eq(expected.as_str().as_bytes(), machine.as_str().as_bytes()) {
            return Err(IdentityError::Unauthenticated);
        }
        let tenant = tenant_hint.ok_or(IdentityError::MembershipNotFound)?;
        Ok(self
            .directory
            .resolve_for_subject(&subject, tenant)
            .await?
            .1)
    }
}

fn now_micros() -> TimestampMicros {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_micros()).ok())
        .unwrap_or(0);
    TimestampMicros::new(micros)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[must_use]
pub fn map_identity_error(error: IdentityError) -> ConnectError {
    match error {
        IdentityError::Unauthenticated | IdentityError::InvalidSessionToken => {
            ConnectError::new(ErrorCode::Unauthenticated, error.to_string())
        }
        IdentityError::SubjectUnbound
        | IdentityError::MembershipNotFound
        | IdentityError::MembershipInactive
        | IdentityError::AccountMerged { .. }
        | IdentityError::InviteTenantMismatch => {
            ConnectError::new(ErrorCode::PermissionDenied, error.to_string())
        }
        other => ConnectError::new(ErrorCode::Internal, other.to_string()),
    }
}
