wit_bindgen::generate!({
    path: "../../../wit",
    world: "computation",
});

use exports::zoen::code_mode::program::{
    CommittedAction as ProgramCommittedAction, ComputationOutput, Guest, ProgramActionOutcome,
    ProgramError, Proposal as ProgramProposal,
};
use zoen::code_mode::host::{
    self, ActionInput, CommitOutcome, CommitRequest, ExactValue, ExplainRequest, HostError,
    ProposalOutcome, ProposeRequest, QueryRequest, Selection,
};

struct Program;

impl Guest for Program {
    fn run(input: Vec<u8>) -> Result<ComputationOutput, ProgramError> {
        let input = String::from_utf8(input)
            .map_err(|error| ProgramError::InvalidResult(error.to_string()))?;
        let fields = input.split('|').collect::<Vec<_>>();
        let mode = fields.first().copied().unwrap_or_default();
        match mode {
            "pure" => Ok(output(
                ProgramActionOutcome::NotRequested,
                "17".to_owned(),
                None,
                false,
                0,
                0,
            )),
            "spin" => spin(),
            "memory" => exhaust_memory(),
            "trap" => std::process::abort(),
            "missing" => missing_capability(),
            "run" => run_program(&fields),
            _ => Err(ProgramError::InvalidResult(
                "unknown fixture mode".to_owned(),
            )),
        }
    }
}

fn run_program(fields: &[&str]) -> Result<ComputationOutput, ProgramError> {
    if fields.len() != 4 {
        return Err(ProgramError::InvalidResult(
            "run input requires proposal, operation, and threshold".to_owned(),
        ));
    }
    let proposal_id = fields[1].to_owned();
    let operation_id = fields[2].to_owned();
    let threshold = fields[3]
        .parse::<i128>()
        .map_err(|error| ProgramError::InvalidResult(error.to_string()))?;
    let query = host::query(&QueryRequest {
        capability_id: "query.available".to_owned(),
        entity_id: "inventory.item.1".to_owned(),
        selection: Selection::Relation("inventory.available".to_owned()),
    })
    .map_err(program_error)?;
    let values_scanned = u32::try_from(query.values.len())
        .map_err(|error| ProgramError::InvalidResult(error.to_string()))?;
    let mut aggregate = 0_i128;
    let mut selected_claim_id = None;
    let mut selected_values = 0_u32;
    for value in query.values {
        let ExactValue::Integer(integer) = value.value else {
            continue;
        };
        let integer = integer
            .parse::<i128>()
            .map_err(|error| ProgramError::InvalidResult(error.to_string()))?;
        if integer <= threshold {
            continue;
        }
        aggregate = aggregate
            .checked_add(integer)
            .ok_or_else(|| ProgramError::InvalidResult("aggregate overflow".to_owned()))?;
        selected_values = selected_values
            .checked_add(1)
            .ok_or_else(|| ProgramError::InvalidResult("selection count overflow".to_owned()))?;
        if selected_claim_id.is_none() {
            selected_claim_id = value.claim_ids.first().cloned();
        }
    }
    let explanation_complete = match selected_claim_id.as_ref() {
        Some(claim_id) => {
            host::explain(&ExplainRequest {
                capability_id: "explain.selected".to_owned(),
                claim_id: claim_id.clone(),
            })
            .map_err(program_error)?
            .complete
        }
        None => false,
    };
    let proposed = host::propose(&ProposeRequest {
        action_id: "inventory.requestStock".to_owned(),
        capability_id: "action.request-stock".to_owned(),
        inputs: vec![ActionInput {
            id: "quantity".to_owned(),
            value: ExactValue::Integer(aggregate.to_string()),
        }],
        operation_id: operation_id.clone(),
        proposal_id: proposal_id.clone(),
        resource_id: "inventory.item.1".to_owned(),
    })
    .map_err(program_error)?;
    let action = match proposed {
        ProposalOutcome::AwaitingApproval(proposal) => {
            ProgramActionOutcome::AwaitingApproval(ProgramProposal {
                intent_digest: proposal.intent_digest,
                operation_id: proposal.operation_id,
                proposal_id: proposal.proposal_id,
            })
        }
        ProposalOutcome::Ready(proposal) => {
            match host::commit(&CommitRequest {
                capability_id: "action.request-stock".to_owned(),
                intent_digest: proposal.intent_digest,
                operation_id: proposal.operation_id,
                proposal_id: proposal.proposal_id,
            })
            .map_err(program_error)?
            {
                CommitOutcome::Committed(committed) => {
                    ProgramActionOutcome::Committed(ProgramCommittedAction {
                        action_id: committed.action_id,
                        commit_sequence: committed.commit_sequence,
                        intent_digest: committed.intent_digest,
                        operation_id: committed.operation_id,
                        proposal_id: committed.proposal_id,
                        recovered: committed.recovered,
                    })
                }
                CommitOutcome::Denied
                | CommitOutcome::EvaluationError
                | CommitOutcome::IdentityCollision
                | CommitOutcome::OperationMismatch
                | CommitOutcome::Stale => ProgramActionOutcome::Denied,
            }
        }
        ProposalOutcome::Denied
        | ProposalOutcome::EvaluationError
        | ProposalOutcome::PreconditionDenied => ProgramActionOutcome::Denied,
    };
    Ok(output(
        action,
        aggregate.to_string(),
        selected_claim_id,
        explanation_complete,
        selected_values,
        values_scanned,
    ))
}

fn missing_capability() -> Result<ComputationOutput, ProgramError> {
    host::query(&QueryRequest {
        capability_id: "query.missing".to_owned(),
        entity_id: "inventory.item.1".to_owned(),
        selection: Selection::Relation("inventory.available".to_owned()),
    })
    .map_err(program_error)?;
    Err(ProgramError::InvalidResult(
        "missing capability unexpectedly succeeded".to_owned(),
    ))
}

fn spin() -> Result<ComputationOutput, ProgramError> {
    let mut value = 0_u64;
    loop {
        value = std::hint::black_box(value.wrapping_add(1));
    }
}

fn exhaust_memory() -> Result<ComputationOutput, ProgramError> {
    let mut bytes = Vec::new();
    loop {
        bytes.extend_from_slice(&[0_u8; 65_536]);
        std::hint::black_box(&bytes);
    }
}

fn output(
    action: ProgramActionOutcome,
    aggregate: String,
    selected_claim_id: Option<String>,
    explanation_complete: bool,
    selected_values: u32,
    values_scanned: u32,
) -> ComputationOutput {
    ComputationOutput {
        action,
        aggregate,
        explanation_complete,
        selected_claim_id,
        selected_values,
        values_scanned,
    }
}

fn program_error(error: HostError) -> ProgramError {
    match error {
        HostError::CapabilityDenied(capability) => ProgramError::CapabilityDenied(capability),
        HostError::CapabilityUnavailable(capability) => {
            ProgramError::CapabilityUnavailable(capability)
        }
        HostError::InvalidRequest(message) => ProgramError::InvalidResult(message),
        HostError::ProviderUnavailable(message) => ProgramError::HostUnavailable(message),
    }
}

export!(Program);
