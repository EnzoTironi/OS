use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::{
    DefinitionDigest, DefinitionId, DefinitionRevision as CoreDefinitionRevision, ExecutionContext,
    PublicationRequest, TenantId,
};
use zoen_engine::{DefinitionEngine, GetRevisionError, PublishError, StoreError};

use crate::auth::SessionRegistry;
use crate::canonical::{CanonicalParseError, parse_canonical};
use crate::proto::zoen::definition::v1::{
    DefinitionRevision, DefinitionService, GetRevisionRequest, GetRevisionResponse, PublishRequest,
    PublishResponse,
};

pub struct DefinitionServiceImpl {
    engine: DefinitionEngine<PostgresAuthorityStore>,
    sessions: SessionRegistry,
}

impl DefinitionServiceImpl {
    pub fn new(
        engine: DefinitionEngine<PostgresAuthorityStore>,
        sessions: SessionRegistry,
    ) -> Self {
        Self { engine, sessions }
    }

    fn execution_context(
        &self,
        request_context: &RequestContext,
        claimed_tenant: &str,
    ) -> Result<ExecutionContext, ConnectError> {
        let authorization = request_context
            .header("authorization")
            .and_then(|value| value.to_str().ok());
        let context = self.sessions.authenticate(authorization).ok_or_else(|| {
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

impl DefinitionService for DefinitionServiceImpl {
    async fn publish(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, PublishRequest>,
    ) -> ServiceResult<PublishResponse> {
        let execution_context = self.execution_context(&context, request.tenant_id)?;
        let parsed = parse_canonical(request.canonical_json).map_err(map_canonical_error)?;
        let digest = DefinitionDigest::parse(request.digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let publication = PublicationRequest {
            canonical_json: parsed.canonical_json,
            definition: parsed.definition,
            digest,
        };
        let revision = self
            .engine
            .publish(&execution_context, &publication)
            .await
            .map_err(map_publish_error)?;
        Response::ok(PublishResponse {
            definition_revision: Some(to_protocol_revision(revision)).into(),
            ..Default::default()
        })
    }

    async fn get_revision(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, GetRevisionRequest>,
    ) -> ServiceResult<GetRevisionResponse> {
        let execution_context = self.execution_context(&context, request.tenant_id)?;
        let definition_id = DefinitionId::parse(request.definition_id)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let digest = DefinitionDigest::parse(request.digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let revision = self
            .engine
            .get_revision(&execution_context, &definition_id, &digest)
            .await
            .map_err(map_get_error)?;
        Response::ok(GetRevisionResponse {
            definition_revision: Some(to_protocol_revision(revision)).into(),
            ..Default::default()
        })
    }
}

fn to_protocol_revision(revision: CoreDefinitionRevision) -> DefinitionRevision {
    DefinitionRevision {
        canonical_json: revision.canonical_json.as_bytes().to_vec(),
        commit_sequence: revision.commit_sequence.get(),
        definition_id: revision.definition_id.as_str().to_owned(),
        digest: revision.digest.as_str().to_owned(),
        revision: revision.revision.get(),
        ..Default::default()
    }
}

fn map_canonical_error(error: CanonicalParseError) -> ConnectError {
    ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
}

fn map_publish_error(error: PublishError) -> ConnectError {
    match error {
        PublishError::DigestMismatch | PublishError::InvalidDefinition(_) => {
            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
        }
        PublishError::Store(error) => map_store_error(error),
    }
}

fn map_get_error(error: GetRevisionError) -> ConnectError {
    match error {
        GetRevisionError::DigestMismatch => {
            ConnectError::new(ErrorCode::DataLoss, error.to_string())
        }
        GetRevisionError::Store(error) => map_store_error(error),
    }
}

fn map_store_error(error: StoreError) -> ConnectError {
    let code = match &error {
        StoreError::Conflict(_) => ErrorCode::AlreadyExists,
        StoreError::Corrupt(_) => ErrorCode::DataLoss,
        StoreError::NotFound => ErrorCode::NotFound,
        StoreError::Unavailable(_) => ErrorCode::Unavailable,
    };
    ConnectError::new(code, error.to_string())
}
