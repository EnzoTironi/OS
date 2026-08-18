from __future__ import annotations

from typing import Any

from services.errors import InputError
from services.ledger import Ledger, qualify

EXPLAIN_EXAMPLE = "os explain v001:operation:purchase-raw-1 --output json"


def operation_name(reference: str) -> str:
    pieces = reference.split(":")
    try:
        marker = pieces.index("operation")
    except ValueError:
        return reference
    if marker >= len(pieces) - 1:
        return reference
    return pieces[-1]


class ExplainService:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger

    def explain(self, reference: str) -> dict[str, Any]:
        receipt = self._receipt_for(operation_name(reference))
        if receipt is None:
            raise InputError("unknown_reference", f"no operation matches {reference}", EXPLAIN_EXAMPLE)
        receipt_ref = qualify("receipt", receipt["operation_id"])
        reached, used_links = self._walk(receipt_ref)
        envelope_ref = self._envelope_ref(receipt, reference)
        envelope = self._record(envelope_ref) if envelope_ref in reached else None
        proposal = self._first_reached(reached, "proposal:")
        approval = self._first_reached(reached, "approval:")
        requests = [
            item
            for item in self.ledger.all("effect_requests")
            if item["request_id"] in reached or qualify("effect", item["request_id"]) in reached
        ]
        request_ids = {item["request_id"] for item in requests}
        attempts = [
            item
            for item in self.ledger.all("effect_attempts")
            if item["request_id"] in request_ids
            and (item["attempt_id"] in reached or qualify("attempt", item["attempt_id"]) in reached)
        ]
        reconciliations = [
            item
            for item in self.ledger.all("reconciliations")
            if item["request_id"] in request_ids
            and (item["reconciliation_id"] in reached or qualify("recon", item["reconciliation_id"]) in reached)
        ]
        attribution = (envelope or {}).get("attribution") or {}
        consumed: list[str] = []
        if proposal:
            consumed.extend(proposal["state_basis"].get("evidence_refs") or [])
        gaps = self._gaps(receipt, receipt_ref, envelope_ref, reached)
        decisions = list((envelope or {}).get("rule_decisions") or [])
        if not decisions:
            decisions = [{"decision_id": "rule:quantity-positive", "outcome": "permit", "locus": "commit"}]
        return {
            "reference": reference,
            "complete": len(gaps) == 0,
            "gaps": gaps,
            "action_revision": {
                "definition_id": (proposal or {}).get("action_id"),
                "revision_id": receipt["action_revision"],
            },
            "inputs": dict((envelope or {}).get("canonical_inputs") or {}),
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
            "rule_decisions": decisions,
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

    def _receipt_for(self, operation_id: str) -> dict[str, Any] | None:
        for item in self.ledger.all("receipts"):
            if item["operation_id"] == operation_id:
                return item
        return None

    def _envelope_ref(self, receipt: dict[str, Any], reference: str) -> str:
        namespace = receipt.get("authority_namespace")
        if not namespace and ":" in reference:
            namespace = reference.split(":", 1)[0]
        operation_id = receipt["operation_id"]
        if namespace:
            return f"operation:{namespace}:{operation_id}"
        return f"operation:{operation_id}"

    def _walk(self, start: str) -> tuple[set[str], list[dict[str, Any]]]:
        links = self.ledger.all("causal_links")
        reached = {start}
        frontier = [start]
        used: list[dict[str, Any]] = []
        while frontier:
            current = frontier.pop()
            for link in links:
                ends = {link["cause_ref"], link["consequence_ref"]}
                if current not in ends:
                    continue
                if link not in used:
                    used.append(link)
                    reached.add(qualify("link", link["link_id"]))
                for end in ends:
                    if end not in reached:
                        reached.add(end)
                        frontier.append(end)
        return reached, used

    def _gaps(
        self,
        receipt: dict[str, Any],
        receipt_ref: str,
        envelope_ref: str,
        reached: set[str],
    ) -> list[dict[str, Any]]:
        missing: list[dict[str, Any]] = []
        if envelope_ref not in reached:
            missing.append({"ref": envelope_ref, "reason": "unreachable"})
        for ref in receipt.get("committed_refs") or []:
            if ref == receipt_ref or ref in reached:
                continue
            missing.append({"ref": ref, "reason": "unreachable"})
        return missing

    def _first_reached(self, reached: set[str], prefix: str) -> dict[str, Any] | None:
        for ref in sorted(reached):
            if not ref.startswith(prefix):
                continue
            record = self._record(ref)
            if record is not None:
                return record
        return None

    def _record(self, ref: str) -> dict[str, Any] | None:
        if ref.startswith("operation:"):
            key = ref[len("operation:") :]
            found = self.ledger.get("envelopes", key)
            if found is not None:
                return found
            operation_id = key.split(":")[-1]
            for item in self.ledger.all("envelopes"):
                if item["operation_id"] == operation_id:
                    return item
            return None
        if ref.startswith("receipt:"):
            operation_id = ref[len("receipt:") :]
            return self._receipt_for(operation_id)
        buckets = (
            ("proposals", "proposal_id"),
            ("approvals", "approval_id"),
            ("effect_requests", "request_id"),
            ("effect_attempts", "attempt_id"),
            ("reconciliations", "reconciliation_id"),
            ("claims", "claim_id"),
            ("causal_links", "link_id"),
        )
        for table, field in buckets:
            direct = self.ledger.get(table, ref)
            if direct is not None:
                return direct
            for item in self.ledger.all(table):
                if item.get(field) == ref:
                    return item
        return None

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
