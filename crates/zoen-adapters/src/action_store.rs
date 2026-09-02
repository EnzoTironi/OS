use std::{collections::BTreeSet, fmt::Display};

use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    ActionApproval, ActionId, ActionInput, ActionPreviewHash, ActionProposal, ActorId, ApprovalId,
    CapabilityId, CapabilityManifestDigest, ClaimId, CommitReceipt, CommitSequence,
    ComponentDigest, ComponentExecutionEvidence, ComponentInterface, DefinitionDigest,
    DefinitionId, DefinitionReference, DefinitionRevisionNumber, DelegationChain, DelegationGrant,
    DelegationId, EffectRequestId, EntityId, EvidenceDigest, ExecutionContext, ExecutionId,
    InputId, IntentDigest, LineageRole, OperationId, PolicyDigest, PolicyEvidence, PolicyId,
    PolicyRevision, PolicyRevisionNumber, PrincipalId, ProposalAuthority, ProposalId, RelationId,
    ResourceId, ScenarioId, SourceId, StateBasis, StateBasisDigest, StateDependency, TenantId,
    TimestampMicros, TrustedExecutionContext, WorkloadId,
};
use zoen_engine::StoreError;

use crate::{
    i64_to_u64, require_active_revision, row_to_value, set_tenant, store_unavailable, u64_to_i64,
    value_columns,
};

pub(crate) mod commit;
mod failpoints;
pub(crate) mod state_basis;
pub(crate) mod writes;

pub use commit::PostgresActionCommit;
pub(crate) use commit::begin_action_commit;

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
    require_active_revision(&mut transaction, context.tenant_id(), &proposal.definition).await?;
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

    insert_proposal_row(&mut transaction, context, proposal).await?;
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

struct ExecutionFieldRow<'a> {
    capability_ids: Option<Vec<String>>,
    capability_manifest_digest: Option<&'a str>,
    component_digest: Option<&'a str>,
    execution_id: Option<&'a str>,
    interface: Option<&'a str>,
}

fn execution_fields(
    execution: Option<&zoen_core::ComponentExecutionEvidence>,
) -> ExecutionFieldRow<'_> {
    ExecutionFieldRow {
        capability_ids: execution.map(|value| {
            value
                .capability_ids()
                .iter()
                .map(|capability| capability.as_str().to_owned())
                .collect::<Vec<_>>()
        }),
        capability_manifest_digest: execution
            .map(|value| value.capability_manifest_digest().as_str()),
        component_digest: execution.map(|value| value.component_digest().as_str()),
        execution_id: execution.map(|value| value.execution_id().as_str()),
        interface: execution.map(|value| value.interface().as_str()),
    }
}

async fn insert_proposal_row(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    proposal: &ActionProposal,
) -> Result<(), StoreError> {
    let (authority_kind, policy) = proposal_authority_columns(&proposal.authority);
    let proposed_channel_subject = proposal
        .proposed_by
        .channel_subject()
        .map(format_channel_subject);
    sqlx::query(
        "INSERT INTO action_proposals (
            tenant_id, proposal_id, operation_id, intent_digest, action_id,
            definition_id, definition_digest, definition_revision, resource_id,
            proposed_at_micros, expires_at_micros, valid_at_micros,
            proposed_actor_id, proposed_principal_id, proposed_workload_id,
            authority_kind, policy_id, policy_digest, policy_revision,
            determining_policies, state_basis_digest, observed_commit_sequence,
            execution_id, component_digest, component_interface,
            capability_manifest_digest, capability_ids,
            preview_hash, canonical_preview_text, scenario_id,
            proposed_channel_subject
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            $23, $24, $25, $26, $27,
            $28, $29, $30, $31
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
    .bind(execution_fields(proposal.execution.as_ref()).execution_id)
    .bind(execution_fields(proposal.execution.as_ref()).component_digest)
    .bind(execution_fields(proposal.execution.as_ref()).interface)
    .bind(execution_fields(proposal.execution.as_ref()).capability_manifest_digest)
    .bind(execution_fields(proposal.execution.as_ref()).capability_ids)
    .bind(proposal.preview_hash.as_str())
    .bind(&proposal.canonical_preview_text)
    .bind(
        proposal
            .scenario_id
            .as_ref()
            .map(zoen_core::ScenarioId::as_str),
    )
    .bind(proposed_channel_subject)
    .execute(&mut **transaction)
    .await
    .map_err(map_action_insert)?;
    Ok(())
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

pub(crate) async fn get_operation_proposal(
    pool: &PgPool,
    context: &ExecutionContext,
    operation_id: &OperationId,
) -> Result<Option<ActionProposal>, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let proposal =
        load_proposal_by_operation(&mut transaction, context.tenant_id(), operation_id).await?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(proposal)
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
                entity_id, relation_id, role, source_digest, source_id, source_ref
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
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
        .bind(lineage_role_name(dependency.role))
        .bind(dependency.source_digest.as_str())
        .bind(dependency.source_id.as_str())
        .bind(&dependency.source_ref)
        .execute(&mut **transaction)
        .await
        .map_err(map_action_insert)?;
    }
    Ok(())
}

pub(crate) async fn load_proposal(
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
                determining_policies, state_basis_digest, observed_commit_sequence,
                execution_id, component_digest, component_interface,
                capability_manifest_digest, capability_ids,
                preview_hash, canonical_preview_text, scenario_id,
                proposed_channel_subject
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
        row.try_get::<Option<String>, _>("proposed_channel_subject")
            .map_err(store_unavailable)?,
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
        canonical_preview_text: row_string(&row, "canonical_preview_text")?,
        definition: definition_from_row(&row)?,
        execution: execution_from_row(&row)?,
        expires_at: TimestampMicros::new(row_i64(&row, "expires_at_micros")?),
        inputs: load_inputs(transaction, tenant_id, proposal_id).await?,
        intent_digest: IntentDigest::parse(row_string(&row, "intent_digest")?).map_err(corrupt)?,
        operation_id: OperationId::parse(row_string(&row, "operation_id")?).map_err(corrupt)?,
        preview_hash: ActionPreviewHash::parse(row_string(&row, "preview_hash")?)
            .map_err(corrupt)?,
        proposal_id: ProposalId::parse(row_string(&row, "proposal_id")?).map_err(corrupt)?,
        proposed_at: TimestampMicros::new(row_i64(&row, "proposed_at_micros")?),
        proposed_by,
        resource_id: ResourceId::parse(row_string(&row, "resource_id")?).map_err(corrupt)?,
        scenario_id: row
            .try_get::<Option<String>, _>("scenario_id")
            .map_err(store_unavailable)?
            .map(|value| ScenarioId::parse(value).map_err(corrupt))
            .transpose()?,
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

pub(crate) async fn load_approval(
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
            None,
        )?,
        expires_at: TimestampMicros::new(row_i64(&row, "expires_at_micros")?),
        policy: policy_from_row(&row)?,
        proposal_id: ProposalId::parse(row_string(&row, "proposal_id")?).map_err(corrupt)?,
    }))
}

pub(crate) async fn load_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<Option<CommitReceipt>, StoreError> {
    let row = sqlx::query(
        "SELECT operation.operation_id, operation.proposal_id, operation.intent_digest,
                operation.commit_sequence,
                operation.committed_actor_id, operation.committed_principal_id,
                operation.committed_workload_id, operation.committed_channel_subject,
                operation.policy_id, operation.policy_digest, operation.policy_revision,
                operation.determining_policies, operation.state_basis_digest,
                operation.observed_commit_sequence,
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
    let effect_request_ids = load_effect_request_ids(transaction, tenant_id, operation_id).await?;
    let state_basis_digest = row
        .try_get::<Option<String>, _>("state_basis_digest")
        .map_err(store_unavailable)?;
    let observed_commit_sequence = row
        .try_get::<Option<i64>, _>("observed_commit_sequence")
        .map_err(store_unavailable)?;
    let commit_state_basis = match (state_basis_digest, observed_commit_sequence) {
        (Some(digest), Some(observed)) => Some(StateBasis {
            dependencies: load_operation_dependencies(transaction, tenant_id, operation_id).await?,
            digest: StateBasisDigest::parse(digest).map_err(corrupt)?,
            observed_commit_sequence: commit_sequence(observed, "commit observed sequence")?,
        }),
        (None, None) => None,
        _ => {
            return Err(StoreError::Corrupt(
                "operation commit StateBasis columns are inconsistent".to_owned(),
            ));
        }
    };
    Ok(Some(CommitReceipt {
        action_id: ActionId::parse(row_string(&row, "action_id")?).map_err(corrupt)?,
        commit_sequence: commit_sequence(commit_sequence_value, "commit sequence")?,
        commit_state_basis,
        committed_by: trusted_context(
            tenant_id,
            row_string(&row, "committed_actor_id")?,
            row_string(&row, "committed_principal_id")?,
            row_string(&row, "committed_workload_id")?,
            grants,
            row.try_get::<Option<String>, _>("committed_channel_subject")
                .map_err(store_unavailable)?,
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
        "SELECT claim_id, commit_sequence, entity_id, relation_id, role,
                source_digest, source_id, source_ref
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
                role: parse_lineage_role(&row_string(row, "role")?)?,
                source_digest: EvidenceDigest::parse(row_string(row, "source_digest")?)
                    .map_err(corrupt)?,
                source_id: SourceId::parse(row_string(row, "source_id")?).map_err(corrupt)?,
                source_ref: row_string(row, "source_ref")?,
            })
        })
        .collect()
}

async fn load_operation_dependencies(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &TenantId,
    operation_id: &OperationId,
) -> Result<Vec<StateDependency>, StoreError> {
    let rows = sqlx::query(
        "SELECT claim_id, commit_sequence, entity_id, relation_id, role,
                source_digest, source_id, source_ref
         FROM action_operation_dependencies
         WHERE tenant_id = $1 AND operation_id = $2
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            Ok(StateDependency {
                claim_id: ClaimId::parse(row_string(row, "claim_id")?).map_err(corrupt)?,
                commit_sequence: commit_sequence(
                    row_i64(row, "commit_sequence")?,
                    "commit dependency sequence",
                )?,
                entity_id: EntityId::parse(row_string(row, "entity_id")?).map_err(corrupt)?,
                relation_id: RelationId::parse(row_string(row, "relation_id")?).map_err(corrupt)?,
                role: parse_lineage_role(&row_string(row, "role")?)?,
                source_digest: EvidenceDigest::parse(row_string(row, "source_digest")?)
                    .map_err(corrupt)?,
                source_id: SourceId::parse(row_string(row, "source_id")?).map_err(corrupt)?,
                source_ref: row_string(row, "source_ref")?,
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
    operation_id: &OperationId,
) -> Result<Vec<EffectRequestId>, StoreError> {
    let rows = sqlx::query(
        "SELECT effect_request_id
         FROM action_operation_effect_requests
         WHERE tenant_id = $1
           AND operation_id = $2
         ORDER BY ordinal",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
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
    channel_subject: Option<String>,
) -> Result<TrustedExecutionContext, StoreError> {
    let context = TrustedExecutionContext::new(
        tenant_id.clone(),
        ActorId::parse(actor_id).map_err(corrupt)?,
        PrincipalId::parse(principal_id).map_err(corrupt)?,
        WorkloadId::parse(workload_id).map_err(corrupt)?,
        DelegationChain::new(grants).map_err(corrupt)?,
        zoen_core::Clearance::world_floor(),
    );
    Ok(match parse_channel_subject(channel_subject)? {
        Some(subject) => context.with_channel_subject(subject),
        None => context,
    })
}

/// Stored form: `<provider>:<subject_key>` (e.g.
/// `whatsapp:5531987654321@s.whatsapp.net`).
fn format_channel_subject(subject: &zoen_core::ExternalSubject) -> String {
    format!("{}:{}", subject.provider.as_str(), subject.subject_key)
}

fn parse_channel_subject(
    raw: Option<String>,
) -> Result<Option<zoen_core::ExternalSubject>, StoreError> {
    raw.map(|value| {
        let (provider, key) = value
            .split_once(':')
            .ok_or_else(|| StoreError::Corrupt("invalid channel subject".to_owned()))?;
        let provider = zoen_core::ChannelProvider::parse(provider)
            .map_err(|_| StoreError::Corrupt("invalid channel subject provider".to_owned()))?;
        zoen_core::ExternalSubject::new(provider, key)
            .map_err(|_| StoreError::Corrupt("invalid channel subject key".to_owned()))
    })
    .transpose()
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

fn execution_from_row(row: &PgRow) -> Result<Option<ComponentExecutionEvidence>, StoreError> {
    let execution_id = row
        .try_get::<Option<String>, _>("execution_id")
        .map_err(store_unavailable)?;
    let component_digest = row
        .try_get::<Option<String>, _>("component_digest")
        .map_err(store_unavailable)?;
    let interface = row
        .try_get::<Option<String>, _>("component_interface")
        .map_err(store_unavailable)?;
    let manifest_digest = row
        .try_get::<Option<String>, _>("capability_manifest_digest")
        .map_err(store_unavailable)?;
    let capability_ids = row
        .try_get::<Option<Vec<String>>, _>("capability_ids")
        .map_err(store_unavailable)?;
    match (
        execution_id,
        component_digest,
        interface,
        manifest_digest,
        capability_ids,
    ) {
        (None, None, None, None, None) => Ok(None),
        (
            Some(execution_id),
            Some(component_digest),
            Some(interface),
            Some(manifest_digest),
            Some(capability_ids),
        ) => Ok(Some(ComponentExecutionEvidence::new(
            capability_ids
                .into_iter()
                .map(|value| CapabilityId::parse(value).map_err(corrupt))
                .collect::<Result<Vec<_>, _>>()?,
            CapabilityManifestDigest::parse(manifest_digest).map_err(corrupt)?,
            ComponentDigest::parse(component_digest).map_err(corrupt)?,
            ExecutionId::parse(execution_id).map_err(corrupt)?,
            ComponentInterface::parse(interface).map_err(corrupt)?,
        ))),
        _ => Err(StoreError::Corrupt(
            "Action proposal has partial component execution evidence".to_owned(),
        )),
    }
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

fn lineage_role_name(role: LineageRole) -> &'static str {
    match role {
        LineageRole::ComputationDependency => "computation_dependency",
        LineageRole::Rival => "rival",
        LineageRole::Supporting => "supporting",
    }
}

fn parse_lineage_role(value: &str) -> Result<LineageRole, StoreError> {
    match value {
        "computation_dependency" => Ok(LineageRole::ComputationDependency),
        "rival" => Ok(LineageRole::Rival),
        "supporting" => Ok(LineageRole::Supporting),
        _ => Err(StoreError::Corrupt(format!(
            "unknown state dependency role: {value}"
        ))),
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

pub(crate) fn commit_sequence(value: i64, name: &str) -> Result<CommitSequence, StoreError> {
    CommitSequence::new(i64_to_u64(value, name)?)
        .ok_or_else(|| StoreError::Corrupt(format!("{name} is zero")))
}

fn ordinal_i32(value: usize) -> Result<i32, StoreError> {
    i32::try_from(value)
        .map_err(|_| StoreError::Conflict("Action record has too many child rows".to_owned()))
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
