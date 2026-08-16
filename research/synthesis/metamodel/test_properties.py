#!/usr/bin/env python3
from __future__ import annotations

import unittest

from hypothesis import assume, given, settings, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from reference_model import (
    ActionDef,
    ActionPlan,
    CardinalityViolation,
    ComputationDef,
    EffectKnowledge,
    EvaluationContext,
    IntentMismatch,
    Mutation,
    ReducedEngine,
    RelationDef,
    RuleBinding,
    RuleDenied,
    TypeDef,
    TypeNature,
    TypeViolation,
    UnsafeRetry,
    always_deny,
)


class ReductionPropertyTests(unittest.TestCase):
    def _increment_engine(self) -> ReducedEngine:
        engine = ReducedEngine()

        def plan(ctx: EvaluationContext) -> ActionPlan:
            return ActionPlan(
                [Mutation("increment_state", (ctx.inputs["key"], ctx.inputs["delta"]))],
                result=ctx.inputs["delta"],
            )

        engine.add_computation(ComputationDef("plan", plan, execution_class="planner"))
        engine.add_action(ActionDef("Increment", "plan"))
        return engine

    @settings(max_examples=200, deadline=None)
    @given(
        key=st.text(alphabet=st.characters(categories=("Lu", "Ll", "Nd")), min_size=1, max_size=12),
        delta=st.integers(min_value=-1_000_000, max_value=1_000_000),
    )
    def test_action_replay_is_exactly_once_for_same_semantic_operation(self, key: str, delta: int) -> None:
        engine = self._increment_engine()
        digest = f"{key}:{delta}"
        first = engine.invoke_action("Increment", "OP", digest, {"key": key, "delta": delta}, actor="A")
        second = engine.invoke_action("Increment", "OP", digest, {"key": key, "delta": delta}, actor="A")
        self.assertEqual(first, second)
        self.assertEqual(engine.business_state[key], delta)
        self.assertEqual(len(engine.operations), 1)

    @settings(max_examples=200, deadline=None)
    @given(
        first=st.integers(min_value=-1000, max_value=1000),
        second=st.integers(min_value=-1000, max_value=1000),
    )
    def test_changed_intent_cannot_reuse_operation_identity(self, first: int, second: int) -> None:
        assume(first != second)
        engine = self._increment_engine()
        engine.invoke_action("Increment", "OP", f"x:{first}", {"key": "x", "delta": first}, actor="A")
        with self.assertRaises(IntentMismatch):
            engine.invoke_action("Increment", "OP", f"x:{second}", {"key": "x", "delta": second}, actor="A")
        self.assertEqual(engine.business_state["x"], first)

    def _occurrence_engine(self) -> ReducedEngine:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Occurrence", contracts={"occurrence"}))
        engine.add_computation(ComputationDef("deny", always_deny, execution_class="decision"))
        engine.add_binding(RuleBinding("no-update", "deny", "type", "Occurrence", "lifecycle:update"))
        engine.add_binding(RuleBinding("no-delete", "deny", "type", "Occurrence", "lifecycle:delete"))
        return engine

    @settings(max_examples=150, deadline=None)
    @given(
        original=st.dictionaries(
            keys=st.text(min_size=1, max_size=8),
            values=st.integers(),
            min_size=0,
            max_size=6,
        ),
        change=st.dictionaries(
            keys=st.text(min_size=1, max_size=8),
            values=st.integers(),
            min_size=1,
            max_size=6,
        ),
    )
    def test_occurrence_contract_rejects_arbitrary_update_and_preserves_payload(
        self, original: dict[str, int], change: dict[str, int]
    ) -> None:
        engine = self._occurrence_engine()
        engine.create_entity("Occurrence", "E", original)
        with self.assertRaises(RuleDenied):
            engine.update_entity("E", change)
        self.assertEqual(engine.entities["E"].data, original)

    @settings(max_examples=150, deadline=None)
    @given(value1=st.integers(), value2=st.integers())
    def test_relation_max_one_is_generic_for_scalar_property(self, value1: int, value2: int) -> None:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Thing"))
        engine.add_type(TypeDef("Scalar", TypeNature.VALUE))
        engine.add_relation(RelationDef("property", "Thing", "Scalar", max_per_source=1))
        engine.create_entity("Thing", "T")
        engine.relate("property", "T", engine.typed_value("Scalar", value1))
        with self.assertRaises(CardinalityViolation):
            engine.relate("property", "T", engine.typed_value("Scalar", value2))

    def test_relation_wrong_endpoint_kind_is_rejected(self) -> None:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Thing"))
        engine.add_type(TypeDef("Other"))
        engine.add_type(TypeDef("Scalar", TypeNature.VALUE))
        engine.add_relation(RelationDef("property", "Thing", "Scalar", max_per_source=1))
        engine.create_entity("Thing", "T")
        engine.create_entity("Other", "O")
        with self.assertRaises(TypeViolation):
            engine.relate("property", "T", engine.ref("O"))

    def _effect_engine(self) -> ReducedEngine:
        engine = ReducedEngine()
        engine.add_computation(
            ComputationDef(
                "plan",
                lambda _: ActionPlan([Mutation("request_effect", ("E",))], result="committed"),
                execution_class="planner",
            )
        )
        engine.add_action(ActionDef("Remote", "plan"))
        engine.invoke_action("Remote", "OP", "remote:E", {}, actor="A")
        return engine

    def test_later_sent_no_response_cannot_degrade_known_pending(self) -> None:
        engine = self._effect_engine()
        self.assertEqual(engine.effect_attempt("E", "accepted_pending"), EffectKnowledge.PENDING)
        self.assertEqual(engine.effect_attempt("E", "sent_no_response"), EffectKnowledge.PENDING)
        self.assertEqual(engine.effects["E"].attempts, ["accepted_pending", "sent_no_response"])

    def test_conflicting_terminal_effect_evidence_becomes_contradicted(self) -> None:
        engine = self._effect_engine()
        self.assertEqual(engine.effect_attempt("E", "confirmed"), EffectKnowledge.CONFIRMED)
        self.assertEqual(engine.effect_attempt("E", "rejected"), EffectKnowledge.CONTRADICTED)
        self.assertEqual(engine.effect_attempt("E", "confirmed"), EffectKnowledge.CONTRADICTED)


class EffectKnowledgeMachine(RuleBasedStateMachine):
    """Stateful attack on #41 semantics after Effect is demoted from the base forms."""

    def __init__(self) -> None:
        super().__init__()
        self.engine = ReducedEngine()
        self.engine.add_computation(
            ComputationDef(
                "plan",
                lambda _: ActionPlan([Mutation("request_effect", ("E",))], result="committed"),
                execution_class="planner",
            )
        )
        self.engine.add_action(ActionDef("Remote", "plan"))
        self.engine.invoke_action("Remote", "OP", "remote:E", {}, actor="A")

    @rule()
    def definitely_not_sent(self) -> None:
        before = self.engine.effects["E"].knowledge
        after = self.engine.effect_attempt("E", "definitely_not_sent")
        self.assert_equal(after, before)

    @rule()
    def sent_no_response(self) -> None:
        before = self.engine.effects["E"].knowledge
        after = self.engine.effect_attempt("E", "sent_no_response")
        expected = EffectKnowledge.INDETERMINATE if before is EffectKnowledge.NOT_ATTEMPTED else before
        self.assert_equal(after, expected)

    @rule()
    def accepted_pending(self) -> None:
        before = self.engine.effects["E"].knowledge
        after = self.engine.effect_attempt("E", "accepted_pending")
        expected = (
            EffectKnowledge.PENDING
            if before in {EffectKnowledge.NOT_ATTEMPTED, EffectKnowledge.INDETERMINATE}
            else before
        )
        self.assert_equal(after, expected)

    @rule()
    def confirmed(self) -> None:
        before = self.engine.effects["E"].knowledge
        after = self.engine.effect_attempt("E", "confirmed")
        expected = (
            EffectKnowledge.CONTRADICTED
            if before in {EffectKnowledge.REJECTED, EffectKnowledge.CONTRADICTED}
            else EffectKnowledge.CONFIRMED
        )
        self.assert_equal(after, expected)

    @rule()
    def rejected(self) -> None:
        before = self.engine.effects["E"].knowledge
        after = self.engine.effect_attempt("E", "rejected")
        expected = (
            EffectKnowledge.CONTRADICTED
            if before in {EffectKnowledge.CONFIRMED, EffectKnowledge.CONTRADICTED}
            else EffectKnowledge.REJECTED
        )
        self.assert_equal(after, expected)

    @rule()
    def retry_without_remote_dedupe(self) -> None:
        knowledge = self.engine.effects["E"].knowledge
        if knowledge is EffectKnowledge.NOT_ATTEMPTED:
            self.engine.retry_effect("E", protocol_has_safe_dedupe=False)
            return
        try:
            self.engine.retry_effect("E", protocol_has_safe_dedupe=False)
        except UnsafeRetry:
            return
        raise AssertionError(f"generic retry unexpectedly allowed from {knowledge.value}")

    @invariant()
    def stable_local_identity_and_no_required_remote_key(self) -> None:
        request = self.engine.effects["E"]
        self.assert_equal(request.effect_id, "E")
        self.assert_equal(request.parent_operation_id, "OP")
        self.assert_equal(request.remote_key, None)

    @staticmethod
    def assert_equal(left: object, right: object) -> None:
        if left != right:
            raise AssertionError(f"{left!r} != {right!r}")


TestEffectKnowledgeMachine = EffectKnowledgeMachine.TestCase
TestEffectKnowledgeMachine.settings = settings(max_examples=100, stateful_step_count=50, deadline=None)


if __name__ == "__main__":
    unittest.main()
