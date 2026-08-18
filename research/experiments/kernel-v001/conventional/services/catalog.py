from __future__ import annotations

from typing import Any

from services.errors import InputError
from services.ledger import Ledger, qualify

RUN_EXAMPLE = "os scenario run v001 --output json"


class CatalogService:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger

    def create_entity(self, command: dict[str, Any], clock_now: str) -> dict[str, Any]:
        forbidden = {"properties", "labels", "values", "attributes", "fields"}
        extra = forbidden.intersection(command)
        if extra:
            raise InputError(
                "raw_entity_write",
                f"CreateEntity does not accept {sorted(extra)}",
                RUN_EXAMPLE,
            )
        revision = self.ledger.next_revision()
        type_ref = command.get("type_ref") or {}
        entity = {
            "entity_id": command["entity_id"],
            "type_ref": type_ref.get("definition_id") if isinstance(type_ref, dict) else type_ref,
            "created_at": clock_now,
            "provenance": dict(command.get("provenance") or {}),
        }
        self.ledger.put("entities", entity["entity_id"], entity)
        return {
            "command_type": "CreateEntity",
            "outcome": "created",
            "known_revision": revision,
            "record_refs": [qualify("entity", entity["entity_id"])],
            "details": {},
        }
