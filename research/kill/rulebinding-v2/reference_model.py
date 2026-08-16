#!/usr/bin/env python3
"""Executable post-R5 RuleBinding reduction model for issue #156.

This is a bounded semantic model, not production architecture. M4 deliberately
uses one generic refined Type mechanism for ordinary values and proof-carrying
capabilities. `capability` is a standard Type contract interpreted by privileged
operation boundaries; it is not modeled as a sixth semantic base form.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
from typing import Any, Callable


class ModelError(RuntimeError):
    pass


class RefinementDenied(ModelError):
    def __init__(self, type_name: str, evidence: tuple[str, ...] = ()) -> None:
        super().__init__(f"{type_name}: refinement denied")
        self.type_name = type_name
        self.evidence = evidence


class RefinementEvaluationError(ModelError):
    def __init__(self, type_name: str, evidence: tuple[str, ...] = ()) -> None:
        super().__init__(f"{type_name}: refinement evaluator error")
        self.type_name = type_name
        self.evidence = evidence


class StaleProof(ModelError):
    pass


class WrongProof(ModelError):
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
    engine: "RefinedTypeEngine"
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
class TypeDef:
    """Generic Type definition with reusable refinement semantics.

    `contracts` can include `value`, `capability`, or other standard contracts.
    Refinements run whenever a value of the Type is constructed. Freshness is
    generic proof/value validity metadata, not operation-phase scheduling.
    """

    name: str
    refinements: tuple[str, ...] = ()
    contracts: frozenset[str] = frozenset()
    freshness: str = "none"  # none | current | pinned


@dataclass(frozen=True)
class RefinedValue:
    type_name: str
    target: str
    payload: Any
    operation_id: str | None
    basis_revision: int | None
    pinned_digest: str | None
    evidence: tuple[str, ...]
    evaluator_revisions: tuple[tuple[str, str], ...]


@dataclass(frozen=True)
class OperationSignature:
    name: str
    required_types: tuple[str, ...]


class RefinedTypeEngine:
    """M4 candidate: refined Type values + typed privileged operation signatures."""

    def __init__(self) -> None:
        self.state: dict[str, Any] = {}
        self.revision = 0
        self.computations: dict[str, ComputationDef] = {}
        self.types: dict[str, TypeDef] = {}
        self.signatures: dict[str, OperationSignature] = {}
        self.audit: list[dict[str, Any]] = []
        self.effects_attempted: list[str] = []
        self.occurrences: dict[str, dict[str, Any]] = {}

    def add_computation(self, definition: ComputationDef) -> None:
        self.computations[definition.name] = definition

    def add_type(self, definition: TypeDef) -> None:
        for name in definition.refinements:
            if name not in self.computations:
                raise ModelError(f"undefined refinement {name}")
        self.types[definition.name] = definition

    def add_signature(self, signature: OperationSignature) -> None:
        for required in signature.required_types:
            definition = self.types.get(required)
            if definition is None:
                raise ModelError(f"undefined required Type {required}")
            if "capability" not in definition.contracts:
                raise ModelError(f"operation authority Type {required} lacks capability contract")
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

    def construct(
        self,
        type_name: str,
        *,
        target: str = "value",
        payload: Any = None,
        operation_id: str | None = None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        inputs: dict[str, Any] | None = None,
        pending_state: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> RefinedValue:
        """Construct any refined Type value, capability or ordinary business value."""

        definition = self.types[type_name]
        ctx_inputs = dict(inputs or {})
        if payload is not None and "value" not in ctx_inputs:
            ctx_inputs["value"] = payload
        ctx = EvaluationContext(
            engine=self,
            target=target,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            inputs=ctx_inputs,
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
                raise RefinementDenied(type_name, tuple(evidence))
            if outcome.decision is Decision.ERROR:
                raise RefinementEvaluationError(type_name, tuple(evidence))

        basis_revision = self.revision if definition.freshness == "current" else None
        pinned_digest = self._digest(pinned_state) if definition.freshness == "pinned" else None
        if definition.freshness == "pinned" and pinned_digest is None:
            raise ModelError(f"{type_name} requires pinned state")
        return RefinedValue(
            type_name=type_name,
            target=target,
            payload=deepcopy(payload),
            operation_id=operation_id,
            basis_revision=basis_revision,
            pinned_digest=pinned_digest,
            evidence=tuple(evidence),
            evaluator_revisions=tuple(evaluator_revisions),
        )

    def _verify_value(
        self,
        value: RefinedValue,
        expected_type: str,
        *,
        target: str,
        operation_id: str | None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        definition = self.types[expected_type]
        if "capability" not in definition.contracts:
            raise WrongProof(f"{expected_type} is not an authority capability Type")
        if value.type_name != expected_type or value.target != target:
            raise WrongProof(f"need {expected_type} for {target}, got {value.type_name} for {value.target}")
        if value.operation_id is not None and operation_id != value.operation_id:
            raise WrongProof("proof value is bound to a different semantic operation")
        if definition.freshness == "current" and value.basis_revision != self.revision:
            raise StaleProof(f"{expected_type} constructed at revision {value.basis_revision}, current {self.revision}")
        if definition.freshness == "pinned" and value.pinned_digest != self._digest(pinned_state):
            raise StaleProof(f"{expected_type} pinned basis mismatch")

    def _verify_signature(
        self,
        operation_name: str,
        proofs: dict[str, RefinedValue],
        *,
        target: str,
        operation_id: str | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        signature = self.signatures[operation_name]
        if set(proofs) != set(signature.required_types):
            raise WrongProof(f"{operation_name} requires {signature.required_types}, got {tuple(sorted(proofs))}")
        for required in signature.required_types:
            self._verify_value(
                proofs[required],
                required,
                target=target,
                operation_id=operation_id,
                pinned_state=pinned_state,
            )

    def preview(self, action_name: str, proof: RefinedValue, *, operation_id: str | None = None) -> None:
        self._verify_signature(
            f"preview:{action_name}",
            {proof.type_name: proof},
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
        proofs: dict[str, RefinedValue],
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        """Single low-level local authority boundary shared by Action/admin paths."""
        self._verify_signature(
            operation_name,
            proofs,
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
                    for required in self.signatures[operation_name].required_types
                    for evidence in proofs[required].evidence
                ),
                "evaluator_revisions": tuple(
                    rev
                    for required in self.signatures[operation_name].required_types
                    for rev in proofs[required].evaluator_revisions
                ),
            }
        )
        self.revision += 1

    def read(self, type_name: str, proof: RefinedValue) -> dict[str, Any]:
        self._verify_signature(f"read:{type_name}", {proof.type_name: proof}, target=type_name)
        return deepcopy(self.state)

    def create_occurrence(self, occurrence_id: str, payload: dict[str, Any]) -> None:
        if occurrence_id in self.occurrences:
            raise ModelError("duplicate occurrence")
        self.occurrences[occurrence_id] = deepcopy(payload)
        self.revision += 1

    def update_occurrence(self, occurrence_id: str, changes: dict[str, Any], proof: RefinedValue) -> None:
        self._verify_signature("update:Occurrence", {proof.type_name: proof}, target="Occurrence")
        self.occurrences[occurrence_id].update(changes)
        self.revision += 1

    def effect_attempt(self, effect_id: str, proof: RefinedValue) -> None:
        self._verify_signature("effect-attempt", {proof.type_name: proof}, target=effect_id)
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
                    raise RefinementDenied("graph-rule", (rule.rule_id,))


class InlineContractEngine:
    """M2: Action-local check; admin path demonstrates bypass."""

    def __init__(self) -> None:
        self.state = {"debits": 0, "credits": 0}

    def post_action(self, debits: int, credits: int) -> None:
        if debits != credits:
            raise RefinementDenied("inline-balance", ("action-local",))
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
                    raise RefinementDenied("relation-trigger", (relation.evaluator,))


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
    return RuleResult(Decision.PERMIT if ctx.actor == "alice" else Decision.DENY, (f"actor:{ctx.actor}",))


def amount_under_limit(ctx: EvaluationContext) -> RuleResult:
    limit = int(ctx.current("limit", 0))
    amount = int(ctx.inputs.get("amount", 0))
    return RuleResult(
        Decision.PERMIT if amount <= limit else Decision.DENY,
        (f"limit:{limit}", f"amount:{amount}"),
    )


def positive_value(ctx: EvaluationContext) -> RuleResult:
    value = int(ctx.inputs.get("value", 0))
    return RuleResult(Decision.PERMIT if value > 0 else Decision.DENY, (f"positive:{value}",))
