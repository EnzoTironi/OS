"""Runtime seam for issue #71.

Callers and tests use only these three methods. An adapter may be a generic
kernel, a conventional baseline, or a scenario-specific reference. The suite
does not require Type, Relation, Computation, or Action as engine sorts.
"""

from __future__ import annotations

from typing import Any, Mapping, Protocol, runtime_checkable


@runtime_checkable
class Runtime(Protocol):
    def apply(self, command: Mapping[str, Any]) -> Mapping[str, Any]:
        """Apply one suite command.

        Return at least ``outcome`` and ``known_revision``. Extra detail lives
        under ``details``.
        """

    def query(self, query: Mapping[str, Any]) -> Mapping[str, Any]:
        """Read an observation. Must not mutate authority state."""

    def explain(self, operation_id: str) -> Mapping[str, Any]:
        """Return the causal chain for a committed operation."""
