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

    def request(self, protocol=None, *, remote_dedup_key="client-key-1"):
        return EffectRequest(
            effect_request_id="E1",
            local_operation_id="O1",
            intent_digest=digest("pay 100"),
            protocol=protocol or self.protocol(),
            remote_dedup_key=remote_dedup_key,
        )

    def obs(self, observation_id, knowledge, authoritative=True, *, key="client-key-1", receipt=None, seq=None):
        return Observation(
            observation_id=observation_id,
            knowledge=knowledge,
            authoritative_for_outcome=authoritative,
            remote_dedup_key=key,
            remote_receipt_id=receipt,
            provider_sequence=seq,
        )

    def test_timeout_after_send_is_indeterminate_not_failure(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)

    def test_definitely_not_sent_can_retry_even_without_remote_dedup_key(self):
        effect = self.request(remote_dedup_key=None)
        effect.record_attempt(Attempt("A1", AttemptEvidence.DEFINITELY_NOT_SENT))
        self.assertTrue(effect.can_retry_same_remote_operation()[0])

    def test_later_not_sent_attempt_does_not_erase_earlier_unknown_send(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        effect.record_attempt(Attempt("A2", AttemptEvidence.DEFINITELY_NOT_SENT))
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)

    def test_indeterminate_retry_requires_remote_key_plus_current_idempotency_contract(self):
        no_key = self.request(self.protocol(idempotent=True, window=True), remote_dedup_key=None)
        no_key.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertFalse(no_key.can_retry_same_remote_operation()[0])

        no_contract = self.request(self.protocol(idempotent=False, window=False))
        no_contract.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertFalse(no_contract.can_retry_same_remote_operation()[0])

        safe = self.request(self.protocol(idempotent=True, window=True))
        safe.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        self.assertTrue(safe.can_retry_same_remote_operation()[0])

    def test_async_acceptance_can_learn_remote_receipt_after_send(self):
        effect = self.request(remote_dedup_key=None)
        effect.record_attempt(Attempt("A1", AttemptEvidence.ACCEPTED_PENDING, remote_receipt_id="job-1"))
        self.assertEqual(effect.knowledge, Knowledge.PENDING)
        self.assertIn("job-1", effect.known_remote_receipts)
        self.assertFalse(effect.can_retry_same_remote_operation()[0])

    def test_authoritative_observation_can_correlate_by_learned_receipt(self):
        effect = self.request(remote_dedup_key=None)
        effect.record_attempt(Attempt("A1", AttemptEvidence.ACCEPTED_PENDING, remote_receipt_id="job-1"))
        changed = effect.reconcile(
            self.obs("W1", Knowledge.CONFIRMED_SUCCEEDED, key=None, receipt="job-1", seq=2)
        )
        self.assertTrue(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONFIRMED_SUCCEEDED)

    def test_duplicate_observation_does_not_apply_twice(self):
        effect = self.request()
        observation = self.obs("W1", Knowledge.CONFIRMED_SUCCEEDED, seq=2)
        self.assertTrue(effect.reconcile(observation))
        self.assertFalse(effect.reconcile(observation))
        self.assertEqual(len(effect.observations), 1)

    def test_out_of_order_provider_observation_does_not_regress(self):
        effect = self.request()
        effect.reconcile(self.obs("W2", Knowledge.CONFIRMED_SUCCEEDED, seq=20))
        changed = effect.reconcile(self.obs("W1", Knowledge.PENDING, seq=10))
        self.assertFalse(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONFIRMED_SUCCEEDED)

    def test_newer_incompatible_terminal_evidence_becomes_contradicted(self):
        effect = self.request()
        effect.reconcile(self.obs("W1", Knowledge.CONFIRMED_SUCCEEDED, seq=10))
        changed = effect.reconcile(self.obs("W2", Knowledge.CONFIRMED_REJECTED, seq=20))
        self.assertTrue(changed)
        self.assertEqual(effect.knowledge, Knowledge.CONTRADICTED)

    def test_non_authoritative_observation_is_preserved_but_does_not_confirm(self):
        effect = self.request()
        effect.record_attempt(Attempt("A1", AttemptEvidence.SENT_NO_RESPONSE))
        changed = effect.reconcile(self.obs("W1", Knowledge.CONFIRMED_SUCCEEDED, authoritative=False))
        self.assertFalse(changed)
        self.assertEqual(effect.knowledge, Knowledge.INDETERMINATE)
        self.assertIn("W1", effect.observations)

    def test_uncorrelated_observation_is_not_forced_into_effect(self):
        effect = self.request(remote_dedup_key=None)
        with self.assertRaises(ValueError):
            effect.reconcile(self.obs("W1", Knowledge.CONFIRMED_SUCCEEDED, key=None, receipt="unknown"))

    def test_same_effect_id_cannot_be_reused_for_different_intent(self):
        book = EffectBook()
        book.create(self.request())
        changed = EffectRequest(
            "E1", "O1", digest("pay 1000"), self.protocol(), remote_dedup_key="client-key-1"
        )
        with self.assertRaises(ValueError):
            book.create(changed)

    def test_same_effect_id_cannot_silently_change_provider_dedup_key(self):
        book = EffectBook()
        book.create(self.request())
        changed = self.request(remote_dedup_key="other-key")
        with self.assertRaises(ValueError):
            book.create(changed)

    def test_two_identical_payload_effects_can_be_intentional_without_remote_keys(self):
        book = EffectBook()
        e1 = self.request(remote_dedup_key=None)
        e2 = EffectRequest("E2", "O2", e1.intent_digest, self.protocol(), remote_dedup_key=None)
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
            protocol=self.protocol(idempotent=True, window=True),
            remote_dedup_key="refund-key",
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
                protocol=self.protocol(),
            )


if __name__ == "__main__":
    unittest.main()
