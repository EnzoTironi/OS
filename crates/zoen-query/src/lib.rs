use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::Arc;

use datafusion::execution::object_store::ObjectStoreUrl;
use datafusion::logical_expr::Expr;
use datafusion::prelude::{ParquetReadOptions, SessionContext, col, lit};
use object_store::memory::InMemory;
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_adapters::{PostgresClaimLoader, PostgresClaimQuery, PostgresTypeQuery};
use zoen_core::{
    CanonicalDefinition, CanonicalJson, ClaimId, CommitSequence, Consistency, DefinitionReference,
    EntityId, EvidenceDigest, ExactDecimal, ExactInteger, ExactValue, ExecutionContext, Expression,
    LineageDependency, LineageRole, MigrationOrigin, MigrationRuleId, MigrationRuleKind,
    OperationId, RelationId, SemanticQuery, SemanticResult, SemanticSelection, SemanticValue,
    SourceId, TenantId, TimestampMicros, TypeId, UnitId, expression_relations,
};
use zoen_engine::{
    QueryExecutor, QueryPortError, SemanticClaim, StoreError, decode_canonical_definition,
    evaluate_semantic_claims,
};

mod physical;
mod projection;
mod storage;

use physical::{PhysicalClaim, batches_to_claims, batches_to_entity_ids};
use projection::load_source_state;
pub use projection::{ProjectionMode, ProjectionOutcome, ProjectionRunOptions, ProjectionWorker};
pub use storage::ObjectStoreConfig;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QueryError {
    Corrupt(String),
    Evaluation(String),
    Freshness {
        available: Option<u64>,
        requested: u64,
    },
    Invalid(String),
    Unavailable(String),
}

impl Display for QueryError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Corrupt(message) => write!(formatter, "query data is corrupt: {message}"),
            Self::Evaluation(message) => write!(formatter, "query evaluation failed: {message}"),
            Self::Freshness {
                available,
                requested,
            } => match available {
                Some(available) => write!(
                    formatter,
                    "projection watermark {available} is below requested commit {requested}"
                ),
                None => write!(
                    formatter,
                    "no projection is available for requested commit {requested}"
                ),
            },
            Self::Invalid(message) => write!(formatter, "invalid semantic query: {message}"),
            Self::Unavailable(message) => write!(formatter, "query source unavailable: {message}"),
        }
    }
}

impl Error for QueryError {}

#[derive(Clone)]
pub struct QueryRuntime {
    claim_loader: PostgresClaimLoader,
    object_store_config: Option<ObjectStoreConfig>,
    pool: PgPool,
}

impl QueryRuntime {
    pub fn new(pool: PgPool, object_store_config: Option<ObjectStoreConfig>) -> Self {
        Self {
            claim_loader: PostgresClaimLoader::new(pool.clone()),
            object_store_config,
            pool,
        }
    }

    pub async fn execute(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
    ) -> Result<SemanticResult, QueryError> {
        let source = self
            .select_source(context.tenant_id(), query.consistency())
            .await?;
        let cut = source.cut();
        let canonical_json = self
            .load_definition(context.tenant_id(), query.definition(), cut)
            .await?;
        let definition = decode_canonical_definition(&canonical_json)
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        let values = match query {
            SemanticQuery::ByEntity { .. } => {
                self.execute_by_entity(context, query, &definition, &source, cut)
                    .await?
            }
            SemanticQuery::ByType { .. } => {
                self.execute_by_type(context, query, &definition, &source)
                    .await?
            }
        };
        let actual_commit_sequence = commit_sequence(cut, "query cut")?;
        Ok(SemanticResult {
            actual_commit_sequence,
            definition: query.definition().clone(),
            knowledge_cut: actual_commit_sequence,
            valid_at: query.valid_at(),
            values,
        })
    }

    async fn execute_by_entity(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
        definition: &CanonicalDefinition,
        source: &SourcePlan,
        cut: i64,
    ) -> Result<Vec<SemanticValue>, QueryError> {
        let SemanticQuery::ByEntity {
            definition: definition_ref,
            entity_id,
            selection,
            valid_at,
            ..
        } = query
        else {
            return Err(QueryError::Corrupt(
                "by-entity execution received a type query".to_owned(),
            ));
        };
        let plan = QueryPlan::new(selection, definition)?;
        let mut claims = match source {
            SourcePlan::Postgres { cut } => {
                let claims = self
                    .claim_loader
                    .load(
                        context,
                        &PostgresClaimQuery {
                            cut: commit_sequence(*cut, "query cut")?,
                            definition: definition_ref.clone(),
                            entity_id: entity_id.clone(),
                            relation_ids: plan
                                .relation_ids
                                .iter()
                                .map(RelationId::parse)
                                .collect::<Result<_, _>>()
                                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
                            valid_at: *valid_at,
                        },
                    )
                    .await
                    .map_err(adapter_error)?;
                claims.into_iter().map(SemanticClaim::from).collect()
            }
            SourcePlan::Projection {
                cut,
                parquet_digest,
                parquet_object_key,
            } => {
                self.load_projected_claims(
                    context,
                    definition_ref,
                    entity_id,
                    *valid_at,
                    &plan.relation_ids,
                    *cut,
                    parquet_digest,
                    parquet_object_key,
                )
                .await?
            }
        };
        let mut migration_origins = self
            .load_migration_origins(context.tenant_id(), &claims, cut)
            .await?;
        for claim in &mut claims {
            claim.dependency.migration =
                migration_origins.remove(claim.dependency.claim_id.as_str());
        }
        plan.evaluate(&claims)
    }

    async fn execute_by_type(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
        definition: &CanonicalDefinition,
        source: &SourcePlan,
    ) -> Result<Vec<SemanticValue>, QueryError> {
        let SemanticQuery::ByType {
            definition: definition_ref,
            limit,
            type_id,
            valid_at,
            ..
        } = query
        else {
            return Err(QueryError::Corrupt(
                "by-type execution received an entity query".to_owned(),
            ));
        };
        let limit = require_positive_limit(*limit)?;
        let relation_ids = relation_ids_for_type(definition, type_id)?;
        if relation_ids.is_empty() {
            return Ok(Vec::new());
        }
        let entity_ids = match source {
            SourcePlan::Postgres { cut } => self
                .claim_loader
                .load_entity_ids(
                    context,
                    &PostgresTypeQuery {
                        cut: commit_sequence(*cut, "query cut")?,
                        definition: definition_ref.clone(),
                        limit,
                        relation_ids: relation_ids
                            .iter()
                            .map(RelationId::parse)
                            .collect::<Result<_, _>>()
                            .map_err(|error| QueryError::Corrupt(error.to_string()))?,
                        valid_at: *valid_at,
                    },
                )
                .await
                .map_err(adapter_error)?,
            SourcePlan::Projection {
                cut,
                parquet_digest,
                parquet_object_key,
            } => {
                self.load_projected_entity_ids(
                    context,
                    definition_ref,
                    *valid_at,
                    &relation_ids,
                    limit,
                    *cut,
                    parquet_digest,
                    parquet_object_key,
                )
                .await?
            }
        };
        Ok(entity_values(entity_ids))
    }

    async fn select_source(
        &self,
        tenant_id: &TenantId,
        consistency: &Consistency,
    ) -> Result<SourcePlan, QueryError> {
        let state = load_source_state(&self.pool, tenant_id).await?;
        match consistency {
            Consistency::Strong => {
                if state.authority_head == 0 {
                    Err(QueryError::Invalid(
                        "tenant has no authoritative snapshot".to_owned(),
                    ))
                } else {
                    Ok(SourcePlan::Postgres {
                        cut: state.authority_head,
                    })
                }
            }
            Consistency::AtLeast(requested) => match state.projection {
                Some(projection)
                    if projection.through_commit
                        >= u64_to_i64(requested.get(), "requested commit")? =>
                {
                    Ok(SourcePlan::Projection {
                        cut: projection.through_commit,
                        parquet_digest: projection.parquet_digest,
                        parquet_object_key: projection.parquet_object_key,
                    })
                }
                projection => Err(QueryError::Freshness {
                    available: projection
                        .and_then(|value| u64::try_from(value.through_commit).ok()),
                    requested: requested.get(),
                }),
            },
            Consistency::Snapshot(requested) => {
                let requested_i64 = u64_to_i64(requested.get(), "snapshot commit")?;
                if requested_i64 > state.authority_head {
                    return Err(QueryError::Invalid(format!(
                        "snapshot commit {} is ahead of authority head {}",
                        requested.get(),
                        state.authority_head,
                    )));
                }
                match state.projection {
                    Some(projection) if projection.through_commit >= requested_i64 => {
                        Ok(SourcePlan::Projection {
                            cut: requested_i64,
                            parquet_digest: projection.parquet_digest,
                            parquet_object_key: projection.parquet_object_key,
                        })
                    }
                    _ => Ok(SourcePlan::Postgres { cut: requested_i64 }),
                }
            }
            Consistency::Eventual => match state.projection {
                Some(projection) => Ok(SourcePlan::Projection {
                    cut: projection.through_commit,
                    parquet_digest: projection.parquet_digest,
                    parquet_object_key: projection.parquet_object_key,
                }),
                None => Err(QueryError::Freshness {
                    available: None,
                    requested: 1,
                }),
            },
        }
    }

    async fn load_migration_origins(
        &self,
        tenant_id: &TenantId,
        claims: &[SemanticClaim],
        cut: i64,
    ) -> Result<BTreeMap<String, MigrationOrigin>, QueryError> {
        if claims.is_empty() {
            return Ok(BTreeMap::new());
        }
        let claim_ids = claims
            .iter()
            .map(|claim| claim.dependency.claim_id.as_str().to_owned())
            .collect::<Vec<_>>();
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let rows = sqlx::query(
            "SELECT record.target_claim_id, record.operation_id, record.rule_id,
                    record.rule_kind, lineage.source_claim_id
             FROM definition_migration_records AS record
             JOIN definition_migration_batches AS batch
               ON batch.tenant_id = record.tenant_id
              AND batch.operation_id = record.operation_id
              AND batch.batch_index = record.batch_index
             LEFT JOIN definition_migration_lineage AS lineage
               ON lineage.tenant_id = record.tenant_id
              AND lineage.operation_id = record.operation_id
              AND lineage.target_claim_id = record.target_claim_id
             WHERE record.tenant_id = $1
               AND record.target_claim_id = ANY($2::text[])
               AND batch.commit_sequence <= $3
             ORDER BY record.target_claim_id, lineage.source_claim_id",
        )
        .bind(tenant_id.as_str())
        .bind(claim_ids)
        .bind(cut)
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        let mut origins = BTreeMap::<String, MigrationOrigin>::new();
        for row in rows {
            let target_claim_id = row
                .try_get::<String, _>("target_claim_id")
                .map_err(unavailable)?;
            let operation_id = row
                .try_get::<String, _>("operation_id")
                .map_err(unavailable)?;
            let rule_id = row.try_get::<String, _>("rule_id").map_err(unavailable)?;
            let rule_kind = row.try_get::<String, _>("rule_kind").map_err(unavailable)?;
            let kind = MigrationRuleKind::parse(&rule_kind).ok_or_else(|| {
                QueryError::Corrupt(format!("unknown migration rule kind: {rule_kind}"))
            })?;
            let operation_id = OperationId::parse(operation_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?;
            let rule_id = MigrationRuleId::parse(rule_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?;
            let origin = origins
                .entry(target_claim_id)
                .or_insert_with(|| MigrationOrigin {
                    kind,
                    operation_id: operation_id.clone(),
                    rule_id: rule_id.clone(),
                    source_claim_ids: Vec::new(),
                });
            if origin.operation_id != operation_id
                || origin.rule_id != rule_id
                || origin.kind != kind
            {
                return Err(QueryError::Corrupt(
                    "a migrated claim has conflicting origin metadata".to_owned(),
                ));
            }
            if let Some(source_claim_id) = row
                .try_get::<Option<String>, _>("source_claim_id")
                .map_err(unavailable)?
            {
                origin.source_claim_ids.push(
                    ClaimId::parse(source_claim_id)
                        .map_err(|error| QueryError::Corrupt(error.to_string()))?,
                );
            }
        }
        Ok(origins)
    }

    async fn load_definition(
        &self,
        tenant_id: &TenantId,
        reference: &DefinitionReference,
        cut: i64,
    ) -> Result<CanonicalJson, QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT canonical_json, revision, commit_sequence
             FROM definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3",
        )
        .bind(tenant_id.as_str())
        .bind(reference.definition_id.as_str())
        .bind(reference.digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .ok_or_else(|| QueryError::Invalid("definition revision was not found".to_owned()))?;
        let revision = row.try_get::<i64, _>("revision").map_err(unavailable)?;
        let definition_commit = row
            .try_get::<i64, _>("commit_sequence")
            .map_err(unavailable)?;
        let canonical_json = row
            .try_get::<String, _>("canonical_json")
            .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        if revision != u64_to_i64(reference.revision.get(), "definition revision")? {
            return Err(QueryError::Invalid(
                "definition digest and revision do not match".to_owned(),
            ));
        }
        if definition_commit > cut {
            return Err(QueryError::Invalid(
                "definition revision did not exist at the requested snapshot".to_owned(),
            ));
        }
        CanonicalJson::new(canonical_json)
            .ok_or_else(|| QueryError::Corrupt("stored canonical definition is empty".to_owned()))
    }

    #[allow(clippy::too_many_arguments)]
    async fn load_projected_claims(
        &self,
        context: &ExecutionContext,
        definition: &DefinitionReference,
        entity_id: &EntityId,
        valid_at: TimestampMicros,
        relation_ids: &BTreeSet<String>,
        cut: i64,
        parquet_digest: &str,
        parquet_object_key: &str,
    ) -> Result<Vec<SemanticClaim>, QueryError> {
        let data = self
            .scan_projected_claims(
                context,
                definition,
                Some(entity_id),
                valid_at,
                relation_ids,
                cut,
                parquet_digest,
                parquet_object_key,
            )
            .await?
            .sort(vec![col("claim_id").sort(true, true)])
            .map_err(projected_corrupt)?
            .collect()
            .await
            .map_err(projected_corrupt)?;
        batches_to_claims(&data)?
            .into_iter()
            .map(|claim| parse_claim(claim, context, definition, entity_id, valid_at))
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    async fn load_projected_entity_ids(
        &self,
        context: &ExecutionContext,
        definition: &DefinitionReference,
        valid_at: TimestampMicros,
        relation_ids: &BTreeSet<String>,
        limit: u32,
        cut: i64,
        parquet_digest: &str,
        parquet_object_key: &str,
    ) -> Result<Vec<EntityId>, QueryError> {
        let data = self
            .scan_projected_claims(
                context,
                definition,
                None,
                valid_at,
                relation_ids,
                cut,
                parquet_digest,
                parquet_object_key,
            )
            .await?
            .select(vec![col("entity_id")])
            .map_err(projected_corrupt)?
            .distinct()
            .map_err(projected_corrupt)?
            .limit(
                0,
                Some(usize::try_from(limit).map_err(|_| {
                    QueryError::Invalid("type query limit exceeds usize".to_owned())
                })?),
            )
            .map_err(projected_corrupt)?
            .collect()
            .await
            .map_err(projected_corrupt)?;
        batches_to_entity_ids(&data)?
            .into_iter()
            .map(|entity_id| {
                EntityId::parse(entity_id).map_err(|error| QueryError::Corrupt(error.to_string()))
            })
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    async fn scan_projected_claims(
        &self,
        context: &ExecutionContext,
        definition: &DefinitionReference,
        entity_id: Option<&EntityId>,
        valid_at: TimestampMicros,
        relation_ids: &BTreeSet<String>,
        cut: i64,
        parquet_digest: &str,
        parquet_object_key: &str,
    ) -> Result<datafusion::dataframe::DataFrame, QueryError> {
        let object_store_config = self.object_store_config.as_ref().ok_or_else(|| {
            QueryError::Unavailable("object storage is not configured".to_owned())
        })?;
        let source_store = object_store_config.build()?;
        let verified_store =
            verified_projection_store(&*source_store, parquet_object_key, parquet_digest).await?;
        let session = SessionContext::new();
        let store_url = ObjectStoreUrl::parse(object_store_config.registration_url())
            .map_err(|error| QueryError::Unavailable(error.to_string()))?;
        session.register_object_store(store_url.as_ref(), verified_store);
        let relation_filter = relation_or_filter(relation_ids)?;
        let valid_at = valid_at.get();
        let valid_filter = col("valid_time_kind")
            .eq(lit("instant"))
            .and(col("valid_from_micros").eq(lit(valid_at)))
            .or(col("valid_time_kind").eq(lit("interval")).and(
                col("valid_from_micros")
                    .lt_eq(lit(valid_at))
                    .and(col("valid_to_micros").gt(lit(valid_at))),
            ));
        let mut filter = col("tenant_id")
            .eq(lit(context.tenant_id().as_str()))
            .and(col("definition_id").eq(lit(definition.definition_id.as_str())))
            .and(col("definition_digest").eq(lit(definition.digest.as_str())))
            .and(col("definition_revision").eq(lit(u64_to_i64(
                definition.revision.get(),
                "definition revision",
            )?)))
            .and(relation_filter)
            .and(col("commit_sequence").lt_eq(lit(cut)))
            .and(valid_filter);
        if let Some(entity_id) = entity_id {
            filter = filter.and(col("entity_id").eq(lit(entity_id.as_str())));
        }
        session
            .read_parquet(
                object_store_config.object_url(parquet_object_key),
                ParquetReadOptions::default(),
            )
            .await
            .map_err(projected_corrupt)?
            .filter(filter)
            .map_err(projected_corrupt)
    }
}

impl QueryExecutor for QueryRuntime {
    async fn execute(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
    ) -> Result<SemanticResult, QueryPortError> {
        QueryRuntime::execute(self, context, query)
            .await
            .map_err(|error| match error {
                QueryError::Corrupt(message) => QueryPortError::Corrupt(message),
                QueryError::Evaluation(message) => QueryPortError::Evaluation(message),
                QueryError::Freshness {
                    available,
                    requested,
                } => QueryPortError::Invalid(format!(
                    "projection watermark {available:?} is below requested commit {requested}"
                )),
                QueryError::Invalid(message) => QueryPortError::Invalid(message),
                QueryError::Unavailable(message) => QueryPortError::Unavailable(message),
            })
    }
}

async fn verified_projection_store(
    source: &dyn ObjectStore,
    parquet_object_key: &str,
    expected_digest: &str,
) -> Result<Arc<dyn ObjectStore>, QueryError> {
    let path = Path::from(parquet_object_key);
    let bytes = source
        .get(&path)
        .await
        .map_err(|error| QueryError::Unavailable(error.to_string()))?
        .bytes()
        .await
        .map_err(|error| QueryError::Unavailable(error.to_string()))?;
    let actual_digest = sha256(&bytes);
    if actual_digest != expected_digest {
        return Err(QueryError::Corrupt(format!(
            "Parquet object {parquet_object_key} has digest {actual_digest}, expected {expected_digest}"
        )));
    }
    let verified = InMemory::new();
    verified
        .put(&path, bytes.into())
        .await
        .map_err(|error| QueryError::Unavailable(error.to_string()))?;
    Ok(Arc::new(verified))
}

enum SourcePlan {
    Postgres {
        cut: i64,
    },
    Projection {
        cut: i64,
        parquet_digest: String,
        parquet_object_key: String,
    },
}

impl SourcePlan {
    fn cut(&self) -> i64 {
        match self {
            Self::Postgres { cut } | Self::Projection { cut, .. } => *cut,
        }
    }
}

fn parse_claim(
    physical: PhysicalClaim,
    context: &ExecutionContext,
    definition: &DefinitionReference,
    entity_id: &EntityId,
    valid_at: TimestampMicros,
) -> Result<SemanticClaim, QueryError> {
    if physical.tenant_id != context.tenant_id().as_str()
        || physical.definition_id != definition.definition_id.as_str()
        || physical.definition_digest != definition.digest.as_str()
        || physical.definition_revision
            != u64_to_i64(definition.revision.get(), "definition revision")?
        || physical.entity_id != entity_id.as_str()
    {
        return Err(QueryError::Corrupt(
            "physical provider returned a row outside the semantic query scope".to_owned(),
        ));
    }
    if !matches!(physical.valid_time_kind.as_str(), "instant" | "interval")
        || physical.valid_time_kind == "instant" && physical.valid_to_micros.is_some()
        || physical.valid_time_kind == "interval"
            && physical
                .valid_to_micros
                .is_none_or(|end| physical.valid_from_micros >= end)
        || physical.valid_time_kind == "instant" && physical.valid_from_micros != valid_at.get()
        || physical.valid_time_kind == "interval"
            && !(physical.valid_from_micros <= valid_at.get()
                && valid_at.get()
                    < physical
                        .valid_to_micros
                        .unwrap_or(physical.valid_from_micros))
    {
        return Err(QueryError::Corrupt(
            "physical provider returned an invalid valid-time row".to_owned(),
        ));
    }
    let value = parse_value(&physical)?;
    Ok(SemanticClaim {
        dependency: LineageDependency {
            claim_id: ClaimId::parse(physical.claim_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            commit_sequence: commit_sequence(physical.commit_sequence, "claim commit sequence")?,
            entity_id: EntityId::parse(physical.entity_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            migration: None,
            relation_id: RelationId::parse(physical.relation_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            role: LineageRole::Supporting,
            source_digest: EvidenceDigest::parse(physical.source_digest)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            source_id: SourceId::parse(physical.source_id)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            source_ref: physical.source_ref,
        },
        value,
    })
}

struct QueryPlan {
    expression: Expression,
    relation_ids: BTreeSet<String>,
    relation_role: LineageRole,
}

impl QueryPlan {
    fn new(
        selection: &SemanticSelection,
        definition: &CanonicalDefinition,
    ) -> Result<Self, QueryError> {
        match selection {
            SemanticSelection::Relation(relation_id) => {
                if !definition
                    .relations
                    .iter()
                    .any(|relation| relation.id == *relation_id)
                {
                    return Err(QueryError::Invalid(format!(
                        "definition has no relation: {}",
                        relation_id.as_str()
                    )));
                }
                Ok(Self {
                    expression: Expression::Relation(relation_id.clone()),
                    relation_ids: BTreeSet::from([relation_id.as_str().to_owned()]),
                    relation_role: LineageRole::Supporting,
                })
            }
            SemanticSelection::Computation(computation_id) => {
                let computation = definition
                    .computations
                    .iter()
                    .find(|candidate| candidate.id == *computation_id)
                    .ok_or_else(|| {
                        QueryError::Invalid(format!(
                            "definition has no computation: {}",
                            computation_id.as_str()
                        ))
                    })?;
                let relation_ids = expression_relations(&computation.expression)
                    .into_iter()
                    .map(|relation_id| relation_id.as_str().to_owned())
                    .collect::<BTreeSet<_>>();
                if relation_ids.is_empty() {
                    return Err(QueryError::Invalid(format!(
                        "computation {} has no relation dependencies",
                        computation_id.as_str()
                    )));
                }
                Ok(Self {
                    expression: computation.expression.clone(),
                    relation_ids,
                    relation_role: LineageRole::ComputationDependency,
                })
            }
        }
    }

    fn evaluate(&self, claims: &[SemanticClaim]) -> Result<Vec<SemanticValue>, QueryError> {
        evaluate_semantic_claims(&self.expression, claims, self.relation_role)
            .map_err(|error| QueryError::Evaluation(error.to_string()))
    }
}

fn require_positive_limit(limit: u32) -> Result<u32, QueryError> {
    if limit == 0 {
        Err(QueryError::Invalid(
            "type query limit must be positive".to_owned(),
        ))
    } else {
        Ok(limit)
    }
}

fn relation_ids_for_type(
    definition: &CanonicalDefinition,
    type_id: &TypeId,
) -> Result<BTreeSet<String>, QueryError> {
    if !definition
        .types
        .iter()
        .any(|candidate| candidate.id == *type_id)
    {
        return Err(QueryError::Invalid(format!(
            "definition has no type: {}",
            type_id.as_str()
        )));
    }
    Ok(definition
        .relations
        .iter()
        .filter(|relation| relation.source_type == *type_id)
        .map(|relation| relation.id.as_str().to_owned())
        .collect())
}

fn entity_values(entity_ids: Vec<EntityId>) -> Vec<SemanticValue> {
    entity_ids
        .into_iter()
        .map(|entity_id| SemanticValue {
            dependencies: Vec::new(),
            value: ExactValue::Entity(entity_id),
        })
        .collect()
}

fn relation_or_filter(relation_ids: &BTreeSet<String>) -> Result<Expr, QueryError> {
    let mut relation_filter: Option<Expr> = None;
    for relation_id in relation_ids {
        let current = col("relation_id").eq(lit(relation_id.clone()));
        relation_filter = Some(match relation_filter {
            Some(existing) => existing.or(current),
            None => current,
        });
    }
    relation_filter.ok_or_else(|| QueryError::Invalid("query plan has no relations".to_owned()))
}

fn parse_value(physical: &PhysicalClaim) -> Result<ExactValue, QueryError> {
    match physical.value_kind.as_str() {
        "bool" => match physical.value_text.as_str() {
            "true" => Ok(ExactValue::Bool(true)),
            "false" => Ok(ExactValue::Bool(false)),
            value => Err(QueryError::Corrupt(format!(
                "invalid projected boolean: {value}"
            ))),
        },
        "decimal" => ExactDecimal::parse(&physical.value_text)
            .map(ExactValue::Decimal)
            .map_err(|error| QueryError::Corrupt(error.to_string())),
        "entity" => EntityId::parse(&physical.value_text)
            .map(ExactValue::Entity)
            .map_err(|error| QueryError::Corrupt(error.to_string())),
        "integer" => ExactInteger::parse(&physical.value_text)
            .map(ExactValue::Integer)
            .map_err(|error| QueryError::Corrupt(error.to_string())),
        "quantity" => {
            Ok(ExactValue::Quantity {
                amount: ExactDecimal::parse(&physical.value_text)
                    .map_err(|error| QueryError::Corrupt(error.to_string()))?,
                unit: UnitId::parse(physical.value_unit.as_deref().ok_or_else(|| {
                    QueryError::Corrupt("projected quantity has no unit".to_owned())
                })?)
                .map_err(|error| QueryError::Corrupt(error.to_string()))?,
            })
        }
        "text" => Ok(ExactValue::Text(physical.value_text.clone())),
        kind => Err(QueryError::Corrupt(format!(
            "unknown projected value kind: {kind}"
        ))),
    }
}

async fn set_tenant(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
) -> Result<(), QueryError> {
    sqlx::query("SELECT set_config('zoen.tenant_id', $1, true)")
        .bind(tenant_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(unavailable)?;
    Ok(())
}

fn commit_sequence(value: i64, name: &str) -> Result<CommitSequence, QueryError> {
    CommitSequence::new(
        u64::try_from(value)
            .map_err(|_| QueryError::Corrupt(format!("{name} is negative or out of range")))?,
    )
    .ok_or_else(|| QueryError::Corrupt(format!("{name} is zero")))
}

fn u64_to_i64(value: u64, name: &str) -> Result<i64, QueryError> {
    i64::try_from(value).map_err(|_| QueryError::Invalid(format!("{name} exceeds i64")))
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn unavailable(error: sqlx::Error) -> QueryError {
    QueryError::Unavailable(error.to_string())
}

fn adapter_error(error: StoreError) -> QueryError {
    match error {
        StoreError::Conflict(message) | StoreError::Corrupt(message) => {
            QueryError::Corrupt(message)
        }
        StoreError::IdentityCollision(_) => {
            QueryError::Corrupt("unexpected Action identity collision".to_owned())
        }
        StoreError::InactiveDefinition => {
            QueryError::Corrupt("unexpected inactive definition precondition".to_owned())
        }
        StoreError::NotFound => QueryError::Invalid("claim source was not found".to_owned()),
        StoreError::OperationMismatch => {
            QueryError::Corrupt("unexpected Action operation mismatch".to_owned())
        }
        StoreError::StalePrecondition => {
            QueryError::Corrupt("unexpected stale activation precondition".to_owned())
        }
        StoreError::Unavailable(message) => QueryError::Unavailable(message),
    }
}

fn projected_corrupt(error: datafusion::error::DataFusionError) -> QueryError {
    QueryError::Corrupt(error.to_string())
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        Cardinality, DefinitionId, DefinitionRevisionNumber, DefinitionSchema, RelationDefinition,
        RelationTarget, TypeDefinition, ValueType,
    };

    use super::*;

    fn item_definition() -> CanonicalDefinition {
        CanonicalDefinition {
            actions: Vec::new(),
            computations: Vec::new(),
            id: DefinitionId::parse("world.definition").expect("definition"),
            relations: vec![RelationDefinition {
                cardinality: Cardinality::One,
                id: RelationId::parse("world.onHand").expect("relation"),
                source_type: TypeId::parse("world.Item").expect("type"),
                target: RelationTarget::Value(ValueType::Integer),
            }],
            revision: DefinitionRevisionNumber::new(1).expect("revision"),
            schema: DefinitionSchema::V1,
            types: vec![TypeDefinition {
                attributes: Vec::new(),
                id: TypeId::parse("world.Item").expect("type"),
            }],
        }
    }

    #[test]
    fn type_query_rejects_unknown_type() {
        let error = relation_ids_for_type(
            &item_definition(),
            &TypeId::parse("world.Bin").expect("type"),
        )
        .expect_err("unknown type");
        assert!(matches!(error, QueryError::Invalid(_)));
    }

    #[test]
    fn type_query_collects_source_relations() {
        let relation_ids = relation_ids_for_type(
            &item_definition(),
            &TypeId::parse("world.Item").expect("type"),
        )
        .expect("type");
        assert_eq!(relation_ids, BTreeSet::from(["world.onHand".to_owned()]));
    }

    #[test]
    fn type_query_rejects_zero_limit() {
        let error = require_positive_limit(0).expect_err("zero limit");
        assert!(matches!(error, QueryError::Invalid(_)));
    }

    #[test]
    fn type_query_values_are_entity_ids_without_hydration() {
        let values = entity_values(vec![
            EntityId::parse("entity.bin.one").expect("entity"),
            EntityId::parse("entity.bin.two").expect("entity"),
        ]);
        assert_eq!(values.len(), 2);
        for value in values {
            assert!(value.dependencies.is_empty());
            assert!(matches!(value.value, ExactValue::Entity(_)));
        }
    }
}
