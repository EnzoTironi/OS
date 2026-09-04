//! Release-owned compute budget classes (`PolicyCatalog.computeBudgets`).

use std::{
    collections::BTreeMap,
    error::Error,
    fmt::{Display, Formatter},
};

use crate::{IdentifierError, ResourceId, parse_identifier};

pub const MAX_COMPUTE_DEADLINE_MILLIS: u64 = 30_000;
pub const MAX_COMPUTE_FUEL: u64 = 100_000_000;
pub const MAX_COMPUTE_INSTANCES: usize = 32;
pub const MAX_COMPUTE_MEMORIES: usize = 8;
pub const MAX_COMPUTE_MEMORY_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_COMPUTE_TABLE_ELEMENTS: usize = 100_000;
pub const MAX_COMPUTE_TABLES: usize = 32;

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

/// Server-selected resource ceilings bound by a `PolicyCatalog` entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BudgetClass {
    deadline_millis: u64,
    fuel: u64,
    id: BudgetClassId,
    instances: usize,
    memories: usize,
    memory_bytes: usize,
    priority: u32,
    resource_id: ResourceId,
    table_elements: usize,
    tables: usize,
}

pub struct BudgetClassSpec {
    pub deadline_millis: u64,
    pub fuel: u64,
    pub id: BudgetClassId,
    pub instances: usize,
    pub memories: usize,
    pub memory_bytes: usize,
    pub priority: u32,
    pub resource_id: ResourceId,
    pub table_elements: usize,
    pub tables: usize,
}

impl BudgetClass {
    /// Construct a validated budget class. Every bound must be nonzero.
    ///
    /// # Errors
    ///
    /// Returns [`BudgetCatalogError::ZeroLimit`] when any bound is zero.
    pub fn new(spec: BudgetClassSpec) -> Result<Self, BudgetCatalogError> {
        let BudgetClassSpec {
            deadline_millis,
            fuel,
            id,
            instances,
            memories,
            memory_bytes,
            priority,
            resource_id,
            table_elements,
            tables,
        } = spec;
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
        if priority == 0 {
            return Err(BudgetCatalogError::ZeroPriority(id));
        }
        require_bigint(&id, "fuel", fuel)?;
        require_bigint(&id, "deadlineMillis", deadline_millis)?;
        require_usize_bigint(&id, "memoryBytes", memory_bytes)?;
        require_usize_bigint(&id, "tableElements", table_elements)?;
        require_usize_bigint(&id, "instances", instances)?;
        require_usize_bigint(&id, "tables", tables)?;
        require_usize_bigint(&id, "memories", memories)?;
        require_platform_limit(&id, "fuel", fuel, MAX_COMPUTE_FUEL)?;
        require_platform_limit(
            &id,
            "deadlineMillis",
            deadline_millis,
            MAX_COMPUTE_DEADLINE_MILLIS,
        )?;
        require_platform_usize(&id, "memoryBytes", memory_bytes, MAX_COMPUTE_MEMORY_BYTES)?;
        require_platform_usize(
            &id,
            "tableElements",
            table_elements,
            MAX_COMPUTE_TABLE_ELEMENTS,
        )?;
        require_platform_usize(&id, "instances", instances, MAX_COMPUTE_INSTANCES)?;
        require_platform_usize(&id, "tables", tables, MAX_COMPUTE_TABLES)?;
        require_platform_usize(&id, "memories", memories, MAX_COMPUTE_MEMORIES)?;
        Ok(Self {
            deadline_millis,
            fuel,
            id,
            instances,
            memories,
            memory_bytes,
            priority,
            resource_id,
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
    pub fn priority(&self) -> u32 {
        self.priority
    }

    #[must_use]
    pub fn resource_id(&self) -> &ResourceId {
        &self.resource_id
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
        let mut priorities = BTreeMap::new();
        for class in classes {
            let id = class.id().clone();
            if let Some(existing) = priorities.insert(class.priority(), id.clone()) {
                return Err(BudgetCatalogError::DuplicatePriority {
                    first: existing,
                    priority: class.priority(),
                    second: id,
                });
            }
            if map.insert(id.clone(), class).is_some() {
                return Err(BudgetCatalogError::Duplicate(id));
            }
        }
        Ok(Self { classes: map })
    }

    /// Classes in deterministic server-selection order. Lower values win.
    #[must_use]
    pub fn selection_order(&self) -> Vec<&BudgetClass> {
        let mut classes = self.classes.values().collect::<Vec<_>>();
        classes.sort_by_key(|class| class.priority());
        classes
    }
}

/// Errors while parsing or resolving release-owned budget classes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BudgetCatalogError {
    Duplicate(BudgetClassId),
    DuplicatePriority {
        first: BudgetClassId,
        priority: u32,
        second: BudgetClassId,
    },
    Invalid(String),
    LimitExceedsBigInt {
        field: &'static str,
        id: BudgetClassId,
    },
    LimitExceedsPlatform {
        field: &'static str,
        id: BudgetClassId,
        maximum: u64,
    },
    ZeroLimit(BudgetClassId),
    ZeroPriority(BudgetClassId),
}

impl Display for BudgetCatalogError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Duplicate(id) => write!(formatter, "duplicate BudgetClass id {id}"),
            Self::DuplicatePriority {
                first,
                priority,
                second,
            } => write!(
                formatter,
                "BudgetClass {first} and {second} share selection priority {priority}"
            ),
            Self::Invalid(message) => write!(formatter, "invalid BudgetClass catalog: {message}"),
            Self::LimitExceedsBigInt { field, id } => {
                write!(formatter, "BudgetClass {id} field {field} exceeds BIGINT")
            }
            Self::LimitExceedsPlatform { field, id, maximum } => write!(
                formatter,
                "BudgetClass {id} field {field} exceeds platform maximum {maximum}"
            ),
            Self::ZeroLimit(id) => {
                write!(formatter, "BudgetClass {id} has a zero resource bound")
            }
            Self::ZeroPriority(id) => {
                write!(formatter, "BudgetClass {id} has zero selection priority")
            }
        }
    }
}

impl Error for BudgetCatalogError {}

fn require_bigint(
    id: &BudgetClassId,
    field: &'static str,
    value: u64,
) -> Result<(), BudgetCatalogError> {
    if i64::try_from(value).is_err() {
        return Err(BudgetCatalogError::LimitExceedsBigInt {
            field,
            id: id.clone(),
        });
    }
    Ok(())
}

fn require_usize_bigint(
    id: &BudgetClassId,
    field: &'static str,
    value: usize,
) -> Result<(), BudgetCatalogError> {
    let value = u64::try_from(value).map_err(|_| BudgetCatalogError::LimitExceedsBigInt {
        field,
        id: id.clone(),
    })?;
    require_bigint(id, field, value)
}

fn require_platform_limit(
    id: &BudgetClassId,
    field: &'static str,
    value: u64,
    maximum: u64,
) -> Result<(), BudgetCatalogError> {
    if value > maximum {
        return Err(BudgetCatalogError::LimitExceedsPlatform {
            field,
            id: id.clone(),
            maximum,
        });
    }
    Ok(())
}

fn require_platform_usize(
    id: &BudgetClassId,
    field: &'static str,
    value: usize,
    maximum: usize,
) -> Result<(), BudgetCatalogError> {
    let value = u64::try_from(value).map_err(|_| BudgetCatalogError::LimitExceedsPlatform {
        field,
        id: id.clone(),
        maximum: u64::MAX,
    })?;
    let maximum = u64::try_from(maximum).map_err(|_| {
        BudgetCatalogError::Invalid("platform maximum cannot be represented as u64".to_owned())
    })?;
    require_platform_limit(id, field, value, maximum)
}
