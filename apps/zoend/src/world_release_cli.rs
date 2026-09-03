use std::{
    collections::BTreeSet,
    error::Error,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{Map, Value, json};
use zoen_adapters::{PostgresAuthorityStore, PostgresWorldReleaseStore, PublicationPut};
use zoen_core::{
    ComponentCatalogDigest, ExecutorCatalogDigest, OntologyCatalogDigest, PolicyCatalogDigest,
    PolicyDigest, PolicyEvidence, PolicyId, PolicyRevision, PolicyRevisionNumber, PrincipalId,
    ReleaseDigest, TimestampMicros, WORLD_RELEASE_SCHEMA, WorldId, WorldRelease,
    WorldReleaseContent, WorldReleaseError, WorldReleasePublication,
};

use crate::cli::ReleaseCommand;

pub struct ReleaseCliResult {
    pub exit_code: u8,
    pub stdout: Value,
    pub message: String,
}

/// Drive the `WorldRelease` constructor and transactional store from the CLI.
///
/// # Errors
///
/// Returns an error when the database cannot be opened.
pub async fn run(
    command: ReleaseCommand,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    match command {
        ReleaseCommand::Construct { file } => Ok(construct(&read_json(&file)?)?),
        ReleaseCommand::Publish {
            file,
            principal,
            policy_id,
            policy_digest,
            policy_revision,
            determining_policy,
        } => {
            publish(
                &read_json(&file)?,
                &principal,
                &policy_id,
                &policy_digest,
                policy_revision,
                &determining_policy,
            )
            .await
        }
        ReleaseCommand::Activate { world, digest } => activate(&world, &digest).await,
        ReleaseCommand::Get { digest } => get(&digest).await,
        ReleaseCommand::Active { world } => active(&world).await,
    }
}

fn construct(value: &Value) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let release = release_from_json(value)?;
    Ok(ok(release_json(&release, None, None, None)))
}

async fn publish(
    value: &Value,
    principal: &str,
    policy_id: &str,
    policy_digest: &str,
    policy_revision: u64,
    determining_policy: &[String],
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    if determining_policy.is_empty() || policy_id.is_empty() || policy_digest.is_empty() {
        return Ok(fail(
            2,
            "world release publication requires policy evidence\n  zoen world release publish --file content.json --principal principal.owner --policy-id policy.world --policy-digest <digest> --policy-revision 1 --determining-policy policy.world",
        ));
    }
    let Some(revision) = PolicyRevisionNumber::new(policy_revision) else {
        return Ok(fail(2, "policy revision must be greater than zero"));
    };
    let release = release_from_json(value)?;
    let publication = WorldReleasePublication::new(
        release.id().clone(),
        now(),
        PrincipalId::parse(principal)?,
        PolicyEvidence {
            determining_policies: determining_policy.to_vec(),
            revision: PolicyRevision {
                digest: PolicyDigest::parse(policy_digest)?,
                id: PolicyId::parse(policy_id)?,
                revision,
            },
        },
    )?;
    let store = store().await?;
    store.put_release(&release).await?;
    let PublicationPut {
        publication: stored,
        replay,
    } = store.put_publication(&publication).await?;
    Ok(ok(release_json(
        &release,
        Some(&stored),
        None,
        Some(replay),
    )))
}

async fn activate(
    world: &str,
    digest: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let world = WorldId::parse(world)?;
    let digest = ReleaseDigest::parse(digest)?;
    let store = store().await?;
    let previous = store.activate(&world, &digest, now()).await?;
    let release = store
        .get(&digest)
        .await?
        .ok_or(WorldReleaseError::NotFound)?;
    let publication = store.get_publication(&digest).await?;
    Ok(ok(json!({
        "activated": true,
        "digest": digest.as_str(),
        "previousDigest": previous.as_ref().map(ReleaseDigest::as_str),
        "world": world.as_str(),
        "release": release_json(&release, publication.as_ref(), Some(digest.as_str()), None),
    })))
}

async fn get(digest: &str) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let digest = ReleaseDigest::parse(digest)?;
    let store = store().await?;
    let Some(release) = store.get(&digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    let publication = store.get_publication(&digest).await?;
    let active = store.get_active(release.content().world()).await?;
    Ok(ok(release_json(
        &release,
        publication.as_ref(),
        active.as_ref().map(ReleaseDigest::as_str),
        None,
    )))
}

async fn active(world: &str) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let world = WorldId::parse(world)?;
    let store = store().await?;
    let Some(digest) = store.get_active(&world).await? else {
        return Ok(fail(1, "world has no active release"));
    };
    get(digest.as_str()).await
}

fn release_from_json(value: &Value) -> Result<WorldRelease, WorldReleaseError> {
    let object = value.as_object().ok_or_else(|| {
        WorldReleaseError::Conflict("release content must be a JSON object".to_owned())
    })?;
    reject_caller_digest(object)?;
    let allowed: BTreeSet<&str> = [
        "world",
        "parent",
        "ontology",
        "policy",
        "executors",
        "components",
    ]
    .into_iter()
    .collect();
    for key in object.keys() {
        if !allowed.contains(key.as_str()) {
            return Err(WorldReleaseError::Conflict(format!(
                "unexpected world release field {key}"
            )));
        }
    }
    let world = required_str(object, "world")?;
    let parent = match object.get("parent") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(ReleaseDigest::parse(value.clone())?),
        Some(_) => {
            return Err(WorldReleaseError::Conflict(
                "parent must be null or a release digest".to_owned(),
            ));
        }
    };
    let content = WorldReleaseContent::new(
        WorldId::parse(world)?,
        parent,
        OntologyCatalogDigest::parse(required_str(object, "ontology")?)?,
        PolicyCatalogDigest::parse(required_str(object, "policy")?)?,
        ExecutorCatalogDigest::parse(required_str(object, "executors")?)?,
        ComponentCatalogDigest::parse(required_str(object, "components")?)?,
    );
    WorldRelease::from_content(content)
}

fn reject_caller_digest(object: &Map<String, Value>) -> Result<(), WorldReleaseError> {
    for key in [
        "id",
        "digest",
        "releaseDigest",
        "publishedAt",
        "publishedBy",
        "policyEvidence",
    ] {
        if object.contains_key(key) {
            return Err(WorldReleaseError::CallerSuppliedDigest);
        }
    }
    Ok(())
}

fn required_str<'a>(
    object: &'a Map<String, Value>,
    key: &str,
) -> Result<&'a str, WorldReleaseError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| WorldReleaseError::Conflict(format!("{key} is required")))
}

fn release_json(
    release: &WorldRelease,
    publication: Option<&WorldReleasePublication>,
    active_digest: Option<&str>,
    replay: Option<bool>,
) -> Value {
    let mut body = json!({
        "canonicalJcs": release.canonical_jcs(),
        "components": release.content().components().as_str(),
        "digest": release.id().as_str(),
        "executors": release.content().executors().as_str(),
        "ontology": release.content().ontology().as_str(),
        "parent": release.content().parent().map(ReleaseDigest::as_str),
        "policy": release.content().policy().as_str(),
        "schema": WORLD_RELEASE_SCHEMA,
        "world": release.content().world().as_str(),
    });
    if let Some(publication) = publication {
        body["publication"] = json!({
            "digest": publication.release().as_str(),
            "publishedAtMicros": publication.published_at().get(),
            "publishedBy": publication.published_by().as_str(),
            "policy": {
                "determiningPolicies": publication.policy().determining_policies,
                "digest": publication.policy().revision.digest.as_str(),
                "id": publication.policy().revision.id.as_str(),
                "revision": publication.policy().revision.revision.get(),
            },
        });
    }
    if let Some(active) = active_digest {
        body["active"] = json!(active == release.id().as_str());
        body["activeDigest"] = json!(active);
    }
    if let Some(replay) = replay {
        body["replay"] = json!(replay);
    }
    body
}

async fn store() -> Result<PostgresWorldReleaseStore, Box<dyn Error + Send + Sync>> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL is required for world release store commands")?;
    let authority = PostgresAuthorityStore::connect(&database_url).await?;
    Ok(PostgresWorldReleaseStore::new(authority.pool()))
}

fn read_json(path: &std::path::Path) -> Result<Value, Box<dyn Error + Send + Sync>> {
    let raw = if path.as_os_str() == "-" {
        let mut raw = Vec::new();
        std::io::Read::read_to_end(&mut std::io::stdin(), &mut raw)?;
        raw
    } else {
        std::fs::read(path)?
    };
    Ok(serde_json::from_slice(&raw)?)
}

fn now() -> TimestampMicros {
    TimestampMicros::new(
        i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |duration| duration.as_micros()),
        )
        .unwrap_or(i64::MAX),
    )
}

fn ok(stdout: Value) -> ReleaseCliResult {
    ReleaseCliResult {
        exit_code: 0,
        stdout,
        message: String::new(),
    }
}

fn fail(exit_code: u8, message: &str) -> ReleaseCliResult {
    ReleaseCliResult {
        exit_code,
        stdout: Value::Null,
        message: message.to_owned(),
    }
}
