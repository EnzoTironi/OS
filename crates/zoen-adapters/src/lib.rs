use sqlx::{Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    CanonicalJson, ClaimId, CommitSequence, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevision, DefinitionRevisionNumber, EntityId, EvidenceClaim, EvidenceDigest,
    EvidenceDraft, EvidenceProvenance, RelationId, SourceId, TenantId, TimestampMicros,
};
use zoen_engine::StoreError;

pub(crate) const SEMANTIC_CLAIM_COLUMNS: &str =
    "claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence,
                observed_at_micros, ingested_at_micros";

mod action_store;
mod authority_store;
mod cedar;
mod claim_store;
mod effect_dispatcher;
mod effect_store;
mod evidence_store;
mod external_signal_store;
mod history_store;
mod identity_store;
mod integrity;
mod migration_store;
mod ontology_catalog;
mod pack_registry_store;
mod pack_store;
mod release_cedar;
mod restate;
mod scenario_store;
mod semantic_claim_store;
mod session_door;
mod value_store;
mod wasm_store;
mod wasmtime_adapter;
mod workload_credential_store;
mod world_kernel_store;
mod world_release_store;

pub use action_store::PostgresActionCommit;
pub use authority_store::{PostgresAuthorityStore, PostgresInitError};
pub use cedar::{CedarConfigError, CedarPolicyEvaluator, budget_classes_from_policy_catalog};
pub use claim_store::{
    PostgresClaimLoader, PostgresClaimQuery, PostgresOverlayClaimQuery, PostgresOverlayTypeQuery,
    PostgresTypeQuery,
};
pub use effect_dispatcher::{
    DispatchAcceptance, DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
    EffectDispatchOutcome, EffectDispatchResult, PostgresEffectDispatcher,
};
pub use effect_store::PostgresEffectUpdate;
pub use external_signal_store::PostgresExternalSignalStore;
pub use identity_store::{
    AccountSnapshot, CompleteOnboard, CreateInvite, MintedOnboardToken, OnboardTokenRow,
    PostgresIdentityStore, WorldInvite, dest_invitee_delegation,
};
pub use integrity::{ActiveReleaseStatus, IntegrityError, ProjectionWatermarkStatus};
pub use ontology_catalog::{
    ParsedOntologyCatalog, require_loadable_ontology_catalog, seven_verb_ontology_catalog_bytes,
};
pub use pack_registry_store::{PostgresPackRegistryStore, PutObjectInput, RecordAttributionInput};
pub use pack_store::{PostgresPackStore, admit_pack};
pub use release_cedar::{ReleaseCedarEvaluator, require_loadable_policy_catalog};
pub use restate::{RestateEffectScheduler, restate_effect_key};
pub use session_door::SessionDoor;
use value_store::row_to_valid_time;
pub(crate) use value_store::{row_to_value, valid_time_columns, value_columns};
pub use wasmtime_adapter::{WasmtimeComputationExecutor, WasmtimeConfigError};
pub use workload_credential_store::{
    IssueWorkloadCredential, IssuedWorkloadCredential, PostgresWorkloadCredentialStore,
};
pub use world_kernel_store::PostgresWorldKernel;
pub use world_release_store::{
    ActivatePut, DecisionPut, PostgresWorldReleaseStore, PreviewPut, PublicationPut,
    ReleaseAuthorityOperation, ReleaseAuthorization,
};

pub(crate) async fn set_tenant(
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

async fn require_active_revision(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    definition: &DefinitionReference,
) -> Result<(), StoreError> {
    let active = sqlx::query_scalar::<_, bool>(
        "SELECT true
         FROM active_definition_revisions
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4
         FOR SHARE",
    )
    .bind(tenant_id.as_str())
    .bind(definition.definition_id.as_str())
    .bind(definition.digest.as_str())
    .bind(u64_to_i64(
        definition.revision.get(),
        "definition revision",
    )?)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if active.is_some() {
        Ok(())
    } else {
        Err(StoreError::InactiveDefinition)
    }
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

pub(crate) fn row_to_claim(row: &PgRow) -> Result<EvidenceClaim, StoreError> {
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
                ingested_at: Some(TimestampMicros::new(row_i64(row, "ingested_at_micros")?)),
                observed_at: row
                    .try_get::<Option<i64>, _>("observed_at_micros")
                    .map_err(store_unavailable)?
                    .map(TimestampMicros::new),
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

pub(crate) fn i64_to_u64(value: i64, name: &str) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::Corrupt(format!("{name} is negative")))
}

pub(crate) fn store_unavailable(error: impl std::fmt::Display) -> StoreError {
    StoreError::Unavailable(error.to_string())
}

pub(crate) fn clock_micros() -> i64 {
    i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |duration| duration.as_micros()),
    )
    .unwrap_or(i64::MAX)
}
