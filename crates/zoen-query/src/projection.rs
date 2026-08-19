use std::sync::Arc;

use object_store::path::Path;
use object_store::{ObjectStore, PutMode, PutOptions};
use parquet::arrow::ArrowWriter;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;
use zoen_core::TenantId;

use crate::physical::{PhysicalClaim, claims_to_batch};
use crate::{ObjectStoreConfig, QueryError};

const PROJECTION_ID: &str = "semantic_claims_v1";
const SEMANTIC_SCHEMA_REVISION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectionMode {
    Incremental,
    Rebuild,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProjectionRunOptions {
    pub fail_before_publish: bool,
    pub mode: ProjectionMode,
}

impl Default for ProjectionRunOptions {
    fn default() -> Self {
        Self {
            fail_before_publish: false,
            mode: ProjectionMode::Incremental,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectionOutcome {
    pub manifest_digest: String,
    pub manifest_object_key: String,
    pub parquet_digest: String,
    pub parquet_object_key: String,
    pub projected_rows: usize,
    pub through_commit: u64,
    pub wrote_manifest: bool,
}

#[derive(Clone)]
pub struct ProjectionWorker {
    pool: PgPool,
    store: Arc<dyn ObjectStore>,
}

impl ProjectionWorker {
    pub async fn connect(
        database_url: &str,
        object_store: &ObjectStoreConfig,
    ) -> Result<Self, QueryError> {
        let pool = PgPoolOptions::new()
            .max_connections(4)
            .connect(database_url)
            .await
            .map_err(unavailable)?;
        Ok(Self {
            pool,
            store: object_store.build()?,
        })
    }

    pub async fn run_once(
        &self,
        tenant_id: &TenantId,
        options: ProjectionRunOptions,
    ) -> Result<ProjectionOutcome, QueryError> {
        let current = self.current_projection(tenant_id).await?;
        let target = self.authority_head(tenant_id).await?;
        if target == 0 {
            return Err(QueryError::Invalid(
                "cannot project a tenant with no authority commits".to_owned(),
            ));
        }
        if options.mode == ProjectionMode::Incremental
            && let Some(current) = current
            && current.through_commit >= target
        {
            return current.into_outcome(false);
        }

        self.verify_outbox(tenant_id, target).await?;
        let claims = self.load_claims(tenant_id, target).await?;
        let batch = claims_to_batch(&claims)?;
        let mut writer = ArrowWriter::try_new(Vec::new(), batch.schema(), None)
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        writer
            .write(&batch)
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        let parquet = writer
            .into_inner()
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        let parquet_digest = sha256(&parquet);
        let build_id = Uuid::new_v4().to_string();
        let parquet_object_key = format!(
            "projections/{PROJECTION_ID}/{}/{build_id}/claims.parquet",
            tenant_id.as_str()
        );
        put_immutable(&*self.store, &parquet_object_key, parquet).await?;

        let manifest = ProjectionManifest {
            build_id: &build_id,
            from_commit: 1,
            object_refs: vec![ProjectionObjectRef {
                digest: &parquet_digest,
                key: &parquet_object_key,
                rows: claims.len(),
            }],
            projection_id: PROJECTION_ID,
            semantic_schema_revision: SEMANTIC_SCHEMA_REVISION,
            tenant_id: tenant_id.as_str(),
            through_commit: target,
        };
        let manifest_bytes = serde_json::to_vec(&manifest)
            .map_err(|error| QueryError::Corrupt(error.to_string()))?;
        let manifest_digest = sha256(&manifest_bytes);
        let manifest_object_key =
            format!("projections/{PROJECTION_ID}/manifests/{manifest_digest}.json");
        put_immutable(&*self.store, &manifest_object_key, manifest_bytes).await?;

        if options.fail_before_publish {
            return Err(QueryError::Unavailable(
                "injected projection failure before manifest publication".to_owned(),
            ));
        }

        self.publish_manifest(
            tenant_id,
            PublishedManifest {
                build_id: &build_id,
                manifest_digest: &manifest_digest,
                manifest_object_key: &manifest_object_key,
                parquet_digest: &parquet_digest,
                parquet_object_key: &parquet_object_key,
                through_commit: target,
            },
        )
        .await?;

        Ok(ProjectionOutcome {
            manifest_digest,
            manifest_object_key,
            parquet_digest,
            parquet_object_key,
            projected_rows: claims.len(),
            through_commit: i64_to_u64(target, "projection target")?,
            wrote_manifest: true,
        })
    }

    async fn authority_head(&self, tenant_id: &TenantId) -> Result<i64, QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let head = sqlx::query(
            "SELECT commit_sequence
             FROM authority_heads
             WHERE tenant_id = $1",
        )
        .bind(tenant_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .map(|row| row.try_get::<i64, _>("commit_sequence"))
        .transpose()
        .map_err(unavailable)?
        .unwrap_or(0);
        transaction.commit().await.map_err(unavailable)?;
        Ok(head)
    }

    async fn current_projection(
        &self,
        tenant_id: &TenantId,
    ) -> Result<Option<CurrentProjection>, QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT w.through_commit, w.manifest_digest,
                    m.manifest_object_key, m.parquet_object_key, m.parquet_digest
             FROM projection_watermarks w
             JOIN projection_manifests m
               ON m.tenant_id = w.tenant_id
              AND m.projection_id = w.projection_id
              AND m.manifest_digest = w.manifest_digest
             WHERE w.tenant_id = $1 AND w.projection_id = $2",
        )
        .bind(tenant_id.as_str())
        .bind(PROJECTION_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        row.map(|row| {
            Ok(CurrentProjection {
                manifest_digest: row.try_get("manifest_digest").map_err(unavailable)?,
                manifest_object_key: row.try_get("manifest_object_key").map_err(unavailable)?,
                parquet_digest: row.try_get("parquet_digest").map_err(unavailable)?,
                parquet_object_key: row.try_get("parquet_object_key").map_err(unavailable)?,
                through_commit: row.try_get("through_commit").map_err(unavailable)?,
            })
        })
        .transpose()
    }

    async fn verify_outbox(&self, tenant_id: &TenantId, target: i64) -> Result<(), QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let missing = sqlx::query(
            "SELECT count(*)::bigint AS missing
             FROM authority_commits c
             WHERE c.tenant_id = $1
               AND c.commit_sequence <= $2
               AND NOT EXISTS (
                   SELECT 1
                   FROM projection_outbox o
                   WHERE o.tenant_id = c.tenant_id
                     AND o.commit_sequence = c.commit_sequence
                     AND o.ordinal = 0
               )",
        )
        .bind(tenant_id.as_str())
        .bind(target)
        .fetch_one(&mut *transaction)
        .await
        .map_err(unavailable)?
        .try_get::<i64, _>("missing")
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        if missing == 0 {
            Ok(())
        } else {
            Err(QueryError::Corrupt(format!(
                "authority range has {missing} commit(s) without projection outbox entries"
            )))
        }
    }

    async fn load_claims(
        &self,
        tenant_id: &TenantId,
        target: i64,
    ) -> Result<Vec<PhysicalClaim>, QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let rows = sqlx::query(
            "SELECT tenant_id, claim_id, definition_id, definition_digest,
                    definition_revision, entity_id, relation_id, value_kind, value_text,
                    value_unit, valid_time_kind, valid_from_micros, valid_to_micros,
                    source_id, source_digest, source_ref, commit_sequence
             FROM semantic_claims
             WHERE tenant_id = $1 AND commit_sequence <= $2
             ORDER BY commit_sequence, claim_id",
        )
        .bind(tenant_id.as_str())
        .bind(target)
        .fetch_all(&mut *transaction)
        .await
        .map_err(unavailable)?;
        let claims = rows
            .iter()
            .map(PhysicalClaim::from_postgres)
            .collect::<Result<_, _>>()?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(claims)
    }

    async fn publish_manifest(
        &self,
        tenant_id: &TenantId,
        manifest: PublishedManifest<'_>,
    ) -> Result<(), QueryError> {
        let mut transaction = self.pool.begin().await.map_err(unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!("{}:{PROJECTION_ID}", tenant_id.as_str()))
            .execute(&mut *transaction)
            .await
            .map_err(unavailable)?;
        let current = sqlx::query(
            "SELECT through_commit
             FROM projection_watermarks
             WHERE tenant_id = $1 AND projection_id = $2
             FOR UPDATE",
        )
        .bind(tenant_id.as_str())
        .bind(PROJECTION_ID)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(unavailable)?
        .map(|row| row.try_get::<i64, _>("through_commit"))
        .transpose()
        .map_err(unavailable)?;
        if current.is_some_and(|current| current > manifest.through_commit) {
            return Err(QueryError::Freshness {
                available: current.and_then(|value| u64::try_from(value).ok()),
                requested: i64_to_u64(manifest.through_commit, "projection target")?,
            });
        }

        sqlx::query(
            "INSERT INTO projection_manifests (
                tenant_id, projection_id, manifest_digest, build_id,
                from_commit, through_commit, manifest_object_key,
                parquet_object_key, parquet_digest
             ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)",
        )
        .bind(tenant_id.as_str())
        .bind(PROJECTION_ID)
        .bind(manifest.manifest_digest)
        .bind(manifest.build_id)
        .bind(manifest.through_commit)
        .bind(manifest.manifest_object_key)
        .bind(manifest.parquet_object_key)
        .bind(manifest.parquet_digest)
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        sqlx::query(
            "INSERT INTO projection_watermarks (
                tenant_id, projection_id, through_commit, manifest_digest
             ) VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, projection_id)
             DO UPDATE SET
                through_commit = EXCLUDED.through_commit,
                manifest_digest = EXCLUDED.manifest_digest,
                updated_at = clock_timestamp()",
        )
        .bind(tenant_id.as_str())
        .bind(PROJECTION_ID)
        .bind(manifest.through_commit)
        .bind(manifest.manifest_digest)
        .execute(&mut *transaction)
        .await
        .map_err(unavailable)?;
        transaction.commit().await.map_err(unavailable)?;
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectionManifest<'a> {
    build_id: &'a str,
    from_commit: i64,
    object_refs: Vec<ProjectionObjectRef<'a>>,
    projection_id: &'a str,
    semantic_schema_revision: u32,
    tenant_id: &'a str,
    through_commit: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectionObjectRef<'a> {
    digest: &'a str,
    key: &'a str,
    rows: usize,
}

struct PublishedManifest<'a> {
    build_id: &'a str,
    manifest_digest: &'a str,
    manifest_object_key: &'a str,
    parquet_digest: &'a str,
    parquet_object_key: &'a str,
    through_commit: i64,
}

struct CurrentProjection {
    manifest_digest: String,
    manifest_object_key: String,
    parquet_digest: String,
    parquet_object_key: String,
    through_commit: i64,
}

impl CurrentProjection {
    fn into_outcome(self, wrote_manifest: bool) -> Result<ProjectionOutcome, QueryError> {
        Ok(ProjectionOutcome {
            manifest_digest: self.manifest_digest,
            manifest_object_key: self.manifest_object_key,
            parquet_digest: self.parquet_digest,
            parquet_object_key: self.parquet_object_key,
            projected_rows: 0,
            through_commit: i64_to_u64(self.through_commit, "projection watermark")?,
            wrote_manifest,
        })
    }
}

async fn put_immutable(
    store: &dyn ObjectStore,
    key: &str,
    bytes: Vec<u8>,
) -> Result<(), QueryError> {
    store
        .put_opts(
            &Path::from(key),
            bytes.into(),
            PutOptions {
                mode: PutMode::Create,
                ..PutOptions::default()
            },
        )
        .await
        .map_err(|error| QueryError::Unavailable(error.to_string()))?;
    Ok(())
}

async fn set_tenant(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
) -> Result<(), QueryError> {
    sqlx::query("SELECT set_config('zoen.tenant_id', $1, true)")
        .bind(tenant_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(unavailable)?;
    Ok(())
}

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn i64_to_u64(value: i64, name: &str) -> Result<u64, QueryError> {
    u64::try_from(value)
        .map_err(|_| QueryError::Corrupt(format!("{name} is negative or out of range")))
}

fn unavailable(error: sqlx::Error) -> QueryError {
    QueryError::Unavailable(error.to_string())
}
