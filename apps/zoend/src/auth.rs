use std::collections::{BTreeSet, HashMap};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::Arc;

use connectrpc::{ConnectError, ErrorCode, RequestContext};
use jsonwebtoken::jwk::JwkSet;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use zoen_core::{
    ActionId, ActorId, DelegationChain, DelegationGrant, DelegationId, ExecutionContext,
    PrincipalId, ResourceId, TenantId, TimestampMicros, WorkloadId,
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
pub struct SessionRegistry {
    provider: AuthProvider,
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

impl SessionRegistry {
    pub fn from_json(value: &str) -> Result<Self, SessionConfigError> {
        let raw = serde_json::from_str::<HashMap<String, String>>(value)
            .map_err(SessionConfigError::InvalidJson)?;
        let mut contexts_by_token = HashMap::with_capacity(raw.len());
        for (token, tenant) in raw {
            let tenant_id =
                TenantId::parse(&tenant).map_err(|_| SessionConfigError::InvalidTenant(tenant))?;
            contexts_by_token.insert(token, legacy_context(tenant_id)?);
        }
        Ok(Self {
            provider: AuthProvider::Legacy(Arc::new(contexts_by_token)),
        })
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
            provider: AuthProvider::Oidc(Arc::new(OidcVerifier {
                audience,
                issuer,
                keys,
            })),
        })
    }

    pub fn authenticate(&self, authorization: Option<&str>) -> Option<ExecutionContext> {
        let token = authorization?.strip_prefix("Bearer ")?;
        match &self.provider {
            AuthProvider::Legacy(contexts) => contexts.get(token).cloned(),
            AuthProvider::Oidc(verifier) => verifier.authenticate(token).ok(),
        }
    }

    pub fn trusted_context(
        &self,
        request_context: &RequestContext,
    ) -> Result<ExecutionContext, ConnectError> {
        let authorization = request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok());
        self.authenticate(authorization).ok_or_else(|| {
            ConnectError::new(ErrorCode::Unauthenticated, "invalid OIDC bearer token")
        })
    }

    pub fn execution_context(
        &self,
        request_context: &RequestContext,
        claimed_tenant: &str,
    ) -> Result<ExecutionContext, ConnectError> {
        let context = self.trusted_context(request_context)?;
        let claimed_tenant = TenantId::parse(claimed_tenant)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        if context.tenant_id() != &claimed_tenant {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "payload tenant does not match the trusted session",
            ));
        }
        Ok(context)
    }
}

impl OidcVerifier {
    fn authenticate(&self, token: &str) -> Result<ExecutionContext, SessionConfigError> {
        let header = decode_header(token)
            .map_err(|error| SessionConfigError::InvalidClaim(error.to_string()))?;
        if header.alg != Algorithm::RS256 {
            return Err(SessionConfigError::InvalidClaim(
                "token must use RS256".to_owned(),
            ));
        }
        let key_id = header
            .kid
            .ok_or_else(|| SessionConfigError::InvalidClaim("token has no key id".to_owned()))?;
        let key = self.keys.get(&key_id).ok_or_else(|| {
            SessionConfigError::InvalidClaim(format!("unknown token key id {key_id:?}"))
        })?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.leeway = 0;
        validation.validate_nbf = true;
        validation.set_audience(&[&self.audience]);
        validation.set_issuer(&[&self.issuer]);
        validation.set_required_spec_claims(&["aud", "exp", "iss", "sub"]);
        let claims = decode::<OidcClaims>(token, key, &validation)
            .map_err(|error| SessionConfigError::InvalidClaim(error.to_string()))?
            .claims;
        trusted_context_from_claims(claims)
    }
}

fn trusted_context_from_claims(claims: OidcClaims) -> Result<ExecutionContext, SessionConfigError> {
    let delegation_claims = serde_json::from_str::<Vec<DelegationClaim>>(&claims.delegation)
        .map_err(|error| SessionConfigError::InvalidClaim(error.to_string()))?;
    let grants = delegation_claims
        .into_iter()
        .map(parse_delegation_claim)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ExecutionContext::new(
        TenantId::parse(claims.tenant_id).map_err(invalid_claim)?,
        ActorId::parse(claims.actor_id).map_err(invalid_claim)?,
        PrincipalId::parse(claims.principal_id).map_err(invalid_claim)?,
        WorkloadId::parse(claims.workload_id).map_err(invalid_claim)?,
        DelegationChain::new(grants).map_err(invalid_claim)?,
    ))
}

fn parse_delegation_claim(claim: DelegationClaim) -> Result<DelegationGrant, SessionConfigError> {
    DelegationGrant::new(
        DelegationId::parse(claim.delegation_id).map_err(invalid_claim)?,
        parse_ids(claim.action_ids, ActionId::parse)?,
        parse_ids(claim.resource_ids, ResourceId::parse)?,
        parse_ids(claim.workload_ids, WorkloadId::parse)?,
        seconds_to_micros(claim.not_before)?,
        seconds_to_micros(claim.expires_at)?,
    )
    .map_err(invalid_claim)
}

fn parse_ids<T, E>(
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

fn seconds_to_micros(value: i64) -> Result<TimestampMicros, SessionConfigError> {
    value
        .checked_mul(1_000_000)
        .map(TimestampMicros::new)
        .ok_or_else(|| SessionConfigError::InvalidClaim("delegation time exceeds i64".to_owned()))
}

fn legacy_context(tenant_id: TenantId) -> Result<ExecutionContext, SessionConfigError> {
    let workload_id = WorkloadId::parse("workload.legacy").map_err(invalid_claim)?;
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.legacy").map_err(invalid_claim)?,
        BTreeSet::from([ActionId::parse("action.legacy").map_err(invalid_claim)?]),
        BTreeSet::from([ResourceId::parse("resource.legacy").map_err(invalid_claim)?]),
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
    principal_id: String,
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
