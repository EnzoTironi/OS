use std::{
    error::Error,
    fmt::{Display, Formatter},
};

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

pub trait DispatchScheduler: Send + Sync {
    fn schedule(
        &self,
        command: &DispatchScheduleCommand,
    ) -> impl std::future::Future<Output = Result<DispatchAcceptance, DispatchScheduleError>> + Send;
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

    /// Claim and schedule up to `limit` pending effect requests.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when `PostgreSQL` is unavailable or a stored row is
    /// corrupt.
    pub async fn dispatch_once(
        &self,
        tenant_id: &TenantId,
        limit: u32,
    ) -> Result<Vec<EffectDispatchResult>, StoreError> {
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
        let (outcome, outcome_name, invocation_id, error_message) = dispatch_columns(result);
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

fn dispatch_columns(
    result: Result<DispatchAcceptance, DispatchScheduleError>,
) -> (
    EffectDispatchOutcome,
    &'static str,
    Option<String>,
    Option<String>,
) {
    match result {
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
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn dispatch_reads_effect_requests_without_legacy_materializer() {
        let source = include_str!("effect_dispatcher.rs");
        let production = source
            .split("#[cfg(test)]")
            .next()
            .expect("production source");
        let legacy_fn = ["materialize", "legacy", "requests"].join("_");
        assert!(!production.contains(&legacy_fn));
        assert!(production.contains("FROM effect_requests AS request"));
        assert!(!production.contains("FROM projection_outbox"));
    }

    #[test]
    fn drain_migration_backfills_then_asserts_no_outbox_only_rows() {
        let migration = include_str!("../migrations/0016_drain_outbox_only_effect_requests.sql");
        assert!(migration.contains("INSERT INTO effect_requests"));
        assert!(migration.contains("ON CONFLICT (tenant_id, effect_request_id) DO NOTHING"));
        assert!(migration.contains("outbox-only effect rows remain after backfill"));
        assert!(
            !migration.contains("DELETE FROM projection_outbox"),
            "drain backfills effect_requests; it does not delete outbox history"
        );
    }
}
