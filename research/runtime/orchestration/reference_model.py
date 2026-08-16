#!/usr/bin/env python3
"""Executable research model for issue #43.

This is NOT a workflow engine or target metamodel. It exists to make the
business-semantics / orchestration-memory boundary executable.

The model deliberately separates:

* domain Commitment state from runtime timers;
* semantic LocalOperation identity from runtime step/checkpoint identity;
* #41-like Effect knowledge from Activity completion;
* source Observation identity from runtime signal delivery;
* governed Approval from a human-task UI completion;
* orchestration instance identity from execution run/epoch identity;
* runtime cancellation/completion from business cancellation/completion.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from typing import Callable, Mapping


class CommitOutcome(str, Enum):
    COMMITTED = "committed"
    REPLAYED = "replayed"
    DENIED = "denied"


class EffectKnowledge(str, Enum):
    UNATTEMPTED = "unattempted"
    PENDING = "pending"
    INDETERMINATE = "indeterminate"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"


class ExecutionStatus(str, Enum):
    RUNNING = "running"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


@dataclass
class Commitment:
    commitment_id: str
    due_at: int
    fulfilled: bool = False

    def overdue_at(self, now: int) -> bool:
        return now >= self.due_at and not self.fulfilled


@dataclass(frozen=True)
class SemanticOperation:
    operation_id: str
    intent_digest: str
    actor: str
    writes: Mapping[str, object]
    requires_current_grant: bool = True


@dataclass
class DomainWorld:
    """Tiny stand-in for #40/#41/#42 authoritative semantics."""

    commitments: dict[str, Commitment] = field(default_factory=dict)
    values: dict[str, object] = field(default_factory=dict)
    committed_operations: dict[str, str] = field(default_factory=dict)
    current_grants: set[str] = field(default_factory=set)
    approvals: set[tuple[str, str]] = field(default_factory=set)  # (proposal digest, approver)
    effects: dict[str, EffectKnowledge] = field(default_factory=dict)

    def commit(self, operation: SemanticOperation) -> CommitOutcome:
        previous = self.committed_operations.get(operation.operation_id)
        if previous is not None:
            if previous != operation.intent_digest:
                raise ValueError("semantic operation id reused for different intent")
            return CommitOutcome.REPLAYED

        if operation.requires_current_grant and operation.actor not in self.current_grants:
            return CommitOutcome.DENIED

        self.values.update(operation.writes)
        self.committed_operations[operation.operation_id] = operation.intent_digest
        return CommitOutcome.COMMITTED

    def approve(self, proposal_digest: str, approver: str) -> bool:
        if approver not in self.current_grants:
            return False
        self.approvals.add((proposal_digest, approver))
        return True

    def fulfill(self, commitment_id: str, operation_id: str, actor: str) -> CommitOutcome:
        commitment = self.commitments[commitment_id]
        operation = SemanticOperation(
            operation_id=operation_id,
            intent_digest=digest(f"fulfill:{commitment_id}"),
            actor=actor,
            writes={f"commitment:{commitment_id}:fulfilled": True},
        )
        result = self.commit(operation)
        if result in {CommitOutcome.COMMITTED, CommitOutcome.REPLAYED}:
            commitment.fulfilled = True
        return result

    def set_effect(self, effect_id: str, knowledge: EffectKnowledge) -> None:
        self.effects[effect_id] = knowledge


@dataclass(frozen=True)
class TimerRegistration:
    timer_id: str
    wake_at: int
    purpose: str
    domain_ref: str | None = None


@dataclass(frozen=True)
class RuntimeInput:
    delivery_id: str
    observation_id: str
    kind: str
    domain_ref: str | None = None


@dataclass
class OrchestrationExecution:
    instance_id: str
    run_id: str
    definition_revision: str
    semantic_links: set[str] = field(default_factory=set)
    status: ExecutionStatus = ExecutionStatus.RUNNING
    completed_steps: dict[str, object] = field(default_factory=dict)
    timers: dict[str, TimerRegistration] = field(default_factory=dict)
    fired_timers: set[str] = field(default_factory=set)
    inputs: dict[str, RuntimeInput] = field(default_factory=dict)  # by delivery id
    observation_ids: set[str] = field(default_factory=set)
    human_tasks_completed: set[str] = field(default_factory=set)
    run_history: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.run_history:
            self.run_history.append(self.run_id)

    def schedule_timer(self, timer: TimerRegistration) -> None:
        self._ensure_active()
        self.timers[timer.timer_id] = timer

    def fire_timer(self, timer_id: str, now: int) -> bool:
        """Record runtime wake only. Never changes business state."""
        timer = self.timers[timer_id]
        if now < timer.wake_at:
            return False
        self.fired_timers.add(timer_id)
        return True

    def deliver_input(self, item: RuntimeInput) -> bool:
        """Runtime delivery dedupe is not domain admission.

        Different deliveries of the same Observation are retained as deliveries,
        while the observation ID set lets semantic consumers avoid treating them
        as independent business evidence.
        """
        if item.delivery_id in self.inputs:
            return False
        self.inputs[item.delivery_id] = item
        self.observation_ids.add(item.observation_id)
        return True

    def complete_human_task(self, task_id: str) -> None:
        self._ensure_active()
        self.human_tasks_completed.add(task_id)

    def durable_step(
        self,
        step_id: str,
        fn: Callable[[], object],
    ) -> object:
        """Checkpoint a runtime result.

        If the runtime checkpoint was lost after a semantic commit, fn can safely
        call the #40 boundary again only by reusing the semantic operation ID.
        The DomainWorld then returns REPLAYED rather than applying it twice.
        """
        self._ensure_active()
        if step_id in self.completed_steps:
            return self.completed_steps[step_id]
        result = fn()
        self.completed_steps[step_id] = result
        return result

    def simulate_lost_checkpoint(self, step_id: str) -> None:
        self.completed_steps.pop(step_id, None)

    def rollover(self, new_run_id: str, new_definition_revision: str | None = None) -> None:
        """New execution epoch, same logical orchestration instance."""
        self._ensure_active()
        if new_run_id == self.run_id:
            raise ValueError("run id must change on rollover")
        self.run_id = new_run_id
        self.run_history.append(new_run_id)
        if new_definition_revision is not None:
            self.definition_revision = new_definition_revision
        # Timers/inputs/checkpoints are intentionally not cleared by this toy
        # method. A real backend migration defines what execution memory transfers.

    def cancel(self) -> None:
        self.status = ExecutionStatus.CANCELLED

    def complete(self) -> None:
        self.status = ExecutionStatus.COMPLETED

    def _ensure_active(self) -> None:
        if self.status != ExecutionStatus.RUNNING:
            raise RuntimeError(f"execution is {self.status.value}")


def evaluate_commitment_after_timer(
    execution: OrchestrationExecution,
    world: DomainWorld,
    *,
    timer_id: str,
    commitment_id: str,
    now: int,
) -> bool:
    """Wake on runtime timer, evaluate authoritative current domain state."""
    if timer_id not in execution.fired_timers:
        raise ValueError("timer has not fired")
    return world.commitments[commitment_id].overdue_at(now)


def effect_step_result(world: DomainWorld, effect_id: str) -> EffectKnowledge:
    """A runtime step observes #41 knowledge; it does not derive success itself."""
    return world.effects.get(effect_id, EffectKnowledge.UNATTEMPTED)


def business_process_complete(
    world: DomainWorld,
    *,
    commitment_ids: list[str],
    required_effect_ids: list[str] = (),
) -> bool:
    """Example domain projection independent of execution terminal status."""
    commitments_done = all(world.commitments[cid].fulfilled for cid in commitment_ids)
    effects_done = all(world.effects.get(eid) == EffectKnowledge.CONFIRMED for eid in required_effect_ids)
    return commitments_done and effects_done


def digest(text: str) -> str:
    return sha256(text.encode()).hexdigest()
