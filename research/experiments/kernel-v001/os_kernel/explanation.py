from __future__ import annotations

from typing import Any

from os_kernel.errors import InputError
from os_kernel.store import Store


def explain(store: Store, reference: str) -> dict[str, Any]:
    operation_id = reference
    if ":" in reference:
        parts = reference.split(":")
        if parts[-2:] == ["operation", parts[-1]] or "operation" in parts:
            operation_id = parts[-1]
            if parts[-2] != "operation":
                operation_id = parts[-1]
    receipt = None
    for item in store.all("receipts"):
        if item.operation_id == operation_id or reference.endswith(item.operation_id):
            receipt = item
            break
    if receipt is None:
        raise InputError(
            "unknown_reference",
            f"no operation matches {reference}",
            "os explain v001:operation:purchase-raw-1 --output json",
        )
    envelope = store.envelope_for(receipt.authority_namespace, receipt.operation_id)
    proposal = store.get("proposals", envelope.proposal_ref) if envelope else None
    approval = store.get("approvals", envelope.approval_ref) if envelope else None
    links = [item for item in store.all("causal_links") if receipt.operation_id in (item.cause_ref, item.consequence_ref) or f"receipt:{receipt.operation_id}" in (item.cause_ref, item.consequence_ref)]
    decisions = [item for item in store.all("rule_decisions") if item.basis_ref and envelope]
    requests = [item for item in store.all("effect_requests") if item.parent_operation_id == receipt.operation_id]
    attempts = [item for item in store.all("effect_attempts") if any(req.request_id == item.request_id for req in requests)]
    reconciliations = [item for item in store.all("reconciliations") if any(req.request_id == item.request_id for req in requests)]
    consumed = []
    if proposal is not None:
        for dep in proposal.state_basis.dependencies:
            consumed.extend(dep.evidence_refs)
    graph = {
        "reference": reference,
        "action_revision": {
            "definition_id": receipt.action_ref.definition_id,
            "revision_id": receipt.action_ref.revision_id,
            "definition_digest": receipt.action_ref.definition_digest,
        },
        "inputs": envelope.canonical_inputs if envelope else {},
        "actor_id": envelope.attribution.actor_id if envelope else None,
        "represented_principal_id": envelope.attribution.represented_principal_id if envelope else None,
        "workload_id": envelope.attribution.workload_id if envelope else None,
        "delegation_id": envelope.attribution.delegation_id if envelope else None,
        "proposal": {
            "proposal_id": proposal.proposal_id,
            "intent_digest": proposal.intent_digest,
            "preview_plan": proposal.preview_plan,
            "state_basis": {
                "basis_id": proposal.state_basis.basis_id,
                "digest": proposal.state_basis.digest,
                "dependencies": [
                    {
                        "dependency_id": dep.dependency_id,
                        "evaluated_value": dep.evaluated_value,
                        "evidence_refs": list(dep.evidence_refs),
                    }
                    for dep in proposal.state_basis.dependencies
                ],
            },
        }
        if proposal
        else None,
        "approval": {
            "approval_id": approval.approval_id,
            "proposal_digest": approval.proposal_digest,
            "approved_bounds": approval.approved_bounds,
            "state_basis_ref": approval.state_basis_ref,
        }
        if approval
        else None,
        "state_basis": {
            "proposal_digest": receipt.proposal_basis_digest,
            "commit_digest": receipt.commit_basis_digest,
            "stale": receipt.stale,
        },
        "rule_decisions": [
            {
                "decision_id": item.decision_id,
                "outcome": item.outcome,
                "rule_ref": item.rule_ref.definition_id,
                "locus": item.locus,
            }
            for item in decisions
        ],
        "claims_consumed": sorted(set(consumed)),
        "mutation_plan": receipt.result,
        "operation_receipt": {
            "operation_id": receipt.operation_id,
            "outcome": receipt.outcome,
            "commit_revision": receipt.commit_revision,
            "committed_quantity": receipt.committed_quantity,
            "committed_refs": list(receipt.committed_refs),
        },
        "effect_requests": [
            {
                "request_id": item.request_id,
                "effect_ref": item.effect_ref.definition_id,
                "payload": item.payload,
            }
            for item in requests
        ],
        "effect_attempts": [
            {
                "attempt_id": item.attempt_id,
                "request_id": item.request_id,
                "outcome": item.outcome,
                "transport_evidence": item.transport_evidence,
            }
            for item in attempts
        ],
        "reconciliation_records": [
            {
                "reconciliation_id": item.reconciliation_id,
                "request_id": item.request_id,
                "prior_knowledge": item.prior_knowledge,
                "resulting_knowledge": item.resulting_knowledge,
                "evidence_refs": list(item.evidence_refs),
            }
            for item in reconciliations
        ],
        "causal_links": [
            {
                "link_id": item.link_id,
                "cause_ref": item.cause_ref,
                "relation": item.relation,
                "consequence_ref": item.consequence_ref,
            }
            for item in links
        ],
    }
    return graph
