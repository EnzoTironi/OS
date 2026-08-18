from __future__ import annotations

from typing import Any

from services.errors import InternalError


def qualify(kind: str, identifier: str) -> str:
    if identifier.startswith(f"{kind}:"):
        return identifier
    return f"{kind}:{identifier}"


class Ledger:
    def __init__(self) -> None:
        self._revision = 0
        self._seq: dict[str, int] = {}
        self._aliases: dict[str, str] = {}
        self._tables: dict[str, dict[str, Any]] = {
            "entities": {},
            "claims": {},
            "delegations": {},
            "proposals": {},
            "approvals": {},
            "envelopes": {},
            "receipts": {},
            "occurrences": {},
            "effect_requests": {},
            "effect_attempts": {},
            "effect_knowledge": {},
            "reconciliations": {},
            "causal_links": {},
            "identities": {},
            "orders": {},
            "stock_positions": {},
            "policy_packs": {},
        }

    def current_revision(self) -> str:
        return f"kr:{self._revision:04d}"

    def next_revision(self) -> str:
        self._revision += 1
        return f"kr:{self._revision:04d}"

    def next_id(self, kind: str) -> str:
        self._seq[kind] = self._seq.get(kind, 0) + 1
        return f"{kind}:{self._seq[kind]:04d}"

    def alias(self, name: str, revision: str) -> None:
        self._aliases[name] = revision

    def resolve_cut(self, known_at: str | None) -> str | None:
        if known_at is None:
            return None
        return self._aliases.get(known_at, known_at)

    def aliases(self) -> dict[str, str]:
        return dict(sorted(self._aliases.items()))

    def put(self, table: str, key: str, value: Any) -> None:
        bucket = self._tables[table]
        if key in bucket:
            raise InternalError("append_only", f"{table} already contains {key}")
        bucket[key] = value

    def get(self, table: str, key: str) -> Any | None:
        return self._tables[table].get(key)

    def all(self, table: str) -> list[Any]:
        return list(self._tables[table].values())

    def keys(self, table: str) -> list[str]:
        return sorted(self._tables[table])

    def claims(self) -> list[dict[str, Any]]:
        items = list(self._tables["claims"].values())
        items.sort(key=lambda item: item["claim_id"])
        return items
