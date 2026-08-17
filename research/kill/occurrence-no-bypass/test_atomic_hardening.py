#!/usr/bin/env python3
from __future__ import annotations

import unittest

from atomic_model import AtomicSemanticStore
from reference_model import DuplicateConflict, SemanticMutation, TypeRevision


def configured() -> AtomicSemanticStore:
    store = AtomicSemanticStore()
    sealed = frozenset({"sealed_semantics"})
    store.register_type(TypeRevision("StockMovement", "stock-v1", sealed))
    store.register_type(TypeRevision("CorrectionStatement", "correction-v1", sealed))
    return store


def create(
    store: AtomicSemanticStore,
    *,
    operation_id: str,
    record_id: str,
    qty: int,
    evidence=("source:1",),
    path: str = "ingest",
) -> None:
    core = {"sku": "X", "qty": qty}
    context = {
        "record_id": record_id,
        "type_name": "StockMovement",
        "type_revision": "stock-v1",
        "semantic_core": core,
        "payload": {},
        "source_evidence": tuple(evidence),
    }
    proof = store.issue_proof(operation="create", path=path, target=record_id, context=context)
    store.create_record(
        operation_id=operation_id,
        path=path,
        proof=proof,
        record_id=record_id,
        type_name="StockMovement",
        semantic_core=core,
        source_evidence=evidence,
        type_revision="stock-v1",
    )


class AtomicAuthorityTests(unittest.TestCase):
    def test_failed_conflicting_create_does_not_consume_operation_id(self) -> None:
        store = configured()
        create(store, operation_id="seed:1", record_id="stock:1", qty=10)

        with self.assertRaises(DuplicateConflict):
            create(store, operation_id="attempt:1", record_id="stock:1", qty=99)

        create(store, operation_id="attempt:1", record_id="stock:2", qty=5)
        self.assertEqual(store.read("stock:2").semantic_core["qty"], 5)

    def test_failed_correction_does_not_consume_operation_id(self) -> None:
        store = configured()
        create(store, operation_id="seed:1", record_id="stock:1", qty=10)

        bad_context = {
            "correction_id": "correction:1",
            "original_id": "missing:1",
            "correction_type": "CorrectionStatement",
            "correction_core": {"accepted_qty": 9},
            "kind": "corrects",
            "source_evidence": (),
        }
        bad_proof = store.issue_proof(
            operation="append-correction", path="repair", target="missing:1", context=bad_context
        )
        with self.assertRaises(Exception):
            store.append_correction(
                operation_id="correct:attempt:1",
                path="repair",
                proof=bad_proof,
                correction_id="correction:1",
                original_id="missing:1",
                correction_type="CorrectionStatement",
                correction_core={"accepted_qty": 9},
                kind="corrects",
            )

        good_context = {
            "correction_id": "correction:1",
            "original_id": "stock:1",
            "correction_type": "CorrectionStatement",
            "correction_core": {"accepted_qty": 9},
            "kind": "corrects",
            "source_evidence": (),
        }
        good_proof = store.issue_proof(
            operation="append-correction", path="repair", target="stock:1", context=good_context
        )
        store.append_correction(
            operation_id="correct:attempt:1",
            path="repair",
            proof=good_proof,
            correction_id="correction:1",
            original_id="stock:1",
            correction_type="CorrectionStatement",
            correction_core={"accepted_qty": 9},
            kind="corrects",
        )
        self.assertEqual(store.corrections[0].original_id, "stock:1")

    def test_new_source_evidence_uses_explicit_envelope_operation(self) -> None:
        store = configured()
        create(store, operation_id="ingest:1", record_id="stock:1", qty=10, evidence=("source:a",))

        with self.assertRaises(DuplicateConflict):
            create(store, operation_id="ingest:2", record_id="stock:1", qty=10, evidence=("source:b",))

        context = {"record_id": "stock:1", "evidence": ("source:b",)}
        proof = store.issue_proof(
            operation="attach-evidence", path="connector-reconcile", target="stock:1", context=context
        )
        before_core = store.read("stock:1").semantic_core
        store.attach_evidence(
            operation_id="evidence:1",
            path="connector-reconcile",
            proof=proof,
            record_id="stock:1",
            evidence=("source:b",),
        )
        after = store.read("stock:1")
        self.assertEqual(after.semantic_core, before_core)
        self.assertEqual(after.source_evidence, ("source:a", "source:b"))
        self.assertEqual(len([r for r in store.all_records() if r.type_name == "StockMovement"]), 1)

    def test_evidence_attachment_is_idempotent_and_mismatch_safe(self) -> None:
        store = configured()
        create(store, operation_id="ingest:1", record_id="stock:1", qty=10)
        context = {"record_id": "stock:1", "evidence": ("source:b",)}
        proof = store.issue_proof(
            operation="attach-evidence", path="connector-reconcile", target="stock:1", context=context
        )
        for _ in range(2):
            store.attach_evidence(
                operation_id="evidence:1",
                path="connector-reconcile",
                proof=proof,
                record_id="stock:1",
                evidence=("source:b",),
            )
        self.assertEqual(store.read("stock:1").source_evidence, ("source:1", "source:b"))
        self.assertEqual(sum(1 for h in store.history if h.operation == "attach-evidence"), 1)

        mismatch_context = {"record_id": "stock:1", "evidence": ("source:c",)}
        mismatch_proof = store.issue_proof(
            operation="attach-evidence", path="connector-reconcile", target="stock:1", context=mismatch_context
        )
        with self.assertRaises(DuplicateConflict):
            store.attach_evidence(
                operation_id="evidence:1",
                path="connector-reconcile",
                proof=mismatch_proof,
                record_id="stock:1",
                evidence=("source:c",),
            )
        self.assertNotIn("source:c", store.read("stock:1").source_evidence)

    def test_published_type_revision_cannot_be_redefined_with_weaker_contract(self) -> None:
        store = configured()
        original = store.type_def("StockMovement", "stock-v1")
        with self.assertRaises(DuplicateConflict):
            store.register_type(TypeRevision("StockMovement", "stock-v1", frozenset()))
        self.assertEqual(store.type_def("StockMovement", "stock-v1"), original)

        create(store, operation_id="seed:1", record_id="stock:1", qty=10)
        context = {"record_id": "stock:1", "new_core": {"sku": "X", "qty": 99}}
        proof = store.issue_proof(
            operation="replace-core", path="admin", target="stock:1", context=context
        )
        with self.assertRaises(SemanticMutation):
            store.replace_semantic_core(
                path="admin", proof=proof, record_id="stock:1", new_core=context["new_core"]
            )

    def test_new_weaker_revision_cannot_rebind_existing_record(self) -> None:
        store = configured()
        create(store, operation_id="seed:1", record_id="stock:1", qty=10)
        store.register_type(TypeRevision("StockMovement", "stock-v2", frozenset()))

        context = {
            "record_id": "stock:1",
            "from_type_name": "StockMovement",
            "from_type_revision": "stock-v1",
            "to_type_name": "StockMovement",
            "to_type_revision": "stock-v2",
        }
        proof = store.issue_proof(
            operation="rebind-type-revision", path="migration", target="stock:1", context=context
        )
        with self.assertRaises(SemanticMutation):
            store.rebind_type_revision(
                path="migration",
                proof=proof,
                record_id="stock:1",
                new_type_name="StockMovement",
                new_type_revision="stock-v2",
            )
        record = store.read("stock:1")
        self.assertEqual((record.type_name, record.type_revision), ("StockMovement", "stock-v1"))

    def test_record_cannot_be_retyped_to_unsealed_type(self) -> None:
        store = configured()
        store.register_type(TypeRevision("MutableNote", "note-v1", frozenset()))
        create(store, operation_id="seed:1", record_id="stock:1", qty=10)
        context = {
            "record_id": "stock:1",
            "from_type_name": "StockMovement",
            "from_type_revision": "stock-v1",
            "to_type_name": "MutableNote",
            "to_type_revision": "note-v1",
        }
        proof = store.issue_proof(
            operation="rebind-type-revision", path="admin", target="stock:1", context=context
        )
        with self.assertRaises(SemanticMutation):
            store.rebind_type_revision(
                path="admin",
                proof=proof,
                record_id="stock:1",
                new_type_name="MutableNote",
                new_type_revision="note-v1",
            )
        self.assertEqual(store.read("stock:1").type_name, "StockMovement")


if __name__ == "__main__":
    unittest.main()
