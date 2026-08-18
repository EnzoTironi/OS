from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from os_kernel.definitions import EXPRESSION_OPS
from os_kernel.errors import InternalError
from os_kernel.model import Claim, ValidTime
from os_kernel.store import Store


@dataclass
class EvalContext:
    inputs: dict[str, Any]
    store: Store
    item: Any | None = None
    valid_at: str | None = None
    known_at: str | None = None
    knowledge_cut: str | None = None


def _path(source: Any, path: str) -> Any:
    current = source
    for part in path.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
            continue
        current = getattr(current, part, None)
    return current


def _as_number(value: Any) -> float:
    if isinstance(value, bool):
        raise InternalError("expression", "boolean is not a number")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict) and "number" in value:
        return float(value["number"])
    if isinstance(value, dict) and "amount" in value:
        return float(value["amount"])
    if isinstance(value, dict) and "signed" in value:
        return float(value["signed"])
    raise InternalError("expression", f"value {value!r} is not numeric")


def _compare(cmp: str, left: Any, right: Any) -> bool:
    if cmp == "eq":
        return left == right
    if cmp == "neq":
        return left != right
    if cmp == "lt":
        return _as_number(left) < _as_number(right)
    if cmp == "le":
        return _as_number(left) <= _as_number(right)
    if cmp == "gt":
        return _as_number(left) > _as_number(right)
    if cmp == "ge":
        return _as_number(left) >= _as_number(right)
    if cmp == "valid_covers":
        valid = left if isinstance(left, ValidTime) else _valid_time(left)
        return valid.covers(str(right))
    if cmp == "revision_lte":
        return str(left) <= str(right)
    raise InternalError("expression", f"unknown compare {cmp}")


def _valid_time(value: Any) -> ValidTime:
    if isinstance(value, ValidTime):
        return value
    if isinstance(value, dict):
        return ValidTime(value.get("instant"), value.get("start"), value.get("end"))
    if isinstance(value, str):
        return ValidTime(instant=value)
    return ValidTime()


def _claim_dict(claim: Claim) -> dict[str, Any]:
    return {
        "claim_id": claim.claim_id,
        "subject_ref": claim.subject_ref,
        "predicate_ref": claim.predicate_ref,
        "value": claim.value,
        "valid_time": claim.valid_time,
        "known_revision": claim.known_revision,
        "provenance": {
            "source_id": claim.provenance.source_id,
            "source_locator": claim.provenance.source_locator,
            "capture_id": claim.provenance.capture_id,
            "capture_revision": claim.provenance.capture_revision,
            "actor_id": claim.provenance.actor_id,
            "workload_id": claim.provenance.workload_id,
        },
        "derived_from": list(claim.derived_from),
    }


def query_claims(store: Store, subject: str | None, predicate: str | None, valid_at: str | None, known_at: str | None) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for claim in store.claims():
        if subject is not None and claim.subject_ref != subject:
            continue
        if predicate is not None and claim.predicate_ref != predicate:
            continue
        if valid_at is not None and not claim.valid_time.covers(valid_at):
            continue
        if known_at is not None and claim.known_revision > known_at:
            continue
        found.append(_claim_dict(claim))
    found.sort(key=lambda item: item["claim_id"])
    return found


def evaluate(expr: Any, ctx: EvalContext) -> Any:
    if not isinstance(expr, dict) or "op" not in expr:
        raise InternalError("expression", "expression must be an object with op")
    op = expr["op"]
    if op not in EXPRESSION_OPS:
        raise InternalError("expression", f"unsupported op {op}")
    if op == "literal":
        return expr.get("value")
    if op == "input":
        path = expr.get("path", "")
        if path.startswith("item.") or path == "item":
            return _path({"item": ctx.item}, path)
        return _path(ctx.inputs, path)
    if op == "query_claims":
        subject = evaluate(expr["subject"], ctx) if "subject" in expr else ctx.inputs.get("subject")
        predicate = evaluate(expr["predicate"], ctx) if "predicate" in expr else ctx.inputs.get("predicate")
        valid_at = evaluate(expr["valid_at"], ctx) if "valid_at" in expr else ctx.valid_at
        known_at = evaluate(expr["known_at"], ctx) if "known_at" in expr else ctx.known_at
        return query_claims(ctx.store, subject, predicate, valid_at, known_at)
    if op == "filter":
        source = evaluate(expr["source"], ctx)
        if not isinstance(source, list):
            raise InternalError("expression", "filter source must be a list")
        kept = []
        for item in source:
            child = EvalContext(ctx.inputs, ctx.store, item, ctx.valid_at, ctx.known_at, ctx.knowledge_cut)
            if evaluate(expr["where"], child):
                kept.append(item)
        return kept
    if op == "project":
        source = evaluate(expr["source"], ctx)
        path = expr["path"]
        if isinstance(source, list):
            return [_path(item, path) for item in source]
        return _path(source, path)
    if op == "sum":
        source = evaluate(expr["source"], ctx)
        if not isinstance(source, list):
            raise InternalError("expression", "sum source must be a list")
        total = 0.0
        for item in source:
            total += _as_number(item)
        return int(total) if total.is_integer() else total
    if op == "add":
        total = _as_number(evaluate(expr["left"], ctx)) + _as_number(evaluate(expr["right"], ctx))
        return int(total) if float(total).is_integer() else total
    if op == "subtract":
        total = _as_number(evaluate(expr["left"], ctx)) - _as_number(evaluate(expr["right"], ctx))
        return int(total) if float(total).is_integer() else total
    if op == "min":
        source = evaluate(expr["source"], ctx)
        return min(_as_number(item) for item in source)
    if op == "max":
        source = evaluate(expr["source"], ctx)
        return max(_as_number(item) for item in source)
    if op == "compare":
        return _compare(expr["cmp"], evaluate(expr["left"], ctx), evaluate(expr["right"], ctx))
    if op == "all":
        items = expr.get("items")
        if items is not None:
            return all(evaluate(item, ctx) for item in items)
        source = evaluate(expr["source"], ctx)
        return all(source)
    if op == "any":
        items = expr.get("items")
        if items is not None:
            return any(evaluate(item, ctx) for item in items)
        source = evaluate(expr["source"], ctx)
        return any(source)
    if op == "if":
        if evaluate(expr["condition"], ctx):
            return evaluate(expr["then"], ctx)
        return evaluate(expr["else"], ctx)
    if op == "construct_claim":
        return {
            "_kind": "claim_draft",
            "claim_id": evaluate(expr["claim_id"], ctx) if "claim_id" in expr else None,
            "subject_ref": evaluate(expr["subject"], ctx),
            "predicate_ref": evaluate(expr["predicate"], ctx),
            "value": evaluate(expr["value"], ctx),
            "valid_time": evaluate(expr["valid_time"], ctx) if "valid_time" in expr else ctx.inputs.get("now"),
            "derived_from": evaluate(expr["derived_from"], ctx) if "derived_from" in expr else [],
        }
    if op == "construct_occurrence":
        return {
            "_kind": "occurrence_draft",
            "occurrence_id": evaluate(expr["occurrence_id"], ctx) if "occurrence_id" in expr else None,
            "occurrence_ref": evaluate(expr["occurrence_ref"], ctx),
            "payload": evaluate(expr["payload"], ctx),
            "valid_time": evaluate(expr["valid_time"], ctx) if "valid_time" in expr else ctx.inputs.get("now"),
        }
    if op == "construct_effect_request":
        return {
            "_kind": "effect_request_draft",
            "request_id": evaluate(expr["request_id"], ctx) if "request_id" in expr else None,
            "effect_id": evaluate(expr["effect_id"], ctx),
            "payload": evaluate(expr["payload"], ctx),
        }
    if op == "construct_result":
        fields = expr.get("fields", {})
        built = {name: evaluate(value, ctx) for name, value in fields.items()}
        for key in ("quantity", "stale", "claim", "effect_request", "outcome", "knowledge"):
            if key in expr and key not in built:
                built[key] = evaluate(expr[key], ctx)
        built["_kind"] = "result"
        return built
    raise InternalError("expression", f"unhandled op {op}")
