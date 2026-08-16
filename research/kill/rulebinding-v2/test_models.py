#!/usr/bin/env python3
from __future__ import annotations

import unittest

from hypothesis import given, settings, strategies as st

from reference_model import (
    CapabilityDenied,
    CapabilityEngine,
    CapabilityEvaluationError,
    CapabilityType,
    ComputationDef,
    ComputationMutation,
    DefinitionGraphDispatcher,
    Decision,
    EvaluationContext,
    ExecutableRelationDispatcher,
    GraphRule,
    InlineContractEngine,
    OperationSignature,
    RuleResult,
    StaleCapability,
    TriggerRelation,
    WrongCapability,
    actor_is_alice,
    amount_under_limit,
    balanced_pending,
    deny,
    evaluator_error,
    permit,
)


def make_engine() -> CapabilityEngine:
    engine = CapabilityEngine()
    for name, fn, rev in [
        ("permit", permit, "permit-v1"),
        ("deny", deny, "deny-v1"),
        ("error", evaluator_error, "error-v1"),
        ("balanced", balanced_pending, "balance-v3"),
        ("alice", actor_is_alice, "actor-policy-v2"),
        ("limit", amount_under_limit, "limit-policy-v5"),
    ]:
        engine.add_computation(ComputationDef(name, fn, revision=rev))

    # Capability types are ordinary refined Type-contract instances in the
    # candidate. Locus is encoded by which value an operation signature needs.
    engine.add_capability_type(CapabilityType("PreviewPermit", ("alice",), freshness="current"))
    engine.add_capability_type(CapabilityType("CommitPermit", ("alice", "limit"), freshness="current"))
    engine.add_capability_type(CapabilityType("AdminPermit", ("alice",), freshness="current"))
    engine.add_capability_type(CapabilityType("PostStateValid", ("balanced",), freshness="current"))
    engine.add_capability_type(CapabilityType("ReadPermit", ("alice",), freshness="current"))
    engine.add_capability_type(CapabilityType("EffectAttemptPermit", ("alice",), freshness="current"))
    engine.add_capability_type(CapabilityType("UpdatePermitOccurrence", ("deny",), freshness="current"))
    engine.add_capability_type(CapabilityType("ExplicitErrorPermit", ("error",), freshness="current"))
    engine.add_capability_type(CapabilityType("PinnedApproval", ("alice",), freshness="pinned"))

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
        with self.assertRaises(CapabilityDenied):
            engine.enforce("commit", "ledger", {"balanced": lambda: False})
        self.assertEqual(engine.dispatch_calls, 1)
        # The decisive signal: runtime still searches rules by locus + target.

    def test_executable_relation_trigger_is_rulebinding_superform(self) -> None:
        engine = ExecutableRelationDispatcher()
        engine.relations.append(TriggerRelation("ledger", "balanced", "commit"))
        with self.assertRaises(CapabilityDenied):
            engine.execute_trigger("commit", "ledger", {"balanced": lambda: False})
        self.assertEqual(engine.trigger_dispatches, 1)
        # Relation became executable only by adding the dispatcher under attack.

    def test_inline_action_contract_leaks_through_admin_path(self) -> None:
        engine = InlineContractEngine()
        with self.assertRaises(CapabilityDenied):
            engine.post_action(10, 9)
        engine.admin_mutate(10, 9)
        self.assertEqual(engine.state, {"debits": 10, "credits": 9})


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
                permit_token = engine.mint(
                    permit_type,
                    target="Purchase" if operation_name.startswith("commit") else "ledger",
                    operation_id="OP",
                    actor="alice",
                    inputs={"amount": 5},
                )
                with self.assertRaises(CapabilityDenied):
                    engine.mint(
                        "PostStateValid",
                        target="Purchase" if operation_name.startswith("commit") else "ledger",
                        operation_id="OP",
                        actor="alice",
                        pending_state=pending,
                    )
                self.assertEqual(engine.state["debits"], 0)
                self.assertEqual(engine.state["credits"], 0)
                # No PostStateValid value exists, so signature cannot be satisfied.
                with self.assertRaises(WrongCapability):
                    engine.authoritative_commit(
                        operation_name=operation_name,
                        target="Purchase" if operation_name.startswith("commit") else "ledger",
                        operation_id="OP",
                        proposed_state=pending,
                        tokens={permit_type: permit_token},
                    )

    def test_balanced_commit_succeeds_and_records_evaluator_revisions(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        pending = {**engine.state, "debits": 10, "credits": 10}
        commit = engine.mint(
            "CommitPermit", target="Purchase", operation_id="OP", actor="alice", inputs={"amount": 5}
        )
        valid = engine.mint(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        engine.authoritative_commit(
            operation_name="commit:Purchase",
            target="Purchase",
            operation_id="OP",
            proposed_state=pending,
            tokens={"CommitPermit": commit, "PostStateValid": valid},
        )
        self.assertEqual(engine.state["debits"], 10)
        self.assertIn(("limit", "limit-policy-v5"), engine.audit[-1]["evaluator_revisions"])
        self.assertIn(("balanced", "balance-v3"), engine.audit[-1]["evaluator_revisions"])

    def test_authorization_deny_and_evaluator_error_remain_distinct(self) -> None:
        engine = make_engine()
        engine.state["limit"] = 10
        with self.assertRaises(CapabilityDenied) as denied:
            engine.mint(
                "CommitPermit", target="Purchase", operation_id="D", actor="bob", inputs={"amount": 5}
            )
        self.assertIn("actor:bob", denied.exception.evidence)

        with self.assertRaises(CapabilityEvaluationError) as errored:
            engine.mint("ExplicitErrorPermit", target="X", actor="alice")
        self.assertIn("evaluation-error", errored.exception.evidence)

    def test_preview_capability_cannot_authorize_commit(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        preview = engine.mint("PreviewPermit", target="Purchase", operation_id="OP", actor="alice")
        engine.preview("Purchase", preview, operation_id="OP")
        pending = {**engine.state, "debits": 1, "credits": 1}
        valid = engine.mint(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        with self.assertRaises(WrongCapability):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                tokens={"PreviewPermit": preview, "PostStateValid": valid},
            )

    def test_current_capability_becomes_stale_after_revision_change(self) -> None:
        engine = make_engine()
        engine.state.update({"limit": 100, "debits": 0, "credits": 0})
        commit = engine.mint(
            "CommitPermit", target="Purchase", operation_id="OP", actor="alice", inputs={"amount": 5}
        )
        engine.create_occurrence("external-observation", {"kind": "unrelated-revision-change"})
        pending = {**engine.state, "debits": 2, "credits": 2}
        valid = engine.mint(
            "PostStateValid", target="Purchase", operation_id="OP", actor="alice", pending_state=pending
        )
        with self.assertRaises(StaleCapability):
            engine.authoritative_commit(
                operation_name="commit:Purchase",
                target="Purchase",
                operation_id="OP",
                proposed_state=pending,
                tokens={"CommitPermit": commit, "PostStateValid": valid},
            )

    def test_pinned_capability_survives_unrelated_revision_but_not_basis_change(self) -> None:
        engine = make_engine()
        pinned = {"proposal": "P1", "amount": 20}
        token = engine.mint(
            "PinnedApproval", target="approval:P1", operation_id="OP", actor="alice", pinned_state=pinned
        )
        engine.create_occurrence("other", {"x": 1})
        engine._verify_signature(
            "consume-pinned",
            {"PinnedApproval": token},
            target="approval:P1",
            operation_id="OP",
            pinned_state=pinned,
        )
        with self.assertRaises(StaleCapability):
            engine._verify_signature(
                "consume-pinned",
                {"PinnedApproval": token},
                target="approval:P1",
                operation_id="OP",
                pinned_state={"proposal": "P1", "amount": 21},
            )

    def test_read_and_effect_attempt_have_distinct_typed_authority(self) -> None:
        engine = make_engine()
        read = engine.mint("ReadPermit", target="Journal", actor="alice")
        self.assertEqual(engine.read("Journal", read), {})

        effect = engine.mint("EffectAttemptPermit", target="E1", actor="alice")
        engine.effect_attempt("E1", effect)
        self.assertEqual(engine.effects_attempted, ["E1"])

        with self.assertRaises(WrongCapability):
            engine.effect_attempt("E1", read)

    def test_occurrence_update_cannot_obtain_required_capability(self) -> None:
        engine = make_engine()
        engine.create_occurrence("J1", {"debits": 10, "credits": 10})
        with self.assertRaises(CapabilityDenied):
            engine.mint("UpdatePermitOccurrence", target="Occurrence", actor="alice")
        self.assertEqual(engine.occurrences["J1"]["debits"], 10)

    def test_computation_cannot_mutate_even_when_used_as_refinement(self) -> None:
        engine = make_engine()

        def malicious(ctx: EvaluationContext) -> RuleResult:
            ctx.engine.state["money"] = 999
            return RuleResult(Decision.PERMIT, ("malicious",))

        engine.add_computation(ComputationDef("malicious", malicious, revision="evil"))
        engine.add_capability_type(CapabilityType("MaliciousPermit", ("malicious",), freshness="current"))
        with self.assertRaises(ComputationMutation):
            engine.mint("MaliciousPermit", target="X")
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
        permit_token = engine.mint(
            permit_type,
            target=target,
            operation_id="OP",
            actor="alice",
            inputs={"amount": 0},
        )
        pending = {**engine.state, "debits": debits, "credits": credits}
        if debits != credits:
            with self.assertRaises(CapabilityDenied):
                engine.mint(
                    "PostStateValid", target=target, operation_id="OP", actor="alice", pending_state=pending
                )
            return

        valid = engine.mint(
            "PostStateValid", target=target, operation_id="OP", actor="alice", pending_state=pending
        )
        engine.authoritative_commit(
            operation_name=operation_name,
            target=target,
            operation_id="OP",
            proposed_state=pending,
            tokens={permit_type: permit_token, "PostStateValid": valid},
        )
        self.assertEqual(engine.state["debits"], engine.state["credits"])


if __name__ == "__main__":
    unittest.main()
