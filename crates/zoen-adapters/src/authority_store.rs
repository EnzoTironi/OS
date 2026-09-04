use std::{
    collections::HashSet,
    error::Error,
    fmt::{Display, Formatter},
};

use sqlx::{
    PgPool, Postgres, Row, Transaction,
    postgres::{PgPoolOptions, PgRow},
};
use zoen_core::{
    ActionApproval, ActionProposal, ActorId, CommitReceipt, CommitSequence, DefinitionActivation,
    DefinitionActivationKind, DefinitionDigest, DefinitionId, DefinitionPublication,
    DefinitionReference, DefinitionRevision, DefinitionRevisionNumber, EffectRequestId,
    EffectSnapshot, EvidenceClaim, EvidenceDraft, EvolutionClassification, ExecutionContext,
    ExplanationTarget, OperationId, PolicyDigest, PolicyEvidence, PolicyId, PolicyRevision,
    PolicyRevisionNumber, PrincipalId, ProposalId, TimestampMicros, WorkloadId, WorldId,
};
use zoen_engine::{
    AdmittedDefinitionActivation, AdmittedDefinitionPublication, AdmittedEvidence, AuthorityStore,
    CommitPreparation, EvidenceOperation, HistorySnapshot, StoreError,
};

use crate::{
    PostgresActionCommit, PostgresEffectUpdate, action_store, effect_store, evidence_store,
    history_store, i64_to_u64, migration_store, row_i64, row_string, row_to_revision,
    scenario_store, set_tenant, store_unavailable, u64_to_i64,
};

#[derive(Debug)]
pub enum PostgresInitError {
    Connect(sqlx::Error),
    Migrate(sqlx::migrate::MigrateError),
    Grant(sqlx::Error),
    ProjectionRoleBoundary(String),
}

impl Display for PostgresInitError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Connect(error) => write!(formatter, "failed to connect to PostgreSQL: {error}"),
            Self::Migrate(error) => write!(formatter, "failed to migrate PostgreSQL: {error}"),
            Self::Grant(error) => {
                write!(formatter, "failed to apply zoen_projection grants: {error}")
            }
            Self::ProjectionRoleBoundary(reason) => write!(
                formatter,
                "ZOEN_PROJECTION_DATABASE_URL violates the projection role boundary: {reason}"
            ),
        }
    }
}

impl Error for PostgresInitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Connect(error) | Self::Grant(error) => Some(error),
            Self::Migrate(error) => Some(error),
            Self::ProjectionRoleBoundary(_) => None,
        }
    }
}

#[derive(Clone)]
pub struct PostgresAuthorityStore {
    pub(crate) pool: PgPool,
}

impl PostgresAuthorityStore {
    /// Connect and apply the adapter schema.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError`] when the pool cannot connect, migrate, or
    /// apply `zoen_projection` grants.
    pub async fn connect(database_url: &str) -> Result<Self, PostgresInitError> {
        let store = Self::connect_pool(database_url).await?;
        sqlx::migrate!("./migrations")
            .run(&store.pool)
            .await
            .map_err(PostgresInitError::Migrate)?;
        store.apply_projection_role_grants().await?;
        Ok(store)
    }

    /// Open a pool without running migrations.
    ///
    /// Use after `connect` has already applied the schema, so a
    /// least-privilege role such as `zoen_projection` can work without
    /// CREATE/ALTER rights.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Connect`] when `PostgreSQL` is unreachable.
    pub async fn connect_pool(database_url: &str) -> Result<Self, PostgresInitError> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(database_url)
            .await
            .map_err(PostgresInitError::Connect)?;
        Ok(Self { pool })
    }

    #[must_use]
    pub fn pool(&self) -> PgPool {
        self.pool.clone()
    }

    /// Re-apply `zoen_projection` table grants when that role exists.
    ///
    /// `SQLx` records each migration once. A role created later still needs the
    /// current full-state GRANT/REVOKE on the next `connect`. When the allowlist
    /// evolves, add a migration and repoint this method instead of editing `0027`.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Grant`] when the GRANT/REVOKE statements fail.
    pub async fn apply_projection_role_grants(&self) -> Result<(), PostgresInitError> {
        sqlx::query(include_str!(
            "../migrations/0027_projection_role_boundary.sql"
        ))
        .execute(&self.pool)
        .await
        .map_err(PostgresInitError::Grant)?;
        Ok(())
    }

    /// Fail closed unless this pool has exactly the projection role's capabilities.
    ///
    /// Call on the worker pool after `ZOEN_PROJECTION_DATABASE_URL` is set
    /// so an empty, privileged, or drifted role cannot start the projection process.
    ///
    /// # Errors
    ///
    /// Returns [`PostgresInitError::Connect`] when privilege lookup fails, or
    /// [`PostgresInitError::ProjectionRoleBoundary`] when the effective role
    /// differs from the allowlist.
    pub async fn require_projection_role_boundary(&self) -> Result<(), PostgresInitError> {
        match projection_role_violation(&self.pool)
            .await
            .map_err(PostgresInitError::Connect)?
        {
            Some(reason) => Err(PostgresInitError::ProjectionRoleBoundary(reason)),
            None => Ok(()),
        }
    }
}

const PROJECTION_READ_TABLES: [&str; 6] = [
    "authority_commits",
    "authority_heads",
    "projection_manifests",
    "projection_outbox",
    "projection_watermarks",
    "semantic_claims",
];

const PROJECTION_MANIFEST_INSERT_COLUMNS: [&str; 9] = [
    "build_id",
    "from_commit",
    "manifest_digest",
    "manifest_object_key",
    "parquet_digest",
    "parquet_object_key",
    "projection_id",
    "tenant_id",
    "through_commit",
];

const PROJECTION_WATERMARK_INSERT_COLUMNS: [&str; 4] = [
    "manifest_digest",
    "projection_id",
    "tenant_id",
    "through_commit",
];

const PROJECTION_WATERMARK_UPDATE_COLUMNS: [&str; 3] =
    ["manifest_digest", "through_commit", "updated_at"];

async fn projection_role_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    if let Some(reason) = projection_role_identity_violation(pool).await? {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_database_violation(pool).await? {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_schema_violation(pool).await? {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_column_violation(projection_columns(pool).await?) {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_table_violation(pool).await? {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_sequence_violation(pool).await? {
        return Ok(Some(reason));
    }
    if let Some(reason) = projection_default_acl_violation(pool).await? {
        return Ok(Some(reason));
    }
    projection_routine_violation(pool).await
}

async fn projection_role_identity_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let role = sqlx::query(
        "SELECT current_user AS current_role, session_user AS session_role,
                rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
                rolreplication, rolbypassrls
         FROM pg_catalog.pg_roles
         WHERE rolname = current_user",
    )
    .fetch_optional(pool)
    .await?;
    let Some(role) = role else {
        return Ok(Some("current role is absent from pg_roles".to_owned()));
    };
    let current_role = role.try_get::<String, _>("current_role")?;
    let session_role = role.try_get::<String, _>("session_role")?;
    if current_role != "zoen_projection" || session_role != "zoen_projection" {
        return Ok(Some(format!(
            "current_user and session_user must both be zoen_projection, got {current_role} and {session_role}"
        )));
    }
    let forbidden_role_attributes = [
        ("SUPERUSER", role.try_get::<bool, _>("rolsuper")?),
        ("INHERIT", role.try_get::<bool, _>("rolinherit")?),
        ("CREATEROLE", role.try_get::<bool, _>("rolcreaterole")?),
        ("CREATEDB", role.try_get::<bool, _>("rolcreatedb")?),
        ("REPLICATION", role.try_get::<bool, _>("rolreplication")?),
        ("BYPASSRLS", role.try_get::<bool, _>("rolbypassrls")?),
    ];
    if !role.try_get::<bool, _>("rolcanlogin")? {
        return Ok(Some("zoen_projection must be a LOGIN role".to_owned()));
    }
    if let Some((attribute, _)) = forbidden_role_attributes
        .iter()
        .find(|(_, enabled)| *enabled)
    {
        return Ok(Some(format!("zoen_projection must not have {attribute}")));
    }

    let has_membership: bool = sqlx::query_scalar(
        "SELECT EXISTS (
             SELECT 1
             FROM pg_catalog.pg_auth_members membership
             JOIN pg_catalog.pg_roles member ON member.oid = membership.member
             WHERE member.rolname = current_user
         )",
    )
    .fetch_one(pool)
    .await?;
    if has_membership {
        return Ok(Some(
            "zoen_projection must not be a member of another role".to_owned(),
        ));
    }
    Ok(None)
}

async fn projection_database_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let databases = sqlx::query(
        "SELECT database.datname,
             database.datname = pg_catalog.current_database() AS is_current,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'CONNECT'
             ) AS can_connect,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'CREATE'
             ) AS can_create,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'TEMPORARY'
             ) AS can_temp,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'CONNECT WITH GRANT OPTION'
             ) AS can_grant_connect,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'CREATE WITH GRANT OPTION'
             ) AS can_grant_create,
             pg_catalog.has_database_privilege(
                 current_user, database.oid, 'TEMPORARY WITH GRANT OPTION'
             ) AS can_grant_temp
         FROM pg_catalog.pg_database database
         WHERE database.datallowconn
         ORDER BY database.datname",
    )
    .fetch_all(pool)
    .await?;
    for database in databases {
        let name = database.try_get::<String, _>("datname")?;
        let expected_connect = name == "zoen" && database.try_get::<bool, _>("is_current")?;
        let can_connect = database.try_get::<bool, _>("can_connect")?;
        let forbidden = database.try_get::<bool, _>("can_create")?
            || database.try_get::<bool, _>("can_temp")?
            || database.try_get::<bool, _>("can_grant_connect")?
            || database.try_get::<bool, _>("can_grant_create")?
            || database.try_get::<bool, _>("can_grant_temp")?;
        if can_connect != expected_connect || forbidden {
            return Ok(Some(format!(
                "database {name} has CONNECT={can_connect}, expected {expected_connect}, or a forbidden CREATE, TEMPORARY, or grant option"
            )));
        }
    }
    Ok(None)
}

async fn projection_schema_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let schemas = sqlx::query(
        "SELECT nspname,
                pg_catalog.has_schema_privilege(current_user, oid, 'USAGE') AS can_use,
                pg_catalog.has_schema_privilege(current_user, oid, 'CREATE') AS can_create,
                pg_catalog.has_schema_privilege(
                    current_user, oid, 'USAGE WITH GRANT OPTION'
                ) AS can_grant_use,
                pg_catalog.has_schema_privilege(
                    current_user, oid, 'CREATE WITH GRANT OPTION'
                ) AS can_grant_create
         FROM pg_catalog.pg_namespace
         WHERE nspname <> 'information_schema'
           AND nspname !~ '^pg_'
         ORDER BY nspname",
    )
    .fetch_all(pool)
    .await?;
    let mut found_public = false;
    for schema in schemas {
        let name = schema.try_get::<String, _>("nspname")?;
        let can_use = schema.try_get::<bool, _>("can_use")?;
        let can_create = schema.try_get::<bool, _>("can_create")?;
        let can_grant = schema.try_get::<bool, _>("can_grant_use")?
            || schema.try_get::<bool, _>("can_grant_create")?;
        if name == "public" {
            found_public = true;
            if !can_use || can_create || can_grant {
                return Ok(Some(
                    "public schema requires USAGE without CREATE or grant option".to_owned(),
                ));
            }
        } else if can_use || can_create || can_grant {
            return Ok(Some(format!("unexpected schema capability on {name}")));
        }
    }
    if !found_public {
        return Ok(Some("public schema is missing".to_owned()));
    }
    Ok(None)
}

struct ProjectionColumnCapability {
    schema: String,
    table: String,
    name: String,
    select: EffectiveCapability,
    insert: EffectiveCapability,
    update: EffectiveCapability,
    references: EffectiveCapability,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum EffectiveCapability {
    Denied,
    Granted,
    Grantable,
}

impl From<bool> for EffectiveCapability {
    fn from(expected: bool) -> Self {
        if expected {
            Self::Granted
        } else {
            Self::Denied
        }
    }
}

impl EffectiveCapability {
    fn new(granted: bool, grantable: bool) -> Self {
        if grantable {
            Self::Grantable
        } else {
            granted.into()
        }
    }
}

async fn projection_columns(pool: &PgPool) -> Result<Vec<ProjectionColumnCapability>, sqlx::Error> {
    let columns = sqlx::query(
        "SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
                attribute.attname AS column_name,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum, 'SELECT'
                )
                    AS can_select,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum, 'INSERT'
                )
                    AS can_insert,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum, 'UPDATE'
                )
                    AS can_update,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum, 'REFERENCES'
                ) AS can_reference,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum,
                    'SELECT WITH GRANT OPTION'
                ) AS can_grant_select,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum,
                    'INSERT WITH GRANT OPTION'
                ) AS can_grant_insert,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum,
                    'UPDATE WITH GRANT OPTION'
                ) AS can_grant_update,
                pg_catalog.has_column_privilege(
                    current_user, relation.oid, attribute.attnum,
                    'REFERENCES WITH GRANT OPTION'
                ) AS can_grant_reference
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
         JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
         WHERE namespace.nspname <> 'information_schema'
           AND namespace.nspname !~ '^pg_'
           AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
           AND attribute.attnum > 0
           AND NOT attribute.attisdropped
         ORDER BY namespace.nspname, relation.relname, attribute.attnum",
    )
    .fetch_all(pool)
    .await?;
    columns
        .into_iter()
        .map(|column| {
            Ok(ProjectionColumnCapability {
                schema: column.try_get("schema_name")?,
                table: column.try_get("table_name")?,
                name: column.try_get("column_name")?,
                select: EffectiveCapability::new(
                    column.try_get("can_select")?,
                    column.try_get("can_grant_select")?,
                ),
                insert: EffectiveCapability::new(
                    column.try_get("can_insert")?,
                    column.try_get("can_grant_insert")?,
                ),
                update: EffectiveCapability::new(
                    column.try_get("can_update")?,
                    column.try_get("can_grant_update")?,
                ),
                references: EffectiveCapability::new(
                    column.try_get("can_reference")?,
                    column.try_get("can_grant_reference")?,
                ),
            })
        })
        .collect()
}

fn projection_column_violation(columns: Vec<ProjectionColumnCapability>) -> Option<String> {
    let mut found_read_tables = HashSet::new();
    for column in columns {
        let expected_select =
            column.schema == "public" && PROJECTION_READ_TABLES.contains(&column.table.as_str());
        if expected_select {
            found_read_tables.insert(column.table.clone());
        }
        let expected_insert = column.schema == "public"
            && ((column.table == "projection_manifests"
                && PROJECTION_MANIFEST_INSERT_COLUMNS.contains(&column.name.as_str()))
                || (column.table == "projection_watermarks"
                    && PROJECTION_WATERMARK_INSERT_COLUMNS.contains(&column.name.as_str())));
        let expected_update = column.schema == "public"
            && column.table == "projection_watermarks"
            && PROJECTION_WATERMARK_UPDATE_COLUMNS.contains(&column.name.as_str());
        let actual = [
            ("SELECT", column.select, expected_select.into()),
            ("INSERT", column.insert, expected_insert.into()),
            ("UPDATE", column.update, expected_update.into()),
            ("REFERENCES", column.references, false.into()),
        ];
        if let Some((privilege, enabled, expected)) = actual
            .iter()
            .find(|(_, enabled, expected)| enabled != expected)
        {
            let qualifier = format!("{}.{}.{}", column.schema, column.table, column.name);
            return Some(format!(
                "{privilege} on {qualifier} is {enabled:?}, expected {expected:?}"
            ));
        }
    }
    for table in PROJECTION_READ_TABLES {
        if !found_read_tables.contains(table) {
            return Some(format!(
                "required projection table public.{table} is missing"
            ));
        }
    }
    None
}

async fn projection_table_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let privileges = sqlx::query(
        "SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
                privilege.name AS privilege_name,
                pg_catalog.has_table_privilege(
                    current_user, relation.oid, privilege.name
                ) AS granted,
                pg_catalog.has_table_privilege(
                    current_user, relation.oid,
                    privilege.name || ' WITH GRANT OPTION'
                ) AS grantable,
                relation.relrowsecurity,
                relation.relforcerowsecurity,
                pg_catalog.row_security_active(relation.oid) AS row_security_active,
                relation.relowner = (
                    SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user
                ) AS role_owns_table
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
         CROSS JOIN (
             VALUES
                 ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                 ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
         ) AS privilege(name)
         WHERE namespace.nspname <> 'information_schema'
           AND namespace.nspname !~ '^pg_'
           AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         ORDER BY namespace.nspname, relation.relname, privilege.name",
    )
    .fetch_all(pool)
    .await?;
    for privilege in privileges {
        let schema = privilege.try_get::<String, _>("schema_name")?;
        let table = privilege.try_get::<String, _>("table_name")?;
        let name = privilege.try_get::<String, _>("privilege_name")?;
        let expected = schema == "public"
            && name == "SELECT"
            && PROJECTION_READ_TABLES.contains(&table.as_str());
        let actual = EffectiveCapability::new(
            privilege.try_get("granted")?,
            privilege.try_get("grantable")?,
        );
        if actual != expected.into() {
            return Ok(Some(format!(
                "table-level {name} on {schema}.{table} is {actual:?}, expected {:?}",
                EffectiveCapability::from(expected)
            )));
        }
        if expected
            && (!privilege.try_get::<bool, _>("relrowsecurity")?
                || !privilege.try_get::<bool, _>("relforcerowsecurity")?
                || !privilege.try_get::<bool, _>("row_security_active")?
                || privilege.try_get::<bool, _>("role_owns_table")?)
        {
            return Ok(Some(format!(
                "public.{table} must enforce RLS and have a different owner"
            )));
        }
    }
    Ok(None)
}

async fn projection_sequence_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let privileged_sequence = sqlx::query(
        "SELECT namespace.nspname AS schema_name, relation.relname AS sequence_name
         FROM pg_catalog.pg_class relation
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname <> 'information_schema'
           AND namespace.nspname !~ '^pg_'
           AND relation.relkind = 'S'
           AND (pg_catalog.has_sequence_privilege(current_user, relation.oid, 'USAGE')
                OR pg_catalog.has_sequence_privilege(current_user, relation.oid, 'SELECT')
                OR pg_catalog.has_sequence_privilege(current_user, relation.oid, 'UPDATE'))
         ORDER BY namespace.nspname, relation.relname
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    if let Some(sequence) = privileged_sequence {
        return Ok(Some(format!(
            "unexpected sequence capability on {}.{}",
            sequence.try_get::<String, _>("schema_name")?,
            sequence.try_get::<String, _>("sequence_name")?,
        )));
    }
    Ok(None)
}

async fn projection_default_acl_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    let default_acl = sqlx::query(
        "SELECT defaults.defaclobjtype, owner.rolname AS owner_name,
                COALESCE(namespace.nspname, '') AS schema_name,
                acl.privilege_type
         FROM pg_catalog.pg_default_acl defaults
         JOIN pg_catalog.pg_roles owner ON owner.oid = defaults.defaclrole
         LEFT JOIN pg_catalog.pg_namespace namespace
           ON namespace.oid = defaults.defaclnamespace
         CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) acl
         WHERE defaults.defaclobjtype IN ('r', 'S')
           AND acl.grantee IN (
               0,
               (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
           )
         ORDER BY owner.rolname, namespace.nspname, defaults.defaclobjtype
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    if let Some(default_acl) = default_acl {
        return Ok(Some(format!(
            "unexpected default {} privilege for owner {} in schema {}",
            default_acl.try_get::<String, _>("privilege_type")?,
            default_acl.try_get::<String, _>("owner_name")?,
            default_acl.try_get::<String, _>("schema_name")?,
        )));
    }
    Ok(None)
}

async fn projection_routine_violation(pool: &PgPool) -> Result<Option<String>, sqlx::Error> {
    // SECURITY INVOKER routines cannot exceed the effective capabilities checked
    // above. An executable SECURITY DEFINER routine could, so none are allowed.
    let routine = sqlx::query(
        "SELECT namespace.nspname AS schema_name,
                routine.oid::pg_catalog.regprocedure::text AS routine_name
         FROM pg_catalog.pg_proc routine
         JOIN pg_catalog.pg_namespace namespace ON namespace.oid = routine.pronamespace
         WHERE namespace.nspname <> 'information_schema'
           AND namespace.nspname !~ '^pg_'
           AND routine.prosecdef
           AND pg_catalog.has_schema_privilege(current_user, namespace.oid, 'USAGE')
           AND pg_catalog.has_function_privilege(current_user, routine.oid, 'EXECUTE')
         ORDER BY namespace.nspname, routine.oid::pg_catalog.regprocedure::text
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    if let Some(routine) = routine {
        return Ok(Some(format!(
            "unexpected routine EXECUTE on {}.{}",
            routine.try_get::<String, _>("schema_name")?,
            routine.try_get::<String, _>("routine_name")?,
        )));
    }
    Ok(None)
}

impl AuthorityStore for PostgresAuthorityStore {
    type ActionCommit = PostgresActionCommit;
    type EffectUpdate = PostgresEffectUpdate;

    async fn activate_revision(
        &self,
        activation: &AdmittedDefinitionActivation,
    ) -> Result<DefinitionActivation, StoreError> {
        let context = activation.context();
        let target = activation.target();
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.world_id()).await?;
        let next_sequence = persist_activation(&mut transaction, activation).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(DefinitionActivation {
            activated_at: activation.activated_at(),
            activated_by: context.actor_id().clone(),
            active: DefinitionReference {
                definition_id: target.definition_id.clone(),
                digest: target.digest.clone(),
                revision: target.revision,
            },
            classification: activation.classification(),
            commit_sequence: CommitSequence::new(i64_to_u64(
                next_sequence,
                "activation commit sequence",
            )?)
            .ok_or_else(|| StoreError::Corrupt("zero activation commit sequence".to_owned()))?,
            kind: activation.kind(),
            migration_operation_id: activation.migration_operation_id().cloned(),
            policy: activation.policy().clone(),
            previous: activation.previous().cloned(),
            principal_id: context.principal_id().clone(),
            workload_id: context.workload_id().clone(),
        })
    }

    async fn apply_migration_batch(
        &self,
        batch: &zoen_engine::AdmittedMigrationBatch,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::apply(self, batch).await
    }

    async fn begin_action_commit(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<CommitPreparation<Self::ActionCommit>, StoreError> {
        action_store::begin_action_commit(&self.pool, context, proposal).await
    }

    async fn get_approval(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<Option<ActionApproval>, StoreError> {
        action_store::get_approval(&self.pool, context, proposal_id).await
    }

    async fn get_active_revision(
        &self,
        world_id: &WorldId,
        definition_id: &DefinitionId,
    ) -> Result<Option<DefinitionRevision>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, world_id).await?;
        let row = sqlx::query(
            "SELECT revision.definition_id, revision.revision, revision.digest,
                    revision.canonical_json, revision.commit_sequence
             FROM active_definition_revisions AS active
             JOIN definition_revisions AS revision
               ON revision.tenant_id = active.tenant_id
              AND revision.definition_id = active.definition_id
              AND revision.digest = active.digest
              AND revision.revision = active.revision
             WHERE active.tenant_id = $1 AND active.definition_id = $2",
        )
        .bind(world_id.as_str())
        .bind(definition_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let revision = row.as_ref().map(row_to_revision).transpose()?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
    }

    async fn get_active_activation(
        &self,
        world_id: &WorldId,
        definition_id: &DefinitionId,
    ) -> Result<Option<DefinitionActivation>, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, world_id).await?;
        let row = sqlx::query(
            "SELECT activation.definition_id, activation.revision, activation.digest,
                    activation.previous_revision, activation.previous_digest,
                    activation.commit_sequence, activation.activated_at_micros,
                    activation.actor_id, activation.principal_id, activation.workload_id,
                    activation.policy_id, activation.policy_revision, activation.policy_digest,
                    activation.determining_policies, activation.classification,
                    activation.activation_kind, activation.migration_operation_id
             FROM active_definition_revisions AS active
             JOIN definition_activations AS activation
               ON activation.tenant_id = active.tenant_id
              AND activation.definition_id = active.definition_id
              AND activation.digest = active.digest
              AND activation.revision = active.revision
              AND activation.commit_sequence = active.activation_commit_sequence
             WHERE active.tenant_id = $1 AND active.definition_id = $2",
        )
        .bind(world_id.as_str())
        .bind(definition_id.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?;
        let activation = row.as_ref().map(row_to_activation).transpose()?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(activation)
    }

    async fn get_migration(
        &self,
        world_id: &WorldId,
        operation_id: &OperationId,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::get(self, world_id, operation_id).await
    }

    async fn get_completed_migration(
        &self,
        world_id: &WorldId,
        from: &DefinitionReference,
        to: &DefinitionReference,
    ) -> Result<Option<zoen_core::MigrationProgress>, StoreError> {
        migration_store::completed(self, world_id, from, to).await
    }

    async fn begin_effect_update(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<Self::EffectUpdate, StoreError> {
        effect_store::begin(&self.pool, context, effect_request_id).await
    }

    async fn get_effect(
        &self,
        context: &ExecutionContext,
        effect_request_id: &EffectRequestId,
    ) -> Result<EffectSnapshot, StoreError> {
        effect_store::get(&self.pool, context, effect_request_id).await
    }

    async fn get_operation(
        &self,
        context: &ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<CommitReceipt, StoreError> {
        action_store::get_operation(&self.pool, context, operation_id).await
    }

    async fn load_history(
        &self,
        context: &ExecutionContext,
        target: &ExplanationTarget,
    ) -> Result<HistorySnapshot, StoreError> {
        history_store::load(&self.pool, context, target).await
    }

    async fn get_proposal(
        &self,
        context: &ExecutionContext,
        proposal_id: &ProposalId,
    ) -> Result<ActionProposal, StoreError> {
        action_store::get_proposal(&self.pool, context, proposal_id).await
    }

    async fn publish(
        &self,
        publication: &AdmittedDefinitionPublication,
    ) -> Result<DefinitionPublication, StoreError> {
        let context = publication.context();
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, context.world_id()).await?;
        let revision = persist_publication(&mut transaction, publication).await?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
    }

    async fn prepare_migration(
        &self,
        migration: &zoen_engine::AdmittedMigrationPlan,
    ) -> Result<zoen_core::MigrationProgress, StoreError> {
        migration_store::prepare(self, migration).await
    }

    async fn preflight_migration_batch(
        &self,
        world_id: &WorldId,
        operation_id: &OperationId,
        batch_index: u32,
        intent_digest: &zoen_core::IntentDigest,
    ) -> Result<zoen_engine::MigrationBatchPreflight, StoreError> {
        migration_store::preflight(self, world_id, operation_id, batch_index, intent_digest).await
    }

    async fn get_evidence_operation(
        &self,
        context: &ExecutionContext,
        operation_id: &OperationId,
    ) -> Result<Option<EvidenceOperation>, StoreError> {
        evidence_store::get_operation(self, context, operation_id).await
    }

    async fn get_revision(
        &self,
        world_id: &WorldId,
        definition_id: &DefinitionId,
        digest: &DefinitionDigest,
    ) -> Result<DefinitionRevision, StoreError> {
        let mut transaction = self.pool.begin().await.map_err(store_unavailable)?;
        set_tenant(&mut transaction, world_id).await?;
        let row = sqlx::query(
            "SELECT definition_id, revision, digest, canonical_json, commit_sequence
             FROM definition_revisions
             WHERE tenant_id = $1 AND definition_id = $2 AND digest = $3",
        )
        .bind(world_id.as_str())
        .bind(definition_id.as_str())
        .bind(digest.as_str())
        .fetch_optional(&mut *transaction)
        .await
        .map_err(store_unavailable)?
        .ok_or(StoreError::NotFound)?;
        let revision = row_to_revision(&row)?;
        transaction.commit().await.map_err(store_unavailable)?;
        Ok(revision)
    }

    async fn record_evidence(
        &self,
        context: &ExecutionContext,
        evidence: &AdmittedEvidence,
        operation: Option<(&OperationId, &zoen_core::IntentDigest)>,
    ) -> Result<EvidenceClaim, StoreError> {
        evidence_store::record(self, context, evidence, operation).await
    }

    async fn record_evidence_batch(
        &self,
        context: &ExecutionContext,
        evidence: &[AdmittedEvidence],
        operation: Option<(&OperationId, &zoen_core::IntentDigest)>,
    ) -> Result<Vec<EvidenceClaim>, StoreError> {
        evidence_store::record_batch(self, context, evidence, operation).await
    }

    async fn save_approval(
        &self,
        context: &ExecutionContext,
        approval: &ActionApproval,
    ) -> Result<ActionApproval, StoreError> {
        action_store::save_approval(&self.pool, context, approval).await
    }

    async fn save_proposal(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
    ) -> Result<ActionProposal, StoreError> {
        action_store::save_proposal(&self.pool, context, proposal).await
    }

    async fn save_proposal_in_scenario(
        &self,
        context: &ExecutionContext,
        proposal: &ActionProposal,
        overlay_drafts: &[EvidenceDraft],
    ) -> Result<ActionProposal, StoreError> {
        scenario_store::save_proposal_in_scenario(&self.pool, context, proposal, overlay_drafts)
            .await
    }

    async fn current_head(&self, context: &ExecutionContext) -> Result<CommitSequence, StoreError> {
        scenario_store::current_head(&self.pool, context).await
    }

    async fn insert_open_scenario(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
        base: CommitSequence,
    ) -> Result<zoen_engine::Scenario, StoreError> {
        scenario_store::insert_open_scenario(&self.pool, context, scenario_id, base).await
    }

    async fn get_scenario(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
    ) -> Result<zoen_engine::Scenario, StoreError> {
        scenario_store::get_scenario(&self.pool, context, scenario_id).await
    }

    async fn mark_scenario_discarded(
        &self,
        context: &ExecutionContext,
        scenario_id: &zoen_core::ScenarioId,
    ) -> Result<(), StoreError> {
        scenario_store::mark_scenario_discarded(&self.pool, context, scenario_id).await
    }

    async fn commit_scenario_package(
        &self,
        context: &ExecutionContext,
        scenario: &zoen_engine::Scenario,
        plans: &[zoen_engine::ScenarioProposalPlan],
    ) -> Result<CommitSequence, StoreError> {
        scenario_store::commit_scenario_package(&self.pool, context, scenario, plans).await
    }

    async fn revision_was_active(
        &self,
        world_id: &WorldId,
        revision: &DefinitionReference,
    ) -> Result<bool, StoreError> {
        migration_store::revision_was_active(self, world_id, revision).await
    }
}

async fn persist_activation(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
) -> Result<i64, StoreError> {
    let head = lock_activation_head(transaction, activation).await?;
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    insert_commit_kind(
        transaction,
        activation.context().world_id(),
        next_sequence,
        "definition_activation",
    )
    .await?;
    insert_activation_row(transaction, activation, next_sequence).await?;
    insert_activation_grants(
        transaction,
        activation.context().world_id(),
        next_sequence,
        activation.context(),
    )
    .await?;
    project_activation(transaction, activation, next_sequence).await?;
    Ok(next_sequence)
}

async fn lock_activation_head(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
) -> Result<i64, StoreError> {
    let context = activation.context();
    let target = activation.target();
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .ok_or(StoreError::NotFound)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;
    let published = sqlx::query(
        "SELECT 1
         FROM definition_revisions
         WHERE tenant_id = $1
           AND definition_id = $2
           AND digest = $3
           AND revision = $4
         FOR SHARE",
    )
    .bind(context.world_id().as_str())
    .bind(target.definition_id.as_str())
    .bind(target.digest.as_str())
    .bind(u64_to_i64(target.revision.get(), "definition revision")?)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if published.is_none() {
        return Err(StoreError::NotFound);
    }
    let current = sqlx::query(
        "SELECT definition_id, digest, revision
         FROM active_definition_revisions
         WHERE tenant_id = $1 AND definition_id = $2
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .bind(target.definition_id.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .map(|row| row_to_reference(&row))
    .transpose()?;
    if current.as_ref() != activation.previous() {
        return Err(StoreError::StalePrecondition);
    }
    if current.as_ref().is_some_and(|current| {
        current.digest == target.digest && current.revision == target.revision
    }) {
        return Err(StoreError::StalePrecondition);
    }
    migration_store::validate_activation(transaction, activation).await?;
    Ok(head)
}

async fn insert_activation_row(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = activation.context();
    let target = activation.target();
    let previous_revision = activation
        .previous()
        .map(|previous| u64_to_i64(previous.revision.get(), "previous definition revision"))
        .transpose()?;
    let previous_digest = activation
        .previous()
        .map(|previous| previous.digest.as_str());
    let policy = activation.policy();
    sqlx::query(
        "INSERT INTO definition_activations (
            tenant_id, definition_id, revision, digest,
            previous_revision, previous_digest, commit_sequence,
            activated_at_micros, actor_id, principal_id, workload_id,
            policy_id, policy_revision, policy_digest, determining_policies,
            classification, activation_kind, migration_operation_id
         ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18
         )",
    )
    .bind(context.world_id().as_str())
    .bind(target.definition_id.as_str())
    .bind(u64_to_i64(target.revision.get(), "definition revision")?)
    .bind(target.digest.as_str())
    .bind(previous_revision)
    .bind(previous_digest)
    .bind(next_sequence)
    .bind(activation.activated_at().get())
    .bind(context.actor_id().as_str())
    .bind(context.principal_id().as_str())
    .bind(context.workload_id().as_str())
    .bind(policy.revision.id.as_str())
    .bind(u64_to_i64(
        policy.revision.revision.get(),
        "policy revision",
    )?)
    .bind(policy.revision.digest.as_str())
    .bind(&policy.determining_policies)
    .bind(
        activation
            .classification()
            .map(zoen_core::EvolutionClassification::as_str),
    )
    .bind(activation.kind().as_str())
    .bind(activation.migration_operation_id().map(OperationId::as_str))
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn project_activation(
    transaction: &mut Transaction<'_, Postgres>,
    activation: &AdmittedDefinitionActivation,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = activation.context();
    let target = activation.target();
    sqlx::query(
        "INSERT INTO active_definition_revisions (
            tenant_id, definition_id, revision, digest, activation_commit_sequence
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, definition_id)
         DO UPDATE SET
            revision = EXCLUDED.revision,
            digest = EXCLUDED.digest,
            activation_commit_sequence = EXCLUDED.activation_commit_sequence",
    )
    .bind(context.world_id().as_str())
    .bind(target.definition_id.as_str())
    .bind(u64_to_i64(target.revision.get(), "definition revision")?)
    .bind(target.digest.as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    insert_projection_event(transaction, context.world_id(), next_sequence, activation).await?;
    advance_authority_head(transaction, context.world_id(), next_sequence).await
}

async fn persist_publication(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &AdmittedDefinitionPublication,
) -> Result<DefinitionPublication, StoreError> {
    let context = publication.context();
    sqlx::query(
        "INSERT INTO authority_heads (tenant_id, commit_sequence)
         VALUES ($1, 0)
         ON CONFLICT (tenant_id) DO NOTHING",
    )
    .bind(context.world_id().as_str())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let head = sqlx::query(
        "SELECT commit_sequence
         FROM authority_heads
         WHERE tenant_id = $1
         FOR UPDATE",
    )
    .bind(context.world_id().as_str())
    .fetch_one(&mut **transaction)
    .await
    .map_err(store_unavailable)?
    .try_get::<i64, _>("commit_sequence")
    .map_err(store_unavailable)?;
    if let Some(existing) = existing_publication(transaction, publication).await? {
        return Ok(existing);
    }
    let revision_conflict = sqlx::query(
        "SELECT digest
         FROM definition_revisions
         WHERE tenant_id = $1 AND definition_id = $2 AND revision = $3",
    )
    .bind(context.world_id().as_str())
    .bind(publication.definition_id().as_str())
    .bind(u64_to_i64(publication.revision().get(), "revision")?)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if revision_conflict.is_some() {
        return Err(StoreError::Conflict(
            "revision number already identifies different content".to_owned(),
        ));
    }
    let next_sequence = head
        .checked_add(1)
        .ok_or_else(|| StoreError::Corrupt("commit sequence overflow".to_owned()))?;
    insert_published_revision(transaction, publication, next_sequence).await?;
    let revision = DefinitionRevision {
        canonical_json: publication.canonical_json().clone(),
        commit_sequence: CommitSequence::new(
            u64::try_from(next_sequence)
                .map_err(|_| StoreError::Corrupt("negative commit sequence".to_owned()))?,
        )
        .ok_or_else(|| StoreError::Corrupt("zero commit sequence".to_owned()))?,
        definition_id: publication.definition_id().clone(),
        digest: publication.digest().clone(),
        revision: publication.revision(),
    };
    Ok(DefinitionPublication {
        policy: publication.policy().clone(),
        principal_id: context.principal_id().clone(),
        published_at: publication.published_at(),
        published_by: context.actor_id().clone(),
        revision,
        workload_id: context.workload_id().clone(),
    })
}

async fn existing_publication(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &AdmittedDefinitionPublication,
) -> Result<Option<DefinitionPublication>, StoreError> {
    let context = publication.context();
    let existing = sqlx::query(
        "SELECT revision.definition_id, revision.revision, revision.digest,
                revision.canonical_json, revision.commit_sequence,
                publication.commit_sequence AS publication_commit_sequence,
                publication.published_at_micros, publication.actor_id,
                publication.principal_id, publication.workload_id,
                publication.policy_id, publication.policy_revision,
                publication.policy_digest, publication.determining_policies
         FROM definition_revisions AS revision
         LEFT JOIN definition_publications AS publication
           ON publication.tenant_id = revision.tenant_id
          AND publication.definition_id = revision.definition_id
          AND publication.digest = revision.digest
          AND publication.revision = revision.revision
          AND publication.commit_sequence = revision.commit_sequence
         WHERE revision.tenant_id = $1
           AND revision.definition_id = $2
           AND revision.digest = $3",
    )
    .bind(context.world_id().as_str())
    .bind(publication.definition_id().as_str())
    .bind(publication.digest().as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    let Some(row) = existing else {
        return Ok(None);
    };
    let revision = row_to_revision(&row)?;
    if revision.revision != publication.revision()
        || &revision.canonical_json != publication.canonical_json()
    {
        return Err(StoreError::Corrupt(
            "content-addressed revision has different content".to_owned(),
        ));
    }
    let publication_commit_sequence = row
        .try_get::<Option<i64>, _>("publication_commit_sequence")
        .map_err(store_unavailable)?
        .ok_or_else(|| {
            StoreError::Corrupt(
                "definition revision is missing governed publication evidence".to_owned(),
            )
        })?;
    if publication_commit_sequence
        != u64_to_i64(
            revision.commit_sequence.get(),
            "publication commit sequence",
        )?
    {
        return Err(StoreError::Corrupt(
            "definition publication commit does not match its revision".to_owned(),
        ));
    }
    Ok(Some(row_to_publication(&row, revision)?))
}

async fn insert_commit_kind(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    next_sequence: i64,
    commit_kind: &str,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO authority_commits (tenant_id, commit_sequence, commit_kind)
         VALUES ($1, $2, $3)",
    )
    .bind(world_id.as_str())
    .bind(next_sequence)
    .bind(commit_kind)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_projection_event(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    next_sequence: i64,
    activation: &AdmittedDefinitionActivation,
) -> Result<(), StoreError> {
    let event = activation.projection_event();
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
    )
    .bind(world_id.as_str())
    .bind(next_sequence)
    .bind(event.event_type())
    .bind(i32::from(event.event_version()))
    .bind(event.payload())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_published_revision(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &AdmittedDefinitionPublication,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = publication.context();
    insert_commit_kind(
        transaction,
        context.world_id(),
        next_sequence,
        "definition_publication",
    )
    .await?;
    sqlx::query(
        "INSERT INTO definition_revisions
            (tenant_id, definition_id, revision, digest, canonical_json, commit_sequence)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(context.world_id().as_str())
    .bind(publication.definition_id().as_str())
    .bind(u64_to_i64(publication.revision().get(), "revision")?)
    .bind(publication.digest().as_str())
    .bind(publication.canonical_json().as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    insert_publication_row(transaction, publication, next_sequence).await?;
    insert_publication_grants(transaction, publication, next_sequence).await?;
    let event = publication.projection_event();
    sqlx::query(
        "INSERT INTO projection_outbox
            (tenant_id, commit_sequence, ordinal, event_type, event_version, payload)
         VALUES ($1, $2, 0, $3, $4, $5::jsonb)",
    )
    .bind(context.world_id().as_str())
    .bind(next_sequence)
    .bind(event.event_type())
    .bind(i32::from(event.event_version()))
    .bind(event.payload())
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    advance_authority_head(transaction, context.world_id(), next_sequence).await
}

async fn insert_publication_row(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &AdmittedDefinitionPublication,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let context = publication.context();
    let policy = publication.policy();
    let grant_count = i32::try_from(context.delegation().grants().len())
        .map_err(|_| StoreError::Conflict("publication has too many grants".to_owned()))?;
    sqlx::query(
        "INSERT INTO definition_publications (
            tenant_id, definition_id, revision, digest, commit_sequence,
            published_at_micros, actor_id, principal_id, workload_id,
            policy_id, policy_revision, policy_digest, determining_policies,
            grant_count
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12, $13,
            $14
         )",
    )
    .bind(context.world_id().as_str())
    .bind(publication.definition_id().as_str())
    .bind(u64_to_i64(publication.revision().get(), "revision")?)
    .bind(publication.digest().as_str())
    .bind(next_sequence)
    .bind(publication.published_at().get())
    .bind(context.actor_id().as_str())
    .bind(context.principal_id().as_str())
    .bind(context.workload_id().as_str())
    .bind(policy.revision.id.as_str())
    .bind(u64_to_i64(
        policy.revision.revision.get(),
        "policy revision",
    )?)
    .bind(policy.revision.digest.as_str())
    .bind(&policy.determining_policies)
    .bind(grant_count)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    Ok(())
}

async fn insert_publication_grants(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &AdmittedDefinitionPublication,
    commit_sequence: i64,
) -> Result<(), StoreError> {
    let context = publication.context();
    for (ordinal, grant) in context.delegation().grants().iter().enumerate() {
        let ordinal = i32::try_from(ordinal)
            .map_err(|_| StoreError::Conflict("publication has too many grants".to_owned()))?;
        sqlx::query(
            "INSERT INTO definition_publication_grants (
                tenant_id, commit_sequence, ordinal, delegation_id,
                action_ids, resource_ids, workload_ids,
                not_before_micros, expires_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(context.world_id().as_str())
        .bind(commit_sequence)
        .bind(ordinal)
        .bind(grant.id().as_str())
        .bind(
            grant
                .actions()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .resources()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .workloads()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(grant.not_before().get())
        .bind(grant.expires_at().get())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    Ok(())
}

async fn advance_authority_head(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    next_sequence: i64,
) -> Result<(), StoreError> {
    let updated = sqlx::query(
        "UPDATE authority_heads
         SET commit_sequence = $2
         WHERE tenant_id = $1",
    )
    .bind(world_id.as_str())
    .bind(next_sequence)
    .execute(&mut **transaction)
    .await
    .map_err(store_unavailable)?;
    if updated.rows_affected() == 1 {
        Ok(())
    } else {
        Err(StoreError::Corrupt(
            "authority head update affected an unexpected row count".to_owned(),
        ))
    }
}

async fn insert_activation_grants(
    transaction: &mut Transaction<'_, Postgres>,
    world_id: &WorldId,
    commit_sequence: i64,
    context: &ExecutionContext,
) -> Result<(), StoreError> {
    for (ordinal, grant) in context.delegation().grants().iter().enumerate() {
        let ordinal = i32::try_from(ordinal)
            .map_err(|_| StoreError::Conflict("activation has too many grants".to_owned()))?;
        sqlx::query(
            "INSERT INTO definition_activation_grants (
                tenant_id, commit_sequence, ordinal, delegation_id,
                action_ids, resource_ids, workload_ids,
                not_before_micros, expires_at_micros
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        )
        .bind(world_id.as_str())
        .bind(commit_sequence)
        .bind(ordinal)
        .bind(grant.id().as_str())
        .bind(
            grant
                .actions()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .resources()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(
            grant
                .workloads()
                .iter()
                .map(|id| id.as_str().to_owned())
                .collect::<Vec<_>>(),
        )
        .bind(grant.not_before().get())
        .bind(grant.expires_at().get())
        .execute(&mut **transaction)
        .await
        .map_err(store_unavailable)?;
    }
    Ok(())
}

fn row_to_reference(row: &PgRow) -> Result<DefinitionReference, StoreError> {
    Ok(DefinitionReference {
        definition_id: DefinitionId::parse(row_string(row, "definition_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        digest: DefinitionDigest::parse(row_string(row, "digest")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        revision: DefinitionRevisionNumber::new(i64_to_u64(
            row_i64(row, "revision")?,
            "definition revision",
        )?)
        .ok_or_else(|| StoreError::Corrupt("zero definition revision".to_owned()))?,
    })
}

fn row_to_publication(
    row: &PgRow,
    revision: DefinitionRevision,
) -> Result<DefinitionPublication, StoreError> {
    Ok(DefinitionPublication {
        policy: PolicyEvidence {
            determining_policies: row
                .try_get::<Vec<String>, _>("determining_policies")
                .map_err(store_unavailable)?,
            revision: PolicyRevision {
                digest: PolicyDigest::parse(row_string(row, "policy_digest")?)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                id: PolicyId::parse(row_string(row, "policy_id")?)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                revision: PolicyRevisionNumber::new(i64_to_u64(
                    row_i64(row, "policy_revision")?,
                    "policy revision",
                )?)
                .ok_or_else(|| StoreError::Corrupt("zero policy revision".to_owned()))?,
            },
        },
        principal_id: PrincipalId::parse(row_string(row, "principal_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        published_at: TimestampMicros::new(row_i64(row, "published_at_micros")?),
        published_by: ActorId::parse(row_string(row, "actor_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        revision,
        workload_id: WorkloadId::parse(row_string(row, "workload_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
    })
}

fn row_to_activation(row: &PgRow) -> Result<DefinitionActivation, StoreError> {
    let previous_digest = row
        .try_get::<Option<String>, _>("previous_digest")
        .map_err(store_unavailable)?;
    let previous_revision = row
        .try_get::<Option<i64>, _>("previous_revision")
        .map_err(store_unavailable)?;
    let previous = match (previous_digest, previous_revision) {
        (None, None) => None,
        (Some(digest), Some(revision)) => Some(DefinitionReference {
            definition_id: DefinitionId::parse(row_string(row, "definition_id")?)
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            digest: DefinitionDigest::parse(digest)
                .map_err(|error| StoreError::Corrupt(error.to_string()))?,
            revision: DefinitionRevisionNumber::new(i64_to_u64(
                revision,
                "previous definition revision",
            )?)
            .ok_or_else(|| StoreError::Corrupt("zero previous definition revision".to_owned()))?,
        }),
        (Some(_), None) | (None, Some(_)) => {
            return Err(StoreError::Corrupt(
                "activation previous digest and revision must both be present or both be absent"
                    .to_owned(),
            ));
        }
    };
    let classification = match row
        .try_get::<Option<String>, _>("classification")
        .map_err(store_unavailable)?
        .as_deref()
    {
        None => None,
        Some("compatible") => Some(EvolutionClassification::Compatible),
        Some("requires_migration") => Some(EvolutionClassification::RequiresMigration),
        Some("breaking") => Some(EvolutionClassification::Breaking),
        Some("forbidden") => Some(EvolutionClassification::Forbidden),
        Some(value) => {
            return Err(StoreError::Corrupt(format!(
                "unknown evolution classification: {value}"
            )));
        }
    };
    let kind = match row_string(row, "activation_kind")?.as_str() {
        "activation" => DefinitionActivationKind::Activation,
        "rollback" => DefinitionActivationKind::Rollback,
        value => {
            return Err(StoreError::Corrupt(format!(
                "unknown definition activation kind: {value}"
            )));
        }
    };
    let migration_operation_id = row
        .try_get::<Option<String>, _>("migration_operation_id")
        .map_err(store_unavailable)?
        .map(OperationId::parse)
        .transpose()
        .map_err(|error| StoreError::Corrupt(error.to_string()))?;
    Ok(DefinitionActivation {
        activated_at: TimestampMicros::new(row_i64(row, "activated_at_micros")?),
        activated_by: ActorId::parse(row_string(row, "actor_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        active: row_to_reference(row)?,
        classification,
        commit_sequence: CommitSequence::new(i64_to_u64(
            row_i64(row, "commit_sequence")?,
            "activation commit sequence",
        )?)
        .ok_or_else(|| StoreError::Corrupt("zero activation commit sequence".to_owned()))?,
        kind,
        migration_operation_id,
        policy: PolicyEvidence {
            determining_policies: row
                .try_get::<Vec<String>, _>("determining_policies")
                .map_err(store_unavailable)?,
            revision: PolicyRevision {
                digest: PolicyDigest::parse(row_string(row, "policy_digest")?)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                id: PolicyId::parse(row_string(row, "policy_id")?)
                    .map_err(|error| StoreError::Corrupt(error.to_string()))?,
                revision: PolicyRevisionNumber::new(i64_to_u64(
                    row_i64(row, "policy_revision")?,
                    "policy revision",
                )?)
                .ok_or_else(|| StoreError::Corrupt("zero policy revision".to_owned()))?,
            },
        },
        previous,
        principal_id: PrincipalId::parse(row_string(row, "principal_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
        workload_id: WorkloadId::parse(row_string(row, "workload_id")?)
            .map_err(|error| StoreError::Corrupt(error.to_string()))?,
    })
}
