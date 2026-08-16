#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    ActionDef,
    ActionPlan,
    ComputationDef,
    Decision,
    EntityRef,
    EvaluationContext,
    Mutation,
    ReducedEngine,
    RelationDef,
    RuleBinding,
    RuleDenied,
    RuleResult,
    TypeDef,
)


def required_relation_integrity(ctx: EvaluationContext) -> RuleResult:
    """Generic after-commit evaluator for Relation minimum cardinalities.

    The relation declaration carries the semantic cardinality.  RuleBinding is
    the generic enforcement locus; no Property- or Link-specific checker exists.
    """
    engine = ctx.engine
    missing: list[str] = []
    for entity in engine.entities.values():
        for relation in engine.relation_defs.values():
            if relation.source_type != entity.type_name or relation.min_per_source <= 0:
                continue
            actual = len(engine.relation_targets(relation.name, entity.entity_id))
            if actual < relation.min_per_source:
                missing.append(
                    f"{entity.entity_id}:{relation.name}:{actual}<{relation.min_per_source}"
                )
    return RuleResult(
        Decision.PERMIT if not missing else Decision.DENY,
        tuple(missing) or ("required-relations-satisfied",),
    )


class RelationIntegrityReductionTests(unittest.TestCase):
    def _engine(self) -> ReducedEngine:
        engine = ReducedEngine()
        engine.add_type(TypeDef("Person"))
        engine.add_type(TypeDef("Organization"))
        engine.add_type(TypeDef("Employment"))
        engine.add_relation(RelationDef("employee", "Employment", "Person", min_per_source=1, max_per_source=1))
        engine.add_relation(RelationDef("employer", "Employment", "Organization", min_per_source=1, max_per_source=1))
        engine.create_entity("Person", "P1")
        engine.create_entity("Organization", "O1")
        engine.add_computation(
            ComputationDef("required-relation-integrity", required_relation_integrity, execution_class="decision")
        )
        engine.add_binding(
            RuleBinding(
                "required-relations",
                "required-relation-integrity",
                "global",
                "*",
                "commit",
                obligation="system",
                timing="after",
            )
        )
        return engine

    def test_minimum_cardinality_is_checked_after_atomic_construction(self) -> None:
        engine = self._engine()

        def complete_plan(_: EvaluationContext) -> ActionPlan:
            return ActionPlan(
                [
                    Mutation("create_entity", ("Employment", "E1", {"status": "active"})),
                    Mutation("add_relation", ("employee", "E1", EntityRef("Person", "P1"))),
                    Mutation("add_relation", ("employer", "E1", EntityRef("Organization", "O1"))),
                ],
                result="E1",
            )

        engine.add_computation(ComputationDef("complete-employment", complete_plan, execution_class="planner"))
        engine.add_action(ActionDef("CreateEmployment", "complete-employment"))
        self.assertEqual(
            engine.invoke_action("CreateEmployment", "OP-E1", "employment:E1", {}, actor="hr:H"),
            "E1",
        )
        self.assertEqual(len(engine.relation_targets("employee", "E1")), 1)
        self.assertEqual(len(engine.relation_targets("employer", "E1")), 1)

    def test_missing_required_relation_rejects_and_rolls_back_whole_action(self) -> None:
        engine = self._engine()

        def incomplete_plan(_: EvaluationContext) -> ActionPlan:
            return ActionPlan(
                [
                    Mutation("create_entity", ("Employment", "E2", {"status": "active"})),
                    Mutation("add_relation", ("employee", "E2", EntityRef("Person", "P1"))),
                ],
                result="E2",
            )

        engine.add_computation(ComputationDef("incomplete-employment", incomplete_plan, execution_class="planner"))
        engine.add_action(ActionDef("CreateIncompleteEmployment", "incomplete-employment"))
        with self.assertRaises(RuleDenied) as caught:
            engine.invoke_action(
                "CreateIncompleteEmployment",
                "OP-E2",
                "employment:E2:incomplete",
                {},
                actor="hr:H",
            )
        self.assertIn("E2:employer:0<1", caught.exception.evidence)
        self.assertNotIn("E2", engine.entities)
        self.assertEqual(engine.relation_targets("employee", "E2"), ())
        self.assertNotIn("OP-E2", engine.operations)


if __name__ == "__main__":
    unittest.main()
