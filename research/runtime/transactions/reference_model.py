#!/usr/bin/env python3
"""Tiny executable research model for issue #40 commit semantics.

This is NOT a database, transaction manager, production Action runtime, or target
metamodel. It exists to make a few semantic distinctions executable:

* semantic operation identity survives physical attempts;
* same idempotency identity cannot be reused for different intent;
* live/current state basis differs from frozen immutable basis;
* approval bounds are tied to a proposal/intent, not a sticky boolean;
* domain invariants validate the hypothetical atomic state;
* a commit can be durable while the caller receives an indeterminate outcome;
* retrying that indeterminate operation can reconcile via a durable marker;
* a state basis not being satisfied is NOT automatically the same thing as a
  proposal becoming semantically invalid and requiring reapproval.

Concurrency control itself is supplied by real runtimes (#39/#40 evaluation). The
model simulates stale/conflict conditions and atomic application in memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from typing import Callable, Mapping, Sequence


class Outcome(str, Enum):
    COMMITTED = "committed"
    REPLAYED_COMMITTED = "replayed_committed"
    DEFINITELY_NOT_COMMITTED = "definitely_not_committed"
    COMMIT_OUTCOME_INDETERMINATE = "commit_outcome_indeterminate"
    BASIS_NOT_SATISFIED = "basis_not_satisfied"
    NEEDS_REPROPOSAL = "needs_reproposal"
    IDEMPOTENCY_MISMATCH = "idempotency_mismatch"


@dataclass(frozen=True)
class Result:
    outcome: Outcome
    operation_id: str
    reason: str = ""
    commit_revision: int | None = None


@dataclass
class World:
    values: dict[str, int | str | bool] = field(default_factory=dict)
    versions: dict[str, int] = field(default_factory=dict)
    revision: int = 0
    committed_operations: dict[str, tuple[str, int]] = field(default_factory=dict)

    def set_initial(self, key: str, value: int | str | bool, version: int = 1) -> None:
        self.values[key] = value
        self.versions[key] = version

    def clone_values(self) -> dict[str, int | str | bool]:
        return dict(self.values)


class Basis:
    """Research-only state-basis check."""

    def check(self, world: World) -> tuple[bool, str]:
        raise NotImplementedError


@dataclass(frozen=True)
class ExactVersion(Basis):
    key: str
    expected: int

    def check(self, world: World) -> tuple[bool, str]:
        actual = world.versions.get(self.key, 0)
        return actual == self.expected, f"{self.key} version expected={self.expected} actual={actual}"


@dataclass(frozen=True)
class CurrentPredicate(Basis):
    name: str
    predicate: Callable[[Mapping[str, int | str | bool]], bool]

    def check(self, world: World) -> tuple[bool, str]:
        ok = bool(self.predicate(world.values))
        return ok, f"current predicate {self.name}={'passed' if ok else 'failed'}"


@dataclass(frozen=True)
class ImmutableReference(Basis):
    """Pin immutable content; current mutable world is intentionally irrelevant."""

    reference_id: str
    expected_digest: str
    supplied_content: str

    def check(self, world: World) -> tuple[bool, str]:  # world intentionally unused
        del world
        actual = sha256(self.supplied_content.encode()).hexdigest()
        return actual == self.expected_digest, f"immutable reference {self.reference_id} integrity"


@dataclass(frozen=True)
class NoMutableDependency(Basis):
    def check(self, world: World) -> tuple[bool, str]:
        del world
        return True, "no mutable state dependency"


@dataclass(frozen=True)
class Approval:
    approval_id: str
    intent_digest: str
    max_amount: int | None = None
    active: bool = True

    def permits(self, operation: "Operation") -> tuple[bool, str]:
        if not self.active:
            return False, "approval inactive/revoked by its own approval contract"
        if self.intent_digest != operation.intent_digest:
            return False, "approval is for different intent"
        if self.max_amount is not None and operation.amount is not None and operation.amount > self.max_amount:
            return False, f"amount {operation.amount} exceeds approved maximum {self.max_amount}"
        return True, "approval permits operation"


@dataclass(frozen=True)
class Operation:
    operation_id: str
    intent_digest: str
    writes: Mapping[str, int | str | bool]
    basis: Sequence[Basis] = ()
    approval: Approval | None = None
    amount: int | None = None


Invariant = Callable[[Mapping[str, int | str | bool]], bool]


class ReferenceCommitEngine:
    """Atomic in-memory semantic model; deliberately not a concurrency engine."""

    def __init__(self, world: World, invariants: Sequence[tuple[str, Invariant]] = ()):
        self.world = world
        self.invariants = list(invariants)

    def commit(
        self,
        operation: Operation,
        *,
        known_conflict: bool = False,
        indeterminate_after_apply: bool = False,
    ) -> Result:
        # Dedupe is checked before any state-dependent recomputation: a duplicate
        # of an already committed semantic operation returns historical evidence.
        previous = self.world.committed_operations.get(operation.operation_id)
        if previous is not None:
            prior_intent, revision = previous
            if prior_intent != operation.intent_digest:
                return Result(Outcome.IDEMPOTENCY_MISMATCH, operation.operation_id, "same operation id, different intent")
            return Result(Outcome.REPLAYED_COMMITTED, operation.operation_id, "durable operation marker already exists", revision)

        if known_conflict:
            # Simulates errors whose transaction protocol proves the attempt did
            # not commit (serialization conflict / failed guarded attempt).
            return Result(Outcome.DEFINITELY_NOT_COMMITTED, operation.operation_id, "known physical conflict")

        if operation.approval is not None:
            allowed, reason = operation.approval.permits(operation)
            if not allowed:
                # Approval/intention mismatch is semantic, not just a transient
                # current-state condition: a new proposal/approval is needed.
                return Result(Outcome.NEEDS_REPROPOSAL, operation.operation_id, reason)

        for dependency in operation.basis:
            ok, reason = dependency.check(self.world)
            if not ok:
                # The operation/lifecycle policy decides whether a basis failure
                # should be retried later, recomputed, or escalated to a new
                # proposal. The generic commit engine must not guess.
                return Result(Outcome.BASIS_NOT_SATISFIED, operation.operation_id, reason)

        hypothetical = self.world.clone_values()
        hypothetical.update(operation.writes)
        for name, invariant in self.invariants:
            if not invariant(hypothetical):
                return Result(Outcome.DEFINITELY_NOT_COMMITTED, operation.operation_id, f"invariant failed: {name}")

        # The in-memory assignment plus operation marker is our research-model
        # stand-in for one atomic authoritative commit.
        self.world.revision += 1
        commit_revision = self.world.revision
        for key, value in operation.writes.items():
            self.world.values[key] = value
            self.world.versions[key] = self.world.versions.get(key, 0) + 1
        self.world.committed_operations[operation.operation_id] = (operation.intent_digest, commit_revision)

        if indeterminate_after_apply:
            # Durable state exists but caller did not obtain proof in this attempt.
            return Result(
                Outcome.COMMIT_OUTCOME_INDETERMINATE,
                operation.operation_id,
                "commit applied; caller-side result intentionally indeterminate",
                None,
            )

        return Result(Outcome.COMMITTED, operation.operation_id, "commit applied", commit_revision)


def digest(text: str) -> str:
    return sha256(text.encode()).hexdigest()
