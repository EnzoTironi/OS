//! CLI surface for the seven public verbs on one governed catalog.

use std::error::Error;

use serde_json::{Value, json};
use zoen_adapters::{PostgresAuthorityStore, PostgresWorldKernel, PostgresWorldReleaseStore};
use zoen_core::{PrincipalId, WorldId};
use zoen_engine::{KernelDecisionOutcome, KernelDiscoverResult, KernelError, KernelSurface};

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
        KernelCommand::Query { world, principal } => query(&world, &principal, surface).await,
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
    surface: KernelSurface,
) -> Result<KernelCliResult, Box<dyn Error + Send + Sync>> {
    let kernel = kernel().await?;
    let world = WorldId::parse(world)?;
    let principal = PrincipalId::parse(principal)?;
    match kernel.query(&world, &principal, surface).await {
        Ok(result) => Ok(ok(discover_json(&result))),
        Err(error) => Ok(map_error(error)),
    }
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
    ))
}
