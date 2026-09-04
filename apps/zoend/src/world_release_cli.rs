use std::{
    collections::BTreeSet,
    error::Error,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Map, Value, json};
use zoen_adapters::{
    ActivatePut, DecisionPut, PostgresAuthorityStore, PostgresIdentityStore,
    PostgresWorldReleaseStore, PreviewPut, PublicationPut, require_loadable_ontology_catalog,
    require_loadable_policy_catalog,
};
use zoen_core::{
    ActionId, ActorId, ComponentCatalog, DefinitionDigest, DefinitionId, DefinitionReference,
    DefinitionRevisionNumber, DelegationChain, DelegationGrant, DelegationId, ExecutorCatalog,
    MembershipId, OntologyCatalog, PolicyCatalog, PolicyEvaluation, PolicyEvidence, PrincipalId,
    ReleaseDecisionOutcome, ReleaseDigest, ReleasePreviewDigest, ResourceId, TenantId,
    TimestampMicros, TrustedExecutionContext, WORLD_RELEASE_ACTIVATE_ACTION,
    WORLD_RELEASE_AUTHORITY_DEFINITION, WORLD_RELEASE_AUTHORITY_DEFINITION_DIGEST,
    WORLD_RELEASE_AUTHORITY_RESOURCE, WORLD_RELEASE_DECIDE_ACTION, WORLD_RELEASE_PREVIEW_ACTION,
    WORLD_RELEASE_PREVIEW_SCHEMA, WORLD_RELEASE_PUBLISH_ACTION, WORLD_RELEASE_SCHEMA, WorkloadId,
    WorldId, WorldRelease, WorldReleaseCatalogs, WorldReleaseDecision, WorldReleaseError,
    WorldReleasePreview, WorldReleasePublication,
};
use zoen_engine::{PolicyOperation, PolicyRequest, directory_projection};

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
            membership,
        } => publish(&read_json(&file)?, &principal, &membership).await,
        ReleaseCommand::Preview {
            world,
            digest,
            principal,
            membership,
        } => preview(&world, &digest, &principal, &membership).await,
        ReleaseCommand::Decide {
            preview_digest,
            principal,
            membership,
            decision,
        } => decide(&preview_digest, &principal, &membership, &decision).await,
        ReleaseCommand::Activate {
            world,
            digest,
            preview_digest,
            principal,
            membership,
        } => activate(&world, &digest, &preview_digest, &principal, &membership).await,
        ReleaseCommand::Get { digest } => get(&digest).await,
        ReleaseCommand::Active { world } => active(&world).await,
        ReleaseCommand::Catalogs { digest, world } => catalogs(&digest, world.as_deref()).await,
        ReleaseCommand::Budgets { world } => budgets(&world).await,
        ReleaseCommand::Authorize {
            world,
            principal,
            action_id,
            definition_digest,
            definition_id,
            resource_id,
            operation,
        } => {
            authorize(
                &world,
                &principal,
                &action_id,
                &definition_digest,
                &definition_id,
                &resource_id,
                &operation,
            )
            .await
        }
    }
}

fn construct(value: &Value) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let parsed = parse_release_document(value)?;
    Ok(ok(release_json(
        &parsed.release,
        None,
        None,
        None,
        parsed.catalogs.as_ref(),
    )))
}

async fn publish(
    value: &Value,
    principal: &str,
    membership: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let published_by = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    let parsed = parse_release_document(value)?;
    let Some(catalogs) = parsed.catalogs else {
        return Ok(fail(2, "world release publish requires catalog bytes"));
    };
    if let Err(error) = require_loadable_ontology_catalog(catalogs.ontology().bytes()) {
        return Ok(fail(
            1,
            &format!("ontology catalog must declare the seven public verbs: {error}"),
        ));
    }
    if let Err(error) = require_loadable_policy_catalog(catalogs.policy().bytes()) {
        return Ok(fail(
            2,
            &format!("policy catalog must contain a loadable Cedar bundle: {error}"),
        ));
    }
    let (store, identity) = authority_stores().await?;
    let policy_evidence = match authorize_candidate_owner(
        &identity,
        parsed.release.content().world(),
        catalogs.policy().bytes(),
        &published_by,
        &membership,
        ReleaseAuthorityOperation::Publish,
    )
    .await
    {
        Ok(evidence) => evidence,
        Err(message) => return Ok(fail(1, &message)),
    };
    let publication = WorldReleasePublication::new(
        parsed.release.id().clone(),
        now(),
        published_by,
        policy_evidence,
    )?;
    let PublicationPut {
        publication: stored,
        replay,
    } = store
        .publish_candidate(&catalogs, &parsed.release, &publication)
        .await?;
    Ok(ok(release_json(
        &parsed.release,
        Some(&stored),
        None,
        Some(replay),
        Some(&catalogs),
    )))
}

async fn preview(
    world: &str,
    digest: &str,
    principal: &str,
    membership: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let actor = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    let world = WorldId::parse(world)?;
    let digest = ReleaseDigest::parse(digest)?;
    let (store, identity) = authority_stores().await?;
    if let Err(message) = authorize_owner(
        &store,
        &identity,
        &world,
        &digest,
        &actor,
        &membership,
        ReleaseAuthorityOperation::Preview,
    )
    .await
    {
        return Ok(fail(1, &message));
    }
    let PreviewPut { preview, replay } = match store.preview(&world, &digest).await {
        Ok(value) => value,
        Err(WorldReleaseError::NotFound) => {
            return Ok(fail(1, "world release was not found"));
        }
        Err(WorldReleaseError::MissingPolicy) => {
            return Ok(fail(
                1,
                "world release publication requires policy evidence",
            ));
        }
        Err(WorldReleaseError::WorldMismatch) => {
            return Ok(fail(1, "release digest does not belong to this World"));
        }
        Err(error) => return Err(error.into()),
    };
    Ok(ok(preview_json(&preview, replay)))
}

async fn decide(
    preview_digest: &str,
    principal: &str,
    membership: &str,
    decision: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let actor = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    let preview_digest = ReleasePreviewDigest::parse(preview_digest)?;
    let outcome = match ReleaseDecisionOutcome::parse(decision) {
        Ok(value) => value,
        Err(error) => return Ok(fail(2, &error.to_string())),
    };
    let (store, identity) = authority_stores().await?;
    let Some(preview) = store.get_preview(&preview_digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    if let Err(message) = authorize_owner(
        &store,
        &identity,
        preview.content().world(),
        preview.content().release(),
        &actor,
        &membership,
        ReleaseAuthorityOperation::Decide,
    )
    .await
    {
        return Ok(fail(1, &message));
    }
    let DecisionPut { decision, replay } =
        match store.decide(&preview_digest, &actor, outcome, now()).await {
            Ok(value) => value,
            Err(WorldReleaseError::NotFound) => {
                return Ok(fail(1, "world release was not found"));
            }
            Err(WorldReleaseError::StalePreview) => {
                return Ok(fail(1, "release preview is stale"));
            }
            Err(WorldReleaseError::NotOwner) => {
                return Ok(fail(1, "principal is not the owner of this World"));
            }
            Err(error) => return Err(error.into()),
        };
    Ok(ok(decision_json(&decision, replay)))
}

async fn activate(
    world: &str,
    digest: &str,
    preview_digest: &str,
    principal: &str,
    membership: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let actor = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    let world = WorldId::parse(world)?;
    let digest = ReleaseDigest::parse(digest)?;
    let preview_digest = ReleasePreviewDigest::parse(preview_digest)?;
    let (store, identity) = authority_stores().await?;
    if let Err(message) = authorize_owner(
        &store,
        &identity,
        &world,
        &digest,
        &actor,
        &membership,
        ReleaseAuthorityOperation::Activate,
    )
    .await
    {
        return Ok(fail(1, &message));
    }
    let Some(catalogs) = store.get_catalogs(&digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    if let Err(error) = require_loadable_policy_catalog(catalogs.policy().bytes()) {
        return Ok(fail(
            1,
            &format!("active release lacks a loadable Cedar bundle: {error}"),
        ));
    }
    let ActivatePut { previous, replay } = match store
        .activate(&world, &digest, &preview_digest, now())
        .await
    {
        Ok(value) => value,
        Err(WorldReleaseError::NotFound) => {
            return Ok(fail(1, "world release was not found"));
        }
        Err(WorldReleaseError::MissingApproval) => {
            return Ok(fail(1, "activation requires an approving decision"));
        }
        Err(WorldReleaseError::Rejected) => {
            return Ok(fail(1, "release activation was rejected"));
        }
        Err(WorldReleaseError::StalePreview) => {
            return Ok(fail(1, "release preview is stale"));
        }
        Err(WorldReleaseError::WorldMismatch) => {
            return Ok(fail(1, "release digest does not belong to this World"));
        }
        Err(WorldReleaseError::MissingPolicy) => {
            return Ok(fail(
                1,
                "world release publication requires policy evidence",
            ));
        }
        Err(error) => return Err(error.into()),
    };
    let release = store
        .get(&digest)
        .await?
        .ok_or(WorldReleaseError::NotFound)?;
    let publication = store.get_publication(&digest).await?;
    Ok(ok(json!({
        "activated": true,
        "digest": digest.as_str(),
        "previousDigest": previous.as_ref().map(ReleaseDigest::as_str),
        "previewDigest": preview_digest.as_str(),
        "replay": replay,
        "world": world.as_str(),
        "release": release_json(
            &release,
            publication.as_ref(),
            Some(digest.as_str()),
            None,
            Some(&catalogs),
        ),
    })))
}

fn preview_json(preview: &WorldReleasePreview, replay: bool) -> Value {
    let content = preview.content();
    json!({
        "canonicalJcs": preview.canonical_jcs(),
        "candidate": {
            "components": content.candidate().components().as_str(),
            "executors": content.candidate().executors().as_str(),
            "ontology": content.candidate().ontology().as_str(),
            "policy": content.candidate().policy().as_str(),
        },
        "current": content.current().map(|snapshot| json!({
            "components": snapshot.components().as_str(),
            "executors": snapshot.executors().as_str(),
            "ontology": snapshot.ontology().as_str(),
            "policy": snapshot.policy().as_str(),
        })),
        "currentActive": content.current_active().map(ReleaseDigest::as_str),
        "digest": content.release().as_str(),
        "previewDigest": preview.id().as_str(),
        "replay": replay,
        "schema": WORLD_RELEASE_PREVIEW_SCHEMA,
        "world": content.world().as_str(),
    })
}

fn decision_json(decision: &WorldReleaseDecision, replay: bool) -> Value {
    json!({
        "decision": decision.outcome().as_str(),
        "decidedAtMicros": decision.decided_at().get(),
        "decidedBy": decision.decided_by().as_str(),
        "digest": decision.release().as_str(),
        "previewDigest": decision.preview().as_str(),
        "replay": replay,
        "world": decision.world().as_str(),
    })
}

async fn get(digest: &str) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let digest = ReleaseDigest::parse(digest)?;
    let store = store().await?;
    let Some(release) = store.get(&digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    let publication = store.get_publication(&digest).await?;
    let active = store.get_active(release.content().world()).await?;
    let catalogs = store.get_catalogs(&digest).await?;
    Ok(ok(release_json(
        &release,
        publication.as_ref(),
        active.as_ref().map(ReleaseDigest::as_str),
        None,
        catalogs.as_ref(),
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

async fn catalogs(
    digest: &str,
    world: Option<&str>,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let digest = ReleaseDigest::parse(digest)?;
    let store = store().await?;
    let Some(release) = store.get(&digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    if let Some(world) = world {
        let world = WorldId::parse(world)?;
        if release.content().world() != &world {
            return Err(WorldReleaseError::WorldMismatch.into());
        }
    }
    let Some(catalogs) = store.get_catalogs(&digest).await? else {
        return Ok(fail(1, "world release was not found"));
    };
    Ok(ok(json!({
        "digest": release.id().as_str(),
        "world": release.content().world().as_str(),
        "catalogs": catalogs_json(&catalogs),
    })))
}

struct ParsedRelease {
    release: WorldRelease,
    catalogs: Option<WorldReleaseCatalogs>,
}

fn parse_release_document(value: &Value) -> Result<ParsedRelease, WorldReleaseError> {
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
    let world = WorldId::parse(required_world(object)?)?;
    let parent = match object.get("parent") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) => Some(ReleaseDigest::parse(value.clone())?),
        Some(_) => {
            return Err(WorldReleaseError::Conflict(
                "parent must be null or a release digest".to_owned(),
            ));
        }
    };
    let ontology = parse_catalog_field(object, "ontology")?;
    let policy = parse_catalog_field(object, "policy")?;
    let executors = parse_catalog_field(object, "executors")?;
    let components = parse_catalog_field(object, "components")?;
    match (ontology, policy, executors, components) {
        (
            CatalogField::Bytes(ontology),
            CatalogField::Bytes(policy),
            CatalogField::Bytes(executors),
            CatalogField::Bytes(components),
        ) => {
            let catalogs = WorldReleaseCatalogs::new(
                OntologyCatalog::from_bytes(ontology),
                PolicyCatalog::from_bytes(policy),
                ExecutorCatalog::from_bytes(executors),
                ComponentCatalog::from_bytes(components),
            );
            let release = WorldRelease::from_content(catalogs.content(world, parent))?;
            Ok(ParsedRelease {
                release,
                catalogs: Some(catalogs),
            })
        }
        (
            CatalogField::Digest(ontology),
            CatalogField::Digest(policy),
            CatalogField::Digest(executors),
            CatalogField::Digest(components),
        ) => {
            let content = zoen_core::WorldReleaseContent::new(
                world,
                parent,
                zoen_core::OntologyCatalogDigest::parse(ontology)?,
                zoen_core::PolicyCatalogDigest::parse(policy)?,
                zoen_core::ExecutorCatalogDigest::parse(executors)?,
                zoen_core::ComponentCatalogDigest::parse(components)?,
            );
            Ok(ParsedRelease {
                release: WorldRelease::from_content(content)?,
                catalogs: None,
            })
        }
        _ => Err(WorldReleaseError::MixedCatalogs),
    }
}

enum CatalogField {
    Digest(String),
    Bytes(Vec<u8>),
}

fn parse_catalog_field(
    object: &Map<String, Value>,
    key: &str,
) -> Result<CatalogField, WorldReleaseError> {
    match object.get(key) {
        Some(Value::String(value)) => Ok(CatalogField::Digest(value.clone())),
        Some(Value::Object(inner)) => {
            let payload = inner
                .get("bytes")
                .and_then(Value::as_str)
                .ok_or_else(|| WorldReleaseError::Conflict(format!("{key}.bytes is required")))?;
            let encoding = inner
                .get("encoding")
                .and_then(Value::as_str)
                .unwrap_or("utf8");
            let bytes = decode_catalog_bytes(payload, encoding)?;
            Ok(CatalogField::Bytes(bytes))
        }
        _ => Err(WorldReleaseError::Conflict(format!("{key} is required"))),
    }
}

fn decode_catalog_bytes(payload: &str, encoding: &str) -> Result<Vec<u8>, WorldReleaseError> {
    match encoding {
        "utf8" => Ok(payload.as_bytes().to_vec()),
        "base64" => BASE64.decode(payload.as_bytes()).map_err(|_| {
            WorldReleaseError::Conflict("catalog bytes must be valid base64".to_owned())
        }),
        other => Err(WorldReleaseError::Conflict(format!(
            "unsupported catalog encoding {other}"
        ))),
    }
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

fn required_world(object: &Map<String, Value>) -> Result<&str, WorldReleaseError> {
    object
        .get("world")
        .and_then(Value::as_str)
        .ok_or_else(|| WorldReleaseError::Conflict("world is required".to_owned()))
}

fn release_json(
    release: &WorldRelease,
    publication: Option<&WorldReleasePublication>,
    active_digest: Option<&str>,
    replay: Option<bool>,
    catalogs: Option<&WorldReleaseCatalogs>,
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
    if let Some(catalogs) = catalogs {
        body["catalogs"] = catalogs_json(catalogs);
    }
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

fn catalogs_json(catalogs: &WorldReleaseCatalogs) -> Value {
    json!({
        "components": catalog_json(catalogs.components().digest().as_str(), catalogs.components().bytes()),
        "executors": catalog_json(catalogs.executors().digest().as_str(), catalogs.executors().bytes()),
        "ontology": catalog_json(catalogs.ontology().digest().as_str(), catalogs.ontology().bytes()),
        "policy": catalog_json(catalogs.policy().digest().as_str(), catalogs.policy().bytes()),
    })
}

fn catalog_json(digest: &str, bytes: &[u8]) -> Value {
    match std::str::from_utf8(bytes) {
        Ok(text) => json!({
            "bytes": text,
            "digest": digest,
            "encoding": "utf8",
        }),
        Err(_) => json!({
            "bytes": BASE64.encode(bytes),
            "digest": digest,
            "encoding": "base64",
        }),
    }
}

async fn budgets(world: &str) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let world = WorldId::parse(world)?;
    let store = store().await?;
    let Some(active_digest) = store.get_active(&world).await? else {
        return Ok(fail(1, "world has no active release"));
    };
    let Some(catalogs) = store.get_catalogs(&active_digest).await? else {
        return Ok(fail(1, "active release lacks policy catalog bytes"));
    };
    let catalog = match zoen_adapters::budget_classes_from_policy_catalog(catalogs.policy().bytes())
    {
        Ok(catalog) => catalog,
        Err(error) => {
            return Ok(fail(
                1,
                &format!("active release BudgetClass catalog is invalid: {error}"),
            ));
        }
    };
    let classes: Vec<Value> = catalog
        .classes()
        .map(|class| {
            json!({
                "deadlineMillis": class.deadline_millis(),
                "fuel": class.fuel(),
                "id": class.id().as_str(),
                "instances": class.instances(),
                "memories": class.memories(),
                "memoryBytes": class.memory_bytes(),
                "tableElements": class.table_elements(),
                "tables": class.tables(),
            })
        })
        .collect();
    Ok(ok(json!({
        "authority": "active-release-policy-catalog",
        "budgetClasses": classes,
        "digest": active_digest.as_str(),
        "policyCatalogDigest": catalogs.policy().digest().as_str(),
        "world": world.as_str(),
    })))
}

async fn authorize(
    world: &str,
    principal: &str,
    action_id: &str,
    definition_digest: &str,
    definition_id: &str,
    resource_id: &str,
    operation: &str,
) -> Result<ReleaseCliResult, Box<dyn Error + Send + Sync>> {
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let action = ActionId::parse(action_id)?;
    let resource = ResourceId::parse(resource_id)?;
    let definition = DefinitionReference {
        definition_id: DefinitionId::parse(definition_id)?,
        digest: DefinitionDigest::parse(definition_digest)?,
        revision: DefinitionRevisionNumber::new(1).ok_or_else(|| {
            WorldReleaseError::Conflict("definition revision must be positive".to_owned())
        })?,
    };
    let operation = parse_policy_operation(operation)?;
    let store = store().await?;
    let Some(active_digest) = store.get_active(&world).await? else {
        return Ok(fail(1, "world has no active release"));
    };
    let Some(catalogs) = store.get_catalogs(&active_digest).await? else {
        return Ok(fail(1, "active release lacks policy catalog bytes"));
    };
    let evaluator = match require_loadable_policy_catalog(catalogs.policy().bytes()) {
        Ok(evaluator) => evaluator,
        Err(error) => {
            return Ok(fail(
                1,
                &format!("active release lacks a loadable Cedar bundle: {error}"),
            ));
        }
    };
    // Boot manifest must not authorize after activation — evaluate only catalog Cedar.
    // `bootManifestIgnored` is always true here: authorize never loads the boot file.
    let context = authorize_context(&world, &principal, &action, &resource)?;
    let projection =
        directory_projection(&context, &resource).map_err(WorldReleaseError::Conflict)?;
    let evaluation = evaluator.evaluate_request(&PolicyRequest {
        action_id: &action,
        approved: false,
        classification: None,
        context: &context,
        definition: &definition,
        inputs: &[],
        operation,
        projection: Some(&projection),
        resource_id: &resource,
        written_classification: None,
    });
    let (decision, evidence) = match evaluation {
        PolicyEvaluation::Permit(evidence) => ("permit", Some(evidence)),
        PolicyEvaluation::Deny(evidence) => ("deny", Some(evidence)),
        PolicyEvaluation::EvaluationError { message, revision } => {
            return Ok(ok(json!({
                "authority": "active-release-policy-catalog",
                "bootManifestIgnored": true,
                "decision": "error",
                "digest": active_digest.as_str(),
                "message": message,
                "policyCatalogDigest": catalogs.policy().digest().as_str(),
                "revision": revision.map(|value| json!({
                    "digest": value.digest.as_str(),
                    "id": value.id.as_str(),
                    "revision": value.revision.get(),
                })),
                "world": world.as_str(),
            })));
        }
    };
    Ok(ok(json!({
        "authority": "active-release-policy-catalog",
        "bootManifestIgnored": true,
        "decision": decision,
        "digest": active_digest.as_str(),
        "policyCatalogDigest": catalogs.policy().digest().as_str(),
        "policy": evidence.map(|value| json!({
            "determiningPolicies": value.determining_policies,
            "digest": value.revision.digest.as_str(),
            "id": value.revision.id.as_str(),
            "revision": value.revision.revision.get(),
        })),
        "world": world.as_str(),
    })))
}

fn parse_policy_operation(value: &str) -> Result<PolicyOperation, WorldReleaseError> {
    match value {
        "discover" => Ok(PolicyOperation::Discover),
        "approve" => Ok(PolicyOperation::Approve),
        "commit" => Ok(PolicyOperation::Commit),
        "read" => Ok(PolicyOperation::Read),
        "publish_definition" => Ok(PolicyOperation::PublishDefinition),
        "request_approval" => Ok(PolicyOperation::RequestApproval),
        other => Err(WorldReleaseError::Conflict(format!(
            "unsupported policy operation {other}"
        ))),
    }
}

#[derive(Clone, Copy)]
enum ReleaseAuthorityOperation {
    Publish,
    Preview,
    Decide,
    Activate,
}

impl ReleaseAuthorityOperation {
    fn action_id(self) -> &'static str {
        match self {
            Self::Publish => WORLD_RELEASE_PUBLISH_ACTION,
            Self::Preview => WORLD_RELEASE_PREVIEW_ACTION,
            Self::Decide => WORLD_RELEASE_DECIDE_ACTION,
            Self::Activate => WORLD_RELEASE_ACTIVATE_ACTION,
        }
    }

    fn policy_operation(self) -> PolicyOperation {
        match self {
            Self::Publish => PolicyOperation::PublishRelease,
            Self::Preview => PolicyOperation::PreviewRelease,
            Self::Decide => PolicyOperation::DecideRelease,
            Self::Activate => PolicyOperation::ActivateRelease,
        }
    }
}

async fn authorize_owner(
    releases: &PostgresWorldReleaseStore,
    identities: &PostgresIdentityStore,
    world: &WorldId,
    release_digest: &ReleaseDigest,
    principal: &PrincipalId,
    membership_id: &MembershipId,
    operation: ReleaseAuthorityOperation,
) -> Result<PolicyEvidence, String> {
    let (action, resource, context) =
        resolve_owner_authority(identities, world, principal, membership_id, operation).await?;
    let release = releases
        .get(release_digest)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "world release was not found".to_owned())?;
    if release.content().world() != world {
        return Err("release digest does not belong to this World".to_owned());
    }
    let catalogs = releases
        .get_catalogs(release_digest)
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "world release catalogs were not found".to_owned())?;
    evaluate_owner_policy(
        catalogs.policy().bytes(),
        &action,
        &resource,
        &context,
        operation,
    )
}

async fn authorize_candidate_owner(
    identities: &PostgresIdentityStore,
    world: &WorldId,
    policy_catalog: &[u8],
    principal: &PrincipalId,
    membership_id: &MembershipId,
    operation: ReleaseAuthorityOperation,
) -> Result<PolicyEvidence, String> {
    let (action, resource, context) =
        resolve_owner_authority(identities, world, principal, membership_id, operation).await?;
    evaluate_owner_policy(policy_catalog, &action, &resource, &context, operation)
}

async fn resolve_owner_authority(
    identities: &PostgresIdentityStore,
    world: &WorldId,
    principal: &PrincipalId,
    membership_id: &MembershipId,
    operation: ReleaseAuthorityOperation,
) -> Result<(ActionId, ResourceId, TrustedExecutionContext), String> {
    const DENIED: &str = "principal is not an active owner Membership for this World";

    let action = ActionId::parse(operation.action_id()).map_err(|_| DENIED.to_owned())?;
    let resource =
        ResourceId::parse(WORLD_RELEASE_AUTHORITY_RESOURCE).map_err(|_| DENIED.to_owned())?;
    let tenant = TenantId::parse(world.as_str()).map_err(|_| DENIED.to_owned())?;
    let context = identities
        .resolve_personal_membership_authority(
            membership_id,
            &tenant,
            principal,
            &action,
            &resource,
            now(),
        )
        .await
        .map_err(|_| DENIED.to_owned())?;
    Ok((action, resource, context))
}

fn evaluate_owner_policy(
    policy_catalog: &[u8],
    action: &ActionId,
    resource: &ResourceId,
    context: &TrustedExecutionContext,
    operation: ReleaseAuthorityOperation,
) -> Result<PolicyEvidence, String> {
    let evaluator = require_loadable_policy_catalog(policy_catalog)
        .map_err(|error| format!("release owner policy is broken: {error}"))?;
    let definition = DefinitionReference {
        definition_id: DefinitionId::parse(WORLD_RELEASE_AUTHORITY_DEFINITION)
            .map_err(|error| error.to_string())?,
        digest: DefinitionDigest::parse(WORLD_RELEASE_AUTHORITY_DEFINITION_DIGEST)
            .map_err(|error| error.to_string())?,
        revision: DefinitionRevisionNumber::new(1)
            .ok_or_else(|| "release authority revision must be positive".to_owned())?,
    };
    let projection = directory_projection(context, resource)?;
    match evaluator.evaluate_request(&PolicyRequest {
        action_id: action,
        approved: matches!(
            operation,
            ReleaseAuthorityOperation::Decide | ReleaseAuthorityOperation::Activate
        ),
        classification: None,
        context,
        definition: &definition,
        inputs: &[],
        operation: operation.policy_operation(),
        projection: Some(&projection),
        resource_id: resource,
        written_classification: None,
    }) {
        PolicyEvaluation::Permit(evidence) => Ok(evidence),
        PolicyEvaluation::Deny(_) => Err("release owner policy denied this operation".to_owned()),
        PolicyEvaluation::EvaluationError { message, .. } => {
            Err(format!("release owner policy evaluation failed: {message}"))
        }
    }
}

fn authorize_context(
    world: &WorldId,
    principal: &PrincipalId,
    action: &ActionId,
    resource: &ResourceId,
) -> Result<TrustedExecutionContext, Box<dyn Error + Send + Sync>> {
    let workload = WorkloadId::parse("workload.world-release")?;
    let grant = DelegationGrant::new(
        DelegationId::parse("delegation.world-release")?,
        std::collections::BTreeSet::from([action.clone()]),
        std::collections::BTreeSet::from([resource.clone()]),
        std::collections::BTreeSet::from([workload.clone()]),
        TimestampMicros::new(0),
        TimestampMicros::new(i64::MAX),
    )?;
    Ok(TrustedExecutionContext::new(
        TenantId::parse(world.as_str())?,
        ActorId::parse("actor.world-release")?,
        principal.clone(),
        workload,
        DelegationChain::new(vec![grant])?,
        zoen_core::Clearance::personal_owner(),
    ))
}

async fn store() -> Result<PostgresWorldReleaseStore, Box<dyn Error + Send + Sync>> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL is required for world release store commands")?;
    let authority = PostgresAuthorityStore::connect(&database_url).await?;
    Ok(PostgresWorldReleaseStore::new(authority.pool()))
}

async fn authority_stores()
-> Result<(PostgresWorldReleaseStore, PostgresIdentityStore), Box<dyn Error + Send + Sync>> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL is required for world release store commands")?;
    let authority = PostgresAuthorityStore::connect(&database_url).await?;
    let pool = authority.pool();
    Ok((
        PostgresWorldReleaseStore::new(pool.clone()),
        PostgresIdentityStore::new(pool),
    ))
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
