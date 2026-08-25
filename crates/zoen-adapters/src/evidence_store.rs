use sqlx::{Postgres, Row, Transaction};
use zoen_core::{CommitSequence, EvidenceClaim, ExecutionContext, IntentDigest, OperationId};
use zoen_engine::{AdmittedEvidence, EvidenceOperation, StoreError};

use crate::{
    PostgresAuthorityStore, i64_to_u64, row_to_claim, semantic_claim_store, set_tenant,
    store_unavailable,
};

const EXISTING_CLAIM_SQL: &str =
    "SELECT claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence,
                observed_at_micros, ingested_at_micros
         FROM semantic_claims WHERE tenant_id = $1 AND claim_id = $2";

pub(crate) async fn record(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    evidence: &AdmittedEvidence,
    operation: Option<(&OperationId, &IntentDigest)>,
) -> Result<EvidenceClaim, StoreError> {
    let mut recorded =
        record_batch(store, context, std::slice::from_ref(evidence), operation).await?;
    recorded
        .pop()
        .ok_or_else(|| StoreError::Corrupt("evidence insert returned no claim".to_owned()))
}

pub(crate) async fn record_batch(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    evidence: &[AdmittedEvidence],
    operation: Option<(&OperationId, &IntentDigest)>,
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

    if let Some((operation_id, intent_digest)) = operation {
        if let Err(error) = insert_operation(
            &mut transaction,
            context,
            operation_id,
            intent_digest,
            &recorded,
        )
        .await
        {
            if !matches!(error, StoreError::OperationMismatch) {
                return Err(error);
            }
            transaction.rollback().await.map_err(store_unavailable)?;
            return replay_after_conflict(store, context, operation_id, intent_digest).await;
        }
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

pub(crate) async fn get_operation(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    operation_id: &OperationId,
) -> Result<Option<EvidenceOperation>, StoreError> {
    let mut transaction = store.pool().begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let operation = load_operation(&mut transaction, context, operation_id).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(operation)
}

async fn replay_after_conflict(
    store: &PostgresAuthorityStore,
    context: &ExecutionContext,
    operation_id: &OperationId,
    intent_digest: &IntentDigest,
) -> Result<Vec<EvidenceClaim>, StoreError> {
    match get_operation(store, context, operation_id).await? {
        Some(existing) if existing.intent_digest == *intent_digest => Ok(existing.claims),
        Some(_) => Err(StoreError::OperationMismatch),
        None => Err(StoreError::Corrupt(
            "evidence operation conflict did not leave a durable receipt".to_owned(),
        )),
    }
}

async fn load_operation(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    operation_id: &OperationId,
) -> Result<Option<EvidenceOperation>, StoreError> {
    let header = sqlx::query(
        "SELECT intent_digest
         FROM evidence_operations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(header) = header else {
        return Ok(None);
    };
    let intent_digest = IntentDigest::parse(
        header
            .try_get::<String, _>("intent_digest")
            .map_err(store_unavailable)?,
    )
    .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let rows = sqlx::query(
        "SELECT claim.claim_id, claim.definition_id, claim.definition_digest, claim.definition_revision,
                claim.entity_id, claim.relation_id, claim.value_kind, claim.value_text, claim.value_unit,
                claim.valid_time_kind, claim.valid_from_micros, claim.valid_to_micros,
                claim.source_id, claim.source_digest, claim.source_ref, claim.commit_sequence,
                claim.observed_at_micros, claim.ingested_at_micros
         FROM evidence_operation_records AS record
         JOIN semantic_claims AS claim
           ON claim.tenant_id = record.tenant_id
          AND claim.claim_id = record.claim_id
         WHERE record.tenant_id = $1 AND record.operation_id = $2
         ORDER BY record.ordinal",
    )
    .bind(context.tenant_id().as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if rows.is_empty() {
        return Err(StoreError::Corrupt(
            "evidence operation has no recorded claims".to_owned(),
        ));
    }
    Ok(Some(EvidenceOperation {
        claims: rows.iter().map(row_to_claim).collect::<Result<_, _>>()?,
        intent_digest,
    }))
}

async fn insert_operation(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    operation_id: &OperationId,
    intent_digest: &IntentDigest,
    recorded: &[EvidenceClaim],
) -> Result<(), StoreError> {
    let commit_sequence = recorded
        .last()
        .map(|claim| claim.commit_sequence.get())
        .ok_or_else(|| StoreError::Corrupt("evidence operation has no claims".to_owned()))?;
    let inserted =
        sqlx::query(
            "INSERT INTO evidence_operations (
            tenant_id, operation_id, intent_digest, commit_sequence, recorded_count
         ) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(context.tenant_id().as_str())
        .bind(operation_id.as_str())
        .bind(intent_digest.as_str())
        .bind(i64::try_from(commit_sequence).map_err(|_| {
            StoreError::Corrupt("commit sequence exceeds PostgreSQL BIGINT".to_owned())
        })?)
        .bind(i32::try_from(recorded.len()).map_err(|_| {
            StoreError::Corrupt("recorded count exceeds PostgreSQL INTEGER".to_owned())
        })?)
        .execute(&mut **transaction)
        .await;
    if let Err(error) = inserted {
        return Err(map_operation_insert(error));
    }
    for (ordinal, claim) in recorded.iter().enumerate() {
        sqlx::query(
            "INSERT INTO evidence_operation_records (
                tenant_id, operation_id, ordinal, claim_id
             ) VALUES ($1, $2, $3, $4)",
        )
        .bind(context.tenant_id().as_str())
        .bind(operation_id.as_str())
        .bind(i32::try_from(ordinal).map_err(|_| {
            StoreError::Corrupt("evidence operation ordinal exceeds INTEGER".to_owned())
        })?)
        .bind(claim.draft.claim_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    Ok(())
}

fn map_operation_insert(error: sqlx::Error) -> StoreError {
    if error.as_database_error().is_some_and(|database| {
        database.is_unique_violation() && database.constraint() == Some("evidence_operations_pkey")
    }) {
        StoreError::OperationMismatch
    } else {
        store_unavailable(error)
    }
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
        if !claim.draft.same_intent(evidence.draft()) {
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
