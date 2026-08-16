#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    Attempt,
    AttemptEvidence,
    EffectBook,
    EffectRequest,
    Knowledge,
    Observation,
    ProtocolContract,
    digest,
)


class EffectSemanticsTests(unittest.TestCase):
    def protocol(self, *, idempotent=False, window=False, readback=False):
        return ProtocolContract("provider-v1", idempotent, window, readback)

    def request(self, protocol=None):
        return EffectRequest(
            effect_request_id="E1",
            local_operation_id="O1",
            intent_digest=digest("pay 100"),
            remote_operation_id="R1",
            protocol=protocol or self.protocol(),
        )

    def test_timeout_after_send_is_indeterminate_not_failure(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)

    def test_definitely_not_sent_can_retry(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.DEFINITELY_NOT_SENT))
        self.assertTrue(effect.can_retry_same_remote_operation()[0])

    def test_later_not_sent_attempt_does_not_erase_earlier_unknown_send(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        effect.record_attempt(Attempt("A2", AttemptEvidence.DEFINITELY_NOT_SENT))
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)

    def test_indeterminate_retry_requires_current_idempotency_contract(self):
        unsafe = self.request(self.protocol(idempotent=False, window=False))
        unsafe.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertFalse(unsafe.can_retry_same_remote_operation()[0])

        safe = self.request(self.protocol(idempotent=True, window=True))
        safe.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertTrue(safe.can_retry_same_remote_operation()[0])

    def test_async_acceptance_is_pending_and_should_not_resubmit(self):
        effect = self.request(self.protocol(idempotent=True, window=True))
        effect.record_attempt(Attempt("A1", AttemptEvidence.ACCEPTED_PENDING, remote_receipt_id="job-1"))
        self.assertEqual(effect.knowledge, Knowledge.PENDING)
        self.assertFalse(effect.can_retry_same_remote_operation()[0])

    def test_authoritative_observation_reconciles_pending_to_success(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.ACCEPTED_PENDING))
        changed = effect.reconcile(Observation("W1", "R1", Knowledge.CONFIRMED_SUCCEEDED, True, provider_sequence=2))
        self.assertTrue(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONFIRMED_SUCCEEDED)

    def test_duplicate_observation_does_not_apply_twice(self):
        effect = self.request()
        obs = Observation("W1", "R1", Knowledge.CONFIRMED_SUCCEEDED, True, provider_sequence=2)
        self.assertTrue(effect.reconcile(obs))
        self.assertFalse(effect.reconcile(obs))
        self.assertEqual(len(effect.observations), 1)

    def test_out_of_order_provider_observation_does_not_regress(self):
        effect = self.request()
        effect.reconcile(Observation("W2", "R1", Knowledge.CONFIRMED_SUCCEEDED, True, provider_sequence=20))
        changed = effect.reconcile(Observation("W1", "R1", Knowledge.PENDING, True, provider_sequence=10))
        self.assertFalse(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONFIRMED_SUCCEEDED)

    def test_newer_incompatible_terminal_evidence_becomes_contradicted(self):
        effect = self.request()
        effect.reconcile(Observation("W1", "R1", Knowledge.CONFIRMED_SUCCEEDED, True, provider_sequence=10))
        changed = effect.reconcile(Observation("W2", "R1", Knowledge.CONFIRMED_REJECTED, True, provider_sequence=20))
        self.assertTrue(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONTRADICTED)

    def test_non_authoritative_observation_is_preserved_but_does_not_confirm(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        changed = effect.reconcile(Observation("W1", "R1", Knowledge.CONFIRMED_SUCCEEDED, False))
        self.assertFalse(changed)
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)
        self.assertIn("W1", effect.observations)

    def test_exact_correlation_is_required_by_toy_model(self):
        effect = self.request()
        with self.assertRaises(ValueError):
            effect.reconcile(Observation("W1", "OTHER", Knowledge.CONFIRMED_SUCCEEDED, True))

    def test_same_effect_id_cannot_be_reused_for_different_intent(self):
        book = EffectBook()
        book.create(self.request())
        changed = EffectRequest("E1", "O1", digest("pay 1000"), "R1", self.protocol())
        with self.assertRaises(ValueError):
            book.create(changed)

    def test_two_identical_payload_effects_can_be_intentional(self):
        book = EffectBook()
        e1 = self.request()
        e2 = EffectRequest("E2", "O2", e1.intent_digest, "R2", self.protocol())
        book.create(e1)
        book.create(e2)
        self.assertEqual(len(book.requests), 2)

    def test_cancel_before_attempt_does_not_create_remote_outcome(self):
        effect = self.request()
        self.assertTrue(effect.cancel_before_attempt())
        self.assertEqual(effect.knowledge, Knowledge.CANCELLED_BEFORE_ATTEMPT)
        with self.assertRaises(ValueError):
            effect.record_attempt(Attempt("A1", AttemptEvidence.ACCEPTED_PENDING))

    def test_cannot_local_cancel_after_attempt_as_if_nothing_happened(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertFalse(effect.cancel_before_attempt())
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)

    def test_compensation_is_new_effect_and_preserves_original(self):
        book = EffectBook()
        original = book.create(self.request())
        original.record_attempt(Attempt("A1", AttemptEvidence.CONFIRMED_SUCCEEDED))
        compensation = book.compensate(
            "E1",
            new_effect_id="E-refund",
            new_local_operation_id="O-refund",
            intent="refund 100",
            remote_operation_id="R-refund",
            protocol=self.protocol(idempotent=True, window=True),
        )
        self.assertEqual(original.knowledge, Knowledge.CONFIRMED_SUCCEEDED)
        self.assertEqual(compensation.knowledge, Knowledge.NOT_ATTEMPTED)
        self.assertNotEqual(original.effect_request_id, compensation.effect_request_id)

    def test_cannot_compensate_effect_not_known_to_have_happened(self):
        book = EffectBook()
        original = book.create(self.request())
        original.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        with self.assertRaises(ValueError):
            book.compensate(
                "E1",
                new_effect_id="E2",
                new_local_operation_id="O2",
                intent="refund 100",
                remote_operation_id="R2",
                protocol=self.protocol(),
            )


if __name__ == "__main__":
    unittest.main()
