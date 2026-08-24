use std::collections::{BTreeSet, HashMap};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use connectrpc::{ConnectError, ErrorCode, RequestContext};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use zoen_adapters::PostgresIdentityStore;
use zoen_core::{
    ActionId, ActorId, BindingStatus, DelegationChain, DelegationError, DelegationGrant,
    DelegationId, ExecutionContext, IdentityError, PrincipalId, ResourceId, TenantId,
    TimestampMicros, VerifiedOidcSubject, WorkloadCredentialId, WorkloadId,
};

#[derive(Debug)]
pub enum SessionConfigError {
    Http(reqwest::Error),
    InvalidClaim(String),
    InvalidJson(serde_json::Error),
    InvalidOidc(String),
    InvalidTenant(String),
}

impl Display for SessionConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http(error) => write!(formatter, "failed to load OIDC configuration: {error}"),
            Self::InvalidClaim(message) => write!(formatter, "invalid trusted claim: {message}"),
            Self::InvalidJson(error) => write!(formatter, "invalid session configuration: {error}"),
            Self::InvalidOidc(message) => {
                write!(formatter, "invalid OIDC configuration: {message}")
            }
            Self::InvalidTenant(tenant) => {
                write!(
                    formatter,
                    "session configuration has invalid tenant: {tenant}"
                )
            }
        }
    }
}

impl Error for SessionConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Http(error) => Some(error),
            Self::InvalidJson(error) => Some(error),
            Self::InvalidClaim(_) | Self::InvalidOidc(_) | Self::InvalidTenant(_) => None,
        }
    }
}

#[derive(Clone)]
struct WorkloadExchangeBinding {
    credential_id: WorkloadCredentialId,
    context: ExecutionContext,
}

#[derive(Clone)]
pub struct SessionRegistry {
    identity: Option<PostgresIdentityStore>,
    provider: AuthProvider,
    workload_exchanges: Arc<Mutex<HashMap<String, WorkloadExchangeBinding>>>,
}

#[derive(Clone)]
enum AuthProvider {
    Legacy(Arc<HashMap<String, ExecutionContext>>),
    Oidc(Arc<OidcVerifier>),
}

struct OidcVerifier {
    audience: String,
    issuer: String,
    keys: HashMap<String, DecodingKey>,
}

enum AuthenticationError {
    InvalidClaim,
    InvalidDelegation(DelegationError),
}

impl SessionRegistry {
    pub fn from_json(value: &str) -> Result<Self, SessionConfigError> {
        let raw = serde_json::from_str::<HashMap<String, SessionTokenBinding>>(value)
            .map_err(SessionConfigError::InvalidJson)?;
        let mut contexts_by_token = HashMap::with_capacity(raw.len());
        for (token, binding) in raw {
            contexts_by_token.insert(token, session_context(binding)?);
        }
        Ok(Self {
            identity: None,
            provider: AuthProvider::Legacy(Arc::new(contexts_by_token)),
            workload_exchanges: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn with_identity(mut self, identity: PostgresIdentityStore) -> Self {
        self.identity = Some(identity);
        self
    }

    pub fn register_workload_exchange(
        &self,
        credential_id: WorkloadCredentialId,
        context: ExecutionContext,
    ) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let token = format!("wlx.{nanos:x}");
        self.workload_exchanges
            .lock()
            .expect("workload exchange lock")
            .insert(
                token.clone(),
                WorkloadExchangeBinding {
                    credential_id,
                    context,
                },
            );
        token
    }

    pub fn invalidate_workload_credential(&self, credential_id: &WorkloadCredentialId) {
        let mut guard = self
            .workload_exchanges
            .lock()
            .expect("workload exchange lock");
        guard.retain(|_, binding| &binding.credential_id != credential_id);
    }

    pub fn resolve_workload_exchange(
        &self,
        authorization: Option<&str>,
    ) -> Result<(WorkloadCredentialId, ExecutionContext), IdentityError> {
        let token = authorization
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or(IdentityError::Unauthenticated)?;
        let binding = self
            .workload_exchanges
            .lock()
            .expect("workload exchange lock")
            .get(token)
            .cloned()
            .ok_or(IdentityError::Unauthenticated)?;
        Ok((binding.credential_id, binding.context))
    }

    pub async fn from_oidc(
        issuer: impl Into<String>,
        audience: impl Into<String>,
    ) -> Result<Self, SessionConfigError> {
        let issuer = issuer.into().trim_end_matches('/').to_owned();
        let audience = audience.into();
        if issuer.is_empty() || audience.is_empty() {
            return Err(SessionConfigError::InvalidOidc(
                "issuer and audience must be nonempty".to_owned(),
            ));
        }
        let client = reqwest::Client::new();
        let discovery = client
            .get(format!("{issuer}/.well-known/openid-configuration"))
            .send()
            .await
            .map_err(SessionConfigError::Http)?
            .error_for_status()
            .map_err(SessionConfigError::Http)?
            .json::<OidcDiscovery>()
            .await
            .map_err(SessionConfigError::Http)?;
        if discovery.issuer != issuer {
            return Err(SessionConfigError::InvalidOidc(format!(
                "discovery issuer {:?} does not match configured issuer {:?}",
                discovery.issuer, issuer
            )));
        }
        let jwks = client
            .get(&discovery.jwks_uri)
            .send()
            .await
            .map_err(SessionConfigError::Http)?
            .error_for_status()
            .map_err(SessionConfigError::Http)?
            .json::<JwkSet>()
            .await
            .map_err(SessionConfigError::Http)?;
        let mut keys = HashMap::new();
        for jwk in jwks.keys {
            let Some(key_id) = jwk.common.key_id.clone() else {
                continue;
            };
            let key = DecodingKey::from_jwk(&jwk)
                .map_err(|error| SessionConfigError::InvalidOidc(error.to_string()))?;
            if keys.insert(key_id.clone(), key).is_some() {
                return Err(SessionConfigError::InvalidOidc(format!(
                    "duplicate JWK key id {key_id:?}"
                )));
            }
        }
        if keys.is_empty() {
            return Err(SessionConfigError::InvalidOidc(
                "JWKS has no keyed verification keys".to_owned(),
            ));
        }
        Ok(Self {
            identity: None,
            provider: AuthProvider::Oidc(Arc::new(OidcVerifier {
                audience,
                issuer,
                keys,
            })),
            workload_exchanges: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn bearer_token<'a>(
        &self,
        authorization: Option<&'a str>,
    ) -> Result<&'a str, AuthenticationError> {
        authorization
            .and_then(|value| value.strip_prefix("Bearer "))
            .ok_or(AuthenticationError::InvalidClaim)
    }

    pub fn verify_bearer(
        &self,
        authorization: Option<&str>,
    ) -> Result<VerifiedOidcSubject, ConnectError> {
        let token = self.bearer_token(authorization).map_err(|_| {
            ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
        })?;
        match &self.provider {
            AuthProvider::Legacy(_) => Err(ConnectError::new(
                ErrorCode::FailedPrecondition,
                "verify_bearer requires OIDC sessions",
            )),
            AuthProvider::Oidc(verifier) => {
                verifier.verify(token).map_err(map_authentication_error)
            }
        }
    }

    pub async fn trusted_context(
        &self,
        request_context: &RequestContext,
    ) -> Result<ExecutionContext, ConnectError> {
        let authorization = request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok());
        if let Ok((_, context)) = self.resolve_workload_exchange(authorization) {
            return Ok(context);
        }
        match &self.provider {
            AuthProvider::Legacy(contexts) => {
                let token = self.bearer_token(authorization).map_err(|_| {
                    ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
                })?;
                contexts.get(token).cloned().ok_or_else(|| {
                    ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
                })
            }
            AuthProvider::Oidc(verifier) => {
                let verified = verifier
                    .verify(self.bearer_token(authorization).map_err(|_| {
                        ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
                    })?)
                    .map_err(map_authentication_error)?;
                // Request tenant wins over JWT tenant_id claim. Bound Personal
                // tenants are minted at bootstrap and cannot live in IdP claims.
                let requested_tenant = match request_context
                    .header("x-zoen-tenant")
                    .and_then(|value| value.to_str().ok())
                {
                    Some(raw) => Some(
                        TenantId::parse(raw).map_err(|error| {
                            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
                        })?,
                    ),
                    None => None,
                };
                self.resolve_verified(verified, requested_tenant.as_ref())
                    .await
            }
        }
    }

    pub async fn execution_context(
        &self,
        request_context: &RequestContext,
        claimed_tenant: &str,
    ) -> Result<ExecutionContext, ConnectError> {
        let claimed_tenant = TenantId::parse(claimed_tenant)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let authorization = request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok());
        let context = if let Ok((_, context)) = self.resolve_workload_exchange(authorization) {
            context
        } else {
            match &self.provider {
                AuthProvider::Legacy(contexts) => {
                    let token = self.bearer_token(authorization).map_err(|_| {
                        ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
                    })?;
                    contexts.get(token).cloned().ok_or_else(|| {
                        ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
                    })?
                }
                AuthProvider::Oidc(verifier) => {
                    let verified = verifier
                        .verify(self.bearer_token(authorization).map_err(|_| {
                            ConnectError::new(
                                ErrorCode::Unauthenticated,
                                "invalid OIDC bearer token",
                            )
                        })?)
                        .map_err(map_authentication_error)?;
                    self.resolve_verified(verified, Some(&claimed_tenant))
                        .await?
                }
            }
        };
        if context.tenant_id() != &claimed_tenant {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "payload tenant does not match the trusted session",
            ));
        }
        Ok(context)
    }

    async fn resolve_verified(
        &self,
        verified: VerifiedOidcSubject,
        tenant: Option<&TenantId>,
    ) -> Result<ExecutionContext, ConnectError> {
        let Some(identity) = &self.identity else {
            return unbound_context(verified);
        };
        let binding = identity
            .binding_for_oidc_sub(&verified.subject)
            .await
            .map_err(map_identity_error)?;
        match binding {
            Some(binding) if matches!(binding.status, BindingStatus::Verified) => {
                let tenant = tenant
                    .or(verified.requested_tenant_hint.as_ref())
                    .ok_or_else(|| {
                        ConnectError::new(
                            ErrorCode::PermissionDenied,
                            "bound subject requires a tenant membership hint",
                        )
                    })?;
                identity
                    .resolve_for_tenant(&verified, tenant)
                    .await
                    .map_err(map_identity_error)
            }
            _ => unbound_context(verified),
        }
    }
}

fn unbound_context(verified: VerifiedOidcSubject) -> Result<ExecutionContext, ConnectError> {
    verified
        .into_unbound_execution_context()
        .map_err(map_identity_error)
}

fn map_authentication_error(error: AuthenticationError) -> ConnectError {
    match error {
        AuthenticationError::InvalidClaim => {
            ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
        }
        AuthenticationError::InvalidDelegation(error) => {
            ConnectError::new(ErrorCode::PermissionDenied, error.to_string())
        }
    }
}

fn map_identity_error(error: IdentityError) -> ConnectError {
    match error {
        IdentityError::Unauthenticated | IdentityError::SubjectUnbound => {
            ConnectError::new(ErrorCode::Unauthenticated, error.to_string())
        }
        IdentityError::MembershipNotFound
        | IdentityError::MembershipInactive
        | IdentityError::AccountMerged { .. }
        | IdentityError::InviteTenantMismatch => {
            ConnectError::new(ErrorCode::PermissionDenied, error.to_string())
        }
        other => ConnectError::new(ErrorCode::Internal, other.to_string()),
    }
}

impl OidcVerifier {
    fn verify(&self, token: &str) -> Result<VerifiedOidcSubject, AuthenticationError> {
        let header = decode_header(token).map_err(|_| AuthenticationError::InvalidClaim)?;
        if header.alg != Algorithm::RS256 {
            return Err(AuthenticationError::InvalidClaim);
        }
        let key_id = header.kid.ok_or(AuthenticationError::InvalidClaim)?;
        let key = self
            .keys
            .get(&key_id)
            .ok_or(AuthenticationError::InvalidClaim)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.leeway = 0;
        validation.validate_nbf = true;
        validation.set_audience(&[&self.audience]);
        validation.set_issuer(&[&self.issuer]);
        validation.set_required_spec_claims(&["aud", "exp", "iss", "sub"]);
        let token_data = decode::<OidcClaims>(token, key, &validation)
            .map_err(|_| AuthenticationError::InvalidClaim)?;
        let claims = token_data.claims;
        let delegation_claims = serde_json::from_str::<Vec<DelegationClaim>>(&claims.delegation)
            .map_err(|_| AuthenticationError::InvalidClaim)?;
        let grants = delegation_claims
            .into_iter()
            .map(parse_delegation_claim)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(VerifiedOidcSubject {
            issuer: self.issuer.clone(),
            audience: self.audience.clone(),
            subject: claims.sub,
            actor_id: Some(
                ActorId::parse(claims.actor_id).map_err(|_| AuthenticationError::InvalidClaim)?,
            ),
            expires_at: seconds_to_micros(claims.exp)?,
            requested_tenant_hint: Some(
                TenantId::parse(claims.tenant_id).map_err(|_| AuthenticationError::InvalidClaim)?,
            ),
            principal_hint: Some(
                PrincipalId::parse(claims.principal_id)
                    .map_err(|_| AuthenticationError::InvalidClaim)?,
            ),
            workload_hint: Some(
                WorkloadId::parse(claims.workload_id)
                    .map_err(|_| AuthenticationError::InvalidClaim)?,
            ),
            delegation_hint: Some(
                DelegationChain::new(grants).map_err(AuthenticationError::InvalidDelegation)?,
            ),
        })
    }
}

fn parse_delegation_claim(claim: DelegationClaim) -> Result<DelegationGrant, AuthenticationError> {
    DelegationGrant::new(
        DelegationId::parse(claim.delegation_id).map_err(|_| AuthenticationError::InvalidClaim)?,
        parse_ids(claim.action_ids, ActionId::parse)?,
        parse_ids(claim.resource_ids, ResourceId::parse)?,
        parse_ids(claim.workload_ids, WorkloadId::parse)?,
        seconds_to_micros(claim.not_before)?,
        seconds_to_micros(claim.expires_at)?,
    )
    .map_err(AuthenticationError::InvalidDelegation)
}

fn parse_ids<T, E>(
    values: Vec<String>,
    parse: impl Fn(String) -> Result<T, E>,
) -> Result<BTreeSet<T>, AuthenticationError>
where
    T: Ord,
    E: Display,
{
    values
        .into_iter()
        .map(|value| parse(value).map_err(|_| AuthenticationError::InvalidClaim))
        .collect()
}

fn seconds_to_micros(value: i64) -> Result<TimestampMicros, AuthenticationError> {
    value
        .checked_mul(1_000_000)
        .map(TimestampMicros::new)
        .ok_or(AuthenticationError::InvalidClaim)
}

fn session_context(binding: SessionTokenBinding) -> Result<ExecutionContext, SessionConfigError> {
    match binding {
        SessionTokenBinding::Tenant(tenant) => execution_context(
            parse_tenant(&tenant)?,
            parse_session_ids(vec!["action.legacy".to_owned()], ActionId::parse)?,
            parse_session_ids(vec!["resource.legacy".to_owned()], ResourceId::parse)?,
        ),
        SessionTokenBinding::Delegated(binding) => execution_context(
            parse_tenant(&binding.tenant_id)?,
            parse_session_ids(binding.action_ids, ActionId::parse)?,
            parse_session_ids(binding.resource_ids, ResourceId::parse)?,
        ),
    }
}

fn execution_context(
    tenant_id: TenantId,
    actions: BTreeSet<ActionId>,
    resources: BTreeSet<ResourceId>,
) -> Result<ExecutionContext, SessionConfigError> {
    let workload_id = WorkloadId::parse("workload.legacy").map_err(invalid_claim)?;
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.legacy").map_err(invalid_claim)?,
        actions,
        resources,
        BTreeSet::from([workload_id.clone()]),
        TimestampMicros::new(i64::MIN),
        TimestampMicros::new(i64::MAX),
    )
    .map_err(invalid_claim)?;
    Ok(ExecutionContext::new(
        tenant_id,
        ActorId::parse("actor.legacy").map_err(invalid_claim)?,
        PrincipalId::parse("principal.legacy").map_err(invalid_claim)?,
        workload_id,
        DelegationChain::new(vec![grant]).map_err(invalid_claim)?,
    ))
}

fn parse_tenant(tenant: &str) -> Result<TenantId, SessionConfigError> {
    TenantId::parse(tenant).map_err(|_| SessionConfigError::InvalidTenant(tenant.to_owned()))
}

fn parse_session_ids<T, E>(
    values: Vec<String>,
    parse: impl Fn(String) -> Result<T, E>,
) -> Result<BTreeSet<T>, SessionConfigError>
where
    T: Ord,
    E: Display,
{
    values
        .into_iter()
        .map(|value| parse(value).map_err(invalid_claim))
        .collect()
}

fn invalid_claim(error: impl Display) -> SessionConfigError {
    SessionConfigError::InvalidClaim(error.to_string())
}

#[derive(Deserialize)]
struct OidcDiscovery {
    issuer: String,
    jwks_uri: String,
}

#[derive(Deserialize)]
struct OidcClaims {
    actor_id: String,
    #[serde(rename = "zoen_delegation")]
    delegation: String,
    exp: i64,
    principal_id: String,
    sub: String,
    tenant_id: String,
    workload_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DelegationClaim {
    action_ids: Vec<String>,
    delegation_id: String,
    expires_at: i64,
    not_before: i64,
    resource_ids: Vec<String>,
    workload_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum SessionTokenBinding {
    Tenant(String),
    Delegated(DelegatedSessionBinding),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DelegatedSessionBinding {
    action_ids: Vec<String>,
    resource_ids: Vec<String>,
    tenant_id: String,
}

#[cfg(test)]
mod tests {
    use super::SessionRegistry;

    #[test]
    fn session_json_accepts_a_tenant_string() {
        SessionRegistry::from_json(r#"{"tok":"tenant.a"}"#).expect("legacy session");
    }

    #[test]
    fn session_json_accepts_an_explicit_delegation() {
        SessionRegistry::from_json(
            r#"{
              "tok": {
                "actionIds": ["action.legacy", "zoen.definition.activate"],
                "resourceIds": ["resource.legacy", "world.definition"],
                "tenantId": "tenant.a"
              }
            }"#,
        )
        .expect("delegated session");
    }

    #[test]
    fn session_json_rejects_an_empty_delegation_scope() {
        assert!(
            SessionRegistry::from_json(
                r#"{
                  "tok": {
                    "actionIds": [],
                    "resourceIds": ["resource.legacy"],
                    "tenantId": "tenant.a"
                  }
                }"#,
            )
            .is_err()
        );
    }
}
