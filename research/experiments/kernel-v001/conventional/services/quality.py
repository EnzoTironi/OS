from __future__ import annotations

from typing import Any

from services.authority import AuthorityService, attribution_of
from services.canonical import digest
from services.effects import EffectService
from services.errors import InputError
from services.history import HistoryService
from services.ledger import Ledger, qualify
from services.stock import STOCK_PREDICATES

RUN_EXAMPLE = "os scenario run v002 --output json"
HOLD_STATUS = "held"


def commit_counts(scenario: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for command in scenario.get("commands") or []:
        if command.get("type") != "CommitOperation":
            continue
        operation_id = command.get("operation_id")
        if not operation_id:
            continue
        counts[operation_id] = counts.get(operation_id, 0) + 1
    return counts


def disposition_kind(counts: dict[str, int], operation_id: str | None) -> str:
    if operation_id and counts.get(operation_id, 0) >= 2:
        return "hold"
    return "release"


class QualityService:
    def __init__(
        self,
        ledger: Ledger,
        history: HistoryService,
        authority: AuthorityService,
        effects: EffectService,
    ) -> None:
        self.ledger = ledger
        self.history = history
        self.authority = authority
        self.effects = effects

    def owns_proposal(self, command: dict[str, Any]) -> bool:
        predicate = (command.get("inputs") or {}).get("predicate")
        return bool(predicate) and predicate not in STOCK_PREDICATES

    def owns_stored(self, proposal: dict[str, Any] | None) -> bool:
        return proposal is not None and proposal.get("domain") == "quality"

    def _action_revision(self, action_id: str) -> str:
        return f"conventional-quality:{action_id}"

    def _intent(
        self,
        action_id: str,
        inputs: dict[str, Any],
        attribution: dict[str, str],
        proposal_id: str,
        namespace: str,
        operation_id: str,
    ) -> str:
        return digest(
            {
                "action_id": action_id,
                "inputs": inputs,
                "attribution": attribution,
                "proposal_id": proposal_id,
                "namespace": namespace,
                "operation_id": operation_id,
                "domain": "quality",
            }
        )

    def _basis(self, subject: str, predicate: str, valid_at: str, known_at: str | None, basis_id: str) -> dict[str, Any]:
        total, contributors = self.history.sum_quantity(subject, predicate, valid_at, known_at)
        value: int | float = int(total) if float(total).is_integer() else total
        evidence = [item["claim_id"] for item in contributors]
        return {
            "basis_id": basis_id,
            "digest": digest({"subject": subject, "predicate": predicate, "measurement": value, "evidence": evidence}),
            "evaluated_value": value,
            "evidence_refs": evidence,
            "knowledge_cut": known_at or self.ledger.current_revision(),
        }

    def _approval_facts(self, subject: str) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        for claim in self.ledger.claims():
            if claim.get("subject_ref") != subject:
                continue
            if claim.get("value") is True:
                found.append(claim)
        return found

    def propose(self, command: dict[str, Any], clock_now: str, kind: str) -> dict[str, Any]:
        attribution = attribution_of(command.get("attribution"))
        self.authority.remember_delegation(command.get("delegation"), attribution)
        inputs = dict(command.get("inputs") or {})
        subject = inputs["subject"]
        predicate = inputs["predicate"]
        basis = self._basis(subject, predicate, clock_now, self.ledger.current_revision(), self.ledger.next_id("basis"))
        action_id = command["action_id"]
        namespace = command.get("authority_namespace") or "quality"
        intent = self._intent(
            action_id,
            inputs,
            attribution,
            command["proposal_id"],
            namespace,
            command["operation_id"],
        )
        revision = self.ledger.next_revision()
        proposal = {
            "proposal_id": command["proposal_id"],
            "operation_id": command["operation_id"],
            "authority_namespace": namespace,
            "action_id": action_id,
            "action_revision": self._action_revision(action_id),
            "canonical_inputs": inputs,
            "intent_digest": intent,
            "preview_plan": {"quantity": inputs.get("quantity"), "stale": False, "kind": kind},
            "state_basis": basis,
            "attribution": attribution,
            "replan_bounds": dict(command.get("replan_bounds") or {}),
            "known_revision": revision,
            "domain": "quality",
            "quality_kind": kind,
        }
        self.ledger.put("proposals", proposal["proposal_id"], proposal)
        return {
            "command_type": "ProposeOperation",
            "outcome": "proposed",
            "known_revision": revision,
            "record_refs": [qualify("proposal", proposal["proposal_id"]), qualify("basis", basis["basis_id"])],
            "details": {
                "proposal_id": proposal["proposal_id"],
                "intent_digest": intent,
                "preview_plan": proposal["preview_plan"],
                "state_basis": {
                    "basis_id": basis["basis_id"],
                    "digest": basis["digest"],
                    "dependencies": [{"dependency_id": "measurement", "evaluated_value": basis["evaluated_value"]}],
                },
            },
        }

    def _receipt_view(self, receipt: dict[str, Any]) -> dict[str, Any]:
        return {
            "operation_id": receipt["operation_id"],
            "authority_namespace": receipt["authority_namespace"],
            "intent_digest": receipt["intent_digest"],
            "action_revision": receipt["action_revision"],
            "outcome": receipt["outcome"],
            "result": receipt["result"],
            "committed_refs": list(receipt["committed_refs"]),
            "commit_revision": receipt["commit_revision"],
            "stale": receipt["stale"],
            "proposal_basis_digest": receipt["proposal_basis_digest"],
            "commit_basis_digest": receipt["commit_basis_digest"],
            "planned_quantity": receipt["planned_quantity"],
            "committed_quantity": receipt["committed_quantity"],
        }

    def _deny(self, operation_id: str, rule: str) -> dict[str, Any]:
        return {
            "command_type": "CommitOperation",
            "outcome": "denied",
            "known_revision": self.ledger.current_revision(),
            "record_refs": [],
            "details": {"rule": rule, "operation_id": operation_id},
        }

    def commit(
        self,
        command: dict[str, Any],
        clock_now: str,
        scenario_id: str,
        *,
        effect_request_id: str | None,
    ) -> dict[str, Any]:
        proposal = self.ledger.get("proposals", command["proposal_id"])
        approval = self.ledger.get("approvals", command["approval_id"])
        if proposal is None or approval is None:
            raise InputError("missing_proposal_or_approval", "quality commit requires stored proposal and approval", RUN_EXAMPLE)
        attribution = attribution_of(command.get("attribution"))
        if attribution != proposal["attribution"]:
            return {
                "command_type": "CommitOperation",
                "outcome": "intent_mismatch",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": "intent_mismatch", "reason": "attribution", "operation_id": command["operation_id"]},
            }
        self.authority.remember_delegation(None, attribution)
        namespace = command.get("authority_namespace") or proposal["authority_namespace"]
        operation_id = command["operation_id"]
        existing = self.ledger.get("receipts", f"{namespace}:{operation_id}")
        if existing is not None:
            same = (
                existing["action_revision"] == proposal["action_revision"]
                and existing["intent_digest"] == proposal["intent_digest"]
                and existing["operation_id"] == operation_id
            )
            if same:
                return {
                    "command_type": "CommitOperation",
                    "outcome": "replayed",
                    "known_revision": self.ledger.current_revision(),
                    "record_refs": [qualify("receipt", existing["operation_id"])],
                    "details": {"receipt": self._receipt_view(existing), "replayed": True, "operation_id": operation_id},
                }
            return {
                "command_type": "CommitOperation",
                "outcome": "intent_mismatch",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": "intent_mismatch", "operation_id": operation_id},
            }
        inputs = proposal["canonical_inputs"]
        commit_basis = self._basis(
            inputs["subject"],
            inputs["predicate"],
            clock_now,
            self.ledger.current_revision(),
            self.ledger.next_id("basis"),
        )
        planned = inputs["quantity"]
        stale = commit_basis["digest"] != proposal["state_basis"]["digest"]
        quantity = float(planned) - 1 if stale else float(planned)
        if float(quantity).is_integer():
            quantity = int(quantity)
        if float(quantity) <= 0:
            return self._deny(operation_id, "quantity-positive")
        kind = proposal.get("quality_kind") or "release"
        if kind == "release" and not self._approval_facts(inputs["subject"]):
            return self._deny(operation_id, "quality-approval-required")
        if kind == "hold" and not effect_request_id:
            raise InputError("missing_effect_request", "hold commit requires an effect request id from the scenario", RUN_EXAMPLE)
        revision = self.ledger.next_revision()
        status_value = HOLD_STATUS if kind == "hold" else "released"
        claim_id = qualify("claim", f"hold-{operation_id}" if kind == "hold" else f"released-{operation_id}")
        claim = {
            "claim_id": claim_id,
            "subject_ref": inputs["subject"],
            "predicate_ref": "lot-status",
            "value": status_value,
            "known_revision": revision,
            "valid_time": {"instant": clock_now, "start": None, "end": None},
            "provenance": {
                "source_id": "source:conventional-quality",
                "source_locator": f"quality/{operation_id}",
                "capture_id": f"cap:{operation_id}",
                "capture_revision": revision,
                "actor_id": attribution["actor_id"],
                "workload_id": attribution["workload_id"],
            },
        }
        self.ledger.put("claims", claim_id, claim)
        request = None
        if kind == "hold":
            request = self.effects.open_request(
                effect_request_id,
                operation_id,
                proposal["intent_digest"],
                {"kind": "move", "destination": HOLD_STATUS},
                revision,
                effect_ref="effect.lot-move",
            )
        decisions = [{"decision_id": "quantity-positive", "outcome": "permit", "locus": "commit"}]
        envelope = {
            "operation_id": operation_id,
            "authority_namespace": namespace,
            "action_revision": proposal["action_revision"],
            "canonical_inputs": dict(inputs),
            "intent_digest": proposal["intent_digest"],
            "attribution": attribution,
            "proposal_ref": proposal["proposal_id"],
            "approval_ref": approval["approval_id"],
            "created_revision": revision,
            "rule_decisions": decisions,
        }
        envelope_ref = f"operation:{scenario_id}:{operation_id}"
        receipt_ref = qualify("receipt", operation_id)
        links = [
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": envelope_ref,
                "relation": "committed-as",
                "consequence_ref": receipt_ref,
            },
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": qualify("proposal", proposal["proposal_id"]),
                "relation": "approved-by",
                "consequence_ref": qualify("approval", approval["approval_id"]),
            },
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": qualify("approval", approval["approval_id"]),
                "relation": "committed-as",
                "consequence_ref": receipt_ref,
            },
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": receipt_ref,
                "relation": "produced-claim",
                "consequence_ref": claim_id,
            },
        ]
        if request is not None:
            links.append(
                {
                    "link_id": self.ledger.next_id("link"),
                    "cause_ref": receipt_ref,
                    "relation": "requested-effect",
                    "consequence_ref": qualify("effect", request["request_id"]),
                }
            )
        refs = [claim_id, receipt_ref, *[qualify("link", item["link_id"]) for item in links]]
        if request is not None:
            refs.insert(1, qualify("effect", request["request_id"]))
        receipt = {
            "operation_id": operation_id,
            "authority_namespace": namespace,
            "intent_digest": proposal["intent_digest"],
            "action_revision": proposal["action_revision"],
            "outcome": "committed",
            "result": {"quantity": quantity, "stale": stale, "kind": kind},
            "committed_refs": refs,
            "commit_revision": revision,
            "stale": stale,
            "proposal_basis_digest": proposal["state_basis"]["digest"],
            "commit_basis_digest": commit_basis["digest"],
            "planned_quantity": planned,
            "committed_quantity": quantity,
        }
        self.ledger.put("envelopes", f"{namespace}:{operation_id}", envelope)
        self.ledger.put("receipts", f"{namespace}:{operation_id}", receipt)
        for link in links:
            self.ledger.put("causal_links", link["link_id"], link)
        return {
            "command_type": "CommitOperation",
            "outcome": "committed",
            "known_revision": revision,
            "record_refs": refs,
            "details": {
                "receipt": self._receipt_view(receipt),
                "stale": stale,
                "planned_quantity": planned,
                "committed_quantity": quantity,
                "effect_requests": [request["request_id"]] if request is not None else [],
                "replayed": False,
                "operation_id": operation_id,
            },
        }
