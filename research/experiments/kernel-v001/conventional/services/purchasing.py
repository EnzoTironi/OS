from __future__ import annotations

from typing import Any

from services.authority import AuthorityService, attribution_of
from services.canonical import digest
from services.effects import EffectService
from services.errors import InputError
from services.ledger import Ledger, qualify
from services.stock import StockService

RUN_EXAMPLE = "os scenario run v001 --output json"
CARRIER_REQUEST_ID = "effect:book-carrier-1"
COMMITTED_PREDICATE = "committed-purchase-quantity"


def _bound(bounds: dict[str, Any]) -> float | None:
    if "max_quantity" in bounds:
        return float(bounds["max_quantity"])
    return None


class PurchasingService:
    def __init__(
        self,
        ledger: Ledger,
        stock: StockService,
        authority: AuthorityService,
        effects: EffectService,
    ) -> None:
        self.ledger = ledger
        self.stock = stock
        self.authority = authority
        self.effects = effects

    def _action_revision(self, action_id: str) -> str:
        return f"conventional:{action_id}"

    def _intent_digest(
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
            }
        )

    def _basis(self, subject: str, predicate: str, valid_at: str, known_at: str | None, basis_id: str) -> dict[str, Any]:
        available, evidence = self.stock.available(subject, predicate, valid_at, known_at)
        value: int | float = int(available) if float(available).is_integer() else available
        return {
            "basis_id": basis_id,
            "digest": digest({"subject": subject, "predicate": predicate, "available": value, "evidence": evidence}),
            "evaluated_value": value,
            "evidence_refs": evidence,
            "knowledge_cut": known_at or self.ledger.current_revision(),
        }

    def propose(self, command: dict[str, Any], clock_now: str) -> dict[str, Any]:
        attribution = attribution_of(command.get("attribution"))
        self.authority.remember_delegation(command.get("delegation"), attribution)
        inputs = dict(command.get("inputs") or {})
        subject = inputs["subject"]
        predicate = inputs["predicate"]
        basis = self._basis(subject, predicate, clock_now, self.ledger.current_revision(), self.ledger.next_id("basis"))
        action_id = command["action_id"]
        namespace = command.get("authority_namespace") or "v001"
        intent = self._intent_digest(
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
            "preview_plan": {"quantity": inputs.get("quantity"), "stale": False},
            "state_basis": basis,
            "attribution": attribution,
            "replan_bounds": dict(command.get("replan_bounds") or {}),
            "known_revision": revision,
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
                    "dependencies": [{"dependency_id": "available", "evaluated_value": basis["evaluated_value"]}],
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

    def commit(self, command: dict[str, Any], clock_now: str, scenario_id: str) -> dict[str, Any]:
        proposal = self.ledger.get("proposals", command["proposal_id"])
        approval = self.ledger.get("approvals", command["approval_id"])
        if proposal is None or approval is None:
            raise InputError("missing_proposal_or_approval", "commit requires stored proposal and approval", RUN_EXAMPLE)
        attribution = attribution_of(command.get("attribution"))
        if attribution != proposal["attribution"]:
            return {
                "command_type": "CommitOperation",
                "outcome": "intent_mismatch",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": "intent_mismatch", "reason": "attribution"},
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
                    "details": {"receipt": self._receipt_view(existing), "replayed": True},
                }
            return {
                "command_type": "CommitOperation",
                "outcome": "intent_mismatch",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": "intent_mismatch"},
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
        if stale:
            delta = float(commit_basis["evaluated_value"]) - float(proposal["state_basis"]["evaluated_value"])
            quantity = float(planned) - delta
        else:
            quantity = float(planned)
        if quantity.is_integer():
            quantity = int(quantity)
        bound = _bound(approval.get("approved_bounds") or {})
        if bound is not None and float(quantity) > bound:
            return {
                "command_type": "CommitOperation",
                "outcome": "needs_reproposal",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": "needs_reproposal", "quantity": quantity, "bound": bound},
            }
        if float(quantity) <= 0:
            return {
                "command_type": "CommitOperation",
                "outcome": "denied",
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"rule": "quantity-positive"},
            }
        revision = self.ledger.next_revision()
        claim_id = qualify("claim", f"committed-{operation_id}")
        claim = {
            "claim_id": claim_id,
            "subject_ref": inputs["subject"],
            "predicate_ref": COMMITTED_PREDICATE,
            "value": quantity,
            "known_revision": revision,
            "valid_time": {"instant": clock_now, "start": None, "end": None},
            "provenance": {
                "source_id": "source:conventional-purchasing",
                "source_locator": f"purchase/{operation_id}",
                "capture_id": f"cap:{operation_id}",
                "capture_revision": revision,
                "actor_id": attribution["actor_id"],
                "workload_id": attribution["workload_id"],
            },
        }
        self.ledger.put("claims", claim_id, claim)
        request = self.effects.open_request(
            CARRIER_REQUEST_ID,
            operation_id,
            proposal["intent_digest"],
            {"kind": "pickup"},
            revision,
        )
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
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": receipt_ref,
                "relation": "requested-effect",
                "consequence_ref": qualify("effect", request["request_id"]),
            },
        ]
        refs = [claim_id, qualify("effect", request["request_id"]), receipt_ref, *[qualify("link", item["link_id"]) for item in links]]
        receipt = {
            "operation_id": operation_id,
            "authority_namespace": namespace,
            "intent_digest": proposal["intent_digest"],
            "action_revision": proposal["action_revision"],
            "outcome": "committed",
            "result": {"quantity": quantity, "stale": stale},
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
                "effect_requests": [request["request_id"]],
                "replayed": False,
            },
        }
