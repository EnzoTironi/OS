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
    @staticmethod
    def _execution_context() -> dict:
        return {
            "actor": "alice",
            "represented_principal": "org:buyer",
            "workload": "svc:purchasing",
            "authority_context": {
                "tenant": "tenant:a",
                "environment": "prod",
                "session": "session:1",
            },
        }

    def _proofs(self, engine: ContextBoundEngine, *, amount: int, pending: dict[str, int]):
        inputs = {"amount": amount}
        common = {
            "target": "Purchase",
            "operation_id": "OP",
            **self._execution_context(),
            "inputs": inputs,
            "pending_state": pending,
        }
        return inputs, {
            "CommitPermit": engine.construct("CommitPermit", **common),
            "PostStateValid": engine.construct("PostStateValid", **common),
        }

    def _commit(
        self,
        engine: ContextBoundEngine,
        *,
        pending: dict[str, int],
        inputs: dict[str, int],
        proofs,
        execution_context: dict | None = None,
    ) -> None:
        engine.authoritative_commit(
            operation_name="commit:Purchase",
            target="Purchase",
            operation_id="OP",
            proposed_state=pending,
            inputs=inputs,
            proofs=proofs,
            **(execution_context or self._execution_context()),
        )

    def test_valid_proofs_commit_exact_context(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 10, "credits": 10}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)
        self._commit(engine, pending=pending, inputs=inputs, proofs=proofs)
        self.assertEqual(engine.state["debits"], 10)
        self.assertEqual(engine.audit[-1]["context_digest"], proofs["CommitPermit"].context_digest)
        self.assertEqual(engine.audit[-1]["actor"], "alice")
        self.assertEqual(engine.audit[-1]["represented_principal"], "org:buyer")
        self.assertEqual(engine.audit[-1]["workload"], "svc:purchasing")
        self.assertEqual(engine.audit[-1]["authority_context"]["tenant"], "tenant:a")
        self.assertEqual(engine.audit[-1]["authority_context"]["environment"], "prod")

    def test_post_state_proof_cannot_be_reused_for_different_proposed_state(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        balanced = {**engine.state, "debits": 10, "credits": 10}
        inputs, proofs = self._proofs(engine, amount=5, pending=balanced)

        substituted = {**engine.state, "debits": 10, "credits": 9}
        with self.assertRaises(ContextMismatch):
            self._commit(engine, pending=substituted, inputs=inputs, proofs=proofs)
        self.assertEqual(engine.state["debits"], 0)
        self.assertEqual(engine.state["credits"], 0)

    def test_authorization_proof_cannot_be_reused_for_changed_inputs(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 1, "credits": 1}
        _, proofs = self._proofs(engine, amount=5, pending=pending)

        with self.assertRaises(ContextMismatch):
            self._commit(engine, pending=pending, inputs={"amount": 500}, proofs=proofs)
        self.assertEqual(engine.state["debits"], 0)

    def test_authority_proof_cannot_cross_actor_principal_workload_or_authority_domain(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 4, "credits": 4}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)
        base = self._execution_context()

        substitutions = [
            {**base, "actor": "bob"},
            {**base, "represented_principal": "org:other"},
            {**base, "workload": "svc:untrusted"},
            {**base, "authority_context": {**base["authority_context"], "tenant": "tenant:b"}},
            {**base, "authority_context": {**base["authority_context"], "environment": "sandbox"}},
            {**base, "authority_context": {**base["authority_context"], "session": "session:2"}},
        ]
        for execution_context in substitutions:
            with self.subTest(execution_context=execution_context):
                with self.assertRaises(ContextMismatch):
                    self._commit(
                        engine,
                        pending=pending,
                        inputs=inputs,
                        proofs=proofs,
                        execution_context=execution_context,
                    )
                self.assertEqual(engine.state["debits"], 0)
                self.assertEqual(engine.state["credits"], 0)

    def test_proof_payload_cannot_be_forged_without_runtime_seal(self) -> None:
        engine = make_context_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 2, "credits": 2}
        inputs, proofs = self._proofs(engine, amount=5, pending=pending)

        original = proofs["PostStateValid"]
        forged = replace(original, evidence=original.evidence + ("forged-evidence",))
        with self.assertRaises(ForgedProof):
            self._commit(
                engine,
                pending=pending,
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
            self._commit(engine, pending=pending, inputs=inputs, proofs=proofs)


if __name__ == "__main__":
    unittest.main()
