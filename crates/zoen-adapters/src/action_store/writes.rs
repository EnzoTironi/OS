use sha2::{Digest, Sha256};
use sqlx::{Postgres, Transaction};
use zoen_core::{
    CommitIdentityKind, CommitReceipt, IntentDigest, OperationId, StateBasis, TenantId,
};
use zoen_engine::{ActionCommitEffect, AdmittedEvidence, CommitPlan, StoreError};

use crate::semantic_claim_store::{self, RevisionRequirement};
use crate::{store_unavailable, u64_to_i64};

use super::{GrantOwner, ensure_context_tenant, insert_grants, ordinal_i32};

pub(super) enum OperationInsertError {
    CommitSequence,
    OperationId,
    ProposalId,
    Store(StoreError),
}

pub(super) async fn find_identity_collision(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
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
            FROM semantic_claims AS claim
            LEFT JOIN action_operation_records AS owned
              ON owned.tenant_id = claim.tenant_id
             AND owned.claim_id = claim.claim_id
            WHERE claim.tenant_id = $1
              AND claim.claim_id = ANY($2::text[])
              AND (
                owned.operation_id IS NULL
                OR owned.operation_id <> $3
              )
         )",
    )
    .bind(tenant_id.as_str())
    .bind(record_ids)
    .bind(plan.proposal.operation_id.as_str())
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
            FROM effect_requests
            WHERE tenant_id = $1
              AND effect_request_id = ANY($2::text[])
            UNION ALL
            SELECT 1
            FROM projection_outbox
            WHERE tenant_id = $1
              AND effect_request_id = ANY($2::text[])
         )",
    )
    .bind(tenant_id.as_str())
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

pub(super) async fn insert_semantic_record(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    evidence: &AdmittedEvidence,
) -> Result<(), StoreError> {
    semantic_claim_store::insert(
        transaction,
        tenant_id,
        commit_sequence,
        evidence,
        RevisionRequirement::Active,
    )
    .await
}

pub(super) async fn insert_effect_request(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    commit_sequence: i64,
    ordinal: usize,
    operation_id: &OperationId,
    intent_digest: &IntentDigest,
    effect: &ActionCommitEffect,
) -> Result<(), StoreError> {
    let event = effect.evidence.projection_event();
    let request_digest = Sha256::digest(&effect.request_payload)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let idempotency_key = format!(
        "idempotency.{}.{}",
        tenant_id.as_str(),
        effect.effect_request_id.as_str()
    );
    sqlx::query(
        "INSERT INTO effect_requests (
            tenant_id, effect_request_id, operation_id, commit_sequence,
            idempotency_key, intent_digest, request_digest, payload,
            knowledge_state, last_commit_sequence
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'not_attempted', $4)",
    )
    .bind(tenant_id.as_str())
    .bind(effect.effect_request_id.as_str())
    .bind(operation_id.as_str())
    .bind(commit_sequence)
    .bind(idempotency_key)
    .bind(intent_digest.as_str())
    .bind(request_digest)
    .bind(&effect.request_payload)
    .execute(&mut **transaction)
    .await
    .map_err(map_effect_request_insert)?;

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
    .map_err(|error| {
        map_identity_insert(
            error,
            "projection_outbox_effect_request_id_unique",
            CommitIdentityKind::EffectRequest,
        )
    })?;
    Ok(())
}

fn map_effect_request_insert(error: sqlx::Error) -> StoreError {
    if error.as_database_error().is_some_and(|database| {
        database.is_unique_violation()
            && database
                .constraint()
                .is_some_and(|constraint| constraint.starts_with("effect_requests_"))
    }) {
        StoreError::IdentityCollision(CommitIdentityKind::EffectRequest)
    } else {
        store_unavailable(error)
    }
}

pub(super) async fn insert_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    receipt: &CommitReceipt,
) -> Result<(), OperationInsertError> {
    ensure_context_tenant(tenant_id, &receipt.committed_by).map_err(OperationInsertError::Store)?;
    let state_basis = receipt.commit_state_basis.as_ref().ok_or_else(|| {
        OperationInsertError::Store(StoreError::Corrupt(
            "new Action operation has no commit StateBasis".to_owned(),
        ))
    })?;
    sqlx::query(
        "INSERT INTO action_operations (
            tenant_id, operation_id, proposal_id, intent_digest, commit_sequence,
            committed_actor_id, committed_principal_id, committed_workload_id,
            policy_id, policy_digest, policy_revision, determining_policies,
            state_basis_digest, observed_commit_sequence
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14
         )",
    )
    .bind(tenant_id.as_str())
    .bind(receipt.operation_id.as_str())
    .bind(receipt.proposal_id.as_str())
    .bind(receipt.intent_digest.as_str())
    .bind(
        u64_to_i64(receipt.commit_sequence.get(), "commit sequence")
            .map_err(OperationInsertError::Store)?,
    )
    .bind(receipt.committed_by.actor_id().as_str())
    .bind(receipt.committed_by.principal_id().as_str())
    .bind(receipt.committed_by.workload_id().as_str())
    .bind(receipt.policy.revision.id.as_str())
    .bind(receipt.policy.revision.digest.as_str())
    .bind(
        u64_to_i64(receipt.policy.revision.revision.get(), "policy revision")
            .map_err(OperationInsertError::Store)?,
    )
    .bind(&receipt.policy.determining_policies)
    .bind(state_basis.digest.as_str())
    .bind(
        u64_to_i64(
            state_basis.observed_commit_sequence.get(),
            "commit observed sequence",
        )
        .map_err(OperationInsertError::Store)?,
    )
    .execute(&mut **transaction)
    .await
    .map_err(map_operation_insert)?;
    insert_grants(
        transaction,
        tenant_id,
        GrantOwner::Operation(&receipt.operation_id),
        &receipt.committed_by,
    )
    .await
    .map_err(OperationInsertError::Store)?;
    insert_operation_dependencies(
        transaction,
        tenant_id,
        receipt.operation_id.as_str(),
        state_basis,
    )
    .await
    .map_err(OperationInsertError::Store)?;
    insert_operation_effect_requests(transaction, tenant_id, receipt)
        .await
        .map_err(OperationInsertError::Store)
}

async fn insert_operation_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &str,
    state_basis: &StateBasis,
) -> Result<(), StoreError> {
    for (ordinal, dependency) in state_basis.dependencies.iter().enumerate() {
        sqlx::query(
            "INSERT INTO action_operation_dependencies (
                tenant_id, operation_id, ordinal, claim_id, commit_sequence,
                entity_id, relation_id, role, source_digest, source_id, source_ref
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        )
        .bind(tenant_id.as_str())
        .bind(operation_id)
        .bind(ordinal_i32(ordinal)?)
        .bind(dependency.claim_id.as_str())
        .bind(u64_to_i64(
            dependency.commit_sequence.get(),
            "commit dependency sequence",
        )?)
        .bind(dependency.entity_id.as_str())
        .bind(dependency.relation_id.as_str())
        .bind(super::lineage_role_name(dependency.role))
        .bind(dependency.source_digest.as_str())
        .bind(dependency.source_id.as_str())
        .bind(&dependency.source_ref)
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    Ok(())
}

async fn insert_operation_effect_requests(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    receipt: &CommitReceipt,
) -> Result<(), StoreError> {
    for (ordinal, effect_request_id) in receipt.effect_request_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO action_operation_effect_requests
                (tenant_id, operation_id, ordinal, effect_request_id)
             VALUES ($1, $2, $3, $4)",
        )
        .bind(tenant_id.as_str())
        .bind(receipt.operation_id.as_str())
        .bind(ordinal_i32(ordinal)?)
        .bind(effect_request_id.as_str())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    Ok(())
}

pub(super) async fn insert_operation_records(
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
        .map_err(store_unavailable)?;
    }
    Ok(())
}

fn map_identity_insert(
    error: sqlx::Error,
    constraint: &str,
    kind: CommitIdentityKind,
) -> StoreError {
    if error.as_database_error().is_some_and(|database| {
        database.is_unique_violation() && database.constraint() == Some(constraint)
    }) {
        StoreError::IdentityCollision(kind)
    } else {
        store_unavailable(error)
    }
}

fn map_operation_insert(error: sqlx::Error) -> OperationInsertError {
    let Some(database) = error.as_database_error() else {
        return OperationInsertError::Store(store_unavailable(error));
    };
    if !database.is_unique_violation() {
        return OperationInsertError::Store(store_unavailable(error));
    }
    match database.constraint() {
        Some("action_operations_pkey") => OperationInsertError::OperationId,
        Some("action_operations_tenant_id_proposal_id_key") => OperationInsertError::ProposalId,
        Some("action_operations_tenant_id_commit_sequence_key") => {
            OperationInsertError::CommitSequence
        }
        _ => OperationInsertError::Store(store_unavailable(error)),
    }
}
