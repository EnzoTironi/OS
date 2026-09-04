use std::{
    error::Error,
    fmt::{Display, Formatter},
    sync::mpsc::{self, RecvTimeoutError, Sender},
    thread::{self, JoinHandle},
    time::Duration,
};

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use wasmtime::{
    Config, Engine, ResourceLimiter, Store, StoreLimits, StoreLimitsBuilder, Trap,
    component::{Component, HasSelf, Linker},
};
use zoen_core::{
    ActionId, ActionInput, CapabilityId, ClaimId, CommitSequence, ComponentDigest,
    ComponentExecutionEvidence, EntityId, ExactDecimal, ExactInteger, ExactValue, InputId,
    IntentDigest, MembershipId, OperationId, ProposalId, RelationId, ResourceId, SemanticSelection,
    UnitId,
};
use zoen_engine::{
    COMPONENT_INTERFACE_V1, CompletedComputation, ComponentAdmissionError, ComponentArtifact,
    ComputationError, ComputationExecution, ComputationHost, ComputationInvocation,
    ComputationLimits, ComputationOutcome, ComputationOutput, ComputationRequest, HostCallError,
    HostCommitOutcome, HostCommitRequest, HostExplainRequest, HostProposalOutcome,
    HostProposeRequest, HostQueryRequest, HostQueryResult, ProgramActionOutcome,
    PublishedComponent,
};

use crate::{
    ComputeBasisEvidence, ResolvedComputeBasis,
    wasm_store::{self, BeginExecution},
};

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

use bindings::{
    Computation, exports::zoen::code_mode::program as wit_program,
    zoen::code_mode::host as wit_host,
};

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

pub struct AuthorizedComputationExecution {
    basis: ComputeBasisEvidence,
    execution: ComputationExecution,
    limits: ComputationLimits,
}

impl AuthorizedComputationExecution {
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (
        ComputationExecution,
        ComputeBasisEvidence,
        ComputationLimits,
    ) {
        (self.execution, self.basis, self.limits)
    }
}

impl WasmtimeComputationExecutor {
    /// Build a Wasmtime engine with fuel and epoch interruption.
    ///
    /// # Errors
    ///
    /// Returns [`WasmtimeConfigError`] when the engine or epoch clock cannot
    /// be configured.
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

impl WasmtimeComputationExecutor {
    /// Publish a validated component for the current World.
    ///
    /// # Errors
    ///
    /// Returns [`ComponentAdmissionError`] when the component does not satisfy
    /// admission rules or cannot be persisted.
    pub async fn publish(
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

    /// Replay a completed execution for this Membership and invocation.
    ///
    /// # Errors
    ///
    /// Returns [`ComputationError`] when persisted execution evidence is
    /// unavailable, corrupt, or inconsistent with the invocation.
    pub async fn replay(
        &self,
        context: &zoen_core::ExecutionContext,
        membership_id: &MembershipId,
        invocation: &ComputationInvocation,
    ) -> Result<Option<AuthorizedComputationExecution>, ComputationError> {
        Ok(
            wasm_store::replay_completed_execution(&self.pool, context, membership_id, invocation)
                .await?
                .map(
                    |(execution, basis, limits)| AuthorizedComputationExecution {
                        basis,
                        execution,
                        limits,
                    },
                ),
        )
    }

    /// Execute a component with a server-resolved, single-use authority basis.
    ///
    /// # Errors
    ///
    /// Returns [`ComputationError`] when component loading, execution, or
    /// durable evidence recording fails.
    pub async fn execute<H>(
        &self,
        basis: ResolvedComputeBasis,
        invocation: ComputationInvocation,
        host: H,
    ) -> Result<AuthorizedComputationExecution, ComputationError>
    where
        H: ComputationHost + 'static,
    {
        let (context, basis, limits) = basis.into_parts();
        let request = ComputationRequest {
            authority_basis_jcs: basis.canonical_jcs().to_owned(),
            invocation,
            limits,
        };
        let (stored_interface, bytes) =
            wasm_store::load_component(&self.pool, &context, &request.invocation.component_digest)
                .await?;
        match wasm_store::begin_execution(&self.pool, &context, &request, &basis).await? {
            BeginExecution::Completed(execution) => {
                return Ok(AuthorizedComputationExecution {
                    basis,
                    execution: *execution,
                    limits,
                });
            }
            BeginExecution::Run => {}
        }
        let outcome = self
            .run_component(&request, host, stored_interface, &bytes)
            .await?;
        let execution = self.finish(&context, &request, outcome).await?;
        Ok(AuthorizedComputationExecution {
            basis,
            execution,
            limits,
        })
    }

    async fn run_component<H>(
        &self,
        request: &ComputationRequest,
        host: H,
        stored_interface: zoen_core::ComponentInterface,
        bytes: &[u8],
    ) -> Result<ComputationOutcome, ComputationError>
    where
        H: ComputationHost + 'static,
    {
        if stored_interface != *request.invocation.manifest.interface()
            || stored_interface.as_str() != COMPONENT_INTERFACE_V1
        {
            return Ok(ComputationOutcome::InterfaceMismatch);
        }
        let Ok(component) = Component::new(&self.engine, bytes) else {
            return Ok(ComputationOutcome::MalformedComponent);
        };
        if validate_component_shape(&self.engine, &component).is_err() {
            return Ok(ComputationOutcome::InterfaceMismatch);
        }
        let mut linker = Linker::new(&self.engine);
        Computation::add_to_linker::<_, HasSelf<_>>(&mut linker, |state| state)
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        let store_limits = StoreLimitsBuilder::new()
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
                limiter: ExecutionLimiter::new(store_limits),
            },
        );
        store.limiter(|state| &mut state.limiter);
        store
            .set_fuel(request.limits.fuel())
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        store.set_epoch_deadline(request.limits.deadline_millis());
        let run = async {
            let instance = Computation::instantiate_async(&mut store, &component, &linker).await?;
            instance
                .zoen_code_mode_program()
                .call_run(&mut store, &request.invocation.input)
                .await
        };
        let result = run.await;
        let fuel_remaining = store
            .get_fuel()
            .map_err(|error| ComputationError::Store(error.to_string()))?;
        let fuel_consumed = request.limits.fuel().saturating_sub(fuel_remaining);
        let action_requested = store.data().action_requested;
        let memory_denied = store.data().limiter.memory_denied();
        Ok(match result {
            Err(error) => classify_runtime_error(&error, action_requested, memory_denied),
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
        })
    }
}

struct ExecutionLimiter {
    limits: StoreLimits,
    memory_denied: bool,
}

impl ExecutionLimiter {
    fn new(limits: StoreLimits) -> Self {
        Self {
            limits,
            memory_denied: false,
        }
    }

    fn memory_denied(&self) -> bool {
        self.memory_denied
    }
}

impl ResourceLimiter for ExecutionLimiter {
    fn memory_growing(
        &mut self,
        current: usize,
        desired: usize,
        maximum: Option<usize>,
    ) -> wasmtime::Result<bool> {
        let result = self.limits.memory_growing(current, desired, maximum);
        if !matches!(&result, Ok(true)) {
            self.memory_denied = true;
        }
        result
    }

    fn memory_grow_failed(&mut self, error: wasmtime::Error) -> wasmtime::Result<()> {
        self.limits.memory_grow_failed(error)
    }

    fn table_growing(
        &mut self,
        current: usize,
        desired: usize,
        maximum: Option<usize>,
    ) -> wasmtime::Result<bool> {
        self.limits.table_growing(current, desired, maximum)
    }

    fn table_grow_failed(&mut self, error: wasmtime::Error) -> wasmtime::Result<()> {
        self.limits.table_grow_failed(error)
    }

    fn instances(&self) -> usize {
        self.limits.instances()
    }

    fn tables(&self) -> usize {
        self.limits.tables()
    }

    fn memories(&self) -> usize {
        self.limits.memories()
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
    limiter: ExecutionLimiter,
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

fn classify_runtime_error(
    error: &wasmtime::Error,
    action_requested: bool,
    memory_denied: bool,
) -> ComputationOutcome {
    if memory_denied {
        return ComputationOutcome::MemoryLimitExceeded;
    }
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
        selected_claim_id: output
            .selected_claim_id
            .as_ref()
            .map(zoen_core::ClaimId::as_str),
        selected_values: output.selected_values,
        values_scanned: output.values_scanned,
    })?;
    Ok(zoen_core::ExecutionResultDigest::from_sha256(
        Sha256::digest(bytes).into(),
    ))
}

#[cfg(test)]
mod tests {
    use std::{sync::mpsc, thread, time::Duration};

    use wasmtime::{
        Config, Engine, Instance, Module, Store, StoreLimitsBuilder, Trap,
        component::{Component, Linker as ComponentLinker},
    };
    use zoen_engine::ComputationOutcome;

    use super::{EpochClock, ExecutionLimiter, classify_runtime_error};

    const ABORT_COMPONENT: &[u8] = &[
        0, 97, 115, 109, 13, 0, 1, 0, 1, 52, 0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2,
        1, 0, 7, 9, 1, 5, 97, 98, 111, 114, 116, 0, 0, 10, 5, 1, 3, 0, 0, 11, 0, 14, 4, 110, 97,
        109, 101, 0, 7, 6, 109, 111, 100, 117, 108, 101, 2, 4, 1, 0, 0, 0, 7, 5, 1, 64, 0, 1, 0, 6,
        11, 1, 0, 0, 1, 0, 5, 97, 98, 111, 114, 116, 8, 6, 1, 0, 0, 0, 0, 0, 11, 11, 1, 0, 5, 97,
        98, 111, 114, 116, 1, 0, 0, 0, 43, 14, 99, 111, 109, 112, 111, 110, 101, 110, 116, 45, 110,
        97, 109, 101, 1, 11, 0, 17, 1, 0, 6, 109, 111, 100, 117, 108, 101, 1, 13, 0, 18, 1, 0, 8,
        105, 110, 115, 116, 97, 110, 99, 101,
    ];
    const GROW_COMPONENT: &[u8] = &[
        0, 97, 115, 109, 13, 0, 1, 0, 1, 65, 0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2,
        1, 0, 5, 3, 1, 0, 1, 7, 8, 1, 4, 103, 114, 111, 119, 0, 0, 10, 14, 1, 12, 0, 3, 64, 65, 1,
        64, 0, 26, 12, 0, 11, 11, 0, 14, 4, 110, 97, 109, 101, 0, 7, 6, 109, 111, 100, 117, 108,
        101, 2, 4, 1, 0, 0, 0, 7, 5, 1, 64, 0, 1, 0, 6, 10, 1, 0, 0, 1, 0, 4, 103, 114, 111, 119,
        8, 6, 1, 0, 0, 0, 0, 0, 11, 10, 1, 0, 4, 103, 114, 111, 119, 1, 0, 0, 0, 43, 14, 99, 111,
        109, 112, 111, 110, 101, 110, 116, 45, 110, 97, 109, 101, 1, 11, 0, 17, 1, 0, 6, 109, 111,
        100, 117, 108, 101, 1, 13, 0, 18, 1, 0, 8, 105, 110, 115, 116, 97, 110, 99, 101,
    ];
    const TIGHT_LOOP_MODULE: &[u8] = &[
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03,
        0x02, 0x01, 0x00, 0x07, 0x08, 0x01, 0x04, 0x73, 0x70, 0x69, 0x6e, 0x00, 0x00, 0x0a, 0x09,
        0x01, 0x07, 0x00, 0x03, 0x40, 0x0c, 0x00, 0x0b, 0x0b,
    ];

    #[tokio::test]
    async fn component_memory_limit_and_abort_errors_are_distinct() {
        let (memory_error, memory_denied) = run_component(GROW_COMPONENT, "grow").await;
        let (abort_error, abort_memory_denied) = run_component(ABORT_COMPONENT, "abort").await;

        println!("memory display: {memory_error}");
        println!("memory debug: {memory_error:?}");
        println!("abort display: {abort_error}");
        println!("abort debug: {abort_error:?}");

        assert!(memory_denied);
        assert!(!abort_memory_denied);
        assert!(matches!(
            classify_runtime_error(&memory_error, false, memory_denied),
            ComputationOutcome::MemoryLimitExceeded
        ));
        assert!(matches!(
            classify_runtime_error(&abort_error, false, abort_memory_denied),
            ComputationOutcome::TrapBeforeActionRequest
        ));
    }

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
        let outcome = classify_runtime_error(&error, false, false);
        assert!(matches!(outcome, ComputationOutcome::DeadlineExceeded));
    }

    async fn run_component(bytes: &[u8], export: &str) -> (wasmtime::Error, bool) {
        let mut config = Config::new();
        config.async_support(true);
        config.wasm_component_model(true);
        let engine = Engine::new(&config).expect("Wasmtime engine must initialize");
        let component =
            Component::new(&engine, bytes).expect("test component must compile successfully");
        let linker = ComponentLinker::new(&engine);
        let mut store = Store::new(
            &engine,
            ExecutionLimiter::new(
                StoreLimitsBuilder::new()
                    .memory_size(2 * 1024 * 1024)
                    .trap_on_grow_failure(true)
                    .build(),
            ),
        );
        store.limiter(|limiter| limiter);
        let instance = linker
            .instantiate_async(&mut store, &component)
            .await
            .expect("test component must instantiate");
        let function = instance
            .get_typed_func::<(), ()>(&mut store, export)
            .expect("test component export must match");
        let error = function
            .call_async(&mut store, ())
            .await
            .expect_err("test component must trap");
        (error, store.data().memory_denied())
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
        runtime
            .block_on(async {
                let instance = Instance::new_async(&mut store, &module, &[]).await?;
                let spin = instance.get_typed_func::<(), ()>(&mut store, "spin")?;
                spin.call_async(&mut store, ()).await
            })
            .expect_err("tight guest loop must trap")
    }
}
