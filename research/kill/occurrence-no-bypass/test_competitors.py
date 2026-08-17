#!/usr/bin/env python3
from __future__ import annotations

import unittest

from competitors import PhysicalAppendOnlyStore
from reference_model import ModelError, TypeRevision


def configured() -> PhysicalAppendOnlyStore:
    store = PhysicalAppendOnlyStore()
    store.register_type(
        TypeRevision(
            "StockMovement",
            "stock-v1",
            frozenset({"sealed_semantics"}),
            payload_fields=frozenset({"operator_name"}),
            redactable_payload_fields=frozenset({"operator_name"}),
        )
    )
    return store


def create(store: PhysicalAppendOnlyStore) -> None:
    core = {"sku": "X", "qty": 1}
    payload = {"operator_name": "Person A"}
    context = {
        "record_id": "stock:1",
        "type_name": "StockMovement",
        "type_revision": "stock-v1",
        "semantic_core": core,
        "payload": payload,
        "source_evidence": (),
    }
    proof = store.issue_proof(operation="create", path="action", target="stock:1", context=context)
    store.create_record(
        operation_id="create:1",
        path="action",
        proof=proof,
        record_id="stock:1",
        type_name="StockMovement",
        semantic_core=core,
        payload=payload,
    )


class PhysicalAppendOnlyCompetitorTests(unittest.TestCase):
    def test_physical_append_only_prevents_payload_erasure(self) -> None:
        store = configured()
        create(store)
        with self.assertRaises(ModelError):
            store.redact_payload()

    def test_physical_append_only_prevents_representation_migration(self) -> None:
        store = configured()
        create(store)
        with self.assertRaises(ModelError):
            store.migrate_representation()

    def test_append_only_strength_does_not_by_itself_prove_event_base_sort(self) -> None:
        store = configured()
        create(store)
        self.assertEqual(store.read("stock:1").semantic_core, {"sku": "X", "qty": 1})
        # The competitor's limitation is physical mutability, not inability to
        # represent the occurrence. No Event base class is involved here.
        self.assertEqual(store.read("stock:1").type_name, "StockMovement")


if __name__ == "__main__":
    unittest.main()
