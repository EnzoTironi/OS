use std::{
    collections::BTreeSet,
    error::Error,
    fmt::{Display, Formatter},
};

use zoen_core::{
    CanonicalDefinition, Expression, InputDefinition, RelationTarget, allows_empty_action_effects,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionFamily {
    Action,
    ActionEffect,
    ActionInput,
    ActionOutput,
    Computation,
    ComputationInput,
    Relation,
    Type,
    TypeAttribute,
}

impl Display for DefinitionFamily {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::Action => "Action",
            Self::ActionEffect => "Action effect",
            Self::ActionInput => "Action input",
            Self::ActionOutput => "Action output",
            Self::Computation => "Computation",
            Self::ComputationInput => "Computation input",
            Self::Relation => "Relation",
            Self::Type => "Type",
            Self::TypeAttribute => "Type attribute",
        };
        name.fmt(formatter)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReferenceKind {
    Input,
    Relation,
    Type,
}

impl Display for ReferenceKind {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let name = match self {
            Self::Input => "input",
            Self::Relation => "relation",
            Self::Type => "type",
        };
        name.fmt(formatter)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ValidationError {
    DuplicateId {
        family: DefinitionFamily,
        id: String,
    },
    EmptyFamily(DefinitionFamily),
    UnknownReference {
        id: String,
        kind: ReferenceKind,
        owner: String,
    },
}

impl Display for ValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateId { family, id } => {
                write!(formatter, "duplicate {family} id: {id}")
            }
            Self::EmptyFamily(family) => {
                write!(formatter, "definition bundle has no {family} definitions")
            }
            Self::UnknownReference { id, kind, owner } => {
                write!(formatter, "{owner} references unknown {kind}: {id}")
            }
        }
    }
}

impl Error for ValidationError {}

pub(super) fn validate_definition(definition: &CanonicalDefinition) -> Result<(), ValidationError> {
    require_nonempty(DefinitionFamily::Type, definition.types.is_empty())?;
    require_nonempty(DefinitionFamily::Relation, definition.relations.is_empty())?;
    require_nonempty(
        DefinitionFamily::Computation,
        definition.computations.is_empty(),
    )?;
    require_nonempty(DefinitionFamily::Action, definition.actions.is_empty())?;

    ensure_unique(
        DefinitionFamily::Type,
        definition.types.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Relation,
        definition.relations.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Computation,
        definition.computations.iter().map(|item| item.id.as_str()),
    )?;
    ensure_unique(
        DefinitionFamily::Action,
        definition.actions.iter().map(|item| item.id.as_str()),
    )?;

    let type_ids = definition
        .types
        .iter()
        .map(|item| item.id.as_str())
        .collect::<BTreeSet<_>>();
    let relation_ids = definition
        .relations
        .iter()
        .map(|item| item.id.as_str())
        .collect::<BTreeSet<_>>();

    for item in &definition.types {
        ensure_unique(
            DefinitionFamily::TypeAttribute,
            item.attributes
                .iter()
                .map(|attribute| attribute.id.as_str()),
        )?;
    }

    for item in &definition.relations {
        require_reference(
            &type_ids,
            item.source_type.as_str(),
            ReferenceKind::Type,
            item.id.as_str(),
        )?;
        if let RelationTarget::Type(target) = &item.target {
            require_reference(
                &type_ids,
                target.as_str(),
                ReferenceKind::Type,
                item.id.as_str(),
            )?;
        }
    }

    for item in &definition.computations {
        validate_executable(
            item.id.as_str(),
            DefinitionFamily::ComputationInput,
            &item.inputs,
            &item.expression,
            &relation_ids,
        )?;
    }

    for item in &definition.actions {
        if !allows_empty_action_effects(&item.id) {
            require_nonempty(DefinitionFamily::ActionEffect, item.effects.is_empty())?;
        }
        validate_executable(
            item.id.as_str(),
            DefinitionFamily::ActionInput,
            &item.inputs,
            &item.precondition,
            &relation_ids,
        )?;
        ensure_unique(
            DefinitionFamily::ActionEffect,
            item.effects
                .iter()
                .map(|effect| effect.relation_id.as_str()),
        )?;
        ensure_unique(
            DefinitionFamily::ActionOutput,
            item.outputs.iter().map(|output| output.id.as_str()),
        )?;
        let input_ids = input_ids(&item.inputs);
        for effect in &item.effects {
            require_reference(
                &relation_ids,
                effect.relation_id.as_str(),
                ReferenceKind::Relation,
                item.id.as_str(),
            )?;
            validate_expression(&effect.value, &input_ids, &relation_ids, item.id.as_str())?;
        }
    }

    Ok(())
}

fn require_nonempty(family: DefinitionFamily, is_empty: bool) -> Result<(), ValidationError> {
    if is_empty {
        Err(ValidationError::EmptyFamily(family))
    } else {
        Ok(())
    }
}

fn ensure_unique<'a>(
    family: DefinitionFamily,
    values: impl IntoIterator<Item = &'a str>,
) -> Result<(), ValidationError> {
    let mut seen = BTreeSet::new();
    for value in values {
        if !seen.insert(value) {
            return Err(ValidationError::DuplicateId {
                family,
                id: value.to_owned(),
            });
        }
    }
    Ok(())
}

fn validate_executable(
    owner: &str,
    input_family: DefinitionFamily,
    inputs: &[InputDefinition],
    expression: &Expression,
    relation_ids: &BTreeSet<&str>,
) -> Result<(), ValidationError> {
    ensure_unique(input_family, inputs.iter().map(|input| input.id.as_str()))?;
    validate_expression(expression, &input_ids(inputs), relation_ids, owner)
}

fn input_ids(inputs: &[InputDefinition]) -> BTreeSet<&str> {
    inputs.iter().map(|input| input.id.as_str()).collect()
}

fn validate_expression(
    expression: &Expression,
    input_ids: &BTreeSet<&str>,
    relation_ids: &BTreeSet<&str>,
    owner: &str,
) -> Result<(), ValidationError> {
    match expression {
        Expression::Binary { left, right, .. } => {
            validate_expression(left, input_ids, relation_ids, owner)?;
            validate_expression(right, input_ids, relation_ids, owner)
        }
        Expression::Input(input_id) => {
            require_reference(input_ids, input_id.as_str(), ReferenceKind::Input, owner)
        }
        Expression::Literal(_) => Ok(()),
        Expression::Relation(relation_id) => require_reference(
            relation_ids,
            relation_id.as_str(),
            ReferenceKind::Relation,
            owner,
        ),
    }
}

fn require_reference(
    known: &BTreeSet<&str>,
    id: &str,
    kind: ReferenceKind,
    owner: &str,
) -> Result<(), ValidationError> {
    if known.contains(id) {
        Ok(())
    } else {
        Err(ValidationError::UnknownReference {
            id: id.to_owned(),
            kind,
            owner: owner.to_owned(),
        })
    }
}
