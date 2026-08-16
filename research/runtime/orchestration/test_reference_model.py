#!/usr/bin/env python3
from __future__ import annotations

import unittest

from reference_model import (
    CommitOutcome,
    Commitment,
    DomainWorld,
    EffectKnowledge,
    ExecutionStatus,
    OrchestrationExecution,
    RuntimeInput,
    SemanticOperation,
    TimerRegistration,
    business_process_complete,
    digest,
    effect_step_result,
    evaluate_commitment_after_timer,
)


class OrchestrationBoundaryTests(unittest.TestCase):
    def world(self) -> DomainWorld:
        world = DomainWorld()
        world.current_grants.update({"alice", "system"})
        world.commitments["C1"] = Commitment("C1", due_at=100)
        return world

    def execution(self) -> OrchestrationExecution:
        return OrchestrationExecution("X1", "R1", "D1", semantic_links={"C1"})

    def test_crash_after_commit_before_checkpoint_replays_semantic_operation(self):
        world = self.world()
        execution = self.execution()
        operation = SemanticOperation(
            "O1", digest("set approved"), "alice", {"approved": True}
        )

        first = execution.durable_step("S1", lambda: world.commit(operation))
        self.assertEqual(first, CommitOutcome.COMMITTED)
        execution.simulate_lost_checkpoint("S1")

        recovered = execution.durable_step("S1", lambda: world.commit(operation))
        self.assertEqual(recovered, CommitOutcome.REPLAYED)
        self.assertEqual(world.values["approved"], True)
        self.assertEqual(len(world.committed_operations), 1)

    def test_same_runtime_step_with_new_semantic_id_can_duplicate_so_runtime_must_reuse_id(self):
        world = self.world()
        execution = self.execution()
        first = SemanticOperation("O1", digest("charge"), "alice", {"charge_count": 1})
        execution.durable_step("S1", lambda: world.commit(first))
        execution.simulate_lost_checkpoint("S1")

        # This test deliberately shows the runtime checkpoint alone cannot know
        # that O2 is semantically a duplicate of O1.
        second = SemanticOperation("O2", digest("charge"), "alice", {"charge_count": 2})
        result = execution.durable_step("S1", lambda: world.commit(second))
        self.assertEqual(result, CommitOutcome.COMMITTED)
        self.assertEqual(len(world.committed_operations), 2)
        self.assertEqual(world.values["charge_count"], 2)

    def test_timer_fire_does_not_mark_commitment_overdue_or_mutate_domain(self):
        world = self.world()
        execution = self.execution()
        execution.schedule_timer(TimerRegistration("T1", 100, "check deadline", "C1"))
        self.assertTrue(execution.fire_timer("T1", 100))
        self.assertFalse(world.commitments["C1"].fulfilled)
        self.assertTrue(evaluate_commitment_after_timer(execution, world, timer_id="T1", commitment_id="C1", now=100))

    def test_timer_after_fulfillment_does_not_create_false_breach(self):
        world = self.world()
        execution = self.execution()
        execution.schedule_timer(TimerRegistration("T1", 100, "check deadline", "C1"))
        self.assertEqual(world.fulfill("C1", "O-fulfill", "alice"), CommitOutcome.COMMITTED)
        execution.fire_timer("T1", 100)
        self.assertFalse(evaluate_commitment_after_timer(execution, world, timer_id="T1", commitment_id="C1", now=100))

    def test_old_timer_after_deadline_extension_is_harmless(self):
        world = self.world()
        execution = self.execution()
        execution.schedule_timer(TimerRegistration("T1", 100, "check deadline", "C1"))
        world.commitments["C1"].due_at = 200
        execution.fire_timer("T1", 100)
        self.assertFalse(evaluate_commitment_after_timer(execution, world, timer_id="T1", commitment_id="C1", now=100))

    def test_duplicate_runtime_delivery_does_not_duplicate_observation_identity(self):
        execution = self.execution()
        first = RuntimeInput("D1", "OBS1", "provider-webhook", "C1")
        duplicate_transport = RuntimeInput("D2", "OBS1", "provider-webhook", "C1")
        self.assertTrue(execution.deliver_input(first))
        self.assertTrue(execution.deliver_input(duplicate_transport))
        self.assertEqual(len(execution.inputs), 2)
        self.assertEqual(execution.observation_ids, {"OBS1"})

    def test_exact_duplicate_delivery_id_is_deduped_at_runtime(self):
        execution = self.execution()
        item = RuntimeInput("D1", "OBS1", "provider-webhook", "C1")
        self.assertTrue(execution.deliver_input(item))
        self.assertFalse(execution.deliver_input(item))
        self.assertEqual(len(execution.inputs), 1)

    def test_two_equal_payload_observations_can_remain_distinct(self):
        execution = self.execution()
        execution.deliver_input(RuntimeInput("D1", "OBS1", "count=108", "C1"))
        execution.deliver_input(RuntimeInput("D2", "OBS2", "count=108", "C1"))
        self.assertEqual(execution.observation_ids, {"OBS1", "OBS2"})

    def test_human_task_completion_is_not_business_approval(self):
        world = self.world()
        execution = self.execution()
        execution.complete_human_task("TASK-1")
        self.assertIn("TASK-1", execution.human_tasks_completed)
        self.assertEqual(world.approvals, set())

    def test_business_approval_requires_current_authority(self):
        world = self.world()
        proposal = digest("buy 40000 from supplier A")
        self.assertTrue(world.approve(proposal, "alice"))
        world.current_grants.discard("alice")
        self.assertFalse(world.approve(digest("buy 50000 from supplier A"), "alice"))

    def test_worker_recovery_does_not_bypass_business_grant(self):
        world = self.world()
        world.current_grants.discard("alice")
        execution = self.execution()
        operation = SemanticOperation("O1", digest("pay"), "alice", {"paid": True})
        result = execution.durable_step("S1", lambda: world.commit(operation))
        self.assertEqual(result, CommitOutcome.DENIED)
        self.assertNotIn("paid", world.values)

    def test_rollover_changes_run_not_orchestration_or_semantic_subject(self):
        execution = self.execution()
        execution.rollover("R2")
        self.assertEqual(execution.instance_id, "X1")
        self.assertEqual(execution.run_id, "R2")
        self.assertEqual(execution.run_history, ["R1", "R2"])
        self.assertEqual(execution.semantic_links, {"C1"})

    def test_rollover_can_change_execution_definition_without_changing_domain_identity(self):
        execution = self.execution()
        execution.rollover("R2", new_definition_revision="D2")
        self.assertEqual(execution.definition_revision, "D2")
        self.assertEqual(execution.semantic_links, {"C1"})

    def test_runtime_completion_does_not_fulfill_business_commitment(self):
        world = self.world()
        execution = self.execution()
        execution.complete()
        self.assertEqual(execution.status, ExecutionStatus.COMPLETED)
        self.assertFalse(business_process_complete(world, commitment_ids=["C1"]))

    def test_business_can_complete_while_runtime_is_still_running(self):
        world = self.world()
        execution = self.execution()
        world.fulfill("C1", "O1", "alice")
        self.assertTrue(business_process_complete(world, commitment_ids=["C1"]))
        self.assertEqual(execution.status, ExecutionStatus.RUNNING)

    def test_runtime_cancel_does_not_reverse_committed_domain_operation(self):
        world = self.world()
        execution = self.execution()
        operation = SemanticOperation("O1", digest("post journal"), "alice", {"posted": True})
        self.assertEqual(world.commit(operation), CommitOutcome.COMMITTED)
        execution.cancel()
        self.assertEqual(execution.status, ExecutionStatus.CANCELLED)
        self.assertTrue(world.values["posted"])
        self.assertIn("O1", world.committed_operations)

    def test_runtime_cancel_does_not_change_confirmed_effect(self):
        world = self.world()
        execution = self.execution()
        world.set_effect("E1", EffectKnowledge.CONFIRMED)
        execution.cancel()
        self.assertEqual(world.effects["E1"], EffectKnowledge.CONFIRMED)

    def test_activity_step_observes_effect_knowledge_instead_of_inventing_success(self):
        world = self.world()
        execution = self.execution()
        world.set_effect("E1", EffectKnowledge.INDETERMINATE)
        result = execution.durable_step("wait-effect", lambda: effect_step_result(world, "E1"))
        self.assertEqual(result, EffectKnowledge.INDETERMINATE)
        self.assertNotEqual(result, EffectKnowledge.CONFIRMED)

    def test_business_completion_can_require_effect_confirmation(self):
        world = self.world()
        world.fulfill("C1", "O1", "alice")
        world.set_effect("E1", EffectKnowledge.PENDING)
        self.assertFalse(business_process_complete(world, commitment_ids=["C1"], required_effect_ids=["E1"]))
        world.set_effect("E1", EffectKnowledge.CONFIRMED)
        self.assertTrue(business_process_complete(world, commitment_ids=["C1"], required_effect_ids=["E1"]))

    def test_execution_can_link_multiple_domain_subjects_without_merging_them(self):
        execution = self.execution()
        execution.semantic_links.update({"ORDER-1", "ORDER-2", "ORDER-3"})
        self.assertEqual(len(execution.semantic_links), 4)
        self.assertNotEqual(execution.instance_id, "ORDER-1")

    def test_two_executions_can_link_same_domain_subject(self):
        first = self.execution()
        second = OrchestrationExecution("X2", "R1", "D1", semantic_links={"C1"})
        self.assertNotEqual(first.instance_id, second.instance_id)
        self.assertEqual(first.semantic_links & second.semantic_links, {"C1"})

    def test_short_semantic_operation_needs_no_workflow_instance(self):
        world = self.world()
        operation = SemanticOperation("O-direct", digest("simple update"), "alice", {"x": 1})
        self.assertEqual(world.commit(operation), CommitOutcome.COMMITTED)
        self.assertEqual(world.values["x"], 1)


if __name__ == "__main__":
    unittest.main()
