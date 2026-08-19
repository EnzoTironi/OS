use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use connectrpc::{ConnectError, ErrorCode, RequestContext};
use zoen_core::{ExecutionContext, TenantId};

#[derive(Debug)]
pub enum SessionConfigError {
    InvalidJson(serde_json::Error),
    InvalidTenant(String),
}

impl Display for SessionConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidJson(error) => write!(formatter, "invalid session configuration: {error}"),
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
            Self::InvalidJson(error) => Some(error),
            Self::InvalidTenant(_) => None,
        }
    }
}

#[derive(Clone)]
pub struct SessionRegistry {
    tenants_by_token: HashMap<String, TenantId>,
}

impl SessionRegistry {
    pub fn from_json(value: &str) -> Result<Self, SessionConfigError> {
        let raw = serde_json::from_str::<HashMap<String, String>>(value)
            .map_err(SessionConfigError::InvalidJson)?;
        let mut tenants_by_token = HashMap::with_capacity(raw.len());
        for (token, tenant) in raw {
            let tenant_id =
                TenantId::parse(&tenant).map_err(|_| SessionConfigError::InvalidTenant(tenant))?;
            tenants_by_token.insert(token, tenant_id);
        }
        Ok(Self { tenants_by_token })
    }

    pub fn authenticate(&self, authorization: Option<&str>) -> Option<ExecutionContext> {
        let token = authorization?.strip_prefix("Bearer ")?;
        self.tenants_by_token
            .get(token)
            .cloned()
            .map(|tenant_id| ExecutionContext { tenant_id })
    }

    pub fn execution_context(
        &self,
        request_context: &RequestContext,
        claimed_tenant: &str,
    ) -> Result<ExecutionContext, ConnectError> {
        let authorization = request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok());
        let context = self.authenticate(authorization).ok_or_else(|| {
            ConnectError::new(ErrorCode::Unauthenticated, "invalid bearer session")
        })?;
        let claimed_tenant = TenantId::parse(claimed_tenant)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        if context.tenant_id != claimed_tenant {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "payload tenant does not match the trusted session",
            ));
        }
        Ok(context)
    }
}
