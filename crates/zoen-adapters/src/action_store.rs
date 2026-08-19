use std::collections::BTreeSet;
use std::env;
use std::fmt::Display;
use std::time::Duration;

use sqlx::postgres::PgRow;
use sqlx::{PgPool, Postgres, Row, Transaction};
use tokio::time::sleep;
use zoen_core::{
    ActionApproval, ActionId, ActionInput, ActionProposal, ActorId, ApprovalId, ClaimId,
    CommitIdentityKind, CommitReceipt, CommitSequence, DefinitionDigest, DefinitionId,
    DefinitionReference, DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId,
    EffectRequestId, EntityId, EvidenceDigest, ExecutionContext, InputId, IntentDigest,
    OperationId, PolicyDigest, PolicyEvidence, PolicyId, PolicyRevision, PolicyRevisionNumber,
    PrincipalId, ProposalAuthority, ProposalId, RelationId, ResourceId, StateBasis,
    StateBasisDigest, StateDependency, TenantId, TimestampMicros, TrustedExecutionContext,
    WorkloadId,
};
use zoen_engine::{
    ActionCommitEffect, AdmittedEvidence, CommitPlan, CommitStoreOutcome, StoreError,
    calculate_state_basis_digest,
};

use crate::claim_store::load_in_transaction;
use crate::{
    PostgresClaimQuery, i64_to_u64, row_to_value, set_tenant, store_unavailable, u64_to_i64,
    valid_time_columns, value_columns,
};

pub(crate) async fn save_proposal(
    pool: &PgPool,
    context: &ExecutionContext,
    proposal: &ActionProposal,
) -> Result<ActionProposal, StoreError> {
    ensure_context_tenant(context.tenant_id(), &proposal.proposed_by)?;
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    if let Some(existing) =
        load_proposal(&mut transaction, context.tenant_id(), &proposal.proposal_id).await?
    {
        if existing.operation_id == proposal.operation_id
            && existing.intent_digest == proposal.intent_digest
        {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(existing);
        }
        return Err(StoreError::Conflict(
            "proposal id already identifies a different intent".to_owned(),
        ));
    }
    if load_proposal_by_operation(
        &mut transaction,
        context.tenant_id(),
        &proposal.operation_id,
    )
    .await?
    .is_some()
    {
        return Err(StoreError::OperationMismatch);
    }

    let (authority_kind, policy) = proposal_authority_columns(&proposal.authority);
    sqlx::query(
        "INSERT INTO action_proposals (
            tenant_id, proposal_id, operation_id, intent_digest, action_id,
            definition_id, definition_digest, definition_revision, resource_id,
            proposed_at_micros, expires_at_micros, valid_at_micros,
            proposed_actor_id, proposed_principal_id, proposed_workload_id,
            authority_kind, policy_id, policy_digest, policy_revision,
            determining_policies, state_basis_digest, observed_commit_sequence
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(proposal.proposal_id.as_str())
    .bind(proposal.operation_id.as_str())
    .bind(proposal.intent_digest.as_str())
    .bind(proposal.action_id.as_str())
    .bind(proposal.definition.definition_id.as_str())
    .bind(proposal.definition.digest.as_str())
    .bind(u64_to_i64(
        proposal.definition.revision.get(),
        "definition revision",
    )?)
    .bind(proposal.resource_id.as_str())
    .bind(proposal.proposed_at.get())
    .bind(proposal.expires_at.get())
    .bind(proposal.valid_at.get())
    .bind(proposal.proposed_by.actor_id().as_str())
    .bind(proposal.proposed_by.principal_id().as_str())
    .bind(proposal.proposed_by.workload_id().as_str())
    .bind(authority_kind)
    .bind(policy.revision.id.as_str())
    .bind(policy.revision.digest.as_str())
    .bind(u64_to_i64(
        policy.revision.revision.get(),
        "policy revision",
    )?)
    .bind(&policy.determining_policies)
    .bind(proposal.state_basis.digest.as_str())
    .bind(u64_to_i64(
        proposal.state_basis.observed_commit_sequence.get(),
        "observed commit sequence",
    )?)
    .execute(&mut *transaction)
    .await
    .map_err(map_action_insert)?;

    insert_inputs(&mut transaction, context.tenant_id(), proposal).await?;
    insert_dependencies(&mut transaction, context.tenant_id(), proposal).await?;
    insert_grants(
        &mut transaction,
        context.tenant_id(),
        GrantOwner::Proposal(&proposal.proposal_id),
        &proposal.proposed_by,
    )
    .await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(proposal.clone())
}

pub(crate) async fn get_proposal(
    pool: &PgPool,
    context: &ExecutionContext,
    proposal_id: &ProposalId,
) -> Result<ActionProposal, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let proposal = load_proposal(&mut transaction, context.tenant_id(), proposal_id)
        .await?
        .ok_or(StoreError::NotFound)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(proposal)
}

pub(crate) async fn save_approval(
    pool: &PgPool,
    context: &ExecutionContext,
    approval: &ActionApproval,
) -> Result<ActionApproval, StoreError> {
    ensure_context_tenant(context.tenant_id(), &approval.approved_by)?;
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    if let Some(existing) =
        load_approval(&mut transaction, context.tenant_id(), &approval.proposal_id).await?
    {
        if existing.approval_id == approval.approval_id {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(existing);
        }
        return Err(StoreError::Conflict(
            "proposal already has a different approval".to_owned(),
        ));
    }

    sqlx::query(
        "INSERT INTO action_approvals (
            tenant_id, proposal_id, approval_id, approved_at_micros, expires_at_micros,
            approved_actor_id, approved_principal_id, approved_workload_id,
            policy_id, policy_digest, policy_revision, determining_policies
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(approval.proposal_id.as_str())
    .bind(approval.approval_id.as_str())
    .bind(approval.approved_at.get())
    .bind(approval.expires_at.get())
    .bind(approval.approved_by.actor_id().as_str())
    .bind(approval.approved_by.principal_id().as_str())
    .bind(approval.approved_by.workload_id().as_str())
    .bind(approval.policy.revision.id.as_str())
    .bind(approval.policy.revision.digest.as_str())
    .bind(u64_to_i64(
        approval.policy.revision.revision.get(),
        "policy revision",
    )?)
    .bind(&approval.policy.determining_policies)
    .execute(&mut *transaction)
    .await
    .map_err(map_action_insert)?;
    insert_grants(
        &mut transaction,
        context.tenant_id(),
        GrantOwner::Approval(&approval.proposal_id),
        &approval.approved_by,
    )
    .await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(approval.clone())
}

pub(crate) async fn get_approval(
    pool: &PgPool,
    context: &ExecutionContext,
    proposal_id: &ProposalId,
) -> Result<Option<ActionApproval>, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let approval = load_approval(&mut transaction, context.tenant_id(), proposal_id).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(approval)
}

pub(crate) async fn get_operation(
    pool: &PgPool,
    context: &ExecutionContext,
    operation_id: &OperationId,
) -> Result<CommitReceipt, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let receipt = load_operation(&mut transaction, context.tenant_id(), operation_id)
        .await?
        .ok_or(StoreError::NotFound)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(receipt)
}

pub(crate) async fn commit_action(
    pool: &PgPool,
    context: &ExecutionContext,
    plan: &CommitPlan,
) -> Result<CommitStoreOutcome, StoreError> {
    if plan.effects.is_empty() {
        return Err(StoreError::Corrupt(
            "admitted Action has no effects".to_owned(),
        ));
    }
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    reach_failpoint(CommitStage::BeforeLock).await?;
    if let Some(receipt) = load_operation(
        &mut transaction,
        context.tenant_id(),
        &plan.proposal.operation_id,
    )
    .await?
    {
        if receipt.intent_digest == plan.proposal.intent_digest
            && receipt.proposal_id == plan.proposal.proposal_id
        {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(CommitStoreOutcome::Committed(Box::new(receipt)));
        }
        return Ok(CommitStoreOutcome::OperationMismatch);
    }

    let head = initialize_and_lock_head(&mut transaction, context).await?;
    reach_failpoint(CommitStage::AfterLock).await?;
    if let Some(receipt) = load_operation(
        &mut transaction,
        context.tenant_id(),
        &plan.proposal.operation_id,
    )
    .await?
    {
        if receipt.intent_digest == plan.proposal.intent_digest
            && receipt.proposal_id == plan.proposal.proposal_id
        {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(CommitStoreOutcome::Committed(Box::new(receipt)));
        }
        return Ok(CommitStoreOutcome::OperationMismatch);
    }
    let current_basis = load_current_basis(&mut transaction, context, &plan.proposal, head).await?;
    if current_basis.digest != plan.proposal.state_basis.digest {
        transaction.commit().await.map_err(store_unavailable)?;
        return Ok(CommitStoreOutcome::Stale(current_basis));
    }
    if let Some(kind) = find_identity_collision(&mut transaction, context, plan).await? {
        transaction.commit().await.map_err(store_unavailable)?;
        return Ok(CommitStoreOutcome::IdentityCollision(kind));
    }
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, 'action')",
    )
    .bind(context.tenant_id().as_str())
    .bind(next_sequence)
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;

    let commit_sequence = commit_sequence(next_sequence, "commit sequence")?;
    let receipt = CommitReceipt {
        action_id: plan.proposal.action_id.clone(),
        commit_sequence,
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
    if let Err(error) = insert_operation(&mut transaction, context.tenant_id(), &receipt).await {
        return commit_insert_outcome(error);
    }
    reach_failpoint(CommitStage::AfterOperationInsert).await?;

    for effect in &plan.effects {
        if let Err(error) = insert_semantic_record(
            &mut transaction,
            context.tenant_id(),
            next_sequence,
            &effect.evidence,
        )
        .await
        {
            return commit_insert_outcome(error);
        }
    }
    if let Err(error) =
        insert_operation_records(&mut transaction, context.tenant_id(), &receipt).await
    {
        return commit_insert_outcome(error);
    }
    reach_failpoint(CommitStage::AfterSemanticRecords).await?;

    for (ordinal, effect) in plan.effects.iter().enumerate() {
        if let Err(error) = insert_effect_request(
            &mut transaction,
            context.tenant_id(),
            next_sequence,
            ordinal,
            effect,
        )
        .await
        {
            return commit_insert_outcome(error);
        }
    }
    reach_failpoint(CommitStage::AfterEffectRequests).await?;
    reach_failpoint(CommitStage::BeforeHeadAdvance).await?;
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
    reach_failpoint(CommitStage::BeforeCommit).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    reach_failpoint(CommitStage::AfterCommit).await?;
    get_operation(pool, context, &plan.proposal.operation_id)
        .await
        .map(|receipt| CommitStoreOutcome::Committed(Box::new(receipt)))
}

async fn initialize_and_lock_head(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
) -> Result<i64, StoreError> {
    sqlx::query(
        "INSERT INTO authority_heads (tenant_id, commit_sequence)
         VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING",
    )
    .bind(context.tenant_id().as_str())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    sqlx::query(
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
    .map_err(store_unavailable)
}

async fn find_identity_collision(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    plan: &CommitPlan,
) -> Result<Option<CommitIdentityKind>, StoreError> {
    let record_ids = plan
        .effects
        .iter()
        .map(|effect| effect.evidence.draft().claim_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let record_collision = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM semantic_claims
            WHERE tenant_id = $1 AND claim_id = ANY($2::text[])
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(record_ids)
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if record_collision {
        return Ok(Some(CommitIdentityKind::SemanticRecord));
    }

    let effect_request_ids = plan
        .effects
        .iter()
        .map(|effect| effect.effect_request_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let effect_collision = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM projection_outbox
            WHERE tenant_id = $1
              AND effect_request_id = ANY($2::text[])
         )",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_ids)
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if effect_collision {
        Ok(Some(CommitIdentityKind::EffectRequest))
    } else {
        Ok(None)
    }
}

async fn load_current_basis(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    proposal: &ActionProposal,
    head: i64,
) -> Result<StateBasis, StoreError> {
    let relation_ids = proposal
        .state_basis
        .dependencies
        .iter()
        .map(|dependency| dependency.relation_id.clone())
        .collect::<BTreeSet<_>>();
    let cut = commit_sequence(head, "commit sequence")?;
    let claims = load_in_transaction(
        transaction,
        context,
        &PostgresClaimQuery {
            cut,
            definition: proposal.definition.clone(),
            entity_id: EntityId::parse(proposal.resource_id.as_str()).map_err(corrupt)?,
            relation_ids,
            valid_at: proposal.valid_at,
        },
    )
    .await?;
    let mut dependencies = claims
        .into_iter()
        .map(|claim| StateDependency {
            claim_id: claim.draft.claim_id,
            commit_sequence: claim.commit_sequence,
            entity_id: claim.draft.entity_id,
            relation_id: claim.draft.relation_id,
            source_digest: claim.draft.provenance.source_digest,
        })
        .collect::<Vec<_>>();
    sort_dependencies(&mut dependencies);
    dependencies.dedup();
    let digest = calculate_state_basis_digest(&dependencies)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    Ok(StateBasis {
        dependencies,
        digest,
        observed_commit_sequence: cut,
    })
}

async fn insert_semantic_record(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    evidence: &AdmittedEvidence,
) -> Result<(), StoreError> {
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
    .bind(tenant_id.as_str())
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
    .bind(commit_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(|error| map_commit_insert(error, CommitIdentityKind::SemanticRecord))?;
    Ok(())
}

async fn insert_effect_request(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    ordinal: usize,
    effect: &ActionCommitEffect,
) -> Result<(), StoreError> {
    let event = effect.evidence.projection_event();
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload,
             effect_request_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)",
    )
    .bind(tenant_id.as_str())
    .bind(commit_sequence)
    .bind(ordinal_i32(ordinal)?)
    .bind(event.event_type())
    .bind(i32::from(event.event_version()))
    .bind(event.payload())
    .bind(effect.effect_request_id.as_str())
    .execute(&mut **transaction)
    .await
    .map_err(|error| map_commit_insert(error, CommitIdentityKind::EffectRequest))?;
    Ok(())
}

async fn insert_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    receipt: &CommitReceipt,
) -> Result<(), StoreError> {
    ensure_context_tenant(tenant_id, &receipt.committed_by)?;
    sqlx::query(
        "INSERT INTO action_operations (
            tenant_id, operation_id, proposal_id, intent_digest, commit_sequence,
            committed_actor_id, committed_principal_id, committed_workload_id,
            policy_id, policy_digest, policy_revision, determining_policies
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12
         )",
    )
    .bind(tenant_id.as_str())
    .bind(receipt.operation_id.as_str())
    .bind(receipt.proposal_id.as_str())
    .bind(receipt.intent_digest.as_str())
    .bind(u64_to_i64(
        receipt.commit_sequence.get(),
        "commit sequence",
    )?)
    .bind(receipt.committed_by.actor_id().as_str())
    .bind(receipt.committed_by.principal_id().as_str())
    .bind(receipt.committed_by.workload_id().as_str())
    .bind(receipt.policy.revision.id.as_str())
    .bind(receipt.policy.revision.digest.as_str())
    .bind(u64_to_i64(
        receipt.policy.revision.revision.get(),
        "policy revision",
    )?)
    .bind(&receipt.policy.determining_policies)
    .execute(&mut **transaction)
    .await
    .map_err(|error| map_commit_operation_insert(error))?;
    insert_grants(
        transaction,
        tenant_id,
        GrantOwner::Operation(&receipt.operation_id),
        &receipt.committed_by,
    )
    .await
}

async fn insert_operation_records(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    receipt: &CommitReceipt,
) -> Result<(), StoreError> {
    for (ordinal, claim_id) in receipt.record_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO action_operation_records
                (tenant_id, operation_id, ordinal, claim_id)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(tenant_id.as_str())
        .bind(receipt.operation_id.as_str())
        .bind(ordinal_i32(ordinal)?)
        .bind(claim_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(|error| map_commit_insert(error, CommitIdentityKind::SemanticRecord))?;
    }
    Ok(())
}

async fn insert_inputs(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal: &ActionProposal,
) -> Result<(), StoreError> {
    for (ordinal, input) in proposal.inputs.iter().enumerate() {
        let (value_kind, value_text, value_unit) = value_columns(&input.value);
        sqlx::query(
            "INSERT INTO action_proposal_inputs (
                tenant_id, proposal_id, ordinal, input_id,
                value_kind, value_text, value_unit
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(tenant_id.as_str())
        .bind(proposal.proposal_id.as_str())
        .bind(ordinal_i32(ordinal)?)
        .bind(input.id.as_str())
        .bind(value_kind)
        .bind(value_text)
        .bind(value_unit)
        .execute(&mut **transaction)
        .await
        .map_err(map_action_insert)?;
    }
    Ok(())
}

async fn insert_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal: &ActionProposal,
) -> Result<(), StoreError> {
    for (ordinal, dependency) in proposal.state_basis.dependencies.iter().enumerate() {
        sqlx::query(
            "INSERT INTO action_proposal_dependencies (
                tenant_id, proposal_id, ordinal, claim_id, commit_sequence,
                entity_id, relation_id, source_digest
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        )
        .bind(tenant_id.as_str())
        .bind(proposal.proposal_id.as_str())
        .bind(ordinal_i32(ordinal)?)
        .bind(dependency.claim_id.as_str())
        .bind(u64_to_i64(
            dependency.commit_sequence.get(),
            "dependency commit sequence",
        )?)
        .bind(dependency.entity_id.as_str())
        .bind(dependency.relation_id.as_str())
        .bind(dependency.source_digest.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(map_action_insert)?;
    }
    Ok(())
}

async fn load_proposal(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal_id: &ProposalId,
) -> Result<Option<ActionProposal>, StoreError> {
    let row = sqlx::query(
        "SELECT proposal_id, operation_id, intent_digest, action_id,
                definition_id, definition_digest, definition_revision, resource_id,
                proposed_at_micros, expires_at_micros, valid_at_micros,
                proposed_actor_id, proposed_principal_id, proposed_workload_id,
                authority_kind, policy_id, policy_digest, policy_revision,
                determining_policies, state_basis_digest, observed_commit_sequence
         FROM action_proposals
         WHERE tenant_id = $1 AND proposal_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let grants = load_grants(transaction, tenant_id, GrantOwner::Proposal(proposal_id)).await?;
    let proposed_by = trusted_context(
        tenant_id,
        row_string(&row, "proposed_actor_id")?,
        row_string(&row, "proposed_principal_id")?,
        row_string(&row, "proposed_workload_id")?,
        grants,
    )?;
    let policy = policy_from_row(&row)?;
    let authority = match row_string(&row, "authority_kind")?.as_str() {
        "ready" => ProposalAuthority::Ready(policy),
        "awaiting_approval" => ProposalAuthority::AwaitingApproval(policy),
        kind => {
            return Err(StoreError::Corrupt(format!(
                "unknown proposal authority kind: {kind}"
            )));
        }
    };
    Ok(Some(ActionProposal {
        action_id: ActionId::parse(row_string(&row, "action_id")?).map_err(corrupt)?,
        authority,
        definition: definition_from_row(&row)?,
        expires_at: TimestampMicros::new(row_i64(&row, "expires_at_micros")?),
        inputs: load_inputs(transaction, tenant_id, proposal_id).await?,
        intent_digest: IntentDigest::parse(row_string(&row, "intent_digest")?).map_err(corrupt)?,
        operation_id: OperationId::parse(row_string(&row, "operation_id")?).map_err(corrupt)?,
        proposal_id: ProposalId::parse(row_string(&row, "proposal_id")?).map_err(corrupt)?,
        proposed_at: TimestampMicros::new(row_i64(&row, "proposed_at_micros")?),
        proposed_by,
        resource_id: ResourceId::parse(row_string(&row, "resource_id")?).map_err(corrupt)?,
        state_basis: StateBasis {
            dependencies: load_dependencies(transaction, tenant_id, proposal_id).await?,
            digest: StateBasisDigest::parse(row_string(&row, "state_basis_digest")?)
                .map_err(corrupt)?,
            observed_commit_sequence: commit_sequence(
                row_i64(&row, "observed_commit_sequence")?,
                "observed commit sequence",
            )?,
        },
        valid_at: TimestampMicros::new(row_i64(&row, "valid_at_micros")?),
    }))
}

async fn load_proposal_by_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<Option<ActionProposal>, StoreError> {
    let proposal_id = sqlx::query_scalar::<_, String>(
        "SELECT proposal_id
         FROM action_proposals
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(proposal_id) = proposal_id else {
        return Ok(None);
    };
    let proposal_id = ProposalId::parse(proposal_id).map_err(corrupt)?;
    load_proposal(transaction, tenant_id, &proposal_id).await
}

async fn load_approval(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal_id: &ProposalId,
) -> Result<Option<ActionApproval>, StoreError> {
    let row = sqlx::query(
        "SELECT proposal_id, approval_id, approved_at_micros, expires_at_micros,
                approved_actor_id, approved_principal_id, approved_workload_id,
                policy_id, policy_digest, policy_revision, determining_policies
         FROM action_approvals
         WHERE tenant_id = $1 AND proposal_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let grants = load_grants(transaction, tenant_id, GrantOwner::Approval(proposal_id)).await?;
    Ok(Some(ActionApproval {
        approval_id: ApprovalId::parse(row_string(&row, "approval_id")?).map_err(corrupt)?,
        approved_at: TimestampMicros::new(row_i64(&row, "approved_at_micros")?),
        approved_by: trusted_context(
            tenant_id,
            row_string(&row, "approved_actor_id")?,
            row_string(&row, "approved_principal_id")?,
            row_string(&row, "approved_workload_id")?,
            grants,
        )?,
        expires_at: TimestampMicros::new(row_i64(&row, "expires_at_micros")?),
        policy: policy_from_row(&row)?,
        proposal_id: ProposalId::parse(row_string(&row, "proposal_id")?).map_err(corrupt)?,
    }))
}

async fn load_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<Option<CommitReceipt>, StoreError> {
    let row = sqlx::query(
        "SELECT operation.operation_id, operation.proposal_id, operation.intent_digest,
                operation.commit_sequence,
                operation.committed_actor_id, operation.committed_principal_id,
                operation.committed_workload_id,
                operation.policy_id, operation.policy_digest, operation.policy_revision,
                operation.determining_policies,
                proposal.action_id, proposal.definition_id,
                proposal.definition_digest, proposal.definition_revision
         FROM action_operations AS operation
         JOIN action_proposals AS proposal
           ON proposal.tenant_id = operation.tenant_id
          AND proposal.proposal_id = operation.proposal_id
         WHERE operation.tenant_id = $1 AND operation.operation_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let grants = load_grants(transaction, tenant_id, GrantOwner::Operation(operation_id)).await?;
    let commit_sequence_value = row_i64(&row, "commit_sequence")?;
    let effect_request_ids =
        load_effect_request_ids(transaction, tenant_id, commit_sequence_value).await?;
    Ok(Some(CommitReceipt {
        action_id: ActionId::parse(row_string(&row, "action_id")?).map_err(corrupt)?,
        commit_sequence: commit_sequence(commit_sequence_value, "commit sequence")?,
        committed_by: trusted_context(
            tenant_id,
            row_string(&row, "committed_actor_id")?,
            row_string(&row, "committed_principal_id")?,
            row_string(&row, "committed_workload_id")?,
            grants,
        )?,
        definition: definition_from_row(&row)?,
        effect_request_ids,
        intent_digest: IntentDigest::parse(row_string(&row, "intent_digest")?).map_err(corrupt)?,
        operation_id: OperationId::parse(row_string(&row, "operation_id")?).map_err(corrupt)?,
        policy: policy_from_row(&row)?,
        proposal_id: ProposalId::parse(row_string(&row, "proposal_id")?).map_err(corrupt)?,
        record_ids: load_record_ids(transaction, tenant_id, operation_id).await?,
    }))
}

async fn load_inputs(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal_id: &ProposalId,
) -> Result<Vec<ActionInput>, StoreError> {
    let rows = sqlx::query(
        "SELECT input_id, value_kind, value_text, value_unit
         FROM action_proposal_inputs
         WHERE tenant_id = $1 AND proposal_id = $2
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            Ok(ActionInput {
                id: InputId::parse(row_string(row, "input_id")?).map_err(corrupt)?,
                value: row_to_value(row)?,
            })
        })
        .collect()
}

async fn load_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    proposal_id: &ProposalId,
) -> Result<Vec<StateDependency>, StoreError> {
    let rows = sqlx::query(
        "SELECT claim_id, commit_sequence, entity_id, relation_id, source_digest
         FROM action_proposal_dependencies
         WHERE tenant_id = $1 AND proposal_id = $2
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            Ok(StateDependency {
                claim_id: ClaimId::parse(row_string(row, "claim_id")?).map_err(corrupt)?,
                commit_sequence: commit_sequence(
                    row_i64(row, "commit_sequence")?,
                    "dependency commit sequence",
                )?,
                entity_id: EntityId::parse(row_string(row, "entity_id")?).map_err(corrupt)?,
                relation_id: RelationId::parse(row_string(row, "relation_id")?).map_err(corrupt)?,
                source_digest: EvidenceDigest::parse(row_string(row, "source_digest")?)
                    .map_err(corrupt)?,
            })
        })
        .collect()
}

async fn load_record_ids(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<Vec<ClaimId>, StoreError> {
    let rows = sqlx::query(
        "SELECT claim_id
         FROM action_operation_records
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| ClaimId::parse(row_string(row, "claim_id")?).map_err(corrupt))
        .collect()
}

async fn load_effect_request_ids(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
) -> Result<Vec<EffectRequestId>, StoreError> {
    let rows = sqlx::query(
        "SELECT effect_request_id
         FROM projection_outbox
         WHERE tenant_id = $1
           AND commit_sequence = $2
           AND effect_request_id IS NOT NULL
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(commit_sequence)
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| EffectRequestId::parse(row_string(row, "effect_request_id")?).map_err(corrupt))
        .collect()
}

enum GrantOwner<'a> {
    Approval(&'a ProposalId),
    Operation(&'a OperationId),
    Proposal(&'a ProposalId),
}

impl GrantOwner<'_> {
    fn id(&self) -> &str {
        match self {
            Self::Approval(id) | Self::Proposal(id) => id.as_str(),
            Self::Operation(id) => id.as_str(),
        }
    }

    fn insert_query(&self) -> &'static str {
        match self {
            Self::Approval(_) => {
                "INSERT INTO action_approval_grants (
                    tenant_id, proposal_id, ordinal, delegation_id,
                    action_ids, resource_ids, workload_ids,
                    not_before_micros, expires_at_micros
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
            }
            Self::Operation(_) => {
                "INSERT INTO action_operation_grants (
                    tenant_id, operation_id, ordinal, delegation_id,
                    action_ids, resource_ids, workload_ids,
                    not_before_micros, expires_at_micros
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
            }
            Self::Proposal(_) => {
                "INSERT INTO action_proposal_grants (
                    tenant_id, proposal_id, ordinal, delegation_id,
                    action_ids, resource_ids, workload_ids,
                    not_before_micros, expires_at_micros
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
            }
        }
    }

    fn select_query(&self) -> &'static str {
        match self {
            Self::Approval(_) => {
                "SELECT delegation_id, action_ids, resource_ids, workload_ids,
                        not_before_micros, expires_at_micros
                 FROM action_approval_grants
                 WHERE tenant_id = $1 AND proposal_id = $2
                 ORDER BY ordinal"
            }
            Self::Operation(_) => {
                "SELECT delegation_id, action_ids, resource_ids, workload_ids,
                        not_before_micros, expires_at_micros
                 FROM action_operation_grants
                 WHERE tenant_id = $1 AND operation_id = $2
                 ORDER BY ordinal"
            }
            Self::Proposal(_) => {
                "SELECT delegation_id, action_ids, resource_ids, workload_ids,
                        not_before_micros, expires_at_micros
                 FROM action_proposal_grants
                 WHERE tenant_id = $1 AND proposal_id = $2
                 ORDER BY ordinal"
            }
        }
    }
}

async fn insert_grants(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    owner: GrantOwner<'_>,
    context: &TrustedExecutionContext,
) -> Result<(), StoreError> {
    for (ordinal, grant) in context.delegation().grants().iter().enumerate() {
        sqlx::query(owner.insert_query())
            .bind(tenant_id.as_str())
            .bind(owner.id())
            .bind(ordinal_i32(ordinal)?)
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
            .map_err(map_action_insert)?;
    }
    Ok(())
}

async fn load_grants(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    owner: GrantOwner<'_>,
) -> Result<Vec<DelegationGrant>, StoreError> {
    let rows = sqlx::query(owner.select_query())
        .bind(tenant_id.as_str())
        .bind(owner.id())
        .fetch_all(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            DelegationGrant::new(
                DelegationId::parse(row_string(row, "delegation_id")?).map_err(corrupt)?,
                parse_ids(row, "action_ids", ActionId::parse)?,
                parse_ids(row, "resource_ids", ResourceId::parse)?,
                parse_ids(row, "workload_ids", WorkloadId::parse)?,
                TimestampMicros::new(row_i64(row, "not_before_micros")?),
                TimestampMicros::new(row_i64(row, "expires_at_micros")?),
            )
            .map_err(corrupt)
        })
        .collect()
}

fn parse_ids<T, E>(
    row: &PgRow,
    column: &str,
    parse: impl Fn(String) -> Result<T, E>,
) -> Result<BTreeSet<T>, StoreError>
where
    T: Ord,
    E: Display,
{
    row.try_get::<Vec<String>, _>(column)
        .map_err(store_unavailable)?
        .into_iter()
        .map(|value| parse(value).map_err(corrupt))
        .collect()
}

fn trusted_context(
    tenant_id: &TenantId,
    actor_id: String,
    principal_id: String,
    workload_id: String,
    grants: Vec<DelegationGrant>,
) -> Result<TrustedExecutionContext, StoreError> {
    Ok(TrustedExecutionContext::new(
        tenant_id.clone(),
        ActorId::parse(actor_id).map_err(corrupt)?,
        PrincipalId::parse(principal_id).map_err(corrupt)?,
        WorkloadId::parse(workload_id).map_err(corrupt)?,
        DelegationChain::new(grants).map_err(corrupt)?,
    ))
}

fn definition_from_row(row: &PgRow) -> Result<DefinitionReference, StoreError> {
    Ok(DefinitionReference {
        definition_id: DefinitionId::parse(row_string(row, "definition_id")?).map_err(corrupt)?,
        digest: DefinitionDigest::parse(row_string(row, "definition_digest")?).map_err(corrupt)?,
        revision: DefinitionRevisionNumber::new(i64_to_u64(
            row_i64(row, "definition_revision")?,
            "definition revision",
        )?)
        .ok_or_else(|| StoreError::Corrupt("zero definition revision".to_owned()))?,
    })
}

fn policy_from_row(row: &PgRow) -> Result<PolicyEvidence, StoreError> {
    Ok(PolicyEvidence {
        determining_policies: row
            .try_get::<Vec<String>, _>("determining_policies")
            .map_err(store_unavailable)?,
        revision: PolicyRevision {
            digest: PolicyDigest::parse(row_string(row, "policy_digest")?).map_err(corrupt)?,
            id: PolicyId::parse(row_string(row, "policy_id")?).map_err(corrupt)?,
            revision: PolicyRevisionNumber::new(i64_to_u64(
                row_i64(row, "policy_revision")?,
                "policy revision",
            )?)
            .ok_or_else(|| StoreError::Corrupt("zero policy revision".to_owned()))?,
        },
    })
}

fn proposal_authority_columns(authority: &ProposalAuthority) -> (&'static str, &PolicyEvidence) {
    match authority {
        ProposalAuthority::AwaitingApproval(policy) => ("awaiting_approval", policy),
        ProposalAuthority::Ready(policy) => ("ready", policy),
    }
}

fn ensure_context_tenant(
    tenant_id: &TenantId,
    context: &TrustedExecutionContext,
) -> Result<(), StoreError> {
    if context.tenant_id() == tenant_id {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "stored authority basis has a different tenant".to_owned(),
        ))
    }
}

fn sort_dependencies(dependencies: &mut [StateDependency]) {
    dependencies.sort_by(|left, right| {
        (
            left.relation_id.as_str(),
            left.claim_id.as_str(),
            left.commit_sequence,
        )
            .cmp(&(
                right.relation_id.as_str(),
                right.claim_id.as_str(),
                right.commit_sequence,
            ))
    });
}

fn commit_sequence(value: i64, name: &str) -> Result<CommitSequence, StoreError> {
    CommitSequence::new(i64_to_u64(value, name)?)
        .ok_or_else(|| StoreError::Corrupt(format!("{name} is zero")))
}

fn ordinal_i32(value: usize) -> Result<i32, StoreError> {
    i32::try_from(value)
        .map_err(|_| StoreError::Conflict("Action record has too many child rows".to_owned()))
}

fn commit_insert_outcome(error: StoreError) -> Result<CommitStoreOutcome, StoreError> {
    match error {
        StoreError::IdentityCollision(kind) => Ok(CommitStoreOutcome::IdentityCollision(kind)),
        StoreError::OperationMismatch => Ok(CommitStoreOutcome::OperationMismatch),
        error => Err(error),
    }
}

fn map_commit_insert(error: sqlx::Error, kind: CommitIdentityKind) -> StoreError {
    if error
        .as_database_error()
        .is_some_and(|database| database.is_unique_violation())
    {
        StoreError::IdentityCollision(kind)
    } else {
        store_unavailable(error)
    }
}

fn map_commit_operation_insert(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .is_some_and(|database| database.is_unique_violation())
    {
        StoreError::OperationMismatch
    } else {
        store_unavailable(error)
    }
}

fn map_action_insert(error: sqlx::Error) -> StoreError {
    if let Some(database) = error.as_database_error()
        && database.is_unique_violation()
    {
        if database.constraint() == Some("action_proposals_tenant_id_operation_id_key") {
            StoreError::OperationMismatch
        } else {
            StoreError::Conflict("Action identity already exists".to_owned())
        }
    } else {
        store_unavailable(error)
    }
}

fn row_string(row: &PgRow, column: &str) -> Result<String, StoreError> {
    row.try_get::<String, _>(column).map_err(store_unavailable)
}

fn row_i64(row: &PgRow, column: &str) -> Result<i64, StoreError> {
    row.try_get::<i64, _>(column).map_err(store_unavailable)
}

fn corrupt(error: impl Display) -> StoreError {
    StoreError::Corrupt(error.to_string())
}

#[derive(Clone, Copy)]
enum CommitStage {
    AfterCommit,
    AfterEffectRequests,
    AfterLock,
    AfterOperationInsert,
    AfterSemanticRecords,
    BeforeCommit,
    BeforeHeadAdvance,
    BeforeLock,
}

impl CommitStage {
    fn name(self) -> &'static str {
        match self {
            Self::AfterCommit => "after_commit",
            Self::AfterEffectRequests => "after_effect_requests",
            Self::AfterLock => "after_lock",
            Self::AfterOperationInsert => "after_operation_insert",
            Self::AfterSemanticRecords => "after_semantic_records",
            Self::BeforeCommit => "before_commit",
            Self::BeforeHeadAdvance => "before_head_advance",
            Self::BeforeLock => "before_lock",
        }
    }
}

async fn reach_failpoint(stage: CommitStage) -> Result<(), StoreError> {
    if env::var("ZOEN_ACTION_COMMIT_FAILPOINT").as_deref() != Ok(stage.name()) {
        return Ok(());
    }
    if let Some(milliseconds) = env::var("ZOEN_ACTION_COMMIT_FAILPOINT_PAUSE_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
    {
        sleep(Duration::from_millis(milliseconds)).await;
        Ok(())
    } else {
        Err(StoreError::Unavailable(format!(
            "injected Action commit failure at {}",
            stage.name()
        )))
    }
}
