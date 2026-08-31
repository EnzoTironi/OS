use std::{fmt::Display, sync::Arc};

use object_store::{ObjectStore, PutMode, PutOptions, path::Path};
use parquet::arrow::ArrowWriter;
use serde::Serialize;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;
use zoen_core::TenantId;

use crate::{
    ObjectStoreConfig, QueryError,
    physical::{PhysicalClaim, claims_to_batch},
    sha256,
};

const PROJECTION_ID: &str = "semantic_claims_v1";
const SEMANTIC_SCHEMA_REVISION: u32 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProjectionMode {
    RunOnce,
    Rebuild,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProjectionRunOptions {
    pub mode: ProjectionMode,
}

impl Default for ProjectionRunOptions {
    fn default() -> Self {
        Self {
            mode: ProjectionMode::RunOnce,
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
    /// Open a projection worker against Postgres and the configured object store.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError::Unavailable`] when the object store client cannot be
    /// constructed from `object_store`.
    pub fn new(pool: PgPool, object_store: &ObjectStoreConfig) -> Result<Self, QueryError> {
        Ok(Self {
            pool,
            store: object_store.build()?,
        })
    }

    /// Project semantic claims through the tenant authority head.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] when the tenant has no authority commits, projection
    /// outbox coverage is incomplete, stored rows are corrupt, object storage is
    /// unavailable, or a newer watermark already exists.
    pub async fn run_once(
        &self,
        tenant_id: &TenantId,
        options: ProjectionRunOptions,
    ) -> Result<ProjectionOutcome, QueryError> {
        let state = load_source_state(&self.pool, tenant_id).await?;
        let target = state.authority_head;
        if target == 0 {
            return Err(QueryError::Invalid(
                "cannot project a tenant with no authority commits".to_owned(),
            ));
        }
        if options.mode == ProjectionMode::RunOnce
            && let Some(current) = state.projection
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
        let manifest_object_key = projection_manifest_object_key(tenant_id, &manifest_digest);
        put_immutable(&*self.store, &manifest_object_key, manifest_bytes).await?;

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

        // V1 rebuilds are always full (claims through through_commit). The column
        // stays NOT NULL in schema; 1 is a placeholder, not an incremental range.
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

pub(crate) struct SourceState {
    pub(crate) authority_head: i64,
    pub(crate) projection: Option<ProjectionState>,
}

pub(crate) struct ProjectionState {
    pub(crate) manifest_digest: String,
    pub(crate) manifest_object_key: String,
    pub(crate) parquet_digest: String,
    pub(crate) parquet_object_key: String,
    pub(crate) through_commit: i64,
}

pub(crate) async fn load_source_state(
    pool: &PgPool,
    tenant_id: &TenantId,
) -> Result<SourceState, QueryError> {
    let mut transaction = pool.begin().await.map_err(unavailable)?;
    set_tenant(&mut transaction, tenant_id).await?;
    let row = sqlx::query(
        "SELECT h.commit_sequence AS authority_head,
                w.through_commit, w.manifest_digest,
                m.manifest_object_key, m.parquet_object_key, m.parquet_digest
         FROM authority_heads h
         LEFT JOIN projection_watermarks w
           ON w.tenant_id = h.tenant_id
          AND w.projection_id = $2
         LEFT JOIN projection_manifests m
           ON m.tenant_id = w.tenant_id
          AND m.projection_id = w.projection_id
          AND m.manifest_digest = w.manifest_digest
         WHERE h.tenant_id = $1",
    )
    .bind(tenant_id.as_str())
    .bind(PROJECTION_ID)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(unavailable)?;
    transaction.commit().await.map_err(unavailable)?;
    let Some(row) = row else {
        return Ok(SourceState {
            authority_head: 0,
            projection: None,
        });
    };
    let authority_head = row.try_get("authority_head").map_err(unavailable)?;
    let through_commit = row
        .try_get::<Option<i64>, _>("through_commit")
        .map_err(unavailable)?;
    let projection = through_commit
        .map(|through_commit| {
            Ok(ProjectionState {
                manifest_digest: required_projection_column(&row, "manifest_digest")?,
                manifest_object_key: required_projection_column(&row, "manifest_object_key")?,
                parquet_digest: required_projection_column(&row, "parquet_digest")?,
                parquet_object_key: required_projection_column(&row, "parquet_object_key")?,
                through_commit,
            })
        })
        .transpose()?;
    Ok(SourceState {
        authority_head,
        projection,
    })
}

fn required_projection_column(
    row: &sqlx::postgres::PgRow,
    column: &str,
) -> Result<String, QueryError> {
    row.try_get::<Option<String>, _>(column)
        .map_err(unavailable)?
        .ok_or_else(|| QueryError::Corrupt(format!("active projection has no {column}")))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectionManifest<'a> {
    build_id: &'a str,
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

impl ProjectionState {
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

fn i64_to_u64(value: i64, name: &str) -> Result<u64, QueryError> {
    u64::try_from(value)
        .map_err(|_| QueryError::Corrupt(format!("{name} is negative or out of range")))
}

fn unavailable(error: impl Display) -> QueryError {
    QueryError::Unavailable(error.to_string())
}

fn projection_manifest_object_key(tenant_id: &TenantId, manifest_digest: &str) -> String {
    format!(
        "projections/{PROJECTION_ID}/{}/manifests/{manifest_digest}.json",
        tenant_id.as_str()
    )
}

#[cfg(test)]
mod tests {
    use zoen_core::TenantId;

    use super::projection_manifest_object_key;

    #[test]
    fn manifest_keys_include_the_tenant_even_when_digests_collide() {
        let digest = "a".repeat(64);
        let tenant_a = TenantId::parse("tenant.a").expect("tenant a");
        let tenant_b = TenantId::parse("tenant.b").expect("tenant b");

        assert_eq!(
            projection_manifest_object_key(&tenant_a, &digest),
            format!("projections/semantic_claims_v1/tenant.a/manifests/{digest}.json")
        );
        assert_ne!(
            projection_manifest_object_key(&tenant_a, &digest),
            projection_manifest_object_key(&tenant_b, &digest)
        );
    }
}
