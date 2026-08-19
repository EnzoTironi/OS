use std::collections::BTreeSet;

use zoen_core::{
    DefinitionImpactApplicability, DefinitionImpactArea, EvolutionClassification,
    MigrationArtifactDependency, MigrationElement, MigrationPlan,
};

use super::MigrationError;

pub(super) fn validate_plan_shape(plan: &MigrationPlan) -> Result<(), MigrationError> {
    if plan.format_version != 1 {
        return Err(MigrationError::InvalidPlan(
            "format_version must be 1".to_owned(),
        ));
    }
    if plan.expected_batches == 0 {
        return Err(MigrationError::InvalidPlan(
            "expected_batches must be positive".to_owned(),
        ));
    }
    if plan.from.definition_id != plan.to.definition_id {
        return Err(MigrationError::InvalidPlan(
            "source and target definition IDs differ".to_owned(),
        ));
    }
    if !matches!(
        plan.classification,
        EvolutionClassification::RequiresMigration | EvolutionClassification::Breaking
    ) {
        return Err(MigrationError::InvalidPlan(
            "only requires_migration or breaking assessments accept a MigrationPlan".to_owned(),
        ));
    }
    if plan.rules.is_empty() {
        return Err(MigrationError::InvalidPlan(
            "at least one migration rule is required".to_owned(),
        ));
    }
    let rule_ids = plan
        .rules
        .iter()
        .map(|rule| rule.id.clone())
        .collect::<BTreeSet<_>>();
    if rule_ids.len() != plan.rules.len() {
        return Err(MigrationError::InvalidPlan(
            "migration rule IDs must be unique".to_owned(),
        ));
    }
    if plan
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

pub(super) fn validate_plan_against_assessment(
    plan: &MigrationPlan,
    assessment: &zoen_core::EvolutionPlan,
) -> Result<(), MigrationError> {
    if plan.from != assessment.from || plan.to != assessment.to {
        return Err(MigrationError::InvalidPlan(
            "plan source or target does not match the published revision pair".to_owned(),
        ));
    }
    if plan.classification != assessment.classification {
        return Err(MigrationError::InvalidPlan(format!(
            "plan classification {:?} does not match assessment {:?}",
            plan.classification, assessment.classification
        )));
    }
    let expected_elements = assessment
        .changes
        .iter()
        .map(|change| MigrationElement {
            element: change.element,
            id: change.id.clone(),
        })
        .collect::<BTreeSet<_>>();
    let actual_elements = plan
        .affected_elements
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if actual_elements != expected_elements || actual_elements.len() != plan.affected_elements.len()
    {
        return Err(MigrationError::InvalidPlan(
            "affected_elements does not match the complete semantic diff".to_owned(),
        ));
    }
    let expected_artifacts = assessment
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
        .collect::<BTreeSet<_>>();
    let actual_artifacts = plan
        .artifact_dependencies
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if actual_artifacts != expected_artifacts
        || actual_artifacts.len() != plan.artifact_dependencies.len()
    {
        return Err(MigrationError::InvalidPlan(
            "artifact_dependencies omits or adds query, generated, or authority impact".to_owned(),
        ));
    }
    let covered_elements = plan
        .rules
        .iter()
        .flat_map(|rule| rule.sources.iter().chain(&rule.targets))
        .cloned()
        .collect::<BTreeSet<_>>();
    if covered_elements != expected_elements {
        return Err(MigrationError::InvalidPlan(
            "migration rules do not cover every affected semantic identity".to_owned(),
        ));
    }
    Ok(())
}
