use std::env;
use std::error::Error;
use std::fs;
use std::io::ErrorKind;

use serde::Deserialize;

const EMBEDDED_CLASSIFICATION: &str = include_str!("../state-classification.yaml");

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
pub struct StateClassification {
    pub authority: AuthorityTables,
    pub rebuildable: RebuildableState,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
pub struct AuthorityTables {
    #[serde(rename = "postgresTables")]
    pub postgres_tables: Vec<String>,
    #[serde(default, rename = "referenceTables")]
    pub reference_tables: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq)]
pub struct RebuildableState {
    #[serde(default, rename = "postgresTables")]
    pub postgres_tables: Vec<String>,
    #[serde(default)]
    pub orchestration: Vec<String>,
    #[serde(default, rename = "objectStorage")]
    pub object_storage: Vec<String>,
}

pub fn load_classification() -> Result<StateClassification, Box<dyn Error + Send + Sync>> {
    let path = env::var("ZOEN_STATE_CLASSIFICATION")
        .unwrap_or_else(|_| "/etc/zoen/state-classification.yaml".to_owned());
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == ErrorKind::NotFound => EMBEDDED_CLASSIFICATION.to_owned(),
        Err(error) => return Err(error.into()),
    };
    parse_classification(&text)
}

pub fn parse_classification(
    text: &str,
) -> Result<StateClassification, Box<dyn Error + Send + Sync>> {
    let classification: StateClassification = serde_yaml::from_str(text)?;
    classification.validate()?;
    Ok(classification)
}

pub fn require_reference_tables() -> bool {
    matches!(env::var("ZOEN_REQUIRE_REFERENCE_TABLES"), Ok(value) if value == "true")
}

impl StateClassification {
    pub fn validate(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        if self.authority.postgres_tables.is_empty() {
            return Err("state classification has no authority postgres tables".into());
        }
        for table in &self.rebuildable.postgres_tables {
            if self
                .authority
                .postgres_tables
                .iter()
                .any(|item| item == table)
                || self
                    .authority
                    .reference_tables
                    .iter()
                    .any(|item| item == table)
            {
                return Err(format!(
                    "rebuildable table {table} cannot be classified as unrebuildable authority"
                )
                .into());
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{EMBEDDED_CLASSIFICATION, parse_classification};

    #[test]
    fn embedded_classification_separates_authority_from_rebuildable_projections() {
        let classification = parse_classification(EMBEDDED_CLASSIFICATION).unwrap();
        assert!(
            classification
                .authority
                .postgres_tables
                .contains(&"definition_revisions".to_owned())
        );
        assert!(
            classification
                .authority
                .postgres_tables
                .contains(&"effect_requests".to_owned())
        );
        assert!(
            classification
                .rebuildable
                .postgres_tables
                .contains(&"projection_watermarks".to_owned())
        );
        assert!(
            classification
                .rebuildable
                .orchestration
                .contains(&"restate".to_owned())
        );
        assert!(
            classification
                .rebuildable
                .object_storage
                .contains(&"zoen-projections".to_owned())
        );
        assert!(
            classification
                .authority
                .reference_tables
                .contains(&"company_sources".to_owned())
        );
        assert!(
            !classification
                .rebuildable
                .postgres_tables
                .contains(&"company_sources".to_owned())
        );
    }

    #[test]
    fn projection_as_authority_is_rejected() {
        let mutant = "\
authority:
  postgresTables: [definition_revisions, projection_watermarks]
rebuildable:
  postgresTables: [projection_watermarks]
";
        let error = parse_classification(mutant).unwrap_err().to_string();
        assert!(error.contains("projection_watermarks"));
    }
}
