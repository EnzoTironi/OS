use sqlx::{PgPool, Row};
use zoen_core::{EffectRequestId, TenantId};
use zoen_engine::{
    EffectScheduleCommand, EffectScheduleError, EffectScheduler, ScheduledEffect, StoreError,
};

use crate::{set_tenant, store_unavailable};

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
    S: EffectScheduler,
{
    pub fn new(pool: PgPool, scheduler: S) -> Self {
        Self { pool, scheduler }
    }

    pub async fn dispatch_once(
        &self,
        tenant_id: &TenantId,
        limit: u32,
    ) -> Result<Vec<EffectDispatchResult>, StoreError> {
        let requests = self.pending_requests(tenant_id, limit).await?;
        let mut results = Vec::with_capacity(requests.len());
        for effect_request_id in requests {
            let scheduled = self
                .scheduler
                .schedule(&EffectScheduleCommand {
                    effect_request_id: effect_request_id.clone(),
                    tenant_id: tenant_id.clone(),
                })
                .await;
            results.push(
                self.record_dispatch_result(tenant_id, effect_request_id, scheduled)
                    .await?,
            );
        }
        Ok(results)
    }

    async fn pending_requests(
        &self,
        tenant_id: &TenantId,
        limit: u32,
    ) -> Result<Vec<EffectRequestId>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let rows = sqlx::query(
            "SELECT request.effect_request_id
             FROM effect_requests AS request
             LEFT JOIN effect_dispatches AS dispatch
               ON dispatch.tenant_id = request.tenant_id
              AND dispatch.effect_request_id = request.effect_request_id
             WHERE request.tenant_id = $1
               AND dispatch.effect_request_id IS NULL
             ORDER BY request.commit_sequence, request.effect_request_id
             LIMIT $2",
        )
        .bind(tenant_id.as_str())
        .bind(i64::from(limit))
        .fetch_all(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let requests = rows
            .into_iter()
            .map(|row| {
                row.try_get::<String, _>("effect_request_id")
                    .map_err(store_unavailable)
                    .and_then(|value| {
                        EffectRequestId::parse(value)
                            .map_err(|error| StoreError::Corrupt(error.to_string()))
                    })
            })
            .collect::<Result<Vec<_>, _>>()?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(requests)
    }

    async fn record_dispatch_result(
        &self,
        tenant_id: &TenantId,
        effect_request_id: EffectRequestId,
        result: Result<ScheduledEffect, EffectScheduleError>,
    ) -> Result<EffectDispatchResult, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        sqlx::query(
            "SELECT effect_request_id
             FROM effect_requests
             WHERE tenant_id = $1 AND effect_request_id = $2
             FOR UPDATE",
        )
        .bind(tenant_id.as_str())
        .bind(effect_request_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::NotFound)?;
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
            Err(EffectScheduleError::InvalidResponse(message)) => (
                EffectDispatchOutcome::InvalidResponse,
                "invalid_response",
                None,
                Some(message),
            ),
            Err(EffectScheduleError::Rejected(message)) => (
                EffectDispatchOutcome::Rejected,
                "rejected",
                None,
                Some(message),
            ),
            Err(EffectScheduleError::Unavailable(message)) => (
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
                    tenant_id, effect_request_id, restate_invocation_id
                 ) VALUES ($1, $2, $3)
                 ON CONFLICT (tenant_id, effect_request_id) DO NOTHING",
            )
            .bind(tenant_id.as_str())
            .bind(effect_request_id.as_str())
            .bind(invocation_id)
            .execute(&mut *transaction)
            .await
            .map_err(store_unavailable)?;
            let stored = sqlx::query_scalar::<_, String>(
                "SELECT restate_invocation_id
                 FROM effect_dispatches
                 WHERE tenant_id = $1 AND effect_request_id = $2",
            )
            .bind(tenant_id.as_str())
            .bind(effect_request_id.as_str())
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
