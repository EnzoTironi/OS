use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use sha2::{Digest, Sha256};
use zoen_core::{
    CanonicalDefinition, CanonicalJson, DefinitionDigest, DefinitionId, DefinitionRevision,
    ExecutionContext, Expression, InputDefinition, PublicationRequest, RelationTarget, TenantId,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DefinitionFamily {
    Action,
    ActionEffect,
    ActionInput,
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StoreError {
    Conflict(String),
    Corrupt(String),
    NotFound,
    Unavailable(String),
}

impl Display for StoreError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Conflict(message) => write!(formatter, "publication conflict: {message}"),
            Self::Corrupt(message) => write!(formatter, "authority data is corrupt: {message}"),
            Self::NotFound => formatter.write_str("definition revision was not found"),
            Self::Unavailable(message) => {
                write!(formatter, "authority store unavailable: {message}")
            }
        }
    }
}

impl Error for StoreError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PublishError {
    DigestMismatch,
    InvalidDefinition(ValidationError),
    Store(StoreError),
}

impl Display for PublishError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => formatter.write_str("canonical definition digest mismatch"),
            Self::InvalidDefinition(error) => error.fmt(formatter),
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for PublishError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidDefinition(error) => Some(error),
            Self::Store(error) => Some(error),
            Self::DigestMismatch => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GetRevisionError {
    DigestMismatch,
    Store(StoreError),
}

impl Display for GetRevisionError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DigestMismatch => {
                formatter.write_str("stored canonical definition digest mismatch")
            }
            Self::Store(error) => error.fmt(formatter),
        }
    }
}

impl Error for GetRevisionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Store(error) => Some(error),
            Self::DigestMismatch => None,
        }
    }
}

#[allow(async_fn_in_trait)]
pub trait AuthorityStore: Send + Sync {
    async fn publish(
        &self,
        context: &ExecutionContext,
        request: &PublicationRequest,
    ) -> Result<DefinitionRevision, StoreError>;

    async fn get_revision(
        &self,
        tenant_id: &TenantId,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, StoreError>;
}

pub struct DefinitionEngine<S> {
    store: S,
}

impl<S> DefinitionEngine<S>
where
    S: AuthorityStore,
{
    pub fn new(store: S) -> Self {
        Self { store }
    }

    pub async fn publish(
        &self,
        context: &ExecutionContext,
        request: &PublicationRequest,
    ) -> Result<DefinitionRevision, PublishError> {
        validate_definition(&request.definition).map_err(PublishError::InvalidDefinition)?;
        verify_digest(&request.canonical_json, &request.digest)
            .then_some(())
            .ok_or(PublishError::DigestMismatch)?;
        self.store
            .publish(context, request)
            .await
            .map_err(PublishError::Store)
    }

    pub async fn get_revision(
        &self,
        context: &ExecutionContext,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, GetRevisionError> {
        let revision = self
            .store
            .get_revision(&context.tenant_id, definition_id, digest)
            .await
            .map_err(GetRevisionError::Store)?;
        verify_digest(&revision.canonical_json, &revision.digest)
            .then_some(revision)
            .ok_or(GetRevisionError::DigestMismatch)
    }
}

fn verify_digest(canonical_json: &CanonicalJson, expected: &DefinitionDigest) -> bool {
    let actual = Sha256::digest(canonical_json.as_bytes());
    expected
        .as_str()
        .as_bytes()
        .chunks_exact(2)
        .zip(actual)
        .all(|(encoded, actual)| match encoded {
            [high, low] => (hex_value(*high) << 4 | hex_value(*low)) == actual,
            _ => false,
        })
}

fn hex_value(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        _ => 0,
    }
}

fn validate_definition(definition: &CanonicalDefinition) -> Result<(), ValidationError> {
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

#[cfg(test)]
mod tests {
    use zoen_core::{CanonicalJson, DefinitionDigest};

    use super::verify_digest;

    #[test]
    fn verifies_digest_over_canonical_json_bytes() {
        let canonical = CanonicalJson::new("{}").expect("nonempty canonical JSON");
        let digest = DefinitionDigest::parse(
            "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        )
        .expect("valid digest");
        assert!(verify_digest(&canonical, &digest));
    }
}
