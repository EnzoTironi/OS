use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::{CedarPolicyEvaluator, PostgresAuthorityStore};
use zoen_core::{
    ActivationPrecondition, DefinitionActivation as CoreDefinitionActivation,
    DefinitionChangeKind as CoreChangeKind, DefinitionDigest,
    DefinitionElementKind as CoreElementKind, DefinitionId,
    DefinitionImpactApplicability as CoreImpactApplicability,
    DefinitionImpactArea as CoreImpactArea, DefinitionRevision as CoreDefinitionRevision,
    EvolutionClassification as CoreEvolutionClassification, EvolutionPlan as CoreEvolutionPlan,
    TimestampMicros,
};
use zoen_engine::{
    ActivateRevisionError, DefinitionEngine, GetRevisionError, PlanEvolutionError, PublishError,
    StoreError,
};

use crate::action_service::to_policy_evidence;
use crate::auth::SessionRegistry;
use crate::proto::zoen::definition::v1::__buffa::view::oneof::activate_revision_request as activate_revision_request_view;
use crate::proto::zoen::definition::v1::{
    ActivateRevisionRequest, ActivateRevisionResponse, DefinitionActivation, DefinitionChange,
    DefinitionChangeKind, DefinitionElementKind, DefinitionImpact, DefinitionImpactApplicability,
    DefinitionImpactArea, DefinitionRevision, DefinitionService, EvolutionClassification,
    EvolutionPlan, GetActiveRevisionRequest, GetActiveRevisionResponse, GetRevisionRequest,
    GetRevisionResponse, PlanEvolutionRequest, PlanEvolutionResponse, PublishRequest,
    PublishResponse,
};
use crate::world_service::{to_definition_reference, to_timestamp};

pub struct DefinitionServiceImpl {
    engine: DefinitionEngine<PostgresAuthorityStore, Arc<CedarPolicyEvaluator>>,
    sessions: SessionRegistry,
}

impl DefinitionServiceImpl {
    pub fn new(
        engine: DefinitionEngine<PostgresAuthorityStore, Arc<CedarPolicyEvaluator>>,
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

    async fn get_active_revision(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, GetActiveRevisionRequest>,
    ) -> ServiceResult<GetActiveRevisionResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)?;
        let definition_id = DefinitionId::parse(request.definition_id)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let revision = self
            .engine
            .get_active_revision(&execution_context, &definition_id)
            .await
            .map_err(map_get_error)?;
        Response::ok(GetActiveRevisionResponse {
            definition_revision: revision.map(to_protocol_revision).into(),
            ..Default::default()
        })
    }

    async fn plan_evolution(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, PlanEvolutionRequest>,
    ) -> ServiceResult<PlanEvolutionResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)?;
        let definition_id = DefinitionId::parse(request.definition_id)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let from_digest = DefinitionDigest::parse(request.from_digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let to_digest = DefinitionDigest::parse(request.to_digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let plan = self
            .engine
            .plan_evolution(&execution_context, &definition_id, &from_digest, &to_digest)
            .await
            .map_err(map_plan_error)?;
        Response::ok(PlanEvolutionResponse {
            plan: Some(to_protocol_plan(plan)).into(),
            ..Default::default()
        })
    }

    async fn activate_revision(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ActivateRevisionRequest>,
    ) -> ServiceResult<ActivateRevisionResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)?;
        let definition_id = DefinitionId::parse(request.definition_id)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let digest = DefinitionDigest::parse(request.digest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let precondition =
            parse_activation_precondition(request.active_revision_precondition.as_ref())?;
        let activation = self
            .engine
            .activate_revision(
                &execution_context,
                &definition_id,
                &digest,
                &precondition,
                now()?,
            )
            .await
            .map_err(map_activate_error)?;
        Response::ok(ActivateRevisionResponse {
            activation: Some(to_protocol_activation(activation)).into(),
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

fn to_protocol_activation(activation: CoreDefinitionActivation) -> DefinitionActivation {
    DefinitionActivation {
        activated_at: Some(to_timestamp(activation.activated_at)).into(),
        activated_by: activation.activated_by.as_str().to_owned(),
        active: Some(to_definition_reference(activation.active)).into(),
        classification: activation
            .classification
            .map(to_classification)
            .unwrap_or(EvolutionClassification::Unspecified)
            .into(),
        commit_sequence: activation.commit_sequence.get(),
        policy: Some(to_policy_evidence(activation.policy)).into(),
        previous: activation.previous.map(to_definition_reference).into(),
        principal_id: activation.principal_id.as_str().to_owned(),
        workload_id: activation.workload_id.as_str().to_owned(),
        ..Default::default()
    }
}

fn parse_activation_precondition(
    precondition: Option<&activate_revision_request_view::ActiveRevisionPrecondition<'_>>,
) -> Result<ActivationPrecondition, ConnectError> {
    match precondition {
        Some(
            activate_revision_request_view::ActiveRevisionPrecondition::ExpectNoActiveRevision(
                true,
            ),
        ) => Ok(ActivationPrecondition::NoActiveRevision),
        Some(activate_revision_request_view::ActiveRevisionPrecondition::ExpectedActiveDigest(
            digest,
        )) => DefinitionDigest::parse((*digest).to_owned())
            .map(ActivationPrecondition::ActiveDigest)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string())),
        Some(
            activate_revision_request_view::ActiveRevisionPrecondition::ExpectNoActiveRevision(
                false,
            ),
        ) => Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "expect_no_active_revision must be true",
        )),
        None => Err(ConnectError::new(
            ErrorCode::InvalidArgument,
            "active revision precondition is required",
        )),
    }
}

fn to_protocol_plan(plan: CoreEvolutionPlan) -> EvolutionPlan {
    let migration_required = plan.migration_required();
    EvolutionPlan {
        changes: plan
            .changes
            .into_iter()
            .map(|change| DefinitionChange {
                change: to_change_kind(change.change).into(),
                element: to_element_kind(change.element).into(),
                id: change.id,
                ..Default::default()
            })
            .collect(),
        classification: to_classification(plan.classification).into(),
        from: Some(to_definition_reference(plan.from)).into(),
        impacts: plan
            .impacts
            .into_iter()
            .map(|impact| DefinitionImpact {
                affected: impact.affected,
                applicability: to_impact_applicability(impact.applicability).into(),
                area: to_impact_area(impact.area).into(),
                rationale: impact.rationale,
                unaffected: impact.unaffected,
                ..Default::default()
            })
            .collect(),
        migration_required,
        to: Some(to_definition_reference(plan.to)).into(),
        ..Default::default()
    }
}

fn to_classification(classification: CoreEvolutionClassification) -> EvolutionClassification {
    match classification {
        CoreEvolutionClassification::Compatible => EvolutionClassification::Compatible,
        CoreEvolutionClassification::RequiresMigration => {
            EvolutionClassification::RequiresMigration
        }
        CoreEvolutionClassification::Breaking => EvolutionClassification::Breaking,
        CoreEvolutionClassification::Forbidden => EvolutionClassification::Forbidden,
    }
}

fn to_change_kind(change: CoreChangeKind) -> DefinitionChangeKind {
    match change {
        CoreChangeKind::Added => DefinitionChangeKind::Added,
        CoreChangeKind::Removed => DefinitionChangeKind::Removed,
        CoreChangeKind::Modified => DefinitionChangeKind::Modified,
    }
}

fn to_element_kind(element: CoreElementKind) -> DefinitionElementKind {
    match element {
        CoreElementKind::Type => DefinitionElementKind::Type,
        CoreElementKind::Relation => DefinitionElementKind::Relation,
        CoreElementKind::Computation => DefinitionElementKind::Computation,
        CoreElementKind::Action => DefinitionElementKind::Action,
    }
}

fn to_impact_applicability(
    applicability: CoreImpactApplicability,
) -> DefinitionImpactApplicability {
    match applicability {
        CoreImpactApplicability::Applicable => DefinitionImpactApplicability::Applicable,
        CoreImpactApplicability::NotApplicable => DefinitionImpactApplicability::NotApplicable,
    }
}

fn to_impact_area(area: CoreImpactArea) -> DefinitionImpactArea {
    match area {
        CoreImpactArea::Types => DefinitionImpactArea::Types,
        CoreImpactArea::Relations => DefinitionImpactArea::Relations,
        CoreImpactArea::Computations => DefinitionImpactArea::Computations,
        CoreImpactArea::Actions => DefinitionImpactArea::Actions,
        CoreImpactArea::DomainPackageDependencies => {
            DefinitionImpactArea::DomainPackageDependencies
        }
        CoreImpactArea::StoredSemanticRecords => DefinitionImpactArea::StoredSemanticRecords,
        CoreImpactArea::QueryAndMaterializationArtifacts => {
            DefinitionImpactArea::QueryAndMaterializationArtifacts
        }
        CoreImpactArea::GeneratedSdkAndSurfaceArtifacts => {
            DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts
        }
        CoreImpactArea::PolicyAndWasmReferences => DefinitionImpactArea::PolicyAndWasmReferences,
    }
}

fn now() -> Result<TimestampMicros, ConnectError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    let micros = i64::try_from(duration.as_micros())
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    Ok(TimestampMicros::new(micros))
}

fn map_activate_error(error: ActivateRevisionError) -> ConnectError {
    match error {
        ActivateRevisionError::Configuration(_) | ActivateRevisionError::EventEncoding(_) => {
            ConnectError::new(ErrorCode::Internal, error.to_string())
        }
        ActivateRevisionError::DelegationDenied | ActivateRevisionError::PolicyDenied(_) => {
            ConnectError::new(ErrorCode::PermissionDenied, error.to_string())
        }
        ActivateRevisionError::Incompatible(_)
        | ActivateRevisionError::PolicyEvaluation { .. }
        | ActivateRevisionError::StalePrecondition => {
            ConnectError::new(ErrorCode::FailedPrecondition, error.to_string())
        }
        ActivateRevisionError::InvalidRevision(_) => {
            ConnectError::new(ErrorCode::DataLoss, error.to_string())
        }
        ActivateRevisionError::Store(error) => map_store_error(error),
    }
}

fn map_plan_error(error: PlanEvolutionError) -> ConnectError {
    match error {
        PlanEvolutionError::InvalidRevision(_) => {
            ConnectError::new(ErrorCode::DataLoss, error.to_string())
        }
        PlanEvolutionError::Store(error) => map_store_error(error),
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
        StoreError::InactiveDefinition => ErrorCode::FailedPrecondition,
        StoreError::NotFound => ErrorCode::NotFound,
        StoreError::OperationMismatch => ErrorCode::InvalidArgument,
        StoreError::StalePrecondition => ErrorCode::FailedPrecondition,
        StoreError::Unavailable(_) => ErrorCode::Unavailable,
    };
    ConnectError::new(code, error.to_string())
}
