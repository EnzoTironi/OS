use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionProposal, CommitSequence, EvidenceDraft, ExecutionContext, ProposalId, ScenarioId,
    WorldId,
};
use zoen_engine::{
    Scenario, ScenarioProposalPlan, ScenarioStatus, StoreError, state_basis_digest_matches,
};

use crate::{
    action_store::{
        commit_sequence as parse_commit_sequence,
        state_basis::load_current,
        writes::{
            OperationInsertError, insert_effect_request, insert_operation,
            insert_operation_records, insert_semantic_record,
        },
        {self},
    },
    set_tenant, store_unavailable, u64_to_i64, valid_time_columns, value_columns,
};

pub(crate) async fn current_head(
    pool: &PgPool,
    context: &ExecutionContext,
) -> Result<CommitSequence, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let head = sqlx::query_scalar::<_, i64>(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1",
    )
    .bind(context.world_id().as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .unwrap_or(0);
    transaction.commit().await.map_err(store_unavailable)?;
    if head <= 0 {
        return Err(StoreError::NotFound);
    }
    parse_commit_sequence(head, "authority head")
}

pub(crate) async fn insert_open_scenario(
    pool: &PgPool,
    context: &ExecutionContext,
    scenario_id: &ScenarioId,
    base: CommitSequence,
) -> Result<Scenario, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let result = sqlx::query(
        "INSERT INTO world_scenarios (
            tenant_id, scenario_id, base_commit_sequence, status, created_principal_id
         ) VALUES ($1, $2, $3, 'open', $4)
         ON CONFLICT (tenant_id, scenario_id) DO NOTHING",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .bind(u64_to_i64(base.get(), "base commit sequence")?)
    .bind(context.principal_id().as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if result.rows_affected() != 1 {
        transaction.commit().await.map_err(store_unavailable)?;
        let existing = get_scenario(pool, context, scenario_id).await?;
        if existing.status == ScenarioStatus::Open {
            return Ok(existing);
        }
        return Err(StoreError::Conflict(
            "scenario id already exists".to_owned(),
        ));
    }
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(Scenario {
        id: scenario_id.clone(),
        base_commit_sequence: base,
        status: ScenarioStatus::Open,
        created_principal_id: context.principal_id().as_str().to_owned(),
        proposal_ids: Vec::new(),
        applied_commit_sequence: None,
    })
}

pub(crate) async fn get_scenario(
    pool: &PgPool,
    context: &ExecutionContext,
    scenario_id: &ScenarioId,
) -> Result<Scenario, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let row = sqlx::query(
        "SELECT scenario_id, base_commit_sequence, status, created_principal_id,
                applied_commit_sequence
         FROM world_scenarios
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    let proposal_ids = sqlx::query(
        "SELECT proposal_id
         FROM world_scenario_proposals
         WHERE tenant_id = $1 AND scenario_id = $2
         ORDER BY ordinal",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_all(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    transaction.commit().await.map_err(store_unavailable)?;
    let status = match row
        .try_get::<String, _>("status")
        .map_err(store_unavailable)?
        .as_str()
    {
        "open" => ScenarioStatus::Open,
        "applied" => ScenarioStatus::Applied,
        "discarded" => ScenarioStatus::Discarded,
        other => {
            return Err(StoreError::Corrupt(format!(
                "unknown scenario status: {other}"
            )));
        }
    };
    let applied = row
        .try_get::<Option<i64>, _>("applied_commit_sequence")
        .map_err(store_unavailable)?;
    Ok(Scenario {
        id: ScenarioId::parse(
            row.try_get::<String, _>("scenario_id")
                .map_err(store_unavailable)?,
        )
        .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        base_commit_sequence: parse_commit_sequence(
            row.try_get::<i64, _>("base_commit_sequence")
                .map_err(store_unavailable)?,
            "base commit sequence",
        )?,
        status,
        created_principal_id: row
            .try_get::<String, _>("created_principal_id")
            .map_err(store_unavailable)?,
        proposal_ids: proposal_ids
            .into_iter()
            .map(|row| {
                ProposalId::parse(
                    row.try_get::<String, _>("proposal_id")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))
            })
            .collect::<Result<Vec<_>, _>>()?,
        applied_commit_sequence: applied
            .map(|value| parse_commit_sequence(value, "applied commit sequence"))
            .transpose()?,
    })
}

pub(crate) async fn save_proposal_in_scenario(
    pool: &PgPool,
    context: &ExecutionContext,
    proposal: &ActionProposal,
    overlay_drafts: &[EvidenceDraft],
) -> Result<ActionProposal, StoreError> {
    let scenario_id = proposal
        .scenario_id
        .as_ref()
        .ok_or_else(|| StoreError::Corrupt("scenario proposal missing scenario_id".to_owned()))?;
    let mut guard = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut guard, context.world_id()).await?;
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status
         FROM world_scenarios
         WHERE tenant_id = $1 AND scenario_id = $2
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_optional(&mut *guard)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    if status != "open" {
        return Err(StoreError::Conflict("scenario is not open".to_owned()));
    }
    guard.commit().await.map_err(store_unavailable)?;

    let saved = action_store::save_proposal(pool, context, proposal).await?;

    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status
         FROM world_scenarios
         WHERE tenant_id = $1 AND scenario_id = $2
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    if status != "open" {
        return Err(StoreError::Conflict("scenario is not open".to_owned()));
    }
    let ordinal = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(MAX(ordinal) + 1, 0)
         FROM world_scenario_proposals
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    sqlx::query(
        "INSERT INTO world_scenario_proposals (
            tenant_id, scenario_id, ordinal, proposal_id
         ) VALUES ($1, $2, $3, $4)",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .bind(ordinal)
    .bind(proposal.proposal_id.as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let base_overlay = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(overlay_seq), 0)
         FROM overlay_claims
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    for (offset, draft) in overlay_drafts.iter().enumerate() {
        insert_overlay_draft(
            &mut transaction,
            context.world_id(),
            scenario_id,
            &proposal.proposal_id,
            base_overlay
                + i64::try_from(offset + 1)
                    .map_err(|_| StoreError::Corrupt("overlay sequence overflow".to_owned()))?,
            draft,
        )
        .await?;
    }
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(saved)
}

pub(crate) async fn mark_scenario_discarded(
    pool: &PgPool,
    context: &ExecutionContext,
    scenario_id: &ScenarioId,
) -> Result<(), StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    let updated = sqlx::query(
        "UPDATE world_scenarios
         SET status = 'discarded'
         WHERE tenant_id = $1 AND scenario_id = $2 AND status = 'open'",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() != 1 {
        return Err(StoreError::Conflict("scenario is not open".to_owned()));
    }
    sqlx::query(
        "DELETE FROM overlay_claims
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario_id.as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(())
}

pub(crate) async fn commit_scenario_package(
    pool: &PgPool,
    context: &ExecutionContext,
    scenario: &Scenario,
    plans: &[ScenarioProposalPlan],
) -> Result<CommitSequence, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.world_id()).await?;
    sqlx::query(
        "INSERT INTO authority_heads (tenant_id, commit_sequence)
         VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING",
    )
    .bind(context.world_id().as_str())
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let head = sqlx::query_scalar::<_, i64>(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if head
        != i64::try_from(scenario.base_commit_sequence.get())
            .map_err(|_| StoreError::Corrupt("base commit sequence overflow".to_owned()))?
    {
        return Err(StoreError::Conflict(
            "scenario base diverged from head".to_owned(),
        ));
    }
    let status = sqlx::query_scalar::<_, String>(
        "SELECT status
         FROM world_scenarios
         WHERE tenant_id = $1 AND scenario_id = $2
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .bind(scenario.id.as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    if status != "open" {
        return Err(StoreError::Conflict("scenario is not open".to_owned()));
    }
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, 'scenario')",
    )
    .bind(context.world_id().as_str())
    .bind(next_sequence)
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    let commit_sequence = parse_commit_sequence(next_sequence, "commit sequence")?;
    apply_scenario_plans(
        &mut transaction,
        context,
        plans,
        head,
        next_sequence,
        commit_sequence,
    )
    .await?;
    finalize_scenario_commit(&mut transaction, context, scenario, next_sequence).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(commit_sequence)
}

async fn finalize_scenario_commit(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    scenario: &Scenario,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(context.world_id().as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() != 1 {
        return Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ));
    }
    sqlx::query(
        "UPDATE world_scenarios
         SET status = 'applied', applied_commit_sequence = $3
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario.id.as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    sqlx::query(
        "DELETE FROM overlay_claims
         WHERE tenant_id = $1 AND scenario_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(scenario.id.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn apply_scenario_plans(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    plans: &[ScenarioProposalPlan],
    head: i64,
    next_sequence: i64,
    commit_sequence: CommitSequence,
) -> Result<(), StoreError> {
    for plan in plans {
        let current_basis = load_current(transaction, context, &plan.proposal, head).await?;
        let basis_matches = state_basis_digest_matches(
            &current_basis.dependencies,
            &plan.proposal.state_basis.digest,
        )
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
        if !basis_matches {
            return Err(StoreError::Conflict(
                "scenario proposal state basis is stale".to_owned(),
            ));
        }
        let receipt = zoen_core::CommitReceipt {
            action_id: plan.proposal.action_id.clone(),
            commit_sequence,
            commit_state_basis: Some(current_basis),
            committed_by: context.clone(),
            definition: plan.proposal.definition.clone(),
            effect_request_ids: plan
                .effects
                .iter()
                .map(|effect| effect.effect_request_id.clone())
                .collect(),
            intent_digest: plan.proposal.intent_digest.clone(),
            operation_id: plan.proposal.operation_id.clone(),
            policy: plan.policy.clone(),
            proposal_id: plan.proposal.proposal_id.clone(),
            record_ids: plan
                .effects
                .iter()
                .map(|effect| effect.evidence.draft().claim_id.clone())
                .collect(),
        };
        insert_operation(transaction, context.world_id(), &receipt)
            .await
            .map_err(|error| match error {
                OperationInsertError::Store(error) => error,
                OperationInsertError::CommitSequence => {
                    StoreError::Conflict("commit sequence already used".to_owned())
                }
                OperationInsertError::OperationId => {
                    StoreError::Conflict("operation id already exists".to_owned())
                }
                OperationInsertError::ProposalId => StoreError::OperationMismatch,
            })?;
        for effect in &plan.effects {
            insert_semantic_record(
                transaction,
                context.world_id(),
                next_sequence,
                &effect.evidence,
            )
            .await?;
        }
        insert_operation_records(transaction, context.world_id(), &receipt).await?;
        for (ordinal, effect) in plan.effects.iter().enumerate() {
            insert_effect_request(
                transaction,
                context.world_id(),
                next_sequence,
                ordinal,
                &plan.proposal.operation_id,
                &plan.proposal.intent_digest,
                effect,
            )
            .await?;
        }
    }
    Ok(())
}

async fn insert_overlay_draft(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    scenario_id: &ScenarioId,
    proposal_id: &ProposalId,
    overlay_seq: i64,
    draft: &EvidenceDraft,
) -> Result<(), StoreError> {
    let (value_kind, value_text, value_unit) = value_columns(&draft.value);
    let (valid_time_kind, valid_from_micros, valid_to_micros) =
        valid_time_columns(&draft.valid_time);
    sqlx::query(
        "INSERT INTO overlay_claims (
            tenant_id, scenario_id, claim_id, definition_id, definition_digest,
            definition_revision, entity_id, relation_id, value_kind, value_text, value_unit,
            valid_time_kind, valid_from_micros, valid_to_micros,
            source_id, source_digest, source_ref, overlay_seq, proposal_id,
            observed_at_micros, ingested_at_micros
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18, $19,
            $20, $21
         )",
    )
    .bind(world_id.as_str())
    .bind(scenario_id.as_str())
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
    .bind(overlay_seq)
    .bind(proposal_id.as_str())
    .bind(
        draft
            .provenance
            .observed_at
            .map(zoen_core::TimestampMicros::get),
    )
    .bind(
        draft
            .provenance
            .ingested_at
            .map(zoen_core::TimestampMicros::get),
    )
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}
