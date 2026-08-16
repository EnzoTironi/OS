#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    DuplicateConflict,
    NativeOccurrenceStore,
    RedactionViolation,
    RepresentationMigrationViolation,
    SemanticMutation,
    SemanticStore,
    TypeRevision,
    UnsafeAdminStore,
    UnsafeReplayStore,
)


SEALED_PATHS = [
    "action",
    "admin",
    "ingest",
    "bulk-import",
    "migration",
    "repair",
    "privacy",
    "restore-replay",
    "connector-reconcile",
]


def configured(store_cls=SemanticStore):
    store = store_cls()
    sealed = frozenset({"sealed_semantics"})
    store.register_type(
        TypeRevision(
            "StockMovement",
            "stock-v1",
            sealed,
            payload_fields=frozenset({"operator_name", "note"}),
            redactable_payload_fields=frozenset({"operator_name", "note"}),
        )
    )
    store.register_type(TypeRevision("JournalPosting", "journal-v1", sealed))
    store.register_type(TypeRevision("CorrectionStatement", "correction-v1", sealed))
    # Non-event control: proves sealed_semantics is not Event-specific.
    store.register_type(TypeRevision("PublishedDefinition", "definition-v1", sealed))
    store.register_type(TypeRevision("MutableNote", "note-v1", frozenset()))
    return store


def create(
    store: SemanticStore,
    *,
    path: str = "action",
    operation_id: str = "create:stock:1",
    record_id: str = "stock:1",
    type_name: str = "StockMovement",
    semantic_core=None,
    payload=None,
    evidence=("source:1",),
):
    semantic_core = semantic_core or {"sku": "X", "qty": 10, "from": "A", "to": "B"}
    revision = store.current_type_revision[type_name]
    context = {
        "record_id": record_id,
        "type_name": type_name,
        "type_revision": revision,
        "semantic_core": semantic_core,
        "payload": dict(payload or {}),
        "source_evidence": tuple(evidence),
    }
    proof = store.issue_proof(operation="create", path=path, target=record_id, context=context)
    store.create_record(
        operation_id=operation_id,
        path=path,
        proof=proof,
        record_id=record_id,
        type_name=type_name,
        semantic_core=semantic_core,
        payload=payload,
        source_evidence=evidence,
    )


class SealedSemanticsTests(unittest.TestCase):
    def test_every_authoritative_write_path_cannot_replace_committed_semantic_core(self) -> None:
        for path in SEALED_PATHS:
            with self.subTest(path=path):
                store = configured()
                create(store)
                new_core = {"sku": "X", "qty": 999, "from": "A", "to": "B"}
                context = {"record_id": "stock:1", "new_core": new_core}
                proof = store.issue_proof(operation="replace-core", path=path, target="stock:1", context=context)
                with self.assertRaises(SemanticMutation):
                    store.replace_semantic_core(path=path, proof=proof, record_id="stock:1", new_core=new_core)
                self.assertEqual(store.read("stock:1").semantic_core["qty"], 10)

    def test_same_contract_protects_non_event_published_definition(self) -> None:
        store = configured()
        create(
            store,
            operation_id="create:def:1",
            record_id="definition:1",
            type_name="PublishedDefinition",
            semantic_core={"name": "Account", "schema": {"code": "string"}},
            evidence=(),
        )
        new_core = {"name": "Account", "schema": {"code": "integer"}}
        context = {"record_id": "definition:1", "new_core": new_core}
        proof = store.issue_proof(operation="replace-core", path="admin", target="definition:1", context=context)
        with self.assertRaises(SemanticMutation):
            store.replace_semantic_core(path="admin", proof=proof, record_id="definition:1", new_core=new_core)

    def test_unsealed_type_can_change_semantics_without_event_specific_branch(self) -> None:
        store = configured()
        create(
            store,
            operation_id="create:note:1",
            record_id="note:1",
            type_name="MutableNote",
            semantic_core={"text": "draft"},
            evidence=(),
        )
        new_core = {"text": "edited"}
        context = {"record_id": "note:1", "new_core": new_core}
        proof = store.issue_proof(operation="replace-core", path="admin", target="note:1", context=context)
        store.replace_semantic_core(path="admin", proof=proof, record_id="note:1", new_core=new_core)
        self.assertEqual(store.read("note:1").semantic_core, new_core)


class CorrectionAndPrivacyTests(unittest.TestCase):
    def test_wrong_occurrence_is_corrected_by_append_not_rewrite(self) -> None:
        store = configured()
        create(store)
        context = {
            "correction_id": "correction:1",
            "original_id": "stock:1",
            "correction_type": "CorrectionStatement",
            "correction_core": {"reason": "source quantity was wrong", "accepted_qty": 8},
            "kind": "corrects",
            "source_evidence": ("source:correction",),
        }
        proof = store.issue_proof(
            operation="append-correction", path="repair", target="stock:1", context=context
        )
        store.append_correction(
            operation_id="correct:1",
            path="repair",
            proof=proof,
            correction_id="correction:1",
            original_id="stock:1",
            correction_type="CorrectionStatement",
            correction_core=context["correction_core"],
            kind="corrects",
            source_evidence=context["source_evidence"],
        )
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 10)
        self.assertEqual(store.corrections[0].original_id, "stock:1")
        self.assertEqual(store.corrections[0].kind, "corrects")

    def test_redaction_removes_designated_payload_without_rewriting_semantic_core(self) -> None:
        store = configured()
        create(store, payload={"operator_name": "Person A", "note": "delivery desk"})
        before_core = store.read("stock:1").semantic_core
        context = {"record_id": "stock:1", "fields": ["operator_name"], "retain_digest": False}
        proof = store.issue_proof(operation="redact", path="privacy", target="stock:1", context=context)
        store.redact_payload(
            operation_id="redact:1",
            path="privacy",
            proof=proof,
            record_id="stock:1",
            fields=["operator_name"],
        )
        after = store.read("stock:1")
        self.assertEqual(after.semantic_core, before_core)
        self.assertIsNone(after.payload["operator_name"])
        self.assertIn("operator_name", after.redacted_fields)

    def test_privacy_operation_cannot_redact_semantic_core_by_calling_payload_api(self) -> None:
        store = configured()
        create(store, payload={"operator_name": "Person A"})
        context = {"record_id": "stock:1", "fields": ["qty"], "retain_digest": False}
        proof = store.issue_proof(operation="redact", path="privacy", target="stock:1", context=context)
        with self.assertRaises(RedactionViolation):
            store.redact_payload(
                operation_id="redact:qty",
                path="privacy",
                proof=proof,
                record_id="stock:1",
                fields=["qty"],
            )


class MigrationReplayProjectionTests(unittest.TestCase):
    def test_representation_migration_can_change_encoding_version_not_meaning(self) -> None:
        store = configured()
        create(store)
        same_core = store.read("stock:1").semantic_core
        context = {"record_id": "stock:1", "to_version": 2, "rewritten_core": same_core}
        proof = store.issue_proof(
            operation="migrate-representation", path="migration", target="stock:1", context=context
        )
        store.migrate_representation(
            operation_id="migrate:1",
            path="migration",
            proof=proof,
            record_id="stock:1",
            to_version=2,
            rewritten_core=same_core,
        )
        self.assertEqual(store.read("stock:1").representation_version, 2)
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 10)

    def test_migration_cannot_hide_semantic_change_as_representation_rewrite(self) -> None:
        store = configured()
        create(store)
        changed = {**store.read("stock:1").semantic_core, "qty": 9}
        context = {"record_id": "stock:1", "to_version": 2, "rewritten_core": changed}
        proof = store.issue_proof(
            operation="migrate-representation", path="migration", target="stock:1", context=context
        )
        with self.assertRaises(RepresentationMigrationViolation):
            store.migrate_representation(
                operation_id="migrate:bad",
                path="migration",
                proof=proof,
                record_id="stock:1",
                to_version=2,
                rewritten_core=changed,
            )

    def test_type_revision_change_does_not_reinterpret_existing_record(self) -> None:
        store = configured()
        create(store)
        store.register_type(TypeRevision("StockMovement", "stock-v2", frozenset({"sealed_semantics"})))
        old = store.read("stock:1")
        self.assertEqual(old.type_revision, "stock-v1")
        self.assertEqual(store.current_type_revision["StockMovement"], "stock-v2")

    def test_projection_rebuild_does_not_create_business_occurrence(self) -> None:
        store = configured()
        create(store)
        history_before = list(store.history)
        count = store.rebuild_projection(
            "movement-count", lambda records, corrections: sum(1 for r in records if r.type_name == "StockMovement")
        )
        self.assertEqual(count, 1)
        self.assertEqual(store.history, history_before)
        self.assertEqual(len(store.all_records()), 1)

    def test_source_replay_same_semantics_does_not_create_second_occurrence(self) -> None:
        store = configured()
        create(store, path="ingest", operation_id="ingest:1")
        create(store, path="restore-replay", operation_id="restore:replay:1")
        self.assertEqual(len(store.all_records()), 1)
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 10)

    def test_source_replay_conflict_never_overwrites_accepted_occurrence(self) -> None:
        store = configured()
        create(store, path="ingest", operation_id="ingest:1")
        with self.assertRaises(DuplicateConflict):
            create(
                store,
                path="connector-reconcile",
                operation_id="reconcile:1",
                semantic_core={"sku": "X", "qty": 99, "from": "A", "to": "B"},
            )
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 10)


class SensitivityMutants(unittest.TestCase):
    def test_unsafe_admin_mutant_reproduces_bypass(self) -> None:
        store = configured(UnsafeAdminStore)
        create(store)
        store.raw_admin_replace("stock:1", {"sku": "X", "qty": 999, "from": "A", "to": "B"})
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 999)

    def test_unsafe_replay_mutant_reproduces_history_rewrite(self) -> None:
        store = configured(UnsafeReplayStore)
        create(store, path="ingest")
        store.replay_overwrite("stock:1", {"sku": "X", "qty": 777, "from": "A", "to": "B"})
        self.assertEqual(store.read("stock:1").semantic_core["qty"], 777)

    def test_native_event_competitor_blocks_occurrence_but_not_generic_non_event_record(self) -> None:
        store = configured(NativeOccurrenceStore)
        create(store)
        new_core = {"sku": "X", "qty": 99, "from": "A", "to": "B"}
        context = {"record_id": "stock:1", "new_core": new_core}
        proof = store.issue_proof(operation="replace-core", path="admin", target="stock:1", context=context)
        with self.assertRaises(SemanticMutation):
            store.replace_semantic_core(path="admin", proof=proof, record_id="stock:1", new_core=new_core)

        create(
            store,
            operation_id="create:def:1",
            record_id="definition:1",
            type_name="PublishedDefinition",
            semantic_core={"name": "Account", "schema": 1},
            evidence=(),
        )
        changed = {"name": "Account", "schema": 2}
        context = {"record_id": "definition:1", "new_core": changed}
        proof = store.issue_proof(operation="replace-core", path="admin", target="definition:1", context=context)
        store.replace_semantic_core(path="admin", proof=proof, record_id="definition:1", new_core=changed)
        self.assertEqual(store.read("definition:1").semantic_core["schema"], 2)


if __name__ == "__main__":
    unittest.main()
