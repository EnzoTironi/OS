//! CLI surface for the seven public verbs on one governed catalog.

use std::error::Error;

use serde_json::{Value, json};
use zoen_adapters::{PostgresAuthorityStore, PostgresWorldKernel, PostgresWorldReleaseStore};
use zoen_core::{MembershipId, PrincipalId, WorldId};
use zoen_engine::{
    KernelDecisionOutcome, KernelDiscoverResult, KernelError, KernelQueryPage, KernelSurface,
};

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
        cursor: Option<String>,
        limit: Option<u32>,
        budget_class: Option<String>,
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
            cursor,
            limit,
            budget_class,
        } => {
            query(
                &world,
                &principal,
                &membership,
                object_type.as_deref(),
                cursor.as_deref(),
                limit,
                budget_class.as_deref(),
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
    cursor: Option<&str>,
    limit: Option<u32>,
    budget_class: Option<&str>,
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    let membership = MembershipId::parse(membership)?;
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
            budget_class,
            surface,
        )
        .await
    {
        Ok(page) => Ok(ok(query_page_json(&page))),
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
        "computeDigest": page.compute_digest,
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
    Ok(PostgresWorldKernel::new(
        PostgresWorldReleaseStore::new(pool.clone()),
        pool,
    ))
}
