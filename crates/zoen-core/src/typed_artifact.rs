//! Typed links and contextual external identifiers admitted as attributable evidence.

use std::{
    error::Error,
    fmt::{Display, Formatter},
};

use crate::{
    EvidenceRef, ObjectKey, TypeAssignmentId, TypeId, ValidTime, encode_hex, parse_identifier,
    sha256::sha256,
};

macro_rules! typed_id {
    ($name:ident) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            /// # Errors
            ///
            /// Returns an identifier error when `value` is not a semantic identifier.
            pub fn parse(value: impl Into<String>) -> Result<Self, crate::IdentifierError> {
                parse_identifier(value.into(), stringify!($name)).map(Self)
            }

            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl Display for $name {
            fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

typed_id!(LinkTypeId);
typed_id!(LinkAssertionId);
typed_id!(IdentifierAssignmentId);
typed_id!(IdentifierScheme);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LinkCardinality {
    OneToOne,
    OneToMany,
    ManyToOne,
    ManyToMany,
}

impl LinkCardinality {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OneToOne => "one-to-one",
            Self::OneToMany => "one-to-many",
            Self::ManyToOne => "many-to-one",
            Self::ManyToMany => "many-to-many",
        }
    }

    /// # Errors
    ///
    /// Returns [`TypedArtifactError`] for an unknown catalog value.
    pub fn parse(value: &str) -> Result<Self, TypedArtifactError> {
        match value {
            "one-to-one" => Ok(Self::OneToOne),
            "one-to-many" => Ok(Self::OneToMany),
            "many-to-one" => Ok(Self::ManyToOne),
            "many-to-many" => Ok(Self::ManyToMany),
            _ => Err(TypedArtifactError::InvalidCardinality(value.to_owned())),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LinkTemporalBehavior {
    Interval,
}

impl LinkTemporalBehavior {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Interval => "interval",
        }
    }

    /// # Errors
    ///
    /// Returns [`TypedArtifactError`] unless the catalog declares interval semantics.
    pub fn parse(value: &str) -> Result<Self, TypedArtifactError> {
        match value {
            "interval" => Ok(Self::Interval),
            _ => Err(TypedArtifactError::InvalidTemporalBehavior(
                value.to_owned(),
            )),
        }
    }
}

/// Published meaning for one typed link. Cardinality describes meaning; it never picks a winner.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypedLinkDefinition {
    pub id: LinkTypeId,
    pub source_type: TypeId,
    pub target_type: TypeId,
    pub source_side: String,
    pub target_side: String,
    pub cardinality: LinkCardinality,
    pub temporal_behavior: LinkTemporalBehavior,
    pub required_evidence_schema: String,
}

/// Evidence payload for an instance link.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LinkAssertion {
    pub link_type: LinkTypeId,
    pub source: ObjectKey,
    pub target: ObjectKey,
    pub valid_time: ValidTime,
}

impl LinkAssertion {
    /// # Errors
    ///
    /// Returns [`TypedArtifactError`] when endpoints cross Worlds.
    pub fn new(
        link_type: LinkTypeId,
        source: ObjectKey,
        target: ObjectKey,
        valid_time: ValidTime,
    ) -> Result<Self, TypedArtifactError> {
        if source.world != target.world {
            return Err(TypedArtifactError::CrossWorldLink);
        }
        Ok(Self {
            link_type,
            source,
            target,
            valid_time,
        })
    }
}

/// Admitted link with explicit endpoint type evidence and server-derived evidence.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypedLink {
    pub id: LinkAssertionId,
    pub assertion: LinkAssertion,
    pub source_assignment: TypeAssignmentId,
    pub target_assignment: TypeAssignmentId,
    pub evidence: EvidenceRef,
}

/// Context makes external identifiers assignments, never object identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentifierContext {
    pub venue: Option<ObjectKey>,
    pub mic: Option<String>,
    pub currency: Option<String>,
    pub share_class: Option<String>,
    pub provider: Option<String>,
    pub identifier_level: Option<String>,
}

impl IdentifierContext {
    #[must_use]
    pub fn has_dimension(&self) -> bool {
        self.venue.is_some()
            || self.mic.is_some()
            || self.currency.is_some()
            || self.share_class.is_some()
            || self.provider.is_some()
            || self.identifier_level.is_some()
    }
}

/// Evidence payload assigning an external identifier in an explicit context and interval.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentifierAssertion {
    pub object: ObjectKey,
    pub scheme: IdentifierScheme,
    pub value: String,
    pub context: IdentifierContext,
    pub valid_time: ValidTime,
}

/// Admitted contextual identifier with explicit type support and evidence.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IdentifierAssignment {
    pub id: IdentifierAssignmentId,
    pub assertion: IdentifierAssertion,
    pub type_assignment: TypeAssignmentId,
    pub evidence: EvidenceRef,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TypedArtifactError {
    CrossWorldLink,
    EmptyIdentifierValue,
    EmptyLinkSide,
    EmptyEvidenceSchema,
    MissingIdentifierContext,
    InvalidCardinality(String),
    InvalidTemporalBehavior(String),
}

impl Display for TypedArtifactError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::CrossWorldLink => formatter.write_str("typed link endpoints must share a World"),
            Self::EmptyIdentifierValue => {
                formatter.write_str("identifier assignment value must not be empty")
            }
            Self::EmptyLinkSide => formatter.write_str("typed link side names must not be empty"),
            Self::EmptyEvidenceSchema => {
                formatter.write_str("typed link evidence schema must not be empty")
            }
            Self::MissingIdentifierContext => {
                formatter.write_str("identifier assignment requires at least one context dimension")
            }
            Self::InvalidCardinality(value) => {
                write!(formatter, "invalid typed link cardinality {value:?}")
            }
            Self::InvalidTemporalBehavior(value) => {
                write!(formatter, "invalid typed link temporal behavior {value:?}")
            }
        }
    }
}

impl Error for TypedArtifactError {}

/// True when this valid-time value covers the complete `required` value.
impl ValidTime {
    #[must_use]
    pub fn covers(&self, required: &Self) -> bool {
        match (self, required) {
            (Self::Instant(observed), Self::Instant(required)) => observed == required,
            (Self::Interval { start, end }, Self::Instant(required)) => {
                *start <= *required && *required < *end
            }
            (
                Self::Interval { start, end },
                Self::Interval {
                    start: required_start,
                    end: required_end,
                },
            ) => *start <= *required_start && *required_end <= *end,
            (Self::Instant(_), Self::Interval { .. }) => false,
        }
    }
}

#[must_use]
pub fn typed_link_definition_digest(definition: &TypedLinkDefinition) -> String {
    digest_fields(
        "zoen.typed-link-definition.v1",
        &[
            definition.id.as_str(),
            definition.source_type.as_str(),
            definition.target_type.as_str(),
            &definition.source_side,
            &definition.target_side,
            definition.cardinality.as_str(),
            definition.temporal_behavior.as_str(),
            &definition.required_evidence_schema,
        ],
    )
}

#[must_use]
pub fn link_assertion_digest(assertion: &LinkAssertion) -> String {
    let (start, end) = valid_time_bounds(&assertion.valid_time);
    digest_fields(
        "zoen.link-assertion.v1",
        &[
            assertion.link_type.as_str(),
            assertion.source.world.as_str(),
            assertion.source.entity.as_str(),
            assertion.target.entity.as_str(),
            &start.to_string(),
            &end.to_string(),
        ],
    )
}

#[must_use]
pub fn identifier_assertion_digest(assertion: &IdentifierAssertion) -> String {
    let (start, end) = valid_time_bounds(&assertion.valid_time);
    digest_fields(
        "zoen.identifier-assertion.v1",
        &[
            assertion.object.world.as_str(),
            assertion.object.entity.as_str(),
            assertion.scheme.as_str(),
            &assertion.value,
            assertion
                .context
                .venue
                .as_ref()
                .map_or("", |venue| venue.entity.as_str()),
            assertion.context.mic.as_deref().unwrap_or(""),
            assertion.context.currency.as_deref().unwrap_or(""),
            assertion.context.share_class.as_deref().unwrap_or(""),
            assertion.context.provider.as_deref().unwrap_or(""),
            assertion.context.identifier_level.as_deref().unwrap_or(""),
            &start.to_string(),
            &end.to_string(),
        ],
    )
}

fn valid_time_bounds(valid_time: &ValidTime) -> (i64, i64) {
    match valid_time {
        ValidTime::Instant(at) => (at.get(), at.get()),
        ValidTime::Interval { start, end } => (start.get(), end.get()),
    }
}

fn digest_fields(domain: &str, fields: &[&str]) -> String {
    let mut payload = String::from(domain);
    for field in fields {
        payload.push('\0');
        payload.push_str(field);
    }
    encode_hex(&sha256(payload.as_bytes()))
}
