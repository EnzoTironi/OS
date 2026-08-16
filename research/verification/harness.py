#!/usr/bin/env python3
"""Small cross-family semantic fuzz harness for issues #46/#51.

This is not the production OS state model. It gives the verification program a
shared executable vocabulary for safety boundaries that recur across Wave B.

The model intentionally keeps:
- authoritative business state separate from derived projections;
- local semantic operation identity separate from retry attempts;
- external effect knowledge separate from local cancellation/restore;
- runtime timer state separate from domain commitment state;
- grants constrained by parent scope/tenant;
- historical revision bindings stable after current revision changes.

The module also contains a dependency-free delta-debugging shrinker. Hypothesis
is used by test_harness.py for richer generation/stateful testing; this shrinker
is retained because regression fixtures and explicit-model counterexamples must
be minimizable without a testing framework runtime.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from random import Random
from typing import Callable, Iterable, Mapping, Sequence


class EffectKnowledge(str, Enum):
    NOT_ATTEMPTED = "not_attempted"
    INDETERMINATE = "indeterminate"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CONTRADICTED = "contradicted"


@dataclass(frozen=True)
class Grant:
    grant_id: str
    tenant: str
    scopes: frozenset[str]
    parent_id: str | None = None


@dataclass(frozen=True)
class HistoricalOperation:
    operation_id: str
    intent: str
    ontology_revision: str
    policy_revision: str


@dataclass
class SafetyModel:
    authoritative_values: dict[str, object] = field(default_factory=dict)
    derived_values: dict[str, object] = field(default_factory=dict)
    operation_intents: dict[str, str] = field(default_factory=dict)
    operation_apply_count: dict[str, int] = field(default_factory=dict)
    observations_seen: set[str] = field(default_factory=set)
    business_occurrence_count: int = 0
    effects: dict[str, EffectKnowledge] = field(default_factory=dict)
    commitments_fulfilled: dict[str, bool] = field(default_factory=dict)
    timers_fired: set[str] = field(default_factory=set)
    grants: dict[str, Grant] = field(default_factory=dict)
    historical_operations: dict[str, HistoricalOperation] = field(default_factory=dict)
    current_ontology_revision: str = "ont-1"
    current_policy_revision: str = "pol-1"
    external_confirmed_effects: set[str] = field(default_factory=set)

    def apply_semantic_operation(
        self,
        operation_id: str,
        intent: str,
        writes: Mapping[str, object] | None = None,
    ) -> str:
        previous = self.operation_intents.get(operation_id)
        if previous is not None:
            if previous != intent:
                return "mismatch"
            return "replayed"
        self.operation_intents[operation_id] = intent
        self.operation_apply_count[operation_id] = 1
        if writes:
            self.authoritative_values.update(writes)
        self.historical_operations[operation_id] = HistoricalOperation(
            operation_id=operation_id,
            intent=intent,
            ontology_revision=self.current_ontology_revision,
            policy_revision=self.current_policy_revision,
        )
        return "committed"

    def deliver_observation(self, observation_id: str) -> str:
        if observation_id in self.observations_seen:
            return "duplicate"
        self.observations_seen.add(observation_id)
        self.business_occurrence_count += 1
        return "accepted"

    def effect_attempt(self, effect_id: str, evidence: str) -> EffectKnowledge:
        prior = self.effects.get(effect_id, EffectKnowledge.NOT_ATTEMPTED)
        if evidence == "definitely_not_sent":
            # Later local failure cannot erase uncertainty/evidence from an older send.
            return prior
        if evidence == "sent_no_response":
            if prior == EffectKnowledge.NOT_ATTEMPTED:
                prior = EffectKnowledge.INDETERMINATE
        elif evidence == "accepted_pending":
            if prior in {EffectKnowledge.NOT_ATTEMPTED, EffectKnowledge.INDETERMINATE}:
                prior = EffectKnowledge.PENDING
        elif evidence == "confirmed":
            if prior in {EffectKnowledge.REJECTED, EffectKnowledge.CONTRADICTED}:
                prior = EffectKnowledge.CONTRADICTED
            else:
                prior = EffectKnowledge.CONFIRMED
                self.external_confirmed_effects.add(effect_id)
        elif evidence == "rejected":
            if prior in {EffectKnowledge.CONFIRMED, EffectKnowledge.CONTRADICTED}:
                prior = EffectKnowledge.CONTRADICTED
            else:
                prior = EffectKnowledge.REJECTED
        else:
            raise ValueError(f"unknown effect evidence: {evidence}")
        self.effects[effect_id] = prior
        return prior

    def fire_timer(self, timer_id: str) -> None:
        self.timers_fired.add(timer_id)
        # Deliberately no domain mutation.

    def fulfill_commitment(self, commitment_id: str) -> None:
        self.commitments_fulfilled[commitment_id] = True

    def mutate_derived(self, key: str, value: object) -> None:
        self.derived_values[key] = value
        # Deliberately cannot mutate authoritative_values.

    def grant_root(self, grant_id: str, tenant: str, scopes: Iterable[str]) -> Grant:
        grant = Grant(grant_id, tenant, frozenset(scopes), None)
        self.grants[grant_id] = grant
        return grant

    def delegate(self, parent_id: str, child_id: str, tenant: str, scopes: Iterable[str]) -> str:
        parent = self.grants[parent_id]
        scope_set = frozenset(scopes)
        if tenant != parent.tenant:
            return "tenant_violation"
        if not scope_set.issubset(parent.scopes):
            return "scope_escalation"
        self.grants[child_id] = Grant(child_id, tenant, scope_set, parent_id)
        return "delegated"

    def change_revisions(self, ontology_revision: str | None = None, policy_revision: str | None = None) -> None:
        if ontology_revision is not None:
            self.current_ontology_revision = ontology_revision
        if policy_revision is not None:
            self.current_policy_revision = policy_revision

    def local_restore(self, authoritative_values: Mapping[str, object]) -> None:
        """Toy local restore: external confirmed effects intentionally survive."""
        self.authoritative_values = dict(authoritative_values)

    def cancel_local_execution(self) -> None:
        """No-op for external reality by design."""

    def invariant_violations(self) -> list[str]:
        violations: list[str] = []
        for operation_id, count in self.operation_apply_count.items():
            if count != 1:
                violations.append(f"operation {operation_id} applied {count} times")
        for grant in self.grants.values():
            if grant.parent_id is None:
                continue
            parent = self.grants.get(grant.parent_id)
            if parent is None:
                violations.append(f"grant {grant.grant_id} missing parent")
                continue
            if grant.tenant != parent.tenant:
                violations.append(f"grant {grant.grant_id} crosses tenant")
            if not grant.scopes.issubset(parent.scopes):
                violations.append(f"grant {grant.grant_id} exceeds parent")
        for operation in self.historical_operations.values():
            if not operation.ontology_revision or not operation.policy_revision:
                violations.append(f"operation {operation.operation_id} lost revision fidelity")
        return violations


@dataclass(frozen=True)
class TraceOperation:
    op: str
    args: tuple[object, ...] = ()


def execute_trace(trace: Sequence[TraceOperation], model: SafetyModel | None = None) -> SafetyModel:
    state = model or SafetyModel()
    for item in trace:
        if item.op == "semantic":
            operation_id, intent = item.args
            state.apply_semantic_operation(str(operation_id), str(intent))
        elif item.op == "observation":
            (observation_id,) = item.args
            state.deliver_observation(str(observation_id))
        elif item.op == "effect":
            effect_id, evidence = item.args
            state.effect_attempt(str(effect_id), str(evidence))
        elif item.op == "timer":
            (timer_id,) = item.args
            state.fire_timer(str(timer_id))
        elif item.op == "fulfill":
            (commitment_id,) = item.args
            state.fulfill_commitment(str(commitment_id))
        elif item.op == "derived":
            key, value = item.args
            state.mutate_derived(str(key), value)
        elif item.op == "revision":
            ontology, policy = item.args
            state.change_revisions(str(ontology), str(policy))
        elif item.op == "restore":
            state.local_restore({})
        elif item.op == "cancel":
            state.cancel_local_execution()
        else:
            raise ValueError(f"unknown trace operation: {item.op}")
        violations = state.invariant_violations()
        if violations:
            raise AssertionError("; ".join(violations))
    return state


def generated_trace(seed: int, length: int = 50) -> list[TraceOperation]:
    rng = Random(seed)
    operations: list[TraceOperation] = []
    evidence = ["definitely_not_sent", "sent_no_response", "accepted_pending", "confirmed", "rejected"]
    for _ in range(length):
        choice = rng.randrange(8)
        if choice == 0:
            operations.append(TraceOperation("semantic", (f"O{rng.randrange(4)}", f"intent-{rng.randrange(5)}")))
        elif choice == 1:
            operations.append(TraceOperation("observation", (f"OBS{rng.randrange(5)}",)))
        elif choice == 2:
            operations.append(TraceOperation("effect", (f"E{rng.randrange(3)}", rng.choice(evidence))))
        elif choice == 3:
            operations.append(TraceOperation("timer", (f"T{rng.randrange(3)}",)))
        elif choice == 4:
            operations.append(TraceOperation("fulfill", (f"C{rng.randrange(3)}",)))
        elif choice == 5:
            operations.append(TraceOperation("derived", (f"K{rng.randrange(3)}", rng.randrange(100))))
        elif choice == 6:
            operations.append(TraceOperation("revision", (f"ont-{rng.randrange(4)}", f"pol-{rng.randrange(4)}")))
        else:
            operations.append(TraceOperation(rng.choice(["restore", "cancel"])))
    return operations


def ddmin(trace: Sequence[TraceOperation], fails: Callable[[Sequence[TraceOperation]], bool]) -> list[TraceOperation]:
    """Classic delta debugging by deleting chunks until 1-minimal."""
    current = list(trace)
    if not fails(current):
        raise ValueError("input trace does not fail")
    granularity = 2
    while len(current) >= 2:
        chunk_size = (len(current) + granularity - 1) // granularity
        reduced = False
        for start in range(0, len(current), chunk_size):
            candidate = current[:start] + current[start + chunk_size :]
            if candidate and fails(candidate):
                current = candidate
                granularity = max(2, granularity - 1)
                reduced = True
                break
        if reduced:
            continue
        if granularity >= len(current):
            break
        granularity = min(len(current), granularity * 2)
    return current


def naive_effect_last_write_wins(trace: Sequence[TraceOperation]) -> EffectKnowledge:
    """Deliberately wrong model used to prove the harness finds a known bug."""
    knowledge = EffectKnowledge.NOT_ATTEMPTED
    for item in trace:
        if item.op != "effect":
            continue
        _, evidence = item.args
        if evidence == "sent_no_response":
            knowledge = EffectKnowledge.INDETERMINATE
        elif evidence == "definitely_not_sent":
            knowledge = EffectKnowledge.NOT_ATTEMPTED  # BUG: erases older uncertainty
        elif evidence == "accepted_pending":
            knowledge = EffectKnowledge.PENDING
        elif evidence == "confirmed":
            knowledge = EffectKnowledge.CONFIRMED
        elif evidence == "rejected":
            knowledge = EffectKnowledge.REJECTED
    return knowledge


def effect_uncertainty_erased(trace: Sequence[TraceOperation]) -> bool:
    sent_seen = False
    for item in trace:
        if item.op == "effect" and len(item.args) == 2 and item.args[1] == "sent_no_response":
            sent_seen = True
    return sent_seen and naive_effect_last_write_wins(trace) == EffectKnowledge.NOT_ATTEMPTED
