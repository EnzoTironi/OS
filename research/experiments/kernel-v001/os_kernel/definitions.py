from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from os_kernel.canonical import digest
from os_kernel.errors import InputError, InternalError
from os_kernel.model import DefinitionRef

FORBIDDEN_DEFINITION_KEYS = (
    "callable",
    "callback",
    "import",
    "module",
    "module_path",
    "source_code",
    "lambda",
    "__import__",
    "eval",
    "exec",
    "handler",
)

EXPRESSION_OPS = frozenset(
    {
        "literal",
        "input",
        "query_claims",
        "filter",
        "project",
        "sum",
        "add",
        "subtract",
        "min",
        "max",
        "compare",
        "all",
        "any",
        "if",
        "construct_claim",
        "construct_occurrence",
        "construct_effect_request",
        "construct_result",
    }
)


@dataclass(frozen=True)
class TypeDefinition:
    definition_ref: DefinitionRef
    nature: str
    value_schema: dict[str, Any]
    contracts: tuple[str, ...]
    on_record: dict[str, Any] | None = None
    projects_contextual_identity: bool = False


@dataclass(frozen=True)
class RelationDefinition:
    definition_ref: DefinitionRef
    roles: tuple[dict[str, Any], ...]
    cardinality: dict[str, Any]
    temporal_required: bool
    provenance_required: bool
    projects_contextual_identity: bool = False


@dataclass(frozen=True)
class ComputationDefinition:
    definition_ref: DefinitionRef
    input_schema: dict[str, Any]
    result_schema: dict[str, Any]
    result_predicate: str | None
    expression: dict[str, Any]


@dataclass(frozen=True)
class RuleDefinition:
    definition_ref: DefinitionRef
    computation_ref: str
    enforcement_locus: str
    basis_mode: str
    error_outcome: str
    combination_order: int


@dataclass(frozen=True)
class ActionDefinition:
    definition_ref: DefinitionRef
    input_schema: dict[str, Any]
    planner_ref: str
    rule_refs: tuple[str, ...]
    state_basis_spec: tuple[dict[str, Any], ...]
    approval_required: bool
    stale_behavior: str
    bound_path: str
    mutation_plan_ref: str | None
    effect_refs: tuple[str, ...]


@dataclass(frozen=True)
class EffectDefinition:
    definition_ref: DefinitionRef
    request_schema: dict[str, Any]
    protocol_safety: dict[str, Any]
    reconciliation_ref: str | None


@dataclass(frozen=True)
class DefinitionBundle:
    revision_id: str
    content_digest: str
    parent_revision_id: str | None
    types: dict[str, TypeDefinition]
    relations: dict[str, RelationDefinition]
    computations: dict[str, ComputationDefinition]
    rules: dict[str, RuleDefinition]
    actions: dict[str, ActionDefinition]
    effects: dict[str, EffectDefinition]
    raw: dict[str, Any]


def _walk_forbidden(node: Any, path: str) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            lowered = str(key).lower()
            if lowered in FORBIDDEN_DEFINITION_KEYS:
                raise InputError(
                    "invalid_definition",
                    f"definition contains forbidden key {key} at {path}",
                    "os scenario run v001 --output json",
                )
            _walk_forbidden(value, f"{path}.{key}")
        op = node.get("op")
        if op is not None and op not in EXPRESSION_OPS:
            raise InputError(
                "invalid_definition",
                f"unsupported expression op {op!r} at {path}",
                "os scenario run v001 --output json",
            )
    elif isinstance(node, list):
        for index, item in enumerate(node):
            _walk_forbidden(item, f"{path}[{index}]")


def _ref(definition_id: str, revision_id: str, payload: dict[str, Any]) -> DefinitionRef:
    return DefinitionRef(definition_id, revision_id, digest(payload))


def load_bundle(raw: dict[str, Any]) -> DefinitionBundle:
    if not isinstance(raw, dict):
        raise InputError("invalid_definition", "definition bundle must be an object", "os scenario run v001 --output json")
    _walk_forbidden(raw, "definitions")
    revision_id = raw.get("revision_id")
    if not isinstance(revision_id, str) or not revision_id:
        raise InputError("invalid_definition", "revision_id is required", "os scenario run v001 --output json")
    types: dict[str, TypeDefinition] = {}
    relations: dict[str, RelationDefinition] = {}
    computations: dict[str, ComputationDefinition] = {}
    rules: dict[str, RuleDefinition] = {}
    actions: dict[str, ActionDefinition] = {}
    effects: dict[str, EffectDefinition] = {}
    for item in raw.get("types", []):
        definition_id = item["definition_id"]
        types[definition_id] = TypeDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            nature=item.get("nature", "entity"),
            value_schema=item.get("value_schema", {}),
            contracts=tuple(item.get("contracts", ())),
            on_record=item.get("on_record"),
            projects_contextual_identity=bool(item.get("projects_contextual_identity", False)),
        )
    for item in raw.get("relations", []):
        definition_id = item["definition_id"]
        relations[definition_id] = RelationDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            roles=tuple(item.get("roles", ())),
            cardinality=item.get("cardinality", {}),
            temporal_required=bool(item.get("temporal_required", False)),
            provenance_required=bool(item.get("provenance_required", True)),
            projects_contextual_identity=bool(item.get("projects_contextual_identity", False)),
        )
    for item in raw.get("computations", []):
        definition_id = item["definition_id"]
        computations[definition_id] = ComputationDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            input_schema=item.get("input_schema", {}),
            result_schema=item.get("result_schema", {}),
            result_predicate=item.get("result_predicate"),
            expression=item["expression"],
        )
    for item in raw.get("rules", []):
        definition_id = item["definition_id"]
        rules[definition_id] = RuleDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            computation_ref=item["computation_ref"],
            enforcement_locus=item.get("enforcement_locus", "commit"),
            basis_mode=item.get("basis_mode", "current_at_commit"),
            error_outcome=item.get("error_outcome", "deny"),
            combination_order=int(item.get("combination_order", 0)),
        )
    for item in raw.get("actions", []):
        definition_id = item["definition_id"]
        actions[definition_id] = ActionDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            input_schema=item.get("input_schema", {}),
            planner_ref=item["planner_ref"],
            rule_refs=tuple(item.get("rule_refs", ())),
            state_basis_spec=tuple(item.get("state_basis_spec", ())),
            approval_required=bool(item.get("approval_required", True)),
            stale_behavior=item.get("stale_behavior", "replan_within_bound"),
            bound_path=item.get("bound_path", "max_quantity"),
            mutation_plan_ref=item.get("mutation_plan_ref"),
            effect_refs=tuple(item.get("effect_refs", ())),
        )
    for item in raw.get("effects", []):
        definition_id = item["definition_id"]
        effects[definition_id] = EffectDefinition(
            definition_ref=_ref(definition_id, revision_id, item),
            request_schema=item.get("request_schema", {}),
            protocol_safety=item.get("protocol_safety", {}),
            reconciliation_ref=item.get("reconciliation_ref"),
        )
    content = {
        "revision_id": revision_id,
        "parent_revision_id": raw.get("parent_revision_id"),
        "types": raw.get("types", []),
        "relations": raw.get("relations", []),
        "computations": raw.get("computations", []),
        "rules": raw.get("rules", []),
        "actions": raw.get("actions", []),
        "effects": raw.get("effects", []),
    }
    return DefinitionBundle(
        revision_id=revision_id,
        content_digest=digest(content),
        parent_revision_id=raw.get("parent_revision_id"),
        types=types,
        relations=relations,
        computations=computations,
        rules=rules,
        actions=actions,
        effects=effects,
        raw=raw,
    )


def resolve_computation(bundle: DefinitionBundle, computation_id: str) -> ComputationDefinition:
    try:
        return bundle.computations[computation_id]
    except KeyError as exc:
        raise InternalError("missing_computation", f"computation {computation_id} is not installed") from exc


def resolve_action(bundle: DefinitionBundle, action_id: str) -> ActionDefinition:
    try:
        return bundle.actions[action_id]
    except KeyError as exc:
        raise InputError(
            "unknown_action",
            f"action {action_id} is not installed in {bundle.revision_id}",
            "os scenario run v001 --output json",
        ) from exc


def resolve_effect(bundle: DefinitionBundle, effect_id: str) -> EffectDefinition:
    try:
        return bundle.effects[effect_id]
    except KeyError as exc:
        raise InputError(
            "unknown_effect",
            f"effect {effect_id} is not installed in {bundle.revision_id}",
            "os scenario run v001 --output json",
        ) from exc


def computation_for_predicate(bundle: DefinitionBundle, predicate: str) -> ComputationDefinition:
    matches = [item for item in bundle.computations.values() if item.result_predicate == predicate]
    if len(matches) != 1:
        raise InputError(
            "unknown_computation",
            f"predicate {predicate} does not resolve to one computation",
            "os query known-then --scenario v001 --subject <subject> --predicate <predicate> --valid-at <date> --known-at <cut> --output json",
        )
    return matches[0]
