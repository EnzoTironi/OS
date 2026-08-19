use std::error::Error;
use std::fmt::{Display, Formatter};

use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    CanonicalJson, CommitSequence, DefinitionDigest, DefinitionId, DefinitionRevision,
    DefinitionRevisionNumber, ExecutionContext, TenantId,
};
use zoen_engine::{AdmittedDefinitionPublication, AuthorityStore, StoreError};

#[derive(Debug)]
pub enum PostgresInitError {
    Connect(sqlx::Error),
    Migrate(sqlx::migrate::MigrateError),
}

impl Display for PostgresInitError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "failed to connect to PostgreSQL: {error}"),
            Self::Migrate(error) => write!(formatter, "failed to migrate PostgreSQL: {error}"),
        }
    }
}

impl Error for PostgresInitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(error) => Some(error),
            Self::Migrate(error) => Some(error),
        }
    }
}

#[derive(Clone)]
pub struct PostgresAuthorityStore {
    pool: PgPool,
}

impl PostgresAuthorityStore {
    pub async fn connect(database_url: &str) -> Result<Self, PostgresInitError> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(database_url)
            .await
            .map_err(PostgresInitError::Connect)?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(PostgresInitError::Migrate)?;
        Ok(Self { pool })
    }
}

impl AuthorityStore for PostgresAuthorityStore {
    async fn publish(
        &self,
        context: &ExecutionContext,
        publication: &AdmittedDefinitionPublication,
    ) -> Result<DefinitionRevision, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, &context.tenant_id).await?;
        sqlx::query(
            "INSERT INTO authority_heads (tenant_id, commit_sequence)
             VALUES ($1, 0)
             ON CONFLICT (tenant_id) DO NOTHING",
        )
        .bind(context.tenant_id.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let head = sqlx::query(
            "SELECT commit_sequence
             FROM authority_heads
             WHERE tenant_id = $1
             FOR UPDATE",
        )
        .bind(context.tenant_id.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .try_get::<i64, _>("commit_sequence")
        .map_err(store_unavailable)?;

        let existing = sqlx::query(
            "SELECT definition_id, revision, digest, canonical_json, commit_sequence
             FROM definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3",
        )
        .bind(context.tenant_id.as_str())
        .bind(publication.definition_id().as_str())
        .bind(publication.digest().as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        if let Some(row) = existing {
            let revision = row_to_revision(&row)?;
            if revision.revision != publication.revision()
                || &revision.canonical_json != publication.canonical_json()
            {
                return Err(StoreError::Corrupt(
                    "content-addressed revision has different content".to_owned(),
                ));
            }
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(revision);
        }

        let revision_conflict = sqlx::query(
            "SELECT digest
             FROM definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2 AND revision = $3",
        )
        .bind(context.tenant_id.as_str())
        .bind(publication.definition_id().as_str())
        .bind(u64_to_i64(publication.revision().get(), "revision")?)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        if revision_conflict.is_some() {
            return Err(StoreError::Conflict(
                "revision number already identifies different content".to_owned(),
            ));
        }

        let next_sequence = head
            .checked_add(1)
            .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;

        sqlx::query(
            "INSERT INTO authority_commits (tenant_id, commit_sequence)
             VALUES ($1, $2)",
        )
        .bind(context.tenant_id.as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        sqlx::query(
            "INSERT INTO definition_revisions
                (tenant_id, definition_id, revision, digest, canonical_json, commit_sequence)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(context.tenant_id.as_str())
        .bind(publication.definition_id().as_str())
        .bind(u64_to_i64(publication.revision().get(), "revision")?)
        .bind(publication.digest().as_str())
        .bind(publication.canonical_json().as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let event = publication.projection_event();
        sqlx::query(
            "INSERT INTO projection_outbox
                (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
             VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
        )
        .bind(context.tenant_id.as_str())
        .bind(next_sequence)
        .bind(event.event_type())
        .bind(i32::from(event.event_version()))
        .bind(event.payload())
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let updated = sqlx::query(
            "UPDATE authority_heads
             SET commit_sequence = $2
             WHERE tenant_id = $1",
        )
        .bind(context.tenant_id.as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::Corrupt(
                "authority head update affected an unexpected row count".to_owned(),
            ));
        }

        transaction.commit().await.map_err(store_unavailable)?;

        Ok(DefinitionRevision {
            canonical_json: publication.canonical_json().clone(),
            commit_sequence: CommitSequence::new(
                u64::try_from(next_sequence)
                    .map_err(|_| StoreError::Corrupt("negative commit sequence".to_owned()))?,
            )
            .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
            definition_id: publication.definition_id().clone(),
            digest: publication.digest().clone(),
            revision: publication.revision(),
        })
    }

    async fn get_revision(
        &self,
        tenant_id: &TenantId,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT definition_id, revision, digest, canonical_json, commit_sequence
             FROM definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3",
        )
        .bind(tenant_id.as_str())
        .bind(definition_id.as_str())
        .bind(digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::NotFound)?;
        let revision = row_to_revision(&row)?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
    }
}

async fn set_tenant(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
) -> Result<(), StoreError> {
    sqlx::query("SELECT set_config('zoen.tenant_id', $1, true)")
        .bind(tenant_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    Ok(())
}

fn row_to_revision(row: &PgRow) -> Result<DefinitionRevision, StoreError> {
    let definition_id = row
        .try_get::<String, _>("definition_id")
        .map_err(store_unavailable)?;
    let revision = row
        .try_get::<i64, _>("revision")
        .map_err(store_unavailable)?;
    let digest = row
        .try_get::<String, _>("digest")
        .map_err(store_unavailable)?;
    let canonical_json = row
        .try_get::<String, _>("canonical_json")
        .map_err(store_unavailable)?;
    let commit_sequence = row
        .try_get::<i64, _>("commit_sequence")
        .map_err(store_unavailable)?;

    Ok(DefinitionRevision {
        canonical_json: CanonicalJson::new(canonical_json)
            .ok_or_else(|| StoreError::Corrupt("empty canonical JSON".to_owned()))?,
        commit_sequence: CommitSequence::new(i64_to_u64(commit_sequence, "commit sequence")?)
            .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
        definition_id: DefinitionId::parse(definition_id)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        digest: DefinitionDigest::parse(digest)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        revision: DefinitionRevisionNumber::new(i64_to_u64(revision, "revision")?)
            .ok_or_else(|| StoreError::Corrupt("zero revision".to_owned()))?,
    })
}

fn u64_to_i64(value: u64, name: &str) -> Result<i64, StoreError> {
    i64::try_from(value)
        .map_err(|_| StoreError::Conflict(format!("{name} exceeds PostgreSQL BIGINT")))
}

fn i64_to_u64(value: i64, name: &str) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::Corrupt(format!("{name} is negative")))
}

fn store_unavailable(error: sqlx::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
