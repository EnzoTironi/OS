use sqlx::{Postgres, Transaction};
use zoen_core::{CommitIdentityKind, WorldId};
use zoen_engine::{AdmittedEvidence, StoreError};

use crate::{
    require_active_revision, store_unavailable, u64_to_i64, valid_time_columns, value_columns,
};

#[derive(Clone, Copy)]
pub(crate) enum RevisionRequirement {
    Active,
    Published,
}

pub(crate) async fn insert(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    commit_sequence: i64,
    evidence: &AdmittedEvidence,
    requirement: RevisionRequirement,
) -> Result<(), StoreError> {
    let draft = evidence.draft();
    if matches!(requirement, RevisionRequirement::Active) {
        require_active_revision(transaction, world_id, &draft.definition).await?;
    }
    let (value_kind, value_text, value_unit) = value_columns(&draft.value);
    let (valid_time_kind, valid_from_micros, valid_to_micros) =
        valid_time_columns(&draft.valid_time);
    let ingested_at = draft
        .provenance
        .ingested_at
        .map_or_else(clock_micros, zoen_core::TimestampMicros::get);
    sqlx::query(
        "INSERT INTO semantic_claims (
            tenant_id, claim_id, definition_id, definition_digest, definition_revision,
            entity_id, relation_id, value_kind, value_text, value_unit,
            valid_time_kind, valid_from_micros, valid_to_micros,
            source_id, source_digest, source_ref, commit_sequence,
            observed_at_micros, ingested_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19
         )",
    )
    .bind(world_id.as_str())
    .bind(draft.claim_id.as_str())
    .bind(draft.definition.definition_id.as_str())
    .bind(draft.definition.digest.as_str())
    .bind(u64_to_i64(
        draft.definition.revision.get(),
        "definition revision",
    )?)
    .bind(draft.entity_id.as_str())
    .bind(draft.relation_id.as_str())
    .bind(value_kind)
    .bind(value_text)
    .bind(value_unit)
    .bind(valid_time_kind)
    .bind(valid_from_micros)
    .bind(valid_to_micros)
    .bind(draft.provenance.source_id.as_str())
    .bind(draft.provenance.source_digest.as_str())
    .bind(&draft.provenance.source_ref)
    .bind(commit_sequence)
    .bind(
        draft
            .provenance
            .observed_at
            .map(zoen_core::TimestampMicros::get),
    )
    .bind(ingested_at)
    .execute(&mut **transaction)
    .await
    .map_err(map_insert)?;
    Ok(())
}

fn clock_micros() -> i64 {
    crate::clock_micros()
}

fn map_insert(error: sqlx::Error) -> StoreError {
    if error.as_database_error().is_some_and(|database| {
        database.is_unique_violation() && database.constraint() == Some("semantic_claims_pkey")
    }) {
        StoreError::IdentityCollision(CommitIdentityKind::SemanticRecord)
    } else {
        store_unavailable(error)
    }
}
