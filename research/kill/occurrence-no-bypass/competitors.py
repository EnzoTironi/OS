#!/usr/bin/env python3
"""Additional issue #157 competitors/sensitivity controls."""

from __future__ import annotations

from reference_model import ModelError, SemanticStore


class PhysicalAppendOnlyStore(SemanticStore):
    """Competitor D: all authority bytes are physically append-only.

    This is intentionally stronger than sealed semantic meaning. It demonstrates
    the tradeoff: history rewrite is impossible, but legitimate payload erasure
    and representation migration cannot be expressed without an external escape
    hatch or a different storage layer.
    """

    def annotate(self, **kwargs) -> None:  # type: ignore[override]
        raise ModelError("physical append-only store cannot update annotations")

    def redact_payload(self, **kwargs) -> None:  # type: ignore[override]
        raise ModelError("physical append-only store cannot erase payload bytes")

    def migrate_representation(self, **kwargs) -> None:  # type: ignore[override]
        raise ModelError("physical append-only store cannot rewrite representation")
