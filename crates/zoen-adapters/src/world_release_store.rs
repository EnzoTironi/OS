use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use zoen_core::{
    ComponentCatalog, ComponentCatalogDigest, ExecutorCatalog, ExecutorCatalogDigest,
    OntologyCatalog, OntologyCatalogDigest, PolicyCatalog, PolicyCatalogDigest, PolicyDigest,
    PolicyEvidence, PolicyId, PolicyRevision, PolicyRevisionNumber, PrincipalId, ReleaseDigest,
    TimestampMicros, WorldId, WorldRelease, WorldReleaseCatalogs, WorldReleaseContent,
    WorldReleaseError, WorldReleasePublication,
};

use crate::clock_micros;

#[derive(Clone)]
pub struct PostgresWorldReleaseStore {
    pool: PgPool,
}

impl PostgresWorldReleaseStore {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Store content-addressed release bytes. Identical content is idempotent.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when PostgreSQL is unavailable or a digest
    /// collides with different content.
    pub async fn put_release(&self, release: &WorldRelease) -> Result<(), WorldReleaseError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        require_catalogs_tx(&mut transaction, release).await?;
        put_release_tx(&mut transaction, release).await?;
        transaction.commit().await.map_err(store)?;
        Ok(())
    }

    /// Store four catalog blobs, the release, and publication in one transaction.
    ///
    /// Identical catalog bytes are idempotent. A digest bound to different bytes
    /// fails closed. `release` must bind exactly these catalog digests.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::MixedCatalogs`] when the release does not bind
    /// these blobs, [`WorldReleaseError::Conflict`] on digest collision, or a
    /// store error.
    pub async fn publish_candidate(
        &self,
        catalogs: &WorldReleaseCatalogs,
        release: &WorldRelease,
        publication: &WorldReleasePublication,
    ) -> Result<PublicationPut, WorldReleaseError> {
        if !catalogs.binds(release) {
            return Err(WorldReleaseError::MixedCatalogs);
        }
        if publication.release() != release.id() {
            return Err(WorldReleaseError::Conflict(
                "publication digest does not match release".to_owned(),
            ));
        }
        let mut transaction = self.pool.begin().await.map_err(store)?;
        put_catalog_tx(
            &mut transaction,
            INSERT_ONTOLOGY,
            SELECT_ONTOLOGY,
            catalogs.ontology().digest().as_str(),
            catalogs.ontology().bytes(),
        )
        .await?;
        put_catalog_tx(
            &mut transaction,
            INSERT_POLICY,
            SELECT_POLICY,
            catalogs.policy().digest().as_str(),
            catalogs.policy().bytes(),
        )
        .await?;
        put_catalog_tx(
            &mut transaction,
            INSERT_EXECUTORS,
            SELECT_EXECUTORS,
            catalogs.executors().digest().as_str(),
            catalogs.executors().bytes(),
        )
        .await?;
        put_catalog_tx(
            &mut transaction,
            INSERT_COMPONENTS,
            SELECT_COMPONENTS,
            catalogs.components().digest().as_str(),
            catalogs.components().bytes(),
        )
        .await?;
        put_release_tx(&mut transaction, release).await?;
        let stored = put_publication_tx(&mut transaction, publication).await?;
        transaction.commit().await.map_err(store)?;
        Ok(stored)
    }

    /// Record publication metadata for an already stored release.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::MissingPolicy`] when evidence is empty,
    /// [`WorldReleaseError::NotFound`] when the release is absent, or a store error.
    pub async fn put_publication(
        &self,
        publication: &WorldReleasePublication,
    ) -> Result<PublicationPut, WorldReleaseError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        let stored = put_publication_tx(&mut transaction, publication).await?;
        transaction.commit().await.map_err(store)?;
        Ok(stored)
    }

    /// Atomically replace the active pointer for `world`. Prior releases stay queryable.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::WorldMismatch`] when the digest belongs to
    /// another World, [`WorldReleaseError::MissingPolicy`] when unpublished, or
    /// [`WorldReleaseError::NotFound`] when the release is absent.
    pub async fn activate(
        &self,
        world: &WorldId,
        digest: &ReleaseDigest,
        at: TimestampMicros,
    ) -> Result<Option<ReleaseDigest>, WorldReleaseError> {
        let mut transaction = self.pool.begin().await.map_err(store)?;
        let previous = activate_tx(&mut transaction, world, digest, at).await?;
        transaction.commit().await.map_err(store)?;
        Ok(previous)
    }

    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when PostgreSQL is unavailable or stored
    /// bytes cannot be reconstructed.
    pub async fn get(
        &self,
        digest: &ReleaseDigest,
    ) -> Result<Option<WorldRelease>, WorldReleaseError> {
        let row = sqlx::query(
            "SELECT digest, world_id, parent_digest, ontology_digest, policy_digest,
                    executors_digest, components_digest, canonical_jcs
             FROM world_releases
             WHERE digest = $1",
        )
        .bind(digest.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?;
        row.map(|row| row_to_release(&row)).transpose()
    }

    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when PostgreSQL is unavailable or the row
    /// cannot be parsed.
    pub async fn get_publication(
        &self,
        digest: &ReleaseDigest,
    ) -> Result<Option<WorldReleasePublication>, WorldReleaseError> {
        let row = sqlx::query(
            "SELECT digest, published_at_micros, published_by, policy_id, policy_revision,
                    policy_digest, determining_policies
             FROM world_release_publications
             WHERE digest = $1",
        )
        .bind(digest.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?;
        row.map(|row| row_to_publication(&row)).transpose()
    }

    /// # Errors
    ///
    /// Returns [`WorldReleaseError`] when PostgreSQL is unavailable.
    pub async fn get_active(
        &self,
        world: &WorldId,
    ) -> Result<Option<ReleaseDigest>, WorldReleaseError> {
        let digest = sqlx::query_scalar::<_, String>(
            "SELECT digest FROM world_active_releases WHERE world_id = $1",
        )
        .bind(world.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(store)?;
        digest
            .map(ReleaseDigest::parse)
            .transpose()
            .map_err(Into::into)
    }

    /// Load the four catalog blobs bound by `digest`.
    ///
    /// # Errors
    ///
    /// Returns [`WorldReleaseError::MissingCatalog`] when a bound digest has no
    /// blob, or a store error.
    pub async fn get_catalogs(
        &self,
        digest: &ReleaseDigest,
    ) -> Result<Option<WorldReleaseCatalogs>, WorldReleaseError> {
        let Some(release) = self.get(digest).await? else {
            return Ok(None);
        };
        load_bound_catalogs(&self.pool, &release).await.map(Some)
    }
}

async fn put_release_tx(
    transaction: &mut Transaction<'_, Postgres>,
    release: &WorldRelease,
) -> Result<(), WorldReleaseError> {
    let inserted = sqlx::query(
        "INSERT INTO world_releases (
            digest, world_id, parent_digest, ontology_digest, policy_digest,
            executors_digest, components_digest, canonical_jcs, stored_at_micros
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (digest) DO NOTHING",
    )
    .bind(release.id().as_str())
    .bind(release.content().world().as_str())
    .bind(release.content().parent().map(ReleaseDigest::as_str))
    .bind(release.content().ontology().as_str())
    .bind(release.content().policy().as_str())
    .bind(release.content().executors().as_str())
    .bind(release.content().components().as_str())
    .bind(release.canonical_jcs())
    .bind(clock_micros())
    .execute(&mut **transaction)
    .await
    .map_err(store)?;
    if inserted.rows_affected() == 1 {
        return Ok(());
    }
    let existing = sqlx::query_scalar::<_, String>(
        "SELECT canonical_jcs FROM world_releases WHERE digest = $1",
    )
    .bind(release.id().as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store)?;
    match existing {
        Some(canonical) if canonical == release.canonical_jcs() => Ok(()),
        Some(_) => Err(WorldReleaseError::Conflict(
            "digest already bound to different content".to_owned(),
        )),
        None => Err(WorldReleaseError::Store(
            "release insert conflicted then vanished".to_owned(),
        )),
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PublicationPut {
    pub publication: WorldReleasePublication,
    pub replay: bool,
}

async fn put_publication_tx(
    transaction: &mut Transaction<'_, Postgres>,
    publication: &WorldReleasePublication,
) -> Result<PublicationPut, WorldReleaseError> {
    let exists = sqlx::query_scalar::<_, bool>("SELECT true FROM world_releases WHERE digest = $1")
        .bind(publication.release().as_str())
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store)?;
    if exists.is_none() {
        return Err(WorldReleaseError::NotFound);
    }
    let inserted = sqlx::query(
        "INSERT INTO world_release_publications (
            digest, published_at_micros, published_by, policy_id, policy_revision,
            policy_digest, determining_policies
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (digest) DO NOTHING",
    )
    .bind(publication.release().as_str())
    .bind(publication.published_at().get())
    .bind(publication.published_by().as_str())
    .bind(publication.policy().revision.id.as_str())
    .bind(i64_from_u64(publication.policy().revision.revision.get())?)
    .bind(publication.policy().revision.digest.as_str())
    .bind(&publication.policy().determining_policies)
    .execute(&mut **transaction)
    .await
    .map_err(store)?;
    if inserted.rows_affected() == 0 {
        let row = sqlx::query(
            "SELECT digest, published_at_micros, published_by, policy_id, policy_revision,
                    policy_digest, determining_policies
             FROM world_release_publications
             WHERE digest = $1",
        )
        .bind(publication.release().as_str())
        .fetch_one(&mut **transaction)
        .await
        .map_err(store)?;
        return Ok(PublicationPut {
            publication: row_to_publication(&row)?,
            replay: true,
        });
    }
    Ok(PublicationPut {
        publication: publication.clone(),
        replay: false,
    })
}

async fn activate_tx(
    transaction: &mut Transaction<'_, Postgres>,
    world: &WorldId,
    digest: &ReleaseDigest,
    at: TimestampMicros,
) -> Result<Option<ReleaseDigest>, WorldReleaseError> {
    let bound_world =
        sqlx::query_scalar::<_, String>("SELECT world_id FROM world_releases WHERE digest = $1")
            .bind(digest.as_str())
            .fetch_optional(&mut **transaction)
            .await
            .map_err(store)?;
    let Some(bound_world) = bound_world else {
        return Err(WorldReleaseError::NotFound);
    };
    if bound_world != world.as_str() {
        return Err(WorldReleaseError::WorldMismatch);
    }
    let published = sqlx::query_scalar::<_, bool>(
        "SELECT true FROM world_release_publications WHERE digest = $1",
    )
    .bind(digest.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store)?;
    if published.is_none() {
        return Err(WorldReleaseError::MissingPolicy);
    }
    let previous = sqlx::query_scalar::<_, String>(
        "SELECT digest FROM world_active_releases WHERE world_id = $1 FOR UPDATE",
    )
    .bind(world.as_str())
    .fetch_optional(&mut **transaction)
    .await
    .map_err(store)?;
    sqlx::query(
        "INSERT INTO world_active_releases (world_id, digest, activated_at_micros)
         VALUES ($1, $2, $3)
         ON CONFLICT (world_id) DO UPDATE
         SET digest = EXCLUDED.digest,
             activated_at_micros = EXCLUDED.activated_at_micros",
    )
    .bind(world.as_str())
    .bind(digest.as_str())
    .bind(at.get())
    .execute(&mut **transaction)
    .await
    .map_err(store)?;
    previous
        .map(ReleaseDigest::parse)
        .transpose()
        .map_err(Into::into)
}

fn row_to_release(row: &PgRow) -> Result<WorldRelease, WorldReleaseError> {
    let parent = match row
        .try_get::<Option<String>, _>("parent_digest")
        .map_err(store)?
    {
        Some(value) => Some(ReleaseDigest::parse(value)?),
        None => None,
    };
    let content = WorldReleaseContent::new(
        WorldId::parse(row.try_get::<String, _>("world_id").map_err(store)?)?,
        parent,
        OntologyCatalogDigest::parse(row.try_get::<String, _>("ontology_digest").map_err(store)?)?,
        PolicyCatalogDigest::parse(row.try_get::<String, _>("policy_digest").map_err(store)?)?,
        ExecutorCatalogDigest::parse(
            row.try_get::<String, _>("executors_digest")
                .map_err(store)?,
        )?,
        ComponentCatalogDigest::parse(
            row.try_get::<String, _>("components_digest")
                .map_err(store)?,
        )?,
    );
    let release = WorldRelease::from_content(content)?;
    let stored_digest = row.try_get::<String, _>("digest").map_err(store)?;
    if release.id().as_str() != stored_digest {
        return Err(WorldReleaseError::Conflict(
            "stored digest does not match derived content".to_owned(),
        ));
    }
    Ok(release)
}

fn row_to_publication(row: &PgRow) -> Result<WorldReleasePublication, WorldReleaseError> {
    let revision = PolicyRevisionNumber::new(
        u64::try_from(row.try_get::<i64, _>("policy_revision").map_err(store)?)
            .map_err(|_| WorldReleaseError::Store("policy revision is negative".to_owned()))?,
    )
    .ok_or_else(|| WorldReleaseError::Store("policy revision must be positive".to_owned()))?;
    let policies: Vec<String> = row
        .try_get::<Vec<String>, _>("determining_policies")
        .map_err(store)?;
    WorldReleasePublication::new(
        ReleaseDigest::parse(row.try_get::<String, _>("digest").map_err(store)?)?,
        TimestampMicros::new(
            row.try_get::<i64, _>("published_at_micros")
                .map_err(store)?,
        ),
        PrincipalId::parse(row.try_get::<String, _>("published_by").map_err(store)?)?,
        PolicyEvidence {
            determining_policies: policies,
            revision: PolicyRevision {
                digest: PolicyDigest::parse(
                    row.try_get::<String, _>("policy_digest").map_err(store)?,
                )?,
                id: PolicyId::parse(row.try_get::<String, _>("policy_id").map_err(store)?)?,
                revision,
            },
        },
    )
}

fn store(error: impl std::fmt::Display) -> WorldReleaseError {
    WorldReleaseError::Store(error.to_string())
}

fn i64_from_u64(value: u64) -> Result<i64, WorldReleaseError> {
    i64::try_from(value).map_err(|_| {
        WorldReleaseError::Store("policy revision exceeds PostgreSQL BIGINT".to_owned())
    })
}

const INSERT_ONTOLOGY: &str =
    "INSERT INTO world_ontology_catalogs (digest, content, stored_at_micros)
         VALUES ($1, $2, $3)
         ON CONFLICT (digest) DO NOTHING";
const SELECT_ONTOLOGY: &str = "SELECT content FROM world_ontology_catalogs WHERE digest = $1";
const INSERT_POLICY: &str = "INSERT INTO world_policy_catalogs (digest, content, stored_at_micros)
         VALUES ($1, $2, $3)
         ON CONFLICT (digest) DO NOTHING";
const SELECT_POLICY: &str = "SELECT content FROM world_policy_catalogs WHERE digest = $1";
const INSERT_EXECUTORS: &str =
    "INSERT INTO world_executor_catalogs (digest, content, stored_at_micros)
         VALUES ($1, $2, $3)
         ON CONFLICT (digest) DO NOTHING";
const SELECT_EXECUTORS: &str = "SELECT content FROM world_executor_catalogs WHERE digest = $1";
const INSERT_COMPONENTS: &str =
    "INSERT INTO world_component_catalogs (digest, content, stored_at_micros)
         VALUES ($1, $2, $3)
         ON CONFLICT (digest) DO NOTHING";
const SELECT_COMPONENTS: &str = "SELECT content FROM world_component_catalogs WHERE digest = $1";
const EXISTS_ONTOLOGY: &str = "SELECT true FROM world_ontology_catalogs WHERE digest = $1";
const EXISTS_POLICY: &str = "SELECT true FROM world_policy_catalogs WHERE digest = $1";
const EXISTS_EXECUTORS: &str = "SELECT true FROM world_executor_catalogs WHERE digest = $1";
const EXISTS_COMPONENTS: &str = "SELECT true FROM world_component_catalogs WHERE digest = $1";

async fn put_catalog_tx(
    transaction: &mut Transaction<'_, Postgres>,
    insert_sql: &'static str,
    select_sql: &'static str,
    digest: &str,
    bytes: &[u8],
) -> Result<(), WorldReleaseError> {
    let inserted = sqlx::query(insert_sql)
        .bind(digest)
        .bind(bytes)
        .bind(clock_micros())
        .execute(&mut **transaction)
        .await
        .map_err(store)?;
    if inserted.rows_affected() == 1 {
        return Ok(());
    }
    let existing = sqlx::query_scalar::<_, Vec<u8>>(select_sql)
        .bind(digest)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store)?;
    match existing {
        Some(content) if content == bytes => Ok(()),
        Some(_) => Err(WorldReleaseError::Conflict(
            "catalog digest already bound to different bytes".to_owned(),
        )),
        None => Err(WorldReleaseError::Store(
            "catalog insert conflicted then vanished".to_owned(),
        )),
    }
}

async fn require_catalogs_tx(
    transaction: &mut Transaction<'_, Postgres>,
    release: &WorldRelease,
) -> Result<(), WorldReleaseError> {
    let ontology = catalog_exists(
        transaction,
        EXISTS_ONTOLOGY,
        release.content().ontology().as_str(),
    )
    .await?;
    let policy = catalog_exists(
        transaction,
        EXISTS_POLICY,
        release.content().policy().as_str(),
    )
    .await?;
    let executors = catalog_exists(
        transaction,
        EXISTS_EXECUTORS,
        release.content().executors().as_str(),
    )
    .await?;
    let components = catalog_exists(
        transaction,
        EXISTS_COMPONENTS,
        release.content().components().as_str(),
    )
    .await?;
    if ontology && policy && executors && components {
        Ok(())
    } else {
        Err(WorldReleaseError::MissingCatalog)
    }
}

async fn catalog_exists(
    transaction: &mut Transaction<'_, Postgres>,
    sql: &'static str,
    digest: &str,
) -> Result<bool, WorldReleaseError> {
    let found = sqlx::query_scalar::<_, bool>(sql)
        .bind(digest)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(store)?;
    Ok(found.is_some())
}

async fn load_bound_catalogs(
    pool: &PgPool,
    release: &WorldRelease,
) -> Result<WorldReleaseCatalogs, WorldReleaseError> {
    let ontology = OntologyCatalog::from_bytes(
        load_catalog_bytes(pool, SELECT_ONTOLOGY, release.content().ontology().as_str()).await?,
    );
    let policy = PolicyCatalog::from_bytes(
        load_catalog_bytes(pool, SELECT_POLICY, release.content().policy().as_str()).await?,
    );
    let executors = ExecutorCatalog::from_bytes(
        load_catalog_bytes(
            pool,
            SELECT_EXECUTORS,
            release.content().executors().as_str(),
        )
        .await?,
    );
    let components = ComponentCatalog::from_bytes(
        load_catalog_bytes(
            pool,
            SELECT_COMPONENTS,
            release.content().components().as_str(),
        )
        .await?,
    );
    if ontology.digest() != release.content().ontology()
        || policy.digest() != release.content().policy()
        || executors.digest() != release.content().executors()
        || components.digest() != release.content().components()
    {
        return Err(WorldReleaseError::Conflict(
            "catalog digest already bound to different bytes".to_owned(),
        ));
    }
    Ok(WorldReleaseCatalogs::new(
        ontology, policy, executors, components,
    ))
}

async fn load_catalog_bytes(
    pool: &PgPool,
    select_sql: &'static str,
    digest: &str,
) -> Result<Vec<u8>, WorldReleaseError> {
    sqlx::query_scalar::<_, Vec<u8>>(select_sql)
        .bind(digest)
        .fetch_optional(pool)
        .await
        .map_err(store)?
        .ok_or(WorldReleaseError::MissingCatalog)
}
