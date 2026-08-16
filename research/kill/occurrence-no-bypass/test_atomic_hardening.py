#!/usr/bin/env python3
from __future__ import annotations

import unittest

from atomic_model import AtomicSemanticStore
from reference_model import DuplicateConflict, TypeRevision


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
    )


class AtomicAuthorityTests(unittest.TestCase):
    def test_failed_conflicting_create_does_not_consume_operation_id(self) -> None:
        store = configured()
        create(store, operation_id="seed:1", record_id="stock:1", qty=10)

        with self.assertRaises(DuplicateConflict):
            create(store, operation_id="attempt:1", record_id="stock:1", qty=99)

        # The failed attempt never committed an idempotency marker, so the same
        # physical operation id is still free to identify a later valid attempt.
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

        # A second source describing the same semantic record is not another
        # occurrence and must not be silently folded through create().
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


if __name__ == "__main__":
    unittest.main()
