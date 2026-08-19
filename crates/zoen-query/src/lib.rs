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
use zoen_core::{
    BinaryOperator, CanonicalDefinition, CanonicalJson, ClaimId, CommitSequence, Consistency,
    DefinitionReference, EntityId, EvidenceDigest, ExactDecimal, ExactInteger, ExactValue,
    ExecutionContext, Expression, LineageDependency, LineageRole, RelationId, SemanticQuery,
    SemanticResult, SemanticSelection, SemanticValue, SourceId, TenantId, UnitId,
};
use zoen_engine::decode_canonical_definition;

mod physical;
mod projection;
mod storage;

use physical::{PhysicalClaim, batches_to_claims};
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
    object_store_config: Option<ObjectStoreConfig>,
    pool: PgPool,
}

impl QueryRuntime {
    pub fn new(pool: PgPool, object_store_config: Option<ObjectStoreConfig>) -> Self {
        Self {
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
            .select_source(&context.tenant_id, &query.consistency)
            .await?;
        let cut = source.cut();
        let canonical_json = self
            .load_definition(&context.tenant_id, &query.definition, cut)
            .await?;
        let definition = decode_canonical_definition(&canonical_json)
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        let plan = QueryPlan::new(&query.selection, &definition)?;
        let claims = match &source {
            SourcePlan::Postgres { cut } => {
                self.load_postgres_claims(context, query, &plan.relation_ids, *cut)
                    .await?
            }
            SourcePlan::Projection {
                cut,
                parquet_digest,
                parquet_object_key,
            } => {
                self.load_projected_claims(
                    context,
                    query,
                    &plan.relation_ids,
                    *cut,
                    parquet_digest,
                    parquet_object_key,
                )
                .await?
            }
        };
        let values = plan.evaluate(&claims)?;
        let actual_commit_sequence = commit_sequence(cut, "query cut")?;
        Ok(SemanticResult {
            actual_commit_sequence,
            definition: query.definition.clone(),
            knowledge_cut: actual_commit_sequence,
            valid_at: query.valid_at,
            values,
        })
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

    async fn load_postgres_claims(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
        relation_ids: &BTreeSet<String>,
        cut: i64,
    ) -> Result<Vec<ClaimRecord>, QueryError> {
        let relations = relation_ids.iter().cloned().collect::<Vec<_>>();
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, &context.tenant_id).await?;
        let rows = sqlx::query(
            "SELECT tenant_id, claim_id, definition_id, definition_digest,
                    definition_revision, entity_id, relation_id, value_kind, value_text,
                    value_unit, valid_time_kind, valid_from_micros, valid_to_micros,
                    source_id, source_digest, source_ref, commit_sequence
             FROM semantic_claims
             WHERE tenant_id = $1
               AND definition_id = $2
               AND definition_digest = $3
               AND definition_revision = $4
               AND entity_id = $5
               AND relation_id = ANY($6)
               AND commit_sequence <= $7
               AND (
                    (valid_time_kind = 'instant' AND valid_from_micros = $8)
                    OR (
                        valid_time_kind = 'interval'
                        AND valid_from_micros <= $8
                        AND valid_to_micros > $8
                    )
               )
             ORDER BY claim_id",
        )
        .bind(context.tenant_id.as_str())
        .bind(query.definition.definition_id.as_str())
        .bind(query.definition.digest.as_str())
        .bind(u64_to_i64(
            query.definition.revision.get(),
            "definition revision",
        )?)
        .bind(query.entity_id.as_str())
        .bind(relations)
        .bind(cut)
        .bind(query.valid_at.get())
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let physical = rows
            .iter()
            .map(PhysicalClaim::from_postgres)
            .collect::<Result<Vec<_>, _>>()?;
        transaction.commit().await.map_err(unavailable)?;
        physical
            .into_iter()
            .map(|claim| ClaimRecord::parse(claim, context, query))
            .collect()
    }

    async fn load_projected_claims(
        &self,
        context: &ExecutionContext,
        query: &SemanticQuery,
        relation_ids: &BTreeSet<String>,
        cut: i64,
        parquet_digest: &str,
        parquet_object_key: &str,
    ) -> Result<Vec<ClaimRecord>, QueryError> {
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
        let mut relation_filter: Option<Expr> = None;
        for relation_id in relation_ids {
            let current = col("relation_id").eq(lit(relation_id.clone()));
            relation_filter = Some(match relation_filter {
                Some(existing) => existing.or(current),
                None => current,
            });
        }
        let relation_filter = relation_filter
            .ok_or_else(|| QueryError::Invalid("query plan has no relations".to_owned()))?;
        let valid_at = query.valid_at.get();
        let valid_filter = col("valid_time_kind")
            .eq(lit("instant"))
            .and(col("valid_from_micros").eq(lit(valid_at)))
            .or(col("valid_time_kind").eq(lit("interval")).and(
                col("valid_from_micros")
                    .lt_eq(lit(valid_at))
                    .and(col("valid_to_micros").gt(lit(valid_at))),
            ));
        let data = session
            .read_parquet(
                object_store_config.object_url(parquet_object_key),
                ParquetReadOptions::default(),
            )
            .await
            .map_err(projected_corrupt)?
            .filter(
                col("tenant_id")
                    .eq(lit(context.tenant_id.as_str()))
                    .and(col("definition_id").eq(lit(query.definition.definition_id.as_str())))
                    .and(col("definition_digest").eq(lit(query.definition.digest.as_str())))
                    .and(col("definition_revision").eq(lit(u64_to_i64(
                        query.definition.revision.get(),
                        "definition revision",
                    )?)))
                    .and(col("entity_id").eq(lit(query.entity_id.as_str())))
                    .and(relation_filter)
                    .and(col("commit_sequence").lt_eq(lit(cut)))
                    .and(valid_filter),
            )
            .map_err(projected_corrupt)?
            .sort(vec![col("claim_id").sort(true, true)])
            .map_err(projected_corrupt)?
            .collect()
            .await
            .map_err(projected_corrupt)?;
        batches_to_claims(&data)?
            .into_iter()
            .map(|claim| ClaimRecord::parse(claim, context, query))
            .collect()
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

struct ClaimRecord {
    dependency: LineageDependency,
    value: ExactValue,
}

impl ClaimRecord {
    fn parse(
        physical: PhysicalClaim,
        context: &ExecutionContext,
        query: &SemanticQuery,
    ) -> Result<Self, QueryError> {
        if physical.tenant_id != context.tenant_id.as_str()
            || physical.definition_id != query.definition.definition_id.as_str()
            || physical.definition_digest != query.definition.digest.as_str()
            || physical.definition_revision
                != u64_to_i64(query.definition.revision.get(), "definition revision")?
            || physical.entity_id != query.entity_id.as_str()
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
            || physical.valid_time_kind == "instant"
                && physical.valid_from_micros != query.valid_at.get()
            || physical.valid_time_kind == "interval"
                && !(physical.valid_from_micros <= query.valid_at.get()
                    && query.valid_at.get()
                        < physical
                            .valid_to_micros
                            .unwrap_or(physical.valid_from_micros))
        {
            return Err(QueryError::Corrupt(
                "physical provider returned an invalid valid-time row".to_owned(),
            ));
        }
        let value = parse_value(&physical)?;
        Ok(Self {
            dependency: LineageDependency {
                claim_id: ClaimId::parse(physical.claim_id)
                    .map_err(|error| QueryError::Corrupt(error.to_string()))?,
                commit_sequence: commit_sequence(
                    physical.commit_sequence,
                    "claim commit sequence",
                )?,
                entity_id: EntityId::parse(physical.entity_id)
                    .map_err(|error| QueryError::Corrupt(error.to_string()))?,
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

    fn dependency(&self, role: LineageRole) -> LineageDependency {
        let mut dependency = self.dependency.clone();
        dependency.role = role;
        dependency
    }
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
                let mut relation_ids = BTreeSet::new();
                collect_relations(&computation.expression, &mut relation_ids);
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

    fn evaluate(&self, claims: &[ClaimRecord]) -> Result<Vec<SemanticValue>, QueryError> {
        let by_relation = claims_by_relation(claims);
        let candidates = evaluate_expression(&self.expression, &by_relation, self.relation_role)?;
        let mut values = candidates
            .into_iter()
            .map(|candidate| {
                let selected_claims = candidate
                    .dependencies
                    .iter()
                    .map(|dependency| dependency.claim_id.as_str().to_owned())
                    .collect::<BTreeSet<_>>();
                let selected_relations = candidate
                    .dependencies
                    .iter()
                    .map(|dependency| dependency.relation_id.as_str().to_owned())
                    .collect::<BTreeSet<_>>();
                let mut dependencies = candidate.dependencies;
                dependencies.extend(
                    claims
                        .iter()
                        .filter(|claim| {
                            selected_relations.contains(claim.dependency.relation_id.as_str())
                                && !selected_claims.contains(claim.dependency.claim_id.as_str())
                        })
                        .map(|claim| claim.dependency(LineageRole::Rival)),
                );
                sort_dependencies(&mut dependencies);
                SemanticValue {
                    dependencies,
                    value: candidate.value,
                }
            })
            .collect::<Vec<_>>();
        sort_values(&mut values);
        Ok(values)
    }
}

struct Candidate {
    dependencies: Vec<LineageDependency>,
    value: ExactValue,
}

fn collect_relations(expression: &Expression, relations: &mut BTreeSet<String>) {
    match expression {
        Expression::Binary { left, right, .. } => {
            collect_relations(left, relations);
            collect_relations(right, relations);
        }
        Expression::Relation(relation_id) => {
            relations.insert(relation_id.as_str().to_owned());
        }
        Expression::Input(_) | Expression::Literal(_) => {}
    }
}

fn claims_by_relation(claims: &[ClaimRecord]) -> BTreeMap<&str, Vec<&ClaimRecord>> {
    let mut by_relation = BTreeMap::<&str, Vec<&ClaimRecord>>::new();
    for claim in claims {
        by_relation
            .entry(claim.dependency.relation_id.as_str())
            .or_default()
            .push(claim);
    }
    by_relation
}

fn evaluate_expression(
    expression: &Expression,
    claims: &BTreeMap<&str, Vec<&ClaimRecord>>,
    relation_role: LineageRole,
) -> Result<Vec<Candidate>, QueryError> {
    match expression {
        Expression::Binary {
            left,
            operator,
            right,
        } => {
            let left = evaluate_expression(left, claims, relation_role)?;
            let right = evaluate_expression(right, claims, relation_role)?;
            let mut combined = Vec::with_capacity(left.len().saturating_mul(right.len()));
            for left in &left {
                for right in &right {
                    let mut dependencies =
                        Vec::with_capacity(left.dependencies.len() + right.dependencies.len());
                    dependencies.extend(left.dependencies.iter().cloned());
                    dependencies.extend(right.dependencies.iter().cloned());
                    combined.push(Candidate {
                        dependencies,
                        value: apply_operator(*operator, &left.value, &right.value)?,
                    });
                }
            }
            Ok(combined)
        }
        Expression::Input(input_id) => Err(QueryError::Evaluation(format!(
            "computation input {} has no query binding",
            input_id.as_str()
        ))),
        Expression::Literal(value) => Ok(vec![Candidate {
            dependencies: Vec::new(),
            value: value.clone(),
        }]),
        Expression::Relation(relation_id) => Ok(claims
            .get(relation_id.as_str())
            .into_iter()
            .flatten()
            .map(|claim| Candidate {
                dependencies: vec![claim.dependency(relation_role)],
                value: claim.value.clone(),
            })
            .collect()),
    }
}

fn apply_operator(
    operator: BinaryOperator,
    left: &ExactValue,
    right: &ExactValue,
) -> Result<ExactValue, QueryError> {
    let (ExactValue::Integer(left), ExactValue::Integer(right)) = (left, right) else {
        return Err(QueryError::Evaluation(
            "V1 relation computation requires exact integer operands".to_owned(),
        ));
    };
    let left = left
        .as_str()
        .parse::<i128>()
        .map_err(|_| QueryError::Evaluation("left integer exceeds i128".to_owned()))?;
    let right = right
        .as_str()
        .parse::<i128>()
        .map_err(|_| QueryError::Evaluation("right integer exceeds i128".to_owned()))?;
    match operator {
        BinaryOperator::Add => checked_integer(left.checked_add(right), "addition"),
        BinaryOperator::GreaterThan => Ok(ExactValue::Bool(left > right)),
        BinaryOperator::Multiply => checked_integer(left.checked_mul(right), "multiplication"),
        BinaryOperator::Subtract => checked_integer(left.checked_sub(right), "subtraction"),
    }
}

fn checked_integer(value: Option<i128>, operation: &str) -> Result<ExactValue, QueryError> {
    let value = value
        .ok_or_else(|| QueryError::Evaluation(format!("integer {operation} overflowed i128")))?;
    Ok(ExactValue::Integer(
        ExactInteger::parse(value.to_string())
            .map_err(|error| QueryError::Evaluation(error.to_string()))?,
    ))
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

fn sort_dependencies(dependencies: &mut [LineageDependency]) {
    dependencies.sort_by(|left, right| {
        (
            left.role,
            left.relation_id.as_str(),
            left.claim_id.as_str(),
            left.commit_sequence,
        )
            .cmp(&(
                right.role,
                right.relation_id.as_str(),
                right.claim_id.as_str(),
                right.commit_sequence,
            ))
    });
}

fn sort_values(values: &mut [SemanticValue]) {
    values.sort_by(|left, right| {
        value_key(&left.value)
            .cmp(&value_key(&right.value))
            .then_with(|| {
                left.dependencies
                    .iter()
                    .map(|dependency| dependency.claim_id.as_str())
                    .cmp(
                        right
                            .dependencies
                            .iter()
                            .map(|dependency| dependency.claim_id.as_str()),
                    )
            })
    });
}

fn value_key(value: &ExactValue) -> String {
    match value {
        ExactValue::Bool(value) => format!("bool:{value}"),
        ExactValue::Decimal(value) => format!("decimal:{}", value.as_str()),
        ExactValue::Integer(value) => format!("integer:{}", value.as_str()),
        ExactValue::Quantity { amount, unit } => {
            format!("quantity:{}:{}", amount.as_str(), unit.as_str())
        }
        ExactValue::Text(value) => format!("text:{value}"),
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

fn projected_corrupt(error: datafusion::error::DataFusionError) -> QueryError {
    QueryError::Corrupt(error.to_string())
}
