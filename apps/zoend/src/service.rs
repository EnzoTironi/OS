use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use buffa::MessageView;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::{CedarPolicyEvaluator, PostgresAuthorityStore};
use zoen_core::{
    ActivationPrecondition, DefinitionActivation as CoreDefinitionActivation,
    DefinitionActivationKind as CoreDefinitionActivationKind,
    DefinitionChangeKind as CoreChangeKind, DefinitionDigest,
    DefinitionElementKind as CoreElementKind, DefinitionId,
    DefinitionImpactApplicability as CoreImpactApplicability,
    DefinitionImpactArea as CoreImpactArea, DefinitionRevision as CoreDefinitionRevision,
    EvolutionClassification as CoreEvolutionClassification, EvolutionPlan as CoreEvolutionPlan,
    MigrationDependency as CoreMigrationDependency, MigrationElement as CoreMigrationElement,
    MigrationLineage as CoreMigrationLineage, MigrationObligation as CoreMigrationObligation,
    MigrationPlan as CoreMigrationPlan, MigrationPostcondition as CoreMigrationPostcondition,
    MigrationProgress as CoreMigrationProgress, MigrationRecipe as CoreMigrationRecipe,
    MigrationRecord as CoreMigrationRecord, MigrationRule as CoreMigrationRule,
    MigrationRuleKind as CoreMigrationRuleKind, MigrationStatus as CoreMigrationStatus,
    OperationId, TimestampMicros,
};
use zoen_engine::{
    ActivateRevisionError, DefinitionEngine, GetRevisionError, MigrationError, PlanEvolutionError,
    PublishError, StoreError,
};

use crate::action_service::to_policy_evidence;
use crate::auth::SessionRegistry;
use crate::proto::zoen::definition::v1::__buffa::view::oneof::activate_revision_request as activate_revision_request_view;
use crate::proto::zoen::definition::v1::{
    ActivateRevisionRequest, ActivateRevisionResponse, ApplyMigrationBatchRequest,
    ApplyMigrationBatchResponse, DefinitionActivation, DefinitionActivationKind, DefinitionChange,
    DefinitionChangeKind, DefinitionElementKind, DefinitionImpact, DefinitionImpactApplicability,
    DefinitionImpactArea, DefinitionRevision, DefinitionService, EvolutionClassification,
    EvolutionPlan, GetActiveRevisionRequest, GetActiveRevisionResponse, GetMigrationRequest,
    GetMigrationResponse, GetRevisionRequest, GetRevisionResponse, MigrationArtifactDependency,
    MigrationDependency, MigrationElement, MigrationLineage, MigrationObligation,
    MigrationObligationSource, MigrationPlan, MigrationPostcondition, MigrationProgress,
    MigrationRecipe, MigrationRecord, MigrationRule, MigrationRuleKind, MigrationStatus,
    PlanEvolutionRequest, PlanEvolutionResponse, PrepareMigrationRequest, PrepareMigrationResponse,
    PublishRequest, PublishResponse, RollbackRevisionRequest, RollbackRevisionResponse,
};
use crate::world_service::{invalid, parse_evidence_claim, to_definition_reference, to_timestamp};

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
            .execution_context(&context, request.tenant_id)
            .await?;
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
            .execution_context(&context, request.tenant_id)
            .await?;
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
            .execution_context(&context, request.tenant_id)
            .await?;
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
            .execution_context(&context, request.tenant_id)
            .await?;
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

    async fn prepare_migration(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, PrepareMigrationRequest>,
    ) -> ServiceResult<PrepareMigrationResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)
            .await?;
        let recipe = request
            .recipe
            .as_option()
            .ok_or_else(|| invalid("migration recipe is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let progress = self
            .engine
            .prepare_migration(&execution_context, parse_migration_recipe(&recipe)?, now()?)
            .await
            .map_err(map_migration_error)?;
        Response::ok(PrepareMigrationResponse {
            progress: Some(to_protocol_migration_progress(progress)).into(),
            ..Default::default()
        })
    }

    async fn apply_migration_batch(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ApplyMigrationBatchRequest>,
    ) -> ServiceResult<ApplyMigrationBatchResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)
            .await?;
        let operation_id =
            OperationId::parse(request.operation_id).map_err(|error| invalid(error.to_string()))?;
        let records = request
            .records
            .iter()
            .map(|record| {
                let record = record
                    .to_owned_message()
                    .map_err(|error| invalid(error.to_string()))?;
                parse_migration_record(&record)
            })
            .collect::<Result<Vec<_>, ConnectError>>()?;
        let progress = self
            .engine
            .apply_migration_batch(
                &execution_context,
                &operation_id,
                request.batch_index,
                records,
                now()?,
            )
            .await
            .map_err(map_migration_error)?;
        Response::ok(ApplyMigrationBatchResponse {
            progress: Some(to_protocol_migration_progress(progress)).into(),
            ..Default::default()
        })
    }

    async fn get_migration(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, GetMigrationRequest>,
    ) -> ServiceResult<GetMigrationResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)
            .await?;
        let operation_id =
            OperationId::parse(request.operation_id).map_err(|error| invalid(error.to_string()))?;
        let progress = self
            .engine
            .get_migration(&execution_context, &operation_id)
            .await
            .map_err(map_migration_error)?;
        Response::ok(GetMigrationResponse {
            progress: Some(to_protocol_migration_progress(progress)).into(),
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
            .execution_context(&context, request.tenant_id)
            .await?;
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

    async fn rollback_revision(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, RollbackRevisionRequest>,
    ) -> ServiceResult<RollbackRevisionResponse> {
        let execution_context = self
            .sessions
            .execution_context(&context, request.tenant_id)
            .await?;
        let definition_id = DefinitionId::parse(request.definition_id)
            .map_err(|error| invalid(error.to_string()))?;
        let digest =
            DefinitionDigest::parse(request.digest).map_err(|error| invalid(error.to_string()))?;
        let expected_active_digest = DefinitionDigest::parse(request.expected_active_digest)
            .map_err(|error| invalid(error.to_string()))?;
        let activation = self
            .engine
            .rollback_revision(
                &execution_context,
                &definition_id,
                &digest,
                &ActivationPrecondition::ActiveDigest(expected_active_digest),
                now()?,
            )
            .await
            .map_err(map_activate_error)?;
        Response::ok(RollbackRevisionResponse {
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
        kind: match activation.kind {
            CoreDefinitionActivationKind::Activation => DefinitionActivationKind::Activation,
            CoreDefinitionActivationKind::Rollback => DefinitionActivationKind::Rollback,
        }
        .into(),
        migration_operation_id: activation
            .migration_operation_id
            .map(|operation_id| operation_id.as_str().to_owned())
            .unwrap_or_default(),
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
                classification: to_classification(change.classification).into(),
                element: to_element_kind(change.element).into(),
                id: change.id,
                rationale: change.rationale,
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

fn parse_migration_recipe(recipe: &MigrationRecipe) -> Result<CoreMigrationRecipe, ConnectError> {
    Ok(CoreMigrationRecipe {
        definition_id: DefinitionId::parse(&recipe.definition_id)
            .map_err(|error| invalid(error.to_string()))?,
        dependencies: recipe
            .dependencies
            .iter()
            .map(|dependency| {
                Ok(CoreMigrationDependency {
                    claim_id: zoen_core::ClaimId::parse(&dependency.claim_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    commit_sequence: zoen_core::CommitSequence::new(dependency.commit_sequence)
                        .ok_or_else(|| invalid("migration dependency commit must be positive"))?,
                    entity_id: zoen_core::EntityId::parse(&dependency.entity_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    relation_id: zoen_core::RelationId::parse(&dependency.relation_id)
                        .map_err(|error| invalid(error.to_string()))?,
                })
            })
            .collect::<Result<_, ConnectError>>()?,
        format_version: recipe.format_version,
        from_digest: DefinitionDigest::parse(&recipe.from_digest)
            .map_err(|error| invalid(error.to_string()))?,
        operation_id: OperationId::parse(&recipe.operation_id)
            .map_err(|error| invalid(error.to_string()))?,
        postconditions: recipe
            .postconditions
            .iter()
            .map(|postcondition| {
                Ok(CoreMigrationPostcondition {
                    minimum_record_count: postcondition.minimum_record_count,
                    relation_id: zoen_core::RelationId::parse(&postcondition.relation_id)
                        .map_err(|error| invalid(error.to_string()))?,
                })
            })
            .collect::<Result<_, ConnectError>>()?,
        rules: recipe
            .rules
            .iter()
            .map(parse_migration_rule)
            .collect::<Result<_, _>>()?,
        to_digest: DefinitionDigest::parse(&recipe.to_digest)
            .map_err(|error| invalid(error.to_string()))?,
    })
}

fn parse_migration_element(
    element: &MigrationElement,
) -> Result<CoreMigrationElement, ConnectError> {
    Ok(CoreMigrationElement {
        element: parse_element_kind(element.element.as_known())?,
        id: element.id.clone(),
    })
}

fn parse_migration_rule(rule: &MigrationRule) -> Result<CoreMigrationRule, ConnectError> {
    Ok(CoreMigrationRule {
        id: zoen_core::MigrationRuleId::parse(&rule.rule_id)
            .map_err(|error| invalid(error.to_string()))?,
        kind: parse_migration_rule_kind(rule.kind.as_known())?,
        sources: rule
            .sources
            .iter()
            .map(parse_migration_element)
            .collect::<Result<_, _>>()?,
        targets: rule
            .targets
            .iter()
            .map(parse_migration_element)
            .collect::<Result<_, _>>()?,
    })
}

fn parse_migration_record(record: &MigrationRecord) -> Result<CoreMigrationRecord, ConnectError> {
    let target = record
        .target_evidence
        .as_option()
        .ok_or_else(|| invalid("migration target evidence is required"))?;
    Ok(CoreMigrationRecord {
        rule_id: zoen_core::MigrationRuleId::parse(&record.rule_id)
            .map_err(|error| invalid(error.to_string()))?,
        source_claim_ids: record
            .source_claim_ids
            .iter()
            .map(|claim_id| {
                zoen_core::ClaimId::parse(claim_id).map_err(|error| invalid(error.to_string()))
            })
            .collect::<Result<_, _>>()?,
        target: parse_evidence_claim(target)?,
    })
}

fn parse_element_kind(
    element: Option<DefinitionElementKind>,
) -> Result<CoreElementKind, ConnectError> {
    match element {
        Some(DefinitionElementKind::Type) => Ok(CoreElementKind::Type),
        Some(DefinitionElementKind::Relation) => Ok(CoreElementKind::Relation),
        Some(DefinitionElementKind::Computation) => Ok(CoreElementKind::Computation),
        Some(DefinitionElementKind::Action) => Ok(CoreElementKind::Action),
        Some(DefinitionElementKind::Unspecified) | None => {
            Err(invalid("migration element kind is required"))
        }
    }
}

fn parse_migration_rule_kind(
    kind: Option<MigrationRuleKind>,
) -> Result<CoreMigrationRuleKind, ConnectError> {
    match kind {
        Some(MigrationRuleKind::PreserveMeaning) => Ok(CoreMigrationRuleKind::PreserveMeaning),
        Some(MigrationRuleKind::Transform) => Ok(CoreMigrationRuleKind::Transform),
        Some(MigrationRuleKind::Supersede) => Ok(CoreMigrationRuleKind::Supersede),
        Some(MigrationRuleKind::Recompute) => Ok(CoreMigrationRuleKind::Recompute),
        Some(MigrationRuleKind::Unspecified) | None => {
            Err(invalid("migration rule kind is required"))
        }
    }
}

fn to_protocol_migration_progress(progress: CoreMigrationProgress) -> MigrationProgress {
    MigrationProgress {
        commit_sequence: progress.commit_sequence.get(),
        completed_batches: progress.completed_batches,
        intent_digest: progress.intent_digest.as_str().to_owned(),
        lineage: progress
            .lineage
            .into_iter()
            .map(to_protocol_migration_lineage)
            .collect(),
        plan: Some(to_protocol_migration_plan(progress.plan)).into(),
        remaining_obligations: progress
            .remaining_obligations
            .into_iter()
            .map(to_protocol_migration_obligation)
            .collect(),
        status: match progress.status {
            CoreMigrationStatus::Prepared => MigrationStatus::Prepared,
            CoreMigrationStatus::InProgress => MigrationStatus::InProgress,
            CoreMigrationStatus::Completed => MigrationStatus::Completed,
        }
        .into(),
        total_obligations: progress.total_obligations,
        ..Default::default()
    }
}

fn to_protocol_migration_plan(plan: CoreMigrationPlan) -> MigrationPlan {
    MigrationPlan {
        affected_elements: plan
            .affected_elements
            .into_iter()
            .map(to_protocol_migration_element)
            .collect(),
        artifact_dependencies: plan
            .artifact_dependencies
            .into_iter()
            .map(|artifact| MigrationArtifactDependency {
                area: to_impact_area(artifact.area).into(),
                id: artifact.id,
                ..Default::default()
            })
            .collect(),
        assessment_digest: plan.assessment_digest.as_str().to_owned(),
        classification: to_classification(plan.classification).into(),
        dependencies: plan
            .dependencies
            .into_iter()
            .map(|dependency| MigrationDependency {
                claim_id: dependency.claim_id.as_str().to_owned(),
                commit_sequence: dependency.commit_sequence.get(),
                entity_id: dependency.entity_id.as_str().to_owned(),
                relation_id: dependency.relation_id.as_str().to_owned(),
                ..Default::default()
            })
            .collect(),
        format_version: plan.format_version,
        from: Some(to_definition_reference(plan.from)).into(),
        obligation_sources: plan
            .obligation_sources
            .into_iter()
            .map(|source| MigrationObligationSource {
                kind: to_migration_rule_kind(source.kind).into(),
                relation_id: source.relation_id.as_str().to_owned(),
                rule_id: source.rule_id.as_str().to_owned(),
                ..Default::default()
            })
            .collect(),
        operation_id: plan.operation_id.as_str().to_owned(),
        postconditions: plan
            .postconditions
            .into_iter()
            .map(|postcondition| MigrationPostcondition {
                minimum_record_count: postcondition.minimum_record_count,
                relation_id: postcondition.relation_id.as_str().to_owned(),
                ..Default::default()
            })
            .collect(),
        rules: plan
            .rules
            .into_iter()
            .map(|rule| MigrationRule {
                kind: to_migration_rule_kind(rule.kind).into(),
                rule_id: rule.id.as_str().to_owned(),
                sources: rule
                    .sources
                    .into_iter()
                    .map(to_protocol_migration_element)
                    .collect(),
                targets: rule
                    .targets
                    .into_iter()
                    .map(to_protocol_migration_element)
                    .collect(),
                ..Default::default()
            })
            .collect(),
        to: Some(to_definition_reference(plan.to)).into(),
        ..Default::default()
    }
}

fn to_protocol_migration_element(element: CoreMigrationElement) -> MigrationElement {
    MigrationElement {
        element: to_element_kind(element.element).into(),
        id: element.id,
        ..Default::default()
    }
}

fn to_protocol_migration_lineage(lineage: CoreMigrationLineage) -> MigrationLineage {
    MigrationLineage {
        kind: to_migration_rule_kind(lineage.kind).into(),
        rule_id: lineage.rule_id.as_str().to_owned(),
        source_claim_ids: lineage
            .source_claim_ids
            .into_iter()
            .map(|claim_id| claim_id.as_str().to_owned())
            .collect(),
        target_claim_id: lineage.target_claim_id.as_str().to_owned(),
        ..Default::default()
    }
}

fn to_protocol_migration_obligation(obligation: CoreMigrationObligation) -> MigrationObligation {
    MigrationObligation {
        kind: to_migration_rule_kind(obligation.kind).into(),
        relation_id: obligation.relation_id.as_str().to_owned(),
        rule_id: obligation.rule_id.as_str().to_owned(),
        source_claim_id: obligation.source_claim_id.as_str().to_owned(),
        ..Default::default()
    }
}

fn to_migration_rule_kind(kind: CoreMigrationRuleKind) -> MigrationRuleKind {
    match kind {
        CoreMigrationRuleKind::PreserveMeaning => MigrationRuleKind::PreserveMeaning,
        CoreMigrationRuleKind::Transform => MigrationRuleKind::Transform,
        CoreMigrationRuleKind::Supersede => MigrationRuleKind::Supersede,
        CoreMigrationRuleKind::Recompute => MigrationRuleKind::Recompute,
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
        CoreImpactArea::PolicyAndAuthorityContracts => {
            DefinitionImpactArea::PolicyAndAuthorityContracts
        }
        CoreImpactArea::WasmComponents => DefinitionImpactArea::WasmComponents,
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
        | ActivateRevisionError::InvalidRollbackTarget
        | ActivateRevisionError::MigrationIncomplete
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

fn map_migration_error(error: MigrationError) -> ConnectError {
    match error {
        MigrationError::Configuration(_) => {
            ConnectError::new(ErrorCode::Internal, error.to_string())
        }
        MigrationError::DelegationDenied | MigrationError::PolicyDenied(_) => {
            ConnectError::new(ErrorCode::PermissionDenied, error.to_string())
        }
        MigrationError::InvalidEvidence(_) | MigrationError::InvalidPlan(_) => {
            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
        }
        MigrationError::PolicyEvaluation { .. } => {
            ConnectError::new(ErrorCode::FailedPrecondition, error.to_string())
        }
        MigrationError::Store(error) => map_store_error(error),
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
