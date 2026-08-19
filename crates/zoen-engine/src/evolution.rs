use std::collections::{BTreeMap, BTreeSet};

use zoen_core::{
    ActionDefinition, CanonicalDefinition, ComputationDefinition, DefinitionChange,
    DefinitionChangeKind, DefinitionElementKind, DefinitionImpact, DefinitionImpactArea,
    DefinitionReference, DefinitionRevision, EvolutionClassification, EvolutionPlan,
    RelationDefinition, RelationTarget, expression_relations,
};

pub(crate) fn plan(
    from_revision: &DefinitionRevision,
    from: &CanonicalDefinition,
    to_revision: &DefinitionRevision,
    to: &CanonicalDefinition,
) -> EvolutionPlan {
    let types = analyze_family(
        DefinitionElementKind::Type,
        &from.types,
        &to.types,
        |definition| definition.id.as_str(),
    );
    let relations = analyze_family(
        DefinitionElementKind::Relation,
        &from.relations,
        &to.relations,
        |definition| definition.id.as_str(),
    );
    let computations = analyze_family(
        DefinitionElementKind::Computation,
        &from.computations,
        &to.computations,
        |definition| definition.id.as_str(),
    );
    let actions = analyze_family(
        DefinitionElementKind::Action,
        &from.actions,
        &to.actions,
        |definition| definition.id.as_str(),
    );

    let changed_relations = relations.affected.clone();
    let type_dependencies =
        relation_type_dependencies(&from.relations, &to.relations, &changed_relations);
    let computation_dependencies =
        computation_relation_dependencies(&to.computations, &changed_relations);
    let action_dependencies = action_relation_dependencies(&to.actions, &changed_relations);

    let affected_types = union(&types.affected, &type_dependencies);
    let affected_computations = union(&computations.affected, &computation_dependencies);
    let affected_actions = union(&actions.affected, &action_dependencies);
    let unaffected_types = without(&types.unaffected, &affected_types);
    let unaffected_computations = without(&computations.unaffected, &affected_computations);
    let unaffected_actions = without(&actions.unaffected, &affected_actions);

    let mut changes = Vec::new();
    changes.extend(types.changes);
    changes.extend(relations.changes);
    changes.extend(computations.changes);
    changes.extend(actions.changes);
    changes.sort_by(|left, right| {
        left.element
            .cmp(&right.element)
            .then_with(|| left.id.cmp(&right.id))
    });

    let classification = classify(from, to, &changes, &action_dependencies);
    let changed_query_elements = union(&relations.affected, &affected_computations);
    let unchanged_query_elements = union(&relations.unaffected, &unaffected_computations);
    let changed_generated_elements = union(
        &union(&affected_types, &relations.affected),
        &union(&affected_computations, &affected_actions),
    );
    let unchanged_generated_elements = union(
        &union(&unaffected_types, &relations.unaffected),
        &union(&unaffected_computations, &unaffected_actions),
    );
    let changed_existing_elements = changes
        .iter()
        .filter(|change| change.change != DefinitionChangeKind::Added)
        .map(|change| change.id.clone())
        .collect::<BTreeSet<_>>();
    let unchanged_record_elements = unchanged_record_elements(from, &changes);

    EvolutionPlan {
        changes,
        classification,
        from: reference(from_revision),
        impacts: vec![
            DefinitionImpact {
                affected: affected_types.into_iter().collect(),
                area: DefinitionImpactArea::Types,
                rationale: "Type declarations are affected when they change or when a changed Relation changes their semantic neighborhood.".to_owned(),
                unaffected: unaffected_types.into_iter().collect(),
            },
            DefinitionImpact {
                affected: relations.affected.into_iter().collect(),
                area: DefinitionImpactArea::Relations,
                rationale: "The affected set contains every added, removed, or modified Relation after exact semantic comparison.".to_owned(),
                unaffected: relations.unaffected.into_iter().collect(),
            },
            DefinitionImpact {
                affected: affected_computations.into_iter().collect(),
                area: DefinitionImpactArea::Computations,
                rationale: "Computations are affected by their own semantic diff and by changed Relations referenced by their expressions.".to_owned(),
                unaffected: unaffected_computations.into_iter().collect(),
            },
            DefinitionImpact {
                affected: affected_actions.into_iter().collect(),
                area: DefinitionImpactArea::Actions,
                rationale: "Actions are affected by contract changes and by changed Relations referenced by preconditions or effects; unchanged contracts remain explicit.".to_owned(),
                unaffected: unaffected_actions.into_iter().collect(),
            },
            DefinitionImpact {
                affected: Vec::new(),
                area: DefinitionImpactArea::DomainPackageDependencies,
                rationale: "Neither revision contains package dependency metadata because the canonical v1 contract has no package dependency field, so there is no dependency edge to invalidate.".to_owned(),
                unaffected: vec!["canonical-v1-package-dependency-set".to_owned()],
            },
            DefinitionImpact {
                affected: changed_existing_elements.into_iter().collect(),
                area: DefinitionImpactArea::StoredSemanticRecords,
                rationale: stored_record_rationale(classification),
                unaffected: unchanged_record_elements,
            },
            DefinitionImpact {
                affected: changed_query_elements.into_iter().collect(),
                area: DefinitionImpactArea::QueryAndMaterializationArtifacts,
                rationale: "Query and materialization artifacts must add plans or metadata for affected Relations and Computations; artifacts over unchanged elements keep their prior meaning.".to_owned(),
                unaffected: unchanged_query_elements.into_iter().collect(),
            },
            DefinitionImpact {
                affected: changed_generated_elements.into_iter().collect(),
                area: DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts,
                rationale: "Definition-derived catalogs and surfaces must expose affected elements under the target revision; the Protobuf SDK contract itself is unchanged.".to_owned(),
                unaffected: unchanged_generated_elements.into_iter().collect(),
            },
            DefinitionImpact {
                affected: to.actions.iter().map(|action| action.id.as_str().to_owned()).collect(),
                area: DefinitionImpactArea::PolicyAndWasmReferences,
                rationale: "Canonical v1 contains no Wasm references. Digest-scoped Cedar bindings for target-revision Actions must be installed even when the Action contract is unchanged.".to_owned(),
                unaffected: Vec::new(),
            },
        ],
        to: reference(to_revision),
    }
}

struct FamilyAnalysis {
    affected: BTreeSet<String>,
    changes: Vec<DefinitionChange>,
    unaffected: BTreeSet<String>,
}

fn analyze_family<T: Eq>(
    element: DefinitionElementKind,
    from: &[T],
    to: &[T],
    id: impl Fn(&T) -> &str,
) -> FamilyAnalysis {
    let from_by_id = from
        .iter()
        .map(|definition| (id(definition).to_owned(), definition))
        .collect::<BTreeMap<_, _>>();
    let to_by_id = to
        .iter()
        .map(|definition| (id(definition).to_owned(), definition))
        .collect::<BTreeMap<_, _>>();
    let ids = from_by_id
        .keys()
        .chain(to_by_id.keys())
        .cloned()
        .collect::<BTreeSet<_>>();
    let mut affected = BTreeSet::new();
    let mut changes = Vec::new();
    let mut unaffected = BTreeSet::new();

    for element_id in ids {
        let change = match (from_by_id.get(&element_id), to_by_id.get(&element_id)) {
            (None, Some(_)) => Some(DefinitionChangeKind::Added),
            (Some(_), None) => Some(DefinitionChangeKind::Removed),
            (Some(from), Some(to)) if from != to => Some(DefinitionChangeKind::Modified),
            (Some(_), Some(_)) => None,
            (None, None) => None,
        };
        if let Some(change) = change {
            affected.insert(element_id.clone());
            changes.push(DefinitionChange {
                change,
                element,
                id: element_id,
            });
        } else {
            unaffected.insert(element_id);
        }
    }

    FamilyAnalysis {
        affected,
        changes,
        unaffected,
    }
}

fn classify(
    from: &CanonicalDefinition,
    to: &CanonicalDefinition,
    changes: &[DefinitionChange],
    action_dependencies: &BTreeSet<String>,
) -> EvolutionClassification {
    if from.id != to.id || from.schema != to.schema || to.revision <= from.revision {
        return EvolutionClassification::Forbidden;
    }
    if !action_dependencies.is_empty()
        || changes.iter().any(|change| {
            change.element == DefinitionElementKind::Action
                && change.change != DefinitionChangeKind::Added
        })
    {
        return EvolutionClassification::Breaking;
    }
    if changes
        .iter()
        .any(|change| change.change != DefinitionChangeKind::Added)
    {
        return EvolutionClassification::RequiresMigration;
    }
    EvolutionClassification::Compatible
}

fn relation_type_dependencies(
    from: &[RelationDefinition],
    to: &[RelationDefinition],
    changed_relations: &BTreeSet<String>,
) -> BTreeSet<String> {
    from.iter()
        .chain(to)
        .filter(|relation| changed_relations.contains(relation.id.as_str()))
        .flat_map(|relation| {
            let mut types = vec![relation.source_type.as_str().to_owned()];
            if let RelationTarget::Type(target) = &relation.target {
                types.push(target.as_str().to_owned());
            }
            types
        })
        .collect()
}

fn computation_relation_dependencies(
    computations: &[ComputationDefinition],
    changed_relations: &BTreeSet<String>,
) -> BTreeSet<String> {
    computations
        .iter()
        .filter(|computation| {
            expression_relations(&computation.expression)
                .iter()
                .any(|relation| changed_relations.contains(relation.as_str()))
        })
        .map(|computation| computation.id.as_str().to_owned())
        .collect()
}

fn action_relation_dependencies(
    actions: &[ActionDefinition],
    changed_relations: &BTreeSet<String>,
) -> BTreeSet<String> {
    actions
        .iter()
        .filter(|action| {
            let precondition_affected = expression_relations(&action.precondition)
                .iter()
                .any(|relation| changed_relations.contains(relation.as_str()));
            let effect_affected = action.effects.iter().any(|effect| {
                changed_relations.contains(effect.relation_id.as_str())
                    || expression_relations(&effect.value)
                        .iter()
                        .any(|relation| changed_relations.contains(relation.as_str()))
            });
            precondition_affected || effect_affected
        })
        .map(|action| action.id.as_str().to_owned())
        .collect()
}

fn unchanged_record_elements(
    definition: &CanonicalDefinition,
    changes: &[DefinitionChange],
) -> Vec<String> {
    let changed = changes
        .iter()
        .filter(|change| change.change != DefinitionChangeKind::Added)
        .map(|change| change.id.as_str())
        .collect::<BTreeSet<_>>();
    definition
        .types
        .iter()
        .map(|definition| definition.id.as_str())
        .chain(
            definition
                .relations
                .iter()
                .map(|definition| definition.id.as_str()),
        )
        .filter(|id| !changed.contains(id))
        .map(str::to_owned)
        .collect()
}

fn stored_record_rationale(classification: EvolutionClassification) -> String {
    match classification {
        EvolutionClassification::Compatible => "No existing Type, Relation, Computation, or Action meaning changed. Stored records remain pinned to their producing revision, and no migration is required.".to_owned(),
        EvolutionClassification::RequiresMigration => "Modified or removed semantic elements can affect stored records. A migration plan is required before activation can claim equivalent new-work meaning.".to_owned(),
        EvolutionClassification::Breaking => "Action meaning or an Action dependency changed. Existing records stay pinned, and future work requires the breaking-change process.".to_owned(),
        EvolutionClassification::Forbidden => "The revision pair violates an evolution invariant and cannot be activated through this plan.".to_owned(),
    }
}

fn reference(revision: &DefinitionRevision) -> DefinitionReference {
    DefinitionReference {
        definition_id: revision.definition_id.clone(),
        digest: revision.digest.clone(),
        revision: revision.revision,
    }
}

fn union(left: &BTreeSet<String>, right: &BTreeSet<String>) -> BTreeSet<String> {
    left.union(right).cloned().collect()
}

fn without(values: &BTreeSet<String>, excluded: &BTreeSet<String>) -> BTreeSet<String> {
    values.difference(excluded).cloned().collect()
}

#[cfg(test)]
mod tests {
    use zoen_core::{
        ActionDefinition, ActionEffect, ActionId, CanonicalDefinition, CanonicalJson, Cardinality,
        CommitSequence, ComputationDefinition, ComputationId, DefinitionDigest, DefinitionId,
        DefinitionImpactArea, DefinitionRevision, DefinitionRevisionNumber, DefinitionSchema,
        EvolutionClassification, ExactInteger, ExactValue, Expression, RelationDefinition,
        RelationId, RelationTarget, TypeDefinition, TypeId, ValueType,
    };

    use super::plan;

    #[test]
    fn compatible_addition_tracks_semantic_dependencies() {
        let from_definition = definition(1);
        let mut to_definition = definition(2);
        to_definition.relations.push(RelationDefinition {
            cardinality: Cardinality::One,
            id: RelationId::parse("inventory.reserved").expect("relation"),
            source_type: TypeId::parse("inventory.Item").expect("type"),
            target: RelationTarget::Value(ValueType::Integer),
        });
        to_definition.computations.push(ComputationDefinition {
            expression: Expression::Relation(
                RelationId::parse("inventory.reserved").expect("relation"),
            ),
            id: ComputationId::parse("inventory.availableToPromise").expect("computation"),
            inputs: Vec::new(),
            returns: ValueType::Integer,
        });

        let result = plan(
            &revision(1, "a"),
            &from_definition,
            &revision(2, "b"),
            &to_definition,
        );

        assert_eq!(result.classification, EvolutionClassification::Compatible);
        let relations = result
            .impacts
            .iter()
            .find(|impact| impact.area == DefinitionImpactArea::Relations)
            .expect("Relation impact");
        assert_eq!(relations.affected, ["inventory.reserved"]);
        let computations = result
            .impacts
            .iter()
            .find(|impact| impact.area == DefinitionImpactArea::Computations)
            .expect("Computation impact");
        assert_eq!(computations.affected, ["inventory.availableToPromise"]);
        let actions = result
            .impacts
            .iter()
            .find(|impact| impact.area == DefinitionImpactArea::Actions)
            .expect("Action impact");
        assert_eq!(actions.unaffected, ["inventory.replenish"]);
        let types = result
            .impacts
            .iter()
            .find(|impact| impact.area == DefinitionImpactArea::Types)
            .expect("Type impact");
        assert_eq!(types.affected, ["inventory.Item"]);
        assert!(!result.migration_required());
    }

    #[test]
    fn action_contract_change_is_breaking() {
        let from_definition = definition(1);
        let mut to_definition = definition(2);
        to_definition.actions[0].precondition = Expression::Literal(ExactValue::Bool(false));

        let result = plan(
            &revision(1, "a"),
            &from_definition,
            &revision(2, "b"),
            &to_definition,
        );

        assert_eq!(result.classification, EvolutionClassification::Breaking);
        assert!(result.migration_required());
    }

    fn definition(revision: u64) -> CanonicalDefinition {
        CanonicalDefinition {
            actions: vec![ActionDefinition {
                effects: vec![ActionEffect {
                    relation_id: RelationId::parse("inventory.level").expect("relation"),
                    value: Expression::Literal(ExactValue::Integer(
                        ExactInteger::parse("1").expect("integer"),
                    )),
                }],
                id: ActionId::parse("inventory.replenish").expect("action"),
                inputs: Vec::new(),
                precondition: Expression::Literal(ExactValue::Bool(true)),
            }],
            computations: Vec::new(),
            id: DefinitionId::parse("inventory.definition").expect("definition"),
            relations: vec![RelationDefinition {
                cardinality: Cardinality::One,
                id: RelationId::parse("inventory.level").expect("relation"),
                source_type: TypeId::parse("inventory.Item").expect("type"),
                target: RelationTarget::Value(ValueType::Integer),
            }],
            revision: DefinitionRevisionNumber::new(revision).expect("revision"),
            schema: DefinitionSchema::V1,
            types: vec![TypeDefinition {
                attributes: Vec::new(),
                id: TypeId::parse("inventory.Item").expect("type"),
            }],
        }
    }

    fn revision(number: u64, digest: &str) -> DefinitionRevision {
        DefinitionRevision {
            canonical_json: CanonicalJson::new("{}").expect("canonical JSON"),
            commit_sequence: CommitSequence::new(number).expect("commit sequence"),
            definition_id: DefinitionId::parse("inventory.definition").expect("definition"),
            digest: DefinitionDigest::parse(digest.repeat(64)).expect("digest"),
            revision: DefinitionRevisionNumber::new(number).expect("revision"),
        }
    }
}
