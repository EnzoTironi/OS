use std::error::Error;
use std::fmt::{Display, Formatter};

use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    CanonicalJson, ClaimId, CommitSequence, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevision, DefinitionRevisionNumber, EntityId, EvidenceClaim, EvidenceDigest,
    EvidenceDraft, EvidenceProvenance, ExactDecimal, ExactInteger, ExactValue, ExecutionContext,
    RelationId, SourceId, TenantId, TimestampMicros, UnitId, ValidTime,
};
use zoen_engine::{AdmittedDefinitionPublication, AdmittedEvidence, AuthorityStore, StoreError};

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

    pub fn pool(&self) -> PgPool {
        self.pool.clone()
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
            "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
             VALUES ($1, $2, 'definition_publication')",
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

    async fn record_evidence(
        &self,
        context: &ExecutionContext,
        evidence: &AdmittedEvidence,
    ) -> Result<EvidenceClaim, StoreError> {
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
            "SELECT claim_id, definition_id, definition_digest, definition_revision,
                    entity_id, relation_id, value_kind, value_text, value_unit,
                    valid_time_kind, valid_from_micros, valid_to_micros,
                    source_id, source_digest, source_ref, commit_sequence
             FROM semantic_claims
             WHERE tenant_id = $1 AND claim_id = $2",
        )
        .bind(context.tenant_id.as_str())
        .bind(evidence.draft().claim_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        if let Some(row) = existing {
            let claim = row_to_claim(&row)?;
            if claim.draft != *evidence.draft() {
                return Err(StoreError::Conflict(
                    "claim id already identifies different evidence".to_owned(),
                ));
            }
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(claim);
        }

        let next_sequence = head
            .checked_add(1)
            .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
        sqlx::query(
            "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
             VALUES ($1, $2, 'evidence')",
        )
        .bind(context.tenant_id.as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let draft = evidence.draft();
        let (value_kind, value_text, value_unit) = value_columns(&draft.value);
        let (valid_time_kind, valid_from_micros, valid_to_micros) =
            valid_time_columns(&draft.valid_time);
        sqlx::query(
            "INSERT INTO semantic_claims (
                tenant_id, claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence
             ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9, $10,
                $11, $12, $13,
                $14, $15, $16, $17
             )",
        )
        .bind(context.tenant_id.as_str())
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
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let event = evidence.projection_event();
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

        Ok(EvidenceClaim {
            commit_sequence: CommitSequence::new(i64_to_u64(next_sequence, "commit sequence")?)
                .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
            draft: draft.clone(),
        })
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

fn row_to_claim(row: &PgRow) -> Result<EvidenceClaim, StoreError> {
    let claim_id = ClaimId::parse(row_string(row, "claim_id")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let definition_id = DefinitionId::parse(row_string(row, "definition_id")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let definition_digest = DefinitionDigest::parse(row_string(row, "definition_digest")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let definition_revision = DefinitionRevisionNumber::new(i64_to_u64(
        row_i64(row, "definition_revision")?,
        "definition revision",
    )?)
    .ok_or_else(|| StoreError::Corrupt("zero definition revision".to_owned()))?;
    let entity_id = EntityId::parse(row_string(row, "entity_id")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let relation_id = RelationId::parse(row_string(row, "relation_id")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let value = row_to_value(row)?;
    let valid_time = row_to_valid_time(row)?;
    let source_id = SourceId::parse(row_string(row, "source_id")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let source_digest = EvidenceDigest::parse(row_string(row, "source_digest")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let commit_sequence = CommitSequence::new(i64_to_u64(
        row_i64(row, "commit_sequence")?,
        "commit sequence",
    )?)
    .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?;

    Ok(EvidenceClaim {
        commit_sequence,
        draft: EvidenceDraft {
            claim_id,
            definition: DefinitionReference {
                definition_id,
                digest: definition_digest,
                revision: definition_revision,
            },
            entity_id,
            provenance: EvidenceProvenance {
                source_digest,
                source_id,
                source_ref: row_string(row, "source_ref")?,
            },
            relation_id,
            valid_time,
            value,
        },
    })
}

fn value_columns(value: &ExactValue) -> (&'static str, String, Option<&str>) {
    match value {
        ExactValue::Bool(value) => ("bool", value.to_string(), None),
        ExactValue::Decimal(value) => ("decimal", value.as_str().to_owned(), None),
        ExactValue::Integer(value) => ("integer", value.as_str().to_owned(), None),
        ExactValue::Quantity { amount, unit } => {
            ("quantity", amount.as_str().to_owned(), Some(unit.as_str()))
        }
        ExactValue::Text(value) => ("text", value.clone(), None),
    }
}

fn valid_time_columns(valid_time: &ValidTime) -> (&'static str, i64, Option<i64>) {
    match valid_time {
        ValidTime::Instant(at) => ("instant", at.get(), None),
        ValidTime::Interval { start, end } => ("interval", start.get(), Some(end.get())),
    }
}

fn row_to_value(row: &PgRow) -> Result<ExactValue, StoreError> {
    let kind = row_string(row, "value_kind")?;
    let value = row_string(row, "value_text")?;
    match kind.as_str() {
        "bool" => match value.as_str() {
            "true" => Ok(ExactValue::Bool(true)),
            "false" => Ok(ExactValue::Bool(false)),
            _ => Err(StoreError::Corrupt(format!(
                "invalid stored boolean: {value}"
            ))),
        },
        "decimal" => ExactDecimal::parse(value)
            .map(ExactValue::Decimal)
            .map_err(|error| StoreError::Corrupt(error.to_string())),
        "integer" => ExactInteger::parse(value)
            .map(ExactValue::Integer)
            .map_err(|error| StoreError::Corrupt(error.to_string())),
        "quantity" => {
            let unit = row
                .try_get::<Option<String>, _>("value_unit")
                .map_err(store_unavailable)?
                .ok_or_else(|| StoreError::Corrupt("quantity has no unit".to_owned()))?;
            Ok(ExactValue::Quantity {
                amount: ExactDecimal::parse(value)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                unit: UnitId::parse(unit)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            })
        }
        "text" => Ok(ExactValue::Text(value)),
        _ => Err(StoreError::Corrupt(format!(
            "unknown stored value kind: {kind}"
        ))),
    }
}

fn row_to_valid_time(row: &PgRow) -> Result<ValidTime, StoreError> {
    let kind = row_string(row, "valid_time_kind")?;
    let start = TimestampMicros::new(row_i64(row, "valid_from_micros")?);
    let end = row
        .try_get::<Option<i64>, _>("valid_to_micros")
        .map_err(store_unavailable)?
        .map(TimestampMicros::new);
    match (kind.as_str(), end) {
        ("instant", None) => Ok(ValidTime::instant(start)),
        ("interval", Some(end)) => {
            ValidTime::interval(start, end).map_err(|error| StoreError::Corrupt(error.to_string()))
        }
        _ => Err(StoreError::Corrupt(
            "stored valid-time shape is inconsistent".to_owned(),
        )),
    }
}

fn row_string(row: &PgRow, column: &str) -> Result<String, StoreError> {
    row.try_get::<String, _>(column).map_err(store_unavailable)
}

fn row_i64(row: &PgRow, column: &str) -> Result<i64, StoreError> {
    row.try_get::<i64, _>(column).map_err(store_unavailable)
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
