use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{EffectRequestId, TenantId};
use zoen_engine::StoreError;

use crate::{set_tenant, store_unavailable};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DispatchScheduleCommand {
    pub effect_request_id: EffectRequestId,
    pub knowledge_commit_sequence: u64,
    pub tenant_id: TenantId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DispatchAcceptance {
    pub invocation_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DispatchScheduleError {
    InvalidResponse(String),
    Rejected(String),
    Unavailable(String),
}

impl Display for DispatchScheduleError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidResponse(message) => {
                write!(
                    formatter,
                    "scheduler returned an invalid response: {message}"
                )
            }
            Self::Rejected(message) => write!(formatter, "scheduler rejected work: {message}"),
            Self::Unavailable(message) => write!(formatter, "scheduler is unavailable: {message}"),
        }
    }
}

impl Error for DispatchScheduleError {}

#[allow(async_fn_in_trait)]
pub trait DispatchScheduler: Send + Sync {
    async fn schedule(
        &self,
        command: &DispatchScheduleCommand,
    ) -> Result<DispatchAcceptance, DispatchScheduleError>;
}

struct PendingEffect {
    effect_request_id: EffectRequestId,
    knowledge_commit_sequence: u64,
    transaction: Transaction<'static, Postgres>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EffectDispatchOutcome {
    Accepted,
    InvalidResponse,
    Rejected,
    RestateUnavailable,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EffectDispatchResult {
    pub effect_request_id: EffectRequestId,
    pub outcome: EffectDispatchOutcome,
    pub restate_invocation_id: Option<String>,
}

pub struct PostgresEffectDispatcher<S> {
    pool: PgPool,
    scheduler: S,
}

impl<S> PostgresEffectDispatcher<S>
where
    S: DispatchScheduler,
{
    pub fn new(pool: PgPool, scheduler: S) -> Self {
        Self { pool, scheduler }
    }

    pub async fn dispatch_once(
        &self,
        tenant_id: &TenantId,
        limit: u32,
    ) -> Result<Vec<EffectDispatchResult>, StoreError> {
        self.materialize_legacy_requests(tenant_id).await?;
        let mut results = Vec::with_capacity(limit as usize);
        let mut attempted_effects = Vec::with_capacity(limit as usize);
        for _ in 0..limit {
            let Some(pending) = self
                .claim_pending_request(tenant_id, &attempted_effects)
                .await?
            else {
                break;
            };
            attempted_effects.push(pending.effect_request_id.as_str().to_owned());
            let scheduled = self
                .scheduler
                .schedule(&DispatchScheduleCommand {
                    effect_request_id: pending.effect_request_id.clone(),
                    knowledge_commit_sequence: pending.knowledge_commit_sequence,
                    tenant_id: tenant_id.clone(),
                })
                .await;
            results.push(
                self.record_dispatch_result(tenant_id, pending, scheduled)
                    .await?,
            );
        }
        Ok(results)
    }

    async fn materialize_legacy_requests(&self, tenant_id: &TenantId) -> Result<(), StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let rows = sqlx::query(
            "SELECT outbox.effect_request_id, outbox.commit_sequence, outbox.payload,
                    operation.operation_id, operation.intent_digest
             FROM projection_outbox AS outbox
             JOIN action_operations AS operation
               ON operation.tenant_id = outbox.tenant_id
              AND operation.commit_sequence = outbox.commit_sequence
             LEFT JOIN effect_requests AS request
               ON request.tenant_id = outbox.tenant_id
              AND request.effect_request_id = outbox.effect_request_id
             WHERE outbox.tenant_id = $1
               AND outbox.effect_request_id IS NOT NULL
               AND request.effect_request_id IS NULL
             ORDER BY outbox.commit_sequence, outbox.ordinal
             FOR UPDATE OF outbox",
        )
        .bind(tenant_id.as_str())
        .fetch_all(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        for row in rows {
            let effect_request_id = row
                .try_get::<String, _>("effect_request_id")
                .map_err(store_unavailable)?;
            let payload = row
                .try_get::<serde_json::Value, _>("payload")
                .map_err(store_unavailable)?;
            let payload = serde_json::to_vec(&payload)
                .map_err(|error| StoreError::Corrupt(error.to_string()))?;
            let request_digest = Sha256::digest(&payload)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let idempotency_key = format!("idempotency.{}.{effect_request_id}", tenant_id.as_str());
            sqlx::query(
                "INSERT INTO effect_requests (
                    tenant_id, effect_request_id, operation_id, commit_sequence,
                    idempotency_key, intent_digest, request_digest, payload,
                    knowledge_state, last_commit_sequence
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'not_attempted', $4)
                 ON CONFLICT (tenant_id, effect_request_id) DO NOTHING",
            )
            .bind(tenant_id.as_str())
            .bind(&effect_request_id)
            .bind(
                row.try_get::<String, _>("operation_id")
                    .map_err(store_unavailable)?,
            )
            .bind(
                row.try_get::<i64, _>("commit_sequence")
                    .map_err(store_unavailable)?,
            )
            .bind(idempotency_key)
            .bind(
                row.try_get::<String, _>("intent_digest")
                    .map_err(store_unavailable)?,
            )
            .bind(request_digest)
            .bind(payload)
            .execute(&mut *transaction)
            .await
            .map_err(store_unavailable)?;
        }
        transaction.commit().await.map_err(store_unavailable)
    }

    async fn claim_pending_request(
        &self,
        tenant_id: &TenantId,
        attempted_effects: &[String],
    ) -> Result<Option<PendingEffect>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT request.effect_request_id, request.last_commit_sequence
             FROM effect_requests AS request
             WHERE request.tenant_id = $1
               AND request.knowledge_state IN ('not_attempted', 'definitely_not_sent')
               AND NOT (request.effect_request_id = ANY($2::TEXT[]))
               AND NOT EXISTS (
                   SELECT 1
                   FROM effect_dispatches AS dispatch
                   WHERE dispatch.tenant_id = request.tenant_id
                     AND dispatch.effect_request_id = request.effect_request_id
                     AND dispatch.knowledge_commit_sequence = request.last_commit_sequence
               )
             ORDER BY
               CASE request.knowledge_state
                 WHEN 'not_attempted' THEN 0
                 ELSE 1
               END,
               request.commit_sequence,
               request.effect_request_id
             LIMIT 1
             FOR UPDATE OF request SKIP LOCKED",
        )
        .bind(tenant_id.as_str())
        .bind(attempted_effects)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let Some(row) = row else {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(None);
        };
        let effect_request_id = EffectRequestId::parse(
            row.try_get::<String, _>("effect_request_id")
                .map_err(store_unavailable)?,
        )
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
        let knowledge_commit_sequence = u64::try_from(
            row.try_get::<i64, _>("last_commit_sequence")
                .map_err(store_unavailable)?,
        )
        .map_err(|_| StoreError::Corrupt("negative effect commit sequence".to_owned()))?;
        Ok(Some(PendingEffect {
            effect_request_id,
            knowledge_commit_sequence,
            transaction,
        }))
    }

    async fn record_dispatch_result(
        &self,
        tenant_id: &TenantId,
        pending: PendingEffect,
        result: Result<DispatchAcceptance, DispatchScheduleError>,
    ) -> Result<EffectDispatchResult, StoreError> {
        let PendingEffect {
            effect_request_id,
            knowledge_commit_sequence,
            mut transaction,
        } = pending;
        let knowledge_commit_sequence = i64::try_from(knowledge_commit_sequence)
            .map_err(|_| StoreError::Corrupt("effect commit sequence exceeds BIGINT".to_owned()))?;
        let attempt_number = sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(max(attempt_number), 0) + 1
             FROM effect_dispatch_attempts
             WHERE tenant_id = $1 AND effect_request_id = $2",
        )
        .bind(tenant_id.as_str())
        .bind(effect_request_id.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let (outcome, outcome_name, invocation_id, error_message) = match result {
            Ok(scheduled) => (
                EffectDispatchOutcome::Accepted,
                "accepted",
                Some(scheduled.invocation_id),
                None,
            ),
            Err(DispatchScheduleError::InvalidResponse(message)) => (
                EffectDispatchOutcome::InvalidResponse,
                "invalid_response",
                None,
                Some(message),
            ),
            Err(DispatchScheduleError::Rejected(message)) => (
                EffectDispatchOutcome::Rejected,
                "rejected",
                None,
                Some(message),
            ),
            Err(DispatchScheduleError::Unavailable(message)) => (
                EffectDispatchOutcome::RestateUnavailable,
                "restate_unavailable",
                None,
                Some(message),
            ),
        };
        sqlx::query(
            "INSERT INTO effect_dispatch_attempts (
                tenant_id, effect_request_id, attempt_number, outcome,
                restate_invocation_id, error_message
             ) VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(tenant_id.as_str())
        .bind(effect_request_id.as_str())
        .bind(attempt_number)
        .bind(outcome_name)
        .bind(invocation_id.as_deref())
        .bind(error_message)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        if let Some(invocation_id) = invocation_id.as_deref() {
            sqlx::query(
                "INSERT INTO effect_dispatches (
                    tenant_id, effect_request_id, knowledge_commit_sequence,
                    restate_invocation_id
                 ) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (
                    tenant_id, effect_request_id, knowledge_commit_sequence
                 ) DO NOTHING",
            )
            .bind(tenant_id.as_str())
            .bind(effect_request_id.as_str())
            .bind(knowledge_commit_sequence)
            .bind(invocation_id)
            .execute(&mut *transaction)
            .await
            .map_err(store_unavailable)?;
            let stored = sqlx::query_scalar::<_, String>(
                "SELECT restate_invocation_id
                 FROM effect_dispatches
                 WHERE tenant_id = $1
                   AND effect_request_id = $2
                   AND knowledge_commit_sequence = $3",
            )
            .bind(tenant_id.as_str())
            .bind(effect_request_id.as_str())
            .bind(knowledge_commit_sequence)
            .fetch_one(&mut *transaction)
            .await
            .map_err(store_unavailable)?;
            if stored != invocation_id {
                return Err(StoreError::Corrupt(
                    "Restate idempotency returned different invocation identities".to_owned(),
                ));
            }
        }
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(EffectDispatchResult {
            effect_request_id,
            outcome,
            restate_invocation_id: invocation_id,
        })
    }
}
