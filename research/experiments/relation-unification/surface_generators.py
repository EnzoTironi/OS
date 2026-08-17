#!/usr/bin/env python3
from __future__ import annotations

from typing import Any

from models import RelationDef, TargetKind, sdk_value_type


def sdk_member(relation: RelationDef) -> str:
    if not relation.binary:
        args = ", ".join(
            f"{role.name}: {sdk_value_type(role.target, role.cardinality)}"
            for role in relation.roles
        )
        return f"query_{relation.name}({args})"
    return f"{relation.name}: {sdk_value_type(relation.object.target, relation.object.cardinality)}"


def mutation_tool(relation: RelationDef) -> dict[str, Any]:
    """Generate an illustrative MCP/OpenAPI-like mutation contract.

    The operation shape depends on multiplicity and endpoint Type. It never
    needs a Property/Link semantic kind.
    """
    if not relation.binary:
        return {
            "name": f"assert_{relation.name}",
            "arguments": {
                role.name: sdk_value_type(role.target, role.cardinality)
                for role in relation.roles
            },
        }

    subject = relation.subject
    obj = relation.object
    verb = "add" if obj.cardinality.many else "set"
    return {
        "name": f"{verb}_{relation.name}",
        "arguments": {
            subject.name: subject.target.sdk_type,
            obj.name: obj.target.sdk_type,
        },
        "multiplicity": "many" if obj.cardinality.many else "one",
        "ordered": obj.cardinality.ordered,
    }


def ui_affordance(relation: RelationDef) -> str:
    """Illustrative UI lowering, not canonical semantics."""
    if not relation.binary:
        return "TupleEditor"
    obj = relation.object
    if obj.target.kind is TargetKind.ENTITY:
        base = "EntityPicker"
    elif obj.target.name == "Money":
        base = "MoneyInput"
    elif obj.target.name == "Quantity":
        base = "QuantityInput"
    elif obj.target.name.endswith("Status"):
        base = "EnumSelect"
    else:
        base = "ValueInput"
    if obj.cardinality.many:
        return f"Multi{base}"
    return base


def query_result_type(relation: RelationDef) -> str:
    if not relation.binary:
        return "tuple[" + ", ".join(role.target.sdk_type for role in relation.roles) + "]"
    return sdk_value_type(relation.object.target, relation.object.cardinality)
