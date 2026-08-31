use std::{
    error::Error,
    fmt::{Display, Formatter},
};

use sqlx::{
    PgPool, Postgres, Row, Transaction,
    postgres::{PgPoolOptions, PgRow},
};
use zoen_core::{
    ActionApproval, ActionProposal, CommitReceipt, CommitSequence, DefinitionActivation,
    DefinitionDigest, DefinitionId, DefinitionReference, DefinitionRevision,
    DefinitionRevisionNumber, EffectRequestId, EffectSnapshot, EvidenceClaim, EvidenceDraft,
    ExecutionContext, ExplanationTarget, OperationId, ProposalId, TenantId,
};
use zoen_engine::{
    AdmittedDefinitionActivation, AdmittedDefinitionPublication, AdmittedEvidence, AuthorityStore,
    CommitPreparation, EvidenceOperation, HistorySnapshot, StoreError,
};

use crate::{
    PostgresActionCommit, PostgresEffectUpdate, action_store, effect_store, evidence_store,
    history_store, i64_to_u64, migration_store, row_i64, row_string, row_to_revision,
    scenario_store, set_tenant, store_unavailable, u64_to_i64,
};

#[derive(Debug)]
pub enum PostgresInitError {
    Connect(sqlx::Error),
    Migrate(sqlx::migrate::MigrateError),
    Grant(sqlx::Error),
    PrivilegedProjection,
}

impl Display for PostgresInitError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "failed to connect to PostgreSQL: {error}"),
            Self::Migrate(error) => write!(formatter, "failed to migrate PostgreSQL: {error}"),
            Self::Grant(error) => {
                write!(formatter, "failed to apply zoen_projection grants: {error}")
            }
            Self::PrivilegedProjection => write!(
                formatter,
                "ZOEN_PROJECTION_DATABASE_URL can INSERT into semantic_claims"
            ),
        }
    }
}

impl Error for PostgresInitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(error) | Self::Grant(error) => Some(error),
            Self::Migrate(error) => Some(error),
            Self::PrivilegedProjection => None,
        }
    }
}

#[derive(Clone)]
pub struct PostgresAuthorityStore {
    pub(crate) pool: PgPool,
}

impl PostgresAuthorityStore {
    /// Connect and apply the adapter schema.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError`] when the pool cannot connect, migrate, or
    /// apply `zoen_projection` grants.
    pub async fn connect(database_url: &str) -> Result<Self, PostgresInitError> {
        let store = Self::connect_pool(database_url).await?;
        sqlx::migrate!("./migrations")
            .run(&store.pool)
            .await
            .map_err(PostgresInitError::Migrate)?;
        store.apply_projection_role_grants().await?;
        Ok(store)
    }

    /// Open a pool without running migrations.
    ///
    /// Use after `connect` has already applied the schema, so a
    /// least-privilege role such as `zoen_projection` can work without
    /// CREATE/ALTER rights.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Connect`] when `PostgreSQL` is unreachable.
    pub async fn connect_pool(database_url: &str) -> Result<Self, PostgresInitError> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(database_url)
            .await
            .map_err(PostgresInitError::Connect)?;
        Ok(Self { pool })
    }

    #[must_use]
    pub fn pool(&self) -> PgPool {
        self.pool.clone()
    }

    /// Re-apply `zoen_projection` table grants when that role exists.
    ///
    /// sqlx records migration `0021` once. A role created later still
    /// needs the same GRANT/REVOKE on the next `connect`.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Grant`] when the GRANT/REVOKE statements fail.
    pub async fn apply_projection_role_grants(&self) -> Result<(), PostgresInitError> {
        sqlx::query(include_str!(
            "../migrations/0021_projection_role_grants.sql"
        ))
        .execute(&self.pool)
        .await
        .map_err(PostgresInitError::Grant)?;
        Ok(())
    }

    /// Fail closed when this pool can write `semantic_claims`.
    ///
    /// Call on the worker pool after `ZOEN_PROJECTION_DATABASE_URL` is set
    /// so an empty or `zoen_app` URL cannot start the projection process.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Connect`] when privilege lookup fails, or
    /// [`PostgresInitError::PrivilegedProjection`] when this pool can INSERT.
    pub async fn require_projection_cannot_write_authority(&self) -> Result<(), PostgresInitError> {
        let can_insert: bool =
            sqlx::query_scalar("SELECT has_table_privilege('semantic_claims', 'INSERT')")
                .fetch_one(&self.pool)
                .await
                .map_err(PostgresInitError::Connect)?;
        if can_insert {
            Err(PostgresInitError::PrivilegedProjection)
        } else {
            Ok(())
        }
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
        let next_sequence = persist_activation(&mut transaction, activation).await?;
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
            policy: activation.policy().clone(),
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
        let revision = persist_publication(&mut transaction, context, publication).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
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

    async fn save_proposal_in_scenario(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
        overlay_drafts: &[EvidenceDraft],
    ) -> Result<ActionProposal, StoreError> {
        scenario_store::save_proposal_in_scenario(&self.pool, context, proposal, overlay_drafts)
            .await
    }

    async fn current_head(&self, context: &ExecutionContext) -> Result<CommitSequence, StoreError> {
        scenario_store::current_head(&self.pool, context).await
    }

    async fn insert_open_scenario(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
        base: CommitSequence,
    ) -> Result<zoen_engine::Scenario, StoreError> {
        scenario_store::insert_open_scenario(&self.pool, context, scenario_id, base).await
    }

    async fn get_scenario(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
    ) -> Result<zoen_engine::Scenario, StoreError> {
        scenario_store::get_scenario(&self.pool, context, scenario_id).await
    }

    async fn mark_scenario_discarded(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
    ) -> Result<(), StoreError> {
        scenario_store::mark_scenario_discarded(&self.pool, context, scenario_id).await
    }

    async fn commit_scenario_package(
        &self,
        context: &ExecutionContext,
        scenario: &zoen_engine::Scenario,
        plans: &[zoen_engine::ScenarioProposalPlan],
    ) -> Result<CommitSequence, StoreError> {
        scenario_store::commit_scenario_package(&self.pool, context, scenario, plans).await
    }

    async fn revision_was_active(
        &self,
        tenant_id: &TenantId,
        revision: &DefinitionReference,
    ) -> Result<bool, StoreError> {
        migration_store::revision_was_active(self, tenant_id, revision).await
    }
}

async fn persist_activation(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
) -> Result<i64, StoreError> {
    let head = lock_activation_head(transaction, activation).await?;
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    insert_commit_kind(
        transaction,
        activation.context().tenant_id(),
        next_sequence,
        "definition_activation",
    )
    .await?;
    insert_activation_row(transaction, activation, next_sequence).await?;
    insert_activation_grants(
        transaction,
        activation.context().tenant_id(),
        next_sequence,
        activation.context(),
    )
    .await?;
    project_activation(transaction, activation, next_sequence).await?;
    Ok(next_sequence)
}

async fn lock_activation_head(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
) -> Result<i64, StoreError> {
    let context = activation.context();
    let target = activation.target();
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.tenant_id().as_str())
    .fetch_optional(&mut **transaction)
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
    .fetch_optional(&mut **transaction)
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
    .fetch_optional(&mut **transaction)
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
    migration_store::validate_activation(transaction, activation).await?;
    Ok(head)
}

async fn insert_activation_row(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = activation.context();
    let target = activation.target();
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
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn project_activation(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = activation.context();
    let target = activation.target();
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
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    insert_projection_event(transaction, context.tenant_id(), next_sequence, activation).await?;
    advance_authority_head(transaction, context.tenant_id(), next_sequence).await
}

async fn persist_publication(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    publication: &AdmittedDefinitionPublication,
) -> Result<DefinitionRevision, StoreError> {
    sqlx::query(
        "INSERT INTO authority_heads (tenant_id, commit_sequence)
         VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING",
    )
    .bind(context.tenant_id().as_str())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.tenant_id().as_str())
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;
    if let Some(revision) = existing_publication(transaction, context, publication).await? {
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
    .fetch_optional(&mut **transaction)
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
    insert_published_revision(transaction, context, publication, next_sequence).await?;
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

async fn existing_publication(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    publication: &AdmittedDefinitionPublication,
) -> Result<Option<DefinitionRevision>, StoreError> {
    let existing = sqlx::query(
        "SELECT definition_id, revision, digest, canonical_json, commit_sequence
         FROM definition_revisions
         WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3",
    )
    .bind(context.tenant_id().as_str())
    .bind(publication.definition_id().as_str())
    .bind(publication.digest().as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = existing else {
        return Ok(None);
    };
    let revision = row_to_revision(&row)?;
    if revision.revision != publication.revision()
        || &revision.canonical_json != publication.canonical_json()
    {
        return Err(StoreError::Corrupt(
            "content-addressed revision has different content".to_owned(),
        ));
    }
    Ok(Some(revision))
}

async fn insert_commit_kind(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    next_sequence: i64,
    commit_kind: &str,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, $3)",
    )
    .bind(tenant_id.as_str())
    .bind(next_sequence)
    .bind(commit_kind)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_projection_event(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    next_sequence: i64,
    activation: &AdmittedDefinitionActivation,
) -> Result<(), StoreError> {
    let event = activation.projection_event();
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
    )
    .bind(tenant_id.as_str())
    .bind(next_sequence)
    .bind(event.event_type())
    .bind(i32::from(event.event_version()))
    .bind(event.payload())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_published_revision(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    publication: &AdmittedDefinitionPublication,
    next_sequence: i64,
) -> Result<(), StoreError> {
    insert_commit_kind(
        transaction,
        context.tenant_id(),
        next_sequence,
        "definition_publication",
    )
    .await?;
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
    .execute(&mut **transaction)
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
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    advance_authority_head(transaction, context.tenant_id(), next_sequence).await
}

async fn advance_authority_head(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(tenant_id.as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() == 1 {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ))
    }
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
