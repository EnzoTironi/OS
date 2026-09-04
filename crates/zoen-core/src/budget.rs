//! Release-owned compute budget classes (`PolicyCatalog.computeBudgets`).

use std::{
    collections::BTreeMap,
    error::Error,
    fmt::{Display, Formatter},
};

use crate::{IdentifierError, parse_identifier};

/// Stable id for a published compute/scan budget class.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BudgetClassId(String);

impl BudgetClassId {
    /// # Errors
    ///
    /// Returns [`IdentifierError`] when `value` is not a valid identifier.
    pub fn parse(value: impl Into<String>) -> Result<Self, IdentifierError> {
        parse_identifier(value.into(), "BudgetClassId").map(Self)
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl Display for BudgetClassId {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(formatter)
    }
}

/// Server-owned resource ceilings bound by a `PolicyCatalog` entry.
///
/// Callers name a [`BudgetClassId`]; they must not invent fuel, memory, or scan
/// ceilings. Limits are taken from the World's active release catalog.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BudgetClass {
    deadline_millis: u64,
    fuel: u64,
    id: BudgetClassId,
    instances: usize,
    memories: usize,
    memory_bytes: usize,
    table_elements: usize,
    tables: usize,
}

impl BudgetClass {
    /// Construct a validated budget class. Every bound must be nonzero.
    ///
    /// # Errors
    ///
    /// Returns [`BudgetCatalogError::ZeroLimit`] when any bound is zero.
    pub fn new(
        id: BudgetClassId,
        fuel: u64,
        memory_bytes: usize,
        table_elements: usize,
        instances: usize,
        tables: usize,
        memories: usize,
        deadline_millis: u64,
    ) -> Result<Self, BudgetCatalogError> {
        if fuel == 0
            || memory_bytes == 0
            || table_elements == 0
            || instances == 0
            || tables == 0
            || memories == 0
            || deadline_millis == 0
        {
            return Err(BudgetCatalogError::ZeroLimit(id));
        }
        Ok(Self {
            deadline_millis,
            fuel,
            id,
            instances,
            memories,
            memory_bytes,
            table_elements,
            tables,
        })
    }

    #[must_use]
    pub fn deadline_millis(&self) -> u64 {
        self.deadline_millis
    }

    #[must_use]
    pub fn fuel(&self) -> u64 {
        self.fuel
    }

    #[must_use]
    pub fn id(&self) -> &BudgetClassId {
        &self.id
    }

    #[must_use]
    pub fn instances(&self) -> usize {
        self.instances
    }

    #[must_use]
    pub fn memories(&self) -> usize {
        self.memories
    }

    #[must_use]
    pub fn memory_bytes(&self) -> usize {
        self.memory_bytes
    }

    #[must_use]
    pub fn table_elements(&self) -> usize {
        self.table_elements
    }

    #[must_use]
    pub fn tables(&self) -> usize {
        self.tables
    }
}

/// Parsed `computeBudgets` map from a `PolicyCatalog` document.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BudgetClassCatalog {
    classes: BTreeMap<BudgetClassId, BudgetClass>,
}

impl BudgetClassCatalog {
    /// Build a catalog from validated classes. Duplicate ids fail closed.
    ///
    /// # Errors
    ///
    /// Returns [`BudgetCatalogError::Duplicate`] when two classes share an id.
    pub fn from_classes(classes: Vec<BudgetClass>) -> Result<Self, BudgetCatalogError> {
        let mut map = BTreeMap::new();
        for class in classes {
            let id = class.id().clone();
            if map.insert(id.clone(), class).is_some() {
                return Err(BudgetCatalogError::Duplicate(id));
            }
        }
        Ok(Self { classes: map })
    }

    /// # Errors
    ///
    /// Returns [`BudgetCatalogError::Unknown`] when `id` is not published.
    pub fn require(&self, id: &BudgetClassId) -> Result<&BudgetClass, BudgetCatalogError> {
        self.classes
            .get(id)
            .ok_or_else(|| BudgetCatalogError::Unknown(id.clone()))
    }

    #[must_use]
    pub fn get(&self, id: &BudgetClassId) -> Option<&BudgetClass> {
        self.classes.get(id)
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.classes.is_empty()
    }

    pub fn classes(&self) -> impl Iterator<Item = &BudgetClass> {
        self.classes.values()
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.classes.len()
    }
}

/// Errors while parsing or resolving release-owned budget classes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BudgetCatalogError {
    Duplicate(BudgetClassId),
    Invalid(String),
    Unknown(BudgetClassId),
    ZeroLimit(BudgetClassId),
}

impl Display for BudgetCatalogError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Duplicate(id) => write!(formatter, "duplicate BudgetClass id {id}"),
            Self::Invalid(message) => write!(formatter, "invalid BudgetClass catalog: {message}"),
            Self::Unknown(id) => write!(formatter, "unknown BudgetClass {id}"),
            Self::ZeroLimit(id) => {
                write!(formatter, "BudgetClass {id} has a zero resource bound")
            }
        }
    }
}

impl Error for BudgetCatalogError {}
