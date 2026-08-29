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

use crate::config::OidcSource;

#[derive(Debug)]
pub enum SessionConfigError {
    Http(reqwest::Error),
    InvalidOidc(String),
}

impl Display for SessionConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Http(error) => write!(formatter, "failed to load OIDC configuration: {error}"),
            Self::InvalidOidc(message) => {
                write!(formatter, "invalid OIDC configuration: {message}")
            }
        }
    }
}

impl Error for SessionConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Http(error) => Some(error),
            Self::InvalidOidc(_) => None,
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
    identity: PostgresIdentityStore,
    verifier: Arc<OidcVerifier>,
    workload_exchanges: Arc<Mutex<HashMap<String, WorkloadExchangeBinding>>>,
}

struct OidcVerifier {
    audience: String,
    issuers: Vec<String>,
    keys: HashMap<String, DecodingKey>,
}

enum AuthenticationError {
    InvalidClaim,
    InvalidDelegation(DelegationError),
}

impl SessionRegistry {
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
        sources: impl IntoIterator<Item = OidcSource>,
        audience: impl Into<String>,
        identity: PostgresIdentityStore,
    ) -> Result<Self, SessionConfigError> {
        let audience = audience.into();
        if audience.is_empty() {
            return Err(SessionConfigError::InvalidOidc(
                "audience must be nonempty".to_owned(),
            ));
        }
        let client = reqwest::Client::new();
        let mut issuers = Vec::new();
        let mut keys = HashMap::new();
        for source in sources {
            let (issuer, source_keys) = load_oidc_keys(&client, source).await?;
            if issuers.iter().any(|existing| existing == &issuer) {
                return Err(SessionConfigError::InvalidOidc(format!(
                    "duplicate OIDC issuer {issuer:?}"
                )));
            }
            for (key_id, key) in source_keys {
                if keys.insert(key_id.clone(), key).is_some() {
                    return Err(SessionConfigError::InvalidOidc(format!(
                        "duplicate JWK key id {key_id:?}"
                    )));
                }
            }
            issuers.push(issuer);
        }
        if issuers.is_empty() {
            return Err(SessionConfigError::InvalidOidc(
                "at least one OIDC source is required".to_owned(),
            ));
        }
        if keys.is_empty() {
            return Err(SessionConfigError::InvalidOidc(
                "JWKS has no keyed verification keys".to_owned(),
            ));
        }
        Ok(Self {
            identity,
            verifier: Arc::new(OidcVerifier {
                audience,
                issuers,
                keys,
            }),
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
        self.verifier
            .verify(token)
            .map_err(map_authentication_error)
    }

    pub async fn resolve(
        &self,
        authorization: Option<&str>,
        claimed_tenant: Option<&TenantId>,
    ) -> Result<ExecutionContext, ConnectError> {
        if let Ok((_, context)) = self.resolve_workload_exchange(authorization) {
            return Ok(context);
        }
        let verified = self
            .verifier
            .verify(self.bearer_token(authorization).map_err(|_| {
                ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
            })?)
            .map_err(map_authentication_error)?;
        self.resolve_verified(verified, claimed_tenant).await
    }

    async fn resolve_verified(
        &self,
        verified: VerifiedOidcSubject,
        tenant: Option<&TenantId>,
    ) -> Result<ExecutionContext, ConnectError> {
        let binding = self
            .identity
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
                self.identity
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
        validation.set_issuer(&self.issuers);
        validation.set_required_spec_claims(&["aud", "exp", "iss", "sub"]);
        let token_data = decode::<OidcClaims>(token, key, &validation)
            .map_err(|_| AuthenticationError::InvalidClaim)?;
        let claims = token_data.claims;
        let actor_id = match claims.actor_id {
            Some(raw) => Some(ActorId::parse(raw).map_err(|_| AuthenticationError::InvalidClaim)?),
            None => None,
        };
        let requested_tenant_hint = match claims.tenant_id {
            Some(raw) => Some(TenantId::parse(raw).map_err(|_| AuthenticationError::InvalidClaim)?),
            None => None,
        };
        let principal_hint = match claims.principal_id {
            Some(raw) => {
                Some(PrincipalId::parse(raw).map_err(|_| AuthenticationError::InvalidClaim)?)
            }
            None => None,
        };
        let workload_hint = match claims.workload_id {
            Some(raw) => {
                Some(WorkloadId::parse(raw).map_err(|_| AuthenticationError::InvalidClaim)?)
            }
            None => None,
        };
        let delegation_hint = match claims.delegation {
            Some(raw) => {
                let delegation_claims = serde_json::from_str::<Vec<DelegationClaim>>(&raw)
                    .map_err(|_| AuthenticationError::InvalidClaim)?;
                let grants = delegation_claims
                    .into_iter()
                    .map(parse_delegation_claim)
                    .collect::<Result<Vec<_>, _>>()?;
                Some(DelegationChain::new(grants).map_err(AuthenticationError::InvalidDelegation)?)
            }
            None => None,
        };
        Ok(VerifiedOidcSubject {
            issuer: claims.iss,
            audience: self.audience.clone(),
            subject: claims.sub,
            actor_id,
            expires_at: seconds_to_micros(claims.exp)?,
            requested_tenant_hint,
            principal_hint,
            workload_hint,
            delegation_hint,
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

async fn load_oidc_keys(
    client: &reqwest::Client,
    source: OidcSource,
) -> Result<(String, HashMap<String, DecodingKey>), SessionConfigError> {
    let issuer = source.issuer.trim_end_matches('/').to_owned();
    let discovery_url = source.discovery_url.trim_end_matches('/').to_owned();
    if issuer.is_empty() || discovery_url.is_empty() {
        return Err(SessionConfigError::InvalidOidc(
            "issuer and discovery URL must be nonempty".to_owned(),
        ));
    }
    let discovery = client
        .get(format!("{discovery_url}/.well-known/openid-configuration"))
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
    let jwks_url = jwks_fetch_url(&discovery.jwks_uri, &discovery_url)?;
    let jwks = client
        .get(&jwks_url)
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
    Ok((issuer, keys))
}

fn jwks_fetch_url(jwks_uri: &str, discovery_url: &str) -> Result<String, SessionConfigError> {
    let mut fetch = reqwest::Url::parse(jwks_uri).map_err(|error| {
        SessionConfigError::InvalidOidc(format!("jwks_uri is not a URL: {error}"))
    })?;
    let discovery = reqwest::Url::parse(discovery_url).map_err(|error| {
        SessionConfigError::InvalidOidc(format!("discovery URL is not a URL: {error}"))
    })?;
    fetch
        .set_scheme(discovery.scheme())
        .map_err(|()| SessionConfigError::InvalidOidc("jwks rewrite scheme failed".to_owned()))?;
    fetch
        .set_host(discovery.host_str())
        .map_err(|error| SessionConfigError::InvalidOidc(format!("jwks rewrite host: {error}")))?;
    fetch
        .set_port(discovery.port())
        .map_err(|()| SessionConfigError::InvalidOidc("jwks rewrite port failed".to_owned()))?;
    Ok(fetch.to_string())
}

#[derive(Deserialize)]
struct OidcDiscovery {
    issuer: String,
    jwks_uri: String,
}

#[derive(Deserialize)]
struct OidcClaims {
    actor_id: Option<String>,
    #[serde(rename = "zoen_delegation")]
    delegation: Option<String>,
    exp: i64,
    iss: String,
    principal_id: Option<String>,
    sub: String,
    tenant_id: Option<String>,
    workload_id: Option<String>,
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

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use connectrpc::ErrorCode;
    use sqlx::postgres::PgPoolOptions;
    use zoen_adapters::PostgresIdentityStore;
    use zoen_core::TenantId;

    use super::{OidcVerifier, SessionRegistry};

    fn registry_with_identity() -> SessionRegistry {
        let pool = PgPoolOptions::new()
            .connect_lazy("postgres://127.0.0.1/zoen_session_registry_test")
            .expect("lazy identity pool");
        SessionRegistry {
            identity: PostgresIdentityStore::new(pool),
            verifier: Arc::new(OidcVerifier {
                audience: "zoend".to_owned(),
                issuers: vec!["https://issuer.test/realms/zoen".to_owned()],
                keys: HashMap::new(),
            }),
            workload_exchanges: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[tokio::test]
    async fn session_registry_requires_identity_store() {
        let _registry = registry_with_identity();
    }

    #[tokio::test]
    async fn resolve_rejects_missing_bearer() {
        let registry = registry_with_identity();
        let error = registry
            .resolve(None, None)
            .await
            .expect_err("missing bearer");
        assert_eq!(error.code, ErrorCode::Unauthenticated);
    }

    #[tokio::test]
    async fn resolve_accepts_optional_tenant_claim() {
        let registry = registry_with_identity();
        let tenant = TenantId::parse("tenant.a").expect("tenant");
        let error = registry
            .resolve(Some("Bearer not-a-jwt"), Some(&tenant))
            .await
            .expect_err("invalid bearer");
        assert_eq!(error.code, ErrorCode::Unauthenticated);
    }
}
