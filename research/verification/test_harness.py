#!/usr/bin/env python3
from __future__ import annotations

import unittest

from hypothesis import given, settings, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from harness import (
    EffectKnowledge,
    SafetyModel,
    TraceOperation,
    ddmin,
    effect_uncertainty_erased,
    execute_trace,
    generated_trace,
)


class CrossOntologyPropertyTests(unittest.TestCase):
    """Property and deterministic regressions that unittest discovery actually executes."""

    @settings(max_examples=200, deadline=None)
    @given(st.integers(min_value=0, max_value=2**32 - 1), st.integers(min_value=1, max_value=120))
    def test_seeded_generated_traces_preserve_cross_family_model_invariants(self, seed: int, length: int) -> None:
        model = execute_trace(generated_trace(seed, length))
        self.assertEqual(model.invariant_violations(), [])

    @settings(max_examples=250, deadline=None)
    @given(
        st.lists(
            st.sampled_from(["OBS-A", "OBS-B", "OBS-C", "OBS-A"]),
            min_size=0,
            max_size=40,
        )
    )
    def test_duplicate_delivery_never_creates_more_occurrences_than_unique_observations(
        self, deliveries: list[str]
    ) -> None:
        model = SafetyModel()
        for observation_id in deliveries:
            model.deliver_observation(observation_id)
        self.assertEqual(model.business_occurrence_count, len(set(deliveries)))
        self.assertEqual(model.observations_seen, set(deliveries))

    @settings(max_examples=250, deadline=None)
    @given(
        st.text(min_size=1, max_size=20),
        st.integers(min_value=-10_000, max_value=10_000),
        st.integers(min_value=-10_000, max_value=10_000),
    )
    def test_derived_store_mutation_cannot_mutate_authoritative_value(
        self, key: str, authoritative: int, derived: int
    ) -> None:
        model = SafetyModel(authoritative_values={key: authoritative})
        model.mutate_derived(key, derived)
        self.assertEqual(model.authoritative_values[key], authoritative)
        self.assertEqual(model.derived_values[key], derived)

    @settings(max_examples=250, deadline=None)
    @given(
        st.sets(st.sampled_from(["read", "write", "approve", "pay", "admin"]), min_size=0),
        st.sets(st.sampled_from(["read", "write", "approve", "pay", "admin"]), min_size=0),
    )
    def test_delegation_never_broadens_parent_scope(
        self, parent_scopes: set[str], child_scopes: set[str]
    ) -> None:
        model = SafetyModel()
        model.grant_root("G0", "tenant-A", parent_scopes)
        result = model.delegate("G0", "G1", "tenant-A", child_scopes)
        if child_scopes.issubset(parent_scopes):
            self.assertEqual(result, "delegated")
            self.assertTrue(model.grants["G1"].scopes.issubset(model.grants["G0"].scopes))
        else:
            self.assertEqual(result, "scope_escalation")
            self.assertNotIn("G1", model.grants)

    def test_delegation_cannot_cross_tenant(self) -> None:
        model = SafetyModel()
        model.grant_root("G0", "tenant-A", {"read", "write"})
        self.assertEqual(model.delegate("G0", "G1", "tenant-B", {"read"}), "tenant_violation")
        self.assertNotIn("G1", model.grants)

    def test_effect_later_not_sent_cannot_erase_prior_sent_unknown(self) -> None:
        model = SafetyModel()
        self.assertEqual(model.effect_attempt("E1", "sent_no_response"), EffectKnowledge.INDETERMINATE)
        self.assertEqual(model.effect_attempt("E1", "definitely_not_sent"), EffectKnowledge.INDETERMINATE)

    def test_confirmed_external_effect_survives_local_restore_and_cancel(self) -> None:
        model = SafetyModel(authoritative_values={"local": "before"})
        model.effect_attempt("E1", "confirmed")
        model.local_restore({"local": "restored-old"})
        model.cancel_local_execution()
        self.assertIn("E1", model.external_confirmed_effects)
        self.assertEqual(model.effects["E1"], EffectKnowledge.CONFIRMED)

    def test_timer_fire_is_not_domain_fulfillment_or_breach_mutation(self) -> None:
        model = SafetyModel(commitments_fulfilled={"C1": False})
        model.fire_timer("T1")
        self.assertIn("T1", model.timers_fired)
        self.assertFalse(model.commitments_fulfilled["C1"])

    def test_historical_revision_binding_does_not_follow_current_revision(self) -> None:
        model = SafetyModel(current_ontology_revision="ont-1", current_policy_revision="pol-1")
        self.assertEqual(model.apply_semantic_operation("O1", "pay:100"), "committed")
        model.change_revisions("ont-2", "pol-2")
        historical = model.historical_operations["O1"]
        self.assertEqual(historical.ontology_revision, "ont-1")
        self.assertEqual(historical.policy_revision, "pol-1")

    def test_same_operation_same_intent_replays_and_changed_intent_mismatches(self) -> None:
        model = SafetyModel()
        self.assertEqual(model.apply_semantic_operation("O1", "intent-A", {"x": 1}), "committed")
        self.assertEqual(model.apply_semantic_operation("O1", "intent-A", {"x": 2}), "replayed")
        self.assertEqual(model.apply_semantic_operation("O1", "intent-B", {"x": 3}), "mismatch")
        self.assertEqual(model.authoritative_values["x"], 1)
        self.assertEqual(model.operation_apply_count["O1"], 1)

    def test_dependency_free_shrinker_finds_minimal_known_effect_counterexample(self) -> None:
        noisy = [
            TraceOperation("timer", ("T1",)),
            TraceOperation("effect", ("E1", "sent_no_response")),
            TraceOperation("revision", ("ont-2", "pol-2")),
            TraceOperation("derived", ("price", 123)),
            TraceOperation("effect", ("E1", "definitely_not_sent")),
            TraceOperation("cancel"),
        ]
        self.assertTrue(effect_uncertainty_erased(noisy))
        minimal = ddmin(noisy, effect_uncertainty_erased)
        self.assertEqual(
            minimal,
            [
                TraceOperation("effect", ("E1", "sent_no_response")),
                TraceOperation("effect", ("E1", "definitely_not_sent")),
            ],
        )


class CrossOntologyStateMachine(RuleBasedStateMachine):
    """Hypothesis-generated action sequences over recurring semantic boundaries."""

    def __init__(self) -> None:
        super().__init__()
        self.model = SafetyModel()
        self.model.grant_root("ROOT", "tenant-A", {"read", "write", "approve", "pay"})

    @rule(
        operation_id=st.sampled_from(["O0", "O1", "O2"]),
        intent=st.sampled_from(["A", "B", "C"]),
    )
    def semantic_operation(self, operation_id: str, intent: str) -> None:
        before = dict(self.model.authoritative_values)
        result = self.model.apply_semantic_operation(operation_id, intent, {operation_id: intent})
        if result in {"replayed", "mismatch"} and operation_id in before:
            assert self.model.authoritative_values[operation_id] == before[operation_id]

    @rule(observation_id=st.sampled_from(["OBS0", "OBS1", "OBS2"]))
    def observation(self, observation_id: str) -> None:
        before = self.model.business_occurrence_count
        duplicate = observation_id in self.model.observations_seen
        self.model.deliver_observation(observation_id)
        assert self.model.business_occurrence_count == before + (0 if duplicate else 1)

    @rule(
        effect_id=st.sampled_from(["E0", "E1"]),
        evidence=st.sampled_from(
            ["definitely_not_sent", "sent_no_response", "accepted_pending", "confirmed", "rejected"]
        ),
    )
    def effect_attempt(self, effect_id: str, evidence: str) -> None:
        prior = self.model.effects.get(effect_id, EffectKnowledge.NOT_ATTEMPTED)
        current = self.model.effect_attempt(effect_id, evidence)
        if evidence == "definitely_not_sent":
            assert current == prior

    @rule(timer_id=st.sampled_from(["T0", "T1"]), commitment_id=st.sampled_from(["C0", "C1"]))
    def timer(self, timer_id: str, commitment_id: str) -> None:
        before = self.model.commitments_fulfilled.get(commitment_id)
        self.model.fire_timer(timer_id)
        assert self.model.commitments_fulfilled.get(commitment_id) == before

    @rule(value=st.integers())
    def derived_write(self, value: int) -> None:
        before = dict(self.model.authoritative_values)
        self.model.mutate_derived("K", value)
        assert self.model.authoritative_values == before

    @rule(child_scope=st.sampled_from(["read", "write", "approve", "pay", "admin"]))
    def delegate(self, child_scope: str) -> None:
        result = self.model.delegate("ROOT", f"G-{child_scope}", "tenant-A", {child_scope})
        if child_scope == "admin":
            assert result == "scope_escalation"
        else:
            assert result == "delegated"

    @invariant()
    def semantic_invariants_hold(self) -> None:
        assert self.model.invariant_violations() == []


TestCrossOntologyStateMachine = CrossOntologyStateMachine.TestCase
TestCrossOntologyStateMachine.settings = settings(max_examples=100, stateful_step_count=80, deadline=None)


if __name__ == "__main__":
    unittest.main()
