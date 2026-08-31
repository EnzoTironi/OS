use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use buffa::MessageView;
use buffa_types::google::protobuf::Timestamp;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use zoen_adapters::{CedarPolicyEvaluator, PostgresAuthorityStore};
use zoen_core::{
    ClaimId, CommitSequence, ComputationId, Consistency, DefinitionDigest, DefinitionId,
    DefinitionReference as CoreDefinitionReference, DefinitionRevisionNumber, EntityId,
    EvidenceDigest, EvidenceDraft, EvidenceProvenance, ExactDecimal, ExactInteger,
    ExactValue as CoreExactValue, ExecutionContext, LineageRole as CoreLineageRole, OperationId,
    RelationId, ScenarioId, SemanticQuery, SemanticResult, SemanticSelection, SourceId, TenantId,
    TimestampMicros, TypeId, UnitId, ValidTime,
};
use zoen_engine::{
    ApplyOutcome, QueryPortError, ReadEngine, ReadError, RecordEvidenceError, ScenarioEngine,
    ScenarioError, WorldEngine,
};
use zoen_query::QueryRuntime;

use crate::{
    proto::zoen::world::v1::{
        __buffa::view::oneof::semantic_query_request as semantic_query_view, ApplyScenarioRequest,
        ApplyScenarioResponse, CreateScenarioRequest, CreateScenarioResponse, DefinitionReference,
        DiscardScenarioRequest, DiscardScenarioResponse, EvidenceClaim, ExactValue,
        LineageDependency, LineageRole, MigrationOrigin, QuantityValue, RecordEvidenceBatchRequest,
        RecordEvidenceBatchResponse, RecordEvidenceRequest, RecordEvidenceResponse,
        SemanticQueryRequest, SemanticQueryResponse, SemanticValueResult, WorldService,
        exact_value, query_consistency, query_selection, valid_time,
    },
    session::SessionExchange,
};

pub struct WorldServiceImpl {
    engine: WorldEngine<PostgresAuthorityStore>,
    read: ReadEngine<QueryRuntime, Arc<CedarPolicyEvaluator>>,
    scenarios: ScenarioEngine<PostgresAuthorityStore, QueryRuntime, Arc<CedarPolicyEvaluator>>,
    sessions: SessionExchange,
}

impl WorldServiceImpl {
    pub fn new(
        engine: WorldEngine<PostgresAuthorityStore>,
        read: ReadEngine<QueryRuntime, Arc<CedarPolicyEvaluator>>,
        scenarios: ScenarioEngine<PostgresAuthorityStore, QueryRuntime, Arc<CedarPolicyEvaluator>>,
        sessions: SessionExchange,
    ) -> Self {
        Self {
            engine,
            read,
            scenarios,
            sessions,
        }
    }

    async fn resolve_for_payload(
        &self,
        request_context: &RequestContext,
        tenant_id: &str,
    ) -> Result<ExecutionContext, ConnectError> {
        let claimed = TenantId::parse(tenant_id)
            .map_err(|error| ConnectError::new(ErrorCode::InvalidArgument, error.to_string()))?;
        let context = self
            .sessions
            .resolve(
                SessionExchange::bearer_from(request_context),
                Some(&claimed),
            )
            .await?;
        if context.tenant_id() != &claimed {
            return Err(ConnectError::new(
                ErrorCode::PermissionDenied,
                "payload tenant does not match the trusted session",
            ));
        }
        Ok(context)
    }
}

impl WorldService for WorldServiceImpl {
    async fn record_evidence(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, RecordEvidenceRequest>,
    ) -> ServiceResult<RecordEvidenceResponse> {
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let claim = request
            .claim
            .as_option()
            .ok_or_else(|| invalid("claim is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let draft = parse_evidence_claim(&claim)?;
        let operation_id = parse_optional_operation_id(request.operation_id)?;
        let recorded = self
            .engine
            .record_evidence(&execution_context, operation_id.as_ref(), draft, now()?)
            .await
            .map_err(map_record_error)?;
        Response::ok(RecordEvidenceResponse {
            claim_id: recorded.draft.claim_id.as_str().to_owned(),
            commit_sequence: recorded.commit_sequence.get(),
            ..Default::default()
        })
    }

    async fn record_evidence_batch(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, RecordEvidenceBatchRequest>,
    ) -> ServiceResult<RecordEvidenceBatchResponse> {
        if request.claims.is_empty() {
            return Err(invalid("claims are required"));
        }
        if request.claims.len() > 1_000 {
            return Err(invalid("evidence batch exceeds 1000 claims"));
        }
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let mut drafts = Vec::with_capacity(request.claims.len());
        for claim in &request.claims {
            let owned = claim
                .to_owned_message()
                .map_err(|error| invalid(error.to_string()))?;
            drafts.push(parse_evidence_claim(&owned)?);
        }
        let operation_id = parse_optional_operation_id(request.operation_id)?;
        let recorded = self
            .engine
            .record_evidence_batch(&execution_context, operation_id.as_ref(), drafts, now()?)
            .await
            .map_err(map_record_error)?;
        let commit_sequence = recorded
            .last()
            .map_or(0, |claim| claim.commit_sequence.get());
        Response::ok(RecordEvidenceBatchResponse {
            commit_sequence,
            recorded_count: u32::try_from(recorded.len()).unwrap_or(u32::MAX),
            ..Default::default()
        })
    }

    async fn semantic_query(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, SemanticQueryRequest>,
    ) -> ServiceResult<SemanticQueryResponse> {
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let definition = request
            .definition
            .as_option()
            .ok_or_else(|| invalid("definition is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let valid_at = request
            .valid_at
            .as_option()
            .ok_or_else(|| invalid("valid_at is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let consistency = request
            .consistency
            .as_option()
            .ok_or_else(|| invalid("consistency is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        if request.query.as_ref().is_none() && !request.page_token.is_empty() {
            return Err(invalid("page_token is only valid for type queries"));
        }
        let query = match request.query.as_ref() {
            Some(semantic_query_view::Query::ByType(type_query)) => {
                if type_query.limit == 0 {
                    return Err(invalid("type query limit must be positive"));
                }
                SemanticQuery::ByType {
                    consistency: parse_consistency(&consistency)?,
                    definition: parse_definition_reference(&definition)?,
                    limit: type_query.limit,
                    page_token: request.page_token.to_owned(),
                    type_id: TypeId::parse(type_query.type_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    scenario_id: parse_optional_scenario_id(request.scenario_id)?,
                    valid_at: parse_timestamp(&valid_at)?,
                }
            }
            None => {
                let selection = request
                    .selection
                    .as_option()
                    .ok_or_else(|| invalid("selection is required"))?
                    .to_owned_message()
                    .map_err(|error| invalid(error.to_string()))?;
                SemanticQuery::ByEntity {
                    consistency: parse_consistency(&consistency)?,
                    definition: parse_definition_reference(&definition)?,
                    entity_id: EntityId::parse(request.entity_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    selection: parse_selection(&selection)?,
                    scenario_id: parse_optional_scenario_id(request.scenario_id)?,
                    valid_at: parse_timestamp(&valid_at)?,
                }
            }
        };
        let result = self
            .read
            .execute(&execution_context, &query)
            .await
            .map_err(map_read_error)?;
        Response::ok(to_query_response(result))
    }

    async fn create_scenario(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, CreateScenarioRequest>,
    ) -> ServiceResult<CreateScenarioResponse> {
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let scenario_id =
            ScenarioId::parse(request.scenario_id).map_err(|error| invalid(error.to_string()))?;
        let scenario = self
            .scenarios
            .create(&execution_context, scenario_id)
            .await
            .map_err(map_scenario_error)?;
        Response::ok(CreateScenarioResponse {
            scenario_id: scenario.id.as_str().to_owned(),
            base_commit_sequence: scenario.base_commit_sequence.get(),
            ..Default::default()
        })
    }

    async fn apply_scenario(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ApplyScenarioRequest>,
    ) -> ServiceResult<ApplyScenarioResponse> {
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let scenario_id =
            ScenarioId::parse(request.scenario_id).map_err(|error| invalid(error.to_string()))?;
        let committed_at = now_micros()?;
        let outcome = self
            .scenarios
            .apply(&execution_context, &scenario_id, committed_at)
            .await
            .map_err(map_scenario_error)?;
        Response::ok(match outcome {
            ApplyOutcome::Committed { commit_sequence } => ApplyScenarioResponse {
                scenario_id: scenario_id.as_str().to_owned(),
                commit_sequence: commit_sequence.get(),
                decision: "Permit".to_owned(),
                ..Default::default()
            },
            ApplyOutcome::Denied { evidence, .. } => ApplyScenarioResponse {
                scenario_id: scenario_id.as_str().to_owned(),
                commit_sequence: 0,
                decision: "Deny".to_owned(),
                determining_policies: evidence.determining_policies,
                ..Default::default()
            },
            ApplyOutcome::EvaluationError {
                message, policy, ..
            } => ApplyScenarioResponse {
                scenario_id: scenario_id.as_str().to_owned(),
                commit_sequence: 0,
                decision: "Deny".to_owned(),
                determining_policies: policy
                    .map(|policy| policy.determining_policies)
                    .unwrap_or_default(),
                evaluation_error: message,
                ..Default::default()
            },
            ApplyOutcome::Conflict(message) => {
                return Err(ConnectError::new(ErrorCode::FailedPrecondition, message));
            }
        })
    }

    async fn discard_scenario(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, DiscardScenarioRequest>,
    ) -> ServiceResult<DiscardScenarioResponse> {
        let execution_context = self
            .resolve_for_payload(&context, request.tenant_id)
            .await?;
        let scenario_id =
            ScenarioId::parse(request.scenario_id).map_err(|error| invalid(error.to_string()))?;
        let scenario = self
            .scenarios
            .discard(&execution_context, &scenario_id)
            .await
            .map_err(map_scenario_error)?;
        Response::ok(DiscardScenarioResponse {
            scenario_id: scenario.id.as_str().to_owned(),
            ..Default::default()
        })
    }
}

pub(crate) fn parse_evidence_claim(claim: &EvidenceClaim) -> Result<EvidenceDraft, ConnectError> {
    let definition = claim
        .definition
        .as_option()
        .ok_or_else(|| invalid("claim definition is required"))?;
    let value = claim
        .value
        .as_option()
        .ok_or_else(|| invalid("claim value is required"))?;
    let valid_time = claim
        .valid_time
        .as_option()
        .ok_or_else(|| invalid("claim valid_time is required"))?;
    let provenance = claim
        .provenance
        .as_option()
        .ok_or_else(|| invalid("claim provenance is required"))?;
    Ok(EvidenceDraft {
        claim_id: ClaimId::parse(&claim.claim_id).map_err(|error| invalid(error.to_string()))?,
        definition: parse_definition_reference(definition)?,
        entity_id: EntityId::parse(&claim.entity_id).map_err(|error| invalid(error.to_string()))?,
        provenance: EvidenceProvenance {
            ingested_at: None,
            observed_at: parse_optional_timestamp(provenance.observed_at.as_option())?,
            source_digest: EvidenceDigest::parse(&provenance.source_digest)
                .map_err(|error| invalid(error.to_string()))?,
            source_id: SourceId::parse(&provenance.source_id)
                .map_err(|error| invalid(error.to_string()))?,
            source_ref: provenance.source_ref.clone(),
        },
        relation_id: RelationId::parse(&claim.relation_id)
            .map_err(|error| invalid(error.to_string()))?,
        valid_time: parse_valid_time(valid_time)?,
        value: parse_exact_value(value)?,
    })
}

pub(crate) fn parse_definition_reference(
    reference: &DefinitionReference,
) -> Result<CoreDefinitionReference, ConnectError> {
    Ok(CoreDefinitionReference {
        definition_id: DefinitionId::parse(&reference.definition_id)
            .map_err(|error| invalid(error.to_string()))?,
        digest: DefinitionDigest::parse(&reference.digest)
            .map_err(|error| invalid(error.to_string()))?,
        revision: DefinitionRevisionNumber::new(reference.revision)
            .ok_or_else(|| invalid("definition revision must be positive"))?,
    })
}

pub(crate) fn parse_exact_value(value: &ExactValue) -> Result<CoreExactValue, ConnectError> {
    match value
        .value
        .as_ref()
        .ok_or_else(|| invalid("exact value variant is required"))?
    {
        exact_value::Value::BoolValue(value) => Ok(CoreExactValue::Bool(*value)),
        exact_value::Value::DecimalValue(value) => ExactDecimal::parse(value)
            .map(CoreExactValue::Decimal)
            .map_err(|error| invalid(error.to_string())),
        exact_value::Value::EntityRefValue(value) => EntityId::parse(value)
            .map(CoreExactValue::Entity)
            .map_err(|error| invalid(error.to_string())),
        exact_value::Value::IntegerValue(value) => ExactInteger::parse(value)
            .map(CoreExactValue::Integer)
            .map_err(|error| invalid(error.to_string())),
        exact_value::Value::QuantityValue(value) => Ok(CoreExactValue::Quantity {
            amount: ExactDecimal::parse(&value.amount)
                .map_err(|error| invalid(error.to_string()))?,
            unit: UnitId::parse(&value.unit).map_err(|error| invalid(error.to_string()))?,
        }),
        exact_value::Value::TextValue(value) => Ok(CoreExactValue::Text(value.clone())),
    }
}

fn parse_valid_time(
    value: &crate::proto::zoen::world::v1::ValidTime,
) -> Result<ValidTime, ConnectError> {
    match value
        .value
        .as_ref()
        .ok_or_else(|| invalid("valid_time variant is required"))?
    {
        valid_time::Value::Instant(value) => Ok(ValidTime::instant(parse_timestamp(value)?)),
        valid_time::Value::Interval(value) => {
            let start = value
                .start
                .as_option()
                .ok_or_else(|| invalid("valid_time interval start is required"))?;
            let end = value
                .end
                .as_option()
                .ok_or_else(|| invalid("valid_time interval end is required"))?;
            ValidTime::interval(parse_timestamp(start)?, parse_timestamp(end)?)
                .map_err(|error| invalid(error.to_string()))
        }
    }
}

pub(crate) fn parse_selection(
    selection: &crate::proto::zoen::world::v1::QuerySelection,
) -> Result<SemanticSelection, ConnectError> {
    match selection
        .value
        .as_ref()
        .ok_or_else(|| invalid("query selection variant is required"))?
    {
        query_selection::Value::RelationId(value) => RelationId::parse(value)
            .map(SemanticSelection::Relation)
            .map_err(|error| invalid(error.to_string())),
        query_selection::Value::ComputationId(value) => ComputationId::parse(value)
            .map(SemanticSelection::Computation)
            .map_err(|error| invalid(error.to_string())),
    }
}

fn parse_consistency(
    consistency: &crate::proto::zoen::world::v1::QueryConsistency,
) -> Result<Consistency, ConnectError> {
    match consistency
        .value
        .as_ref()
        .ok_or_else(|| invalid("query consistency variant is required"))?
    {
        query_consistency::Value::Strong(_) => Ok(Consistency::Strong),
        query_consistency::Value::AtLeastCommit(value) => CommitSequence::new(*value)
            .map(Consistency::AtLeast)
            .ok_or_else(|| invalid("at_least commit must be positive")),
        query_consistency::Value::SnapshotCommit(value) => CommitSequence::new(*value)
            .map(Consistency::Snapshot)
            .ok_or_else(|| invalid("snapshot commit must be positive")),
        query_consistency::Value::Eventual(_) => Ok(Consistency::Eventual),
    }
}

fn parse_optional_operation_id(
    value: impl AsRef<str>,
) -> Result<Option<OperationId>, ConnectError> {
    let value = value.as_ref();
    if value.is_empty() {
        return Ok(None);
    }
    OperationId::parse(value)
        .map(Some)
        .map_err(|error| invalid(error.to_string()))
}

fn parse_optional_timestamp(
    value: Option<&Timestamp>,
) -> Result<Option<TimestampMicros>, ConnectError> {
    value.map(parse_timestamp).transpose()
}

fn now() -> Result<TimestampMicros, ConnectError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    let micros = i64::try_from(duration.as_micros())
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?;
    Ok(TimestampMicros::new(micros))
}

pub(crate) fn parse_timestamp(value: &Timestamp) -> Result<TimestampMicros, ConnectError> {
    if !(0..1_000_000_000).contains(&value.nanos) || value.nanos % 1_000 != 0 {
        return Err(invalid(
            "timestamp nanos must be normalized to microsecond precision",
        ));
    }
    let micros = value
        .seconds
        .checked_mul(1_000_000)
        .and_then(|seconds| seconds.checked_add(i64::from(value.nanos / 1_000)))
        .ok_or_else(|| invalid("timestamp exceeds normalized microsecond range"))?;
    Ok(TimestampMicros::new(micros))
}

fn to_query_response(result: SemanticResult) -> SemanticQueryResponse {
    SemanticQueryResponse {
        actual_commit_sequence: result.actual_commit_sequence.get(),
        definition: Some(to_definition_reference(&result.definition)).into(),
        knowledge_cut: result.knowledge_cut.get(),
        next_page_token: result.next_page_token,
        valid_at: Some(to_timestamp(result.valid_at)).into(),
        values: result
            .values
            .into_iter()
            .map(|value| SemanticValueResult {
                dependencies: value
                    .dependencies
                    .into_iter()
                    .map(|dependency| LineageDependency {
                        claim_id: dependency.claim_id.as_str().to_owned(),
                        commit_sequence: dependency.commit_sequence.get(),
                        entity_id: dependency.entity_id.as_str().to_owned(),
                        migration: dependency
                            .migration
                            .map(|origin| MigrationOrigin {
                                operation_id: origin.operation_id.as_str().to_owned(),
                                rule_id: origin.rule_id.as_str().to_owned(),
                                rule_kind: origin.kind.as_str().to_owned(),
                                source_claim_ids: origin
                                    .source_claim_ids
                                    .into_iter()
                                    .map(|claim_id| claim_id.as_str().to_owned())
                                    .collect(),
                                ..Default::default()
                            })
                            .into(),
                        relation_id: dependency.relation_id.as_str().to_owned(),
                        role: match dependency.role {
                            CoreLineageRole::ComputationDependency => {
                                LineageRole::ComputationDependency
                            }
                            CoreLineageRole::Rival => LineageRole::Rival,
                            CoreLineageRole::Supporting => LineageRole::Supporting,
                        }
                        .into(),
                        source_digest: dependency.source_digest.as_str().to_owned(),
                        source_id: dependency.source_id.as_str().to_owned(),
                        source_ref: dependency.source_ref,
                        ..Default::default()
                    })
                    .collect(),
                value: Some(to_exact_value(value.value)).into(),
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    }
}

pub(crate) fn to_definition_reference(reference: &CoreDefinitionReference) -> DefinitionReference {
    DefinitionReference {
        definition_id: reference.definition_id.as_str().to_owned(),
        digest: reference.digest.as_str().to_owned(),
        revision: reference.revision.get(),
        ..Default::default()
    }
}

pub(crate) fn to_exact_value(value: CoreExactValue) -> ExactValue {
    let value = match value {
        CoreExactValue::Bool(value) => exact_value::Value::BoolValue(value),
        CoreExactValue::Decimal(value) => {
            exact_value::Value::DecimalValue(value.as_str().to_owned())
        }
        CoreExactValue::Entity(value) => {
            exact_value::Value::EntityRefValue(value.as_str().to_owned())
        }
        CoreExactValue::Integer(value) => {
            exact_value::Value::IntegerValue(value.as_str().to_owned())
        }
        CoreExactValue::Quantity { amount, unit } => {
            exact_value::Value::QuantityValue(Box::new(QuantityValue {
                amount: amount.as_str().to_owned(),
                unit: unit.as_str().to_owned(),
                ..Default::default()
            }))
        }
        CoreExactValue::Text(value) => exact_value::Value::TextValue(value),
    };
    ExactValue {
        value: Some(value),
        ..Default::default()
    }
}

pub(crate) fn to_timestamp(value: TimestampMicros) -> Timestamp {
    Timestamp {
        nanos: i32::try_from(value.get().rem_euclid(1_000_000).saturating_mul(1_000)).unwrap_or(0),
        seconds: value.get().div_euclid(1_000_000),
        ..Default::default()
    }
}

fn map_record_error(error: RecordEvidenceError) -> ConnectError {
    match error {
        RecordEvidenceError::EventEncoding(_) => {
            ConnectError::new(ErrorCode::Internal, error.to_string())
        }
        RecordEvidenceError::InvalidEvidence(_) => {
            ConnectError::new(ErrorCode::InvalidArgument, error.to_string())
        }
        RecordEvidenceError::Store(error) => crate::service::map_store_error(&error),
    }
}

fn map_read_error(error: ReadError) -> ConnectError {
    match error {
        ReadError::Evaluation(message) => ConnectError::new(ErrorCode::FailedPrecondition, message),
        ReadError::Invalid(message) => ConnectError::new(ErrorCode::InvalidArgument, message),
        ReadError::Query(QueryPortError::Corrupt(message)) => {
            ConnectError::new(ErrorCode::DataLoss, message)
        }
        ReadError::Query(QueryPortError::Evaluation(message)) => {
            ConnectError::new(ErrorCode::FailedPrecondition, message)
        }
        ReadError::Query(QueryPortError::Freshness {
            available,
            requested,
        }) => ConnectError::new(
            ErrorCode::FailedPrecondition,
            format!("projection watermark {available:?} is below requested commit {requested}"),
        ),
        ReadError::Query(QueryPortError::Invalid(message)) => {
            ConnectError::new(ErrorCode::InvalidArgument, message)
        }
        ReadError::Query(QueryPortError::Unavailable(message)) => {
            ConnectError::new(ErrorCode::Unavailable, message)
        }
    }
}

pub(crate) fn invalid(message: impl Into<String>) -> ConnectError {
    ConnectError::new(ErrorCode::InvalidArgument, message.into())
}

fn parse_optional_scenario_id(value: &str) -> Result<Option<ScenarioId>, ConnectError> {
    if value.is_empty() {
        Ok(None)
    } else {
        ScenarioId::parse(value)
            .map(Some)
            .map_err(|error| invalid(error.to_string()))
    }
}

fn now_micros() -> Result<TimestampMicros, ConnectError> {
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| ConnectError::new(ErrorCode::Internal, error.to_string()))?
        .as_micros();
    i64::try_from(micros)
        .map(TimestampMicros::new)
        .map_err(|_| ConnectError::new(ErrorCode::Internal, "timestamp overflow"))
}

fn map_scenario_error(error: ScenarioError) -> ConnectError {
    match error {
        ScenarioError::NotFound | ScenarioError::NotOpen => {
            ConnectError::new(ErrorCode::NotFound, error.to_string())
        }
        ScenarioError::Invalid(message) => invalid(message),
        ScenarioError::Store(error) => ConnectError::new(ErrorCode::Unavailable, error.to_string()),
        ScenarioError::Action(error) => {
            ConnectError::new(ErrorCode::FailedPrecondition, error.to_string())
        }
    }
}
