use sqlx::{Postgres, Row, Transaction};
use zoen_core::{
    ClaimId, CommitSequence, DefinitionActivationKind, DefinitionDigest, DefinitionReference,
    EntityId, EvolutionClassification, IntentDigest, MigrationLineage, MigrationProgress,
    MigrationRuleKind, MigrationStatus, OperationId, RelationId, TenantId,
};
use zoen_engine::{
    AdmittedDefinitionActivation, AdmittedMigrationBatch, AdmittedMigrationPlan, StoreError,
    decode_migration_plan,
};

use crate::{
    PostgresAuthorityStore, i64_to_u64, set_tenant, store_unavailable, u64_to_i64,
    valid_time_columns, value_columns,
};

pub(crate) async fn prepare(
    store: &PostgresAuthorityStore,
    migration: &AdmittedMigrationPlan,
) -> Result<MigrationProgress, StoreError> {
    let context = migration.context();
    let plan = migration.plan();
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let head = lock_head(&mut transaction, context.tenant_id()).await?;
    let existing = sqlx::query(
        "SELECT intent_digest
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(plan.operation_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if let Some(row) = existing {
        let intent_digest = row
            .try_get::<String, _>("intent_digest")
            .map_err(store_unavailable)?;
        if intent_digest != migration.intent_digest().as_str() {
            return Err(StoreError::OperationMismatch);
        }
        transaction.commit().await.map_err(store_unavailable)?;
        return get(store, context.tenant_id(), &plan.operation_id).await;
    }
    check_dependencies(&mut transaction, context.tenant_id(), plan).await?;
    let next_sequence = next_sequence(head)?;
    insert_commit(
        &mut transaction,
        context.tenant_id(),
        next_sequence,
        "definition_migration_plan",
    )
    .await?;
    let policy = migration.policy();
    sqlx::query(
        "INSERT INTO definition_migrations (
            tenant_id, operation_id, intent_digest, canonical_plan,
            definition_id, from_revision, from_digest, to_revision, to_digest,
            classification, expected_batches, commit_sequence, prepared_at_micros,
            actor_id, principal_id, workload_id,
            policy_id, policy_revision, policy_digest, determining_policies
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16,
            $17, $18, $19, $20
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(plan.operation_id.as_str())
    .bind(migration.intent_digest().as_str())
    .bind(migration.canonical_plan())
    .bind(plan.from.definition_id.as_str())
    .bind(u64_to_i64(
        plan.from.revision.get(),
        "source definition revision",
    )?)
    .bind(plan.from.digest.as_str())
    .bind(u64_to_i64(
        plan.to.revision.get(),
        "target definition revision",
    )?)
    .bind(plan.to.digest.as_str())
    .bind(plan.classification.as_str())
    .bind(i32::try_from(plan.expected_batches).map_err(|_| {
        StoreError::Conflict("expected migration batch count exceeds i32".to_owned())
    })?)
    .bind(next_sequence)
    .bind(migration.prepared_at().get())
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
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    insert_event(
        &mut transaction,
        context.tenant_id(),
        next_sequence,
        0,
        "DefinitionMigrationPrepared",
        &format!(
            r#"{{"definitionId":"{}","fromDigest":"{}","operationId":"{}","toDigest":"{}","toRevision":{}}}"#,
            plan.to.definition_id.as_str(),
            plan.from.digest.as_str(),
            plan.operation_id.as_str(),
            plan.to.digest.as_str(),
            plan.to.revision.get()
        ),
    )
    .await?;
    advance_head(&mut transaction, context.tenant_id(), next_sequence).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    get(store, context.tenant_id(), &plan.operation_id).await
}

pub(crate) async fn apply(
    store: &PostgresAuthorityStore,
    batch: &AdmittedMigrationBatch,
) -> Result<MigrationProgress, StoreError> {
    let context = batch.context();
    let plan = &batch.migration().plan;
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let head = lock_head(&mut transaction, context.tenant_id()).await?;
    let existing = sqlx::query(
        "SELECT intent_digest
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2 AND batch_index = $3",
    )
    .bind(context.tenant_id().as_str())
    .bind(plan.operation_id.as_str())
    .bind(
        i32::try_from(batch.batch_index())
            .map_err(|_| StoreError::Conflict("migration batch index exceeds i32".to_owned()))?,
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if let Some(row) = existing {
        let intent_digest = row
            .try_get::<String, _>("intent_digest")
            .map_err(store_unavailable)?;
        if intent_digest != batch.intent_digest().as_str() {
            return Err(StoreError::OperationMismatch);
        }
        transaction.commit().await.map_err(store_unavailable)?;
        return get(store, context.tenant_id(), &plan.operation_id).await;
    }
    let stored = sqlx::query(
        "SELECT intent_digest
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2
         FOR SHARE",
    )
    .bind(context.tenant_id().as_str())
    .bind(plan.operation_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    let stored_intent = stored
        .try_get::<String, _>("intent_digest")
        .map_err(store_unavailable)?;
    if stored_intent != batch.migration().intent_digest.as_str() {
        return Err(StoreError::OperationMismatch);
    }
    check_dependencies(&mut transaction, context.tenant_id(), plan).await?;
    check_record_sources(&mut transaction, batch).await?;
    let next_sequence = next_sequence(head)?;
    insert_commit(
        &mut transaction,
        context.tenant_id(),
        next_sequence,
        "definition_migration_batch",
    )
    .await?;
    let policy = batch.policy();
    sqlx::query(
        "INSERT INTO definition_migration_batches (
            tenant_id, operation_id, batch_index, intent_digest,
            commit_sequence, record_count,
            actor_id, principal_id, workload_id,
            policy_id, policy_revision, policy_digest, determining_policies
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(plan.operation_id.as_str())
    .bind(
        i32::try_from(batch.batch_index())
            .map_err(|_| StoreError::Conflict("migration batch index exceeds i32".to_owned()))?,
    )
    .bind(batch.intent_digest().as_str())
    .bind(next_sequence)
    .bind(
        i32::try_from(batch.records().len()).map_err(|_| {
            StoreError::Conflict("migration batch record count exceeds i32".to_owned())
        })?,
    )
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
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    for (ordinal, record) in batch.records().iter().enumerate() {
        insert_record(
            &mut transaction,
            context.tenant_id(),
            plan,
            batch.batch_index(),
            next_sequence,
            ordinal,
            record,
        )
        .await?;
    }
    let completed =
        completed_batch_count(&mut transaction, context.tenant_id(), &plan.operation_id).await?;
    if completed == u64::from(plan.expected_batches) {
        check_postconditions(&mut transaction, context.tenant_id(), plan).await?;
    }
    insert_event(
        &mut transaction,
        context.tenant_id(),
        next_sequence,
        i32::try_from(batch.records().len()).map_err(|_| {
            StoreError::Conflict("migration batch event ordinal exceeds i32".to_owned())
        })?,
        "DefinitionMigrationBatchApplied",
        &format!(
            r#"{{"batchIndex":{},"definitionId":"{}","operationId":"{}","toDigest":"{}","toRevision":{}}}"#,
            batch.batch_index(),
            plan.to.definition_id.as_str(),
            plan.operation_id.as_str(),
            plan.to.digest.as_str(),
            plan.to.revision.get()
        ),
    )
    .await?;
    advance_head(&mut transaction, context.tenant_id(), next_sequence).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    get(store, context.tenant_id(), &plan.operation_id).await
}

pub(crate) async fn get(
    store: &PostgresAuthorityStore,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<MigrationProgress, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, tenant_id).await?;
    let row = sqlx::query(
        "SELECT canonical_plan, intent_digest, commit_sequence, expected_batches
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    let canonical_plan = row
        .try_get::<String, _>("canonical_plan")
        .map_err(store_unavailable)?;
    let plan = decode_migration_plan(&canonical_plan).map_err(StoreError::Corrupt)?;
    let intent_digest = IntentDigest::parse(
        row.try_get::<String, _>("intent_digest")
            .map_err(store_unavailable)?,
    )
    .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let plan_commit = row
        .try_get::<i64, _>("commit_sequence")
        .map_err(store_unavailable)?;
    let expected_batches = row
        .try_get::<i32, _>("expected_batches")
        .map_err(store_unavailable)?;
    let batch_rows = sqlx::query(
        "SELECT batch_index, commit_sequence
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY batch_index",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let mut completed_batches = Vec::with_capacity(batch_rows.len());
    let mut latest_commit = plan_commit;
    for batch in batch_rows {
        let batch_index = batch
            .try_get::<i32, _>("batch_index")
            .map_err(store_unavailable)?;
        completed_batches.push(
            u32::try_from(batch_index)
                .map_err(|_| StoreError::Corrupt("negative migration batch index".to_owned()))?,
        );
        latest_commit = latest_commit.max(
            batch
                .try_get::<i64, _>("commit_sequence")
                .map_err(store_unavailable)?,
        );
    }
    let record_rows = sqlx::query(
        "SELECT target_claim_id, rule_id, rule_kind
         FROM definition_migration_records
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY target_claim_id",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let mut lineage = Vec::with_capacity(record_rows.len());
    for record in record_rows {
        let target_claim_id = record
            .try_get::<String, _>("target_claim_id")
            .map_err(store_unavailable)?;
        let source_rows = sqlx::query_scalar::<_, String>(
            "SELECT source_claim_id
             FROM definition_migration_lineage
             WHERE tenant_id = $1 AND operation_id = $2 AND target_claim_id = $3
             ORDER BY source_claim_id",
        )
        .bind(tenant_id.as_str())
        .bind(operation_id.as_str())
        .bind(&target_claim_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        lineage.push(MigrationLineage {
            kind: parse_rule_kind(
                &record
                    .try_get::<String, _>("rule_kind")
                    .map_err(store_unavailable)?,
            )?,
            rule_id: zoen_core::MigrationRuleId::parse(
                record
                    .try_get::<String, _>("rule_id")
                    .map_err(store_unavailable)?,
            )
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            source_claim_ids: source_rows
                .into_iter()
                .map(ClaimId::parse)
                .collect::<Result<_, _>>()
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            target_claim_id: ClaimId::parse(target_claim_id)
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        });
    }
    let status = if completed_batches.is_empty() {
        MigrationStatus::Prepared
    } else if i32::try_from(completed_batches.len()).ok() == Some(expected_batches) {
        MigrationStatus::Completed
    } else {
        MigrationStatus::InProgress
    };
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(MigrationProgress {
        commit_sequence: CommitSequence::new(i64_to_u64(
            latest_commit,
            "migration commit sequence",
        )?)
        .ok_or_else(|| StoreError::Corrupt("zero migration commit sequence".to_owned()))?,
        completed_batches,
        intent_digest,
        lineage,
        plan,
        status,
    })
}

pub(crate) async fn completed(
    store: &PostgresAuthorityStore,
    tenant_id: &TenantId,
    from: &DefinitionReference,
    to: &DefinitionReference,
) -> Result<Option<MigrationProgress>, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, tenant_id).await?;
    let operation = sqlx::query_scalar::<_, String>(
        "SELECT migration.operation_id
         FROM definition_migrations AS migration
         WHERE migration.tenant_id = $1
           AND migration.definition_id = $2
           AND migration.from_digest = $3
           AND migration.from_revision = $4
           AND migration.to_digest = $5
           AND migration.to_revision = $6
           AND (
             SELECT count(*)
             FROM definition_migration_batches AS batch
             WHERE batch.tenant_id = migration.tenant_id
               AND batch.operation_id = migration.operation_id
           ) = migration.expected_batches
         ORDER BY migration.commit_sequence DESC
         LIMIT 1",
    )
    .bind(tenant_id.as_str())
    .bind(from.definition_id.as_str())
    .bind(from.digest.as_str())
    .bind(u64_to_i64(
        from.revision.get(),
        "source definition revision",
    )?)
    .bind(to.digest.as_str())
    .bind(u64_to_i64(to.revision.get(), "target definition revision")?)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    transaction.commit().await.map_err(store_unavailable)?;
    match operation {
        Some(operation) => {
            let operation = OperationId::parse(operation)
                .map_err(|error| StoreError::Corrupt(error.to_string()))?;
            get(store, tenant_id, &operation).await.map(Some)
        }
        None => Ok(None),
    }
}

pub(crate) async fn revision_was_active(
    store: &PostgresAuthorityStore,
    tenant_id: &TenantId,
    revision: &DefinitionReference,
) -> Result<bool, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, tenant_id).await?;
    let existed = sqlx::query_scalar::<_, bool>(
        "SELECT true
         FROM definition_activations
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4
         LIMIT 1",
    )
    .bind(tenant_id.as_str())
    .bind(revision.definition_id.as_str())
    .bind(revision.digest.as_str())
    .bind(u64_to_i64(revision.revision.get(), "definition revision")?)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .is_some();
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(existed)
}

pub(crate) async fn validate_activation(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
) -> Result<(), StoreError> {
    match activation.kind() {
        DefinitionActivationKind::Rollback => {
            let existed = sqlx::query_scalar::<_, bool>(
                "SELECT true
                 FROM definition_activations
                 WHERE tenant_id = $1
                   AND definition_id = $2
                   AND digest = $3
                   AND revision = $4
                 LIMIT 1",
            )
            .bind(activation.context().tenant_id().as_str())
            .bind(activation.target().definition_id.as_str())
            .bind(activation.target().digest.as_str())
            .bind(u64_to_i64(
                activation.target().revision.get(),
                "definition revision",
            )?)
            .fetch_optional(&mut **transaction)
            .await
            .map_err(store_unavailable)?;
            if existed.is_none() {
                return Err(StoreError::StalePrecondition);
            }
        }
        DefinitionActivationKind::Activation => {
            if let Some(operation_id) = activation.migration_operation_id() {
                let previous = activation.previous().ok_or(StoreError::StalePrecondition)?;
                let migration = sqlx::query(
                    "SELECT expected_batches, canonical_plan
                     FROM definition_migrations
                     WHERE tenant_id = $1
                       AND operation_id = $2
                       AND definition_id = $3
                       AND from_digest = $4
                       AND from_revision = $5
                       AND to_digest = $6
                       AND to_revision = $7
                     FOR SHARE",
                )
                .bind(activation.context().tenant_id().as_str())
                .bind(operation_id.as_str())
                .bind(activation.target().definition_id.as_str())
                .bind(previous.digest.as_str())
                .bind(u64_to_i64(
                    previous.revision.get(),
                    "source definition revision",
                )?)
                .bind(activation.target().digest.as_str())
                .bind(u64_to_i64(
                    activation.target().revision.get(),
                    "target definition revision",
                )?)
                .fetch_optional(&mut **transaction)
                .await
                .map_err(store_unavailable)?
                .ok_or(StoreError::StalePrecondition)?;
                let expected = migration
                    .try_get::<i32, _>("expected_batches")
                    .map_err(store_unavailable)?;
                let completed = completed_batch_count(
                    transaction,
                    activation.context().tenant_id(),
                    operation_id,
                )
                .await?;
                if i32::try_from(completed).ok() != Some(expected) {
                    return Err(StoreError::StalePrecondition);
                }
                let canonical_plan = migration
                    .try_get::<String, _>("canonical_plan")
                    .map_err(store_unavailable)?;
                let plan = decode_migration_plan(&canonical_plan).map_err(StoreError::Corrupt)?;
                check_dependencies(transaction, activation.context().tenant_id(), &plan).await?;
            }
        }
    }
    Ok(())
}

async fn check_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    plan: &zoen_core::MigrationPlan,
) -> Result<(), StoreError> {
    for dependency in &plan.dependencies {
        let row = sqlx::query(
            "SELECT claim_id, commit_sequence
             FROM semantic_claims
             WHERE tenant_id = $1
               AND definition_id = $2
               AND definition_digest = $3
               AND entity_id = $4
               AND relation_id = $5
             ORDER BY commit_sequence DESC, claim_id DESC
             LIMIT 1
             FOR SHARE",
        )
        .bind(tenant_id.as_str())
        .bind(plan.from.definition_id.as_str())
        .bind(plan.from.digest.as_str())
        .bind(dependency.entity_id.as_str())
        .bind(dependency.relation_id.as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::StalePrecondition)?;
        let claim_id = row
            .try_get::<String, _>("claim_id")
            .map_err(store_unavailable)?;
        let commit_sequence = row
            .try_get::<i64, _>("commit_sequence")
            .map_err(store_unavailable)?;
        if claim_id != dependency.claim_id.as_str()
            || i64_to_u64(commit_sequence, "dependency commit sequence")?
                != dependency.commit_sequence.get()
        {
            return Err(StoreError::StalePrecondition);
        }
    }
    Ok(())
}

async fn check_record_sources(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &AdmittedMigrationBatch,
) -> Result<(), StoreError> {
    let plan = &batch.migration().plan;
    for record in batch.records() {
        let rule = plan
            .rules
            .iter()
            .find(|rule| rule.id == *record.rule_id())
            .ok_or_else(|| StoreError::Corrupt("migration rule disappeared".to_owned()))?;
        let source_relations = rule
            .sources
            .iter()
            .filter(|source| source.element == zoen_core::DefinitionElementKind::Relation)
            .map(|source| source.id.as_str())
            .collect::<Vec<_>>();
        for source_claim_id in record.source_claim_ids() {
            let row = sqlx::query(
                "SELECT definition_digest, relation_id
                 FROM semantic_claims
                 WHERE tenant_id = $1 AND claim_id = $2
                 FOR SHARE",
            )
            .bind(batch.context().tenant_id().as_str())
            .bind(source_claim_id.as_str())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(store_unavailable)?
            .ok_or(StoreError::NotFound)?;
            let definition_digest = row
                .try_get::<String, _>("definition_digest")
                .map_err(store_unavailable)?;
            let relation_id = row
                .try_get::<String, _>("relation_id")
                .map_err(store_unavailable)?;
            if definition_digest != plan.from.digest.as_str()
                || !source_relations.contains(&relation_id.as_str())
            {
                return Err(StoreError::OperationMismatch);
            }
        }
    }
    Ok(())
}

async fn insert_record(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    plan: &zoen_core::MigrationPlan,
    batch_index: u32,
    commit_sequence: i64,
    ordinal: usize,
    record: &zoen_engine::AdmittedMigrationRecord,
) -> Result<(), StoreError> {
    let draft = record.evidence().draft();
    let collision = sqlx::query_scalar::<_, bool>(
        "SELECT true FROM semantic_claims WHERE tenant_id = $1 AND claim_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(draft.claim_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if collision.is_some() {
        return Err(StoreError::Conflict(
            "migration target claim ID already exists".to_owned(),
        ));
    }
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
    .bind(tenant_id.as_str())
    .bind(draft.claim_id.as_str())
    .bind(plan.to.definition_id.as_str())
    .bind(plan.to.digest.as_str())
    .bind(u64_to_i64(
        plan.to.revision.get(),
        "target definition revision",
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
    .bind(commit_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    sqlx::query(
        "INSERT INTO definition_migration_records (
            tenant_id, operation_id, batch_index, target_claim_id, rule_id, rule_kind
         ) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(tenant_id.as_str())
    .bind(plan.operation_id.as_str())
    .bind(
        i32::try_from(batch_index)
            .map_err(|_| StoreError::Conflict("migration batch index exceeds i32".to_owned()))?,
    )
    .bind(draft.claim_id.as_str())
    .bind(record.rule_id().as_str())
    .bind(record.kind().as_str())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    for source_claim_id in record.source_claim_ids() {
        sqlx::query(
            "INSERT INTO definition_migration_lineage (
                tenant_id, operation_id, target_claim_id, source_claim_id
             ) VALUES ($1, $2, $3, $4)",
        )
        .bind(tenant_id.as_str())
        .bind(plan.operation_id.as_str())
        .bind(draft.claim_id.as_str())
        .bind(source_claim_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    let event = record.evidence().projection_event();
    insert_event(
        transaction,
        tenant_id,
        commit_sequence,
        i32::try_from(ordinal)
            .map_err(|_| StoreError::Conflict("migration record ordinal exceeds i32".to_owned()))?,
        event.event_type(),
        event.payload(),
    )
    .await
}

async fn check_postconditions(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    plan: &zoen_core::MigrationPlan,
) -> Result<(), StoreError> {
    for postcondition in &plan.postconditions {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*)
             FROM semantic_claims
             WHERE tenant_id = $1
               AND definition_id = $2
               AND definition_digest = $3
               AND definition_revision = $4
               AND relation_id = $5",
        )
        .bind(tenant_id.as_str())
        .bind(plan.to.definition_id.as_str())
        .bind(plan.to.digest.as_str())
        .bind(u64_to_i64(
            plan.to.revision.get(),
            "target definition revision",
        )?)
        .bind(postcondition.relation_id.as_str())
        .fetch_one(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
        if i64_to_u64(count, "postcondition record count")? < postcondition.minimum_record_count {
            return Err(StoreError::StalePrecondition);
        }
    }
    Ok(())
}

async fn lock_head(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
) -> Result<i64, StoreError> {
    sqlx::query_scalar::<_, i64>(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(tenant_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)
}

fn next_sequence(head: i64) -> Result<i64, StoreError> {
    head.checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))
}

async fn insert_commit(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    kind: &str,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, $3)",
    )
    .bind(tenant_id.as_str())
    .bind(commit_sequence)
    .bind(kind)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_event(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    ordinal: i32,
    event_type: &str,
    payload: &str,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, $3, $4, 1, $5::jsonb)",
    )
    .bind(tenant_id.as_str())
    .bind(commit_sequence)
    .bind(ordinal)
    .bind(event_type)
    .bind(payload)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn advance_head(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(tenant_id.as_str())
    .bind(commit_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() != 1 {
        return Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ));
    }
    Ok(())
}

async fn completed_batch_count(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<u64, StoreError> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT count(*)
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    i64_to_u64(count, "completed migration batch count")
}

fn parse_rule_kind(value: &str) -> Result<MigrationRuleKind, StoreError> {
    match value {
        "preserve_meaning" => Ok(MigrationRuleKind::PreserveMeaning),
        "recompute" => Ok(MigrationRuleKind::Recompute),
        "supersede" => Ok(MigrationRuleKind::Supersede),
        "transform" => Ok(MigrationRuleKind::Transform),
        _ => Err(StoreError::Corrupt(format!(
            "unknown migration rule kind: {value}"
        ))),
    }
}
