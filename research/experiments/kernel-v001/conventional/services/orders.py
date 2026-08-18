from __future__ import annotations

from typing import Any

from services.history import HistoryService


ORDER_PREDICATES = {
    "ordered-quantity",
    "requested-delivery",
    "promised-delivery",
    "planned-delivery",
    "actual-shipment",
    "substitute-accepted",
}


class OrderService:
    def __init__(self, history: HistoryService) -> None:
        self.history = history
        self._facts: dict[str, dict[str, Any]] = {}

    def owns(self, command: dict[str, Any]) -> bool:
        return command.get("predicate_ref") in ORDER_PREDICATES

    def record_claim(self, command: dict[str, Any]) -> dict[str, Any]:
        receipt = self.history.record_claim(command)
        order_id = command["subject_ref"]
        facts = dict(self._facts.get(order_id) or {})
        facts[command["predicate_ref"]] = command.get("value")
        self._facts[order_id] = facts
        return receipt
