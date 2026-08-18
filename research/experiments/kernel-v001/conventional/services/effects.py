from __future__ import annotations

from typing import Any

from services.errors import InputError
from services.history import HistoryService
from services.ledger import Ledger, qualify
from services.authority import attribution_of

RUN_EXAMPLE = "os scenario run v001 --output json"


class EffectService:
    def __init__(self, ledger: Ledger, history: HistoryService) -> None:
        self.ledger = ledger
        self.history = history

    def owns_claim(self, command: dict[str, Any]) -> bool:
        return command.get("predicate_ref") == "remote-booking"

    def record_claim(self, command: dict[str, Any]) -> dict[str, Any]:
        return self.history.record_claim(command)

    def latest_knowledge(self, request_id: str) -> str:
        records = [item for item in self.ledger.all("effect_knowledge") if item["request_id"] == request_id]
        if not records:
            return "not_attempted"
        records.sort(key=lambda item: item["known_revision"])
        return records[-1]["new_knowledge"]

    def retry_allowed(self, knowledge: str) -> tuple[bool, str]:
        if knowledge == "unknown":
            return (False, "unsafe_retry")
        if knowledge == "confirmed":
            return (False, "already_confirmed")
        return (True, "retry_ok")

    def open_request(self, request_id: str, operation_id: str, intent_digest: str, payload: dict[str, Any], revision: str) -> dict[str, Any]:
        request = {
            "request_id": request_id,
            "parent_operation_id": operation_id,
            "effect_ref": "effect.book-carrier",
            "intent_digest": intent_digest,
            "payload": payload,
        }
        self.ledger.put("effect_requests", request_id, request)
        knowledge_id = self.ledger.next_id("ek")
        self.ledger.put(
            "effect_knowledge",
            knowledge_id,
            {
                "record_id": knowledge_id,
                "request_id": request_id,
                "prior_knowledge": "not_attempted",
                "evidence_refs": [],
                "new_knowledge": "not_attempted",
                "known_revision": revision,
            },
        )
        return request

    def attempt(self, command: dict[str, Any]) -> dict[str, Any]:
        request = self.ledger.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", RUN_EXAMPLE)
        knowledge = self.latest_knowledge(request["request_id"])
        allowed, reason = self.retry_allowed(knowledge)
        if knowledge != "not_attempted" and not allowed:
            return {
                "command_type": "RecordEffectAttempt",
                "outcome": reason,
                "known_revision": self.ledger.current_revision(),
                "record_refs": [],
                "details": {"code": reason, "knowledge": knowledge},
            }
        revision = self.ledger.next_revision()
        attempt = {
            "attempt_id": command.get("attempt_id") or self.ledger.next_id("attempt"),
            "request_id": request["request_id"],
            "outcome": command["outcome"],
            "transport_evidence": dict(command.get("transport_evidence") or {}),
        }
        new_knowledge = "unknown" if attempt["outcome"] == "sent_no_response" else attempt["outcome"]
        self.ledger.put("effect_attempts", attempt["attempt_id"], attempt)
        knowledge_id = self.ledger.next_id("ek")
        self.ledger.put(
            "effect_knowledge",
            knowledge_id,
            {
                "record_id": knowledge_id,
                "request_id": request["request_id"],
                "prior_knowledge": knowledge,
                "evidence_refs": [qualify("attempt", attempt["attempt_id"])],
                "new_knowledge": new_knowledge,
                "known_revision": revision,
            },
        )
        link = {
            "link_id": self.ledger.next_id("link"),
            "cause_ref": qualify("effect", request["request_id"]),
            "relation": "attempted-as",
            "consequence_ref": qualify("attempt", attempt["attempt_id"]),
        }
        self.ledger.put("causal_links", link["link_id"], link)
        return {
            "command_type": "RecordEffectAttempt",
            "outcome": new_knowledge,
            "known_revision": revision,
            "record_refs": [qualify("attempt", attempt["attempt_id"]), qualify("link", link["link_id"])],
            "details": {
                "attempt_id": attempt["attempt_id"],
                "knowledge": new_knowledge,
                "outcome": attempt["outcome"],
            },
        }

    def reconcile(self, command: dict[str, Any]) -> dict[str, Any]:
        request = self.ledger.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", RUN_EXAMPLE)
        prior = self.latest_knowledge(request["request_id"])
        evidence_refs = list(command.get("evidence_refs") or [])
        for reference in evidence_refs:
            claim = self.ledger.get("claims", reference)
            if claim is None:
                raise InputError("missing_evidence", f"reconciliation evidence {reference} is not stored", RUN_EXAMPLE)
        resulting = "confirmed" if evidence_refs else "unknown"
        attribution_of(command.get("attribution"))
        revision = self.ledger.next_revision()
        record = {
            "reconciliation_id": command["reconciliation_id"],
            "request_id": request["request_id"],
            "prior_knowledge": prior,
            "resulting_knowledge": resulting,
            "evidence_refs": evidence_refs,
            "known_revision": revision,
        }
        self.ledger.put("reconciliations", record["reconciliation_id"], record)
        knowledge_id = self.ledger.next_id("ek")
        self.ledger.put(
            "effect_knowledge",
            knowledge_id,
            {
                "record_id": knowledge_id,
                "request_id": request["request_id"],
                "prior_knowledge": prior,
                "evidence_refs": evidence_refs,
                "new_knowledge": resulting,
                "known_revision": revision,
            },
        )
        links = [
            {
                "link_id": self.ledger.next_id("link"),
                "cause_ref": qualify("effect", request["request_id"]),
                "relation": "reconciled-by",
                "consequence_ref": qualify("recon", record["reconciliation_id"]),
            }
        ]
        for reference in evidence_refs:
            links.append(
                {
                    "link_id": self.ledger.next_id("link"),
                    "cause_ref": reference,
                    "relation": "evidenced",
                    "consequence_ref": qualify("recon", record["reconciliation_id"]),
                }
            )
        for link in links:
            self.ledger.put("causal_links", link["link_id"], link)
        attempts = [item for item in self.ledger.all("effect_attempts") if item["request_id"] == request["request_id"]]
        return {
            "command_type": "ReconcileEffect",
            "outcome": resulting,
            "known_revision": revision,
            "record_refs": [qualify("recon", record["reconciliation_id"]), *[qualify("link", item["link_id"]) for item in links]],
            "details": {
                "reconciliation_id": record["reconciliation_id"],
                "prior_knowledge": prior,
                "resulting_knowledge": resulting,
                "original_attempts": [{"attempt_id": item["attempt_id"], "outcome": item["outcome"]} for item in attempts],
            },
        }
