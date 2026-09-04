//! CLI surface for the seven public verbs on one governed catalog.

use std::error::Error;

use serde_json::{Value, json};
use zoen_adapters::{PostgresAuthorityStore, PostgresWorldKernel, PostgresWorldReleaseStore};
use zoen_core::{MembershipId, PrincipalId, WorldId};
use zoen_engine::{
    CursorKeyId, CursorKeyring, CursorSealer, CursorSigningKey, KernelDecisionOutcome,
    KernelDiscoverResult, KernelError, KernelObjectGrant, KernelPlantObject, KernelQueryPage,
    KernelSurface,
};

const DEFAULT_CURSOR_TTL_SECONDS: u64 = 300;
const CURSOR_ACTIVE_KEY_ID_ENV: &str = "ZOEN_CURSOR_ACTIVE_KEY_ID";
const CURSOR_KEYS_ENV: &str = "ZOEN_CURSOR_KEYS";
const CURSOR_TTL_ENV: &str = "ZOEN_CURSOR_TTL_SECONDS";

pub struct KernelCliResult {
    pub exit_code: u8,
    pub stdout: Value,
    pub message: String,
}

#[derive(Clone, Debug)]
pub enum KernelCommand {
    Discover {
        world: String,
        principal: String,
    },
    Query {
        world: String,
        principal: String,
        membership: Option<String>,
        object_type: Option<String>,
        cursor: Option<String>,
        limit: Option<u32>,
        budget_class: Option<String>,
    },
    PlantObject {
        world: String,
        principal: String,
        object_type: String,
        object_id: String,
        fields: String,
        grants: Vec<String>,
    },
    Propose {
        world: String,
        principal: String,
        proposal_id: String,
        input: String,
    },
    Decide {
        proposal_id: String,
        principal: String,
        decision: String,
    },
    Commit {
        proposal_id: String,
        principal: String,
    },
    Explain {
        receipt_id: String,
        principal: String,
    },
    Execute {
        receipt_id: String,
        principal: String,
    },
}

/// Drive `WorldKernel` verbs from the CLI against `DATABASE_URL`.
///
/// # Errors
///
/// Returns an error when the database cannot be opened.
pub async fn run(
    surface: KernelSurface,
    command: KernelCommand,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    match command {
        KernelCommand::Discover { world, principal } => discover(&world, &principal, surface).await,
        KernelCommand::Query {
            world,
            principal,
            membership,
            object_type,
            cursor,
            limit,
            budget_class,
        } => {
            query(
                &world,
                &principal,
                membership.as_deref(),
                object_type.as_deref(),
                cursor.as_deref(),
                limit,
                budget_class.as_deref(),
                surface,
            )
            .await
        }
        KernelCommand::PlantObject {
            world,
            principal,
            object_type,
            object_id,
            fields,
            grants,
        } => {
            plant_object(
                &world,
                &principal,
                &object_type,
                &object_id,
                &fields,
                &grants,
            )
            .await
        }
        KernelCommand::Propose {
            world,
            principal,
            proposal_id,
            input,
        } => propose(&world, &principal, &proposal_id, &input, surface).await,
        KernelCommand::Decide {
            proposal_id,
            principal,
            decision,
        } => decide(&proposal_id, &principal, &decision, surface).await,
        KernelCommand::Commit {
            proposal_id,
            principal,
        } => commit(&proposal_id, &principal, surface).await,
        KernelCommand::Explain {
            receipt_id,
            principal,
        } => explain(&receipt_id, &principal, surface).await,
        KernelCommand::Execute {
            receipt_id,
            principal,
        } => execute(&receipt_id, &principal, surface).await,
    }
}

async fn discover(
    world: &str,
    principal: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    match kernel.discover(&world, &principal, surface).await {
        Ok(result) => Ok(ok(discover_json(&result))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn query(
    world: &str,
    principal: &str,
    membership: Option<&str>,
    object_type: Option<&str>,
    cursor: Option<&str>,
    limit: Option<u32>,
    budget_class: Option<&str>,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    if object_type.is_none() {
        return match kernel.query(&world, &principal, surface).await {
            Ok(result) => Ok(ok(discover_json(&result))),
            Err(error) => Ok(map_error(error)),
        };
    }
    let membership =
        MembershipId::parse(membership.ok_or("membership is required for sealed object query")?)?;
    let object_type = object_type.ok_or("type is required for sealed object query")?;
    let page_token = cursor.unwrap_or("");
    let requested_limit = limit.unwrap_or(5);
    match kernel
        .query_objects(
            &world,
            &principal,
            &membership,
            object_type,
            page_token,
            requested_limit,
            budget_class,
            surface,
        )
        .await
    {
        Ok(page) => Ok(ok(query_page_json(&page))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn plant_object(
    world: &str,
    principal: &str,
    object_type: &str,
    object_id: &str,
    fields: &str,
    grants: &[String],
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let mut parsed_grants = Vec::new();
    for grant in grants {
        let (grant_principal, membership) = grant
            .split_once(':')
            .ok_or_else(|| format!("grant {grant} must be principal:membership"))?;
        parsed_grants.push(KernelObjectGrant {
            principal: PrincipalId::parse(grant_principal)?,
            membership: membership.to_owned(),
        });
    }
    let object = KernelPlantObject {
        object_id: object_id.to_owned(),
        object_type: object_type.to_owned(),
        fields_jcs: fields.to_owned(),
        grants: parsed_grants,
    };
    match kernel.plant_object(&world, &principal, &object).await {
        Ok(()) => Ok(ok(json!({
            "grants": grants,
            "objectId": object_id,
            "objectType": object_type,
            "world": world.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

fn query_page_json(page: &KernelQueryPage) -> Value {
    json!({
        "authorizedCount": page.authorized_count,
        "budgetId": page.budget_id,
        "catalog": {
            "components": page.basis.components.as_str(),
            "executors": page.basis.executors.as_str(),
            "ontology": page.basis.ontology.as_str(),
            "policy": page.basis.policy.as_str(),
        },
        "authorityEvaluation": "NOT_EVALUATED",
        "computeEvaluation": "NOT_EVALUATED",
        "cursorClaims": {
            "authorityCut": page.authority_cut.map(zoen_core::CommitSequence::get),
            "authorizedObjectSetPlanDigest": page.authorized_plan_digest.as_str(),
            "trustedAuthorityDigest": page
                .trusted_authority_digest
                .as_ref()
                .map(zoen_engine::TrustedAuthorityDigest::as_str),
        },
        "decision": match &page.decision {
            zoen_engine::KernelPolicyDecision::Permit => Value::String("permit".to_owned()),
            zoen_engine::KernelPolicyDecision::Deny => Value::String("deny".to_owned()),
            zoen_engine::KernelPolicyDecision::Error(message) => json!({"error": message}),
        },
        "explanationJcs": page.explanation_jcs,
        "membership": page.membership,
        "nextCursor": page.next_cursor,
        "objectType": page.object_type,
        "objects": page.objects.iter().map(|object| json!({
            "fieldsJcs": object.fields_jcs,
            "objectId": object.object_id,
            "objectType": object.object_type,
        })).collect::<Vec<_>>(),
        "pageLimit": page.page_limit,
        "pageDigest": page.page_digest,
        "releaseDigest": page.basis.release_digest.as_str(),
        "surface": page.surface.as_str(),
        "world": page.basis.world.as_str(),
    })
}

async fn propose(
    world: &str,
    principal: &str,
    proposal_id: &str,
    input: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    match kernel
        .propose(&world, &principal, proposal_id, input, surface)
        .await
    {
        Ok((proposal, surface)) => Ok(ok(json!({
            "inputJcs": proposal.input_jcs,
            "previewHash": proposal.preview_hash,
            "principal": proposal.principal.as_str(),
            "proposalId": proposal.proposal_id,
            "releaseDigest": proposal.release_digest.as_str(),
            "surface": surface.as_str(),
            "world": proposal.world.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn decide(
    proposal_id: &str,
    principal: &str,
    decision: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    let outcome = KernelDecisionOutcome::parse(decision)?;
    match kernel
        .decide(proposal_id, &principal, outcome, surface)
        .await
    {
        Ok((decision, surface)) => Ok(ok(json!({
            "outcome": decision.outcome.as_str(),
            "principal": decision.principal.as_str(),
            "proposalId": decision.proposal_id,
            "surface": surface.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn commit(
    proposal_id: &str,
    principal: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    match kernel.commit(proposal_id, &principal, surface).await {
        Ok((receipt, surface)) => Ok(ok(json!({
            "explanationJcs": receipt.explanation_jcs,
            "proposalId": receipt.proposal_id,
            "receiptId": receipt.receipt_id,
            "releaseDigest": receipt.release_digest.as_str(),
            "surface": surface.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn explain(
    receipt_id: &str,
    principal: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    match kernel.explain(receipt_id, &principal, surface).await {
        Ok(explanation) => Ok(ok(json!({
            "explanationJcs": explanation.explanation_jcs,
            "proposalId": explanation.proposal_id,
            "receiptId": explanation.receipt_id,
            "releaseDigest": explanation.release_digest.as_str(),
            "surface": explanation.surface.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn execute(
    receipt_id: &str,
    principal: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    match kernel.execute(receipt_id, &principal, surface).await {
        Ok((execution, surface)) => Ok(ok(json!({
            "executionId": execution.execution_id,
            "receiptId": execution.receipt_id,
            "releaseDigest": execution.release_digest.as_str(),
            "surface": surface.as_str(),
        }))),
        Err(error) => Ok(map_error(error)),
    }
}

fn discover_json(result: &KernelDiscoverResult) -> Value {
    json!({
        "catalog": {
            "components": result.basis.components.as_str(),
            "executors": result.basis.executors.as_str(),
            "ontology": result.basis.ontology.as_str(),
            "policy": result.basis.policy.as_str(),
        },
        "decision": match &result.decision {
            zoen_engine::KernelPolicyDecision::Permit => Value::String("permit".to_owned()),
            zoen_engine::KernelPolicyDecision::Deny => Value::String("deny".to_owned()),
            zoen_engine::KernelPolicyDecision::Error(message) => json!({"error": message}),
        },
        "publicVerbs": result
            .basis
            .public_verbs
            .iter()
            .map(|verb| verb.as_str())
            .collect::<Vec<_>>(),
        "releaseDigest": result.basis.release_digest.as_str(),
        "surface": result.surface.as_str(),
        "world": result.basis.world.as_str(),
    })
}

fn map_error(error: KernelError) -> KernelCliResult {
    match error {
        KernelError::Denied(message)
        | KernelError::Conflict(message)
        | KernelError::NotFound(message)
        | KernelError::Store(message) => fail(1, &message),
    }
}

fn ok(stdout: Value) -> KernelCliResult {
    KernelCliResult {
        exit_code: 0,
        stdout,
        message: String::new(),
    }
}

fn fail(exit_code: u8, message: &str) -> KernelCliResult {
    KernelCliResult {
        exit_code,
        stdout: Value::Null,
        message: message.to_owned(),
    }
}

async fn kernel() -> Result<PostgresWorldKernel, Box<dyn Error + Send + Sync>> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| "DATABASE_URL is required for kernel verb commands")?;
    let authority = PostgresAuthorityStore::connect(&database_url).await?;
    let pool = authority.pool();
    Ok(PostgresWorldKernel::new(
        PostgresWorldReleaseStore::new(pool.clone()),
        pool,
        cursor_sealer_from_env()?,
    ))
}

fn cursor_sealer_from_env() -> Result<Option<CursorSealer>, Box<dyn Error + Send + Sync>> {
    let active_key_id = optional_nonempty_env(CURSOR_ACTIVE_KEY_ID_ENV)?;
    let encoded_keys = optional_nonempty_env(CURSOR_KEYS_ENV)?;
    let configured_ttl = optional_nonempty_env(CURSOR_TTL_ENV)?;
    let (active_key_id, encoded_keys) = match (active_key_id, encoded_keys, configured_ttl.as_ref())
    {
        (None, None, None) => return Ok(None),
        (Some(active_key_id), Some(encoded_keys), _) => (active_key_id, encoded_keys),
        _ => {
            return Err(format!(
                "{CURSOR_ACTIVE_KEY_ID_ENV} and {CURSOR_KEYS_ENV} must be configured together; \
                 {CURSOR_TTL_ENV} is optional only for a configured keyring"
            )
            .into());
        }
    };
    let active_key_id = CursorKeyId::parse(active_key_id)?;
    let mut keys = Vec::new();
    for encoded_key in encoded_keys.split(',') {
        let (key_id, secret_hex) = encoded_key.split_once(':').ok_or_else(|| {
            format!("{CURSOR_KEYS_ENV} entries must use <key-id>:<lowercase-hex-secret>")
        })?;
        let key_id = CursorKeyId::parse(key_id)?;
        let secret = decode_secret_hex(secret_hex)?;
        keys.push(CursorSigningKey::new(key_id, secret)?);
    }
    let ttl_seconds = match configured_ttl {
        Some(value) => value
            .parse::<u64>()
            .map_err(|_| format!("{CURSOR_TTL_ENV} must be a positive integer"))?,
        None => DEFAULT_CURSOR_TTL_SECONDS,
    };
    Ok(Some(CursorSealer::new(
        CursorKeyring::new(active_key_id, keys)?,
        ttl_seconds,
    )?))
}

fn optional_nonempty_env(name: &str) -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    match std::env::var(name) {
        Ok(value) if value.is_empty() => Err(format!("{name} must not be empty").into()),
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => {
            Err(format!("{name} must contain Unicode text").into())
        }
    }
}

fn decode_secret_hex(value: &str) -> Result<Vec<u8>, Box<dyn Error + Send + Sync>> {
    if !value.len().is_multiple_of(2)
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(format!("{CURSOR_KEYS_ENV} contains an invalid secret encoding").into());
    }
    (0..value.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&value[index..index + 2], 16).map_err(|_| {
                format!("{CURSOR_KEYS_ENV} contains an invalid secret encoding").into()
            })
        })
        .collect()
}
