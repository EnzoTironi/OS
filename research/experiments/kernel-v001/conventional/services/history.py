from __future__ import annotations

from typing import Any

from services.canonical import digest
from services.ledger import Ledger, qualify


def _point(valid_time: dict[str, Any] | None) -> str | None:
    if not valid_time:
        return None
    instant = valid_time.get("instant")
    if instant is not None:
        return str(instant)
    start = valid_time.get("start")
    if start is not None:
        return str(start)
    return None


def covers(valid_time: dict[str, Any] | None, valid_at: str) -> bool:
    point = _point(valid_time)
    if point is None:
        return True
    if len(valid_at) == 10:
        return point[:10] <= valid_at
    if valid_time and valid_time.get("instant") is not None:
        return point <= valid_at
    start = (valid_time or {}).get("start") or ""
    end = (valid_time or {}).get("end")
    if start and valid_at < str(start):
        return False
    if end is not None and valid_at >= str(end):
        return False
    return True


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


class HistoryService:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger

    def record_claim(self, command: dict[str, Any]) -> dict[str, Any]:
        revision = self.ledger.next_revision()
        claim = {
            "claim_id": command["claim_id"],
            "subject_ref": command["subject_ref"],
            "predicate_ref": command["predicate_ref"],
            "value": command["value"],
            "known_revision": revision,
            "valid_time": {
                "instant": (command.get("valid_time") or {}).get("instant"),
                "start": (command.get("valid_time") or {}).get("start"),
                "end": (command.get("valid_time") or {}).get("end"),
            },
            "provenance": dict(command["provenance"]),
        }
        self.ledger.put("claims", claim["claim_id"], claim)
        return {
            "command_type": "RecordClaim",
            "outcome": "recorded",
            "known_revision": revision,
            "record_refs": [qualify("claim", claim["claim_id"])],
            "details": {"claim_id": claim["claim_id"]},
        }

    def matching_claims(
        self,
        subject: str,
        predicate: str,
        valid_at: str,
        known_at: str | None,
    ) -> list[dict[str, Any]]:
        cut = self.ledger.resolve_cut(known_at)
        found: list[dict[str, Any]] = []
        for claim in self.ledger.claims():
            if claim["subject_ref"] != subject or claim["predicate_ref"] != predicate:
                continue
            if not covers(claim.get("valid_time"), valid_at):
                continue
            if cut is not None and claim["known_revision"] > cut:
                continue
            found.append(claim)
        found.sort(key=lambda item: item["claim_id"])
        return found

    def sum_quantity(
        self,
        subject: str,
        predicate: str,
        valid_at: str,
        known_at: str | None,
    ) -> tuple[float, list[dict[str, Any]]]:
        contributors = []
        total = 0.0
        for claim in self.matching_claims(subject, predicate, valid_at, known_at):
            number = _number(claim.get("value"))
            if number is None:
                continue
            total += number
            contributors.append(
                {
                    "claim_id": claim["claim_id"],
                    "value": claim["value"],
                    "known_revision": claim["known_revision"],
                    "valid_time": claim["valid_time"],
                    "provenance": {
                        "source_id": claim["provenance"].get("source_id"),
                        "source_locator": claim["provenance"].get("source_locator"),
                        "capture_id": claim["provenance"].get("capture_id"),
                        "capture_revision": claim["provenance"].get("capture_revision"),
                    },
                }
            )
        return total, contributors

    def query_quantity(self, query: dict[str, Any]) -> dict[str, Any]:
        subject = query["subject"]
        predicate = query["predicate"]
        valid_at = query["valid_at"]
        known_at = query.get("known_at")
        if query.get("type") == "now-believed-for-then":
            known_at = None
        total, contributors = self.sum_quantity(subject, predicate, valid_at, known_at)
        value: int | float = int(total) if total.is_integer() else total
        return {
            "type": query["type"],
            "subject": subject,
            "predicate": predicate,
            "valid_at": valid_at,
            "known_at": None if query.get("type") == "now-believed-for-then" else query.get("known_at"),
            "value": value,
            "contributors": contributors,
            "rivals": list(contributors),
            "contributor_digest": digest([item["claim_id"] for item in contributors]),
        }

    def public_records(self) -> dict[str, Any]:
        return {
            "claims": [
                {
                    "claim_id": item["claim_id"],
                    "subject_ref": item["subject_ref"],
                    "predicate_ref": item["predicate_ref"],
                    "value": item["value"],
                    "known_revision": item["known_revision"],
                    "valid_time": item["valid_time"],
                    "provenance": {
                        "source_id": item["provenance"].get("source_id"),
                        "source_locator": item["provenance"].get("source_locator"),
                        "capture_id": item["provenance"].get("capture_id"),
                        "capture_revision": item["provenance"].get("capture_revision"),
                        "actor_id": item["provenance"].get("actor_id"),
                        "workload_id": item["provenance"].get("workload_id"),
                    },
                }
                for item in self.ledger.claims()
            ]
        }
