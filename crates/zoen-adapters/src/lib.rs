use std::error::Error;
use std::fmt::{Display, Formatter};

use sqlx::postgres::{PgPoolOptions, PgRow};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionApproval, ActionProposal, CanonicalJson, ClaimId, CommitReceipt, CommitSequence,
    DefinitionActivation, DefinitionDigest, DefinitionId, DefinitionReference, DefinitionRevision,
    DefinitionRevisionNumber, EffectRequestId, EffectSnapshot, EntityId, EvidenceClaim,
    EvidenceDigest, EvidenceDraft, EvidenceProvenance, ExecutionContext, ExplanationTarget,
    OperationId, ProposalId, RelationId, SourceId, TenantId, TimestampMicros,
};
use zoen_engine::{
    AdmittedDefinitionActivation, AdmittedDefinitionPublication, AdmittedEvidence, AuthorityStore,
    CommitPreparation, EvidenceOperation, HistorySnapshot, StoreError,
};

pub(crate) const SEMANTIC_CLAIM_COLUMNS: &str =
    "claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence,
                observed_at_micros, ingested_at_micros";

mod action_store;
mod cedar;
mod claim_store;
mod effect_dispatcher;
mod effect_store;
mod evidence_store;
mod external_signal_store;
mod history_store;
mod identity_store;
mod ingress_replay_store;
mod integrity;
mod migration_store;
mod pack_registry_store;
mod pack_store;
mod restate;
mod semantic_claim_store;
mod value_store;
mod wasm_store;
mod wasmtime_adapter;
mod workload_credential_store;

pub use action_store::PostgresActionCommit;
pub use cedar::{CedarConfigError, CedarPolicyEvaluator};
pub use claim_store::{PostgresClaimLoader, PostgresClaimQuery, PostgresTypeQuery};
pub use effect_dispatcher::{
    DispatchAcceptance, DispatchScheduleCommand, DispatchScheduleError, DispatchScheduler,
    EffectDispatchOutcome, EffectDispatchResult, PostgresEffectDispatcher,
};
pub use effect_store::PostgresEffectUpdate;
pub use external_signal_store::PostgresExternalSignalStore;
pub use identity_store::{AccountSnapshot, CreateInvite, PostgresIdentityStore};
pub use ingress_replay_store::{PostgresIngressReplayStore, ZOEND_INGRESS_REPLAY_NAMESPACE};
pub use integrity::IntegrityError;
pub use pack_registry_store::{PostgresPackRegistryStore, PutObjectInput, RecordAttributionInput};
pub use pack_store::{PostgresPackStore, admit_pack};
pub use restate::{RestateEffectScheduler, restate_effect_key};
use value_store::row_to_valid_time;
pub(crate) use value_store::{row_to_value, valid_time_columns, value_columns};
pub use wasmtime_adapter::{WasmtimeComputationExecutor, WasmtimeConfigError};
pub use workload_credential_store::{
    IssueWorkloadCredential, IssuedWorkloadCredential, PostgresWorkloadCredentialStore,
};

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
    type ActionCommit = PostgresActionCommit;
    type EffectUpdate = PostgresEffectUpdate;

    async fn activate_revision(
        &self,
        activation: &AdmittedDefinitionActivation,
    ) -> Result<DefinitionActivation, StoreError> {
        let context = activation.context();
        let target = activation.target();
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        let head = sqlx::query(
            "SELECT commit_sequence
             FROM authority_heads
             WHERE tenant_id = $1
             FOR UPDATE",
        )
        .bind(context.tenant_id().as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::NotFound)?
        .try_get::<i64, _>("commit_sequence")
        .map_err(store_unavailable)?;
        let published = sqlx::query(
            "SELECT 1
             FROM definition_revisions
             WHERE tenant_id = $1
               AND definition_id = $2
               AND digest = $3
               AND revision = $4
             FOR SHARE",
        )
        .bind(context.tenant_id().as_str())
        .bind(target.definition_id.as_str())
        .bind(target.digest.as_str())
        .bind(u64_to_i64(target.revision.get(), "definition revision")?)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        if published.is_none() {
            return Err(StoreError::NotFound);
        }
        let current = sqlx::query(
            "SELECT definition_id, digest, revision
             FROM active_definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2
             FOR UPDATE",
        )
        .bind(context.tenant_id().as_str())
        .bind(target.definition_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .map(|row| row_to_reference(&row))
        .transpose()?;
        if current.as_ref() != activation.previous() {
            return Err(StoreError::StalePrecondition);
        }
        if current.as_ref().is_some_and(|current| {
            current.digest == target.digest && current.revision == target.revision
        }) {
            return Err(StoreError::StalePrecondition);
        }
        migration_store::validate_activation(&mut transaction, activation).await?;

        let next_sequence = head
            .checked_add(1)
            .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
        sqlx::query(
            "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
             VALUES ($1, $2, 'definition_activation')",
        )
        .bind(context.tenant_id().as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let previous_revision = activation
            .previous()
            .map(|previous| u64_to_i64(previous.revision.get(), "previous definition revision"))
            .transpose()?;
        let previous_digest = activation
            .previous()
            .map(|previous| previous.digest.as_str());
        let policy = activation.policy();
        sqlx::query(
            "INSERT INTO definition_activations (
                tenant_id, definition_id, revision, digest,
                previous_revision, previous_digest, commit_sequence,
                activated_at_micros, actor_id, principal_id, workload_id,
                policy_id, policy_revision, policy_digest, determining_policies,
                classification, activation_kind, migration_operation_id
             ) VALUES (
                $1, $2, $3, $4,
                $5, $6, $7,
                $8, $9, $10, $11,
                $12, $13, $14, $15,
                $16, $17, $18
             )",
        )
        .bind(context.tenant_id().as_str())
        .bind(target.definition_id.as_str())
        .bind(u64_to_i64(target.revision.get(), "definition revision")?)
        .bind(target.digest.as_str())
        .bind(previous_revision)
        .bind(previous_digest)
        .bind(next_sequence)
        .bind(activation.activated_at().get())
        .bind(context.actor_id().as_str())
        .bind(context.principal_id().as_str())
        .bind(context.workload_id().as_str())
        .bind(policy.revision.id.as_str())
        .bind(u64_to_i64(
            policy.revision.revision.get(),
            "policy revision",
        )?)
        .bind(policy.revision.digest.as_str())
        .bind(&policy.determining_policies)
        .bind(
            activation
                .classification()
                .map(zoen_core::EvolutionClassification::as_str),
        )
        .bind(activation.kind().as_str())
        .bind(activation.migration_operation_id().map(OperationId::as_str))
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        insert_activation_grants(
            &mut transaction,
            context.tenant_id(),
            next_sequence,
            context,
        )
        .await?;
        sqlx::query(
            "INSERT INTO active_definition_revisions (
                tenant_id, definition_id, revision, digest, activation_commit_sequence
             ) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (tenant_id, definition_id)
             DO UPDATE SET
                revision = EXCLUDED.revision,
                digest = EXCLUDED.digest,
                activation_commit_sequence = EXCLUDED.activation_commit_sequence",
        )
        .bind(context.tenant_id().as_str())
        .bind(target.definition_id.as_str())
        .bind(u64_to_i64(target.revision.get(), "definition revision")?)
        .bind(target.digest.as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let event = activation.projection_event();
        sqlx::query(
            "INSERT INTO projection_outbox
                (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
             VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
        )
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
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

        Ok(DefinitionActivation {
            activated_at: activation.activated_at(),
            activated_by: context.actor_id().clone(),
            active: DefinitionReference {
                definition_id: target.definition_id.clone(),
                digest: target.digest.clone(),
                revision: target.revision,
            },
            classification: activation.classification(),
            commit_sequence: CommitSequence::new(i64_to_u64(
                next_sequence,
                "activation commit sequence",
            )?)
            .ok_or_else(|| StoreError::Corrupt("zero activation commit sequence".to_owned()))?,
            kind: activation.kind(),
            migration_operation_id: activation.migration_operation_id().cloned(),
            policy: policy.clone(),
            previous: activation.previous().cloned(),
            principal_id: context.principal_id().clone(),
            workload_id: context.workload_id().clone(),
        })
    }

    async fn apply_migration_batch(
        &self,
        batch: &zoen_engine::AdmittedMigrationBatch,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::apply(self, batch).await
    }

    async fn begin_action_commit(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<CommitPreparation<Self::ActionCommit>, StoreError> {
        action_store::begin_action_commit(&self.pool, context, proposal).await
    }

    async fn get_approval(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<Option<ActionApproval>, StoreError> {
        action_store::get_approval(&self.pool, context, proposal_id).await
    }

    async fn get_active_revision(
        &self,
        tenant_id: &TenantId,
        definition_id: &DefinitionId,
    ) -> Result<Option<DefinitionRevision>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, tenant_id).await?;
        let row = sqlx::query(
            "SELECT revision.definition_id, revision.revision, revision.digest,
                    revision.canonical_json, revision.commit_sequence
             FROM active_definition_revisions AS active
             JOIN definition_revisions AS revision
               ON revision.tenant_id = active.tenant_id
              AND revision.definition_id = active.definition_id
              AND revision.digest = active.digest
              AND revision.revision = active.revision
             WHERE active.tenant_id = $1 AND active.definition_id = $2",
        )
        .bind(tenant_id.as_str())
        .bind(definition_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let revision = row.as_ref().map(row_to_revision).transpose()?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
    }

    async fn get_migration(
        &self,
        tenant_id: &TenantId,
        operation_id: &OperationId,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::get(self, tenant_id, operation_id).await
    }

    async fn get_completed_migration(
        &self,
        tenant_id: &TenantId,
        from: &DefinitionReference,
        to: &DefinitionReference,
    ) -> Result<Option<zoen_core::MigrationProgress>, StoreError> {
        migration_store::completed(self, tenant_id, from, to).await
    }

    async fn begin_effect_update(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<Self::EffectUpdate, StoreError> {
        effect_store::begin(&self.pool, context, effect_request_id).await
    }

    async fn get_effect(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<EffectSnapshot, StoreError> {
        effect_store::get(&self.pool, context, effect_request_id).await
    }

    async fn get_operation(
        &self,
        context: &ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<CommitReceipt, StoreError> {
        action_store::get_operation(&self.pool, context, operation_id).await
    }

    async fn load_history(
        &self,
        context: &ExecutionContext,
        target: &ExplanationTarget,
    ) -> Result<HistorySnapshot, StoreError> {
        history_store::load(&self.pool, context, target).await
    }

    async fn get_proposal(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<ActionProposal, StoreError> {
        action_store::get_proposal(&self.pool, context, proposal_id).await
    }

    async fn publish(
        &self,
        context: &ExecutionContext,
        publication: &AdmittedDefinitionPublication,
    ) -> Result<DefinitionRevision, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.tenant_id()).await?;
        sqlx::query(
            "INSERT INTO authority_heads (tenant_id, commit_sequence)
             VALUES ($1, 0)
             ON CONFLICT (tenant_id) DO NOTHING",
        )
        .bind(context.tenant_id().as_str())
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        let head = sqlx::query(
            "SELECT commit_sequence
             FROM authority_heads
             WHERE tenant_id = $1
             FOR UPDATE",
        )
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;

        sqlx::query(
            "INSERT INTO definition_revisions
                (tenant_id, definition_id, revision, digest, canonical_json, commit_sequence)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
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
        .bind(context.tenant_id().as_str())
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

    async fn prepare_migration(
        &self,
        migration: &zoen_engine::AdmittedMigrationPlan,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::prepare(self, migration).await
    }

    async fn preflight_migration_batch(
        &self,
        tenant_id: &TenantId,
        operation_id: &OperationId,
        batch_index: u32,
        intent_digest: &zoen_core::IntentDigest,
    ) -> Result<zoen_engine::MigrationBatchPreflight, StoreError> {
        migration_store::preflight(self, tenant_id, operation_id, batch_index, intent_digest).await
    }

    async fn get_evidence_operation(
        &self,
        context: &ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<Option<EvidenceOperation>, StoreError> {
        evidence_store::get_operation(self, context, operation_id).await
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
        operation: Option<(&OperationId, &zoen_core::IntentDigest)>,
    ) -> Result<EvidenceClaim, StoreError> {
        evidence_store::record(self, context, evidence, operation).await
    }

    async fn record_evidence_batch(
        &self,
        context: &ExecutionContext,
        evidence: &[AdmittedEvidence],
        operation: Option<(&OperationId, &zoen_core::IntentDigest)>,
    ) -> Result<Vec<EvidenceClaim>, StoreError> {
        evidence_store::record_batch(self, context, evidence, operation).await
    }

    async fn save_approval(
        &self,
        context: &ExecutionContext,
        approval: &ActionApproval,
    ) -> Result<ActionApproval, StoreError> {
        action_store::save_approval(&self.pool, context, approval).await
    }

    async fn save_proposal(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<ActionProposal, StoreError> {
        action_store::save_proposal(&self.pool, context, proposal).await
    }

    async fn revision_was_active(
        &self,
        tenant_id: &TenantId,
        revision: &DefinitionReference,
    ) -> Result<bool, StoreError> {
        migration_store::revision_was_active(self, tenant_id, revision).await
    }
}

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

async fn insert_activation_grants(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    context: &ExecutionContext,
) -> Result<(), StoreError> {
    for (ordinal, grant) in context.delegation().grants().iter().enumerate() {
        let ordinal = i32::try_from(ordinal)
            .map_err(|_| StoreError::Conflict("activation has too many grants".to_owned()))?;
        sqlx::query(
            "INSERT INTO definition_activation_grants (
                tenant_id, commit_sequence, ordinal, delegation_id,
                action_ids, resource_ids, workload_ids,
                not_before_micros, expires_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(tenant_id.as_str())
        .bind(commit_sequence)
        .bind(ordinal)
        .bind(grant.id().as_str())
        .bind(
            grant
                .actions()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .resources()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .workloads()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(grant.not_before().get())
        .bind(grant.expires_at().get())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
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

fn row_to_reference(row: &PgRow) -> Result<DefinitionReference, StoreError> {
    Ok(DefinitionReference {
        definition_id: DefinitionId::parse(row_string(row, "definition_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        digest: DefinitionDigest::parse(row_string(row, "digest")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        revision: DefinitionRevisionNumber::new(i64_to_u64(
            row_i64(row, "revision")?,
            "definition revision",
        )?)
        .ok_or_else(|| StoreError::Corrupt("zero definition revision".to_owned()))?,
    })
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

pub(crate) fn store_unavailable(error: sqlx::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
