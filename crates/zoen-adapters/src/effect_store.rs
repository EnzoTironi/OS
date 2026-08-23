use std::fmt::Display;

use sqlx::postgres::PgRow;
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    CommitSequence, DefinitelyNotSentReason, EffectAttempt, EffectAttemptId, EffectAttemptResult,
    EffectEvidence, EffectEvidenceDigest, EffectEvidenceId, EffectEvidenceOutcome,
    EffectIdempotencyKey, EffectKnowledgeState, EffectReconciliation, EffectRequest,
    EffectRequestDigest, EffectRequestId, EffectResponseDigest, EffectSnapshot, ExecutionContext,
    IntentDigest, OperationId, ProviderOperationId, SourceId, TimestampMicros,
};
use zoen_engine::{
    EffectAttemptCommand, EffectReconcileCommand, EffectUpdateTransaction, StoreError,
};

use crate::{i64_to_u64, set_tenant, store_unavailable};

pub struct PostgresEffectUpdate {
    context: ExecutionContext,
    effect_request_id: EffectRequestId,
    head: i64,
    pool: PgPool,
    snapshot: EffectSnapshot,
    transaction: Transaction<'static, Postgres>,
}

pub(crate) async fn begin(
    pool: &PgPool,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
) -> Result<PostgresEffectUpdate, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let head = sqlx::query_scalar::<_, i64>(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.tenant_id().as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    sqlx::query(
        "SELECT effect_request_id
         FROM effect_requests
         WHERE tenant_id = $1 AND effect_request_id = $2
         FOR UPDATE",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    let snapshot = load_snapshot(&mut transaction, context, effect_request_id).await?;
    Ok(PostgresEffectUpdate {
        context: context.clone(),
        effect_request_id: effect_request_id.clone(),
        head,
        pool: pool.clone(),
        snapshot,
        transaction,
    })
}

pub(crate) async fn get(
    pool: &PgPool,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
) -> Result<EffectSnapshot, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let snapshot = load_snapshot(&mut transaction, context, effect_request_id).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(snapshot)
}

impl EffectUpdateTransaction for PostgresEffectUpdate {
    fn snapshot(&self) -> &EffectSnapshot {
        &self.snapshot
    }

    async fn claimed_attempt(
        &mut self,
        adapter_execution_id: &str,
    ) -> Result<Option<EffectAttemptId>, StoreError> {
        sqlx::query_scalar::<_, String>(
            "SELECT attempt_id
             FROM effect_attempt_claims
             WHERE tenant_id = $1
               AND effect_request_id = $2
               AND adapter_execution_id = $3",
        )
        .bind(self.context.tenant_id().as_str())
        .bind(self.effect_request_id.as_str())
        .bind(adapter_execution_id)
        .fetch_optional(&mut *self.transaction)
        .await
        .map_err(store_unavailable)?
        .map(EffectAttemptId::parse)
        .transpose()
        .map_err(corrupt)
    }

    async fn open_claim(&mut self) -> Result<Option<(String, EffectAttemptId)>, StoreError> {
        let row = sqlx::query(
            "SELECT adapter_execution_id, attempt_id
             FROM effect_attempt_claims
             WHERE tenant_id = $1
               AND effect_request_id = $2
             ORDER BY claimed_at ASC
             LIMIT 1",
        )
        .bind(self.context.tenant_id().as_str())
        .bind(self.effect_request_id.as_str())
        .fetch_optional(&mut *self.transaction)
        .await
        .map_err(store_unavailable)?;
        row.map(|row| {
            let adapter_execution_id = row
                .try_get::<String, _>("adapter_execution_id")
                .map_err(store_unavailable)?;
            let attempt_id = EffectAttemptId::parse(
                row.try_get::<String, _>("attempt_id")
                    .map_err(store_unavailable)?,
            )
            .map_err(corrupt)?;
            Ok((adapter_execution_id, attempt_id))
        })
        .transpose()
    }

    async fn commit_claim(
        self,
        adapter_execution_id: &str,
        attempt_id: &EffectAttemptId,
    ) -> Result<(), StoreError> {
        let Self {
            context,
            effect_request_id,
            head: _,
            pool: _,
            snapshot: _,
            mut transaction,
        } = self;
        sqlx::query(
            "INSERT INTO effect_attempt_claims (
                tenant_id, effect_request_id, attempt_id, adapter_execution_id,
                claimed_workload_id
             ) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(context.tenant_id().as_str())
        .bind(effect_request_id.as_str())
        .bind(attempt_id.as_str())
        .bind(adapter_execution_id)
        .bind(context.workload_id().as_str())
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        transaction.commit().await.map_err(store_unavailable)
    }

    async fn has_claim(&mut self, attempt_id: &EffectAttemptId) -> Result<bool, StoreError> {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                SELECT 1
                FROM effect_attempt_claims
                WHERE tenant_id = $1
                  AND effect_request_id = $2
                  AND attempt_id = $3
                  AND claimed_workload_id = $4
             )",
        )
        .bind(self.context.tenant_id().as_str())
        .bind(self.effect_request_id.as_str())
        .bind(attempt_id.as_str())
        .bind(self.context.workload_id().as_str())
        .fetch_one(&mut *self.transaction)
        .await
        .map_err(store_unavailable)
    }

    async fn commit_attempt(
        self,
        command: &EffectAttemptCommand,
        resulting_state: EffectKnowledgeState,
    ) -> Result<EffectSnapshot, StoreError> {
        let Self {
            context,
            effect_request_id,
            head,
            pool,
            snapshot,
            mut transaction,
        } = self;
        let next_sequence =
            append_authority_commit(&mut transaction, &context, head, "effect_attempt").await?;
        let (result_kind, reason_kind, provider_operation_id, response_digest) =
            attempt_result_columns(&command.result);
        sqlx::query(
            "INSERT INTO effect_attempts (
                tenant_id, effect_request_id, attempt_id, commit_sequence,
                observed_at_micros, request_digest, provider_operation_id,
                result_kind, reason_kind, response_digest
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(context.tenant_id().as_str())
        .bind(effect_request_id.as_str())
        .bind(command.attempt_id.as_str())
        .bind(next_sequence)
        .bind(command.observed_at.get())
        .bind(snapshot.request.request_digest.as_str())
        .bind(provider_operation_id)
        .bind(result_kind)
        .bind(reason_kind)
        .bind(response_digest)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        update_effect_state(
            &mut transaction,
            &context,
            &effect_request_id,
            resulting_state,
            next_sequence,
        )
        .await?;
        append_projection_event(
            &mut transaction,
            &context,
            next_sequence,
            "EffectAttemptRecorded",
            serde_json::json!({
                "attemptId": command.attempt_id.as_str(),
                "effectRequestId": effect_request_id.as_str(),
                "resultingState": state_name(resulting_state),
            }),
        )
        .await?;
        advance_head(&mut transaction, &context, next_sequence).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        get(&pool, &context, &effect_request_id).await
    }

    async fn commit_reconciliation(
        self,
        command: &EffectReconcileCommand,
        resulting_state: EffectKnowledgeState,
    ) -> Result<EffectSnapshot, StoreError> {
        let Self {
            context,
            effect_request_id,
            head,
            pool,
            snapshot,
            mut transaction,
        } = self;
        let next_sequence =
            append_authority_commit(&mut transaction, &context, head, "effect_reconciliation")
                .await?;
        sqlx::query(
            "INSERT INTO effect_evidence (
                tenant_id, effect_request_id, evidence_id, commit_sequence,
                evidence_digest, idempotency_key, observed_at_micros,
                outcome, provider_operation_id, source_id, source_ref
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(context.tenant_id().as_str())
        .bind(effect_request_id.as_str())
        .bind(command.evidence_id.as_str())
        .bind(next_sequence)
        .bind(command.digest.as_str())
        .bind(command.idempotency_key.as_str())
        .bind(command.observed_at.get())
        .bind(evidence_outcome_name(command.outcome))
        .bind(command.provider_operation_id.as_str())
        .bind(command.source_id.as_str())
        .bind(&command.source_ref)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        sqlx::query(
            "INSERT INTO effect_reconciliations (
                tenant_id, effect_request_id, evidence_id, commit_sequence,
                previous_state, resulting_state
             ) VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(context.tenant_id().as_str())
        .bind(effect_request_id.as_str())
        .bind(command.evidence_id.as_str())
        .bind(next_sequence)
        .bind(state_name(snapshot.request.state))
        .bind(state_name(resulting_state))
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        update_effect_state(
            &mut transaction,
            &context,
            &effect_request_id,
            resulting_state,
            next_sequence,
        )
        .await?;
        append_projection_event(
            &mut transaction,
            &context,
            next_sequence,
            "EffectReconciled",
            serde_json::json!({
                "effectRequestId": effect_request_id.as_str(),
                "evidenceId": command.evidence_id.as_str(),
                "resultingState": state_name(resulting_state),
            }),
        )
        .await?;
        advance_head(&mut transaction, &context, next_sequence).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        get(&pool, &context, &effect_request_id).await
    }

    async fn rollback(self) -> Result<(), StoreError> {
        self.transaction.rollback().await.map_err(store_unavailable)
    }
}

pub(crate) async fn load_snapshot(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
) -> Result<EffectSnapshot, StoreError> {
    let request = sqlx::query(
        "SELECT effect_request_id, operation_id, commit_sequence, idempotency_key,
                intent_digest, request_digest, payload, knowledge_state
         FROM effect_requests
         WHERE tenant_id = $1 AND effect_request_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)
    .and_then(row_to_request)?;
    let attempts = sqlx::query(
        "SELECT attempt_id, commit_sequence, observed_at_micros, request_digest,
                provider_operation_id, result_kind, reason_kind, response_digest
         FROM effect_attempts
         WHERE tenant_id = $1 AND effect_request_id = $2
         ORDER BY commit_sequence, attempt_id",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .iter()
    .map(row_to_attempt)
    .collect::<Result<Vec<_>, _>>()?;
    let evidence = sqlx::query(
        "SELECT evidence_id, commit_sequence, evidence_digest, idempotency_key,
                observed_at_micros, outcome, provider_operation_id, source_id, source_ref
         FROM effect_evidence
         WHERE tenant_id = $1 AND effect_request_id = $2
         ORDER BY commit_sequence, evidence_id",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .iter()
    .map(row_to_evidence)
    .collect::<Result<Vec<_>, _>>()?;
    let reconciliations = sqlx::query(
        "SELECT evidence_id, commit_sequence, previous_state, resulting_state
         FROM effect_reconciliations
         WHERE tenant_id = $1 AND effect_request_id = $2
         ORDER BY commit_sequence, evidence_id",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .iter()
    .map(row_to_reconciliation)
    .collect::<Result<Vec<_>, _>>()?;
    Ok(EffectSnapshot {
        attempts,
        evidence,
        reconciliations,
        request,
    })
}

async fn append_authority_commit(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    head: i64,
    kind: &str,
) -> Result<i64, StoreError> {
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, $3)",
    )
    .bind(context.tenant_id().as_str())
    .bind(next_sequence)
    .bind(kind)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(next_sequence)
}

async fn update_effect_state(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
    state: EffectKnowledgeState,
    commit_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE effect_requests
         SET knowledge_state = $3, last_commit_sequence = $4, updated_at = clock_timestamp()
         WHERE tenant_id = $1 AND effect_request_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .bind(state_name(state))
    .bind(commit_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() == 1 {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "effect state update affected an unexpected row count".to_owned(),
        ))
    }
}

async fn append_projection_event(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    commit_sequence: i64,
    event_type: &str,
    payload: serde_json::Value,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, 0, $3, 1, $4)",
    )
    .bind(context.tenant_id().as_str())
    .bind(commit_sequence)
    .bind(event_type)
    .bind(payload)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn advance_head(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    commit_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(context.tenant_id().as_str())
    .bind(commit_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() == 1 {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ))
    }
}

fn row_to_request(row: PgRow) -> Result<EffectRequest, StoreError> {
    Ok(EffectRequest {
        commit_sequence: row_commit_sequence(&row)?,
        effect_request_id: EffectRequestId::parse(row_string(&row, "effect_request_id")?)
            .map_err(corrupt)?,
        idempotency_key: EffectIdempotencyKey::parse(row_string(&row, "idempotency_key")?)
            .map_err(corrupt)?,
        intent_digest: IntentDigest::parse(row_string(&row, "intent_digest")?).map_err(corrupt)?,
        operation_id: OperationId::parse(row_string(&row, "operation_id")?).map_err(corrupt)?,
        payload: row
            .try_get::<Vec<u8>, _>("payload")
            .map_err(store_unavailable)?,
        request_digest: EffectRequestDigest::parse(row_string(&row, "request_digest")?)
            .map_err(corrupt)?,
        state: parse_state(&row_string(&row, "knowledge_state")?)?,
    })
}

fn row_to_attempt(row: &PgRow) -> Result<EffectAttempt, StoreError> {
    let result_kind = row_string(row, "result_kind")?;
    let reason = row
        .try_get::<Option<String>, _>("reason_kind")
        .map_err(store_unavailable)?;
    let response_digest = row
        .try_get::<Option<String>, _>("response_digest")
        .map_err(store_unavailable)?
        .map(EffectResponseDigest::parse)
        .transpose()
        .map_err(corrupt)?;
    let provider_operation_id = row
        .try_get::<Option<String>, _>("provider_operation_id")
        .map_err(store_unavailable)?
        .map(ProviderOperationId::parse)
        .transpose()
        .map_err(corrupt)?;
    let result = match (
        result_kind.as_str(),
        reason.as_deref(),
        provider_operation_id,
        response_digest,
    ) {
        ("definitely_not_sent", Some(reason), None, None) => {
            EffectAttemptResult::DefinitelyNotSent {
                reason: parse_definitely_not_sent_reason(reason)?,
            }
        }
        ("unknown", Some(reason), provider_operation_id, response_digest) => {
            EffectAttemptResult::Unknown {
                provider_operation_id,
                reason: parse_unknown_reason(reason)?,
                response_digest,
            }
        }
        ("accepted_pending", None, Some(provider_operation_id), Some(response_digest)) => {
            EffectAttemptResult::AcceptedPending {
                provider_operation_id,
                response_digest,
            }
        }
        ("confirmed", None, Some(provider_operation_id), Some(response_digest)) => {
            EffectAttemptResult::Confirmed {
                provider_operation_id,
                response_digest,
            }
        }
        ("confirmed_no_effect", None, Some(provider_operation_id), Some(response_digest)) => {
            EffectAttemptResult::ConfirmedNoEffect {
                provider_operation_id,
                response_digest,
            }
        }
        _ => {
            return Err(StoreError::Corrupt(
                "stored effect attempt result is inconsistent".to_owned(),
            ));
        }
    };
    Ok(EffectAttempt {
        attempt_id: EffectAttemptId::parse(row_string(row, "attempt_id")?).map_err(corrupt)?,
        commit_sequence: row_commit_sequence(row)?,
        observed_at: TimestampMicros::new(row_i64(row, "observed_at_micros")?),
        request_digest: EffectRequestDigest::parse(row_string(row, "request_digest")?)
            .map_err(corrupt)?,
        result,
    })
}

fn row_to_evidence(row: &PgRow) -> Result<EffectEvidence, StoreError> {
    Ok(EffectEvidence {
        commit_sequence: row_commit_sequence(row)?,
        digest: EffectEvidenceDigest::parse(row_string(row, "evidence_digest")?)
            .map_err(corrupt)?,
        evidence_id: EffectEvidenceId::parse(row_string(row, "evidence_id")?).map_err(corrupt)?,
        idempotency_key: EffectIdempotencyKey::parse(row_string(row, "idempotency_key")?)
            .map_err(corrupt)?,
        observed_at: TimestampMicros::new(row_i64(row, "observed_at_micros")?),
        outcome: parse_evidence_outcome(&row_string(row, "outcome")?)?,
        provider_operation_id: ProviderOperationId::parse(row_string(
            row,
            "provider_operation_id",
        )?)
        .map_err(corrupt)?,
        source_id: SourceId::parse(row_string(row, "source_id")?).map_err(corrupt)?,
        source_ref: row_string(row, "source_ref")?,
    })
}

fn row_to_reconciliation(row: &PgRow) -> Result<EffectReconciliation, StoreError> {
    Ok(EffectReconciliation {
        commit_sequence: row_commit_sequence(row)?,
        evidence_id: EffectEvidenceId::parse(row_string(row, "evidence_id")?).map_err(corrupt)?,
        previous_state: parse_state(&row_string(row, "previous_state")?)?,
        resulting_state: parse_state(&row_string(row, "resulting_state")?)?,
    })
}

fn attempt_result_columns(
    result: &EffectAttemptResult,
) -> (
    &'static str,
    Option<&'static str>,
    Option<&str>,
    Option<&str>,
) {
    match result {
        EffectAttemptResult::DefinitelyNotSent { reason } => (
            "definitely_not_sent",
            Some(definitely_not_sent_reason_name(*reason)),
            None,
            None,
        ),
        EffectAttemptResult::Unknown {
            provider_operation_id,
            reason,
            response_digest,
        } => (
            "unknown",
            Some(unknown_reason_name(*reason)),
            provider_operation_id
                .as_ref()
                .map(ProviderOperationId::as_str),
            response_digest.as_ref().map(EffectResponseDigest::as_str),
        ),
        EffectAttemptResult::AcceptedPending {
            provider_operation_id,
            response_digest,
        } => (
            "accepted_pending",
            None,
            Some(provider_operation_id.as_str()),
            Some(response_digest.as_str()),
        ),
        EffectAttemptResult::Confirmed {
            provider_operation_id,
            response_digest,
        } => (
            "confirmed",
            None,
            Some(provider_operation_id.as_str()),
            Some(response_digest.as_str()),
        ),
        EffectAttemptResult::ConfirmedNoEffect {
            provider_operation_id,
            response_digest,
        } => (
            "confirmed_no_effect",
            None,
            Some(provider_operation_id.as_str()),
            Some(response_digest.as_str()),
        ),
    }
}

fn row_commit_sequence(row: &PgRow) -> Result<CommitSequence, StoreError> {
    CommitSequence::new(i64_to_u64(
        row_i64(row, "commit_sequence")?,
        "commit sequence",
    )?)
    .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))
}

fn row_string(row: &PgRow, column: &str) -> Result<String, StoreError> {
    row.try_get::<String, _>(column).map_err(store_unavailable)
}

fn row_i64(row: &PgRow, column: &str) -> Result<i64, StoreError> {
    row.try_get::<i64, _>(column).map_err(store_unavailable)
}

fn parse_state(value: &str) -> Result<EffectKnowledgeState, StoreError> {
    match value {
        "not_attempted" => Ok(EffectKnowledgeState::NotAttempted),
        "definitely_not_sent" => Ok(EffectKnowledgeState::DefinitelyNotSent),
        "unknown" => Ok(EffectKnowledgeState::Unknown),
        "accepted_pending" => Ok(EffectKnowledgeState::AcceptedPending),
        "confirmed" => Ok(EffectKnowledgeState::Confirmed),
        "confirmed_no_effect" => Ok(EffectKnowledgeState::ConfirmedNoEffect),
        "contradicted" => Ok(EffectKnowledgeState::Contradicted),
        _ => Err(StoreError::Corrupt(format!(
            "unknown stored effect state: {value}"
        ))),
    }
}

fn state_name(state: EffectKnowledgeState) -> &'static str {
    match state {
        EffectKnowledgeState::NotAttempted => "not_attempted",
        EffectKnowledgeState::DefinitelyNotSent => "definitely_not_sent",
        EffectKnowledgeState::Unknown => "unknown",
        EffectKnowledgeState::AcceptedPending => "accepted_pending",
        EffectKnowledgeState::Confirmed => "confirmed",
        EffectKnowledgeState::ConfirmedNoEffect => "confirmed_no_effect",
        EffectKnowledgeState::Contradicted => "contradicted",
    }
}

fn parse_definitely_not_sent_reason(value: &str) -> Result<DefinitelyNotSentReason, StoreError> {
    match value {
        "credential_revoked" => Ok(DefinitelyNotSentReason::CredentialRevoked),
        "timeout_before_send" => Ok(DefinitelyNotSentReason::TimeoutBeforeSend),
        _ => Err(StoreError::Corrupt(format!(
            "unknown definitely-not-sent reason: {value}"
        ))),
    }
}

fn definitely_not_sent_reason_name(reason: DefinitelyNotSentReason) -> &'static str {
    match reason {
        DefinitelyNotSentReason::CredentialRevoked => "credential_revoked",
        DefinitelyNotSentReason::TimeoutBeforeSend => "timeout_before_send",
    }
}

fn parse_unknown_reason(value: &str) -> Result<zoen_core::UnknownEffectReason, StoreError> {
    match value {
        "provider_unavailable" => Ok(zoen_core::UnknownEffectReason::ProviderUnavailable),
        "response_parse_error" => Ok(zoen_core::UnknownEffectReason::ResponseParseError),
        "response_schema_error" => Ok(zoen_core::UnknownEffectReason::ResponseSchemaError),
        "timeout_after_possible_delivery" => {
            Ok(zoen_core::UnknownEffectReason::TimeoutAfterPossibleDelivery)
        }
        _ => Err(StoreError::Corrupt(format!(
            "unknown ambiguous-effect reason: {value}"
        ))),
    }
}

fn unknown_reason_name(reason: zoen_core::UnknownEffectReason) -> &'static str {
    match reason {
        zoen_core::UnknownEffectReason::ProviderUnavailable => "provider_unavailable",
        zoen_core::UnknownEffectReason::ResponseParseError => "response_parse_error",
        zoen_core::UnknownEffectReason::ResponseSchemaError => "response_schema_error",
        zoen_core::UnknownEffectReason::TimeoutAfterPossibleDelivery => {
            "timeout_after_possible_delivery"
        }
    }
}

fn parse_evidence_outcome(value: &str) -> Result<EffectEvidenceOutcome, StoreError> {
    match value {
        "confirmed" => Ok(EffectEvidenceOutcome::Confirmed),
        "no_effect" => Ok(EffectEvidenceOutcome::NoEffect),
        _ => Err(StoreError::Corrupt(format!(
            "unknown stored evidence outcome: {value}"
        ))),
    }
}

fn evidence_outcome_name(outcome: EffectEvidenceOutcome) -> &'static str {
    match outcome {
        EffectEvidenceOutcome::Confirmed => "confirmed",
        EffectEvidenceOutcome::NoEffect => "no_effect",
    }
}

fn corrupt(error: impl Display) -> StoreError {
    StoreError::Corrupt(error.to_string())
}
