#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    BASE_FORMS,
    ActionDef,
    ActionLocalInvariantEngine,
    ActionPlan,
    BoolPolicyEngine,
    CapabilityViolation,
    CardinalityViolation,
    ComputationDef,
    ComputationOnlyMutationEngine,
    Decision,
    EffectKnowledge,
    EntityRef,
    EvaluationContext,
    IntentMismatch,
    Materialization,
    Mutation,
    ReducedEngine,
    RelationDef,
    RuleBinding,
    RuleDenied,
    RuleResult,
    ShapeContract,
    TaggedEventEngine,
    TypeDef,
    TypeNature,
    TypeViolation,
    UnsafeRetry,
    always_deny,
)


class ReducedMetamodelTests(unittest.TestCase):
    def test_r5_base_form_registry_is_explicit(self) -> None:
        self.assertEqual(BASE_FORMS, ("Type", "Relation", "Computation", "Action", "RuleBinding"))
        self.assertNotIn("Event", BASE_FORMS)
        self.assertNotIn("Policy", BASE_FORMS)
        self.assertNotIn("Constraint", BASE_FORMS)
        self.assertNotIn("Effect", BASE_FORMS)
        self.assertNotIn("Projection", BASE_FORMS)

    def test_property_and_link_share_typed_relation_algebra(self) -> None:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Product"))
        engine.add_type(TypeDef("Organization"))
        engine.add_type(TypeDef("Money", TypeNature.VALUE))
        engine.add_relation(RelationDef("planningPrice", "Product", "Money", max_per_source=1))
        engine.add_relation(RelationDef("suppliedBy", "Product", "Organization"))
        engine.create_entity("Product", "P1")
        engine.create_entity("Organization", "O1", {"name": "Supplier SA"})

        engine.relate("planningPrice", "P1", engine.typed_value("Money", (100, "BRL")))
        engine.relate("suppliedBy", "P1", engine.ref("O1"))

        with self.assertRaises(TypeViolation):
            engine.relate("planningPrice", "P1", engine.ref("O1"))
        with self.assertRaises(TypeViolation):
            engine.relate("suppliedBy", "P1", engine.typed_value("Money", (100, "BRL")))
        with self.assertRaises(CardinalityViolation):
            engine.relate("planningPrice", "P1", engine.typed_value("Money", (110, "BRL")))

        self.assertEqual(engine.relation_targets("suppliedBy", "P1"), (EntityRef("Organization", "O1"),))

    def test_relationship_with_lifecycle_is_ordinary_identifiable_type(self) -> None:
        engine = ReducedEngine()
        for name in ("Person", "Organization", "Employment"):
            engine.add_type(TypeDef(name))
        engine.add_relation(RelationDef("employee", "Employment", "Person", max_per_source=1))
        engine.add_relation(RelationDef("employer", "Employment", "Organization", max_per_source=1))
        engine.create_entity("Person", "PERSON-1", {"name": "Ana"})
        engine.create_entity("Organization", "ORG-1", {"name": "ACME"})
        engine.create_entity("Employment", "EMP-1", {"status": "active"})
        engine.relate("employee", "EMP-1", engine.ref("PERSON-1"))
        engine.relate("employer", "EMP-1", engine.ref("ORG-1"))

        engine.update_entity("EMP-1", {"status": "suspended"})
        self.assertEqual(engine.entities["EMP-1"].data["status"], "suspended")
        self.assertEqual(engine.entities["PERSON-1"].data["name"], "Ana")
        self.assertEqual(engine.entities["ORG-1"].data["name"], "ACME")

    def test_shape_contract_supports_polymorphism_without_role_semantics(self) -> None:
        engine = ReducedEngine()
        for name in ("Product", "FreightQuote", "Person", "Money"):
            nature = TypeNature.VALUE if name == "Money" else TypeNature.ENTITY
            engine.add_type(TypeDef(name, nature))
        engine.add_relation(RelationDef("effectivePrice", "Product", "Money", max_per_source=1))
        engine.add_relation(RelationDef("quotePrice", "FreightQuote", "Money", max_per_source=1))

        engine.add_computation(ComputationDef("noop-plan", lambda _: ActionPlan()))
        engine.add_action(ActionDef("RepriceProduct", "noop-plan", target_types=("Product",)))
        engine.add_action(ActionDef("RepriceQuote", "noop-plan", target_types=("FreightQuote",)))

        product_contract = ShapeContract(
            "ProductPriceable",
            required_relations=frozenset({"effectivePrice"}),
            required_actions=frozenset({"RepriceProduct"}),
        )
        quote_contract = ShapeContract(
            "QuotePriceable",
            required_relations=frozenset({"quotePrice"}),
            required_actions=frozenset({"RepriceQuote"}),
        )
        self.assertTrue(engine.conforms("Product", product_contract))
        self.assertTrue(engine.conforms("FreightQuote", quote_contract))
        self.assertFalse(engine.conforms("Person", product_contract))

    def test_tagged_event_reduction_reproduces_wave_a_counterexample(self) -> None:
        unsafe = TaggedEventEngine()
        unsafe.create_event("MOVE-1", {"quantity": 10})
        unsafe.update("MOVE-1", {"quantity": 20})
        self.assertEqual(unsafe.rows["MOVE-1"]["quantity"], 20, "sensitivity: tag alone must permit the bad edit")

    def _occurrence_engine(self) -> ReducedEngine:
        engine = ReducedEngine()
        engine.add_type(TypeDef("StockMovement", contracts={"occurrence"}))
        engine.add_computation(ComputationDef("deny-lifecycle", always_deny, execution_class="decision"))
        engine.add_binding(
            RuleBinding(
                "stock-movement-no-update",
                evaluator="deny-lifecycle",
                scope_kind="type",
                scope_name="StockMovement",
                locus="lifecycle:update",
            )
        )
        engine.add_binding(
            RuleBinding(
                "stock-movement-no-delete",
                evaluator="deny-lifecycle",
                scope_kind="type",
                scope_name="StockMovement",
                locus="lifecycle:delete",
            )
        )
        return engine

    def test_event_can_be_type_plus_inescapable_lifecycle_binding(self) -> None:
        engine = self._occurrence_engine()
        engine.create_entity("StockMovement", "MOVE-1", {"quantity": 10})
        with self.assertRaises(RuleDenied):
            engine.update_entity("MOVE-1", {"quantity": 20})
        with self.assertRaises(RuleDenied):
            engine.delete_entity("MOVE-1")
        self.assertEqual(engine.entities["MOVE-1"].data["quantity"], 10)

    def test_correction_appends_new_occurrence_and_preserves_original(self) -> None:
        engine = self._occurrence_engine()
        engine.add_relation(RelationDef("corrects", "StockMovement", "StockMovement", max_per_source=1))
        engine.create_entity("StockMovement", "MOVE-1", {"quantity": 10})

        def correction_plan(ctx: EvaluationContext) -> ActionPlan:
            correction_id = ctx.inputs["correction_id"]
            original = ctx.inputs["original"]
            quantity = ctx.inputs["quantity"]
            return ActionPlan(
                mutations=[
                    Mutation("create_entity", ("StockMovement", correction_id, {"quantity": quantity, "correction": True})),
                    Mutation("add_relation", ("corrects", correction_id, EntityRef("StockMovement", original))),
                ],
                result=correction_id,
            )

        engine.add_computation(ComputationDef("correction-plan", correction_plan, execution_class="planner"))
        engine.add_action(ActionDef("CorrectStockMovement", "correction-plan"))
        result = engine.invoke_action(
            "CorrectStockMovement",
            "OP-CORRECT-1",
            "correct:MOVE-1:8",
            {"correction_id": "MOVE-2", "original": "MOVE-1", "quantity": 8},
            actor="human:H",
        )
        self.assertEqual(result, "MOVE-2")
        self.assertEqual(engine.entities["MOVE-1"].data["quantity"], 10)
        self.assertEqual(engine.entities["MOVE-2"].data["quantity"], 8)
        self.assertEqual(engine.relation_targets("corrects", "MOVE-2"), (EntityRef("StockMovement", "MOVE-1"),))

    def test_external_occurrence_does_not_require_fake_local_action(self) -> None:
        engine = self._occurrence_engine()
        engine.create_entity("StockMovement", "REMOTE-MOVE-1", {"quantity": 3, "source": "marketplace"})
        self.assertIn("REMOTE-MOVE-1", engine.entities)
        self.assertEqual(engine.operations, {})

    def test_computation_capability_cannot_directly_mutate_authoritative_state(self) -> None:
        engine = ReducedEngine()
        engine.business_state["balance"] = 10

        def illegal(ctx: EvaluationContext) -> int:
            ctx.engine.business_state["balance"] = 999
            return 999

        engine.add_computation(ComputationDef("illegal", illegal))
        with self.assertRaises(CapabilityViolation):
            engine.run_computation("illegal", EvaluationContext(engine))
        self.assertEqual(engine.business_state["balance"], 10)

    def _increment_action_engine(self) -> ReducedEngine:
        engine = ReducedEngine()

        def plan(ctx: EvaluationContext) -> ActionPlan:
            return ActionPlan(
                mutations=[Mutation("increment_state", (ctx.inputs["key"], ctx.inputs["delta"]))],
                result={"applied": ctx.inputs["delta"]},
            )

        engine.add_computation(ComputationDef("increment-plan", plan, execution_class="planner"))
        engine.add_action(ActionDef("Increment", "increment-plan"))
        return engine

    def test_action_semantic_identity_makes_caller_retry_a_replay(self) -> None:
        engine = self._increment_action_engine()
        first = engine.invoke_action("Increment", "OP-1", "inc:x:1", {"key": "x", "delta": 1}, actor="agent:A")
        second = engine.invoke_action("Increment", "OP-1", "inc:x:1", {"key": "x", "delta": 1}, actor="agent:A")
        self.assertEqual(first, second)
        self.assertEqual(engine.business_state["x"], 1)
        self.assertEqual(len(engine.operations), 1)

    def test_action_same_id_changed_intent_is_rejected(self) -> None:
        engine = self._increment_action_engine()
        engine.invoke_action("Increment", "OP-1", "inc:x:1", {"key": "x", "delta": 1}, actor="agent:A")
        with self.assertRaises(IntentMismatch):
            engine.invoke_action("Increment", "OP-1", "inc:x:2", {"key": "x", "delta": 2}, actor="agent:A")
        self.assertEqual(engine.business_state["x"], 1)

    def test_computation_only_mutation_reproduces_duplicate_retry_counterexample(self) -> None:
        unsafe = ComputationOnlyMutationEngine()
        unsafe.call_mutator("x", 1)
        unsafe.call_mutator("x", 1)  # caller did not know first call succeeded
        self.assertEqual(unsafe.state["x"], 2, "sensitivity: deleting Action protocol must expose duplicate business mutation")
        self.assertEqual(unsafe.calls, 2)

    def test_action_audit_preserves_actor_represented_principal_and_workload(self) -> None:
        engine = self._increment_action_engine()
        engine.invoke_action(
            "Increment",
            "OP-1",
            "inc:x:1",
            {"key": "x", "delta": 1},
            actor="agent:A",
            represented_principal="human:H",
            workload="spiffe://tenant/runtime/W",
        )
        record = engine.operations["OP-1"]
        self.assertEqual(record.actor, "agent:A")
        self.assertEqual(record.represented_principal, "human:H")
        self.assertEqual(record.workload, "spiffe://tenant/runtime/W")

    def test_preview_is_not_commit_and_current_basis_rechecks(self) -> None:
        engine = ReducedEngine()
        engine.business_state["available"] = 10

        def enough(ctx: EvaluationContext) -> RuleResult:
            return RuleResult(
                Decision.PERMIT if ctx.state("available", 0) >= ctx.inputs["quantity"] else Decision.DENY,
                ("available",),
            )

        engine.add_computation(ComputationDef("enough", enough, execution_class="decision"))
        engine.add_computation(ComputationDef("reserve-plan", lambda _: ActionPlan(result="reserved"), execution_class="planner"))
        engine.add_binding(RuleBinding("preview-available", "enough", "action", "Reserve", "preview", basis="current"))
        engine.add_binding(RuleBinding("commit-available", "enough", "action", "Reserve", "commit", basis="current"))
        engine.add_action(ActionDef("Reserve", "reserve-plan", bindings=("preview-available", "commit-available")))

        engine.preview_action("Reserve", {"quantity": 8})
        engine.business_state["available"] = 5
        with self.assertRaises(RuleDenied):
            engine.invoke_action("Reserve", "OP-R", "reserve:8", {"quantity": 8}, actor="human:H")

    def test_pinned_basis_does_not_follow_latest_state(self) -> None:
        engine = ReducedEngine()
        engine.business_state["fx"] = 6.0

        def expected_fx(ctx: EvaluationContext) -> RuleResult:
            return RuleResult(Decision.PERMIT if ctx.state("fx") == ctx.inputs["approved_fx"] else Decision.DENY)

        engine.add_computation(ComputationDef("expected-fx", expected_fx, execution_class="decision"))
        engine.add_computation(ComputationDef("invoice-plan", lambda _: ActionPlan(result="posted"), execution_class="planner"))
        engine.add_binding(RuleBinding("pinned-fx", "expected-fx", "action", "PostInvoice", "commit", basis="pinned"))
        engine.add_action(ActionDef("PostInvoice", "invoice-plan", bindings=("pinned-fx",)))

        pinned = {"fx": 5.5}
        result = engine.invoke_action(
            "PostInvoice",
            "OP-I",
            "invoice:fx:5.5",
            {"approved_fx": 5.5},
            actor="human:H",
            pinned_state=pinned,
        )
        self.assertEqual(result, "posted")

    def test_policy_deny_and_policy_error_remain_distinct(self) -> None:
        for raw, expected in (("deny", Decision.DENY), ("error", Decision.ERROR)):
            engine = ReducedEngine()
            engine.business_state["auth"] = raw

            def authorize(ctx: EvaluationContext) -> RuleResult:
                value = ctx.state("auth")
                return RuleResult(Decision(value), (f"auth:{value}",))

            engine.add_computation(ComputationDef("authorize", authorize, execution_class="decision"))
            engine.add_computation(ComputationDef("noop", lambda _: ActionPlan(), execution_class="planner"))
            engine.add_binding(RuleBinding("authority", "authorize", "action", "Pay", "commit", obligation="authority"))
            engine.add_action(ActionDef("Pay", "noop", bindings=("authority",)))
            with self.assertRaises(RuleDenied) as caught:
                engine.invoke_action("Pay", f"OP-{raw}", f"pay:{raw}", {}, actor="agent:A")
            self.assertEqual(caught.exception.outcome, expected)
            self.assertEqual(caught.exception.evidence, (f"auth:{raw}",))

        self.assertFalse(BoolPolicyEngine.evaluate("deny"))
        self.assertFalse(BoolPolicyEngine.evaluate("error"))

    def test_global_invariant_catches_alternate_action_path(self) -> None:
        engine = ReducedEngine()

        def balanced(ctx: EvaluationContext) -> RuleResult:
            return RuleResult(
                Decision.PERMIT if ctx.state("debits", 0) == ctx.state("credits", 0) else Decision.DENY,
                ("journal-balance",),
            )

        def normal_plan(ctx: EvaluationContext) -> ActionPlan:
            return ActionPlan(
                [
                    Mutation("set_state", ("debits", ctx.inputs["debits"])),
                    Mutation("set_state", ("credits", ctx.inputs["credits"])),
                ]
            )

        engine.add_computation(ComputationDef("balanced", balanced, execution_class="decision"))
        engine.add_computation(ComputationDef("normal-plan", normal_plan, execution_class="planner"))
        engine.add_binding(
            RuleBinding(
                "ledger-invariant",
                "balanced",
                "global",
                "*",
                "commit",
                obligation="system",
                timing="after",
            )
        )
        engine.add_action(ActionDef("PostJournal", "normal-plan"))
        engine.add_action(ActionDef("AdminLedgerWrite", "normal-plan"))

        for action_name in ("PostJournal", "AdminLedgerWrite"):
            with self.assertRaises(RuleDenied):
                engine.invoke_action(
                    action_name,
                    f"OP-{action_name}",
                    f"{action_name}:10:9",
                    {"debits": 10, "credits": 9},
                    actor="admin:A",
                )
            self.assertNotEqual(engine.business_state.get("debits"), 10)

        engine.invoke_action(
            "PostJournal",
            "OP-GOOD",
            "post:10:10",
            {"debits": 10, "credits": 10},
            actor="human:H",
        )
        self.assertEqual((engine.business_state["debits"], engine.business_state["credits"]), (10, 10))

    def test_action_local_invariant_variant_is_bypassable(self) -> None:
        unsafe = ActionLocalInvariantEngine()
        unsafe.post_balanced(10, 10)
        unsafe.admin_set(10, 9)
        self.assertNotEqual(unsafe.debits, unsafe.credits, "sensitivity: local guard must be bypassable")

    def test_conflicting_observations_coexist_without_fact_base_sort(self) -> None:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Observation", contracts={"occurrence", "evidence"}))
        engine.add_type(TypeDef("Product"))
        engine.add_computation(ComputationDef("deny", always_deny, execution_class="decision"))
        for locus in ("lifecycle:update", "lifecycle:delete"):
            engine.add_binding(RuleBinding(f"obs-{locus}", "deny", "type", "Observation", locus))
        engine.create_entity("Product", "P1")
        engine.create_entity("Observation", "OBS-ERP", {"subject": "P1", "predicate": "cost", "value": 100, "source": "ERP"})
        engine.create_entity("Observation", "OBS-XLSX", {"subject": "P1", "predicate": "cost", "value": 105, "source": "XLSX"})

        def choose_cost(ctx: EvaluationContext) -> ActionPlan:
            return ActionPlan([Mutation("set_state", ("planning_cost:P1", ctx.inputs["value"]))], result=ctx.inputs["value"])

        engine.add_computation(ComputationDef("choose-cost", choose_cost, execution_class="planner"))
        engine.add_action(ActionDef("SetPlanningCost", "choose-cost"))
        engine.invoke_action(
            "SetPlanningCost",
            "OP-COST",
            "cost:P1:105",
            {"value": 105},
            actor="buyer:H",
        )
        self.assertEqual(engine.business_state["planning_cost:P1"], 105)
        self.assertEqual(engine.entities["OBS-ERP"].data["value"], 100)
        self.assertEqual(engine.entities["OBS-XLSX"].data["value"], 105)

    def test_effect_demotion_preserves_no_pre_send_remote_id_and_unknown_outcome(self) -> None:
        engine = ReducedEngine()

        def plan(_: EvaluationContext) -> ActionPlan:
            return ActionPlan([Mutation("request_effect", ("EFF-1",))], result="local-committed")

        engine.add_computation(ComputationDef("effect-plan", plan, execution_class="planner"))
        engine.add_action(ActionDef("CreateRemoteThing", "effect-plan"))
        self.assertEqual(
            engine.invoke_action("CreateRemoteThing", "OP-E", "create:thing", {}, actor="agent:A"),
            "local-committed",
        )
        request = engine.effects["EFF-1"]
        self.assertIsNone(request.remote_key)
        self.assertEqual(engine.effect_attempt("EFF-1", "sent_no_response"), EffectKnowledge.INDETERMINATE)
        self.assertIsNone(request.remote_key)
        with self.assertRaises(UnsafeRetry):
            engine.retry_effect("EFF-1", protocol_has_safe_dedupe=False)
        engine.learn_remote_receipt("EFF-1", "REMOTE-777")
        self.assertEqual(request.remote_receipt, "REMOTE-777")
        self.assertEqual(request.knowledge, EffectKnowledge.CONFIRMED)

    def test_stale_materialization_does_not_become_current_commit_authority(self) -> None:
        engine = ReducedEngine()
        engine.business_state["available"] = 10
        cached = engine.materialize("ATP", 10)
        self.assertIsInstance(cached, Materialization)
        engine.business_state["available"] = 0

        def enough(ctx: EvaluationContext) -> RuleResult:
            return RuleResult(Decision.PERMIT if ctx.state("available", 0) >= 1 else Decision.DENY)

        engine.add_computation(ComputationDef("enough-current", enough, execution_class="decision"))
        engine.add_computation(ComputationDef("noop", lambda _: ActionPlan(), execution_class="planner"))
        engine.add_binding(RuleBinding("current-availability", "enough-current", "action", "Reserve", "commit", basis="current"))
        engine.add_action(ActionDef("Reserve", "noop", bindings=("current-availability",)))
        with self.assertRaises(RuleDenied):
            engine.invoke_action("Reserve", "OP-R", "reserve:1", {}, actor="agent:A")
        self.assertEqual(engine.materializations["ATP"].value, 10)

    def test_runtime_timer_is_not_business_completion_or_breach(self) -> None:
        engine = ReducedEngine()
        engine.business_state["commitment:C1:fulfilled"] = True
        before = dict(engine.business_state)
        engine.fire_runtime_timer("T-17:00")
        self.assertEqual(engine.business_state, before)
        self.assertIn("T-17:00", engine.runtime_timers_fired)

    def test_low_risk_action_requires_no_proposal_object(self) -> None:
        engine = self._increment_action_engine()
        engine.invoke_action("Increment", "OP-DIRECT", "inc:x:1", {"key": "x", "delta": 1}, actor="service:S")
        self.assertEqual(engine.business_state["x"], 1)
        self.assertFalse(any(entity.type_name == "Proposal" for entity in engine.entities.values()))


if __name__ == "__main__":
    unittest.main()
