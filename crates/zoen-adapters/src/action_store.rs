use std::collections::BTreeSet;
use std::fmt::Display;

use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionApproval, ActionId, ActionInput, ActionProposal, ActorId, ApprovalId, ClaimId,
    CommitReceipt, CommitSequence, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, EvidenceDigest, ExactDecimal, ExactInteger, ExactValue, InputId,
    IntentDigest, OperationId, PolicyDigest, PolicyEvidence, PolicyId, PolicyRevision,
    PolicyRevisionNumber, ProposalAuthority, ProposalId, RelationId, ResourceId, StateBasis,
    StateBasisDigest, StateDependency, TimestampMicros, UnitId,
};
use zoen_engine::{
    ActionError, CommitPlan, CommitStoreOutcome, StoreError, calculate_state_basis_digest,
};

use crate::{
    i64_to_u64, set_tenant, store_unavailable, u64_to_i64, valid_time_columns, value_columns,
};

pub(crate) async fn save_proposal(
    pool: &PgPool,
    context: &zoen_core::ExecutionContext,
    proposal: &ActionProposal,
) -> Result<ActionProposal, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    if let Some(existing) =
        load_proposal(&mut transaction, context.tenant_id(), &proposal.proposal_id).await?
    {
        if existing == *proposal {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(existing);
        }
        return Err(StoreError::Conflict(
            "proposal id already identifies a different proposal".to_owned(),
        ));
    }
    let payload = serde_json::to_value(ProposalDto::from(proposal))
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    sqlx::query(
        "INSERT INTO action_proposals
            (tenant_id, proposal_id, operation_id, intent_digest, payload)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(context.tenant_id().as_str())
    .bind(proposal.proposal_id.as_str())
    .bind(proposal.operation_id.as_str())
    .bind(proposal.intent_digest.as_str())
    .bind(payload)
    .execute(&mut *transaction)
    .await
    .map_err(map_proposal_insert)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(proposal.clone())
}

pub(crate) async fn get_proposal(
    pool: &PgPool,
    context: &zoen_core::ExecutionContext,
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
    context: &zoen_core::ExecutionContext,
    approval: &ActionApproval,
) -> Result<ActionApproval, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    if let Some(existing) =
        load_approval(&mut transaction, context.tenant_id(), &approval.proposal_id).await?
    {
        if existing == *approval {
            transaction.commit().await.map_err(store_unavailable)?;
            return Ok(existing);
        }
        return Err(StoreError::Conflict(
            "proposal already has a different approval".to_owned(),
        ));
    }
    let payload = serde_json::to_value(ApprovalDto::from(approval))
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    sqlx::query(
        "INSERT INTO action_approvals
            (tenant_id, proposal_id, approval_id, payload)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(context.tenant_id().as_str())
    .bind(approval.proposal_id.as_str())
    .bind(approval.approval_id.as_str())
    .bind(payload)
    .execute(&mut *transaction)
    .await
    .map_err(map_proposal_insert)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(approval.clone())
}

pub(crate) async fn get_approval(
    pool: &PgPool,
    context: &zoen_core::ExecutionContext,
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
    context: &zoen_core::ExecutionContext,
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
    context: &zoen_core::ExecutionContext,
    plan: &CommitPlan,
) -> Result<CommitStoreOutcome, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
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
        return Err(StoreError::Conflict(
            "operation id already identifies a different intent".to_owned(),
        ));
    }

    initialize_and_lock_head(&mut transaction, context).await?;
    let current_basis = load_current_basis(&mut transaction, context, &plan.proposal).await?;
    if current_basis.digest != plan.proposal.state_basis.digest {
        transaction.commit().await.map_err(store_unavailable)?;
        return Ok(CommitStoreOutcome::Stale(current_basis));
    }
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1",
    )
    .bind(context.tenant_id().as_str())
    .fetch_one(&mut *transaction)
    .await
    .map_err(store_unavailable)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;
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

    for (ordinal, draft) in plan.effects.iter().enumerate() {
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
        .bind(context.tenant_id().as_str())
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
        .bind(next_sequence)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let payload = serde_json::json!({
            "actionId": plan.proposal.action_id.as_str(),
            "claimId": draft.claim_id.as_str(),
            "proposalId": plan.proposal.proposal_id.as_str()
        });
        sqlx::query(
            "INSERT INTO projection_outbox
                (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
             VALUES ($1, $2, $3, 'ClaimRecorded', 1, $4)",
        )
        .bind(context.tenant_id().as_str())
        .bind(next_sequence)
        .bind(i32::try_from(ordinal).map_err(|_| {
            StoreError::Conflict("Action has too many effects for the outbox".to_owned())
        })?)
        .bind(payload)
        .execute(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
    }

    let commit_sequence = CommitSequence::new(i64_to_u64(next_sequence, "commit sequence")?)
        .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?;
    let receipt = CommitReceipt {
        action_id: plan.proposal.action_id.clone(),
        commit_sequence,
        definition: plan.proposal.definition.clone(),
        intent_digest: plan.proposal.intent_digest.clone(),
        operation_id: plan.proposal.operation_id.clone(),
        policy: plan.policy.clone(),
        proposal_id: plan.proposal.proposal_id.clone(),
        record_ids: plan
            .effects
            .iter()
            .map(|effect| effect.claim_id.clone())
            .collect(),
    };
    let receipt_json = serde_json::to_value(ReceiptDto::from(&receipt))
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    sqlx::query(
        "INSERT INTO action_operations
            (tenant_id, operation_id, proposal_id, intent_digest, commit_sequence, receipt)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(context.tenant_id().as_str())
    .bind(receipt.operation_id.as_str())
    .bind(receipt.proposal_id.as_str())
    .bind(receipt.intent_digest.as_str())
    .bind(next_sequence)
    .bind(receipt_json)
    .execute(&mut *transaction)
    .await
    .map_err(map_proposal_insert)?;
    sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(context.tenant_id().as_str())
    .bind(next_sequence)
    .execute(&mut *transaction)
    .await
    .map_err(store_unavailable)?;
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(CommitStoreOutcome::Committed(Box::new(receipt)))
}

async fn initialize_and_lock_head(
    transaction: &mut Transaction<'_, Postgres>,
    context: &zoen_core::ExecutionContext,
) -> Result<(), StoreError> {
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
    .map_err(store_unavailable)?;
    Ok(())
}

async fn load_current_basis(
    transaction: &mut Transaction<'_, Postgres>,
    context: &zoen_core::ExecutionContext,
    proposal: &ActionProposal,
) -> Result<StateBasis, StoreError> {
    let relations = proposal
        .state_basis
        .dependencies
        .iter()
        .map(|dependency| dependency.relation_id.as_str().to_owned())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        "SELECT claim_id, commit_sequence, entity_id, relation_id, source_digest
         FROM semantic_claims
         WHERE tenant_id = $1
           AND definition_id = $2
           AND definition_digest = $3
           AND definition_revision = $4
           AND entity_id = $5
           AND relation_id = ANY($6)
           AND (
                (valid_time_kind = 'instant' AND valid_from_micros = $7)
                OR (
                    valid_time_kind = 'interval'
                    AND valid_from_micros <= $7
                    AND valid_to_micros > $7
                )
           )
         ORDER BY relation_id, claim_id, commit_sequence",
    )
    .bind(context.tenant_id().as_str())
    .bind(proposal.definition.definition_id.as_str())
    .bind(proposal.definition.digest.as_str())
    .bind(u64_to_i64(
        proposal.definition.revision.get(),
        "definition revision",
    )?)
    .bind(proposal.resource_id.as_str())
    .bind(relations)
    .bind(proposal.valid_at.get())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let dependencies = rows
        .into_iter()
        .map(|row| {
            Ok(StateDependency {
                claim_id: ClaimId::parse(
                    row.try_get::<String, _>("claim_id")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                commit_sequence: CommitSequence::new(i64_to_u64(
                    row.try_get::<i64, _>("commit_sequence")
                        .map_err(store_unavailable)?,
                    "claim commit sequence",
                )?)
                .ok_or_else(|| StoreError::Corrupt("zero claim commit sequence".to_owned()))?,
                entity_id: zoen_core::EntityId::parse(
                    row.try_get::<String, _>("entity_id")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                relation_id: RelationId::parse(
                    row.try_get::<String, _>("relation_id")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                source_digest: EvidenceDigest::parse(
                    row.try_get::<String, _>("source_digest")
                        .map_err(store_unavailable)?,
                )
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            })
        })
        .collect::<Result<Vec<_>, StoreError>>()?;
    let digest = calculate_state_basis_digest(&dependencies).map_err(map_action_encoding_error)?;
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1",
    )
    .bind(context.tenant_id().as_str())
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;
    Ok(StateBasis {
        dependencies,
        digest,
        observed_commit_sequence: CommitSequence::new(i64_to_u64(head, "commit sequence")?)
            .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
    })
}

async fn load_proposal(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &zoen_core::TenantId,
    proposal_id: &ProposalId,
) -> Result<Option<ActionProposal>, StoreError> {
    let row = sqlx::query(
        "SELECT payload
         FROM action_proposals
         WHERE tenant_id = $1 AND proposal_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.map(|row| {
        let payload = row
            .try_get::<serde_json::Value, _>("payload")
            .map_err(store_unavailable)?;
        serde_json::from_value::<ProposalDto>(payload)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?
            .try_into()
    })
    .transpose()
}

async fn load_approval(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &zoen_core::TenantId,
    proposal_id: &ProposalId,
) -> Result<Option<ActionApproval>, StoreError> {
    let row = sqlx::query(
        "SELECT payload
         FROM action_approvals
         WHERE tenant_id = $1 AND proposal_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(proposal_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.map(|row| {
        let payload = row
            .try_get::<serde_json::Value, _>("payload")
            .map_err(store_unavailable)?;
        serde_json::from_value::<ApprovalDto>(payload)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?
            .try_into()
    })
    .transpose()
}

async fn load_operation(
    transaction: &mut Transaction<'_, Postgres>,
    tenant_id: &zoen_core::TenantId,
    operation_id: &OperationId,
) -> Result<Option<CommitReceipt>, StoreError> {
    let row = sqlx::query(
        "SELECT receipt
         FROM action_operations
         WHERE tenant_id = $1 AND operation_id = $2",
    )
    .bind(tenant_id.as_str())
    .bind(operation_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.map(|row| {
        let payload = row
            .try_get::<serde_json::Value, _>("receipt")
            .map_err(store_unavailable)?;
        serde_json::from_value::<ReceiptDto>(payload)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?
            .try_into()
    })
    .transpose()
}

fn map_proposal_insert(error: sqlx::Error) -> StoreError {
    if error
        .as_database_error()
        .is_some_and(|database| database.is_unique_violation())
    {
        StoreError::Conflict("Action identity already exists".to_owned())
    } else {
        store_unavailable(error)
    }
}

fn map_action_encoding_error(error: ActionError) -> StoreError {
    StoreError::Corrupt(error.to_string())
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DefinitionDto {
    definition_id: String,
    digest: String,
    revision: u64,
}

impl From<&DefinitionReference> for DefinitionDto {
    fn from(value: &DefinitionReference) -> Self {
        Self {
            definition_id: value.definition_id.as_str().to_owned(),
            digest: value.digest.as_str().to_owned(),
            revision: value.revision.get(),
        }
    }
}

impl TryFrom<DefinitionDto> for DefinitionReference {
    type Error = StoreError;

    fn try_from(value: DefinitionDto) -> Result<Self, Self::Error> {
        Ok(Self {
            definition_id: DefinitionId::parse(value.definition_id).map_err(corrupt)?,
            digest: DefinitionDigest::parse(value.digest).map_err(corrupt)?,
            revision: DefinitionRevisionNumber::new(value.revision)
                .ok_or_else(|| StoreError::Corrupt("zero definition revision".to_owned()))?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PolicyDto {
    determining_policies: Vec<String>,
    digest: String,
    policy_id: String,
    revision: u64,
}

impl From<&PolicyEvidence> for PolicyDto {
    fn from(value: &PolicyEvidence) -> Self {
        Self {
            determining_policies: value.determining_policies.clone(),
            digest: value.revision.digest.as_str().to_owned(),
            policy_id: value.revision.id.as_str().to_owned(),
            revision: value.revision.revision.get(),
        }
    }
}

impl TryFrom<PolicyDto> for PolicyEvidence {
    type Error = StoreError;

    fn try_from(value: PolicyDto) -> Result<Self, Self::Error> {
        Ok(Self {
            determining_policies: value.determining_policies,
            revision: PolicyRevision {
                digest: PolicyDigest::parse(value.digest).map_err(corrupt)?,
                id: PolicyId::parse(value.policy_id).map_err(corrupt)?,
                revision: PolicyRevisionNumber::new(value.revision)
                    .ok_or_else(|| StoreError::Corrupt("zero policy revision".to_owned()))?,
            },
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
enum AuthorityDto {
    AwaitingApproval { policy: PolicyDto },
    Ready { policy: PolicyDto },
}

impl From<&ProposalAuthority> for AuthorityDto {
    fn from(value: &ProposalAuthority) -> Self {
        match value {
            ProposalAuthority::AwaitingApproval(policy) => Self::AwaitingApproval {
                policy: PolicyDto::from(policy),
            },
            ProposalAuthority::Ready(policy) => Self::Ready {
                policy: PolicyDto::from(policy),
            },
        }
    }
}

impl TryFrom<AuthorityDto> for ProposalAuthority {
    type Error = StoreError;

    fn try_from(value: AuthorityDto) -> Result<Self, Self::Error> {
        match value {
            AuthorityDto::AwaitingApproval { policy } => {
                Ok(Self::AwaitingApproval(policy.try_into()?))
            }
            AuthorityDto::Ready { policy } => Ok(Self::Ready(policy.try_into()?)),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
enum ValueDto {
    Bool { value: bool },
    Decimal { value: String },
    Integer { value: String },
    Quantity { amount: String, unit: String },
    Text { value: String },
}

impl From<&ExactValue> for ValueDto {
    fn from(value: &ExactValue) -> Self {
        match value {
            ExactValue::Bool(value) => Self::Bool { value: *value },
            ExactValue::Decimal(value) => Self::Decimal {
                value: value.as_str().to_owned(),
            },
            ExactValue::Integer(value) => Self::Integer {
                value: value.as_str().to_owned(),
            },
            ExactValue::Quantity { amount, unit } => Self::Quantity {
                amount: amount.as_str().to_owned(),
                unit: unit.as_str().to_owned(),
            },
            ExactValue::Text(value) => Self::Text {
                value: value.clone(),
            },
        }
    }
}

impl TryFrom<ValueDto> for ExactValue {
    type Error = StoreError;

    fn try_from(value: ValueDto) -> Result<Self, Self::Error> {
        match value {
            ValueDto::Bool { value } => Ok(Self::Bool(value)),
            ValueDto::Decimal { value } => ExactDecimal::parse(value)
                .map(Self::Decimal)
                .map_err(corrupt),
            ValueDto::Integer { value } => ExactInteger::parse(value)
                .map(Self::Integer)
                .map_err(corrupt),
            ValueDto::Quantity { amount, unit } => Ok(Self::Quantity {
                amount: ExactDecimal::parse(amount).map_err(corrupt)?,
                unit: UnitId::parse(unit).map_err(corrupt)?,
            }),
            ValueDto::Text { value } => Ok(Self::Text(value)),
        }
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct InputDto {
    input_id: String,
    value: ValueDto,
}

impl From<&ActionInput> for InputDto {
    fn from(value: &ActionInput) -> Self {
        Self {
            input_id: value.id.as_str().to_owned(),
            value: ValueDto::from(&value.value),
        }
    }
}

impl TryFrom<InputDto> for ActionInput {
    type Error = StoreError;

    fn try_from(value: InputDto) -> Result<Self, Self::Error> {
        Ok(Self {
            id: InputId::parse(value.input_id).map_err(corrupt)?,
            value: value.value.try_into()?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateDependencyDto {
    claim_id: String,
    commit_sequence: u64,
    entity_id: String,
    relation_id: String,
    source_digest: String,
}

impl From<&StateDependency> for StateDependencyDto {
    fn from(value: &StateDependency) -> Self {
        Self {
            claim_id: value.claim_id.as_str().to_owned(),
            commit_sequence: value.commit_sequence.get(),
            entity_id: value.entity_id.as_str().to_owned(),
            relation_id: value.relation_id.as_str().to_owned(),
            source_digest: value.source_digest.as_str().to_owned(),
        }
    }
}

impl TryFrom<StateDependencyDto> for StateDependency {
    type Error = StoreError;

    fn try_from(value: StateDependencyDto) -> Result<Self, Self::Error> {
        Ok(Self {
            claim_id: ClaimId::parse(value.claim_id).map_err(corrupt)?,
            commit_sequence: CommitSequence::new(value.commit_sequence)
                .ok_or_else(|| StoreError::Corrupt("zero dependency commit".to_owned()))?,
            entity_id: zoen_core::EntityId::parse(value.entity_id).map_err(corrupt)?,
            relation_id: RelationId::parse(value.relation_id).map_err(corrupt)?,
            source_digest: EvidenceDigest::parse(value.source_digest).map_err(corrupt)?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StateBasisDto {
    dependencies: Vec<StateDependencyDto>,
    digest: String,
    observed_commit_sequence: u64,
}

impl From<&StateBasis> for StateBasisDto {
    fn from(value: &StateBasis) -> Self {
        Self {
            dependencies: value
                .dependencies
                .iter()
                .map(StateDependencyDto::from)
                .collect(),
            digest: value.digest.as_str().to_owned(),
            observed_commit_sequence: value.observed_commit_sequence.get(),
        }
    }
}

impl TryFrom<StateBasisDto> for StateBasis {
    type Error = StoreError;

    fn try_from(value: StateBasisDto) -> Result<Self, Self::Error> {
        Ok(Self {
            dependencies: value
                .dependencies
                .into_iter()
                .map(StateDependency::try_from)
                .collect::<Result<_, _>>()?,
            digest: StateBasisDigest::parse(value.digest).map_err(corrupt)?,
            observed_commit_sequence: CommitSequence::new(value.observed_commit_sequence)
                .ok_or_else(|| StoreError::Corrupt("zero observed commit".to_owned()))?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProposalDto {
    action_id: String,
    authority: AuthorityDto,
    definition: DefinitionDto,
    expires_at: i64,
    inputs: Vec<InputDto>,
    intent_digest: String,
    operation_id: String,
    proposal_id: String,
    proposed_at: i64,
    proposed_by: String,
    resource_id: String,
    state_basis: StateBasisDto,
    valid_at: i64,
}

impl From<&ActionProposal> for ProposalDto {
    fn from(value: &ActionProposal) -> Self {
        Self {
            action_id: value.action_id.as_str().to_owned(),
            authority: AuthorityDto::from(&value.authority),
            definition: DefinitionDto::from(&value.definition),
            expires_at: value.expires_at.get(),
            inputs: value.inputs.iter().map(InputDto::from).collect(),
            intent_digest: value.intent_digest.as_str().to_owned(),
            operation_id: value.operation_id.as_str().to_owned(),
            proposal_id: value.proposal_id.as_str().to_owned(),
            proposed_at: value.proposed_at.get(),
            proposed_by: value.proposed_by.as_str().to_owned(),
            resource_id: value.resource_id.as_str().to_owned(),
            state_basis: StateBasisDto::from(&value.state_basis),
            valid_at: value.valid_at.get(),
        }
    }
}

impl TryFrom<ProposalDto> for ActionProposal {
    type Error = StoreError;

    fn try_from(value: ProposalDto) -> Result<Self, Self::Error> {
        Ok(Self {
            action_id: ActionId::parse(value.action_id).map_err(corrupt)?,
            authority: value.authority.try_into()?,
            definition: value.definition.try_into()?,
            expires_at: TimestampMicros::new(value.expires_at),
            inputs: value
                .inputs
                .into_iter()
                .map(ActionInput::try_from)
                .collect::<Result<_, _>>()?,
            intent_digest: IntentDigest::parse(value.intent_digest).map_err(corrupt)?,
            operation_id: OperationId::parse(value.operation_id).map_err(corrupt)?,
            proposal_id: ProposalId::parse(value.proposal_id).map_err(corrupt)?,
            proposed_at: TimestampMicros::new(value.proposed_at),
            proposed_by: ActorId::parse(value.proposed_by).map_err(corrupt)?,
            resource_id: ResourceId::parse(value.resource_id).map_err(corrupt)?,
            state_basis: value.state_basis.try_into()?,
            valid_at: TimestampMicros::new(value.valid_at),
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalDto {
    approval_id: String,
    approved_at: i64,
    approved_by: String,
    expires_at: i64,
    policy: PolicyDto,
    proposal_id: String,
}

impl From<&ActionApproval> for ApprovalDto {
    fn from(value: &ActionApproval) -> Self {
        Self {
            approval_id: value.approval_id.as_str().to_owned(),
            approved_at: value.approved_at.get(),
            approved_by: value.approved_by.as_str().to_owned(),
            expires_at: value.expires_at.get(),
            policy: PolicyDto::from(&value.policy),
            proposal_id: value.proposal_id.as_str().to_owned(),
        }
    }
}

impl TryFrom<ApprovalDto> for ActionApproval {
    type Error = StoreError;

    fn try_from(value: ApprovalDto) -> Result<Self, Self::Error> {
        Ok(Self {
            approval_id: ApprovalId::parse(value.approval_id).map_err(corrupt)?,
            approved_at: TimestampMicros::new(value.approved_at),
            approved_by: ActorId::parse(value.approved_by).map_err(corrupt)?,
            expires_at: TimestampMicros::new(value.expires_at),
            policy: value.policy.try_into()?,
            proposal_id: ProposalId::parse(value.proposal_id).map_err(corrupt)?,
        })
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptDto {
    action_id: String,
    commit_sequence: u64,
    definition: DefinitionDto,
    intent_digest: String,
    operation_id: String,
    policy: PolicyDto,
    proposal_id: String,
    record_ids: Vec<String>,
}

impl From<&CommitReceipt> for ReceiptDto {
    fn from(value: &CommitReceipt) -> Self {
        Self {
            action_id: value.action_id.as_str().to_owned(),
            commit_sequence: value.commit_sequence.get(),
            definition: DefinitionDto::from(&value.definition),
            intent_digest: value.intent_digest.as_str().to_owned(),
            operation_id: value.operation_id.as_str().to_owned(),
            policy: PolicyDto::from(&value.policy),
            proposal_id: value.proposal_id.as_str().to_owned(),
            record_ids: value
                .record_ids
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect(),
        }
    }
}

impl TryFrom<ReceiptDto> for CommitReceipt {
    type Error = StoreError;

    fn try_from(value: ReceiptDto) -> Result<Self, Self::Error> {
        Ok(Self {
            action_id: ActionId::parse(value.action_id).map_err(corrupt)?,
            commit_sequence: CommitSequence::new(value.commit_sequence)
                .ok_or_else(|| StoreError::Corrupt("zero receipt commit".to_owned()))?,
            definition: value.definition.try_into()?,
            intent_digest: IntentDigest::parse(value.intent_digest).map_err(corrupt)?,
            operation_id: OperationId::parse(value.operation_id).map_err(corrupt)?,
            policy: value.policy.try_into()?,
            proposal_id: ProposalId::parse(value.proposal_id).map_err(corrupt)?,
            record_ids: value
                .record_ids
                .into_iter()
                .map(|id| ClaimId::parse(id).map_err(corrupt))
                .collect::<Result<_, _>>()?,
        })
    }
}

fn corrupt(error: impl Display) -> StoreError {
    StoreError::Corrupt(error.to_string())
}
