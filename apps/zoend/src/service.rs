use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::PostgresAuthorityStore;
use zoen_core::{DefinitionDigest, DefinitionId, DefinitionRevision as CoreDefinitionRevision};
use zoen_engine::{DefinitionEngine, GetRevisionError, PublishError, StoreError};

use crate::auth::SessionRegistry;
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
}

impl DefinitionService for DefinitionServiceImpl {
    async fn publish(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, PublishRequest>,
    ) -> ServiceResult<PublishResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)?;
        let digest = DefinitionDigest::parse(request.digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let revision = self
            .engine
            .publish(&execution_context, request.canonical_json, digest)
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
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)?;
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

fn map_publish_error(error: PublishError) -> ConnectError {
    match error {
        PublishError::DigestMismatch
        | PublishError::InvalidCanonicalDefinition(_)
        | PublishError::InvalidDefinition(_)
        | PublishError::MalformedDefinition(_)
        | PublishError::NonCanonicalDefinition => {
            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
        }
        PublishError::EventEncoding(_) => ConnectError::new(ErrorCode::Internal, error.to_string()),
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

pub(crate) fn map_store_error(error: StoreError) -> ConnectError {
    let code = match &error {
        StoreError::Conflict(_) => ErrorCode::AlreadyExists,
        StoreError::Corrupt(_) => ErrorCode::DataLoss,
        StoreError::IdentityCollision(_) => ErrorCode::AlreadyExists,
        StoreError::NotFound => ErrorCode::NotFound,
        StoreError::OperationMismatch => ErrorCode::InvalidArgument,
        StoreError::Unavailable(_) => ErrorCode::Unavailable,
    };
    ConnectError::new(code, error.to_string())
}
