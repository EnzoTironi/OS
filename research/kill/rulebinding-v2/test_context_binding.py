#!/usr/bin/env python3
from __future__ import annotations

import unittest
from dataclasses import replace

from context_bound_model import ContextBoundEngine, ContextMismatch, ForgedProof
from reference_model import (
    ComputationDef,
    OperationSignature,
    StaleProof,
    TypeDef,
    actor_is_alice,
    amount_under_limit,
    balanced_pending,
)


def make_context_engine() -> ContextBoundEngine:
    engine = ContextBoundEngine()
    for name, fn, rev in [
        ("balanced", balanced_pending, "balance-v3"),
        ("alice", actor_is_alice, "actor-policy-v2"),
        ("limit", amount_under_limit, "limit-policy-v5"),
    ]:
        engine.add_computation(ComputationDef(name, fn, revision=rev))
    cap = frozenset({"capability"})
    engine.add_type(TypeDef("CommitPermit", ("alice", "limit"), cap, freshness="current"))
    engine.add_type(TypeDef("PostStateValid", ("balanced",), cap, freshness="current"))
    engine.add_signature(OperationSignature("commit:Purchase", ("CommitPermit", "PostStateValid")))
    return engine


class ContextBindingTests(unittest.TestCase):
    def _proofs(self, engine: ContextBoundEngine, *, amount: int, pending: dict[str, int]):
        inputs = {"amount": amount}
        common = {
            "target": "Purchase",
            "operation_id": "OP",
            "actor": "alice",
            "inputs": inputs,
            "pending_state": pending,
        }
        return inputs, {
            "CommitPermit": engine.construct("CommitPermit", **common),
            "PostStateValid": engine.construct("PostStateValid", **common),
        }

    def test_valid_proofs_commit_exact_context(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 10, "credits": 10}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)
        engine.authoritative_commit(
            operation_name="commit:Purchase",
            target="Purchase",
            operation_id="OP",
            proposed_state=pending,
            inputs=inputs,
            proofs=proofs,
        )
        self.assertEqual(engine.state["debits"], 10)
        self.assertEqual(engine.audit[-1]["context_digest"], proofs["CommitPermit"].context_digest)

    def test_post_state_proof_cannot_be_reused_for_different_proposed_state(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        balanced = {**engine.state, "debits": 10, "credits": 10}
        inputs, proofs = self._proofs(engine, amount=5, pending=balanced)

        substituted = {**engine.state, "debits": 10, "credits": 9}
        with self.assertRaises(ContextMismatch):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=substituted,
                inputs=inputs,
                proofs=proofs,
            )
        self.assertEqual(engine.state["debits"], 0)
        self.assertEqual(engine.state["credits"], 0)

    def test_authorization_proof_cannot_be_reused_for_changed_inputs(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 1, "credits": 1}
        _, proofs = self._proofs(engine, amount=5, pending=pending)

        with self.assertRaises(ContextMismatch):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                inputs={"amount": 500},
                proofs=proofs,
            )
        self.assertEqual(engine.state["debits"], 0)

    def test_proof_payload_cannot_be_forged_without_runtime_seal(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 2, "credits": 2}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)

        # Keep the exact validated semantic context unchanged and tamper only
        # with a field protected by the runtime seal. Context validation should
        # therefore pass, and the forged proof must fail specifically because
        # its HMAC no longer matches the issued value.
        original = proofs["PostStateValid"]
        forged = replace(original, evidence=original.evidence + ("forged-evidence",))
        with self.assertRaises(ForgedProof):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                inputs=inputs,
                proofs={"CommitPermit": proofs["CommitPermit"], "PostStateValid": forged},
            )
        self.assertEqual(engine.state["debits"], 0)
        self.assertEqual(engine.state["credits"], 0)

    def test_context_bound_proof_is_still_invalidated_by_current_revision_change(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 3, "credits": 3}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)
        engine.create_occurrence("other", {"x": 1})
        with self.assertRaises(StaleProof):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                inputs=inputs,
                proofs=proofs,
            )


if __name__ == "__main__":
    unittest.main()
