from __future__ import annotations

from typing import Any

from os_kernel.errors import InputError
from os_kernel.store import Store
from os_kernel.validation import parse_ref, qualify, resolve_protocol_ref


def _operation_id(reference: str) -> str:
    operation_id = reference
    if ":" in reference:
        parts = reference.split(":")
        if "operation" in parts:
            operation_id = parts[-1]
    return operation_id


def _ref_of(kind: str, identifier: str) -> str:
    return qualify(kind, identifier)


def _neighbors(kind: str, record: Any) -> list[str]:
    if kind == "receipt":
        return list(record.committed_refs)
    if kind == "approval":
        return [_ref_of("proposal", record.proposal_ref), _ref_of("basis", record.state_basis_ref)]
    if kind == "proposal":
        return [_ref_of("basis", record.state_basis.basis_id)]
    if kind == "effect":
        return [_ref_of("receipt", record.parent_operation_id)]
    if kind == "attempt":
        return [_ref_of("effect", record.request_id)]
    if kind == "recon":
        return [_ref_of("effect", record.request_id), *list(record.evidence_refs)]
    if kind == "rule":
        return [_ref_of("basis", record.basis_ref)]
    return []


def _kind_of(reference: str) -> str:
    return parse_ref(reference)[0]


def explain(store: Store, reference: str) -> dict[str, Any]:
    operation_id = _operation_id(reference)
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
    receipt_ref = _ref_of("receipt", receipt.operation_id)
    links = store.all("causal_links")
    reached: set[str] = {receipt_ref}
    frontier = [receipt_ref]
    used_links: list[Any] = []
    while frontier:
        current = frontier.pop()
        for link in links:
            ends = {link.cause_ref, link.consequence_ref}
            if current not in ends:
                continue
            if link not in used_links:
                used_links.append(link)
                reached.add(_ref_of("link", link.link_id))
            for end in ends:
                if end not in reached:
                    reached.add(end)
                    frontier.append(end)
    resolved: dict[str, Any] = {receipt_ref: receipt}
    gaps: list[dict[str, Any]] = []
    for item in sorted(reached):
        if item == receipt_ref:
            continue
        try:
            resolved[item] = resolve_protocol_ref(store, item)
        except InputError as exc:
            gaps.append({"ref": item, "reason": exc.code})
    for item, record in list(resolved.items()):
        try:
            kind = _kind_of(item)
        except InputError:
            continue
        for neighbor in _neighbors(kind, record):
            if neighbor not in reached:
                gaps.append({"ref": neighbor, "reason": "unreachable", "from": item})
    proposal_ref = next((item for item in reached if item.startswith("proposal:")), None)
    approval_ref = next((item for item in reached if item.startswith("approval:")), None)
    proposal = resolved.get(proposal_ref) if proposal_ref else None
    approval = resolved.get(approval_ref) if approval_ref else None
    decisions = [resolved[item] for item in reached if item.startswith("rule:") and item in resolved]
    requests = [resolved[item] for item in reached if item.startswith("effect:") and item in resolved]
    attempts = [resolved[item] for item in reached if item.startswith("attempt:") and item in resolved]
    reconciliations = [resolved[item] for item in reached if item.startswith("recon:") and item in resolved]
    consumed: list[str] = []
    if proposal is not None:
        for dep in proposal.state_basis.dependencies:
            consumed.extend(dep.evidence_refs)
    graph = {
        "reference": reference,
        "complete": not gaps,
        "gaps": gaps,
        "action_revision": {
            "definition_id": receipt.action_ref.definition_id,
            "revision_id": receipt.action_ref.revision_id,
            "definition_digest": receipt.action_ref.definition_digest,
        },
        "inputs": _inputs(store, receipt, reached, resolved),
        "actor_id": _attribution_field(store, receipt, reached, resolved, "actor_id"),
        "represented_principal_id": _attribution_field(store, receipt, reached, resolved, "represented_principal_id"),
        "workload_id": _attribution_field(store, receipt, reached, resolved, "workload_id"),
        "delegation_id": _attribution_field(store, receipt, reached, resolved, "delegation_id"),
        "proposal": _proposal_view(proposal) if proposal is not None else None,
        "approval": _approval_view(approval) if approval is not None else None,
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
            for item in used_links
        ],
    }
    return graph


def _inputs(store: Store, receipt: Any, reached: set[str], resolved: dict[str, Any]) -> Any:
    envelope = store.envelope_for(receipt.authority_namespace, receipt.operation_id)
    if envelope is None:
        return {}
    return envelope.canonical_inputs


def _attribution_field(store: Store, receipt: Any, reached: set[str], resolved: dict[str, Any], name: str) -> Any:
    envelope = store.envelope_for(receipt.authority_namespace, receipt.operation_id)
    if envelope is None:
        return None
    return getattr(envelope.attribution, name)


def _proposal_view(proposal: Any) -> dict[str, Any]:
    return {
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


def _approval_view(approval: Any) -> dict[str, Any]:
    return {
        "approval_id": approval.approval_id,
        "proposal_digest": approval.proposal_digest,
        "approved_bounds": approval.approved_bounds,
        "state_basis_ref": approval.state_basis_ref,
    }
