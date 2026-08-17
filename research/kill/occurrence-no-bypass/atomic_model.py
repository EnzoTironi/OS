#!/usr/bin/env python3
"""Atomic hardening for the issue #157 generic lifecycle candidate.

The first green `SemanticStore` exposed post-green problems during manual review:

1. an operation id could be registered before a later validation failed, so a
   retry might become a false no-op;
2. source evidence was entangled with semantic-record identity even though a
   second observation of the same occurrence should not create a second
   occurrence;
3. privacy erasure permission was frozen into the historical Type revision,
   even though a current legal/policy rule can change what must/may be erased;
4. a mutable/redefinable Type revision would let a privileged path weaken the
   generic lifecycle contract after a record had already been admitted.

This bounded model makes the authority operation atomic (state + operation
marker succeed/fail together), gives provenance/evidence an explicit
non-semantic attachment operation, separates historical Type meaning from a
current privacy-policy revision, and treats published Type revisions plus a
record's Type-revision binding as historical semantic identity rather than
mutable guard metadata.

Production would rely on the real local transaction/definition-governance
boundary from #40/#39 rather than Python snapshots.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from typing import Any, Iterable, Iterator

from reference_model import (
    DuplicateConflict,
    HistoryEntry,
    ModelError,
    RedactionViolation,
    SemanticMutation,
    SemanticStore,
    TypeRevision,
)


class AtomicSemanticStore(SemanticStore):
    def __init__(self) -> None:
        super().__init__()
        self._privacy_policies: dict[str, tuple[str, frozenset[str]]] = {}

    def register_type(self, definition: TypeRevision, *, make_current: bool = True) -> None:
        key = (definition.type_name, definition.revision)
        existing = self.type_revisions.get(key)
        if existing is not None and existing != definition:
            raise DuplicateConflict(
                f"published Type revision {definition.type_name}@{definition.revision} is immutable"
            )
        super().register_type(definition, make_current=make_current)
        # Treat a Type's original redactable-field declaration only as the
        # initial policy seed. Later policy revisions are independent and do not
        # rewrite historical Type meaning.
        if definition.type_name not in self._privacy_policies:
            self._privacy_policies[definition.type_name] = (
                f"type-default:{definition.revision}",
                frozenset(definition.redactable_payload_fields),
            )

    def rebind_type_revision(
        self,
        *,
        path: str,
        proof,
        record_id: str,
        new_type_name: str,
        new_type_revision: str,
    ) -> None:
        """Sensitivity API proving contract-bearing record identity is not mutable.

        A migration may publish a new Type revision and future records may be
        created against it. Reinterpreting an already accepted record by swapping
        its Type/revision binding is a semantic rewrite and must instead be
        represented explicitly (migration/correction/new record as appropriate).
        """
        if record_id not in self._records:
            raise ModelError("cannot rebind missing record")
        if (new_type_name, new_type_revision) not in self.type_revisions:
            raise ModelError("target Type revision does not exist")
        record = self._records[record_id]
        context = {
            "record_id": record_id,
            "from_type_name": record.type_name,
            "from_type_revision": record.type_revision,
            "to_type_name": new_type_name,
            "to_type_revision": new_type_revision,
        }
        self._verify_proof(
            proof,
            operation="rebind-type-revision",
            path=path,
            target=record_id,
            context=context,
        )
        if (record.type_name, record.type_revision) == (new_type_name, new_type_revision):
            return
        raise SemanticMutation(
            "accepted record Type/revision binding is semantic identity and cannot be rewritten in place"
        )

    def set_privacy_policy(
        self,
        *,
        type_name: str,
        revision: str,
        erasable_fields: Iterable[str],
    ) -> None:
        known_payload_fields = {
            field
            for (candidate_name, _), definition in self.type_revisions.items()
            if candidate_name == type_name
            for field in definition.payload_fields
        }
        requested = frozenset(erasable_fields)
        unknown = requested - known_payload_fields
        if unknown:
            raise ModelError(f"privacy policy references unknown payload fields: {sorted(unknown)}")
        self._privacy_policies[type_name] = (revision, requested)

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

    def redact_payload(
        self,
        *,
        operation_id: str,
        path: str,
        proof,
        record_id: str,
        fields: Iterable[str],
        retain_digest: bool = False,
    ) -> None:
        if record_id not in self._records:
            raise ModelError("cannot redact missing record")
        record = self._records[record_id]
        requested = set(fields)
        policy_revision, erasable = self._privacy_policies.get(
            record.type_name, ("none", frozenset())
        )
        if not requested.issubset(erasable):
            raise RedactionViolation("current privacy policy does not authorize requested erasure")
        context = {
            "record_id": record_id,
            "fields": sorted(requested),
            "retain_digest": retain_digest,
            "privacy_policy_revision": policy_revision,
        }
        self._verify_proof(
            proof,
            operation="redact",
            path=path,
            target=record_id,
            context=context,
        )
        fingerprint = self.digest(context)
        with self._atomic_authority_operation():
            if not self._operation_once(operation_id, fingerprint):
                return
            for field_name in requested:
                if field_name not in record.payload:
                    continue
                old = record.payload[field_name]
                record.payload[field_name] = (
                    {"redacted_digest": self.digest(old)} if retain_digest else None
                )
                record.redacted_fields.add(field_name)
            self.history.append(
                HistoryEntry(
                    operation_id,
                    "redact",
                    path,
                    record_id,
                    note=f"privacy-policy={policy_revision}",
                )
            )

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
