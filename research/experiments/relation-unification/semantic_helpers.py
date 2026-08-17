#!/usr/bin/env python3
from __future__ import annotations

from collections.abc import Iterable

from models import Cardinality, RelationDef, TargetKind, TargetType, TypeDef


def endpoint_equal(target: TargetType, left: object, right: object) -> bool:
    """Equality is supplied by endpoint Type semantics, not Relation species."""
    if target.kind is TargetKind.ENTITY:
        # The bounded model represents entity references as stable ids. A real
        # Type system would carry a typed identity reference rather than str().
        return str(left) == str(right)
    return left == right


def action_target_signature(action_name: str, target: TypeDef) -> str:
    if not target.identifiable:
        raise ValueError("Action target must have stable identity in this bounded model")
    return f"{action_name}(target: {target.name})"


def can_collapse_many_to_one(observed_cardinalities: Iterable[int]) -> bool:
    """A schema migration is only data-safe if every existing owner has <=1 value."""
    return all(0 <= count <= 1 for count in observed_cardinalities)


def relation_is_many_to_many(forward: RelationDef, inverse_maximum: int | None) -> bool:
    if not forward.binary:
        return False
    return forward.object.cardinality.many and (inverse_maximum is None or inverse_maximum > 1)


def relation_is_one_to_one(forward: RelationDef, inverse_maximum: int | None) -> bool:
    if not forward.binary:
        return False
    return forward.object.cardinality.maximum == 1 and inverse_maximum == 1
