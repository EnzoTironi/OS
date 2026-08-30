use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionProposal, ActorId, CommitReceipt, ExactValue, ExecutionContext, IdentityError,
    InviteToken, PrincipalId, ResourceId, WORLD_INVITE_ACTION, WorkloadId, ZoenAccountId,
};
use zoen_engine::{
    ActionCommitTransaction, CommitPlan, CommitPreparation, CommitStoreOutcome, StoreError,
    state_basis_digest_matches,
};

use crate::identity_store::{PostgresIdentityStore, WorldInvite, dest_invitee_delegation};
use crate::{set_tenant, store_unavailable};

use super::failpoints::{CommitStage, reach};
use super::state_basis::load_current;
use super::writes::{
    OperationInsertError, find_identity_collision, insert_effect_request, insert_operation,
    insert_operation_records, insert_semantic_record,
};
use super::{commit_sequence, get_operation, load_operation};

pub struct PostgresActionCommit {
    context: ExecutionContext,
    head: i64,
    pool: PgPool,
    transaction: Transaction<'static, Postgres>,
}

pub(crate) async fn begin_action_commit(
    pool: &PgPool,
    context: &ExecutionContext,
    proposal: &ActionProposal,
) -> Result<CommitPreparation<PostgresActionCommit>, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    reach(CommitStage::BeforeLock).await?;
    if let Some(receipt) = load_operation(
        &mut transaction,
        context.tenant_id(),
        &proposal.operation_id,
    )
    .await?
    {
        transaction.commit().await.map_err(store_unavailable)?;
        return Ok(preparation_from_receipt(receipt, proposal));
    }

    let head = initialize_and_lock_head(&mut transaction, context).await?;
    reach(CommitStage::AfterLock).await?;
    if let Some(receipt) = load_operation(
        &mut transaction,
        context.tenant_id(),
        &proposal.operation_id,
    )
    .await?
    {
        transaction.commit().await.map_err(store_unavailable)?;
        return Ok(preparation_from_receipt(receipt, proposal));
    }
    Ok(CommitPreparation::Ready(PostgresActionCommit {
        context: context.clone(),
        head,
        pool: pool.clone(),
        transaction,
    }))
}

impl ActionCommitTransaction for PostgresActionCommit {
    async fn commit(self, plan: &CommitPlan) -> Result<CommitStoreOutcome, StoreError> {
        if plan.effects.is_empty() && plan.proposal.action_id.as_str() != WORLD_INVITE_ACTION {
            return Err(StoreError::Corrupt(
                "admitted Action has no effects".to_owned(),
            ));
        }
        let Self {
            context,
            head,
            pool,
            mut transaction,
        } = self;
        let current_basis = load_current(&mut transaction, &context, &plan.proposal, head).await?;
        let basis_matches = state_basis_digest_matches(
            &current_basis.dependencies,
            &plan.proposal.state_basis.digest,
        )
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
        if !basis_matches {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(CommitStoreOutcome::Stale(current_basis));
        }
        if let Some(kind) =
            find_identity_collision(&mut transaction, context.tenant_id(), plan).await?
        {
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
        if let Err(error) = insert_operation(&mut transaction, context.tenant_id(), &receipt).await
        {
            return match error {
                OperationInsertError::OperationId => {
                    transaction.rollback().await.map_err(store_unavailable)?;
                    replay_after_operation_conflict(&pool, &context, plan).await
                }
                OperationInsertError::ProposalId => Ok(CommitStoreOutcome::OperationMismatch),
                OperationInsertError::CommitSequence => Err(StoreError::Conflict(
                    "Action commit sequence already identifies another operation".to_owned(),
                )),
                OperationInsertError::Store(error) => commit_insert_outcome(error),
            };
        }
        reach(CommitStage::AfterOperationInsert).await?;

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
        reach(CommitStage::AfterSemanticRecords).await?;

        for (ordinal, effect) in plan.effects.iter().enumerate() {
            if let Err(error) = insert_effect_request(
                &mut transaction,
                context.tenant_id(),
                next_sequence,
                ordinal,
                &plan.proposal.operation_id,
                &plan.proposal.intent_digest,
                effect,
            )
            .await
            {
                return commit_insert_outcome(error);
            }
        }
        reach(CommitStage::AfterEffectRequests).await?;
        reach(CommitStage::BeforeHeadAdvance).await?;
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
        if plan.proposal.action_id.as_str() == WORLD_INVITE_ACTION {
            // Stamp before authority commit so invite failure rolls the action back.
            apply_world_invite(&pool, &plan.proposal).await?;
        }
        reach(CommitStage::BeforeCommit).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        reach(CommitStage::AfterCommit).await?;
        get_operation(&pool, &context, &plan.proposal.operation_id)
            .await
            .map(|receipt| CommitStoreOutcome::Committed(Box::new(receipt)))
    }

    async fn rollback(self) -> Result<(), StoreError> {
        self.transaction.rollback().await.map_err(store_unavailable)
    }
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

fn preparation_from_receipt(
    receipt: CommitReceipt,
    proposal: &ActionProposal,
) -> CommitPreparation<PostgresActionCommit> {
    if receipt.intent_digest == proposal.intent_digest
        && receipt.proposal_id == proposal.proposal_id
    {
        CommitPreparation::Replayed(Box::new(receipt))
    } else {
        CommitPreparation::OperationMismatch
    }
}

async fn replay_after_operation_conflict(
    pool: &PgPool,
    context: &ExecutionContext,
    plan: &CommitPlan,
) -> Result<CommitStoreOutcome, StoreError> {
    match get_operation(pool, context, &plan.proposal.operation_id).await {
        Ok(receipt)
            if receipt.intent_digest == plan.proposal.intent_digest
                && receipt.proposal_id == plan.proposal.proposal_id =>
        {
            Ok(CommitStoreOutcome::Committed(Box::new(receipt)))
        }
        Ok(_) | Err(StoreError::NotFound) => Ok(CommitStoreOutcome::OperationMismatch),
        Err(error) => Err(error),
    }
}

fn commit_insert_outcome(error: StoreError) -> Result<CommitStoreOutcome, StoreError> {
    match error {
        StoreError::IdentityCollision(kind) => Ok(CommitStoreOutcome::IdentityCollision(kind)),
        StoreError::OperationMismatch => Ok(CommitStoreOutcome::OperationMismatch),
        error => Err(error),
    }
}

async fn apply_world_invite(pool: &PgPool, proposal: &ActionProposal) -> Result<(), StoreError> {
    let invite = world_invite_from_proposal(proposal)?;
    PostgresIdentityStore::new(pool.clone())
        .stamp_world_invite(invite)
        .await
        .map_err(map_invite_error)?;
    Ok(())
}

fn world_invite_from_proposal(proposal: &ActionProposal) -> Result<WorldInvite, StoreError> {
    let account_id = ZoenAccountId::parse(text_input(proposal, "accountId")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let actor_id = ActorId::parse(text_input(proposal, "actorId")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let principal_id = PrincipalId::parse(text_input(proposal, "principalId")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let token = InviteToken::parse(text_input(proposal, "token")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let workload_id = WorkloadId::parse(text_input(proposal, "workloadId")?)
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let resource_id = ResourceId::parse(proposal.definition.definition_id.as_str())
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    let delegation =
        dest_invitee_delegation(&workload_id, &resource_id).map_err(map_invite_error)?;
    Ok(WorldInvite {
        account_id,
        actor_id,
        delegation,
        expires_at: proposal.expires_at,
        principal_id,
        tenant_id: proposal.proposed_by.tenant_id().clone(),
        token,
        workload_id,
    })
}

fn text_input(proposal: &ActionProposal, input_id: &str) -> Result<String, StoreError> {
    proposal
        .inputs
        .iter()
        .find(|input| input.id.as_str() == input_id)
        .and_then(|input| match &input.value {
            ExactValue::Text(value) => Some(value.clone()),
            _ => None,
        })
        .ok_or_else(|| StoreError::Corrupt(format!("invite input {input_id} is required")))
}

fn map_invite_error(error: IdentityError) -> StoreError {
    match error {
        IdentityError::Unavailable(message) => StoreError::Unavailable(message),
        other => StoreError::Conflict(other.to_string()),
    }
}
