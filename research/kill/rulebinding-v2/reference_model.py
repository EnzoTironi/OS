#!/usr/bin/env python3
"""Executable post-R5 RuleBinding reduction model for issue #156.

This is a bounded semantic model, not production architecture. The classes named
CapabilityType/CapabilityToken are research conveniences for a proposed standard
Type contract plus runtime capability values; their existence here is not itself
a proposal for an additional semantic base form.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from typing import Any, Callable


class ModelError(RuntimeError):
    pass


class CapabilityDenied(ModelError):
    def __init__(self, capability_type: str, evidence: tuple[str, ...] = ()) -> None:
        super().__init__(f"{capability_type}: denied")
        self.capability_type = capability_type
        self.evidence = evidence


class CapabilityEvaluationError(ModelError):
    def __init__(self, capability_type: str, evidence: tuple[str, ...] = ()) -> None:
        super().__init__(f"{capability_type}: evaluator error")
        self.capability_type = capability_type
        self.evidence = evidence


class StaleCapability(ModelError):
    pass


class WrongCapability(ModelError):
    pass


class ComputationMutation(ModelError):
    pass


class Decision(str, Enum):
    PERMIT = "permit"
    DENY = "deny"
    ERROR = "error"


@dataclass(frozen=True)
class RuleResult:
    decision: Decision
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True)
class EvaluationContext:
    engine: "CapabilityEngine"
    target: str
    operation_id: str | None = None
    actor: str | None = None
    represented_principal: str | None = None
    workload: str | None = None
    inputs: dict[str, Any] = field(default_factory=dict)
    pending_state: dict[str, Any] | None = None
    pinned_state: dict[str, Any] | None = None

    def current(self, key: str, default: Any = None) -> Any:
        return self.engine.state.get(key, default)

    def pending(self, key: str, default: Any = None) -> Any:
        if self.pending_state is None:
            return self.current(key, default)
        return self.pending_state.get(key, default)

    def pinned(self, key: str, default: Any = None) -> Any:
        if self.pinned_state is None:
            raise ModelError("pinned state required")
        return self.pinned_state.get(key, default)


ComputationFn = Callable[[EvaluationContext], RuleResult]


@dataclass(frozen=True)
class ComputationDef:
    name: str
    fn: ComputationFn
    revision: str = "v1"


@dataclass(frozen=True)
class CapabilityType:
    """Research encoding of a standard refined Type contract.

    `refinements` are checked whenever a value of this Type is minted. There is
    deliberately no locus/scope field and no registry lookup by operation phase.
    An operation signature simply demands a value of a particular Type.
    """

    name: str
    refinements: tuple[str, ...] = ()
    freshness: str = "none"  # none | current | pinned


@dataclass(frozen=True)
class CapabilityToken:
    type_name: str
    target: str
    operation_id: str | None
    basis_revision: int | None
    pinned_digest: str | None
    evidence: tuple[str, ...]
    evaluator_revisions: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class OperationSignature:
    name: str
    required_capabilities: tuple[str, ...]


class CapabilityEngine:
    """M4 candidate: proof-carrying operation signatures, no RuleBinding registry."""

    def __init__(self) -> None:
        self.state: dict[str, Any] = {}
        self.revision = 0
        self.computations: dict[str, ComputationDef] = {}
        self.capability_types: dict[str, CapabilityType] = {}
        self.signatures: dict[str, OperationSignature] = {}
        self.audit: list[dict[str, Any]] = []
        self.effects_attempted: list[str] = []
        self.occurrences: dict[str, dict[str, Any]] = {}

    def add_computation(self, definition: ComputationDef) -> None:
        self.computations[definition.name] = definition

    def add_capability_type(self, definition: CapabilityType) -> None:
        for name in definition.refinements:
            if name not in self.computations:
                raise ModelError(f"undefined refinement {name}")
        self.capability_types[definition.name] = definition

    def add_signature(self, signature: OperationSignature) -> None:
        for required in signature.required_capabilities:
            if required not in self.capability_types:
                raise ModelError(f"undefined capability type {required}")
        self.signatures[signature.name] = signature

    def _snapshot(self) -> tuple[Any, ...]:
        return (
            deepcopy(self.state),
            self.revision,
            deepcopy(self.audit),
            deepcopy(self.effects_attempted),
            deepcopy(self.occurrences),
        )

    def _restore(self, snapshot: tuple[Any, ...]) -> None:
        self.state, self.revision, self.audit, self.effects_attempted, self.occurrences = deepcopy(snapshot)

    def run_computation(self, name: str, ctx: EvaluationContext) -> RuleResult:
        before = self._snapshot()
        result = self.computations[name].fn(ctx)
        after = self._snapshot()
        if before != after:
            self._restore(before)
            raise ComputationMutation(f"computation {name} mutated authoritative/runtime state")
        if not isinstance(result, RuleResult):
            raise ModelError(f"computation {name} returned {result!r}, expected RuleResult")
        return result

    @staticmethod
    def _digest(value: dict[str, Any] | None) -> str | None:
        if value is None:
            return None
        canonical = repr(sorted(value.items())).encode("utf-8")
        return sha256(canonical).hexdigest()

    def mint(
        self,
        capability_type: str,
        *,
        target: str,
        operation_id: str | None = None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        inputs: dict[str, Any] | None = None,
        pending_state: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> CapabilityToken:
        """Construct a refined capability value.

        Refinements are Type-value validation, not callbacks scheduled from a
        scope/locus registry. Any DENY or ERROR prevents construction; ERROR is
        kept distinguishable from DENY.
        """

        definition = self.capability_types[capability_type]
        ctx = EvaluationContext(
            engine=self,
            target=target,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            inputs=dict(inputs or {}),
            pending_state=deepcopy(pending_state) if pending_state is not None else None,
            pinned_state=deepcopy(pinned_state) if pinned_state is not None else None,
        )
        evidence: list[str] = []
        evaluator_revisions: list[tuple[str, str]] = []
        for evaluator_name in definition.refinements:
            evaluator = self.computations[evaluator_name]
            outcome = self.run_computation(evaluator_name, ctx)
            evidence.extend(outcome.evidence or (evaluator_name,))
            evaluator_revisions.append((evaluator_name, evaluator.revision))
            if outcome.decision is Decision.DENY:
                raise CapabilityDenied(capability_type, tuple(evidence))
            if outcome.decision is Decision.ERROR:
                raise CapabilityEvaluationError(capability_type, tuple(evidence))

        basis_revision = self.revision if definition.freshness == "current" else None
        pinned_digest = self._digest(pinned_state) if definition.freshness == "pinned" else None
        if definition.freshness == "pinned" and pinned_digest is None:
            raise ModelError(f"{capability_type} requires pinned state")
        return CapabilityToken(
            type_name=capability_type,
            target=target,
            operation_id=operation_id,
            basis_revision=basis_revision,
            pinned_digest=pinned_digest,
            evidence=tuple(evidence),
            evaluator_revisions=tuple(evaluator_revisions),
        )

    def _verify_token(
        self,
        token: CapabilityToken,
        expected_type: str,
        *,
        target: str,
        operation_id: str | None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        if token.type_name != expected_type or token.target != target:
            raise WrongCapability(f"need {expected_type} for {target}, got {token.type_name} for {token.target}")
        if token.operation_id is not None and operation_id != token.operation_id:
            raise WrongCapability("capability is bound to a different semantic operation")
        definition = self.capability_types[expected_type]
        if definition.freshness == "current" and token.basis_revision != self.revision:
            raise StaleCapability(f"{expected_type} was minted at revision {token.basis_revision}, current {self.revision}")
        if definition.freshness == "pinned" and token.pinned_digest != self._digest(pinned_state):
            raise StaleCapability(f"{expected_type} pinned basis mismatch")

    def _verify_signature(
        self,
        operation_name: str,
        tokens: dict[str, CapabilityToken],
        *,
        target: str,
        operation_id: str | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        signature = self.signatures[operation_name]
        if set(tokens) != set(signature.required_capabilities):
            raise WrongCapability(
                f"{operation_name} requires {signature.required_capabilities}, got {tuple(sorted(tokens))}"
            )
        for required in signature.required_capabilities:
            self._verify_token(
                tokens[required],
                required,
                target=target,
                operation_id=operation_id,
                pinned_state=pinned_state,
            )

    def preview(self, action_name: str, token: CapabilityToken, *, operation_id: str | None = None) -> None:
        self._verify_signature(
            f"preview:{action_name}",
            {token.type_name: token},
            target=action_name,
            operation_id=operation_id,
        )

    def authoritative_commit(
        self,
        *,
        operation_name: str,
        target: str,
        operation_id: str,
        proposed_state: dict[str, Any],
        tokens: dict[str, CapabilityToken],
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        """Single low-level local authority boundary shared by Action/admin paths."""
        self._verify_signature(
            operation_name,
            tokens,
            target=target,
            operation_id=operation_id,
            pinned_state=pinned_state,
        )
        self.state = deepcopy(proposed_state)
        self.audit.append(
            {
                "operation": operation_name,
                "operation_id": operation_id,
                "target": target,
                "evidence": tuple(
                    evidence
                    for required in self.signatures[operation_name].required_capabilities
                    for evidence in tokens[required].evidence
                ),
                "evaluator_revisions": tuple(
                    rev
                    for required in self.signatures[operation_name].required_capabilities
                    for rev in tokens[required].evaluator_revisions
                ),
            }
        )
        self.revision += 1

    def read(self, type_name: str, token: CapabilityToken) -> dict[str, Any]:
        self._verify_signature(
            f"read:{type_name}",
            {token.type_name: token},
            target=type_name,
        )
        return deepcopy(self.state)

    def create_occurrence(self, occurrence_id: str, payload: dict[str, Any]) -> None:
        if occurrence_id in self.occurrences:
            raise ModelError("duplicate occurrence")
        self.occurrences[occurrence_id] = deepcopy(payload)
        self.revision += 1

    def update_occurrence(self, occurrence_id: str, changes: dict[str, Any], token: CapabilityToken) -> None:
        self._verify_signature(
            "update:Occurrence",
            {token.type_name: token},
            target="Occurrence",
        )
        self.occurrences[occurrence_id].update(changes)
        self.revision += 1

    def effect_attempt(self, effect_id: str, token: CapabilityToken) -> None:
        self._verify_signature(
            "effect-attempt",
            {token.type_name: token},
            target=effect_id,
        )
        self.effects_attempted.append(effect_id)


# ---------------------------------------------------------------------------
# Weaker/alternative competitors used for hidden-recreation and sensitivity.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class GraphRule:
    rule_id: str
    evaluator: str
    target: str
    locus: str


class DefinitionGraphDispatcher:
    """M1: ordinary records plus a special locus dispatcher: hidden recreation."""

    def __init__(self) -> None:
        self.rules: list[GraphRule] = []
        self.dispatch_calls = 0

    def enforce(self, locus: str, target: str, evaluators: dict[str, Callable[[], bool]]) -> None:
        self.dispatch_calls += 1
        for rule in self.rules:
            if rule.locus == locus and rule.target == target:
                if not evaluators[rule.evaluator]():
                    raise CapabilityDenied("graph-rule", (rule.rule_id,))


class InlineContractEngine:
    """M2: Action-local check; admin path demonstrates bypass."""

    def __init__(self) -> None:
        self.state = {"debits": 0, "credits": 0}

    def post_action(self, debits: int, credits: int) -> None:
        if debits != credits:
            raise CapabilityDenied("inline-balance", ("action-local",))
        self.state = {"debits": debits, "credits": credits}

    def admin_mutate(self, debits: int, credits: int) -> None:
        self.state = {"debits": debits, "credits": credits}


@dataclass(frozen=True)
class TriggerRelation:
    target: str
    evaluator: str
    trigger: str


class ExecutableRelationDispatcher:
    """M3: Relation gains a trigger role; still dispatches by trigger semantics."""

    def __init__(self) -> None:
        self.relations: list[TriggerRelation] = []
        self.trigger_dispatches = 0

    def execute_trigger(self, trigger: str, target: str, evaluators: dict[str, Callable[[], bool]]) -> None:
        self.trigger_dispatches += 1
        for relation in self.relations:
            if relation.trigger == trigger and relation.target == target:
                if not evaluators[relation.evaluator]():
                    raise CapabilityDenied("relation-trigger", (relation.evaluator,))


# ---------------------------------------------------------------------------
# Reusable evaluators for tests.
# ---------------------------------------------------------------------------


def permit(_: EvaluationContext) -> RuleResult:
    return RuleResult(Decision.PERMIT, ("permit",))


def deny(_: EvaluationContext) -> RuleResult:
    return RuleResult(Decision.DENY, ("deny",))


def evaluator_error(_: EvaluationContext) -> RuleResult:
    return RuleResult(Decision.ERROR, ("evaluation-error",))


def balanced_pending(ctx: EvaluationContext) -> RuleResult:
    ok = ctx.pending("debits", 0) == ctx.pending("credits", 0)
    return RuleResult(Decision.PERMIT if ok else Decision.DENY, ("balanced-pending",))


def actor_is_alice(ctx: EvaluationContext) -> RuleResult:
    return RuleResult(
        Decision.PERMIT if ctx.actor == "alice" else Decision.DENY,
        (f"actor:{ctx.actor}",),
    )


def amount_under_limit(ctx: EvaluationContext) -> RuleResult:
    limit = int(ctx.current("limit", 0))
    amount = int(ctx.inputs.get("amount", 0))
    return RuleResult(
        Decision.PERMIT if amount <= limit else Decision.DENY,
        (f"limit:{limit}", f"amount:{amount}"),
    )
