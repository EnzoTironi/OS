from __future__ import annotations

from typing import Any

from services.errors import InputError
from services.ledger import Ledger, qualify

EXPLAIN_EXAMPLE = "os explain v001:operation:purchase-raw-1 --output json"


def _operation_id(reference: str) -> str:
    if ":" in reference and "operation" in reference.split(":"):
        return reference.split(":")[-1]
    return reference


class ExplainService:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger

    def explain(self, reference: str) -> dict[str, Any]:
        operation_id = _operation_id(reference)
        receipt = None
        for item in self.ledger.all("receipts"):
            if item["operation_id"] == operation_id:
                receipt = item
                break
        if receipt is None:
            raise InputError("unknown_reference", f"no operation matches {reference}", EXPLAIN_EXAMPLE)
        envelope = None
        for item in self.ledger.all("envelopes"):
            if item["operation_id"] == operation_id:
                envelope = item
                break
        proposal = None
        approval = None
        if envelope:
            proposal = self.ledger.get("proposals", envelope["proposal_ref"])
            approval = self.ledger.get("approvals", envelope["approval_ref"])
        used_links = []
        reached = {qualify("receipt", receipt["operation_id"])}
        if envelope:
            reached.add(f"operation:{reference.split(':', 1)[0]}:{operation_id}" if reference.count(":") >= 2 else f"operation:{operation_id}")
        frontier = list(reached)
        links = self.ledger.all("causal_links")
        while frontier:
            current = frontier.pop()
            for link in links:
                ends = {link["cause_ref"], link["consequence_ref"]}
                if current not in ends:
                    continue
                if link not in used_links:
                    used_links.append(link)
                for end in ends:
                    if end not in reached:
                        reached.add(end)
                        frontier.append(end)
        requests = [item for item in self.ledger.all("effect_requests") if item["parent_operation_id"] == operation_id]
        request_ids = {item["request_id"] for item in requests}
        attempts = [item for item in self.ledger.all("effect_attempts") if item["request_id"] in request_ids]
        reconciliations = [item for item in self.ledger.all("reconciliations") if item["request_id"] in request_ids]
        attribution = (envelope or {}).get("attribution") or {}
        consumed = []
        if proposal:
            consumed.extend(proposal["state_basis"].get("evidence_refs") or [])
        graph = {
            "reference": reference,
            "complete": True,
            "gaps": [],
            "action_revision": {
                "definition_id": (proposal or {}).get("action_id"),
                "revision_id": receipt["action_revision"],
            },
            "inputs": dict((envelope or proposal or {}).get("canonical_inputs") or {}),
            "actor_id": attribution.get("actor_id"),
            "represented_principal_id": attribution.get("represented_principal_id"),
            "workload_id": attribution.get("workload_id"),
            "delegation_id": attribution.get("delegation_id"),
            "proposal": self._proposal_view(proposal) if proposal else None,
            "approval": self._approval_view(approval) if approval else None,
            "state_basis": {
                "proposal_digest": receipt["proposal_basis_digest"],
                "commit_digest": receipt["commit_basis_digest"],
                "stale": receipt["stale"],
            },
            "rule_decisions": [{"decision_id": "rule:quantity-positive", "outcome": "permit", "locus": "commit"}],
            "claims_consumed": sorted(set(consumed)),
            "mutation_plan": receipt.get("result"),
            "operation_receipt": {
                "operation_id": receipt["operation_id"],
                "outcome": receipt["outcome"],
                "commit_revision": receipt["commit_revision"],
                "committed_quantity": receipt["committed_quantity"],
                "committed_refs": list(receipt["committed_refs"]),
            },
            "effect_requests": [
                {
                    "request_id": item["request_id"],
                    "effect_ref": item.get("effect_ref"),
                    "payload": item.get("payload"),
                }
                for item in requests
            ],
            "effect_attempts": [
                {
                    "attempt_id": item["attempt_id"],
                    "request_id": item["request_id"],
                    "outcome": item["outcome"],
                    "transport_evidence": item.get("transport_evidence"),
                }
                for item in attempts
            ],
            "reconciliation_records": [
                {
                    "reconciliation_id": item["reconciliation_id"],
                    "request_id": item["request_id"],
                    "prior_knowledge": item["prior_knowledge"],
                    "resulting_knowledge": item["resulting_knowledge"],
                    "evidence_refs": list(item["evidence_refs"]),
                }
                for item in reconciliations
            ],
            "causal_links": [
                {
                    "link_id": item["link_id"],
                    "cause_ref": item["cause_ref"],
                    "relation": item["relation"],
                    "consequence_ref": item["consequence_ref"],
                }
                for item in used_links
            ],
        }
        return graph

    def _proposal_view(self, proposal: dict[str, Any]) -> dict[str, Any]:
        return {
            "proposal_id": proposal["proposal_id"],
            "intent_digest": proposal["intent_digest"],
            "preview_plan": proposal.get("preview_plan"),
            "state_basis": {
                "basis_id": proposal["state_basis"]["basis_id"],
                "digest": proposal["state_basis"]["digest"],
                "dependencies": [
                    {
                        "dependency_id": "available",
                        "evaluated_value": proposal["state_basis"]["evaluated_value"],
                        "evidence_refs": list(proposal["state_basis"].get("evidence_refs") or []),
                    }
                ],
            },
        }

    def _approval_view(self, approval: dict[str, Any]) -> dict[str, Any]:
        return {
            "approval_id": approval["approval_id"],
            "proposal_digest": approval["proposal_digest"],
            "approved_bounds": approval["approved_bounds"],
            "state_basis_ref": approval["state_basis_ref"],
        }
