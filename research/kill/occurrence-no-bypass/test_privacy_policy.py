#!/usr/bin/env python3
from __future__ import annotations

import unittest

from atomic_model import AtomicSemanticStore
from reference_model import RedactionViolation, TypeRevision, Unauthorized


def make_store() -> AtomicSemanticStore:
    store = AtomicSemanticStore()
    store.register_type(
        TypeRevision(
            "CustomerObservation",
            "obs-v1",
            frozenset({"sealed_semantics"}),
            payload_fields=frozenset({"email"}),
            # Historical type did not originally declare email erasable.
            redactable_payload_fields=frozenset(),
        )
    )
    core = {"customer_ref": "customer:1", "observed_at": "2026-01-01"}
    payload = {"email": "person@example.com"}
    context = {
        "record_id": "obs:1",
        "type_name": "CustomerObservation",
        "type_revision": "obs-v1",
        "semantic_core": core,
        "payload": payload,
        "source_evidence": (),
    }
    proof = store.issue_proof(operation="create", path="ingest", target="obs:1", context=context)
    store.create_record(
        operation_id="create:obs:1",
        path="ingest",
        proof=proof,
        record_id="obs:1",
        type_name="CustomerObservation",
        semantic_core=core,
        payload=payload,
    )
    return store


class CurrentPrivacyPolicyTests(unittest.TestCase):
    def test_current_policy_can_make_old_payload_field_erasable_without_reinterpreting_record(self) -> None:
        store = make_store()
        before_core = store.read("obs:1").semantic_core
        store.set_privacy_policy(
            type_name="CustomerObservation",
            revision="privacy-2026-v2",
            erasable_fields=["email"],
        )
        context = {
            "record_id": "obs:1",
            "fields": ["email"],
            "retain_digest": False,
            "privacy_policy_revision": "privacy-2026-v2",
        }
        proof = store.issue_proof(operation="redact", path="privacy", target="obs:1", context=context)
        store.redact_payload(
            operation_id="redact:obs:1",
            path="privacy",
            proof=proof,
            record_id="obs:1",
            fields=["email"],
        )
        after = store.read("obs:1")
        self.assertEqual(after.semantic_core, before_core)
        self.assertIsNone(after.payload["email"])
        self.assertIn("privacy-policy=privacy-2026-v2", store.history[-1].note or "")

    def test_historical_type_default_does_not_override_current_privacy_policy(self) -> None:
        store = make_store()
        context = {
            "record_id": "obs:1",
            "fields": ["email"],
            "retain_digest": False,
            "privacy_policy_revision": "type-default:obs-v1",
        }
        proof = store.issue_proof(operation="redact", path="privacy", target="obs:1", context=context)
        with self.assertRaises(RedactionViolation):
            store.redact_payload(
                operation_id="redact:old-policy",
                path="privacy",
                proof=proof,
                record_id="obs:1",
                fields=["email"],
            )
        self.assertEqual(store.read("obs:1").payload["email"], "person@example.com")

    def test_proof_bound_to_old_privacy_revision_does_not_survive_policy_revision_change(self) -> None:
        store = make_store()
        store.set_privacy_policy(
            type_name="CustomerObservation",
            revision="privacy-2026-v2",
            erasable_fields=["email"],
        )
        old_context = {
            "record_id": "obs:1",
            "fields": ["email"],
            "retain_digest": False,
            "privacy_policy_revision": "privacy-2026-v2",
        }
        old_proof = store.issue_proof(operation="redact", path="privacy", target="obs:1", context=old_context)

        # The policy is revised again. Email remains erasable, but the exact
        # authority basis changed; a proof issued under v2 is stale for v3.
        store.set_privacy_policy(
            type_name="CustomerObservation",
            revision="privacy-2026-v3",
            erasable_fields=["email"],
        )
        with self.assertRaises(Unauthorized):
            store.redact_payload(
                operation_id="redact:stale-proof",
                path="privacy",
                proof=old_proof,
                record_id="obs:1",
                fields=["email"],
            )
        self.assertEqual(store.read("obs:1").payload["email"], "person@example.com")


if __name__ == "__main__":
    unittest.main()
