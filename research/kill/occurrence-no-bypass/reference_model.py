#!/usr/bin/env python3
"""Executable occurrence no-bypass model for issue #157.

The candidate deliberately has no Event/Occurrence base class and no
Event-specific interpreter branch. Any Type may opt into the generic
`sealed_semantics` contract. The contract protects the semantic core after
construction; correction, redaction, representation migration and projection
rebuild are different operations with different authority rather than UPDATEs
of historical meaning.

This is a bounded semantic model, not production persistence/privacy code.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from hashlib import sha256
from hmac import compare_digest, new as hmac_new
from secrets import token_bytes
from typing import Any, Iterable


class ModelError(RuntimeError):
    pass


class Unauthorized(ModelError):
    pass


class SemanticMutation(ModelError):
    pass


class DuplicateConflict(ModelError):
    pass


class RedactionViolation(ModelError):
    pass


class RepresentationMigrationViolation(ModelError):
    pass


@dataclass(frozen=True)
class TypeRevision:
    type_name: str
    revision: str
    contracts: frozenset[str] = frozenset()
    payload_fields: frozenset[str] = frozenset()
    redactable_payload_fields: frozenset[str] = frozenset()


@dataclass
class SemanticRecord:
    record_id: str
    type_name: str
    type_revision: str
    semantic_core: dict[str, Any]
    payload: dict[str, Any] = field(default_factory=dict)
    annotations: dict[str, Any] = field(default_factory=dict)
    representation_version: int = 1
    redacted_fields: set[str] = field(default_factory=set)
    source_evidence: tuple[str, ...] = ()


@dataclass(frozen=True)
class AuthorityProof:
    operation: str
    path: str
    target: str
    context_digest: str
    seal: str


@dataclass(frozen=True)
class HistoryEntry:
    operation_id: str
    operation: str
    path: str
    target: str
    related_record: str | None = None
    note: str | None = None


@dataclass(frozen=True)
class CorrectionLink:
    correction_id: str
    original_id: str
    kind: str  # corrects | supersedes | reverses | retracts-assertion


class SemanticStore:
    """Candidate C: generic immutable semantic values + typed authority operations."""

    WRITE_PATHS = frozenset(
        {
            "action",
            "admin",
            "ingest",
            "bulk-import",
            "migration",
            "repair",
            "privacy",
            "restore-replay",
            "connector-reconcile",
        }
    )

    def __init__(self) -> None:
        self.type_revisions: dict[tuple[str, str], TypeRevision] = {}
        self.current_type_revision: dict[str, str] = {}
        self._records: dict[str, SemanticRecord] = {}
        self.history: list[HistoryEntry] = []
        self.corrections: list[CorrectionLink] = []
        self.projections: dict[str, Any] = {}
        self._operation_fingerprints: dict[str, str] = {}
        self._issuer_key = token_bytes(32)

    @staticmethod
    def _stable(value: Any) -> str:
        if isinstance(value, dict):
            return "{" + ",".join(f"{k!r}:{SemanticStore._stable(v)}" for k, v in sorted(value.items())) + "}"
        if isinstance(value, (list, tuple)):
            return "[" + ",".join(SemanticStore._stable(v) for v in value) + "]"
        if isinstance(value, set):
            return "{" + ",".join(sorted(SemanticStore._stable(v) for v in value)) + "}"
        return repr(value)

    @classmethod
    def digest(cls, value: Any) -> str:
        return sha256(cls._stable(value).encode("utf-8")).hexdigest()

    def register_type(self, definition: TypeRevision, *, make_current: bool = True) -> None:
        key = (definition.type_name, definition.revision)
        self.type_revisions[key] = definition
        if make_current:
            self.current_type_revision[definition.type_name] = definition.revision

    def type_def(self, type_name: str, revision: str | None = None) -> TypeRevision:
        rev = revision or self.current_type_revision[type_name]
        return self.type_revisions[(type_name, rev)]

    def read(self, record_id: str) -> SemanticRecord:
        return deepcopy(self._records[record_id])

    def all_records(self) -> list[SemanticRecord]:
        return [deepcopy(record) for record in self._records.values()]

    def _proof_material(self, operation: str, path: str, target: str, context_digest: str) -> bytes:
        return f"{operation}|{path}|{target}|{context_digest}".encode("utf-8")

    def issue_proof(self, *, operation: str, path: str, target: str, context: Any) -> AuthorityProof:
        if path not in self.WRITE_PATHS:
            raise Unauthorized(f"unknown authoritative path {path}")
        context_digest = self.digest(context)
        seal = hmac_new(self._issuer_key, self._proof_material(operation, path, target, context_digest), sha256).hexdigest()
        return AuthorityProof(operation, path, target, context_digest, seal)

    def _verify_proof(self, proof: AuthorityProof, *, operation: str, path: str, target: str, context: Any) -> None:
        if proof.operation != operation or proof.path != path or proof.target != target:
            raise Unauthorized("authority proof does not match operation/path/target")
        expected_context = self.digest(context)
        if proof.context_digest != expected_context:
            raise Unauthorized("authority proof context mismatch")
        expected = hmac_new(
            self._issuer_key,
            self._proof_material(operation, path, target, expected_context),
            sha256,
        ).hexdigest()
        if not compare_digest(proof.seal, expected):
            raise Unauthorized("authority proof seal mismatch")

    def _operation_once(self, operation_id: str, fingerprint: str) -> bool:
        existing = self._operation_fingerprints.get(operation_id)
        if existing is None:
            self._operation_fingerprints[operation_id] = fingerprint
            return True
        if existing != fingerprint:
            raise DuplicateConflict(f"operation {operation_id} replayed with different meaning")
        return False

    def create_record(
        self,
        *,
        operation_id: str,
        path: str,
        proof: AuthorityProof,
        record_id: str,
        type_name: str,
        semantic_core: dict[str, Any],
        payload: dict[str, Any] | None = None,
        source_evidence: Iterable[str] = (),
        type_revision: str | None = None,
    ) -> None:
        revision = type_revision or self.current_type_revision[type_name]
        definition = self.type_def(type_name, revision)
        payload_value = dict(payload or {})
        unknown_payload = set(payload_value) - set(definition.payload_fields)
        if unknown_payload:
            raise ModelError(f"payload fields not declared by Type: {sorted(unknown_payload)}")
        context = {
            "record_id": record_id,
            "type_name": type_name,
            "type_revision": revision,
            "semantic_core": semantic_core,
            "payload": payload_value,
            "source_evidence": tuple(source_evidence),
        }
        self._verify_proof(proof, operation="create", path=path, target=record_id, context=context)
        fingerprint = self.digest(context)
        if not self._operation_once(operation_id, fingerprint):
            return
        if record_id in self._records:
            existing = self._records[record_id]
            if self.digest(
                {
                    "type_name": existing.type_name,
                    "type_revision": existing.type_revision,
                    "semantic_core": existing.semantic_core,
                    "payload": existing.payload,
                    "source_evidence": existing.source_evidence,
                }
            ) != fingerprint:
                raise DuplicateConflict(f"record {record_id} already exists with different semantics")
            return
        self._records[record_id] = SemanticRecord(
            record_id=record_id,
            type_name=type_name,
            type_revision=revision,
            semantic_core=deepcopy(semantic_core),
            payload=deepcopy(payload_value),
            source_evidence=tuple(source_evidence),
        )
        self.history.append(HistoryEntry(operation_id, "create", path, record_id))

    def replace_semantic_core(
        self,
        *,
        path: str,
        proof: AuthorityProof,
        record_id: str,
        new_core: dict[str, Any],
    ) -> None:
        """Sensitivity API: demonstrates generic contract enforcement.

        A sealed-semantic Type has no legal in-place semantic replacement,
        regardless of which authoritative path calls this method. Unsealed Types
        can use it if a later domain actually needs mutable semantic records.
        """
        record = self._records[record_id]
        definition = self.type_def(record.type_name, record.type_revision)
        context = {"record_id": record_id, "new_core": new_core}
        self._verify_proof(proof, operation="replace-core", path=path, target=record_id, context=context)
        if "sealed_semantics" in definition.contracts:
            raise SemanticMutation(f"{record.type_name} semantic core is sealed")
        record.semantic_core = deepcopy(new_core)

    def annotate(
        self,
        *,
        operation_id: str,
        path: str,
        proof: AuthorityProof,
        record_id: str,
        changes: dict[str, Any],
    ) -> None:
        context = {"record_id": record_id, "changes": changes}
        self._verify_proof(proof, operation="annotate", path=path, target=record_id, context=context)
        if not self._operation_once(operation_id, self.digest(context)):
            return
        self._records[record_id].annotations.update(deepcopy(changes))
        self.history.append(HistoryEntry(operation_id, "annotate", path, record_id))

    def redact_payload(
        self,
        *,
        operation_id: str,
        path: str,
        proof: AuthorityProof,
        record_id: str,
        fields: Iterable[str],
        retain_digest: bool = False,
    ) -> None:
        record = self._records[record_id]
        definition = self.type_def(record.type_name, record.type_revision)
        requested = set(fields)
        if not requested.issubset(definition.redactable_payload_fields):
            raise RedactionViolation("attempted to redact non-redactable or semantic field")
        context = {"record_id": record_id, "fields": sorted(requested), "retain_digest": retain_digest}
        self._verify_proof(proof, operation="redact", path=path, target=record_id, context=context)
        if not self._operation_once(operation_id, self.digest(context)):
            return
        for field_name in requested:
            if field_name not in record.payload:
                continue
            old = record.payload[field_name]
            record.payload[field_name] = {"redacted_digest": self.digest(old)} if retain_digest else None
            record.redacted_fields.add(field_name)
        self.history.append(HistoryEntry(operation_id, "redact", path, record_id))

    def append_correction(
        self,
        *,
        operation_id: str,
        path: str,
        proof: AuthorityProof,
        correction_id: str,
        original_id: str,
        correction_type: str,
        correction_core: dict[str, Any],
        kind: str,
        source_evidence: Iterable[str] = (),
    ) -> None:
        if kind not in {"corrects", "supersedes", "reverses", "retracts-assertion"}:
            raise ModelError(f"unknown correction kind {kind}")
        context = {
            "correction_id": correction_id,
            "original_id": original_id,
            "correction_type": correction_type,
            "correction_core": correction_core,
            "kind": kind,
            "source_evidence": tuple(source_evidence),
        }
        self._verify_proof(proof, operation="append-correction", path=path, target=original_id, context=context)
        fingerprint = self.digest(context)
        if not self._operation_once(operation_id, fingerprint):
            return
        if original_id not in self._records:
            raise ModelError("cannot correct missing original")
        if correction_id in self._records:
            raise DuplicateConflict("correction id already exists")
        revision = self.current_type_revision[correction_type]
        self._records[correction_id] = SemanticRecord(
            record_id=correction_id,
            type_name=correction_type,
            type_revision=revision,
            semantic_core=deepcopy(correction_core),
            source_evidence=tuple(source_evidence),
        )
        self.corrections.append(CorrectionLink(correction_id, original_id, kind))
        self.history.append(HistoryEntry(operation_id, "append-correction", path, original_id, correction_id, kind))

    def migrate_representation(
        self,
        *,
        operation_id: str,
        path: str,
        proof: AuthorityProof,
        record_id: str,
        to_version: int,
        rewritten_core: dict[str, Any],
    ) -> None:
        record = self._records[record_id]
        context = {"record_id": record_id, "to_version": to_version, "rewritten_core": rewritten_core}
        self._verify_proof(proof, operation="migrate-representation", path=path, target=record_id, context=context)
        if rewritten_core != record.semantic_core:
            raise RepresentationMigrationViolation("representation migration changed semantic value")
        if not self._operation_once(operation_id, self.digest(context)):
            return
        record.representation_version = to_version
        self.history.append(HistoryEntry(operation_id, "migrate-representation", path, record_id))

    def rebuild_projection(self, name: str, projector) -> Any:
        """Derived rebuild is intentionally outside authoritative write paths."""
        result = projector(self.all_records(), list(self.corrections))
        self.projections[name] = deepcopy(result)
        return deepcopy(result)


class NativeOccurrenceStore(SemanticStore):
    """Competitor A sensitivity model: hard-coded occurrence knowledge."""

    def replace_semantic_core(self, *, path: str, proof: AuthorityProof, record_id: str, new_core: dict[str, Any]) -> None:
        record = self._records[record_id]
        context = {"record_id": record_id, "new_core": new_core}
        self._verify_proof(proof, operation="replace-core", path=path, target=record_id, context=context)
        if record.type_name in {"StockMovement", "JournalPosting", "BusinessOccurrence"}:
            raise SemanticMutation("native occurrence base nature forbids update")
        record.semantic_core = deepcopy(new_core)


class UnsafeAdminStore(SemanticStore):
    """Mutant: privileged code bypasses the semantic authority boundary."""

    def raw_admin_replace(self, record_id: str, new_core: dict[str, Any]) -> None:
        self._records[record_id].semantic_core = deepcopy(new_core)


class UnsafeReplayStore(SemanticStore):
    """Mutant: source replay overwrites accepted semantics under a stable id."""

    def replay_overwrite(self, record_id: str, new_core: dict[str, Any]) -> None:
        self._records[record_id].semantic_core = deepcopy(new_core)
