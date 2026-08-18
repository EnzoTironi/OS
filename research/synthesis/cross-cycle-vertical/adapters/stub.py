"""Adapter that accepts commands and returns empty success.

Used to prove the suite is executable and that passing it is not free.
"""

from __future__ import annotations

from typing import Any, Mapping


class StubRuntime:
    def apply(self, command: Mapping[str, Any]) -> Mapping[str, Any]:
        del command
        return {"outcome": "ignored", "known_revision": "rev:0", "details": {}}

    def query(self, query: Mapping[str, Any]) -> Mapping[str, Any]:
        del query
        return {}

    def explain(self, operation_id: str) -> Mapping[str, Any]:
        del operation_id
        return {}
