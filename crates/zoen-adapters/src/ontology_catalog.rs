//! Ontology catalog bytes: exactly the seven public verbs (§8.3 / W2-05).

use serde::Deserialize;
use zoen_core::{PublicVerb, WORLD_ONTOLOGY_CATALOG_SCHEMA};

use crate::CedarConfigError;

#[derive(Debug, Deserialize)]
struct OntologyCatalogDocument {
    schema: String,
    #[serde(rename = "publicVerbs")]
    public_verbs: Vec<String>,
}

/// Parsed ontology catalog bound by an active `WorldRelease`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedOntologyCatalog {
    pub verbs: Vec<PublicVerb>,
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
    Ok(ParsedOntologyCatalog { verbs })
}

/// Canonical ontology catalog bytes for the seven public verbs (JCS field order).
#[must_use]
pub fn seven_verb_ontology_catalog_bytes() -> Vec<u8> {
    format!(
        "{{\"publicVerbs\":[\"Discover\",\"Query\",\"Propose\",\"Decide\",\"Commit\",\"Explain\",\"Execute\"],\"schema\":\"{WORLD_ONTOLOGY_CATALOG_SCHEMA}\"}}"
    )
    .into_bytes()
}
