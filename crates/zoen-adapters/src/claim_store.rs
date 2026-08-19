use std::collections::BTreeSet;

use sqlx::{PgPool, Postgres, Transaction};
use zoen_core::{
    CommitSequence, DefinitionReference, EntityId, EvidenceClaim, ExecutionContext, RelationId,
    TimestampMicros,
};
use zoen_engine::StoreError;

use crate::{row_to_claim, set_tenant, store_unavailable, u64_to_i64};

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
    let rows = sqlx::query(
        "SELECT claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
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
