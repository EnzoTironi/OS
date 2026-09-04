use std::collections::BTreeSet;

use sqlx::{Postgres, Row, Transaction};
use zoen_core::{
    ClaimId, CommitSequence, DefinitionActivationKind, DefinitionReference, IntentDigest,
    MigrationLineage, MigrationObligation, MigrationProgress, MigrationRuleKind, MigrationStatus,
    OperationId, WorldId,
};
use zoen_engine::{
    AdmittedDefinitionActivation, AdmittedMigrationBatch, AdmittedMigrationPlan,
    MigrationBatchPreflight, StoreError, decode_migration_plan,
};

use crate::{
    PostgresAuthorityStore, i64_to_u64, row_to_claim,
    semantic_claim_store::{self, RevisionRequirement},
    set_tenant, store_unavailable, u64_to_i64,
};

pub(crate) async fn prepare(
    store: &PostgresAuthorityStore,
    migration: &AdmittedMigrationPlan,
) -> Result<MigrationProgress, StoreError> {
    let context = migration.context();
    let plan = migration.plan();
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let head = lock_head(&mut transaction, context.world_id()).await?;
    let existing = sqlx::query(
        "SELECT intent_digest
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(context.world_id().as_str())
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
        return get(store, context.world_id(), &plan.operation_id).await;
    }
    check_dependencies(&mut transaction, context.world_id(), plan).await?;
    let next_sequence = next_sequence(head)?;
    insert_commit(
        &mut transaction,
        context.world_id(),
        next_sequence,
        "definition_migration_plan",
    )
    .await?;
    insert_migration_plan_row(&mut transaction, migration, next_sequence).await?;
    insert_event(
        &mut transaction,
        context.world_id(),
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
    advance_head(&mut transaction, context.world_id(), next_sequence).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    get(store, context.world_id(), &plan.operation_id).await
}

pub(crate) async fn preflight(
    store: &PostgresAuthorityStore,
    world_id: &WorldId,
    operation_id: &OperationId,
    batch_index: u32,
    intent_digest: &IntentDigest,
) -> Result<MigrationBatchPreflight, StoreError> {
    let batch_index = i32::try_from(batch_index)
        .map_err(|_| StoreError::Conflict("migration batch index exceeds i32".to_owned()))?;
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, world_id).await?;
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT intent_digest
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2 AND batch_index = $3",
    )
    .bind(world_id.as_str())
    .bind(operation_id.as_str())
    .bind(batch_index)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    transaction.commit().await.map_err(store_unavailable)?;
    match existing {
        Some(existing) if existing == intent_digest.as_str() => get(store, world_id, operation_id)
            .await
            .map(Box::new)
            .map(MigrationBatchPreflight::Replayed),
        Some(_) => Ok(MigrationBatchPreflight::Mismatch),
        None => Ok(MigrationBatchPreflight::Ready),
    }
}

pub(crate) async fn apply(
    store: &PostgresAuthorityStore,
    batch: &AdmittedMigrationBatch,
) -> Result<MigrationProgress, StoreError> {
    let context = batch.context();
    let plan = &batch.migration().plan;
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let head = lock_head(&mut transaction, context.world_id()).await?;
    let existing = sqlx::query(
        "SELECT intent_digest
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2 AND batch_index = $3",
    )
    .bind(context.world_id().as_str())
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
        return get(store, context.world_id(), &plan.operation_id).await;
    }
    let stored = sqlx::query(
        "SELECT intent_digest
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2
         FOR SHARE",
    )
    .bind(context.world_id().as_str())
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
    check_dependencies(&mut transaction, context.world_id(), plan).await?;
    check_record_sources(&mut transaction, batch).await?;
    let next_sequence = next_sequence(head)?;
    insert_commit(
        &mut transaction,
        context.world_id(),
        next_sequence,
        "definition_migration_batch",
    )
    .await?;
    insert_migration_batch_row(&mut transaction, batch, next_sequence).await?;
    for (ordinal, record) in batch.records().iter().enumerate() {
        insert_record(
            &mut transaction,
            context.world_id(),
            plan,
            batch.batch_index(),
            next_sequence,
            ordinal,
            record,
        )
        .await?;
    }
    let (_, remaining) = obligations(&mut transaction, context.world_id(), plan).await?;
    if remaining.is_empty() {
        check_postconditions(&mut transaction, context.world_id(), plan).await?;
    }
    insert_event(
        &mut transaction,
        context.world_id(),
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
    advance_head(&mut transaction, context.world_id(), next_sequence).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    get(store, context.world_id(), &plan.operation_id).await
}

pub(crate) async fn get(
    store: &PostgresAuthorityStore,
    world_id: &WorldId,
    operation_id: &OperationId,
) -> Result<MigrationProgress, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, world_id).await?;
    let row = sqlx::query(
        "SELECT assessment_digest, canonical_plan, intent_digest, commit_sequence
         FROM definition_migrations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(world_id.as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    let canonical_plan = row
        .try_get::<String, _>("canonical_plan")
        .map_err(store_unavailable)?;
    let plan = decode_migration_plan(&canonical_plan).map_err(StoreError::Corrupt)?;
    let assessment_digest = row
        .try_get::<String, _>("assessment_digest")
        .map_err(store_unavailable)?;
    if assessment_digest != plan.assessment_digest.as_str() {
        return Err(StoreError::Corrupt(
            "stored migration assessment digest does not match its plan".to_owned(),
        ));
    }
    let intent_digest = IntentDigest::parse(
        row.try_get::<String, _>("intent_digest")
            .map_err(store_unavailable)?,
    )
    .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let plan_commit = row
        .try_get::<i64, _>("commit_sequence")
        .map_err(store_unavailable)?;
    let (completed_batches, latest_commit) =
        load_completed_batches(&mut transaction, world_id, operation_id, plan_commit).await?;
    let lineage = load_lineage(&mut transaction, world_id, operation_id).await?;
    let (total_obligations, remaining_obligations) =
        obligations(&mut transaction, world_id, &plan).await?;
    let status = if remaining_obligations.is_empty() {
        MigrationStatus::Completed
    } else if completed_batches.is_empty() {
        MigrationStatus::Prepared
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
        remaining_obligations,
        status,
        total_obligations,
    })
}

pub(crate) async fn completed(
    store: &PostgresAuthorityStore,
    world_id: &WorldId,
    from: &DefinitionReference,
    to: &DefinitionReference,
) -> Result<Option<MigrationProgress>, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, world_id).await?;
    let rows = sqlx::query(
        "SELECT operation_id, canonical_plan
         FROM definition_migrations
         WHERE tenant_id = $1
           AND definition_id = $2
           AND from_digest = $3
           AND from_revision = $4
           AND to_digest = $5
           AND to_revision = $6
         ORDER BY commit_sequence DESC",
    )
    .bind(world_id.as_str())
    .bind(from.definition_id.as_str())
    .bind(from.digest.as_str())
    .bind(u64_to_i64(
        from.revision.get(),
        "source definition revision",
    )?)
    .bind(to.digest.as_str())
    .bind(u64_to_i64(to.revision.get(), "target definition revision")?)
    .fetch_all(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let mut completed = None;
    for row in rows {
        let canonical_plan = row
            .try_get::<String, _>("canonical_plan")
            .map_err(store_unavailable)?;
        let plan = decode_migration_plan(&canonical_plan).map_err(StoreError::Corrupt)?;
        let (_, remaining) = obligations(&mut transaction, world_id, &plan).await?;
        if remaining.is_empty() {
            completed = Some(
                OperationId::parse(
                    row.try_get::<String, _>("operation_id")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            );
            break;
        }
    }
    transaction.commit().await.map_err(store_unavailable)?;
    match completed {
        Some(operation) => get(store, world_id, &operation).await.map(Some),
        None => Ok(None),
    }
}

pub(crate) async fn revision_was_active(
    store: &PostgresAuthorityStore,
    world_id: &WorldId,
    revision: &DefinitionReference,
) -> Result<bool, StoreError> {
    let mut transaction = store.pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, world_id).await?;
    let existed = sqlx::query_scalar::<_, bool>(
        "SELECT true
         FROM definition_activations
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4
         LIMIT 1",
    )
    .bind(world_id.as_str())
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
            .bind(activation.context().world_id().as_str())
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
                let canonical_plan = sqlx::query_scalar::<_, String>(
                    "SELECT canonical_plan
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
                .bind(activation.context().world_id().as_str())
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
                let plan = decode_migration_plan(&canonical_plan).map_err(StoreError::Corrupt)?;
                check_dependencies(transaction, activation.context().world_id(), &plan).await?;
                let (_, remaining) =
                    obligations(transaction, activation.context().world_id(), &plan).await?;
                if !remaining.is_empty() {
                    return Err(StoreError::StalePrecondition);
                }
                check_postconditions(transaction, activation.context().world_id(), &plan).await?;
            }
        }
    }
    Ok(())
}

async fn insert_migration_plan_row(
    transaction: &mut Transaction<'_, Postgres>,
    migration: &AdmittedMigrationPlan,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = migration.context();
    let plan = migration.plan();
    let policy = migration.policy();
    sqlx::query(
        "INSERT INTO definition_migrations (
            tenant_id, operation_id, intent_digest, canonical_plan,
            definition_id, from_revision, from_digest, to_revision, to_digest,
            assessment_digest, classification, commit_sequence, prepared_at_micros,
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
    .bind(context.world_id().as_str())
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
    .bind(plan.assessment_digest.as_str())
    .bind(plan.classification.as_str())
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
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_migration_batch_row(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &AdmittedMigrationBatch,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = batch.context();
    let plan = &batch.migration().plan;
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
    .bind(context.world_id().as_str())
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
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn load_completed_batches(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    operation_id: &OperationId,
    plan_commit: i64,
) -> Result<(Vec<u32>, i64), StoreError> {
    let batch_rows = sqlx::query(
        "SELECT batch_index, commit_sequence
         FROM definition_migration_batches
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY batch_index",
    )
    .bind(world_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut **transaction)
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
    Ok((completed_batches, latest_commit))
}

async fn load_lineage(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    operation_id: &OperationId,
) -> Result<Vec<MigrationLineage>, StoreError> {
    let record_rows = sqlx::query(
        "SELECT target_claim_id, rule_id, rule_kind
         FROM definition_migration_records
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY target_claim_id",
    )
    .bind(world_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut **transaction)
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
        .bind(world_id.as_str())
        .bind(operation_id.as_str())
        .bind(&target_claim_id)
        .fetch_all(&mut **transaction)
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
    Ok(lineage)
}

async fn check_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
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
        .bind(world_id.as_str())
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
        let mut source_claims = Vec::with_capacity(record.source_claim_ids().len());
        for source_claim_id in record.source_claim_ids() {
            let row = sqlx::query(
                "SELECT claim_id, definition_id, definition_digest, definition_revision,
                        entity_id, relation_id, value_kind, value_text, value_unit,
                        valid_time_kind, valid_from_micros, valid_to_micros,
                        source_id, source_digest, source_ref, commit_sequence,
                        observed_at_micros, ingested_at_micros
                 FROM semantic_claims
                 WHERE tenant_id = $1 AND claim_id = $2
                 FOR SHARE",
            )
            .bind(batch.context().world_id().as_str())
            .bind(source_claim_id.as_str())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(store_unavailable)?
            .ok_or(StoreError::NotFound)?;
            let claim = row_to_claim(&row)?;
            if claim.draft.definition != plan.from
                || !source_relations.contains(&claim.draft.relation_id.as_str())
                || claim.draft.entity_id != record.evidence().draft().entity_id
            {
                return Err(StoreError::OperationMismatch);
            }
            source_claims.push(claim);
        }
        if rule.kind == MigrationRuleKind::PreserveMeaning {
            let source = source_claims.first().ok_or_else(|| {
                StoreError::Corrupt("preserve rule has no source claim".to_owned())
            })?;
            let target = record.evidence().draft();
            if source.draft.entity_id != target.entity_id
                || source.draft.value != target.value
                || source.draft.valid_time != target.valid_time
            {
                return Err(StoreError::OperationMismatch);
            }
        }
    }
    Ok(())
}

async fn insert_record(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    plan: &zoen_core::MigrationPlan,
    batch_index: u32,
    commit_sequence: i64,
    ordinal: usize,
    record: &zoen_engine::AdmittedMigrationRecord,
) -> Result<(), StoreError> {
    let draft = record.evidence().draft();
    semantic_claim_store::insert(
        transaction,
        world_id,
        commit_sequence,
        record.evidence(),
        RevisionRequirement::Published,
    )
    .await?;
    sqlx::query(
        "INSERT INTO definition_migration_records (
            tenant_id, operation_id, batch_index, target_claim_id, rule_id, rule_kind
         ) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(world_id.as_str())
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
        .bind(world_id.as_str())
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
        world_id,
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
    world_id: &WorldId,
    plan: &zoen_core::MigrationPlan,
) -> Result<(), StoreError> {
    for postcondition in &plan.postconditions {
        let count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*)
             FROM definition_migration_records AS record
             JOIN semantic_claims AS claim
               ON claim.tenant_id = record.tenant_id
              AND claim.claim_id = record.target_claim_id
             WHERE record.tenant_id = $1
               AND record.operation_id = $2
               AND claim.definition_id = $3
               AND claim.definition_digest = $4
               AND claim.definition_revision = $5
               AND claim.relation_id = $6",
        )
        .bind(world_id.as_str())
        .bind(plan.operation_id.as_str())
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
    world_id: &WorldId,
) -> Result<i64, StoreError> {
    sqlx::query_scalar::<_, i64>(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(world_id.as_str())
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
    world_id: &WorldId,
    commit_sequence: i64,
    kind: &str,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, $3)",
    )
    .bind(world_id.as_str())
    .bind(commit_sequence)
    .bind(kind)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_event(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
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
    .bind(world_id.as_str())
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
    world_id: &WorldId,
    commit_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(world_id.as_str())
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

async fn obligations(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    plan: &zoen_core::MigrationPlan,
) -> Result<(u64, Vec<MigrationObligation>), StoreError> {
    let mut total = 0_u64;
    let mut remaining = Vec::new();
    for source in &plan.obligation_sources {
        let source_claim_ids = sqlx::query_scalar::<_, String>(
            "SELECT claim_id
             FROM semantic_claims
             WHERE tenant_id = $1
               AND definition_id = $2
               AND definition_digest = $3
               AND definition_revision = $4
               AND relation_id = $5
             ORDER BY claim_id
             FOR SHARE",
        )
        .bind(world_id.as_str())
        .bind(plan.from.definition_id.as_str())
        .bind(plan.from.digest.as_str())
        .bind(u64_to_i64(
            plan.from.revision.get(),
            "source definition revision",
        )?)
        .bind(source.relation_id.as_str())
        .fetch_all(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
        total = total
            .checked_add(u64::try_from(source_claim_ids.len()).map_err(|_| {
                StoreError::Corrupt("migration obligation count exceeds u64".to_owned())
            })?)
            .ok_or_else(|| StoreError::Corrupt("migration obligation count overflow".to_owned()))?;
        if source.kind == MigrationRuleKind::Supersede || source_claim_ids.is_empty() {
            continue;
        }
        let resolved = sqlx::query_scalar::<_, String>(
            "SELECT lineage.source_claim_id
             FROM definition_migration_lineage AS lineage
             JOIN definition_migration_records AS record
               ON record.tenant_id = lineage.tenant_id
              AND record.operation_id = lineage.operation_id
              AND record.target_claim_id = lineage.target_claim_id
             WHERE lineage.tenant_id = $1
               AND lineage.operation_id = $2
               AND record.rule_id = $3
               AND lineage.source_claim_id = ANY($4::text[])",
        )
        .bind(world_id.as_str())
        .bind(plan.operation_id.as_str())
        .bind(source.rule_id.as_str())
        .bind(&source_claim_ids)
        .fetch_all(&mut **transaction)
        .await
        .map_err(store_unavailable)?
        .into_iter()
        .collect::<BTreeSet<_>>();
        for source_claim_id in source_claim_ids {
            if resolved.contains(&source_claim_id) {
                continue;
            }
            remaining.push(MigrationObligation {
                kind: source.kind,
                relation_id: source.relation_id.clone(),
                rule_id: source.rule_id.clone(),
                source_claim_id: ClaimId::parse(source_claim_id)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            });
        }
    }
    Ok((total, remaining))
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
