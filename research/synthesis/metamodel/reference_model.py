#!/usr/bin/env python3
"""Executable reduction model for issue #70.

This is a semantic litmus model, not production architecture. It intentionally
contains unsafe reduced variants so the test suite can prove that kill tests are
sensitive to distinctions under review.

Important scope rule: where #70 reuses a mature Wave-B contract (notably #41
external effects), this model may implement only a small subset, but it must not
contradict the reviewed contract merely to make the metamodel reduction simpler.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterable


BASE_FORMS = ("Type", "Relation", "Computation", "Action", "RuleBinding")


class ModelError(RuntimeError):
    pass


class TypeViolation(ModelError):
    pass


class CardinalityViolation(ModelError):
    pass


class RuleDenied(ModelError):
    def __init__(self, binding: str, outcome: "Decision", evidence: tuple[str, ...] = ()) -> None:
        super().__init__(f"{binding}: {outcome.value}")
        self.binding = binding
        self.outcome = outcome
        self.evidence = evidence


class IntentMismatch(ModelError):
    pass


class CapabilityViolation(ModelError):
    pass


class UnsafeRetry(ModelError):
    pass


class TypeNature(str, Enum):
    ENTITY = "entity"
    VALUE = "value"


class Decision(str, Enum):
    PERMIT = "permit"
    DENY = "deny"
    ERROR = "error"


class EffectKnowledge(str, Enum):
    NOT_ATTEMPTED = "not_attempted"
    INDETERMINATE = "indeterminate"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CONTRADICTED = "contradicted"


@dataclass(frozen=True)
class TypedValue:
    type_name: str
    value: Any


@dataclass(frozen=True)
class EntityRef:
    type_name: str
    entity_id: str


@dataclass
class TypeDef:
    name: str
    nature: TypeNature = TypeNature.ENTITY
    contracts: set[str] = field(default_factory=set)


@dataclass(frozen=True)
class RelationDef:
    name: str
    source_type: str
    target_type: str
    min_per_source: int = 0
    max_per_source: int | None = None


@dataclass(frozen=True)
class RuleResult:
    decision: Decision
    evidence: tuple[str, ...] = ()


@dataclass
class EvaluationContext:
    engine: "ReducedEngine"
    binding: "RuleBinding | None" = None
    action_name: str | None = None
    operation_id: str | None = None
    inputs: dict[str, Any] = field(default_factory=dict)
    pinned_state: dict[str, Any] | None = None

    def state(self, key: str, default: Any = None) -> Any:
        if self.binding and self.binding.basis == "pinned":
            if self.pinned_state is None:
                raise ModelError(f"binding {self.binding.name} requires pinned state")
            return self.pinned_state.get(key, default)
        return self.engine.business_state.get(key, default)


ComputationFn = Callable[[EvaluationContext], Any]


@dataclass
class ComputationDef:
    name: str
    fn: ComputationFn
    execution_class: str = "pure"


@dataclass(frozen=True)
class RuleBinding:
    name: str
    evaluator: str
    scope_kind: str  # action | type | global | effect
    scope_name: str
    locus: str  # preview | commit | lifecycle:update | lifecycle:delete | effect-attempt
    obligation: str = "system"
    basis: str = "current"  # current | pinned
    timing: str = "before"  # before | after
    on_deny: str = "deny"
    on_error: str = "deny"


@dataclass(frozen=True)
class Mutation:
    kind: str
    args: tuple[Any, ...]


@dataclass
class ActionPlan:
    mutations: list[Mutation] = field(default_factory=list)
    result: Any = None


@dataclass
class ActionDef:
    name: str
    planner: str
    bindings: tuple[str, ...] = ()
    target_types: tuple[str, ...] = ()


@dataclass
class EntityRecord:
    entity_id: str
    type_name: str
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OperationRecord:
    operation_id: str
    action_name: str
    intent_digest: str
    result: Any
    actor: str
    represented_principal: str | None
    workload: str | None


@dataclass
class EffectRequest:
    effect_id: str
    parent_operation_id: str
    knowledge: EffectKnowledge = EffectKnowledge.NOT_ATTEMPTED
    remote_key: str | None = None
    remote_receipt: str | None = None
    attempts: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ShapeContract:
    name: str
    required_relations: frozenset[str] = frozenset()
    required_actions: frozenset[str] = frozenset()


@dataclass(frozen=True)
class Materialization:
    name: str
    value: Any
    source_revision: int


class ReducedEngine:
    """R5 interpreter with one exported authoritative mutation boundary."""

    def __init__(self) -> None:
        self.types: dict[str, TypeDef] = {}
        self.relation_defs: dict[str, RelationDef] = {}
        self.computations: dict[str, ComputationDef] = {}
        self.bindings: dict[str, RuleBinding] = {}
        self.actions: dict[str, ActionDef] = {}
        self.entities: dict[str, EntityRecord] = {}
        self.relations: dict[tuple[str, str], list[EntityRef | TypedValue]] = {}
        self.business_state: dict[str, Any] = {}
        self.operations: dict[str, OperationRecord] = {}
        self.effects: dict[str, EffectRequest] = {}
        self.revision: int = 0
        self.runtime_timers_fired: set[str] = set()
        self.materializations: dict[str, Materialization] = {}

    # ---- definitions ----

    def add_type(self, definition: TypeDef) -> None:
        if definition.name in self.types:
            raise ModelError(f"duplicate type {definition.name}")
        self.types[definition.name] = definition

    def add_relation(self, definition: RelationDef) -> None:
        if definition.name in self.relation_defs:
            raise ModelError(f"duplicate relation {definition.name}")
        if definition.source_type not in self.types or definition.target_type not in self.types:
            raise TypeViolation("relation endpoint type is undefined")
        self.relation_defs[definition.name] = definition

    def add_computation(self, definition: ComputationDef) -> None:
        self.computations[definition.name] = definition

    def add_binding(self, binding: RuleBinding) -> None:
        if binding.evaluator not in self.computations:
            raise ModelError(f"binding evaluator {binding.evaluator} is undefined")
        self.bindings[binding.name] = binding

    def add_action(self, action: ActionDef) -> None:
        if action.planner not in self.computations:
            raise ModelError(f"planner {action.planner} is undefined")
        for binding_name in action.bindings:
            if binding_name not in self.bindings:
                raise ModelError(f"binding {binding_name} is undefined")
        self.actions[action.name] = action

    # ---- type/value/entity/relation semantics ----

    def typed_value(self, type_name: str, value: Any) -> TypedValue:
        definition = self.types.get(type_name)
        if definition is None or definition.nature is not TypeNature.VALUE:
            raise TypeViolation(f"{type_name} is not a value type")
        return TypedValue(type_name, value)

    def create_entity(self, type_name: str, entity_id: str, data: dict[str, Any] | None = None) -> EntityRef:
        definition = self.types.get(type_name)
        if definition is None or definition.nature is not TypeNature.ENTITY:
            raise TypeViolation(f"{type_name} is not an entity type")
        if entity_id in self.entities:
            raise ModelError(f"duplicate entity identity {entity_id}")
        self.entities[entity_id] = EntityRecord(entity_id, type_name, dict(data or {}))
        self.revision += 1
        return EntityRef(type_name, entity_id)

    def ref(self, entity_id: str) -> EntityRef:
        entity = self.entities[entity_id]
        return EntityRef(entity.type_name, entity.entity_id)

    def relate(self, relation_name: str, source_id: str, target: EntityRef | TypedValue) -> None:
        definition = self.relation_defs[relation_name]
        source = self.entities[source_id]
        if source.type_name != definition.source_type:
            raise TypeViolation(
                f"relation {relation_name} source expects {definition.source_type}, got {source.type_name}"
            )
        if target.type_name != definition.target_type:
            raise TypeViolation(
                f"relation {relation_name} target expects {definition.target_type}, got {target.type_name}"
            )
        if isinstance(target, EntityRef):
            if target.entity_id not in self.entities:
                raise TypeViolation("target entity does not exist")
            if self.entities[target.entity_id].type_name != target.type_name:
                raise TypeViolation("target entity type/reference mismatch")
        else:
            target_def = self.types[target.type_name]
            if target_def.nature is not TypeNature.VALUE:
                raise TypeViolation("TypedValue must target a value type")

        key = (relation_name, source_id)
        existing = self.relations.setdefault(key, [])
        if definition.max_per_source is not None and len(existing) >= definition.max_per_source:
            raise CardinalityViolation(f"relation {relation_name} max cardinality exceeded")
        existing.append(target)
        self.revision += 1

    def relation_targets(self, relation_name: str, source_id: str) -> tuple[EntityRef | TypedValue, ...]:
        return tuple(self.relations.get((relation_name, source_id), ()))

    # ---- computation / rule enforcement ----

    def _authoritative_snapshot(self) -> tuple[Any, ...]:
        return (
            deepcopy(self.entities),
            deepcopy(self.relations),
            deepcopy(self.business_state),
            deepcopy(self.operations),
            deepcopy(self.effects),
            deepcopy(self.runtime_timers_fired),
            deepcopy(self.materializations),
            self.revision,
        )

    def _restore_authoritative_snapshot(self, snapshot: tuple[Any, ...]) -> None:
        (
            self.entities,
            self.relations,
            self.business_state,
            self.operations,
            self.effects,
            self.runtime_timers_fired,
            self.materializations,
            self.revision,
        ) = deepcopy(snapshot)

    def run_computation(self, name: str, context: EvaluationContext) -> Any:
        before = self._authoritative_snapshot()
        result = self.computations[name].fn(context)
        after = self._authoritative_snapshot()
        if after != before:
            self._restore_authoritative_snapshot(before)
            raise CapabilityViolation(f"computation {name} attempted authoritative/runtime mutation")
        return result

    def _bindings_for(
        self,
        *,
        locus: str,
        timing: str,
        action: ActionDef | None = None,
        type_name: str | None = None,
    ) -> Iterable[RuleBinding]:
        names: set[str] = set()
        if action:
            names.update(action.bindings)
        for binding in self.bindings.values():
            if binding.scope_kind == "global":
                names.add(binding.name)
            if type_name and binding.scope_kind == "type" and binding.scope_name == type_name:
                names.add(binding.name)
        for name in sorted(names):
            binding = self.bindings[name]
            if binding.locus == locus and binding.timing == timing:
                yield binding

    def _enforce(
        self,
        bindings: Iterable[RuleBinding],
        *,
        action_name: str | None = None,
        operation_id: str | None = None,
        inputs: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        for binding in bindings:
            context = EvaluationContext(
                engine=self,
                binding=binding,
                action_name=action_name,
                operation_id=operation_id,
                inputs=dict(inputs or {}),
                pinned_state=deepcopy(pinned_state) if pinned_state is not None else None,
            )
            raw = self.run_computation(binding.evaluator, context)
            if isinstance(raw, bool):
                outcome = RuleResult(Decision.PERMIT if raw else Decision.DENY, (binding.evaluator,))
            elif isinstance(raw, RuleResult):
                outcome = raw
            else:
                raise ModelError(f"binding {binding.name} evaluator returned unsupported result {raw!r}")

            if outcome.decision is Decision.DENY and binding.on_deny == "deny":
                raise RuleDenied(binding.name, outcome.decision, outcome.evidence)
            if outcome.decision is Decision.ERROR and binding.on_error == "deny":
                raise RuleDenied(binding.name, outcome.decision, outcome.evidence)

    # ---- generic lifecycle mutation (used to test Event demotion) ----

    def update_entity(self, entity_id: str, changes: dict[str, Any]) -> None:
        record = self.entities[entity_id]
        bindings = self._bindings_for(locus="lifecycle:update", timing="before", type_name=record.type_name)
        self._enforce(bindings)
        record.data.update(changes)
        self.revision += 1

    def delete_entity(self, entity_id: str) -> None:
        record = self.entities[entity_id]
        bindings = self._bindings_for(locus="lifecycle:delete", timing="before", type_name=record.type_name)
        self._enforce(bindings)
        del self.entities[entity_id]
        for key in list(self.relations):
            _, source_id = key
            if source_id == entity_id:
                del self.relations[key]
                continue
            kept = [
                target
                for target in self.relations[key]
                if not (isinstance(target, EntityRef) and target.entity_id == entity_id)
            ]
            self.relations[key] = kept
        self.revision += 1

    # ---- Action protocol ----

    def preview_action(
        self,
        action_name: str,
        inputs: dict[str, Any],
        *,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        action = self.actions[action_name]
        self._enforce(
            self._bindings_for(locus="preview", timing="before", action=action),
            action_name=action_name,
            inputs=inputs,
            pinned_state=pinned_state,
        )

    def invoke_action(
        self,
        action_name: str,
        operation_id: str,
        intent_digest: str,
        inputs: dict[str, Any],
        *,
        actor: str,
        represented_principal: str | None = None,
        workload: str | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> Any:
        previous = self.operations.get(operation_id)
        if previous:
            if previous.intent_digest != intent_digest or previous.action_name != action_name:
                raise IntentMismatch(f"operation {operation_id} reused with different intent")
            return deepcopy(previous.result)

        action = self.actions[action_name]
        self._enforce(
            self._bindings_for(locus="commit", timing="before", action=action),
            action_name=action_name,
            operation_id=operation_id,
            inputs=inputs,
            pinned_state=pinned_state,
        )

        planner_context = EvaluationContext(
            engine=self,
            action_name=action_name,
            operation_id=operation_id,
            inputs=dict(inputs),
            pinned_state=deepcopy(pinned_state) if pinned_state is not None else None,
        )
        plan = self.run_computation(action.planner, planner_context)
        if not isinstance(plan, ActionPlan):
            raise ModelError(f"Action planner {action.planner} did not return ActionPlan")

        snapshot = self._authoritative_snapshot()
        try:
            for mutation in plan.mutations:
                self._apply_mutation(mutation, parent_operation_id=operation_id)
            self._enforce(
                self._bindings_for(locus="commit", timing="after", action=action),
                action_name=action_name,
                operation_id=operation_id,
                inputs=inputs,
                pinned_state=pinned_state,
            )
        except Exception:
            self._restore_authoritative_snapshot(snapshot)
            raise

        self.operations[operation_id] = OperationRecord(
            operation_id=operation_id,
            action_name=action_name,
            intent_digest=intent_digest,
            result=deepcopy(plan.result),
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
        )
        self.revision += 1
        return deepcopy(plan.result)

    def _apply_mutation(self, mutation: Mutation, *, parent_operation_id: str) -> None:
        kind = mutation.kind
        args = mutation.args
        if kind == "set_state":
            key, value = args
            self.business_state[str(key)] = value
            return
        if kind == "increment_state":
            key, delta = args
            self.business_state[str(key)] = self.business_state.get(str(key), 0) + delta
            return
        if kind == "create_entity":
            type_name, entity_id, data = args
            self.create_entity(str(type_name), str(entity_id), dict(data))
            return
        if kind == "add_relation":
            relation_name, source_id, target = args
            self.relate(str(relation_name), str(source_id), target)
            return
        if kind == "request_effect":
            effect_id = str(args[0])
            if effect_id in self.effects:
                raise ModelError(f"duplicate EffectRequest {effect_id}")
            self.effects[effect_id] = EffectRequest(effect_id, parent_operation_id)
            return
        raise ModelError(f"unknown mutation kind {kind}")

    # ---- safe external-effect runtime capability ----

    @staticmethod
    def _merge_effect_knowledge(prior: EffectKnowledge, evidence: str) -> EffectKnowledge:
        """Conservatively merge the narrow attempt-evidence subset used by #70.

        This mirrors the important monotonicity/contradiction behavior of the
        reviewed #41 model. It intentionally does not pretend to define one
        universal provider state machine.
        """
        if evidence == "definitely_not_sent":
            return prior
        if evidence == "sent_no_response":
            return EffectKnowledge.INDETERMINATE if prior is EffectKnowledge.NOT_ATTEMPTED else prior
        if evidence == "accepted_pending":
            return EffectKnowledge.PENDING if prior in {EffectKnowledge.NOT_ATTEMPTED, EffectKnowledge.INDETERMINATE} else prior
        if evidence == "confirmed":
            if prior in {EffectKnowledge.REJECTED, EffectKnowledge.CONTRADICTED}:
                return EffectKnowledge.CONTRADICTED
            return EffectKnowledge.CONFIRMED
        if evidence == "rejected":
            if prior in {EffectKnowledge.CONFIRMED, EffectKnowledge.CONTRADICTED}:
                return EffectKnowledge.CONTRADICTED
            return EffectKnowledge.REJECTED
        raise ModelError(f"unknown effect evidence {evidence}")

    def effect_attempt(self, effect_id: str, evidence: str, *, remote_key: str | None = None) -> EffectKnowledge:
        request = self.effects[effect_id]
        if remote_key is not None:
            if request.remote_key is not None and request.remote_key != remote_key:
                raise ModelError("remote idempotency key changed for same EffectRequest")
            request.remote_key = remote_key
        request.attempts.append(evidence)
        request.knowledge = self._merge_effect_knowledge(request.knowledge, evidence)
        return request.knowledge

    def retry_effect(self, effect_id: str, *, protocol_has_safe_dedupe: bool) -> None:
        request = self.effects[effect_id]
        if request.knowledge is EffectKnowledge.NOT_ATTEMPTED:
            return
        if request.knowledge is EffectKnowledge.INDETERMINATE and protocol_has_safe_dedupe:
            return
        raise UnsafeRetry(
            f"effect {effect_id} cannot be generically retried from {request.knowledge.value} "
            f"under the supplied protocol guarantee"
        )

    def learn_remote_receipt(self, effect_id: str, receipt: str, *, confirmed: bool = True) -> None:
        request = self.effects[effect_id]
        request.remote_receipt = receipt
        if confirmed:
            request.knowledge = self._merge_effect_knowledge(request.knowledge, "confirmed")

    # ---- runtime/query adjuncts ----

    def fire_runtime_timer(self, timer_id: str) -> None:
        self.runtime_timers_fired.add(timer_id)

    def materialize(self, name: str, value: Any) -> Materialization:
        materialization = Materialization(name, deepcopy(value), self.revision)
        self.materializations[name] = materialization
        return materialization

    # ---- shape/interface contract ----

    def conforms(self, type_name: str, contract: ShapeContract) -> bool:
        relation_names = {
            relation.name
            for relation in self.relation_defs.values()
            if relation.source_type == type_name
        }
        action_names = {
            action.name
            for action in self.actions.values()
            if type_name in action.target_types
        }
        return contract.required_relations.issubset(relation_names) and contract.required_actions.issubset(action_names)


# ---------------------------------------------------------------------------
# Deliberately weaker reductions used as sensitivity checks.
# ---------------------------------------------------------------------------


class TaggedEventEngine:
    """M1-style Event = Type + tag, with no generic lifecycle enforcement."""

    def __init__(self) -> None:
        self.rows: dict[str, dict[str, Any]] = {}

    def create_event(self, event_id: str, payload: dict[str, Any]) -> None:
        self.rows[event_id] = {"event": True, **payload}

    def update(self, event_id: str, changes: dict[str, Any]) -> None:
        self.rows[event_id].update(changes)


class ComputationOnlyMutationEngine:
    """Mutation exposed as ordinary callable: no semantic operation identity/replay."""

    def __init__(self) -> None:
        self.state: dict[str, int] = {}
        self.calls: int = 0

    def call_mutator(self, key: str, delta: int) -> int:
        self.calls += 1
        self.state[key] = self.state.get(key, 0) + delta
        return self.state[key]


class ActionLocalInvariantEngine:
    """Invariant embedded in one Action; alternate mutation path bypasses it."""

    def __init__(self) -> None:
        self.debits = 0
        self.credits = 0

    def post_balanced(self, debits: int, credits: int) -> None:
        if debits != credits:
            raise RuleDenied("local_balance", Decision.DENY)
        self.debits = debits
        self.credits = credits

    def admin_set(self, debits: int, credits: int) -> None:
        self.debits = debits
        self.credits = credits


class BoolPolicyEngine:
    """Collapses deny and evaluator error into False."""

    @staticmethod
    def evaluate(raw: str) -> bool:
        if raw == "permit":
            return True
        if raw in {"deny", "error"}:
            return False
        raise ValueError(raw)


def always_permit(_: EvaluationContext) -> RuleResult:
    return RuleResult(Decision.PERMIT, ("always-permit",))


def always_deny(_: EvaluationContext) -> RuleResult:
    return RuleResult(Decision.DENY, ("always-deny",))
