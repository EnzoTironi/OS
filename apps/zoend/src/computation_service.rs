use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use buffa::MessageView;
use connectrpc::{
    ConnectError, ErrorCode, RequestContext, Response, ServiceRequest, ServiceResult,
};
use sha2::{Digest, Sha256};
use zoen_adapters::{
    CedarPolicyEvaluator, PostgresAuthorityStore, WasmtimeComputationExecutor, WasmtimeConfigError,
};
use zoen_core::{
    ActionPreviewHash, CapabilityId, ClaimId, ComponentDigest, ComponentExecutionEvidence,
    ComponentInterface, Consistency, ExecutionContext, ExecutionId, ExecutionResultDigest,
    ExplanationTarget, IntentDigest, OperationId, ProposalAuthority, ProposalId, SemanticQuery,
};
use zoen_engine::{
    ActionEngine, ActionError, CapabilityManifest, CommitOutcome, ComponentAdmissionError,
    ComponentArtifact, ComputationCapability, ComputationContractError, ComputationError,
    ComputationExecution, ComputationExecutor, ComputationHost, ComputationLimits,
    ComputationOutcome, ComputationOutput as CoreComputationOutput, ComputationRequest,
    HistoryEngine, HostCallError, HostCallFuture, HostCommitOutcome, HostCommitRequest,
    HostExplainRequest, HostExplainResult, HostProposalOutcome, HostProposeRequest,
    HostQueryRequest, HostQueryResult, HostSemanticValue, ProgramActionOutcome, ProposeCommand,
    ProposeOutcome, QueryExecutor, QueryPortError, StoreError,
};
use zoen_query::QueryRuntime;

use crate::action_service::to_component_execution;
use crate::auth::SessionRegistry;
use crate::proto::zoen::computation::v1::{
    ComponentAdmissionStatus, ComputationOutput, ComputationService, ExecuteRequest,
    ExecuteResponse, ExecutionStatus, ProgramActionOutcome as ProtocolProgramActionOutcome,
    ProgramActionStatus, PublishComponentRequest, PublishComponentResponse, ResourceLimits,
    capability,
};
use crate::world_service::{invalid, parse_definition_reference, parse_selection, parse_timestamp};

type DaemonActionEngine =
    ActionEngine<PostgresAuthorityStore, QueryRuntime, Arc<CedarPolicyEvaluator>>;

pub struct ComputationServiceImpl {
    executor: WasmtimeComputationExecutor,
    policy: Arc<CedarPolicyEvaluator>,
    query: QueryRuntime,
    sessions: SessionRegistry,
    store: PostgresAuthorityStore,
}

impl ComputationServiceImpl {
    pub fn new(
        store: PostgresAuthorityStore,
        query: QueryRuntime,
        policy: Arc<CedarPolicyEvaluator>,
        sessions: SessionRegistry,
    ) -> Result<Self, WasmtimeConfigError> {
        let executor = WasmtimeComputationExecutor::new(store.pool())?;
        Ok(Self {
            executor,
            policy,
            query,
            sessions,
            store,
        })
    }
}

impl ComputationService for ComputationServiceImpl {
    async fn publish_component(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, PublishComponentRequest>,
    ) -> ServiceResult<PublishComponentResponse> {
        let trusted = {
            let tenant = SessionRegistry::tenant_from_header(&context)?;
            self.sessions
                .resolve(SessionRegistry::bearer_from(&context), tenant.as_ref())
                .await?
        };
        let artifact = ComponentArtifact {
            bytes: request.component.to_vec(),
            claimed_digest: ComponentDigest::parse(request.claimed_digest)
                .map_err(|error| invalid(error.to_string()))?,
            interface: ComponentInterface::parse(request.component_interface)
                .map_err(|error| invalid(error.to_string()))?,
        };
        match self.executor.publish(&trusted, artifact).await {
            Ok(published) => Response::ok(PublishComponentResponse {
                component_digest: published.digest.as_str().to_owned(),
                component_interface: published.interface.as_str().to_owned(),
                size_bytes: u64::try_from(published.size_bytes)
                    .map_err(|error| internal(error.to_string()))?,
                status: ComponentAdmissionStatus::Published.into(),
                ..Default::default()
            }),
            Err(error) => Response::ok(admission_error(error)?),
        }
    }

    async fn execute(
        &self,
        context: RequestContext,
        request: ServiceRequest<'_, ExecuteRequest>,
    ) -> ServiceResult<ExecuteResponse> {
        let trusted = {
            let tenant = SessionRegistry::tenant_from_header(&context)?;
            self.sessions
                .resolve(SessionRegistry::bearer_from(&context), tenant.as_ref())
                .await?
        };
        let manifest = request
            .manifest
            .as_option()
            .ok_or_else(|| invalid("capability manifest is required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let limits = request
            .limits
            .as_option()
            .ok_or_else(|| invalid("resource limits are required"))?
            .to_owned_message()
            .map_err(|error| invalid(error.to_string()))?;
        let manifest = parse_manifest(manifest)?;
        let limits = parse_limits(&limits)?;
        let execution = self
            .executor
            .execute(
                &trusted,
                ComputationRequest {
                    component_digest: ComponentDigest::parse(request.component_digest)
                        .map_err(|error| invalid(error.to_string()))?,
                    execution_id: ExecutionId::parse(request.execution_id)
                        .map_err(|error| invalid(error.to_string()))?,
                    input: request.input.to_vec(),
                    limits,
                    manifest: manifest.clone(),
                },
                ScopedComputationHost::new(
                    trusted.clone(),
                    manifest,
                    self.store.clone(),
                    self.query.clone(),
                    self.policy.clone(),
                ),
            )
            .await
            .map_err(map_computation_error)?;
        Response::ok(execution_response(execution, limits))
    }
}

struct ScopedComputationHost {
    action: DaemonActionEngine,
    context: ExecutionContext,
    history: HistoryEngine<PostgresAuthorityStore>,
    manifest: CapabilityManifest,
    proposals: BTreeMap<CapabilityId, AuthorizedProposal>,
    query: QueryRuntime,
    query_claims: BTreeSet<ClaimId>,
}

#[derive(Clone)]
struct AuthorizedProposal {
    intent_digest: IntentDigest,
    operation_id: OperationId,
    preview_hash: ActionPreviewHash,
    proposal_id: ProposalId,
}

impl ScopedComputationHost {
    fn new(
        context: ExecutionContext,
        manifest: CapabilityManifest,
        store: PostgresAuthorityStore,
        query: QueryRuntime,
        policy: Arc<CedarPolicyEvaluator>,
    ) -> Self {
        Self {
            action: ActionEngine::new(store.clone(), query.clone(), policy),
            context,
            history: HistoryEngine::new(store),
            manifest,
            proposals: BTreeMap::new(),
            query,
            query_claims: BTreeSet::new(),
        }
    }

    fn capability(
        &self,
        capability_id: &CapabilityId,
    ) -> Result<ComputationCapability, HostCallError> {
        self.manifest
            .capabilities()
            .iter()
            .find(|capability| capability.id() == capability_id)
            .cloned()
            .ok_or_else(|| HostCallError::CapabilityUnavailable(capability_id.clone()))
    }
}

impl ComputationHost for ScopedComputationHost {
    fn query(
        &mut self,
        request: HostQueryRequest,
    ) -> HostCallFuture<'_, Result<HostQueryResult, HostCallError>> {
        Box::pin(async move {
            let capability = self.capability(&request.capability_id)?;
            let ComputationCapability::Query {
                definition,
                entity_id,
                selection,
                valid_at,
                ..
            } = capability
            else {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            };
            if request.entity_id != entity_id || request.selection != selection {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            }
            let result = QueryExecutor::execute(
                &self.query,
                &self.context,
                &SemanticQuery::ByEntity {
                    consistency: Consistency::Strong,
                    definition,
                    entity_id,
                    selection,
                    valid_at,
                },
            )
            .await
            .map_err(map_query_error)?;
            let values = result
                .values
                .into_iter()
                .map(|value| {
                    let claim_ids = value
                        .dependencies
                        .into_iter()
                        .map(|dependency| dependency.claim_id)
                        .collect::<Vec<_>>();
                    self.query_claims.extend(claim_ids.iter().cloned());
                    HostSemanticValue {
                        claim_ids,
                        value: value.value,
                    }
                })
                .collect();
            Ok(HostQueryResult {
                actual_commit_sequence: result.actual_commit_sequence,
                values,
            })
        })
    }

    fn explain(
        &mut self,
        request: HostExplainRequest,
    ) -> HostCallFuture<'_, Result<HostExplainResult, HostCallError>> {
        Box::pin(async move {
            if !matches!(
                self.capability(&request.capability_id)?,
                ComputationCapability::Explain { .. }
            ) || !self.query_claims.contains(&request.claim_id)
            {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            }
            let explanation = self
                .history
                .explain(
                    &self.context,
                    ExplanationTarget::Claim(request.claim_id.clone()),
                )
                .await
                .map_err(|error| HostCallError::ProviderUnavailable(error.to_string()))?;
            Ok(HostExplainResult {
                complete: explanation.complete,
                explanation_digest: explanation_digest(
                    &request.claim_id,
                    explanation.complete,
                    explanation.gaps.len(),
                ),
            })
        })
    }

    fn propose<'a>(
        &'a mut self,
        request: HostProposeRequest,
        evidence: &'a ComponentExecutionEvidence,
    ) -> HostCallFuture<'a, Result<HostProposalOutcome, HostCallError>> {
        Box::pin(async move {
            let capability = self.capability(&request.capability_id)?;
            let ComputationCapability::Action {
                action_id,
                definition,
                expires_at,
                proposed_at,
                resource_id,
                valid_at,
                ..
            } = capability
            else {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            };
            if request.action_id != action_id || request.resource_id != resource_id {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            }
            match self
                .action
                .propose(
                    &self.context,
                    ProposeCommand {
                        action_id,
                        definition,
                        execution: Some(evidence.clone()),
                        expires_at,
                        inputs: request.inputs,
                        operation_id: request.operation_id,
                        proposal_id: request.proposal_id,
                        proposed_at,
                        resource_id,
                        valid_at,
                    },
                )
                .await
                .map_err(map_action_error)?
            {
                ProposeOutcome::Accepted(proposal) => {
                    let authorized = AuthorizedProposal {
                        intent_digest: proposal.intent_digest.clone(),
                        operation_id: proposal.operation_id.clone(),
                        preview_hash: proposal.preview_hash.clone(),
                        proposal_id: proposal.proposal_id.clone(),
                    };
                    self.proposals
                        .insert(request.capability_id, authorized.clone());
                    match proposal.authority {
                        ProposalAuthority::AwaitingApproval(_) => {
                            Ok(HostProposalOutcome::AwaitingApproval {
                                intent_digest: authorized.intent_digest,
                                operation_id: authorized.operation_id,
                                proposal_id: authorized.proposal_id,
                            })
                        }
                        ProposalAuthority::Ready(_) => Ok(HostProposalOutcome::Ready {
                            intent_digest: authorized.intent_digest,
                            operation_id: authorized.operation_id,
                            proposal_id: authorized.proposal_id,
                        }),
                    }
                }
                ProposeOutcome::Denied(_) => Ok(HostProposalOutcome::Denied),
                ProposeOutcome::EvaluationError { .. } => Ok(HostProposalOutcome::EvaluationError),
                ProposeOutcome::PreconditionDenied(_) => {
                    Ok(HostProposalOutcome::PreconditionDenied)
                }
            }
        })
    }

    fn commit(
        &mut self,
        request: HostCommitRequest,
    ) -> HostCallFuture<'_, Result<HostCommitOutcome, HostCallError>> {
        Box::pin(async move {
            if !matches!(
                self.capability(&request.capability_id)?,
                ComputationCapability::Action { .. }
            ) {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            }
            let authorized = self
                .proposals
                .get(&request.capability_id)
                .cloned()
                .ok_or_else(|| {
                    HostCallError::CapabilityDenied(request.capability_id.as_str().to_owned())
                })?;
            if authorized.intent_digest != request.intent_digest
                || authorized.operation_id != request.operation_id
                || authorized.proposal_id != request.proposal_id
            {
                return Err(HostCallError::CapabilityDenied(
                    request.capability_id.as_str().to_owned(),
                ));
            }
            match self
                .action
                .operation_status(&self.context, &request.operation_id)
                .await
            {
                Ok(receipt) => return recovered_receipt(receipt, &authorized),
                Err(ActionError::Store(StoreError::NotFound)) => {}
                Err(error) => return Err(map_action_error(error)),
            }
            let outcome = self
                .action
                .commit(
                    &self.context,
                    &request.proposal_id,
                    &request.operation_id,
                    Some(authorized.preview_hash.as_str()),
                    current_time()?,
                )
                .await
                .map_err(map_action_error)?;
            Ok(match outcome {
                CommitOutcome::Committed(receipt) => committed_receipt(*receipt, false),
                CommitOutcome::Denied(_) => HostCommitOutcome::Denied,
                CommitOutcome::EvaluationError { .. } => HostCommitOutcome::EvaluationError,
                CommitOutcome::IdentityCollision(_) => HostCommitOutcome::IdentityCollision,
                CommitOutcome::OperationMismatch => HostCommitOutcome::OperationMismatch,
                CommitOutcome::PreviewMismatch => HostCommitOutcome::Denied,
                CommitOutcome::Stale(_) => HostCommitOutcome::Stale,
            })
        })
    }
}

fn parse_manifest(
    manifest: crate::proto::zoen::computation::v1::CapabilityManifest,
) -> Result<CapabilityManifest, ConnectError> {
    let interface = ComponentInterface::parse(manifest.component_interface)
        .map_err(|error| invalid(error.to_string()))?;
    let capabilities = manifest
        .capabilities
        .into_iter()
        .map(|capability| {
            match capability
                .capability
                .ok_or_else(|| invalid("capability variant is required"))?
            {
                capability::Capability::Query(query) => {
                    let definition = query
                        .definition
                        .as_option()
                        .ok_or_else(|| invalid("query definition is required"))?;
                    let selection = query
                        .selection
                        .as_option()
                        .ok_or_else(|| invalid("query selection is required"))?;
                    let valid_at = query
                        .valid_at
                        .as_option()
                        .ok_or_else(|| invalid("query valid_at is required"))?;
                    Ok(ComputationCapability::Query {
                        definition: parse_definition_reference(definition)?,
                        entity_id: zoen_core::EntityId::parse(query.entity_id)
                            .map_err(|error| invalid(error.to_string()))?,
                        id: CapabilityId::parse(query.capability_id)
                            .map_err(|error| invalid(error.to_string()))?,
                        selection: parse_selection(selection)?,
                        valid_at: parse_timestamp(valid_at)?,
                    })
                }
                capability::Capability::Explain(explain) => Ok(ComputationCapability::Explain {
                    id: CapabilityId::parse(explain.capability_id)
                        .map_err(|error| invalid(error.to_string()))?,
                }),
                capability::Capability::Action(action) => {
                    let definition = action
                        .definition
                        .as_option()
                        .ok_or_else(|| invalid("Action definition is required"))?;
                    let expires_at = action
                        .expires_at
                        .as_option()
                        .ok_or_else(|| invalid("Action expires_at is required"))?;
                    let proposed_at = action
                        .proposed_at
                        .as_option()
                        .ok_or_else(|| invalid("Action proposed_at is required"))?;
                    let valid_at = action
                        .valid_at
                        .as_option()
                        .ok_or_else(|| invalid("Action valid_at is required"))?;
                    Ok(ComputationCapability::Action {
                        action_id: zoen_core::ActionId::parse(action.action_id)
                            .map_err(|error| invalid(error.to_string()))?,
                        definition: parse_definition_reference(definition)?,
                        expires_at: parse_timestamp(expires_at)?,
                        id: CapabilityId::parse(action.capability_id)
                            .map_err(|error| invalid(error.to_string()))?,
                        proposed_at: parse_timestamp(proposed_at)?,
                        resource_id: zoen_core::ResourceId::parse(action.resource_id)
                            .map_err(|error| invalid(error.to_string()))?,
                        valid_at: parse_timestamp(valid_at)?,
                    })
                }
            }
        })
        .collect::<Result<Vec<_>, ConnectError>>()?;
    CapabilityManifest::new(interface, capabilities).map_err(map_contract_error)
}

fn parse_limits(limits: &ResourceLimits) -> Result<ComputationLimits, ConnectError> {
    // Client ResourceLimits are a request hint; ComputationLimits clamps to the host max.
    ComputationLimits::new(
        limits.fuel,
        usize_limit(limits.memory_bytes, "memory_bytes")?,
        usize_limit(limits.table_elements, "table_elements")?,
        usize_limit(limits.instances, "instances")?,
        usize_limit(limits.tables, "tables")?,
        usize_limit(limits.memories, "memories")?,
        limits.deadline_millis,
    )
    .map_err(map_contract_error)
}

fn usize_limit(value: u64, name: &str) -> Result<usize, ConnectError> {
    usize::try_from(value).map_err(|_| invalid(format!("{name} exceeds this host's range")))
}

fn admission_error(
    error: ComponentAdmissionError,
) -> Result<PublishComponentResponse, ConnectError> {
    let (status, denied_capability) = match error {
        ComponentAdmissionError::DigestMismatch => {
            (ComponentAdmissionStatus::DigestMismatch, String::new())
        }
        ComponentAdmissionError::Empty | ComponentAdmissionError::Malformed => {
            (ComponentAdmissionStatus::Malformed, String::new())
        }
        ComponentAdmissionError::InterfaceMismatch => {
            (ComponentAdmissionStatus::InterfaceMismatch, String::new())
        }
        ComponentAdmissionError::TooLarge => (ComponentAdmissionStatus::TooLarge, String::new()),
        ComponentAdmissionError::UndeclaredImport(name) => {
            (ComponentAdmissionStatus::UndeclaredCapability, name)
        }
        ComponentAdmissionError::Store(message) => {
            return Err(ConnectError::new(ErrorCode::Unavailable, message));
        }
    };
    Ok(PublishComponentResponse {
        denied_capability,
        status: status.into(),
        ..Default::default()
    })
}

fn execution_response(
    execution: ComputationExecution,
    limits: ComputationLimits,
) -> ExecuteResponse {
    let mut response = ExecuteResponse {
        evidence: Some(to_component_execution(execution.evidence)).into(),
        limits: Some(protocol_limits(limits)).into(),
        request_digest: execution.request_digest.as_str().to_owned(),
        ..Default::default()
    };
    match execution.outcome {
        ComputationOutcome::CapabilityDenied(capability) => {
            response.denied_capability = capability;
            response.status = ExecutionStatus::CapabilityDenied.into();
        }
        ComputationOutcome::CapabilityUnavailable(capability) => {
            response.denied_capability = capability.as_str().to_owned();
            response.status = ExecutionStatus::CapabilityUnavailable.into();
        }
        ComputationOutcome::Completed(completed) => {
            response.fuel_consumed = completed.fuel_consumed;
            response.output = Some(protocol_output(completed.output)).into();
            response.result_digest = completed.result_digest.as_str().to_owned();
            response.status = ExecutionStatus::Completed.into();
        }
        ComputationOutcome::DeadlineExceeded => {
            response.status = ExecutionStatus::DeadlineExceeded.into();
        }
        ComputationOutcome::FuelExhausted => {
            response.status = ExecutionStatus::FuelExhausted.into();
        }
        ComputationOutcome::HostUnavailable => {
            response.status = ExecutionStatus::HostUnavailable.into();
        }
        ComputationOutcome::InterfaceMismatch => {
            response.status = ExecutionStatus::InterfaceMismatch.into();
        }
        ComputationOutcome::MalformedComponent => {
            response.status = ExecutionStatus::MalformedComponent.into();
        }
        ComputationOutcome::MemoryLimitExceeded => {
            response.status = ExecutionStatus::MemoryLimitExceeded.into();
        }
        ComputationOutcome::TrapAfterActionRequest => {
            response.status = ExecutionStatus::TrapAfterActionRequest.into();
        }
        ComputationOutcome::TrapBeforeActionRequest => {
            response.status = ExecutionStatus::TrapBeforeActionRequest.into();
        }
    }
    response
}

fn protocol_limits(limits: ComputationLimits) -> ResourceLimits {
    ResourceLimits {
        deadline_millis: limits.deadline_millis(),
        fuel: limits.fuel(),
        instances: limits.instances() as u64,
        memories: limits.memories() as u64,
        memory_bytes: limits.memory_bytes() as u64,
        table_elements: limits.table_elements() as u64,
        tables: limits.tables() as u64,
        ..Default::default()
    }
}

fn protocol_output(output: CoreComputationOutput) -> ComputationOutput {
    ComputationOutput {
        action: Some(protocol_action(output.action)).into(),
        aggregate: output.aggregate.as_str().to_owned(),
        explanation_complete: output.explanation_complete,
        selected_claim_id: output
            .selected_claim_id
            .map(|claim| claim.as_str().to_owned())
            .unwrap_or_default(),
        selected_values: output.selected_values,
        values_scanned: output.values_scanned,
        ..Default::default()
    }
}

fn protocol_action(action: ProgramActionOutcome) -> ProtocolProgramActionOutcome {
    match action {
        ProgramActionOutcome::AwaitingApproval {
            intent_digest,
            operation_id,
            proposal_id,
        } => ProtocolProgramActionOutcome {
            intent_digest: intent_digest.as_str().to_owned(),
            operation_id: operation_id.as_str().to_owned(),
            proposal_id: proposal_id.as_str().to_owned(),
            status: ProgramActionStatus::AwaitingApproval.into(),
            ..Default::default()
        },
        ProgramActionOutcome::Committed {
            action_id,
            commit_sequence,
            intent_digest,
            operation_id,
            proposal_id,
            recovered,
        } => ProtocolProgramActionOutcome {
            action_id: action_id.as_str().to_owned(),
            commit_sequence: commit_sequence.get(),
            intent_digest: intent_digest.as_str().to_owned(),
            operation_id: operation_id.as_str().to_owned(),
            proposal_id: proposal_id.as_str().to_owned(),
            recovered,
            status: ProgramActionStatus::Committed.into(),
            ..Default::default()
        },
        ProgramActionOutcome::Denied => ProtocolProgramActionOutcome {
            status: ProgramActionStatus::Denied.into(),
            ..Default::default()
        },
        ProgramActionOutcome::NotRequested => ProtocolProgramActionOutcome {
            status: ProgramActionStatus::NotRequested.into(),
            ..Default::default()
        },
    }
}

fn committed_receipt(receipt: zoen_core::CommitReceipt, recovered: bool) -> HostCommitOutcome {
    HostCommitOutcome::Committed {
        action_id: receipt.action_id,
        commit_sequence: receipt.commit_sequence,
        intent_digest: receipt.intent_digest,
        operation_id: receipt.operation_id,
        proposal_id: receipt.proposal_id,
        recovered,
    }
}

fn recovered_receipt(
    receipt: zoen_core::CommitReceipt,
    authorized: &AuthorizedProposal,
) -> Result<HostCommitOutcome, HostCallError> {
    if receipt.intent_digest != authorized.intent_digest
        || receipt.operation_id != authorized.operation_id
        || receipt.proposal_id != authorized.proposal_id
    {
        return Ok(HostCommitOutcome::OperationMismatch);
    }
    Ok(committed_receipt(receipt, true))
}

fn map_action_error(error: ActionError) -> HostCallError {
    let message = error.to_string();
    match error {
        ActionError::DelegationDenied => HostCallError::CapabilityDenied(message),
        ActionError::Store(_) => HostCallError::ProviderUnavailable(message),
        ActionError::ApprovalExpired
        | ActionError::ApprovalOutsideBounds
        | ActionError::Definition(_)
        | ActionError::Evaluation(_)
        | ActionError::ExpiredProposal
        | ActionError::InactiveDefinition
        | ActionError::Input(_) => HostCallError::InvalidRequest(message),
    }
}

fn map_query_error(error: QueryPortError) -> HostCallError {
    match error {
        QueryPortError::Invalid(message) => HostCallError::InvalidRequest(message),
        QueryPortError::Corrupt(message)
        | QueryPortError::Evaluation(message)
        | QueryPortError::Unavailable(message) => HostCallError::ProviderUnavailable(message),
    }
}

fn map_contract_error(error: ComputationContractError) -> ConnectError {
    invalid(error.to_string())
}

fn map_computation_error(error: ComputationError) -> ConnectError {
    let message = error.to_string();
    match error {
        ComputationError::IdentityCollision => ConnectError::new(ErrorCode::AlreadyExists, message),
        ComputationError::Store(_) => ConnectError::new(ErrorCode::Unavailable, message),
    }
}

fn current_time() -> Result<zoen_core::TimestampMicros, HostCallError> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| HostCallError::ProviderUnavailable(error.to_string()))?;
    let micros = i64::try_from(duration.as_micros())
        .map_err(|error| HostCallError::ProviderUnavailable(error.to_string()))?;
    Ok(zoen_core::TimestampMicros::new(micros))
}

fn explanation_digest(
    claim_id: &ClaimId,
    complete: bool,
    gap_count: usize,
) -> ExecutionResultDigest {
    let mut hasher = Sha256::new();
    hasher.update((claim_id.as_str().len() as u64).to_be_bytes());
    hasher.update(claim_id.as_str().as_bytes());
    hasher.update([u8::from(complete)]);
    hasher.update((gap_count as u64).to_be_bytes());
    ExecutionResultDigest::from_sha256(hasher.finalize().into())
}

fn internal(message: impl Into<String>) -> ConnectError {
    ConnectError::new(ErrorCode::Internal, message)
}

#[cfg(test)]
mod tests {
    use super::{ResourceLimits, parse_limits};
    use zoen_engine::ComputationLimits;

    #[test]
    fn parse_limits_accepts_u64_max_as_hint() {
        let requested = ResourceLimits {
            deadline_millis: u64::MAX,
            fuel: u64::MAX,
            instances: u64::MAX,
            memories: u64::MAX,
            memory_bytes: u64::MAX,
            table_elements: u64::MAX,
            tables: u64::MAX,
            ..Default::default()
        };
        let limits = parse_limits(&requested).expect("over-max request remains a hint");
        assert!(limits.fuel() <= ComputationLimits::MAX_FUEL);
    }
}
