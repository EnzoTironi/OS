use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ClaimId, DecisionReference, DefinitionRevision, EffectDispatchEvidence, EffectDispatchOutcome,
    EffectRequestId, EvidenceClaim, ExecutionContext, ExplanationTarget, MigrationOrigin,
    MigrationRuleId, MigrationRuleKind, OperationId, ProposalId,
};
use zoen_engine::{
    ActionHistorySnapshot, ClaimHistorySnapshot, EffectHistorySnapshot, HistorySnapshot,
    MigrationHistorySnapshot, StoreError,
};

use crate::{
    action_store::{load_approval, load_operation, load_proposal},
    effect_store::load_snapshot,
    row_to_claim, row_to_revision, set_tenant, store_unavailable,
};

enum ClaimActionOwner {
    Operation(OperationId),
    Proposal(ProposalId),
}

pub(crate) async fn load(
    pool: &PgPool,
    context: &ExecutionContext,
    target: &ExplanationTarget,
) -> Result<HistorySnapshot, StoreError> {
    let mut transaction = pool.begin().await.map_err(store_unavailable)?;
    set_tenant(&mut transaction, context.tenant_id()).await?;
    let snapshot = match target {
        ExplanationTarget::Operation(operation_id) => {
            load_action_by_operation(&mut transaction, context, operation_id).await?
        }
        ExplanationTarget::EffectRequest(effect_request_id) => {
            let operation_id =
                operation_for_effect(&mut transaction, context, effect_request_id).await?;
            load_action_by_operation(&mut transaction, context, &operation_id).await?
        }
        ExplanationTarget::Decision(DecisionReference::Proposal(proposal_id)) => {
            load_action_by_proposal(&mut transaction, context, proposal_id).await?
        }
        ExplanationTarget::Claim(claim_id) => {
            match action_for_claim(&mut transaction, context, claim_id).await? {
                Some(ClaimActionOwner::Operation(operation_id)) => {
                    load_action_by_operation(&mut transaction, context, &operation_id).await?
                }
                Some(ClaimActionOwner::Proposal(proposal_id)) => {
                    load_action_by_proposal(&mut transaction, context, &proposal_id).await?
                }
                None => {
                    let claim = load_claim(&mut transaction, context, claim_id)
                        .await?
                        .ok_or(StoreError::NotFound)?;
                    let definition =
                        load_definition(&mut transaction, context, &claim.draft.definition).await?;
                    let migration = load_migration(&mut transaction, context, claim_id).await?;
                    HistorySnapshot::Claim(Box::new(ClaimHistorySnapshot {
                        claim,
                        definition,
                        migration,
                    }))
                }
            }
        }
    };
    transaction.commit().await.map_err(store_unavailable)?;
    Ok(snapshot)
}

async fn load_action_by_operation(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    operation_id: &OperationId,
) -> Result<HistorySnapshot, StoreError> {
    let commit = load_operation(transaction, context.tenant_id(), operation_id)
        .await?
        .ok_or(StoreError::NotFound)?;
    load_action(
        transaction,
        context,
        commit.proposal_id.clone(),
        Some(commit),
    )
    .await
}

async fn load_action_by_proposal(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    proposal_id: &ProposalId,
) -> Result<HistorySnapshot, StoreError> {
    let operation_id = sqlx::query_scalar::<_, String>(
        "SELECT operation_id
         FROM action_operations
         WHERE tenant_id = $1 AND proposal_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(proposal_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .map(OperationId::parse)
    .transpose()
    .map_err(corrupt)?;
    let commit = match operation_id {
        Some(operation_id) => {
            load_operation(transaction, context.tenant_id(), &operation_id).await?
        }
        None => None,
    };
    load_action(transaction, context, proposal_id.clone(), commit).await
}

async fn load_action(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    proposal_id: ProposalId,
    commit: Option<zoen_core::CommitReceipt>,
) -> Result<HistorySnapshot, StoreError> {
    let proposal = load_proposal(transaction, context.tenant_id(), &proposal_id)
        .await?
        .ok_or(StoreError::NotFound)?;
    let approval = load_approval(transaction, context.tenant_id(), &proposal_id).await?;
    let definition = load_definition(transaction, context, &proposal.definition).await?;
    let proposal_claim_ids = proposal
        .state_basis
        .dependencies
        .iter()
        .map(|dependency| dependency.claim_id.clone())
        .collect::<Vec<_>>();
    let proposal_claims = load_claims(transaction, context, &proposal_claim_ids).await?;

    let mut commit_claim_ids = Vec::new();
    if let Some(receipt) = &commit {
        commit_claim_ids.extend(receipt.record_ids.iter().cloned());
        if let Some(state_basis) = &receipt.commit_state_basis {
            commit_claim_ids.extend(
                state_basis
                    .dependencies
                    .iter()
                    .map(|dependency| dependency.claim_id.clone()),
            );
        }
    }
    commit_claim_ids.sort();
    commit_claim_ids.dedup();
    let commit_claims = load_claims(transaction, context, &commit_claim_ids).await?;

    let mut effects = Vec::new();
    if let Some(receipt) = &commit {
        for effect_request_id in &receipt.effect_request_ids {
            let snapshot = match load_snapshot(transaction, context, effect_request_id).await {
                Ok(snapshot) => snapshot,
                Err(StoreError::NotFound) => continue,
                Err(error) => return Err(error),
            };
            let dispatches = load_dispatches(transaction, context, effect_request_id).await?;
            effects.push(EffectHistorySnapshot {
                dispatches,
                snapshot,
            });
        }
    }

    Ok(HistorySnapshot::Action(Box::new(ActionHistorySnapshot {
        approval,
        commit,
        commit_claims,
        definition,
        effects,
        proposal,
        proposal_claims,
    })))
}

async fn operation_for_effect(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
) -> Result<OperationId, StoreError> {
    let operation_id = sqlx::query_scalar::<_, String>(
        "SELECT operation_id
         FROM effect_requests
         WHERE tenant_id = $1 AND effect_request_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?;
    OperationId::parse(operation_id).map_err(corrupt)
}

async fn action_for_claim(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    claim_id: &ClaimId,
) -> Result<Option<ClaimActionOwner>, StoreError> {
    let row = sqlx::query(
        "SELECT owner_kind, owner_id
         FROM (
             SELECT 1 AS priority, 'operation' AS owner_kind, operation_id AS owner_id
             FROM action_operation_records
             WHERE tenant_id = $1 AND claim_id = $2
             UNION ALL
             SELECT 2 AS priority, 'operation' AS owner_kind, operation_id AS owner_id
             FROM action_operation_dependencies
             WHERE tenant_id = $1 AND claim_id = $2
             UNION ALL
             SELECT 3 AS priority, 'proposal' AS owner_kind, proposal_id AS owner_id
             FROM action_proposal_dependencies
             WHERE tenant_id = $1 AND claim_id = $2
         ) AS owners
         ORDER BY priority, owner_id
         LIMIT 1",
    )
    .bind(context.tenant_id().as_str())
    .bind(claim_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.map(|row| {
        let owner_kind = row
            .try_get::<String, _>("owner_kind")
            .map_err(store_unavailable)?;
        let owner_id = row
            .try_get::<String, _>("owner_id")
            .map_err(store_unavailable)?;
        match owner_kind.as_str() {
            "operation" => OperationId::parse(owner_id)
                .map(ClaimActionOwner::Operation)
                .map_err(corrupt),
            "proposal" => ProposalId::parse(owner_id)
                .map(ClaimActionOwner::Proposal)
                .map_err(corrupt),
            value => Err(StoreError::Corrupt(format!(
                "unknown claim Action owner: {value}"
            ))),
        }
    })
    .transpose()
}

async fn load_definition(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    reference: &zoen_core::DefinitionReference,
) -> Result<Option<DefinitionRevision>, StoreError> {
    let row = sqlx::query(
        "SELECT definition_id, revision, digest, canonical_json, commit_sequence
         FROM definition_revisions
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4",
    )
    .bind(context.tenant_id().as_str())
    .bind(reference.definition_id.as_str())
    .bind(reference.digest.as_str())
    .bind(
        i64::try_from(reference.revision.get())
            .map_err(|_| StoreError::Corrupt("definition revision exceeds BIGINT".to_owned()))?,
    )
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.as_ref().map(row_to_revision).transpose()
}

async fn load_claim(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    claim_id: &ClaimId,
) -> Result<Option<EvidenceClaim>, StoreError> {
    let row = sqlx::query(
        "SELECT claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence,
                observed_at_micros, ingested_at_micros
         FROM semantic_claims
         WHERE tenant_id = $1 AND claim_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(claim_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    row.as_ref().map(row_to_claim).transpose()
}

async fn load_migration(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    claim_id: &ClaimId,
) -> Result<Option<MigrationHistorySnapshot>, StoreError> {
    let row = sqlx::query(
        "SELECT operation_id, rule_id, rule_kind
         FROM definition_migration_records
         WHERE tenant_id = $1 AND target_claim_id = $2",
    )
    .bind(context.tenant_id().as_str())
    .bind(claim_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let operation_id = OperationId::parse(
        row.try_get::<String, _>("operation_id")
            .map_err(store_unavailable)?,
    )
    .map_err(corrupt)?;
    let rule_id = MigrationRuleId::parse(
        row.try_get::<String, _>("rule_id")
            .map_err(store_unavailable)?,
    )
    .map_err(corrupt)?;
    let rule_kind = row
        .try_get::<String, _>("rule_kind")
        .map_err(store_unavailable)?;
    let kind = MigrationRuleKind::parse(&rule_kind)
        .ok_or_else(|| StoreError::Corrupt(format!("unknown migration rule kind: {rule_kind}")))?;
    let source_claim_ids = sqlx::query_scalar::<_, String>(
        "SELECT source_claim_id
         FROM definition_migration_lineage
         WHERE tenant_id = $1 AND operation_id = $2 AND target_claim_id = $3
         ORDER BY source_claim_id",
    )
    .bind(context.tenant_id().as_str())
    .bind(operation_id.as_str())
    .bind(claim_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .into_iter()
    .map(ClaimId::parse)
    .collect::<Result<Vec<_>, _>>()
    .map_err(corrupt)?;
    let source_claims = load_claims(transaction, context, &source_claim_ids).await?;
    Ok(Some(MigrationHistorySnapshot {
        origin: MigrationOrigin {
            kind,
            operation_id,
            rule_id,
            source_claim_ids,
        },
        source_claims,
    }))
}

async fn load_claims(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    claim_ids: &[ClaimId],
) -> Result<Vec<EvidenceClaim>, StoreError> {
    if claim_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = claim_ids
        .iter()
        .map(|claim_id| claim_id.as_str().to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(
        "SELECT claim_id, definition_id, definition_digest, definition_revision,
                entity_id, relation_id, value_kind, value_text, value_unit,
                valid_time_kind, valid_from_micros, valid_to_micros,
                source_id, source_digest, source_ref, commit_sequence,
                observed_at_micros, ingested_at_micros
         FROM semantic_claims
         WHERE tenant_id = $1 AND claim_id = ANY($2::text[])
         ORDER BY claim_id",
    )
    .bind(context.tenant_id().as_str())
    .bind(ids)
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter().map(row_to_claim).collect()
}

async fn load_dispatches(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    effect_request_id: &EffectRequestId,
) -> Result<Vec<EffectDispatchEvidence>, StoreError> {
    let rows = sqlx::query(
        "SELECT attempt_number, outcome, scheduler_invocation_id, error_message
         FROM effect_dispatch_attempts
         WHERE tenant_id = $1 AND effect_request_id = $2
         ORDER BY attempt_number",
    )
    .bind(context.tenant_id().as_str())
    .bind(effect_request_id.as_str())
    .fetch_all(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    rows.iter()
        .map(|row| {
            let attempt_number = row
                .try_get::<i32, _>("attempt_number")
                .map_err(store_unavailable)?;
            let outcome = match row
                .try_get::<String, _>("outcome")
                .map_err(store_unavailable)?
                .as_str()
            {
                "accepted" => EffectDispatchOutcome::Accepted,
                "invalid_response" => EffectDispatchOutcome::InvalidResponse,
                "rejected" => EffectDispatchOutcome::Rejected,
                "scheduler_unavailable" => EffectDispatchOutcome::SchedulerUnavailable,
                value => {
                    return Err(StoreError::Corrupt(format!(
                        "unknown effect dispatch outcome: {value}"
                    )));
                }
            };
            Ok(EffectDispatchEvidence {
                attempt_number: u32::try_from(attempt_number).map_err(corrupt)?,
                error: row
                    .try_get::<Option<String>, _>("error_message")
                    .map_err(store_unavailable)?,
                outcome,
                scheduler_invocation_id: row
                    .try_get::<Option<String>, _>("scheduler_invocation_id")
                    .map_err(store_unavailable)?,
            })
        })
        .collect()
}

fn corrupt(error: impl std::fmt::Display) -> StoreError {
    StoreError::Corrupt(error.to_string())
}
