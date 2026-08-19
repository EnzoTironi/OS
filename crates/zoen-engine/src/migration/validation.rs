use std::collections::{BTreeMap, BTreeSet};

use zoen_core::{
    CanonicalDefinition, DefinitionChangeKind, DefinitionElementKind,
    DefinitionImpactApplicability, DefinitionImpactArea, EvolutionClassification, EvolutionPlan,
    IntentDigest, MigrationArtifactDependency, MigrationElement, MigrationObligationSource,
    MigrationPlan, MigrationRecipe, MigrationRule, MigrationRuleKind, RelationDefinition,
};

use super::MigrationError;

pub(super) fn build_plan(
    recipe: MigrationRecipe,
    assessment: &EvolutionPlan,
    from_definition: &CanonicalDefinition,
    to_definition: &CanonicalDefinition,
    assessment_digest: IntentDigest,
) -> Result<MigrationPlan, MigrationError> {
    validate_recipe_shape(&recipe)?;
    if recipe.definition_id != assessment.from.definition_id
        || recipe.definition_id != assessment.to.definition_id
        || recipe.from_digest != assessment.from.digest
        || recipe.to_digest != assessment.to.digest
    {
        return Err(MigrationError::InvalidPlan(
            "recipe source or target does not match the published revision pair".to_owned(),
        ));
    }
    if !matches!(
        assessment.classification,
        EvolutionClassification::RequiresMigration | EvolutionClassification::Breaking
    ) {
        return Err(MigrationError::InvalidPlan(
            "only requires_migration or breaking assessments accept a migration recipe".to_owned(),
        ));
    }

    let from_relations = relations_by_id(from_definition);
    let to_relations = relations_by_id(to_definition);
    for rule in &recipe.rules {
        validate_rule(rule, &from_relations, &to_relations)?;
    }
    for postcondition in &recipe.postconditions {
        if !to_relations.contains_key(postcondition.relation_id.as_str()) {
            return Err(MigrationError::InvalidPlan(format!(
                "postcondition names unknown target Relation {}",
                postcondition.relation_id
            )));
        }
    }

    let obligation_sources = obligation_sources(assessment, &recipe.rules)?;
    let affected_elements = assessment
        .changes
        .iter()
        .map(|change| MigrationElement {
            element: change.element,
            id: change.id.clone(),
        })
        .collect();
    let artifact_dependencies = assessment
        .impacts
        .iter()
        .filter(|impact| impact.applicability == DefinitionImpactApplicability::Applicable)
        .filter(|impact| {
            matches!(
                impact.area,
                DefinitionImpactArea::QueryAndMaterializationArtifacts
                    | DefinitionImpactArea::GeneratedSdkAndSurfaceArtifacts
                    | DefinitionImpactArea::PolicyAndAuthorityContracts
            )
        })
        .flat_map(|impact| {
            impact
                .affected
                .iter()
                .cloned()
                .map(|id| MigrationArtifactDependency {
                    area: impact.area,
                    id,
                })
        })
        .collect();

    Ok(MigrationPlan {
        affected_elements,
        artifact_dependencies,
        assessment_digest,
        classification: assessment.classification,
        dependencies: recipe.dependencies,
        format_version: recipe.format_version,
        from: assessment.from.clone(),
        obligation_sources,
        operation_id: recipe.operation_id,
        postconditions: recipe.postconditions,
        rules: recipe.rules,
        to: assessment.to.clone(),
    })
}

fn validate_recipe_shape(recipe: &MigrationRecipe) -> Result<(), MigrationError> {
    if recipe.format_version != 1 {
        return Err(MigrationError::InvalidPlan(
            "format_version must be 1".to_owned(),
        ));
    }
    let rule_ids = recipe
        .rules
        .iter()
        .map(|rule| rule.id.clone())
        .collect::<BTreeSet<_>>();
    if rule_ids.len() != recipe.rules.len() {
        return Err(MigrationError::InvalidPlan(
            "migration rule IDs must be unique".to_owned(),
        ));
    }
    if recipe
        .postconditions
        .iter()
        .any(|postcondition| postcondition.minimum_record_count == 0)
    {
        return Err(MigrationError::InvalidPlan(
            "postcondition record counts must be positive".to_owned(),
        ));
    }
    Ok(())
}

fn validate_rule(
    rule: &MigrationRule,
    from_relations: &BTreeMap<&str, &RelationDefinition>,
    to_relations: &BTreeMap<&str, &RelationDefinition>,
) -> Result<(), MigrationError> {
    if rule
        .sources
        .iter()
        .chain(&rule.targets)
        .any(|element| element.element != DefinitionElementKind::Relation)
    {
        return Err(MigrationError::InvalidPlan(format!(
            "rule {} must map stored Relation identities",
            rule.id
        )));
    }
    let unique_sources = rule.sources.iter().collect::<BTreeSet<_>>();
    let unique_targets = rule.targets.iter().collect::<BTreeSet<_>>();
    if unique_sources.len() != rule.sources.len() || unique_targets.len() != rule.targets.len() {
        return Err(MigrationError::InvalidPlan(format!(
            "rule {} repeats a source or target",
            rule.id
        )));
    }
    for source in &rule.sources {
        if !from_relations.contains_key(source.id.as_str()) {
            return Err(MigrationError::InvalidPlan(format!(
                "rule {} names unknown source Relation {}",
                rule.id, source.id
            )));
        }
    }
    for target in &rule.targets {
        if !to_relations.contains_key(target.id.as_str()) {
            return Err(MigrationError::InvalidPlan(format!(
                "rule {} names unknown target Relation {}",
                rule.id, target.id
            )));
        }
    }
    match rule.kind {
        MigrationRuleKind::PreserveMeaning => {
            if rule.sources.len() != 1 || rule.targets.len() != 1 {
                return Err(MigrationError::InvalidPlan(format!(
                    "preserve_meaning rule {} requires one source and one target",
                    rule.id
                )));
            }
            let source = from_relations[rule.sources[0].id.as_str()];
            let target = to_relations[rule.targets[0].id.as_str()];
            if source.cardinality != target.cardinality
                || source.source_type != target.source_type
                || source.target != target.target
            {
                return Err(MigrationError::InvalidPlan(format!(
                    "preserve_meaning rule {} does not preserve the Relation contract",
                    rule.id
                )));
            }
        }
        MigrationRuleKind::Transform => {
            if rule.sources.is_empty() || rule.targets.len() != 1 {
                return Err(MigrationError::InvalidPlan(format!(
                    "transform rule {} requires explicit sources and one target",
                    rule.id
                )));
            }
        }
        MigrationRuleKind::Supersede => {
            if rule.sources.is_empty() || !rule.targets.is_empty() {
                return Err(MigrationError::InvalidPlan(format!(
                    "supersede rule {} must name sources and no successor",
                    rule.id
                )));
            }
        }
        MigrationRuleKind::Recompute => {
            if !rule.sources.is_empty() || rule.targets.len() != 1 {
                return Err(MigrationError::InvalidPlan(format!(
                    "recompute rule {} must name one target and no sources",
                    rule.id
                )));
            }
        }
    }
    Ok(())
}

fn obligation_sources(
    assessment: &EvolutionPlan,
    rules: &[MigrationRule],
) -> Result<Vec<MigrationObligationSource>, MigrationError> {
    let affected_sources = assessment
        .changes
        .iter()
        .filter(|change| change.element == DefinitionElementKind::Relation)
        .filter(|change| change.change != DefinitionChangeKind::Added)
        .map(|change| change.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut sources = Vec::with_capacity(affected_sources.len());
    for relation_id in affected_sources {
        let matching = rules
            .iter()
            .filter(|rule| rule.sources.iter().any(|source| source.id == relation_id))
            .collect::<Vec<_>>();
        if matching.len() != 1 {
            return Err(MigrationError::InvalidPlan(format!(
                "affected source Relation {relation_id} must have exactly one recipe rule"
            )));
        }
        let rule = matching[0];
        sources.push(MigrationObligationSource {
            kind: rule.kind,
            relation_id: zoen_core::RelationId::parse(relation_id)
                .map_err(|error| MigrationError::InvalidPlan(error.to_string()))?,
            rule_id: rule.id.clone(),
        });
    }
    Ok(sources)
}

fn relations_by_id(definition: &CanonicalDefinition) -> BTreeMap<&str, &RelationDefinition> {
    definition
        .relations
        .iter()
        .map(|relation| (relation.id.as_str(), relation))
        .collect()
}
