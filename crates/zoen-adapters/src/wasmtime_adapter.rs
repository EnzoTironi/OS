use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use wasmtime::component::{Component, HasSelf, Linker};
use wasmtime::{Config, Engine, Store, StoreLimits, StoreLimitsBuilder, Trap};
use zoen_core::{
    ActionId, ActionInput, CapabilityId, ClaimId, CommitSequence, ComponentDigest,
    ComponentExecutionEvidence, EntityId, ExactDecimal, ExactInteger, ExactValue, InputId,
    IntentDigest, OperationId, ProposalId, RelationId, ResourceId, SemanticSelection, UnitId,
};
use zoen_engine::{
    COMPONENT_INTERFACE_V1, CompletedComputation, ComponentAdmissionError, ComponentArtifact,
    ComputationError, ComputationExecution, ComputationExecutor, ComputationHost,
    ComputationOutcome, ComputationOutput, ComputationRequest, HostCallError, HostCommitOutcome,
    HostCommitRequest, HostExplainRequest, HostProposalOutcome, HostProposeRequest,
    HostQueryRequest, HostQueryResult, ProgramActionOutcome, PublishedComponent,
};

use crate::wasm_store::{self, BeginExecution};

const HOST_INTERFACE_V1: &str = "zoen:code-mode/host@1.0.0";
const PROGRAM_INTERFACE_V1: &str = "zoen:code-mode/program@1.0.0";
const MAX_COMPONENT_BYTES: usize = 2 * 1024 * 1024;
const EPOCH_INTERVAL: Duration = Duration::from_millis(1);

mod bindings {
    wasmtime::component::bindgen!({
        path: "../../wit",
        world: "computation",
        imports: { default: async },
        exports: { default: async },
    });
}

use bindings::Computation;
use bindings::exports::zoen::code_mode::program as wit_program;
use bindings::zoen::code_mode::host as wit_host;

#[derive(Debug)]
pub struct WasmtimeConfigError(String);

impl Display for WasmtimeConfigError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "failed to configure Wasmtime: {}", self.0)
    }
}

impl Error for WasmtimeConfigError {}

pub struct WasmtimeComputationExecutor {
    engine: Engine,
    _epoch_clock: EpochClock,
    pool: PgPool,
}

impl WasmtimeComputationExecutor {
    pub fn new(pool: PgPool) -> Result<Self, WasmtimeConfigError> {
        let mut config = Config::new();
        config.async_support(true);
        config.consume_fuel(true);
        config.epoch_interruption(true);
        config.wasm_component_model(true);
        let engine =
            Engine::new(&config).map_err(|error| WasmtimeConfigError(error.to_string()))?;
        let epoch_clock = EpochClock::start(engine.clone())?;
        Ok(Self {
            engine,
            _epoch_clock: epoch_clock,
            pool,
        })
    }

    async fn finish(
        &self,
        context: &zoen_core::ExecutionContext,
        request: &ComputationRequest,
        outcome: ComputationOutcome,
    ) -> Result<ComputationExecution, ComputationError> {
        wasm_store::finish_execution(&self.pool, context, request, &outcome).await?;
        Ok(ComputationExecution {
            evidence: request.evidence(),
            outcome,
            request_digest: request.request_digest(),
        })
    }
}

impl ComputationExecutor for WasmtimeComputationExecutor {
    async fn publish(
        &self,
        context: &zoen_core::ExecutionContext,
        artifact: ComponentArtifact,
    ) -> Result<PublishedComponent, ComponentAdmissionError> {
        if artifact.bytes.is_empty() {
            return Err(ComponentAdmissionError::Empty);
        }
        if artifact.bytes.len() > MAX_COMPONENT_BYTES {
            return Err(ComponentAdmissionError::TooLarge);
        }
        let actual = ComponentDigest::from_sha256(Sha256::digest(&artifact.bytes).into());
        if actual != artifact.claimed_digest {
            return Err(ComponentAdmissionError::DigestMismatch);
        }
        if artifact.interface.as_str() != COMPONENT_INTERFACE_V1 {
            return Err(ComponentAdmissionError::InterfaceMismatch);
        }
        let component = Component::new(&self.engine, &artifact.bytes)
            .map_err(|_| ComponentAdmissionError::Malformed)?;
        validate_component_shape(&self.engine, &component)?;
        wasm_store::publish(&self.pool, context, &artifact).await
    }

    async fn execute<H>(
        &self,
        context: &zoen_core::ExecutionContext,
        request: ComputationRequest,
        host: H,
    ) -> Result<ComputationExecution, ComputationError>
    where
        H: ComputationHost + 'static,
    {
        let (stored_interface, bytes) =
            wasm_store::load_component(&self.pool, context, &request.component_digest).await?;
        match wasm_store::begin_execution(&self.pool, context, &request).await? {
            BeginExecution::Completed(execution) => return Ok(*execution),
            BeginExecution::Run => {}
        }
        if stored_interface != *request.manifest.interface()
            || stored_interface.as_str() != COMPONENT_INTERFACE_V1
        {
            return self
                .finish(context, &request, ComputationOutcome::InterfaceMismatch)
                .await;
        }
        let component = match Component::new(&self.engine, &bytes) {
            Ok(component) => component,
            Err(_) => {
                return self
                    .finish(context, &request, ComputationOutcome::MalformedComponent)
                    .await;
            }
        };
        if validate_component_shape(&self.engine, &component).is_err() {
            return self
                .finish(context, &request, ComputationOutcome::InterfaceMismatch)
                .await;
        }
        let mut linker = Linker::new(&self.engine);
        Computation::add_to_linker::<_, HasSelf<_>>(&mut linker, |state| state)
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        let limits = StoreLimitsBuilder::new()
            .memory_size(request.limits.memory_bytes())
            .table_elements(request.limits.table_elements())
            .instances(request.limits.instances())
            .tables(request.limits.tables())
            .memories(request.limits.memories())
            .trap_on_grow_failure(true)
            .build();
        let mut store = Store::new(
            &self.engine,
            StoreState {
                action_requested: false,
                evidence: request.evidence(),
                host,
                limits,
            },
        );
        store.limiter(|state| &mut state.limits);
        store
            .set_fuel(request.limits.fuel())
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        store.set_epoch_deadline(request.limits.deadline_millis());
        let run = async {
            let instance = Computation::instantiate_async(&mut store, &component, &linker).await?;
            instance
                .zoen_code_mode_program()
                .call_run(&mut store, &request.input)
                .await
        };
        let result = run.await;
        let fuel_remaining = store
            .get_fuel()
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        let fuel_consumed = request.limits.fuel().saturating_sub(fuel_remaining);
        let action_requested = store.data().action_requested;
        let outcome = match result {
            Err(error) => classify_runtime_error(&error, action_requested),
            Ok(Err(error)) => program_error(error, action_requested),
            Ok(Ok(output)) => match computation_output(output) {
                Ok(output) => match output_digest(&output) {
                    Ok(result_digest) => ComputationOutcome::Completed(CompletedComputation {
                        fuel_consumed,
                        output,
                        result_digest,
                    }),
                    Err(_) if action_requested => ComputationOutcome::TrapAfterActionRequest,
                    Err(_) => ComputationOutcome::TrapBeforeActionRequest,
                },
                Err(_) if action_requested => ComputationOutcome::TrapAfterActionRequest,
                Err(_) => ComputationOutcome::TrapBeforeActionRequest,
            },
        };
        self.finish(context, &request, outcome).await
    }
}

struct EpochClock {
    stop_sender: Sender<()>,
    thread: Option<JoinHandle<()>>,
}

impl EpochClock {
    fn start(engine: Engine) -> Result<Self, WasmtimeConfigError> {
        let (stop_sender, stop_receiver) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("zoen-wasmtime-epoch".to_owned())
            .spawn(move || {
                loop {
                    match stop_receiver.recv_timeout(EPOCH_INTERVAL) {
                        Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                        Err(RecvTimeoutError::Timeout) => engine.increment_epoch(),
                    }
                }
            })
            .map_err(|error| {
                WasmtimeConfigError(format!("failed to start epoch clock: {error}"))
            })?;
        Ok(Self {
            stop_sender,
            thread: Some(thread),
        })
    }
}

impl Drop for EpochClock {
    fn drop(&mut self) {
        let _ = self.stop_sender.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct StoreState<H> {
    action_requested: bool,
    evidence: ComponentExecutionEvidence,
    host: H,
    limits: StoreLimits,
}

impl<H> wit_host::Host for StoreState<H>
where
    H: ComputationHost,
{
    async fn query(
        &mut self,
        request: wit_host::QueryRequest,
    ) -> Result<wit_host::QueryResult, wit_host::HostError> {
        let request = match host_query_request(request) {
            Ok(request) => request,
            Err(error) => return Err(error),
        };
        self.host
            .query(request)
            .await
            .map(wit_query_result)
            .map_err(wit_host_error)
    }

    async fn explain(
        &mut self,
        request: wit_host::ExplainRequest,
    ) -> Result<wit_host::ExplainResult, wit_host::HostError> {
        let request = match host_explain_request(request) {
            Ok(request) => request,
            Err(error) => return Err(error),
        };
        self.host
            .explain(request)
            .await
            .map(|result| wit_host::ExplainResult {
                complete: result.complete,
                explanation_digest: result.explanation_digest.as_str().to_owned(),
            })
            .map_err(wit_host_error)
    }

    async fn propose(
        &mut self,
        request: wit_host::ProposeRequest,
    ) -> Result<wit_host::ProposalOutcome, wit_host::HostError> {
        let request = match host_propose_request(request) {
            Ok(request) => request,
            Err(error) => return Err(error),
        };
        self.action_requested = true;
        self.host
            .propose(request, &self.evidence)
            .await
            .map(wit_proposal_outcome)
            .map_err(wit_host_error)
    }

    async fn commit(
        &mut self,
        request: wit_host::CommitRequest,
    ) -> Result<wit_host::CommitOutcome, wit_host::HostError> {
        let request = match host_commit_request(request) {
            Ok(request) => request,
            Err(error) => return Err(error),
        };
        self.action_requested = true;
        self.host
            .commit(request)
            .await
            .map(wit_commit_outcome)
            .map_err(wit_host_error)
    }
}

fn validate_component_shape(
    engine: &Engine,
    component: &Component,
) -> Result<(), ComponentAdmissionError> {
    let component_type = component.component_type();
    for (name, _) in component_type.imports(engine) {
        if name != HOST_INTERFACE_V1 {
            return Err(ComponentAdmissionError::UndeclaredImport(name.to_owned()));
        }
    }
    if !component_type
        .exports(engine)
        .any(|(name, _)| name == PROGRAM_INTERFACE_V1)
    {
        return Err(ComponentAdmissionError::InterfaceMismatch);
    }
    Ok(())
}

fn host_query_request(
    request: wit_host::QueryRequest,
) -> Result<HostQueryRequest, wit_host::HostError> {
    Ok(HostQueryRequest {
        capability_id: CapabilityId::parse(request.capability_id).map_err(invalid_request)?,
        entity_id: EntityId::parse(request.entity_id).map_err(invalid_request)?,
        selection: match request.selection {
            wit_host::Selection::Relation(id) => {
                SemanticSelection::Relation(RelationId::parse(id).map_err(invalid_request)?)
            }
            wit_host::Selection::Computation(id) => SemanticSelection::Computation(
                zoen_core::ComputationId::parse(id).map_err(invalid_request)?,
            ),
        },
    })
}

fn host_explain_request(
    request: wit_host::ExplainRequest,
) -> Result<HostExplainRequest, wit_host::HostError> {
    Ok(HostExplainRequest {
        capability_id: CapabilityId::parse(request.capability_id).map_err(invalid_request)?,
        claim_id: ClaimId::parse(request.claim_id).map_err(invalid_request)?,
    })
}

fn host_propose_request(
    request: wit_host::ProposeRequest,
) -> Result<HostProposeRequest, wit_host::HostError> {
    Ok(HostProposeRequest {
        action_id: ActionId::parse(request.action_id).map_err(invalid_request)?,
        capability_id: CapabilityId::parse(request.capability_id).map_err(invalid_request)?,
        inputs: request
            .inputs
            .into_iter()
            .map(|input| {
                Ok(ActionInput {
                    id: InputId::parse(input.id).map_err(invalid_request)?,
                    value: exact_value(input.value)?,
                })
            })
            .collect::<Result<Vec<_>, wit_host::HostError>>()?,
        operation_id: OperationId::parse(request.operation_id).map_err(invalid_request)?,
        proposal_id: ProposalId::parse(request.proposal_id).map_err(invalid_request)?,
        resource_id: ResourceId::parse(request.resource_id).map_err(invalid_request)?,
    })
}

fn host_commit_request(
    request: wit_host::CommitRequest,
) -> Result<HostCommitRequest, wit_host::HostError> {
    Ok(HostCommitRequest {
        capability_id: CapabilityId::parse(request.capability_id).map_err(invalid_request)?,
        intent_digest: IntentDigest::parse(request.intent_digest).map_err(invalid_request)?,
        operation_id: OperationId::parse(request.operation_id).map_err(invalid_request)?,
        proposal_id: ProposalId::parse(request.proposal_id).map_err(invalid_request)?,
    })
}

fn exact_value(value: wit_host::ExactValue) -> Result<ExactValue, wit_host::HostError> {
    match value {
        wit_host::ExactValue::Boolean(value) => Ok(ExactValue::Bool(value)),
        wit_host::ExactValue::Decimal(value) => ExactDecimal::parse(value)
            .map(ExactValue::Decimal)
            .map_err(invalid_request),
        wit_host::ExactValue::Integer(value) => ExactInteger::parse(value)
            .map(ExactValue::Integer)
            .map_err(invalid_request),
        wit_host::ExactValue::Quantity(value) => Ok(ExactValue::Quantity {
            amount: ExactDecimal::parse(value.amount).map_err(invalid_request)?,
            unit: UnitId::parse(value.unit).map_err(invalid_request)?,
        }),
        wit_host::ExactValue::Text(value) => Ok(ExactValue::Text(value)),
        wit_host::ExactValue::Entity(value) => EntityId::parse(value)
            .map(ExactValue::Entity)
            .map_err(invalid_request),
    }
}

fn wit_exact_value(value: ExactValue) -> wit_host::ExactValue {
    match value {
        ExactValue::Bool(value) => wit_host::ExactValue::Boolean(value),
        ExactValue::Decimal(value) => wit_host::ExactValue::Decimal(value.as_str().to_owned()),
        ExactValue::Integer(value) => wit_host::ExactValue::Integer(value.as_str().to_owned()),
        ExactValue::Quantity { amount, unit } => {
            wit_host::ExactValue::Quantity(wit_host::Quantity {
                amount: amount.as_str().to_owned(),
                unit: unit.as_str().to_owned(),
            })
        }
        ExactValue::Text(value) => wit_host::ExactValue::Text(value),
        ExactValue::Entity(value) => wit_host::ExactValue::Entity(value.as_str().to_owned()),
    }
}

fn wit_query_result(result: HostQueryResult) -> wit_host::QueryResult {
    wit_host::QueryResult {
        actual_commit_sequence: result.actual_commit_sequence.get(),
        values: result
            .values
            .into_iter()
            .map(|value| wit_host::SemanticValue {
                claim_ids: value
                    .claim_ids
                    .into_iter()
                    .map(|id| id.as_str().to_owned())
                    .collect(),
                value: wit_exact_value(value.value),
            })
            .collect(),
    }
}

fn wit_host_error(error: HostCallError) -> wit_host::HostError {
    match error {
        HostCallError::CapabilityDenied(capability) => {
            wit_host::HostError::CapabilityDenied(capability)
        }
        HostCallError::CapabilityUnavailable(capability) => {
            wit_host::HostError::CapabilityUnavailable(capability.as_str().to_owned())
        }
        HostCallError::InvalidRequest(message) => wit_host::HostError::InvalidRequest(message),
        HostCallError::ProviderUnavailable(message) => {
            wit_host::HostError::ProviderUnavailable(message)
        }
    }
}

fn wit_proposal_outcome(outcome: HostProposalOutcome) -> wit_host::ProposalOutcome {
    match outcome {
        HostProposalOutcome::AwaitingApproval {
            intent_digest,
            operation_id,
            proposal_id,
        } => wit_host::ProposalOutcome::AwaitingApproval(wit_host::Proposal {
            intent_digest: intent_digest.as_str().to_owned(),
            operation_id: operation_id.as_str().to_owned(),
            proposal_id: proposal_id.as_str().to_owned(),
        }),
        HostProposalOutcome::Denied => wit_host::ProposalOutcome::Denied,
        HostProposalOutcome::EvaluationError => wit_host::ProposalOutcome::EvaluationError,
        HostProposalOutcome::PreconditionDenied => wit_host::ProposalOutcome::PreconditionDenied,
        HostProposalOutcome::Ready {
            intent_digest,
            operation_id,
            proposal_id,
        } => wit_host::ProposalOutcome::Ready(wit_host::Proposal {
            intent_digest: intent_digest.as_str().to_owned(),
            operation_id: operation_id.as_str().to_owned(),
            proposal_id: proposal_id.as_str().to_owned(),
        }),
    }
}

fn wit_commit_outcome(outcome: HostCommitOutcome) -> wit_host::CommitOutcome {
    match outcome {
        HostCommitOutcome::Committed {
            action_id,
            commit_sequence,
            intent_digest,
            operation_id,
            proposal_id,
            recovered,
        } => wit_host::CommitOutcome::Committed(wit_host::CommittedAction {
            action_id: action_id.as_str().to_owned(),
            commit_sequence: commit_sequence.get(),
            intent_digest: intent_digest.as_str().to_owned(),
            operation_id: operation_id.as_str().to_owned(),
            proposal_id: proposal_id.as_str().to_owned(),
            recovered,
        }),
        HostCommitOutcome::Denied => wit_host::CommitOutcome::Denied,
        HostCommitOutcome::EvaluationError => wit_host::CommitOutcome::EvaluationError,
        HostCommitOutcome::IdentityCollision => wit_host::CommitOutcome::IdentityCollision,
        HostCommitOutcome::OperationMismatch => wit_host::CommitOutcome::OperationMismatch,
        HostCommitOutcome::Stale => wit_host::CommitOutcome::Stale,
    }
}

fn computation_output(output: wit_program::ComputationOutput) -> Result<ComputationOutput, String> {
    Ok(ComputationOutput {
        action: match output.action {
            wit_program::ProgramActionOutcome::AwaitingApproval(proposal) => {
                ProgramActionOutcome::AwaitingApproval {
                    intent_digest: IntentDigest::parse(proposal.intent_digest)
                        .map_err(|error| error.to_string())?,
                    operation_id: OperationId::parse(proposal.operation_id)
                        .map_err(|error| error.to_string())?,
                    proposal_id: ProposalId::parse(proposal.proposal_id)
                        .map_err(|error| error.to_string())?,
                }
            }
            wit_program::ProgramActionOutcome::Committed(committed) => {
                ProgramActionOutcome::Committed {
                    action_id: ActionId::parse(committed.action_id)
                        .map_err(|error| error.to_string())?,
                    commit_sequence: CommitSequence::new(committed.commit_sequence)
                        .ok_or_else(|| "component returned a zero commit sequence".to_owned())?,
                    intent_digest: IntentDigest::parse(committed.intent_digest)
                        .map_err(|error| error.to_string())?,
                    operation_id: OperationId::parse(committed.operation_id)
                        .map_err(|error| error.to_string())?,
                    proposal_id: ProposalId::parse(committed.proposal_id)
                        .map_err(|error| error.to_string())?,
                    recovered: committed.recovered,
                }
            }
            wit_program::ProgramActionOutcome::Denied => ProgramActionOutcome::Denied,
            wit_program::ProgramActionOutcome::NotRequested => ProgramActionOutcome::NotRequested,
        },
        aggregate: ExactInteger::parse(output.aggregate).map_err(|error| error.to_string())?,
        explanation_complete: output.explanation_complete,
        selected_claim_id: output
            .selected_claim_id
            .map(ClaimId::parse)
            .transpose()
            .map_err(|error| error.to_string())?,
        selected_values: output.selected_values,
        values_scanned: output.values_scanned,
    })
}

fn program_error(error: wit_program::ProgramError, action_requested: bool) -> ComputationOutcome {
    match error {
        wit_program::ProgramError::CapabilityDenied(capability) => {
            ComputationOutcome::CapabilityDenied(capability)
        }
        wit_program::ProgramError::CapabilityUnavailable(capability) => {
            match CapabilityId::parse(capability) {
                Ok(capability) => ComputationOutcome::CapabilityUnavailable(capability),
                Err(_) if action_requested => ComputationOutcome::TrapAfterActionRequest,
                Err(_) => ComputationOutcome::TrapBeforeActionRequest,
            }
        }
        wit_program::ProgramError::HostUnavailable(_) => ComputationOutcome::HostUnavailable,
        wit_program::ProgramError::InvalidResult(_) if action_requested => {
            ComputationOutcome::TrapAfterActionRequest
        }
        wit_program::ProgramError::InvalidResult(_) => ComputationOutcome::TrapBeforeActionRequest,
    }
}

fn classify_runtime_error(error: &wasmtime::Error, action_requested: bool) -> ComputationOutcome {
    match error.downcast_ref::<Trap>() {
        Some(Trap::OutOfFuel) => return ComputationOutcome::FuelExhausted,
        Some(Trap::Interrupt) => return ComputationOutcome::DeadlineExceeded,
        Some(Trap::MemoryOutOfBounds) => return ComputationOutcome::MemoryLimitExceeded,
        _ => {}
    }
    let message = error.to_string().to_ascii_lowercase();
    if message.contains("fuel") {
        ComputationOutcome::FuelExhausted
    } else if message.contains("memory")
        || message.contains("allocation")
        || message.contains("resource limit")
    {
        ComputationOutcome::MemoryLimitExceeded
    } else if message.contains("incompatible") || message.contains("type mismatch") {
        ComputationOutcome::InterfaceMismatch
    } else if action_requested {
        ComputationOutcome::TrapAfterActionRequest
    } else {
        ComputationOutcome::TrapBeforeActionRequest
    }
}

fn invalid_request(error: impl Display) -> wit_host::HostError {
    wit_host::HostError::InvalidRequest(error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputDigestView<'a> {
    action: ActionDigestView<'a>,
    aggregate: &'a str,
    explanation_complete: bool,
    selected_claim_id: Option<&'a str>,
    selected_values: u32,
    values_scanned: u32,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ActionDigestView<'a> {
    AwaitingApproval {
        intent_digest: &'a str,
        operation_id: &'a str,
        proposal_id: &'a str,
    },
    Committed {
        action_id: &'a str,
        commit_sequence: u64,
        intent_digest: &'a str,
        operation_id: &'a str,
        proposal_id: &'a str,
        recovered: bool,
    },
    Denied,
    NotRequested,
}

fn output_digest(
    output: &ComputationOutput,
) -> Result<zoen_core::ExecutionResultDigest, serde_json::Error> {
    let action = match &output.action {
        ProgramActionOutcome::AwaitingApproval {
            intent_digest,
            operation_id,
            proposal_id,
        } => ActionDigestView::AwaitingApproval {
            intent_digest: intent_digest.as_str(),
            operation_id: operation_id.as_str(),
            proposal_id: proposal_id.as_str(),
        },
        ProgramActionOutcome::Committed {
            action_id,
            commit_sequence,
            intent_digest,
            operation_id,
            proposal_id,
            recovered,
        } => ActionDigestView::Committed {
            action_id: action_id.as_str(),
            commit_sequence: commit_sequence.get(),
            intent_digest: intent_digest.as_str(),
            operation_id: operation_id.as_str(),
            proposal_id: proposal_id.as_str(),
            recovered: *recovered,
        },
        ProgramActionOutcome::Denied => ActionDigestView::Denied,
        ProgramActionOutcome::NotRequested => ActionDigestView::NotRequested,
    };
    let bytes = serde_jcs::to_vec(&OutputDigestView {
        action,
        aggregate: output.aggregate.as_str(),
        explanation_complete: output.explanation_complete,
        selected_claim_id: output.selected_claim_id.as_ref().map(|id| id.as_str()),
        selected_values: output.selected_values,
        values_scanned: output.values_scanned,
    })?;
    Ok(zoen_core::ExecutionResultDigest::from_sha256(
        Sha256::digest(bytes).into(),
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    use wasmtime::{Config, Engine, Instance, Module, Store, Trap};
    use zoen_engine::ComputationOutcome;

    use super::{EpochClock, classify_runtime_error};

    const TIGHT_LOOP_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03,
        0x02, 0x01, 0x00, 0x07, 0x08, 0x01, 0x04, 0x73, 0x70, 0x69, 0x6e, 0x00, 0x00, 0x0a, 0x09,
        0x01, 0x07, 0x00, 0x03, 0x40, 0x0c, 0x00, 0x0b, 0x0b,
    ];

    #[test]
    fn independent_epoch_clock_interrupts_single_worker_guest() {
        let (result_sender, result_receiver) = mpsc::channel();
        thread::spawn(move || {
            let _ = result_sender.send(run_tight_loop());
        });

        let error = result_receiver
            .recv_timeout(Duration::from_secs(2))
            .expect("tight guest loop must be interrupted");
        assert!(matches!(
            error.downcast_ref::<Trap>(),
            Some(Trap::Interrupt)
        ));
        let outcome = classify_runtime_error(&error, false);
        assert!(matches!(outcome, ComputationOutcome::DeadlineExceeded));
    }

    fn run_tight_loop() -> wasmtime::Error {
        let mut config = Config::new();
        config.async_support(true);
        config.epoch_interruption(true);
        let engine = Engine::new(&config).expect("Wasmtime engine must initialize");
        let _epoch_clock = EpochClock::start(engine.clone()).expect("epoch clock must initialize");
        let module =
            Module::new(&engine, TIGHT_LOOP_MODULE).expect("tight loop module must compile");
        let mut store = Store::new(&engine, ());
        store.set_epoch_deadline(1);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("Tokio runtime must initialize");
        let error = runtime
            .block_on(async {
                let instance = Instance::new_async(&mut store, &module, &[]).await?;
                let spin = instance.get_typed_func::<(), ()>(&mut store, "spin")?;
                spin.call_async(&mut store, ()).await
            })
            .expect_err("tight guest loop must trap");
        error
    }
}
