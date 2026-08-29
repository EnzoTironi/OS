use std::collections::BTreeSet;

use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    CommitSequence, DefinitionReference, EntityId, EvidenceClaim, ExecutionContext, RelationId,
    TimestampMicros,
};
use zoen_engine::StoreError;

use crate::{SEMANTIC_CLAIM_COLUMNS, row_to_claim, set_tenant, store_unavailable, u64_to_i64};

#[derive(Clone)]
pub struct PostgresClaimLoader {
    pool: PgPool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresClaimQuery {
    pub cut: CommitSequence,
    pub definition: DefinitionReference,
    pub entity_id: EntityId,
    pub relation_ids: BTreeSet<RelationId>,
    pub valid_at: TimestampMicros,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresTypeQuery {
    pub after_entity_id: Option<EntityId>,
    pub cut: CommitSequence,
    pub definition: DefinitionReference,
    pub limit: u32,
    pub relation_ids: BTreeSet<RelationId>,
    pub valid_at: TimestampMicros,
}

impl PostgresClaimLoader {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn load(
        &self,
        context: &ExecutionContext,
        query: &PostgresClaimQuery,
    ) -> Result<Vec<EvidenceClaim>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let claims = load_in_transaction(&mut transaction, context, query).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(claims)
    }

    pub async fn load_entity_ids(
        &self,
        context: &ExecutionContext,
        query: &PostgresTypeQuery,
    ) -> Result<Vec<EntityId>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let entity_ids = load_entity_ids_in_transaction(&mut transaction, context, query).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(entity_ids)
    }
}

pub(crate) async fn load_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    query: &PostgresClaimQuery,
) -> Result<Vec<EvidenceClaim>, StoreError> {
    let relation_ids = query
        .relation_ids
        .iter()
        .map(|relation_id| relation_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(&format!(
        "SELECT {SEMANTIC_CLAIM_COLUMNS}
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
         ORDER BY claim_id"
    ))
    .bind(context.tenant_id().as_str())
    .bind(query.definition.definition_id.as_str())
    .bind(query.definition.digest.as_str())
    .bind(u64_to_i64(
        query.definition.revision.get(),
        "definition revision",
    )?)
    .bind(query.entity_id.as_str())
    .bind(relation_ids)
    .bind(u64_to_i64(query.cut.get(), "query cut")?)
    .bind(query.valid_at.get())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter().map(row_to_claim).collect()
}

pub(crate) async fn load_entity_ids_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    query: &PostgresTypeQuery,
) -> Result<Vec<EntityId>, StoreError> {
    let relation_ids = query
        .relation_ids
        .iter()
        .map(|relation_id| relation_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        "SELECT DISTINCT entity_id
         FROM semantic_claims
         WHERE tenant_id = $1
           AND definition_id = $2
           AND definition_digest = $3
           AND definition_revision = $4
           AND relation_id = ANY($5)
           AND commit_sequence <= $6
           AND (
                (valid_time_kind = 'instant' AND valid_from_micros = $7)
                OR (
                    valid_time_kind = 'interval'
                    AND valid_from_micros <= $7
                    AND valid_to_micros > $7
                )
           )
           AND ($9::text IS NULL OR entity_id > $9)
         ORDER BY entity_id
         LIMIT $8",
    )
    .bind(context.tenant_id().as_str())
    .bind(query.definition.definition_id.as_str())
    .bind(query.definition.digest.as_str())
    .bind(u64_to_i64(
        query.definition.revision.get(),
        "definition revision",
    )?)
    .bind(relation_ids)
    .bind(u64_to_i64(query.cut.get(), "query cut")?)
    .bind(query.valid_at.get())
    .bind(i64::from(query.limit))
    .bind(query.after_entity_id.as_ref().map(EntityId::as_str))
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            EntityId::parse(
                row.try_get::<String, _>("entity_id")
                    .map_err(store_unavailable)?,
            )
            .map_err(|error| StoreError::Corrupt(error.to_string()))
        })
        .collect()
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresOverlayClaimQuery {
    pub definition: DefinitionReference,
    pub entity_id: EntityId,
    pub relation_ids: BTreeSet<RelationId>,
    pub scenario_id: zoen_core::ScenarioId,
    pub valid_at: TimestampMicros,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresOverlayTypeQuery {
    pub after_entity_id: Option<EntityId>,
    pub definition: DefinitionReference,
    pub limit: u32,
    pub relation_ids: BTreeSet<RelationId>,
    pub scenario_id: zoen_core::ScenarioId,
    pub valid_at: TimestampMicros,
}

impl PostgresClaimLoader {
    pub async fn load_overlay(
        &self,
        context: &ExecutionContext,
        query: &PostgresOverlayClaimQuery,
    ) -> Result<Vec<EvidenceClaim>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let claims = load_overlay_in_transaction(&mut transaction, context, query).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(claims)
    }

    pub async fn load_overlay_entity_ids(
        &self,
        context: &ExecutionContext,
        query: &PostgresOverlayTypeQuery,
    ) -> Result<Vec<EntityId>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let entity_ids =
            load_overlay_entity_ids_in_transaction(&mut transaction, context, query).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(entity_ids)
    }

    pub async fn require_open_scenario_base(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
    ) -> Result<CommitSequence, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let row = sqlx::query(
            "SELECT base_commit_sequence, status
             FROM world_scenarios
             WHERE tenant_id = $1 AND scenario_id = $2",
        )
        .bind(context.tenant_id().as_str())
        .bind(scenario_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::NotFound)?;
        let status: String = row.try_get("status").map_err(store_unavailable)?;
        if status != "open" {
            return Err(StoreError::NotFound);
        }
        let base: i64 = row
            .try_get("base_commit_sequence")
            .map_err(store_unavailable)?;
        transaction.commit().await.map_err(store_unavailable)?;
        CommitSequence::new(
            u64::try_from(base)
                .map_err(|_| StoreError::Corrupt("base commit sequence overflow".to_owned()))?,
        )
        .ok_or_else(|| StoreError::Corrupt("zero base commit sequence".to_owned()))
    }
}

pub(crate) async fn load_overlay_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    query: &PostgresOverlayClaimQuery,
) -> Result<Vec<EvidenceClaim>, StoreError> {
    let relation_ids = query
        .relation_ids
        .iter()
        .map(|relation_id| relation_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        "SELECT claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, overlay_seq AS commit_sequence,
                observed_at_micros, ingested_at_micros
         FROM overlay_claims
         WHERE tenant_id = $1
           AND scenario_id = $2
           AND definition_id = $3
           AND definition_digest = $4
           AND definition_revision = $5
           AND entity_id = $6
           AND relation_id = ANY($7)
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
    .bind(context.tenant_id().as_str())
    .bind(query.scenario_id.as_str())
    .bind(query.definition.definition_id.as_str())
    .bind(query.definition.digest.as_str())
    .bind(u64_to_i64(
        query.definition.revision.get(),
        "definition revision",
    )?)
    .bind(query.entity_id.as_str())
    .bind(relation_ids)
    .bind(query.valid_at.get())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter().map(row_to_claim).collect()
}

pub(crate) async fn load_overlay_entity_ids_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    query: &PostgresOverlayTypeQuery,
) -> Result<Vec<EntityId>, StoreError> {
    let relation_ids = query
        .relation_ids
        .iter()
        .map(|relation_id| relation_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        "SELECT DISTINCT entity_id
         FROM overlay_claims
         WHERE tenant_id = $1
           AND scenario_id = $2
           AND definition_id = $3
           AND definition_digest = $4
           AND definition_revision = $5
           AND relation_id = ANY($6)
           AND (
                (valid_time_kind = 'instant' AND valid_from_micros = $7)
                OR (
                    valid_time_kind = 'interval'
                    AND valid_from_micros <= $7
                    AND valid_to_micros > $7
                )
           )
           AND ($9::text IS NULL OR entity_id > $9)
         ORDER BY entity_id
         LIMIT $8",
    )
    .bind(context.tenant_id().as_str())
    .bind(query.scenario_id.as_str())
    .bind(query.definition.definition_id.as_str())
    .bind(query.definition.digest.as_str())
    .bind(u64_to_i64(
        query.definition.revision.get(),
        "definition revision",
    )?)
    .bind(relation_ids)
    .bind(query.valid_at.get())
    .bind(i64::from(query.limit))
    .bind(query.after_entity_id.as_ref().map(EntityId::as_str))
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            EntityId::parse(
                row.try_get::<String, _>("entity_id")
                    .map_err(store_unavailable)?,
            )
            .map_err(|error| StoreError::Corrupt(error.to_string()))
        })
        .collect()
}
