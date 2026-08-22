use std::error::Error;
use std::fmt::{Display, Formatter};

use sqlx::{PgPool, Row};

use super::PostgresAuthorityStore;

#[derive(Debug)]
pub enum IntegrityError {
    Query(sqlx::Error),
    MissingTable(String),
    RlsDisabled(String),
}

impl Display for IntegrityError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Query(error) => write!(formatter, "failed to verify semantic integrity: {error}"),
            Self::MissingTable(table) => {
                write!(formatter, "authority table {table} is missing")
            }
            Self::RlsDisabled(table) => {
                write!(formatter, "row-level security is disabled on {table}")
            }
        }
    }
}

impl Error for IntegrityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::MissingTable(_) | Self::RlsDisabled(_) => None,
        }
    }
}

impl PostgresAuthorityStore {
    pub async fn verify_integrity(
        &self,
        authority_tables: &[String],
        reference_tables: &[String],
        require_reference: bool,
    ) -> Result<(), IntegrityError> {
        for table in authority_tables {
            verify_table(&self.pool, table, true).await?;
        }
        for table in reference_tables {
            verify_table(&self.pool, table, require_reference).await?;
        }
        Ok(())
    }
}

async fn verify_table(pool: &PgPool, table: &str, required: bool) -> Result<(), IntegrityError> {
    let row = sqlx::query(
        "SELECT c.relrowsecurity AS relrowsecurity,
                c.relforcerowsecurity AS relforcerowsecurity
         FROM pg_class AS c
         JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relname = $1",
    )
    .bind(table)
    .fetch_optional(pool)
    .await
    .map_err(IntegrityError::Query)?;
    match row {
        None if required => Err(IntegrityError::MissingTable(table.to_owned())),
        None => Ok(()),
        Some(row) => {
            let rls = row
                .try_get::<bool, _>("relrowsecurity")
                .map_err(IntegrityError::Query)?;
            let force = row
                .try_get::<bool, _>("relforcerowsecurity")
                .map_err(IntegrityError::Query)?;
            if rls && force {
                Ok(())
            } else {
                Err(IntegrityError::RlsDisabled(table.to_owned()))
            }
        }
    }
}
