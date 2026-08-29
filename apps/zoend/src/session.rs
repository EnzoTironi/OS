use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use connectrpc::{ConnectError, ErrorCode, RequestContext};
use zoen_adapters::{PostgresIdentityStore, PostgresWorkloadCredentialStore, SessionDoor};
use zoen_core::{
    ChannelProvider, ExternalSubject, IdentityError, MachineToken, Membership, OpaqueSessionToken,
    SessionCredential, TenantId, TimestampMicros, TrustedExecutionContext, VerifiedSessionEvidence,
    WorkloadCredentialId, WorkloadExchangeToken, trusted_context_from_workload_credential,
};

#[derive(Debug)]
pub enum SessionConfigError {
    Invalid(String),
}

impl Display for SessionConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => write!(formatter, "invalid session door: {message}"),
        }
    }
}

impl Error for SessionConfigError {}

#[derive(Clone)]
pub struct SessionExchange {
    credentials: PostgresWorkloadCredentialStore,
    directory: PostgresIdentityStore,
    door: SessionDoor,
    machine: Option<MachineToken>,
    workload_exchanges: Arc<Mutex<HashMap<String, WorkloadCredentialId>>>,
}

impl SessionExchange {
    pub fn from_door(
        door: SessionDoor,
        directory: PostgresIdentityStore,
        credentials: PostgresWorkloadCredentialStore,
        machine: Option<MachineToken>,
    ) -> Result<Self, SessionConfigError> {
        Ok(Self {
            credentials,
            directory,
            door,
            machine,
            workload_exchanges: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn bearer_from(request_context: &RequestContext) -> Option<&str> {
        request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok())
    }

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
        self.workload_exchanges
            .lock()
            .expect("workload exchange lock")
            .insert(token.clone(), credential_id);
        token
    }

    pub fn invalidate_workload_credential(&self, credential_id: &WorkloadCredentialId) {
        let mut guard = self
            .workload_exchanges
            .lock()
            .expect("workload exchange lock");
        guard.retain(|_, stored| stored != credential_id);
    }

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

    pub async fn resolve_workload_exchange(
        &self,
        authorization: Option<&str>,
    ) -> Result<(WorkloadCredentialId, TrustedExecutionContext), IdentityError> {
        let credential = SessionCredential::from_authorization(authorization)?;
        match credential {
            SessionCredential::Workload(token) => {
                let context = self.resolve_workload(&token).await?;
                let credential_id = self
                    .workload_exchanges
                    .lock()
                    .expect("workload exchange lock")
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
            .workload_exchanges
            .lock()
            .expect("workload exchange lock")
            .get(token.as_str())
            .cloned()
            .ok_or(IdentityError::Unauthenticated)?;
        let credential = self.credentials.get(&credential_id).await?;
        trusted_context_from_workload_credential(&credential, now_micros())
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
        .map(|duration| duration.as_micros() as i64)
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
