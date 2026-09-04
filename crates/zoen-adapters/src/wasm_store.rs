use std::fmt::Display;

use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Postgres, Row, Transaction};
use zoen_core::{
    ActionId, CapabilityId, ClaimId, CommitSequence, ComponentDigest, ComponentInterface,
    ExactInteger, ExecutionContext, ExecutionResultDigest, IntentDigest, MembershipId, OperationId,
    ProposalId,
};
use zoen_engine::{
    CompletedComputation, ComponentArtifact, ComputationError, ComputationExecution,
    ComputationInvocation, ComputationLimits, ComputationOutcome, ComputationOutput,
    ComputationRequest, ProgramActionOutcome, PublishedComponent,
};

use crate::{ComputeBasisEvidence, set_tenant, u64_to_i64};

pub(crate) enum BeginExecution {
    Completed(Box<ComputationExecution>),
    Run,
}

pub(crate) async fn publish(
    pool: &PgPool,
    context: &ExecutionContext,
    artifact: &ComponentArtifact,
) -> Result<PublishedComponent, zoen_engine::ComponentAdmissionError> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
    set_tenant(&mut transaction, context.world_id())
        .await
        .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
    let existing = sqlx::query(
        "SELECT component_interface, component_bytes
         FROM wasm_components
         WHERE tenant_id = $1 AND component_digest = $2",
    )
    .bind(context.world_id().as_str())
    .bind(artifact.claimed_digest.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
    if let Some(row) = existing {
        let interface = row
            .try_get::<String, _>("component_interface")
            .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
        let bytes = row
            .try_get::<Vec<u8>, _>("component_bytes")
            .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
        if interface != artifact.interface.as_str() || bytes != artifact.bytes {
            return Err(zoen_engine::ComponentAdmissionError::Store(
                "component digest identifies different stored content".to_owned(),
            ));
        }
        transaction
            .commit()
            .await
            .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
        return Ok(PublishedComponent {
            digest: artifact.claimed_digest.clone(),
            interface: artifact.interface.clone(),
            size_bytes: artifact.bytes.len(),
        });
    }
    sqlx::query(
        "INSERT INTO wasm_components (
            tenant_id, component_digest, component_interface, component_bytes,
            published_actor_id, published_principal_id, published_workload_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(context.world_id().as_str())
    .bind(artifact.claimed_digest.as_str())
    .bind(artifact.interface.as_str())
    .bind(&artifact.bytes)
    .bind(context.actor_id().as_str())
    .bind(context.principal_id().as_str())
    .bind(context.workload_id().as_str())
    .execute(&mut *transaction)
    .await
    .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
    transaction
        .commit()
        .await
        .map_err(|error| zoen_engine::ComponentAdmissionError::Store(error.to_string()))?;
    Ok(PublishedComponent {
        digest: artifact.claimed_digest.clone(),
        interface: artifact.interface.clone(),
        size_bytes: artifact.bytes.len(),
    })
}

pub(crate) async fn load_component(
    pool: &PgPool,
    context: &ExecutionContext,
    digest: &ComponentDigest,
) -> Result<(ComponentInterface, Vec<u8>), ComputationError> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    set_tenant(&mut transaction, context.world_id())
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let row = sqlx::query(
        "SELECT component_interface, component_bytes
         FROM wasm_components
         WHERE tenant_id = $1 AND component_digest = $2",
    )
    .bind(context.world_id().as_str())
    .bind(digest.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| ComputationError::Store(error.to_string()))?
    .ok_or_else(|| ComputationError::Store("component was not found".to_owned()))?;
    let interface = ComponentInterface::parse(
        row.try_get::<String, _>("component_interface")
            .map_err(|error| ComputationError::Store(error.to_string()))?,
    )
    .map_err(|error| ComputationError::Store(error.to_string()))?;
    let bytes = row
        .try_get::<Vec<u8>, _>("component_bytes")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    transaction
        .commit()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    Ok((interface, bytes))
}

pub(crate) async fn replay_completed_execution(
    pool: &PgPool,
    context: &ExecutionContext,
    membership_id: &MembershipId,
    invocation: &ComputationInvocation,
) -> Result<
    Option<(
        ComputationExecution,
        ComputeBasisEvidence,
        ComputationLimits,
    )>,
    ComputationError,
> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    set_tenant(&mut transaction, context.world_id())
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let row = sqlx::query(
        "SELECT request_digest, invocation_digest, membership_id,
                compute_basis_digest, compute_basis_jcs, release_digest,
                policy_catalog_digest, budget_class_id, budget_resource_id,
                execute_action_id, compute_operation, authorized_at_micros,
                compute_policy_id, compute_policy_digest, compute_policy_revision,
                compute_determining_policies, fuel_limit, memory_limit_bytes,
                table_element_limit, instance_limit, table_limit, memory_limit,
                deadline_millis, started_actor_id, started_principal_id,
                started_workload_id, status, result_json
         FROM wasm_executions
         WHERE tenant_id = $1 AND execution_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(invocation.execution_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| ComputationError::Store(error.to_string()))?;
    let Some(row) = row else {
        transaction
            .commit()
            .await
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        return Ok(None);
    };
    require_replay_identity(&row, context, membership_id, invocation)?;
    let status = row_text(&row, "status")?;
    if status != "completed" {
        return Err(ComputationError::Store(
            "Wasm execution is already running".to_owned(),
        ));
    }
    let basis_jcs = row_text(&row, "compute_basis_jcs")?;
    let basis = ComputeBasisEvidence::from_canonical_jcs(&basis_jcs)
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    validate_stored_basis(&row, context, membership_id, &basis)?;
    let limits = basis
        .limits()
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    validate_stored_limits(&row, limits)?;
    let request = ComputationRequest {
        authority_basis_jcs: basis.canonical_jcs().to_owned(),
        invocation: invocation.clone(),
        limits,
    };
    if row_text(&row, "request_digest")? != request.request_digest().as_str() {
        return Err(ComputationError::Store(
            "stored compute request digest does not match its immutable basis".to_owned(),
        ));
    }
    let value = row
        .try_get::<serde_json::Value, _>("result_json")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let stored = serde_json::from_value::<StoredOutcome>(value)
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let execution = ComputationExecution {
        evidence: invocation.evidence(),
        outcome: stored.try_into()?,
        request_digest: request.request_digest(),
    };
    transaction
        .commit()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    Ok(Some((execution, basis, limits)))
}

fn require_replay_identity(
    row: &sqlx::postgres::PgRow,
    context: &ExecutionContext,
    membership_id: &MembershipId,
    invocation: &ComputationInvocation,
) -> Result<(), ComputationError> {
    if row_text(row, "invocation_digest")? != invocation.digest().as_str()
        || row_text(row, "membership_id")? != membership_id.as_str()
        || row_text(row, "started_actor_id")? != context.actor_id().as_str()
        || row_text(row, "started_principal_id")? != context.principal_id().as_str()
        || row_text(row, "started_workload_id")? != context.workload_id().as_str()
    {
        return Err(ComputationError::IdentityCollision);
    }
    Ok(())
}

fn validate_stored_basis(
    row: &sqlx::postgres::PgRow,
    context: &ExecutionContext,
    membership_id: &MembershipId,
    basis: &ComputeBasisEvidence,
) -> Result<(), ComputationError> {
    let policy_revision = row
        .try_get::<i64, _>("compute_policy_revision")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let determining = row
        .try_get::<Vec<String>, _>("compute_determining_policies")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    if row_text(row, "compute_basis_digest")? != basis.digest()
        || row_text(row, "release_digest")? != basis.release_digest()
        || row_text(row, "policy_catalog_digest")? != basis.policy_catalog_digest()
        || row_text(row, "budget_class_id")? != basis.budget_class_id()
        || row_text(row, "budget_resource_id")? != basis.budget_resource_id()
        || row_text(row, "execute_action_id")? != basis.action_id()
        || row_text(row, "compute_operation")? != basis.operation()
        || row_i64(row, "authorized_at_micros")? != basis.authorized_at_micros()
        || row_text(row, "compute_policy_id")? != basis.policy_id()
        || row_text(row, "compute_policy_digest")? != basis.policy_digest()
        || u64::try_from(policy_revision).ok() != Some(basis.policy_revision())
        || determining != basis.determining_policies()
        || basis.membership_id() != membership_id.as_str()
        || basis.actor_id() != context.actor_id().as_str()
        || basis.principal_id() != context.principal_id().as_str()
        || basis.workload_id() != context.workload_id().as_str()
        || basis.world_id() != context.world_id().as_str()
    {
        return Err(ComputationError::Store(
            "stored compute basis columns do not match canonical evidence".to_owned(),
        ));
    }
    Ok(())
}

fn validate_stored_limits(
    row: &sqlx::postgres::PgRow,
    limits: ComputationLimits,
) -> Result<(), ComputationError> {
    if row_i64(row, "fuel_limit")? != to_i64(limits.fuel(), "fuel limit")?
        || row_i64(row, "memory_limit_bytes")?
            != usize_i64(limits.memory_bytes(), "memory byte limit")?
        || row_i64(row, "table_element_limit")?
            != usize_i64(limits.table_elements(), "table element limit")?
        || row_i64(row, "instance_limit")? != usize_i64(limits.instances(), "instance limit")?
        || row_i64(row, "table_limit")? != usize_i64(limits.tables(), "table limit")?
        || row_i64(row, "memory_limit")? != usize_i64(limits.memories(), "memory limit")?
        || row_i64(row, "deadline_millis")? != to_i64(limits.deadline_millis(), "deadline millis")?
    {
        return Err(ComputationError::Store(
            "stored compute limits do not match canonical basis".to_owned(),
        ));
    }
    Ok(())
}

fn row_text(row: &sqlx::postgres::PgRow, column: &str) -> Result<String, ComputationError> {
    row.try_get::<String, _>(column)
        .map_err(|error| ComputationError::Store(error.to_string()))
}

fn row_i64(row: &sqlx::postgres::PgRow, column: &str) -> Result<i64, ComputationError> {
    row.try_get::<i64, _>(column)
        .map_err(|error| ComputationError::Store(error.to_string()))
}

pub(crate) async fn begin_execution(
    pool: &PgPool,
    context: &ExecutionContext,
    request: &ComputationRequest,
    basis: &ComputeBasisEvidence,
) -> Result<BeginExecution, ComputationError> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    set_tenant(&mut transaction, context.world_id())
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let existing = sqlx::query(
        "SELECT request_digest, started_actor_id, started_principal_id,
                started_workload_id, status, result_json
         FROM wasm_executions
         WHERE tenant_id = $1 AND execution_id = $2",
    )
    .bind(context.world_id().as_str())
    .bind(request.invocation.execution_id.as_str())
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| ComputationError::Store(error.to_string()))?;
    if let Some(row) = existing {
        let result = replay_existing_execution(&row, context, request)?;
        transaction
            .commit()
            .await
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        return Ok(result);
    }
    insert_execution(&mut transaction, context, request, basis).await?;
    transaction
        .commit()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    Ok(BeginExecution::Run)
}

async fn insert_execution(
    transaction: &mut Transaction<'_, Postgres>,
    context: &ExecutionContext,
    request: &ComputationRequest,
    basis: &ComputeBasisEvidence,
) -> Result<(), ComputationError> {
    let manifest = request
        .invocation
        .manifest
        .canonical_json()
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let manifest = serde_json::from_str::<serde_json::Value>(&manifest)
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    sqlx::query(
        "INSERT INTO wasm_executions (
            tenant_id, execution_id, request_digest, invocation_digest, component_digest,
            component_interface, capability_manifest_digest, capability_manifest,
            capability_ids, input_digest, fuel_limit, memory_limit_bytes,
            table_element_limit, instance_limit, table_limit, memory_limit,
            deadline_millis, started_actor_id, started_principal_id,
            started_workload_id, membership_id, compute_basis_digest,
            compute_basis_jcs, release_digest, policy_catalog_digest,
            budget_class_id, budget_resource_id, execute_action_id,
            compute_operation, authorized_at_micros, compute_policy_id,
            compute_policy_digest, compute_policy_revision,
            compute_determining_policies, status
         ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19,
            $20, $21, $22,
            $23, $24, $25,
            $26, $27, $28,
            $29, $30, $31,
            $32, $33,
            $34, 'running'
         )",
    )
    .bind(context.world_id().as_str())
    .bind(request.invocation.execution_id.as_str())
    .bind(request.request_digest().as_str())
    .bind(request.invocation_digest().as_str())
    .bind(request.invocation.component_digest.as_str())
    .bind(request.invocation.manifest.interface().as_str())
    .bind(request.invocation.manifest.digest().as_str())
    .bind(manifest)
    .bind(
        request
            .invocation
            .manifest
            .capability_ids()
            .iter()
            .map(|id| id.as_str().to_owned())
            .collect::<Vec<_>>(),
    )
    .bind(request.input_digest().as_str())
    .bind(to_i64(request.limits.fuel(), "fuel limit")?)
    .bind(usize_i64(
        request.limits.memory_bytes(),
        "memory byte limit",
    )?)
    .bind(usize_i64(
        request.limits.table_elements(),
        "table element limit",
    )?)
    .bind(usize_i64(request.limits.instances(), "instance limit")?)
    .bind(usize_i64(request.limits.tables(), "table limit")?)
    .bind(usize_i64(request.limits.memories(), "memory limit")?)
    .bind(to_i64(request.limits.deadline_millis(), "deadline millis")?)
    .bind(context.actor_id().as_str())
    .bind(context.principal_id().as_str())
    .bind(context.workload_id().as_str())
    .bind(basis.membership_id())
    .bind(basis.digest())
    .bind(basis.canonical_jcs())
    .bind(basis.release_digest())
    .bind(basis.policy_catalog_digest())
    .bind(basis.budget_class_id())
    .bind(basis.budget_resource_id())
    .bind(basis.action_id())
    .bind(basis.operation())
    .bind(basis.authorized_at_micros())
    .bind(basis.policy_id())
    .bind(basis.policy_digest())
    .bind(to_i64(basis.policy_revision(), "compute policy revision")?)
    .bind(basis.determining_policies())
    .execute(&mut **transaction)
    .await
    .map_err(|error| ComputationError::Store(error.to_string()))?;
    Ok(())
}

fn replay_existing_execution(
    row: &sqlx::postgres::PgRow,
    context: &ExecutionContext,
    request: &ComputationRequest,
) -> Result<BeginExecution, ComputationError> {
    let stored_digest = row
        .try_get::<String, _>("request_digest")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    if stored_digest != request.request_digest().as_str() {
        return Err(ComputationError::IdentityCollision);
    }
    let stored_actor = row
        .try_get::<String, _>("started_actor_id")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let stored_principal = row
        .try_get::<String, _>("started_principal_id")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let stored_workload = row
        .try_get::<String, _>("started_workload_id")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    if stored_actor != context.actor_id().as_str()
        || stored_principal != context.principal_id().as_str()
        || stored_workload != context.workload_id().as_str()
    {
        return Err(ComputationError::IdentityCollision);
    }
    let status = row
        .try_get::<String, _>("status")
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    if status == "completed" {
        let value = row
            .try_get::<serde_json::Value, _>("result_json")
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        let stored = serde_json::from_value::<StoredOutcome>(value)
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        Ok(BeginExecution::Completed(Box::new(ComputationExecution {
            evidence: request.evidence(),
            outcome: stored.try_into()?,
            request_digest: request.request_digest(),
        })))
    } else if status == "running" {
        Ok(BeginExecution::Run)
    } else {
        Err(ComputationError::Store(format!(
            "unknown Wasm execution status {status}"
        )))
    }
}

pub(crate) async fn finish_execution(
    pool: &PgPool,
    context: &ExecutionContext,
    request: &ComputationRequest,
    outcome: &ComputationOutcome,
) -> Result<(), ComputationError> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    set_tenant(&mut transaction, context.world_id())
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))?;
    let stored = StoredOutcome::from(outcome);
    let value =
        serde_json::to_value(stored).map_err(|error| ComputationError::Store(error.to_string()))?;
    let result_digest = match outcome {
        ComputationOutcome::Completed(completed) => Some(completed.result_digest.as_str()),
        _ => None,
    };
    let updated = sqlx::query(
        "UPDATE wasm_executions
         SET status = 'completed',
             outcome_kind = $3,
             result_json = $4,
             result_digest = $5,
             completed_at = clock_timestamp()
         WHERE tenant_id = $1
           AND execution_id = $2
           AND status = 'running'",
    )
    .bind(context.world_id().as_str())
    .bind(request.invocation.execution_id.as_str())
    .bind(outcome_kind(outcome))
    .bind(value)
    .bind(result_digest)
    .execute(&mut *transaction)
    .await
    .map_err(|error| ComputationError::Store(error.to_string()))?;
    if updated.rows_affected() != 1 {
        return Err(ComputationError::Store(
            "Wasm execution completion did not update one running row".to_owned(),
        ));
    }
    transaction
        .commit()
        .await
        .map_err(|error| ComputationError::Store(error.to_string()))
}

fn outcome_kind(outcome: &ComputationOutcome) -> &'static str {
    match outcome {
        ComputationOutcome::CapabilityDenied(_) => "capability_denied",
        ComputationOutcome::CapabilityUnavailable(_) => "capability_unavailable",
        ComputationOutcome::Completed(_) => "completed",
        ComputationOutcome::DeadlineExceeded => "deadline_exceeded",
        ComputationOutcome::FuelExhausted => "fuel_exhausted",
        ComputationOutcome::HostUnavailable => "host_unavailable",
        ComputationOutcome::InterfaceMismatch => "interface_mismatch",
        ComputationOutcome::MalformedComponent => "malformed_component",
        ComputationOutcome::MemoryLimitExceeded => "memory_limit_exceeded",
        ComputationOutcome::TrapAfterActionRequest => "trap_after_action_request",
        ComputationOutcome::TrapBeforeActionRequest => "trap_before_action_request",
    }
}

fn to_i64(value: u64, name: &str) -> Result<i64, ComputationError> {
    u64_to_i64(value, name).map_err(|error| ComputationError::Store(error.to_string()))
}

fn usize_i64(value: usize, name: &str) -> Result<i64, ComputationError> {
    to_i64(
        u64::try_from(value).map_err(|error| ComputationError::Store(error.to_string()))?,
        name,
    )
}

fn parse_sequence(value: u64) -> Result<CommitSequence, ComputationError> {
    CommitSequence::new(value)
        .ok_or_else(|| ComputationError::Store("stored commit sequence is zero".to_owned()))
}

fn parse_error(error: impl Display) -> ComputationError {
    ComputationError::Store(error.to_string())
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum StoredOutcome {
    CapabilityDenied {
        capability: String,
    },
    CapabilityUnavailable {
        capability: String,
    },
    Completed {
        fuel_consumed: u64,
        output: StoredOutput,
        result_digest: String,
    },
    DeadlineExceeded,
    FuelExhausted,
    HostUnavailable,
    InterfaceMismatch,
    MalformedComponent,
    MemoryLimitExceeded,
    TrapAfterActionRequest,
    TrapBeforeActionRequest,
}

#[derive(Serialize, Deserialize)]
struct StoredOutput {
    action: StoredAction,
    aggregate: String,
    explanation_complete: bool,
    selected_claim_id: Option<String>,
    selected_values: u32,
    values_scanned: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum StoredAction {
    AwaitingApproval {
        intent_digest: String,
        operation_id: String,
        proposal_id: String,
    },
    Committed {
        action_id: String,
        commit_sequence: u64,
        intent_digest: String,
        operation_id: String,
        proposal_id: String,
        recovered: bool,
    },
    Denied,
    NotRequested,
}

impl From<&ComputationOutcome> for StoredOutcome {
    fn from(outcome: &ComputationOutcome) -> Self {
        match outcome {
            ComputationOutcome::CapabilityDenied(capability) => Self::CapabilityDenied {
                capability: capability.clone(),
            },
            ComputationOutcome::CapabilityUnavailable(capability) => Self::CapabilityUnavailable {
                capability: capability.as_str().to_owned(),
            },
            ComputationOutcome::Completed(completed) => Self::Completed {
                fuel_consumed: completed.fuel_consumed,
                output: StoredOutput::from(&completed.output),
                result_digest: completed.result_digest.as_str().to_owned(),
            },
            ComputationOutcome::DeadlineExceeded => Self::DeadlineExceeded,
            ComputationOutcome::FuelExhausted => Self::FuelExhausted,
            ComputationOutcome::HostUnavailable => Self::HostUnavailable,
            ComputationOutcome::InterfaceMismatch => Self::InterfaceMismatch,
            ComputationOutcome::MalformedComponent => Self::MalformedComponent,
            ComputationOutcome::MemoryLimitExceeded => Self::MemoryLimitExceeded,
            ComputationOutcome::TrapAfterActionRequest => Self::TrapAfterActionRequest,
            ComputationOutcome::TrapBeforeActionRequest => Self::TrapBeforeActionRequest,
        }
    }
}

impl TryFrom<StoredOutcome> for ComputationOutcome {
    type Error = ComputationError;

    fn try_from(outcome: StoredOutcome) -> Result<Self, Self::Error> {
        match outcome {
            StoredOutcome::CapabilityDenied { capability } => {
                Ok(Self::CapabilityDenied(capability))
            }
            StoredOutcome::CapabilityUnavailable { capability } => Ok(Self::CapabilityUnavailable(
                CapabilityId::parse(capability).map_err(parse_error)?,
            )),
            StoredOutcome::Completed {
                fuel_consumed,
                output,
                result_digest,
            } => Ok(Self::Completed(CompletedComputation {
                fuel_consumed,
                output: output.try_into()?,
                result_digest: ExecutionResultDigest::parse(result_digest).map_err(parse_error)?,
            })),
            StoredOutcome::DeadlineExceeded => Ok(Self::DeadlineExceeded),
            StoredOutcome::FuelExhausted => Ok(Self::FuelExhausted),
            StoredOutcome::HostUnavailable => Ok(Self::HostUnavailable),
            StoredOutcome::InterfaceMismatch => Ok(Self::InterfaceMismatch),
            StoredOutcome::MalformedComponent => Ok(Self::MalformedComponent),
            StoredOutcome::MemoryLimitExceeded => Ok(Self::MemoryLimitExceeded),
            StoredOutcome::TrapAfterActionRequest => Ok(Self::TrapAfterActionRequest),
            StoredOutcome::TrapBeforeActionRequest => Ok(Self::TrapBeforeActionRequest),
        }
    }
}

impl From<&ComputationOutput> for StoredOutput {
    fn from(output: &ComputationOutput) -> Self {
        Self {
            action: StoredAction::from(&output.action),
            aggregate: output.aggregate.as_str().to_owned(),
            explanation_complete: output.explanation_complete,
            selected_claim_id: output
                .selected_claim_id
                .as_ref()
                .map(|id| id.as_str().to_owned()),
            selected_values: output.selected_values,
            values_scanned: output.values_scanned,
        }
    }
}

impl TryFrom<StoredOutput> for ComputationOutput {
    type Error = ComputationError;

    fn try_from(output: StoredOutput) -> Result<Self, Self::Error> {
        Ok(Self {
            action: output.action.try_into()?,
            aggregate: ExactInteger::parse(output.aggregate).map_err(parse_error)?,
            explanation_complete: output.explanation_complete,
            selected_claim_id: output
                .selected_claim_id
                .map(ClaimId::parse)
                .transpose()
                .map_err(parse_error)?,
            selected_values: output.selected_values,
            values_scanned: output.values_scanned,
        })
    }
}

impl From<&ProgramActionOutcome> for StoredAction {
    fn from(action: &ProgramActionOutcome) -> Self {
        match action {
            ProgramActionOutcome::AwaitingApproval {
                intent_digest,
                operation_id,
                proposal_id,
            } => Self::AwaitingApproval {
                intent_digest: intent_digest.as_str().to_owned(),
                operation_id: operation_id.as_str().to_owned(),
                proposal_id: proposal_id.as_str().to_owned(),
            },
            ProgramActionOutcome::Committed {
                action_id,
                commit_sequence,
                intent_digest,
                operation_id,
                proposal_id,
                recovered,
            } => Self::Committed {
                action_id: action_id.as_str().to_owned(),
                commit_sequence: commit_sequence.get(),
                intent_digest: intent_digest.as_str().to_owned(),
                operation_id: operation_id.as_str().to_owned(),
                proposal_id: proposal_id.as_str().to_owned(),
                recovered: *recovered,
            },
            ProgramActionOutcome::Denied => Self::Denied,
            ProgramActionOutcome::NotRequested => Self::NotRequested,
        }
    }
}

impl TryFrom<StoredAction> for ProgramActionOutcome {
    type Error = ComputationError;

    fn try_from(action: StoredAction) -> Result<Self, Self::Error> {
        match action {
            StoredAction::AwaitingApproval {
                intent_digest,
                operation_id,
                proposal_id,
            } => Ok(Self::AwaitingApproval {
                intent_digest: IntentDigest::parse(intent_digest).map_err(parse_error)?,
                operation_id: OperationId::parse(operation_id).map_err(parse_error)?,
                proposal_id: ProposalId::parse(proposal_id).map_err(parse_error)?,
            }),
            StoredAction::Committed {
                action_id,
                commit_sequence,
                intent_digest,
                operation_id,
                proposal_id,
                recovered,
            } => Ok(Self::Committed {
                action_id: ActionId::parse(action_id).map_err(parse_error)?,
                commit_sequence: parse_sequence(commit_sequence)?,
                intent_digest: IntentDigest::parse(intent_digest).map_err(parse_error)?,
                operation_id: OperationId::parse(operation_id).map_err(parse_error)?,
                proposal_id: ProposalId::parse(proposal_id).map_err(parse_error)?,
                recovered,
            }),
            StoredAction::Denied => Ok(Self::Denied),
            StoredAction::NotRequested => Ok(Self::NotRequested),
        }
    }
}
