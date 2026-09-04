//! CLI surface for the seven public verbs on one governed catalog.

use std::error::Error;

use serde_json::{Value, json};
use zoen_adapters::{PostgresAuthorityStore, PostgresWorldKernel, PostgresWorldReleaseStore};
use zoen_core::{MembershipId, PrincipalId, WorldId};
use zoen_engine::{
    CursorKeyId, CursorKeyring, CursorSealer, CursorSigningKey, KernelDecisionOutcome,
    KernelDiscoverResult, KernelError, KernelIdentifierQueryPage, KernelIdentifierSelector,
    KernelQueryPage, KernelSurface,
};

const DEFAULT_CURSOR_TTL_SECONDS: u64 = 300;
const CURSOR_ACTIVE_KEY_ID_ENV: &str = "ZOEN_CURSOR_ACTIVE_KEY_ID";
const CURSOR_KEYS_ENV: &str = "ZOEN_CURSOR_KEYS";
const CURSOR_TTL_ENV: &str = "ZOEN_CURSOR_TTL_SECONDS";

#[derive(Clone, Copy)]
enum CursorEnvironment {
    ActiveKeyId,
    Keys,
    Ttl,
}

#[derive(Clone, Copy)]
enum CursorConfigurationFailure {
    ActiveKeyIdEmpty,
    ActiveKeyIdNotUnicode,
    KeysEmpty,
    KeysNotUnicode,
    TtlEmpty,
    TtlNotUnicode,
    IncompleteKeyring,
    InvalidKeyId,
    InvalidKeyEntry,
    InvalidKeyEncoding,
    SigningKeyTooShort,
    InvalidTtl,
    TtlNotPositive,
    InvalidKeyring,
    InvalidSealer,
}

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
        membership: String,
    },
    Query {
        world: String,
        principal: String,
        membership: String,
        object_type: Option<String>,
        identifier: Option<String>,
        scheme: Option<String>,
        venue_entity: Option<String>,
        mic: Option<String>,
        currency: Option<String>,
        share_class: Option<String>,
        provider: Option<String>,
        identifier_level: Option<String>,
        valid_at_micros: Option<i64>,
        cursor: Option<String>,
        limit: Option<u32>,
    },
    Propose {
        world: String,
        principal: String,
        membership: String,
        proposal_id: String,
        input: String,
    },
    Decide {
        proposal_id: String,
        principal: String,
        membership: String,
        decision: String,
    },
    Commit {
        proposal_id: String,
        principal: String,
        membership: String,
    },
    Explain {
        receipt_id: String,
        principal: String,
        membership: String,
    },
    Execute {
        receipt_id: String,
        principal: String,
        membership: String,
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
        KernelCommand::Discover {
            world,
            principal,
            membership,
        } => discover(&world, &principal, &membership, surface).await,
        KernelCommand::Query {
            world,
            principal,
            membership,
            object_type,
            identifier,
            scheme,
            venue_entity,
            mic,
            currency,
            share_class,
            provider,
            identifier_level,
            valid_at_micros,
            cursor,
            limit,
        } => {
            query(
                &world,
                &principal,
                &membership,
                object_type.as_deref(),
                identifier.as_deref(),
                scheme.as_deref(),
                venue_entity.as_deref(),
                mic.as_deref(),
                currency.as_deref(),
                share_class.as_deref(),
                provider.as_deref(),
                identifier_level.as_deref(),
                valid_at_micros,
                cursor.as_deref(),
                limit,
                surface,
            )
            .await
        }
        KernelCommand::Propose {
            world,
            principal,
            membership,
            proposal_id,
            input,
        } => {
            propose(
                &world,
                &principal,
                &membership,
                &proposal_id,
                &input,
                surface,
            )
            .await
        }
        KernelCommand::Decide {
            proposal_id,
            principal,
            membership,
            decision,
        } => decide(&proposal_id, &principal, &membership, &decision, surface).await,
        KernelCommand::Commit {
            proposal_id,
            principal,
            membership,
        } => commit(&proposal_id, &principal, &membership, surface).await,
        KernelCommand::Explain {
            receipt_id,
            principal,
            membership,
        } => explain(&receipt_id, &principal, &membership, surface).await,
        KernelCommand::Execute {
            receipt_id,
            principal,
            membership,
        } => execute(&receipt_id, &principal, &membership, surface).await,
    }
}

async fn discover(
    world: &str,
    principal: &str,
    membership: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    match kernel
        .discover(&world, &principal, &membership, surface)
        .await
    {
        Ok(result) => Ok(ok(discover_json(&result))),
        Err(error) => Ok(map_error(error)),
    }
}

async fn query(
    world: &str,
    principal: &str,
    membership: &str,
    object_type: Option<&str>,
    identifier: Option<&str>,
    scheme: Option<&str>,
    venue_entity: Option<&str>,
    mic: Option<&str>,
    currency: Option<&str>,
    share_class: Option<&str>,
    provider: Option<&str>,
    identifier_level: Option<&str>,
    valid_at_micros: Option<i64>,
    cursor: Option<&str>,
    limit: Option<u32>,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    if let Some(identifier) = identifier {
        let Some(valid_at_micros) = valid_at_micros else {
            return Ok(map_error(KernelError::Conflict(
                "--valid-at-micros is required for identifier queries".to_owned(),
            )));
        };
        let selector = KernelIdentifierSelector {
            value: identifier.to_owned(),
            scheme: scheme.map(str::to_owned),
            object_type: object_type.map(str::to_owned),
            venue_entity_id: venue_entity.map(str::to_owned),
            mic: mic.map(str::to_owned),
            currency: currency.map(str::to_owned),
            share_class: share_class.map(str::to_owned),
            provider: provider.map(str::to_owned),
            identifier_level: identifier_level.map(str::to_owned),
            valid_at_micros,
        };
        return match kernel
            .query_identifier_candidates(
                &world,
                &principal,
                &membership,
                selector,
                cursor.unwrap_or(""),
                limit.unwrap_or(5),
                surface,
            )
            .await
        {
            Ok(page) => Ok(ok(identifier_query_page_json(&page))),
            Err(error) => Ok(map_error(error)),
        };
    }
    if scheme.is_some()
        || venue_entity.is_some()
        || mic.is_some()
        || currency.is_some()
        || share_class.is_some()
        || provider.is_some()
        || identifier_level.is_some()
        || valid_at_micros.is_some()
    {
        return Ok(map_error(KernelError::Conflict(
            "identifier context flags require --identifier".to_owned(),
        )));
    }
    if object_type.is_none() {
        return match kernel.query(&world, &principal, &membership, surface).await {
            Ok(result) => Ok(ok(discover_json(&result))),
            Err(error) => Ok(map_error(error)),
        };
    }
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
            surface,
        )
        .await
    {
        Ok(page) => Ok(ok(query_page_json(&page))),
        Err(error) => Ok(map_error(error)),
    }
}

fn identifier_query_page_json(page: &KernelIdentifierQueryPage) -> Value {
    json!({
        "authorizedCount": page.authorized_count,
        "budgetId": page.budget_id,
        "candidates": page.candidates.iter().map(|candidate| json!({
            "context": {
                "currency": candidate.context.currency,
                "identifierLevel": candidate.context.identifier_level,
                "mic": candidate.context.mic,
                "provider": candidate.context.provider,
                "shareClass": candidate.context.share_class,
                "venueEntity": candidate.context.venue_entity_id,
            },
            "evidenceRef": candidate.evidence_ref,
            "identifierAssignmentId": candidate.identifier_assignment_id,
            "links": candidate.links.iter().map(|link| json!({
                "evidenceRef": link.evidence_ref,
                "linkAssertionId": link.link_assertion_id,
                "linkType": link.link_type,
                "targetObject": link.target_object_id,
                "targetObjectType": link.target_object_type,
                "targetTypeAssignmentId": link.target_type_assignment_id,
            })).collect::<Vec<_>>(),
            "objectKey": {"entity": candidate.object_id, "world": page.basis.world.as_str()},
            "objectType": candidate.object_type,
            "scheme": candidate.scheme,
            "typeAssignmentId": candidate.type_assignment_id,
            "validEndMicros": candidate.valid_end_micros,
            "validStartMicros": candidate.valid_start_micros,
            "value": candidate.value,
        })).collect::<Vec<_>>(),
        "catalog": {
            "components": page.basis.components.as_str(),
            "executors": page.basis.executors.as_str(),
            "ontology": page.basis.ontology.as_str(),
            "policy": page.basis.policy.as_str(),
        },
        "computeDigest": page.compute_digest,
        "decision": "permit",
        "explanationJcs": page.explanation_jcs,
        "membership": page.membership.as_str(),
        "nextCursor": page.next_cursor,
        "pageLimit": page.page_limit,
        "releaseDigest": page.basis.release_digest.as_str(),
        "selector": {
            "currency": page.selector.currency,
            "identifier": page.selector.value,
            "identifierLevel": page.selector.identifier_level,
            "mic": page.selector.mic,
            "objectType": page.selector.object_type,
            "provider": page.selector.provider,
            "scheme": page.selector.scheme,
            "shareClass": page.selector.share_class,
            "validAtMicros": page.selector.valid_at_micros,
            "venueEntity": page.selector.venue_entity_id,
        },
        "surface": page.surface.as_str(),
        "world": page.basis.world.as_str(),
    })
}

fn query_page_json(page: &KernelQueryPage) -> Value {
    let KernelQueryPage {
        trusted_authority_digest: authority_digest,
        ..
    } = page;
    json!({
        "authorizedCount": page.authorized_count,
        "budgetId": page.budget_id,
        "catalog": {
            "components": page.basis.components.as_str(),
            "executors": page.basis.executors.as_str(),
            "ontology": page.basis.ontology.as_str(),
            "policy": page.basis.policy.as_str(),
        },
        "authorityEvaluation": "MEMBERSHIP_EVALUATED",
        "computeEvaluation": "NOT_EVALUATED",
        "cursorClaims": {
            "authorityCut": page.authority_cut.map(zoen_core::CommitSequence::get),
            "authorizedObjectSetPlanDigest": page.authorized_plan_digest.as_str(),
            "trustedAuthorityDigest": authority_digest
                .as_ref()
                .map(zoen_engine::TrustedAuthorityDigest::as_str),
        },
        "decision": match &page.decision {
            zoen_engine::KernelPolicyDecision::Permit => Value::String("permit".to_owned()),
            zoen_engine::KernelPolicyDecision::Deny => Value::String("deny".to_owned()),
            zoen_engine::KernelPolicyDecision::Error(message) => json!({"error": message}),
        },
        "explanationJcs": page.explanation_jcs,
        "membership": page.membership.as_str(),
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
    membership: &str,
    proposal_id: &str,
    input: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    match kernel
        .propose(&world, &principal, &membership, proposal_id, input, surface)
        .await
    {
        Ok((proposal, surface)) => Ok(ok(json!({
            "inputJcs": proposal.input_jcs,
            "membership": proposal.membership.as_str(),
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
    membership: &str,
    decision: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    let outcome = KernelDecisionOutcome::parse(decision)?;
    match kernel
        .decide(proposal_id, &principal, &membership, outcome, surface)
        .await
    {
        Ok((decision, surface)) => Ok(ok(json!({
            "outcome": decision.outcome.as_str(),
            "membership": decision.membership.as_str(),
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
    membership: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    match kernel
        .commit(proposal_id, &principal, &membership, surface)
        .await
    {
        Ok((receipt, surface)) => Ok(ok(json!({
            "explanationJcs": receipt.explanation_jcs,
            "membership": receipt.membership.as_str(),
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
    membership: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    match kernel
        .explain(receipt_id, &principal, &membership, surface)
        .await
    {
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
    membership: &str,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
    match kernel
        .execute(receipt_id, &principal, &membership, surface)
        .await
    {
        Ok((execution, surface)) => Ok(ok(json!({
            "executionId": execution.execution_id,
            "membership": execution.membership.as_str(),
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
    let cursor_sealer =
        cursor_sealer_from_env().map_err(|failure| -> Box<dyn Error + Send + Sync> {
            cursor_configuration_message(failure).into()
        })?;
    Ok(PostgresWorldKernel::new(
        PostgresWorldReleaseStore::new(pool.clone()),
        pool,
        cursor_sealer,
    ))
}

fn cursor_sealer_from_env() -> Result<Option<CursorSealer>, CursorConfigurationFailure> {
    let active_key_id = optional_cursor_environment(CursorEnvironment::ActiveKeyId)?;
    let encoded_keys = optional_cursor_environment(CursorEnvironment::Keys)?;
    let configured_ttl = optional_cursor_environment(CursorEnvironment::Ttl)?;
    let (active_key_id, encoded_keys) = match (active_key_id, encoded_keys, configured_ttl.as_ref())
    {
        (None, None, None) => return Ok(None),
        (Some(active_key_id), Some(encoded_keys), _) => (active_key_id, encoded_keys),
        _ => return Err(CursorConfigurationFailure::IncompleteKeyring),
    };
    let active_key_id =
        CursorKeyId::parse(active_key_id).map_err(|_| CursorConfigurationFailure::InvalidKeyId)?;
    let mut keys = Vec::new();
    for encoded_key in encoded_keys.split(',') {
        let (key_id, encoded_material) = encoded_key
            .split_once(':')
            .ok_or(CursorConfigurationFailure::InvalidKeyEntry)?;
        let key_id =
            CursorKeyId::parse(key_id).map_err(|_| CursorConfigurationFailure::InvalidKeyId)?;
        keys.push(cursor_signing_key(key_id, encoded_material)?);
    }
    let ttl_seconds = match configured_ttl {
        Some(value) => value
            .parse::<u64>()
            .map_err(|_| CursorConfigurationFailure::InvalidTtl)?,
        None => DEFAULT_CURSOR_TTL_SECONDS,
    };
    if ttl_seconds == 0 {
        return Err(CursorConfigurationFailure::TtlNotPositive);
    }
    let keyring = CursorKeyring::new(active_key_id, keys)
        .map_err(|_| CursorConfigurationFailure::InvalidKeyring)?;
    CursorSealer::new(keyring, ttl_seconds)
        .map(Some)
        .map_err(|_| CursorConfigurationFailure::InvalidSealer)
}

fn optional_cursor_environment(
    variable: CursorEnvironment,
) -> Result<Option<String>, CursorConfigurationFailure> {
    match std::env::var(cursor_environment_name(variable)) {
        Ok(value) if value.is_empty() => Err(match variable {
            CursorEnvironment::ActiveKeyId => CursorConfigurationFailure::ActiveKeyIdEmpty,
            CursorEnvironment::Keys => CursorConfigurationFailure::KeysEmpty,
            CursorEnvironment::Ttl => CursorConfigurationFailure::TtlEmpty,
        }),
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => Err(match variable {
            CursorEnvironment::ActiveKeyId => CursorConfigurationFailure::ActiveKeyIdNotUnicode,
            CursorEnvironment::Keys => CursorConfigurationFailure::KeysNotUnicode,
            CursorEnvironment::Ttl => CursorConfigurationFailure::TtlNotUnicode,
        }),
    }
}

fn cursor_environment_name(variable: CursorEnvironment) -> &'static str {
    match variable {
        CursorEnvironment::ActiveKeyId => CURSOR_ACTIVE_KEY_ID_ENV,
        CursorEnvironment::Keys => CURSOR_KEYS_ENV,
        CursorEnvironment::Ttl => CURSOR_TTL_ENV,
    }
}

fn cursor_signing_key(
    key_id: CursorKeyId,
    encoded_material: &str,
) -> Result<CursorSigningKey, CursorConfigurationFailure> {
    if !encoded_material.len().is_multiple_of(2)
        || !encoded_material
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(CursorConfigurationFailure::InvalidKeyEncoding);
    }
    let material = (0..encoded_material.len())
        .step_by(2)
        .map(|index| {
            u8::from_str_radix(&encoded_material[index..index + 2], 16)
                .map_err(|_| CursorConfigurationFailure::InvalidKeyEncoding)
        })
        .collect::<Result<Vec<_>, _>>()?;
    CursorSigningKey::new(key_id, material)
        .map_err(|_| CursorConfigurationFailure::SigningKeyTooShort)
}

fn cursor_configuration_message(failure: CursorConfigurationFailure) -> &'static str {
    match failure {
        CursorConfigurationFailure::ActiveKeyIdEmpty => {
            "ZOEN_CURSOR_ACTIVE_KEY_ID must not be empty"
        }
        CursorConfigurationFailure::ActiveKeyIdNotUnicode => {
            "ZOEN_CURSOR_ACTIVE_KEY_ID must contain Unicode text"
        }
        CursorConfigurationFailure::KeysEmpty => "ZOEN_CURSOR_KEYS must not be empty",
        CursorConfigurationFailure::KeysNotUnicode => "ZOEN_CURSOR_KEYS must contain Unicode text",
        CursorConfigurationFailure::TtlEmpty => "ZOEN_CURSOR_TTL_SECONDS must not be empty",
        CursorConfigurationFailure::TtlNotUnicode => {
            "ZOEN_CURSOR_TTL_SECONDS must contain Unicode text"
        }
        CursorConfigurationFailure::IncompleteKeyring => {
            "ZOEN_CURSOR_ACTIVE_KEY_ID and ZOEN_CURSOR_KEYS must be configured together; ZOEN_CURSOR_TTL_SECONDS is optional only for a configured keyring"
        }
        CursorConfigurationFailure::InvalidKeyId => "cursor key id is invalid",
        CursorConfigurationFailure::InvalidKeyEntry => {
            "ZOEN_CURSOR_KEYS entries must use <key-id>:<lowercase-hex-secret>"
        }
        CursorConfigurationFailure::InvalidKeyEncoding => {
            "ZOEN_CURSOR_KEYS contains an invalid secret encoding"
        }
        CursorConfigurationFailure::SigningKeyTooShort => {
            "cursor signing keys must contain at least 32 bytes"
        }
        CursorConfigurationFailure::InvalidTtl => {
            "ZOEN_CURSOR_TTL_SECONDS must be a positive integer"
        }
        CursorConfigurationFailure::TtlNotPositive => "cursor ttl must be positive",
        CursorConfigurationFailure::InvalidKeyring => "cursor keyring is invalid",
        CursorConfigurationFailure::InvalidSealer => "cursor sealer is invalid",
    }
}
