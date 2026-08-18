from __future__ import annotations

from typing import Any

from services.history import HistoryService
from services.ledger import Ledger, qualify


STOCK_PREDICATES = {"available-quantity", "demand-quantity"}


class StockService:
    def __init__(self, ledger: Ledger, history: HistoryService) -> None:
        self.ledger = ledger
        self.history = history

    def owns_claim(self, command: dict[str, Any]) -> bool:
        return command.get("predicate_ref") in STOCK_PREDICATES

    def record_claim(self, command: dict[str, Any]) -> dict[str, Any]:
        return self.history.record_claim(command)

    def available(self, subject: str, predicate: str, valid_at: str, known_at: str | None) -> tuple[float, list[str]]:
        total, contributors = self.history.sum_quantity(subject, predicate, valid_at, known_at)
        return total, [item["claim_id"] for item in contributors]

    def record_receipt(self, command: dict[str, Any]) -> dict[str, Any]:
        revision = self.ledger.next_revision()
        payload = dict(command.get("payload") or {})
        occurrence = {
            "occurrence_id": command["occurrence_id"],
            "occurrence_ref": ((command.get("occurrence_ref") or {}).get("definition_id")),
            "known_revision": revision,
            "causal_operation_ref": command.get("causal_operation_ref"),
            "valid_time": command.get("valid_time") or {},
            "payload": payload,
            "provenance": dict(command.get("provenance") or {}),
        }
        self.ledger.put("occurrences", occurrence["occurrence_id"], occurrence)
        refs = [qualify("occurrence", occurrence["occurrence_id"])]
        signed = payload.get("signed")
        if payload.get("claim_id") and payload.get("subject") and payload.get("predicate") and signed is not None:
            claim_command = {
                "claim_id": payload["claim_id"],
                "subject_ref": payload["subject"],
                "predicate_ref": payload["predicate"],
                "value": signed,
                "valid_time": command.get("valid_time") or {"instant": command.get("clock_time")},
                "provenance": command.get("provenance") or {},
            }
            claim = {
                "claim_id": claim_command["claim_id"],
                "subject_ref": claim_command["subject_ref"],
                "predicate_ref": claim_command["predicate_ref"],
                "value": claim_command["value"],
                "known_revision": revision,
                "valid_time": {
                    "instant": (claim_command.get("valid_time") or {}).get("instant"),
                    "start": (claim_command.get("valid_time") or {}).get("start"),
                    "end": (claim_command.get("valid_time") or {}).get("end"),
                },
                "provenance": dict(claim_command["provenance"]),
            }
            self.ledger.put("claims", claim["claim_id"], claim)
            refs.append(qualify("claim", claim["claim_id"]))
        return {
            "command_type": "RecordExternalOccurrence",
            "outcome": "recorded",
            "known_revision": revision,
            "record_refs": refs,
            "details": {"occurrence_id": occurrence["occurrence_id"]},
        }
