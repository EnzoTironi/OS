use std::{
    error::Error,
    fmt::{Display, Formatter},
    time::Duration,
};

use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::TenantId;

use super::PostgresAuthorityStore;

#[derive(Debug)]
pub enum IntegrityError {
    Query(sqlx::Error),
    MissingTable(String),
    RlsDisabled(String),
}

impl Display for IntegrityError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Query(error) => write!(formatter, "failed to verify semantic integrity: {error}"),
            Self::MissingTable(table) => {
                write!(formatter, "authority table {table} is missing")
            }
            Self::RlsDisabled(table) => {
                write!(formatter, "row-level security is disabled on {table}")
            }
        }
    }
}

impl Error for IntegrityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::MissingTable(_) | Self::RlsDisabled(_) => None,
        }
    }
}

/// Readiness of the tenant's projection watermark heartbeat.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectionWatermarkStatus {
    Current,
    Missing,
    Stale,
}

const SEMANTIC_PROJECTION_ID: &str = "semantic_claims_v1";

impl PostgresAuthorityStore {
    /// Fail closed when authority tables lack RLS or expected relations.
    ///
    /// # Errors
    ///
    /// Returns [`IntegrityError`] when a required table is missing, RLS is off,
    /// or `PostgreSQL` is unavailable.
    pub async fn verify_integrity(
        &self,
        authority_tables: &[String],
        reference_tables: &[String],
        require_reference: bool,
    ) -> Result<(), IntegrityError> {
        for table in authority_tables {
            verify_table(&self.pool, table, true).await?;
        }
        for table in reference_tables {
            verify_table(&self.pool, table, require_reference).await?;
        }
        Ok(())
    }

    /// Report whether the tenant watermark exists and has heartbeat within `max_age`.
    ///
    /// # Errors
    ///
    /// Returns [`IntegrityError::Query`] when PostgreSQL is unavailable.
    pub async fn projection_watermark(
        &self,
        tenant_id: &TenantId,
        max_age: Duration,
    ) -> Result<ProjectionWatermarkStatus, IntegrityError> {
        let mut transaction = self.pool.begin().await.map_err(IntegrityError::Query)?;
        set_ready_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT (EXTRACT(EPOCH FROM (pg_catalog.clock_timestamp() - updated_at)) * 1000)::bigint AS age_ms
             FROM public.projection_watermarks
             WHERE tenant_id = $1 AND projection_id = $2",
        )
        .bind(tenant_id.as_str())
        .bind(SEMANTIC_PROJECTION_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(IntegrityError::Query)?;
        transaction.commit().await.map_err(IntegrityError::Query)?;
        let Some(row) = row else {
            return Ok(ProjectionWatermarkStatus::Missing);
        };
        let age_ms = row
            .try_get::<i64, _>("age_ms")
            .map_err(IntegrityError::Query)?;
        let Ok(max_age_ms) = i64::try_from(max_age.as_millis()) else {
            return Ok(ProjectionWatermarkStatus::Current);
        };
        if age_ms < 0 || age_ms > max_age_ms {
            Ok(ProjectionWatermarkStatus::Stale)
        } else {
            Ok(ProjectionWatermarkStatus::Current)
        }
    }
}

async fn set_ready_tenant(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
) -> Result<(), IntegrityError> {
    sqlx::query("SELECT pg_catalog.set_config('zoen.tenant_id', $1, true)")
        .bind(tenant_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(IntegrityError::Query)?;
    Ok(())
}

async fn verify_table(pool: &PgPool, table: &str, required: bool) -> Result<(), IntegrityError> {
    let row = sqlx::query(
        "SELECT c.relrowsecurity AS relrowsecurity,
                c.relforcerowsecurity AS relforcerowsecurity
         FROM pg_class AS c
         JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relname = $1",
    )
    .bind(table)
    .fetch_optional(pool)
    .await
    .map_err(IntegrityError::Query)?;
    match row {
        None if required => Err(IntegrityError::MissingTable(table.to_owned())),
        None => Ok(()),
        Some(row) => {
            let rls = row
                .try_get::<bool, _>("relrowsecurity")
                .map_err(IntegrityError::Query)?;
            let force = row
                .try_get::<bool, _>("relforcerowsecurity")
                .map_err(IntegrityError::Query)?;
            if rls && force {
                Ok(())
            } else {
                Err(IntegrityError::RlsDisabled(table.to_owned()))
            }
        }
    }
}
