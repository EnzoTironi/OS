#!/usr/bin/env python3
"""Atomic hardening for the issue #157 generic lifecycle candidate.

The first green `SemanticStore` exposed two post-green problems during manual
review:

1. an operation id could be registered before a later validation failed, so a
   retry might become a false no-op;
2. source evidence was entangled with semantic-record identity even though a
   second observation of the same occurrence should not create a second
   occurrence.

This bounded model makes the authority operation atomic (state + operation
marker succeed/fail together) and gives provenance/evidence an explicit
non-semantic attachment operation. Production would rely on the real local
transaction boundary from #40/#39 rather than Python snapshots.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from typing import Any, Iterable, Iterator

from reference_model import (
    DuplicateConflict,
    HistoryEntry,
    ModelError,
    SemanticStore,
)


class AtomicSemanticStore(SemanticStore):
    @classmethod
    def semantic_record_fingerprint(
        cls,
        *,
        record_id: str,
        type_name: str,
        type_revision: str,
        semantic_core: dict[str, Any],
        payload: dict[str, Any],
        source_evidence: Iterable[str],
    ) -> str:
        """Fingerprint semantic identity/content, not provenance multiplicity."""
        return cls.digest(
            {
                "record_id": record_id,
                "type_name": type_name,
                "type_revision": type_revision,
                "semantic_core": semantic_core,
                "payload": payload,
            }
        )

    @contextmanager
    def _atomic_authority_operation(self) -> Iterator[None]:
        snapshot = {
            "records": deepcopy(self._records),
            "history": list(self.history),
            "corrections": list(self.corrections),
            "projections": deepcopy(self.projections),
            "operations": dict(self._operation_fingerprints),
        }
        try:
            yield
        except Exception:
            self._records = snapshot["records"]
            self.history = snapshot["history"]
            self.corrections = snapshot["corrections"]
            self.projections = snapshot["projections"]
            self._operation_fingerprints = snapshot["operations"]
            raise

    def create_record(self, **kwargs) -> None:  # type: ignore[override]
        record_id = kwargs["record_id"]
        supplied_evidence = tuple(kwargs.get("source_evidence", ()))
        existing_before = self._records.get(record_id)

        # A second source is evidence about an existing semantic record, not a
        # second create. Force callers onto the explicit evidence path so no
        # provenance is silently lost or merged by a dedupe heuristic.
        if existing_before is not None and supplied_evidence != existing_before.source_evidence:
            revision = kwargs.get("type_revision") or self.current_type_revision[kwargs["type_name"]]
            semantic_same = self.semantic_record_fingerprint(
                record_id=record_id,
                type_name=kwargs["type_name"],
                type_revision=revision,
                semantic_core=kwargs["semantic_core"],
                payload=dict(kwargs.get("payload") or {}),
                source_evidence=supplied_evidence,
            ) == self.semantic_record_fingerprint(
                record_id=existing_before.record_id,
                type_name=existing_before.type_name,
                type_revision=existing_before.type_revision,
                semantic_core=existing_before.semantic_core,
                payload=existing_before.payload,
                source_evidence=existing_before.source_evidence,
            )
            if semantic_same:
                raise DuplicateConflict(
                    "same semantic record arrived with different provenance; use attach_evidence"
                )

        with self._atomic_authority_operation():
            super().create_record(**kwargs)

    def annotate(self, **kwargs) -> None:  # type: ignore[override]
        with self._atomic_authority_operation():
            super().annotate(**kwargs)

    def redact_payload(self, **kwargs) -> None:  # type: ignore[override]
        with self._atomic_authority_operation():
            super().redact_payload(**kwargs)

    def append_correction(self, **kwargs) -> None:  # type: ignore[override]
        # Validate record identities before the operation marker can be consumed.
        original_id = kwargs["original_id"]
        correction_id = kwargs["correction_id"]
        if original_id not in self._records:
            raise ModelError("cannot correct missing original")
        if correction_id in self._records:
            raise DuplicateConflict("correction id already exists")
        with self._atomic_authority_operation():
            super().append_correction(**kwargs)

    def migrate_representation(self, **kwargs) -> None:  # type: ignore[override]
        with self._atomic_authority_operation():
            super().migrate_representation(**kwargs)

    def attach_evidence(
        self,
        *,
        operation_id: str,
        path: str,
        proof,
        record_id: str,
        evidence: Iterable[str],
    ) -> None:
        if record_id not in self._records:
            raise ModelError("cannot attach evidence to missing record")
        evidence_value = tuple(dict.fromkeys(evidence))
        if not evidence_value:
            raise ModelError("evidence attachment cannot be empty")
        context = {"record_id": record_id, "evidence": evidence_value}
        self._verify_proof(
            proof,
            operation="attach-evidence",
            path=path,
            target=record_id,
            context=context,
        )
        fingerprint = self.digest(context)
        with self._atomic_authority_operation():
            if not self._operation_once(operation_id, fingerprint):
                return
            record = self._records[record_id]
            merged = tuple(dict.fromkeys((*record.source_evidence, *evidence_value)))
            record.source_evidence = merged
            self.history.append(
                HistoryEntry(operation_id, "attach-evidence", path, record_id, note="provenance envelope")
            )
