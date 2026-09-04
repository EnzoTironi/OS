//! Stable `ObjectKey`, temporal `TypeAssignment`, and private typed references.
//!
//! `TypeAssignment` is the only term for evidence that a domain object has a type.
//! It is never `Membership` (an Account acting in a World).

use std::{
    error::Error,
    fmt::{Display, Formatter},
    marker::PhantomData,
};

use crate::{
    EntityId, IdentifierError, TimestampMicros, TypeId, ValidTime, ValidTimeError, WorldId,
    encode_hex, parse_identifier, sha256::sha256,
};

/// Stable internal object identity. Independent of provider ids and assigned types.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ObjectKey {
    pub world: WorldId,
    pub entity: EntityId,
}

impl ObjectKey {
    #[must_use]
    pub fn new(world: WorldId, entity: EntityId) -> Self {
        Self { world, entity }
    }

    /// # Errors
    ///
    /// Returns [`IdentifierError`] when either id is invalid.
    pub fn parse(
        world: impl Into<String>,
        entity: impl Into<String>,
    ) -> Result<Self, IdentifierError> {
        Ok(Self {
            world: WorldId::parse(world)?,
            entity: EntityId::parse(entity)?,
        })
    }

    #[must_use]
    pub fn as_private_ref(&self) -> String {
        format!("{}/{}", self.world.as_str(), self.entity.as_str())
    }
}

impl Display for ObjectKey {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "ObjectKey({}/{})",
            self.world.as_str(),
            self.entity.as_str()
        )
    }
}

macro_rules! assignment_id {
    ($name:ident) => {
        #[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
        pub struct $name(String);

        impl $name {
            /// # Errors
            ///
            /// Returns [`IdentifierError`] when `value` is not a valid identifier.
            pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
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

assignment_id!(TypeAssignmentId);
assignment_id!(EvidenceRef);

/// A reference to an admitted [`TypeAssignment`].
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct TypeAssignmentRef(String);

impl TypeAssignmentRef {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for TypeAssignmentRef {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Explicit, temporal, attributable evidence that an object has a type.
///
/// Never call this Membership. Membership is an Account acting in a World.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypeAssignmentAssertion {
    pub object: ObjectKey,
    pub object_type: TypeId,
    pub valid_time: ValidTime,
}

impl TypeAssignmentAssertion {
    /// # Errors
    ///
    /// Returns [`ValidTimeError`] when the interval is inverted.
    pub fn interval(
        object: ObjectKey,
        object_type: TypeId,
        start: TimestampMicros,
        end: TimestampMicros,
    ) -> Result<Self, ValidTimeError> {
        Ok(Self {
            object,
            object_type,
            valid_time: ValidTime::interval(start, end)?,
        })
    }

    #[must_use]
    pub fn covers(&self, at: TimestampMicros) -> bool {
        self.valid_time.contains(at)
    }
}

/// Admitted type-evidence bound to a stable assignment id and evidence ref.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypeAssignment {
    pub id: TypeAssignmentId,
    pub assertion: TypeAssignmentAssertion,
    pub evidence: EvidenceRef,
}

impl TypeAssignment {
    /// Returns this assignment id as a verified `TypeAssignmentRef`.
    #[must_use]
    pub fn assignment_ref(&self) -> TypeAssignmentRef {
        TypeAssignmentRef(self.id.0.clone())
    }

    #[must_use]
    pub fn covers(&self, at: TimestampMicros) -> bool {
        self.assertion.covers(at)
    }
}

/// Private typed reference used by runtime contracts (not a public UUID dump).
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TypedObjectRef {
    pub key: ObjectKey,
    pub type_id: TypeId,
    pub assignment: TypeAssignmentRef,
}

impl TypedObjectRef {
    /// Build a typed ref only when the assignment supports the requested type.
    ///
    /// # Errors
    ///
    /// Returns [`TypedObjectError`] when the assignment does not cover `type_id` or `at`.
    pub fn verified(
        assignment: &TypeAssignment,
        type_id: &TypeId,
        at: TimestampMicros,
    ) -> Result<Self, TypedObjectError> {
        if assignment.assertion.object_type != *type_id {
            return Err(TypedObjectError::TypeMismatch {
                expected: type_id.as_str().to_owned(),
                observed: assignment.assertion.object_type.as_str().to_owned(),
            });
        }
        if !assignment.covers(at) {
            return Err(TypedObjectError::OutsideValidTime);
        }
        Ok(Self {
            key: assignment.assertion.object.clone(),
            type_id: type_id.clone(),
            assignment: assignment.assignment_ref(),
        })
    }

    /// SDK-shaped generic notation (compile-time marker only).
    #[must_use]
    pub fn into_generic<T>(self) -> GenericTypedObjectRef<T> {
        GenericTypedObjectRef {
            key: self.key,
            assignment: self.assignment,
            marker: PhantomData,
        }
    }
}

/// Generated-SDK notation. Runtime paths use [`TypedObjectRef`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GenericTypedObjectRef<T> {
    pub key: ObjectKey,
    pub assignment: TypeAssignmentRef,
    pub marker: PhantomData<T>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TypedObjectError {
    TypeMismatch { expected: String, observed: String },
    OutsideValidTime,
    MissingAssignment,
}

impl Display for TypedObjectError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TypeMismatch { expected, observed } => write!(
                formatter,
                "typed operation rejected: assignment type {observed} does not support {expected}"
            ),
            Self::OutsideValidTime => formatter
                .write_str("typed operation rejected: TypeAssignment does not cover valid_at"),
            Self::MissingAssignment => {
                formatter.write_str("typed operation rejected: explicit TypeAssignment is required")
            }
        }
    }
}

impl Error for TypedObjectError {}

/// Canonical digest over a `TypeAssignmentAssertion` for attribution.
#[must_use]
pub fn type_assignment_assertion_digest(assertion: &TypeAssignmentAssertion) -> String {
    let (start, end) = match assertion.valid_time {
        ValidTime::Instant(at) => (at.get(), at.get()),
        ValidTime::Interval { start, end } => (start.get(), end.get()),
    };
    let payload = format!(
        "{}\0{}\0{}\0{}\0{}",
        assertion.object.world.as_str(),
        assertion.object.entity.as_str(),
        assertion.object_type.as_str(),
        start,
        end
    );
    encode_hex(&sha256(payload.as_bytes()))
}
