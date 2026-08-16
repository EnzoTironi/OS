#!/usr/bin/env python3
from __future__ import annotations

import unittest

from hypothesis import given, settings, strategies as st

from reference_model import (
    ComputationDef,
    ComputationMutation,
    Decision,
    DefinitionGraphDispatcher,
    EvaluationContext,
    ExecutableRelationDispatcher,
    GraphRule,
    InlineContractEngine,
    OperationSignature,
    RefinedTypeEngine,
    RefinementDenied,
    RefinementEvaluationError,
    RuleResult,
    StaleProof,
    TriggerRelation,
    TypeDef,
    WrongProof,
    actor_is_alice,
    amount_under_limit,
    balanced_pending,
    deny,
    evaluator_error,
    permit,
    positive_value,
)


def make_engine() -> RefinedTypeEngine:
    engine = RefinedTypeEngine()
    for name, fn, rev in [
        ("permit", permit, "permit-v1"),
        ("deny", deny, "deny-v1"),
        ("error", evaluator_error, "error-v1"),
        ("balanced", balanced_pending, "balance-v3"),
        ("alice", actor_is_alice, "actor-policy-v2"),
        ("limit", amount_under_limit, "limit-policy-v5"),
        ("positive", positive_value, "positive-v1"),
    ]:
        engine.add_computation(ComputationDef(name, fn, revision=rev))

    capability = frozenset({"capability"})
    engine.add_type(TypeDef("PreviewPermit", ("alice",), capability, freshness="current"))
    engine.add_type(TypeDef("CommitPermit", ("alice", "limit"), capability, freshness="current"))
    engine.add_type(TypeDef("AdminPermit", ("alice",), capability, freshness="current"))
    engine.add_type(TypeDef("PostStateValid", ("balanced",), capability, freshness="current"))
    engine.add_type(TypeDef("ReadPermit", ("alice",), capability, freshness="current"))
    engine.add_type(TypeDef("EffectAttemptPermit", ("alice",), capability, freshness="current"))
    engine.add_type(TypeDef("UpdatePermitOccurrence", ("deny",), capability, freshness="current"))
    engine.add_type(TypeDef("ExplicitErrorPermit", ("error",), capability, freshness="current"))
    engine.add_type(TypeDef("PinnedApproval", ("alice",), capability, freshness="pinned"))

    # Same Type/refinement mechanism, but not an authority capability.
    engine.add_type(TypeDef("PositiveAmount", ("positive",), frozenset({"value"})))

    engine.add_signature(OperationSignature("preview:Purchase", ("PreviewPermit",)))
    engine.add_signature(OperationSignature("commit:Purchase", ("CommitPermit", "PostStateValid")))
    engine.add_signature(OperationSignature("admin:ledger", ("AdminPermit", "PostStateValid")))
    engine.add_signature(OperationSignature("read:Journal", ("ReadPermit",)))
    engine.add_signature(OperationSignature("effect-attempt", ("EffectAttemptPermit",)))
    engine.add_signature(OperationSignature("update:Occurrence", ("UpdatePermitOccurrence",)))
    engine.add_signature(OperationSignature("consume-pinned", ("PinnedApproval",)))
    return engine


class HiddenRecreationTests(unittest.TestCase):
    def test_definition_graph_is_storage_reduction_not_semantic_reduction(self) -> None:
        engine = DefinitionGraphDispatcher()
        engine.rules.append(GraphRule("balanced", "balanced", "ledger", "commit"))
        with self.assertRaises(RefinementDenied):
            engine.enforce("commit", "ledger", {"balanced": lambda: False})
        self.assertEqual(engine.dispatch_calls, 1)

    def test_executable_relation_trigger_is_rulebinding_superform(self) -> None:
        engine = ExecutableRelationDispatcher()
        engine.relations.append(TriggerRelation("ledger", "balanced", "commit"))
        with self.assertRaises(RefinementDenied):
            engine.execute_trigger("commit", "ledger", {"balanced": lambda: False})
        self.assertEqual(engine.trigger_dispatches, 1)

    def test_inline_action_contract_leaks_through_admin_path(self) -> None:
        engine = InlineContractEngine()
        with self.assertRaises(RefinementDenied):
            engine.post_action(10, 9)
        engine.admin_mutate(10, 9)
        self.assertEqual(engine.state, {"debits": 10, "credits": 9})


class GenericRefinedTypeTests(unittest.TestCase):
    def test_same_refinement_mechanism_validates_non_capability_business_value(self) -> None:
        engine = make_engine()
        amount = engine.construct("PositiveAmount", payload=42)
        self.assertEqual(amount.payload, 42)
        self.assertEqual(amount.type_name, "PositiveAmount")
        self.assertIn("positive:42", amount.evidence)

        with self.assertRaises(RefinementDenied):
            engine.construct("PositiveAmount", payload=-1)

    def test_ordinary_refined_value_cannot_be_used_as_operation_authority(self) -> None:
        engine = make_engine()
        amount = engine.construct("PositiveAmount", payload=10, target="Purchase")
        with self.assertRaises(WrongProof):
            engine.preview("Purchase", amount)


class ProofCapabilityTests(unittest.TestCase):
    def test_global_post_state_invariant_covers_action_and_admin_paths(self) -> None:
        for operation_name, permit_type in [
            ("commit:Purchase", "CommitPermit"),
            ("admin:ledger", "AdminPermit"),
        ]:
            with self.subTest(operation_name=operation_name):
                engine = make_engine()
                engine.state.update({"limit": 100, "debits": 0, "credits": 0})
                pending = {**engine.state, "debits": 10, "credits": 9}
                target = "Purchase" if operation_name.startswith("commit") else "ledger"
                permit_value = engine.construct(
                    permit_type,
                    target=target,
                    operation_id="OP",
                    actor="alice",
                    inputs={"amount": 5},
                )
                with self.assertRaises(RefinementDenied):
                    engine.construct(
                        "PostStateValid",
                        target=target,
                        operation_id="OP",
                        actor="alice",
                        pending_state=pending,
                    )
                self.assertEqual(engine.state["debits"], 0)
                self.assertEqual(engine.state["credits"], 0)
                with self.assertRaises(WrongProof):
                    engine.authoritative_commit(
                        operation_name=operation_name,
                        target=target,
                        operation_id="OP",
                        proposed_state=pending,
                        proofs={permit_type: permit_value},
                    )

    def test_balanced_commit_succeeds_and_records_evaluator_revisions(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 10, "credits": 10}
        commit = engine.construct(
            "CommitPermit", target="Purchase", operation_id="OP", actor="alice", inputs={"amount": 5}
        )
        valid = engine.construct(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        engine.authoritative_commit(
            operation_name="commit:Purchase",
            target="Purchase",
            operation_id="OP",
            proposed_state=pending,
            proofs={"CommitPermit": commit, "PostStateValid": valid},
        )
        self.assertEqual(engine.state["debits"], 10)
        self.assertIn(("limit", "limit-policy-v5"), engine.audit[-1]["evaluator_revisions"])
        self.assertIn(("balanced", "balance-v3"), engine.audit[-1]["evaluator_revisions"])

    def test_authorization_deny_and_evaluator_error_remain_distinct(self) -> None:
        engine = make_engine()
        engine.state["limit"] = 10
        with self.assertRaises(RefinementDenied) as denied:
            engine.construct(
                "CommitPermit", target="Purchase", operation_id="D", actor="bob", inputs={"amount": 5}
            )
        self.assertIn("actor:bob", denied.exception.evidence)

        with self.assertRaises(RefinementEvaluationError) as errored:
            engine.construct("ExplicitErrorPermit", target="X", actor="alice")
        self.assertIn("evaluation-error", errored.exception.evidence)

    def test_preview_capability_cannot_authorize_commit(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        preview = engine.construct("PreviewPermit", target="Purchase", operation_id="OP", actor="alice")
        engine.preview("Purchase", preview, operation_id="OP")
        pending = {**engine.state, "debits": 1, "credits": 1}
        valid = engine.construct(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        with self.assertRaises(WrongProof):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                proofs={"PreviewPermit": preview, "PostStateValid": valid},
            )

    def test_current_capability_becomes_stale_after_revision_change(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        commit = engine.construct(
            "CommitPermit", target="Purchase", operation_id="OP", actor="alice", inputs={"amount": 5}
        )
        engine.create_occurrence("external-observation", {"kind": "unrelated-revision-change"})
        pending = {**engine.state, "debits": 2, "credits": 2}
        valid = engine.construct(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        with self.assertRaises(StaleProof):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                proofs={"CommitPermit": commit, "PostStateValid": valid},
            )

    def test_pinned_capability_survives_unrelated_revision_but_not_basis_change(self) -> None:
        engine = make_engine()
        pinned = {"proposal": "P1", "amount": 20}
        proof = engine.construct(
            "PinnedApproval", target="approval:P1", operation_id="OP", actor="alice", pinned_state=pinned
        )
        engine.create_occurrence("other", {"x": 1})
        engine._verify_signature(
            "consume-pinned",
            {"PinnedApproval": proof},
            target="approval:P1",
            operation_id="OP",
            pinned_state=pinned,
        )
        with self.assertRaises(StaleProof):
            engine._verify_signature(
                "consume-pinned",
                {"PinnedApproval": proof},
                target="approval:P1",
                operation_id="OP",
                pinned_state={"proposal": "P1", "amount": 21},
            )

    def test_read_and_effect_attempt_have_distinct_typed_authority(self) -> None:
        engine = make_engine()
        read = engine.construct("ReadPermit", target="Journal", actor="alice")
        self.assertEqual(engine.read("Journal", read), {})

        effect = engine.construct("EffectAttemptPermit", target="E1", actor="alice")
        engine.effect_attempt("E1", effect)
        self.assertEqual(engine.effects_attempted, ["E1"])

        with self.assertRaises(WrongProof):
            engine.effect_attempt("E1", read)

    def test_occurrence_update_cannot_obtain_required_capability(self) -> None:
        engine = make_engine()
        engine.create_occurrence("J1", {"debits": 10, "credits": 10})
        with self.assertRaises(RefinementDenied):
            engine.construct("UpdatePermitOccurrence", target="Occurrence", actor="alice")
        self.assertEqual(engine.occurrences["J1"]["debits"], 10)

    def test_computation_cannot_mutate_even_when_used_as_refinement(self) -> None:
        engine = make_engine()

        def malicious(ctx: EvaluationContext) -> RuleResult:
            ctx.engine.state["money"] = 999
            return RuleResult(Decision.PERMIT, ("malicious",))

        engine.add_computation(ComputationDef("malicious", malicious, revision="evil"))
        engine.add_type(TypeDef("MaliciousPermit", ("malicious",), frozenset({"capability"}), freshness="current"))
        with self.assertRaises(ComputationMutation):
            engine.construct("MaliciousPermit", target="X")
        self.assertNotIn("money", engine.state)

    @settings(max_examples=150, deadline=None)
    @given(
        debits=st.integers(min_value=-1_000_000, max_value=1_000_000),
        credits=st.integers(min_value=-1_000_000, max_value=1_000_000),
        admin=st.booleans(),
    )
    def test_no_authoritative_path_can_commit_unbalanced_post_state(
        self, debits: int, credits: int, admin: bool
    ) -> None:
        engine = make_engine()
        engine.state.update({"limit": 10_000_000, "debits": 0, "credits": 0})
        target = "ledger" if admin else "Purchase"
        operation_name = "admin:ledger" if admin else "commit:Purchase"
        permit_type = "AdminPermit" if admin else "CommitPermit"
        permit_value = engine.construct(
            permit_type,
            target=target,
            operation_id="OP",
            actor="alice",
            inputs={"amount": 0},
        )
        pending = {**engine.state, "debits": debits, "credits": credits}
        if debits != credits:
            with self.assertRaises(RefinementDenied):
                engine.construct(
                    "PostStateValid", target=target, operation_id="OP", actor="alice", pending_state=pending
                )
            return

        valid = engine.construct(
            "PostStateValid", target=target, operation_id="OP", actor="alice", pending_state=pending
        )
        engine.authoritative_commit(
            operation_name=operation_name,
            target=target,
            operation_id="OP",
            proposed_state=pending,
            proofs={permit_type: permit_value, "PostStateValid": valid},
        )
        self.assertEqual(engine.state["debits"], engine.state["credits"])


if __name__ == "__main__":
    unittest.main()
