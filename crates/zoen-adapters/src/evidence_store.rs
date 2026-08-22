use sqlx::{Postgres, Row, Transaction};
use zoen_core::{CommitSequence, EvidenceClaim, ExecutionContext};
use zoen_engine::{AdmittedEvidence, StoreError};

use crate::{
    PostgresAuthorityStore, i64_to_u64, row_to_claim, semantic_claim_store, set_tenant,
    store_unavailable,
};

const EXISTING_CLAIM_SQL: &str =
    "SELECT claim_id, definition_id, definition_digest, definition_revision,
                    entity_id, relation_id, value_kind, value_text, value_unit,
                    valid_time_kind, valid_from_micros, valid_to_micros,
                    source_id, source_digest, source_ref, commit_sequence
             FROM semantic_claims
             WHERE tenant_id = $1 AND claim_id = $2";

pub(crate) async fn record(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    evidence: &AdmittedEvidence,
) -> Result<EvidenceClaim, StoreError> {
    let mut recorded = record_batch(store, context, std::slice::from_ref(evidence)).await?;
    recorded
        .pop()
        .ok_or_else(|| StoreError::Corrupt("evidence insert returned no claim".to_owned()))
}

pub(crate) async fn record_batch(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    evidence: &[AdmittedEvidence],
) -> Result<Vec<EvidenceClaim>, StoreError> {
    if evidence.is_empty() {
        return Ok(Vec::new());
    }
    let mut transaction = store.pool().begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    sqlx::query(
        "INSERT INTO authority_heads (tenant_id, commit_sequence)
         VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING",
    )
    .bind(context.tenant_id().as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;

    let mut head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.tenant_id().as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;

    let mut recorded = Vec::with_capacity(evidence.len());
    for item in evidence {
        recorded.push(write_claim(&mut transaction, context, item, &mut head).await?);
    }

    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(context.tenant_id().as_str())
    .bind(head)
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() != 1 {
        return Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ));
    }
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(recorded)
}

async fn write_claim(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    evidence: &AdmittedEvidence,
    head: &mut i64,
) -> Result<EvidenceClaim, StoreError> {
    let existing = sqlx::query(EXISTING_CLAIM_SQL)
        .bind(context.tenant_id().as_str())
        .bind(evidence.draft().claim_id.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    if let Some(row) = existing {
        let claim = row_to_claim(&row)?;
        if claim.draft != *evidence.draft() {
            return Err(StoreError::Conflict(
                "claim id already identifies different evidence".to_owned(),
            ));
        }
        return Ok(claim);
    }
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, 'evidence')",
    )
    .bind(context.tenant_id().as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;

    semantic_claim_store::insert(
        transaction,
        context.tenant_id(),
        next_sequence,
        evidence,
        semantic_claim_store::RevisionRequirement::Active,
    )
    .await?;

    let event = evidence.projection_event();
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
    )
    .bind(context.tenant_id().as_str())
    .bind(next_sequence)
    .bind(event.event_type())
    .bind(i32::from(event.event_version()))
    .bind(event.payload())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    *head = next_sequence;
    Ok(EvidenceClaim {
        commit_sequence: CommitSequence::new(i64_to_u64(next_sequence, "commit sequence")?)
            .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
        draft: evidence.draft().clone(),
    })
}
