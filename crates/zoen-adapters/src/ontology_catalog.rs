//! Ontology catalog bytes: exactly seven public verbs plus governed semantic definitions.

use std::collections::BTreeSet;

use serde::Deserialize;
use zoen_core::{
    LinkCardinality, LinkTemporalBehavior, LinkTypeId, PublicVerb, TypeId, TypedArtifactError,
    TypedLinkDefinition, WORLD_ONTOLOGY_CATALOG_SCHEMA,
};

use crate::CedarConfigError;

#[derive(Debug, Deserialize)]
struct OntologyCatalogDocument {
    schema: String,
    #[serde(rename = "publicVerbs")]
    public_verbs: Vec<String>,
    #[serde(rename = "typedLinks", default)]
    typed_links: Vec<TypedLinkDefinitionDocument>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TypedLinkDefinitionDocument {
    id: String,
    source_type: String,
    target_type: String,
    source_side: String,
    target_side: String,
    cardinality: String,
    temporal_behavior: String,
    required_evidence_schema: String,
}

/// Parsed ontology catalog bound by an active `WorldRelease`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedOntologyCatalog {
    pub verbs: Vec<PublicVerb>,
    pub typed_links: Vec<TypedLinkDefinition>,
}

/// Validate ontology catalog candidate bytes before publish.
///
/// # Errors
///
/// Returns [`CedarConfigError`] when bytes are not a loadable §8.3 catalog that
/// declares exactly the seven public verbs in order.
pub fn require_loadable_ontology_catalog(
    bytes: &[u8],
) -> Result<ParsedOntologyCatalog, CedarConfigError> {
    let document = serde_json::from_slice::<OntologyCatalogDocument>(bytes)
        .map_err(|error| CedarConfigError::Invalid(format!("ontology catalog JSON: {error}")))?;
    if document.schema != WORLD_ONTOLOGY_CATALOG_SCHEMA {
        return Err(CedarConfigError::Invalid(format!(
            "expected schema {WORLD_ONTOLOGY_CATALOG_SCHEMA}, got {}",
            document.schema
        )));
    }
    if document.public_verbs.len() != PublicVerb::ALL.len() {
        return Err(CedarConfigError::Invalid(format!(
            "publicVerbs must list exactly {} verbs, got {}",
            PublicVerb::ALL.len(),
            document.public_verbs.len()
        )));
    }
    let mut verbs = Vec::with_capacity(PublicVerb::ALL.len());
    for (index, expected) in PublicVerb::ALL.iter().enumerate() {
        let observed = PublicVerb::parse(&document.public_verbs[index])
            .map_err(|error| CedarConfigError::Invalid(format!("publicVerbs[{index}]: {error}")))?;
        if observed != *expected {
            return Err(CedarConfigError::Invalid(format!(
                "publicVerbs[{index}] must be {}, got {}",
                expected.as_str(),
                observed.as_str()
            )));
        }
        verbs.push(observed);
    }
    let mut seen_link_types = BTreeSet::new();
    let typed_links = document
        .typed_links
        .into_iter()
        .enumerate()
        .map(|(index, definition)| {
            let definition = parse_typed_link_definition(definition)
                .map_err(|error| typed_link_error(index, &error))?;
            if !seen_link_types.insert(definition.id.clone()) {
                return Err(CedarConfigError::Invalid(format!(
                    "typedLinks[{index}] duplicates {}",
                    definition.id.as_str()
                )));
            }
            Ok(definition)
        })
        .collect::<Result<Vec<_>, CedarConfigError>>()?;
    Ok(ParsedOntologyCatalog { verbs, typed_links })
}

fn parse_typed_link_definition(
    document: TypedLinkDefinitionDocument,
) -> Result<TypedLinkDefinition, String> {
    let evidence_schema = document.required_evidence_schema;
    if document.source_side.trim().is_empty() || document.target_side.trim().is_empty() {
        return Err(TypedArtifactError::EmptyLinkSide.to_string());
    }
    if evidence_schema.trim().is_empty() {
        return Err(TypedArtifactError::EmptyEvidenceSchema.to_string());
    }
    Ok(TypedLinkDefinition {
        id: LinkTypeId::parse(document.id).map_err(|error| error.to_string())?,
        source_type: TypeId::parse(document.source_type).map_err(|error| error.to_string())?,
        target_type: TypeId::parse(document.target_type).map_err(|error| error.to_string())?,
        source_side: document.source_side,
        target_side: document.target_side,
        cardinality: LinkCardinality::parse(&document.cardinality)
            .map_err(|error| error.to_string())?,
        temporal_behavior: LinkTemporalBehavior::parse(&document.temporal_behavior)
            .map_err(|error| error.to_string())?,
        required_evidence_schema: evidence_schema,
    })
}

fn typed_link_error(index: usize, error: &str) -> CedarConfigError {
    CedarConfigError::Invalid(format!("typedLinks[{index}]: {error}"))
}

/// Canonical ontology catalog bytes for the seven public verbs (JCS field order).
#[must_use]
pub fn seven_verb_ontology_catalog_bytes() -> Vec<u8> {
    format!(
        "{{\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"{WORLD_ONTOLOGY_CATALOG_SCHEMA}\"}}"
    )
    .into_bytes()
}
