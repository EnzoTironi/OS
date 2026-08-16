#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    Approval,
    CurrentPredicate,
    ExactVersion,
    ImmutableReference,
    Operation,
    Outcome,
    ReferenceCommitEngine,
    World,
    digest,
)


class CommitSemanticsTests(unittest.TestCase):
    def test_same_operation_replay_does_not_apply_twice(self):
        world = World()
        world.set_initial("balance", 100)
        engine = ReferenceCommitEngine(world)
        op = Operation("deposit-1", digest("deposit 50"), {"balance": 150})

        first = engine.commit(op)
        second = engine.commit(op)

        self.assertEqual(first.outcome, Outcome.COMMITTED)
        self.assertEqual(second.outcome, Outcome.REPLAYED_COMMITTED)
        self.assertEqual(world.values["balance"], 150)
        self.assertEqual(world.revision, 1)

    def test_same_operation_id_different_intent_is_rejected(self):
        world = World()
        engine = ReferenceCommitEngine(world)
        first = Operation("pay-1", digest("pay 100"), {"paid": 100})
        changed = Operation("pay-1", digest("pay 1000"), {"paid": 1000})

        self.assertEqual(engine.commit(first).outcome, Outcome.COMMITTED)
        self.assertEqual(engine.commit(changed).outcome, Outcome.IDEMPOTENCY_MISMATCH)
        self.assertEqual(world.values["paid"], 100)

    def test_known_conflict_proves_no_commit_and_can_be_retried(self):
        world = World()
        world.set_initial("stock", 10)
        engine = ReferenceCommitEngine(world)
        op = Operation("reserve-1", digest("reserve 7"), {"stock": 3})

        conflict = engine.commit(op, known_conflict=True)
        self.assertEqual(conflict.outcome, Outcome.DEFINITELY_NOT_COMMITTED)
        self.assertEqual(world.values["stock"], 10)
        self.assertNotIn("reserve-1", world.committed_operations)

        committed = engine.commit(op)
        self.assertEqual(committed.outcome, Outcome.COMMITTED)
        self.assertEqual(world.values["stock"], 3)

    def test_unknown_after_apply_reconciles_on_same_operation_id(self):
        world = World()
        world.set_initial("balance", 100)
        engine = ReferenceCommitEngine(world)
        op = Operation("deposit-2", digest("deposit 50"), {"balance": 150})

        first = engine.commit(op, indeterminate_after_apply=True)
        self.assertEqual(first.outcome, Outcome.COMMIT_OUTCOME_INDETERMINATE)
        self.assertEqual(world.values["balance"], 150)

        retry = engine.commit(op)
        self.assertEqual(retry.outcome, Outcome.REPLAYED_COMMITTED)
        self.assertEqual(world.values["balance"], 150)
        self.assertEqual(world.revision, 1)

    def test_exact_version_dependency_reports_basis_not_satisfied(self):
        world = World()
        world.set_initial("order", "open", version=5)
        engine = ReferenceCommitEngine(world)
        op = Operation(
            "close-order",
            digest("close order"),
            {"order": "closed"},
            basis=[ExactVersion("order", 5)],
        )
        world.versions["order"] = 6

        result = engine.commit(op)
        self.assertEqual(result.outcome, Outcome.BASIS_NOT_SATISFIED)
        self.assertEqual(world.values["order"], "open")

    def test_live_predicate_reports_basis_not_satisfied(self):
        world = World()
        world.set_initial("available", 10)
        engine = ReferenceCommitEngine(world)
        op = Operation(
            "reserve-live",
            digest("reserve seven while available"),
            {"available": 3},
            basis=[CurrentPredicate("available >= 7", lambda values: int(values["available"]) >= 7)],
        )
        world.values["available"] = 5

        result = engine.commit(op)
        self.assertEqual(result.outcome, Outcome.BASIS_NOT_SATISFIED)
        self.assertEqual(world.values["available"], 5)

    def test_frozen_immutable_reference_does_not_require_current_price_equality(self):
        world = World()
        world.set_initial("current_price", 130)
        quote = "quote:price=100;valid-until=18:00"
        basis = ImmutableReference("quote-Q", digest(quote), quote)
        engine = ReferenceCommitEngine(world)
        op = Operation(
            "accept-quote-Q",
            digest("accept Q at 100"),
            {"accepted_price": 100},
            basis=[basis],
        )

        result = engine.commit(op)
        self.assertEqual(result.outcome, Outcome.COMMITTED)
        self.assertEqual(world.values["accepted_price"], 100)
        self.assertEqual(world.values["current_price"], 130)

    def test_approval_mismatch_really_needs_reproposal(self):
        world = World()
        engine = ReferenceCommitEngine(world)
        approved_digest = digest("purchase supplier A")
        approval = Approval("approval-1", approved_digest, max_amount=50_000)

        allowed = Operation("po-1", approved_digest, {"po_amount": 40_000}, approval=approval, amount=40_000)
        too_large = Operation("po-2", approved_digest, {"po_amount": 70_000}, approval=approval, amount=70_000)
        different = Operation("po-3", digest("purchase supplier B"), {"po_amount": 40_000}, approval=approval, amount=40_000)

        self.assertEqual(engine.commit(allowed).outcome, Outcome.COMMITTED)
        self.assertEqual(engine.commit(too_large).outcome, Outcome.NEEDS_REPROPOSAL)
        self.assertEqual(engine.commit(different).outcome, Outcome.NEEDS_REPROPOSAL)

    def test_domain_invariant_is_atomic_and_does_not_partially_apply(self):
        world = World()
        world.set_initial("debits", 0)
        world.set_initial("credits", 0)
        engine = ReferenceCommitEngine(world, invariants=[("balanced", lambda values: values["debits"] == values["credits"])])
        invalid = Operation("journal-1", digest("post invalid journal"), {"debits": 100, "credits": 90})

        result = engine.commit(invalid)
        self.assertEqual(result.outcome, Outcome.DEFINITELY_NOT_COMMITTED)
        self.assertEqual(world.values["debits"], 0)
        self.assertEqual(world.values["credits"], 0)
        self.assertEqual(world.revision, 0)

    def test_two_intentional_identical_business_operations_are_not_deduped_by_parameters(self):
        world = World()
        engine = ReferenceCommitEngine(world)
        intent = digest("deposit 100")
        first = Operation("deposit-A", intent, {"last_deposit": "A"})
        second = Operation("deposit-B", intent, {"last_deposit": "B"})

        self.assertEqual(engine.commit(first).outcome, Outcome.COMMITTED)
        self.assertEqual(engine.commit(second).outcome, Outcome.COMMITTED)
        self.assertEqual(world.revision, 2)
        self.assertEqual(world.values["last_deposit"], "B")


if __name__ == "__main__":
    unittest.main()
