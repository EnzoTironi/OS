use std::collections::BTreeMap;

use sqlx::{Postgres, Transaction};
use zoen_core::{
    ActionProposal, CanonicalJson, EntityId, ExecutionContext, Expression, LineageRole, RelationId,
    SemanticValue, StateBasis, expression_relations,
};
use zoen_engine::{
    ActionStateSnapshot, SemanticClaim, StoreError, decode_canonical_definition,
    evaluate_semantic_claims, read_action_state_basis,
};

use crate::claim_store::load_in_transaction;
use crate::{PostgresClaimQuery, store_unavailable};

use super::{commit_sequence, corrupt};

pub(crate) async fn load_current(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    proposal: &ActionProposal,
    head: i64,
) -> Result<StateBasis, StoreError> {
    let canonical_json = sqlx::query_scalar::<_, String>(
        "SELECT canonical_json
         FROM definition_revisions
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4",
    )
    .bind(context.tenant_id().as_str())
    .bind(proposal.definition.definition_id.as_str())
    .bind(proposal.definition.digest.as_str())
    .bind(i64::try_from(proposal.definition.revision.get()).map_err(corrupt)?)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or_else(|| StoreError::Corrupt("proposal definition revision is missing".to_owned()))?;
    let canonical_json = CanonicalJson::new(canonical_json)
        .ok_or_else(|| StoreError::Corrupt("stored definition is empty".to_owned()))?;
    let definition = decode_canonical_definition(&canonical_json).map_err(corrupt)?;
    let action = definition
        .actions
        .iter()
        .find(|action| action.id == proposal.action_id)
        .ok_or_else(|| {
            StoreError::Corrupt(format!(
                "proposal definition has no Action: {}",
                proposal.action_id.as_str()
            ))
        })?;
    let relation_ids = expression_relations(&action.precondition);
    let cut = commit_sequence(head, "commit sequence")?;
    let claims = load_in_transaction(
        transaction,
        context,
        &PostgresClaimQuery {
            cut,
            definition: proposal.definition.clone(),
            entity_id: EntityId::parse(proposal.resource_id.as_str()).map_err(corrupt)?,
            relation_ids: relation_ids.clone(),
            valid_at: proposal.valid_at,
        },
    )
    .await?
    .into_iter()
    .map(SemanticClaim::from)
    .collect::<Vec<_>>();
    let mut relations = BTreeMap::<RelationId, Vec<SemanticValue>>::new();
    for relation_id in relation_ids {
        let values = evaluate_semantic_claims(
            &Expression::Relation(relation_id.clone()),
            &claims,
            LineageRole::Supporting,
        )
        .map_err(corrupt)?;
        relations.insert(relation_id, values);
    }
    read_action_state_basis(
        action,
        &definition,
        ActionStateSnapshot {
            observed_commit_sequence: cut,
            relations,
        },
    )
    .map(|read| read.basis)
    .map_err(corrupt)
}
