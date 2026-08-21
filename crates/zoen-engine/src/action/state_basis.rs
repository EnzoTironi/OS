use std::collections::{BTreeMap, BTreeSet};

use zoen_core::{
    ActionDefinition, ActionInput, CanonicalDefinition, Cardinality, EvidenceClaim, ExactValue,
    Expression, ExpressionEvaluationError, LineageDependency, LineageRole, PreconditionEvaluation,
    RelationId, SemanticValue, StateBasis, StateDependency, evaluate_expression,
    expression_relations,
};

use super::{ActionError, calculate_state_basis_digest, value_key};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SemanticClaim {
    pub dependency: LineageDependency,
    pub value: ExactValue,
}

impl From<EvidenceClaim> for SemanticClaim {
    fn from(claim: EvidenceClaim) -> Self {
        let draft = claim.draft;
        Self {
            dependency: LineageDependency {
                claim_id: draft.claim_id,
                commit_sequence: claim.commit_sequence,
                entity_id: draft.entity_id,
                migration: None,
                relation_id: draft.relation_id,
                role: LineageRole::Supporting,
                source_digest: draft.provenance.source_digest,
                source_id: draft.provenance.source_id,
                source_ref: draft.provenance.source_ref,
            },
            value: draft.value,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateSnapshot {
    pub observed_commit_sequence: zoen_core::CommitSequence,
    pub relations: BTreeMap<RelationId, Vec<SemanticValue>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateRead {
    pub basis: StateBasis,
    pub values: BTreeMap<RelationId, Vec<SemanticValue>>,
}

pub fn evaluate_action_state_basis(
    action: &ActionDefinition,
    definition: &CanonicalDefinition,
    inputs: &[ActionInput],
    snapshot: ActionStateSnapshot,
) -> Result<PreconditionEvaluation, ActionError> {
    let read = read_action_state_basis(action, definition, snapshot)?;
    let input_values = inputs
        .iter()
        .map(|input| (input.id.clone(), input.value.clone()))
        .collect::<BTreeMap<_, _>>();
    let evaluated = evaluate_expression(&action.precondition, &input_values, &read.values)
        .map_err(|error| ActionError::Evaluation(error.to_string()))?;
    match evaluated.as_slice() {
        [
            SemanticValue {
                value: ExactValue::Bool(true),
                ..
            },
        ] => Ok(PreconditionEvaluation::Satisfied(read.basis)),
        [
            SemanticValue {
                value: ExactValue::Bool(false),
                ..
            },
        ] => Ok(PreconditionEvaluation::Unsatisfied(read.basis)),
        _ => Err(ActionError::Evaluation(
            "Action precondition must produce exactly one boolean".to_owned(),
        )),
    }
}

pub fn read_action_state_basis(
    action: &ActionDefinition,
    definition: &CanonicalDefinition,
    snapshot: ActionStateSnapshot,
) -> Result<ActionStateRead, ActionError> {
    let mut values = BTreeMap::<RelationId, Vec<SemanticValue>>::new();
    let mut dependencies = Vec::new();
    let mut relation_ids = expression_relations(&action.precondition);
    relation_ids.extend(snapshot.relations.keys().cloned());
    for relation_id in relation_ids {
        let cardinality = definition
            .relations
            .iter()
            .find(|relation| relation.id == relation_id)
            .map(|relation| relation.cardinality)
            .ok_or_else(|| {
                ActionError::Definition(format!(
                    "definition has no relation: {}",
                    relation_id.as_str()
                ))
            })?;
        let relation_values = relation_values(
            snapshot
                .relations
                .get(&relation_id)
                .cloned()
                .unwrap_or_default(),
            cardinality,
        );
        dependencies.extend(
            relation_values
                .iter()
                .flat_map(|value| value.dependencies.iter())
                .cloned()
                .map(state_dependency),
        );
        values.insert(relation_id, relation_values);
    }
    sort_state_dependencies(&mut dependencies);
    dependencies.dedup();
    let digest = calculate_state_basis_digest(&dependencies)?;
    Ok(ActionStateRead {
        basis: StateBasis {
            dependencies,
            digest,
            observed_commit_sequence: snapshot.observed_commit_sequence,
        },
        values,
    })
}

pub fn evaluate_semantic_claims(
    expression: &Expression,
    claims: &[SemanticClaim],
    relation_role: LineageRole,
) -> Result<Vec<SemanticValue>, ExpressionEvaluationError> {
    let by_relation = claims_by_relation(claims, relation_role);
    let candidates = evaluate_expression(expression, &BTreeMap::new(), &by_relation)?;
    let mut values = candidates
        .into_iter()
        .map(|candidate| {
            let selected_claims = candidate
                .dependencies
                .iter()
                .map(|dependency| dependency.claim_id.as_str().to_owned())
                .collect::<BTreeSet<_>>();
            let selected_relations = candidate
                .dependencies
                .iter()
                .map(|dependency| dependency.relation_id.as_str().to_owned())
                .collect::<BTreeSet<_>>();
            let mut dependencies = candidate.dependencies;
            dependencies.extend(
                claims
                    .iter()
                    .filter(|claim| {
                        selected_relations.contains(claim.dependency.relation_id.as_str())
                            && !selected_claims.contains(claim.dependency.claim_id.as_str())
                    })
                    .map(|claim| claim.dependency(LineageRole::Rival)),
            );
            sort_lineage_dependencies(&mut dependencies);
            SemanticValue {
                dependencies,
                value: candidate.value,
            }
        })
        .collect::<Vec<_>>();
    sort_semantic_values(&mut values);
    Ok(values)
}

fn claims_by_relation(
    claims: &[SemanticClaim],
    relation_role: LineageRole,
) -> BTreeMap<RelationId, Vec<SemanticValue>> {
    let mut by_relation = BTreeMap::<RelationId, Vec<SemanticValue>>::new();
    for claim in claims {
        by_relation
            .entry(claim.dependency.relation_id.clone())
            .or_default()
            .push(SemanticValue {
                dependencies: vec![claim.dependency(relation_role)],
                value: claim.value.clone(),
            });
    }
    by_relation
}

impl SemanticClaim {
    fn dependency(&self, role: LineageRole) -> LineageDependency {
        let mut dependency = self.dependency.clone();
        dependency.role = role;
        dependency
    }
}

fn relation_values(values: Vec<SemanticValue>, cardinality: Cardinality) -> Vec<SemanticValue> {
    match cardinality {
        Cardinality::Many => values,
        Cardinality::One => values
            .into_iter()
            .max_by_key(latest_supporting_commit)
            .into_iter()
            .collect(),
    }
}

fn latest_supporting_commit(value: &SemanticValue) -> Option<zoen_core::CommitSequence> {
    value
        .dependencies
        .iter()
        .filter(|dependency| dependency.role == LineageRole::Supporting)
        .map(|dependency| dependency.commit_sequence)
        .max()
}

fn state_dependency(dependency: LineageDependency) -> StateDependency {
    StateDependency {
        claim_id: dependency.claim_id,
        commit_sequence: dependency.commit_sequence,
        entity_id: dependency.entity_id,
        relation_id: dependency.relation_id,
        role: dependency.role,
        source_digest: dependency.source_digest,
        source_id: dependency.source_id,
        source_ref: dependency.source_ref,
    }
}

fn sort_lineage_dependencies(dependencies: &mut [LineageDependency]) {
    dependencies.sort_by(|left, right| {
        (
            left.role,
            left.relation_id.as_str(),
            left.claim_id.as_str(),
            left.commit_sequence,
        )
            .cmp(&(
                right.role,
                right.relation_id.as_str(),
                right.claim_id.as_str(),
                right.commit_sequence,
            ))
    });
}

fn sort_semantic_values(values: &mut [SemanticValue]) {
    values.sort_by(|left, right| {
        value_key(&left.value)
            .cmp(&value_key(&right.value))
            .then_with(|| {
                left.dependencies
                    .iter()
                    .map(|dependency| dependency.claim_id.as_str())
                    .cmp(
                        right
                            .dependencies
                            .iter()
                            .map(|dependency| dependency.claim_id.as_str()),
                    )
            })
    });
}

fn sort_state_dependencies(dependencies: &mut [StateDependency]) {
    dependencies.sort_by(|left, right| {
        (
            left.role,
            left.relation_id.as_str(),
            left.claim_id.as_str(),
            left.commit_sequence,
        )
            .cmp(&(
                right.role,
                right.relation_id.as_str(),
                right.claim_id.as_str(),
                right.commit_sequence,
            ))
    });
}
