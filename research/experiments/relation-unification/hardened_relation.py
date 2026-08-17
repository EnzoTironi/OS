#!/usr/bin/env python3
"""Post-green hardening candidates for issue #158.

The initial unified Relation model exposed three omissions under adversarial
review:

1. forward cardinality does not determine inverse cardinality;
2. `ordered: bool` cannot distinguish set/list/bag collection semantics;
3. definition-level time/provenance annotations do not identify one concrete
   relation assertion when an assertion itself needs evidence/correction/history.

These are modeled as generic Relation/statement contracts, not Property/Link
species. The file is deliberately separate from `models.py` so the history of
the first candidate and the hardening pressure remain visible.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Mapping, Sequence

from models import Cardinality, ModelError, RelationDef, TargetKind


class CollectionSemantics(str, Enum):
    SET = "set"          # unordered, duplicate values collapse by endpoint equality
    LIST = "list"        # ordered, duplicates may be meaningful
    BAG = "bag"          # unordered, multiplicity/duplicates are meaningful


@dataclass(frozen=True)
class BinaryRelationContract:
    """Constraints that are genuinely directional for a binary Relation.

    `forward` is the object multiplicity per subject.
    `inverse` is the subject multiplicity per object.
    They are independent. Neither is a Property/Link discriminator.
    """

    relation_id: str
    forward: Cardinality
    inverse: Cardinality
    collection: CollectionSemantics = CollectionSemantics.SET

    def __post_init__(self) -> None:
        if self.collection is not CollectionSemantics.SET and not self.forward.many:
            raise ModelError("list/bag collection semantics require a many-valued forward relation")
        if self.collection is CollectionSemantics.LIST and not self.forward.ordered:
            raise ModelError("LIST requires ordered forward cardinality")
        if self.collection is CollectionSemantics.BAG and self.forward.ordered:
            raise ModelError("BAG is unordered; use LIST for ordered multiplicity")


@dataclass(frozen=True)
class RelationAssertion:
    """Generic identity/provenance envelope for one concrete relation statement.

    This is a research/runtime statement identity, not a proposed `Fact`
    primitive. It applies equally to scalar-valued and entity-valued relations.
    Whether every assertion needs stable identity remains a storage/runtime
    decision; the envelope is used when correction/provenance/history requires it.
    """

    assertion_id: str
    relation_id: str
    roles: Mapping[str, Any]
    effective_at: str | None = None
    observed_at: str | None = None
    provenance: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.assertion_id:
            raise ModelError("assertion identity cannot be empty")
        if not self.relation_id:
            raise ModelError("relation identity cannot be empty")
        if not self.roles:
            raise ModelError("assertion must bind at least one role")


@dataclass(frozen=True)
class RelationCorrection:
    correction_id: str
    corrects_assertion_id: str
    replacement: RelationAssertion
    reason: str

    def __post_init__(self) -> None:
        if self.replacement.assertion_id == self.corrects_assertion_id:
            raise ModelError("correction must not rewrite the same assertion identity in place")


def inverse_sdk_type(relation: RelationDef, contract: BinaryRelationContract) -> str:
    if not relation.binary:
        raise ModelError("inverse cardinality only applies to binary relations")
    subject_type = relation.subject.target.sdk_type
    card = contract.inverse
    if card.many:
        if card.ordered:
            return f"list[{subject_type}]"
        return f"set[{subject_type}]"
    if card.optional:
        return f"{subject_type} | None"
    return subject_type


def collection_sdk_type(relation: RelationDef, contract: BinaryRelationContract) -> str:
    if not relation.binary:
        raise ModelError("collection view only applies to binary relations")
    target = relation.object.target.sdk_type
    if not contract.forward.many:
        return f"{target} | None" if contract.forward.optional else target
    if contract.collection is CollectionSemantics.SET:
        return f"set[{target}]"
    if contract.collection is CollectionSemantics.LIST:
        return f"list[{target}]"
    return f"Bag[{target}]"


def normalize_collection(values: Sequence[Any], relation: RelationDef, contract: BinaryRelationContract) -> object:
    """Illustrative semantics proving BAG/SET/LIST are not Property-specific.

    Entity SET equality uses stable entity identity supplied by endpoint Type;
    literal SET equality uses value equality supplied by endpoint Type.
    """
    if contract.collection is CollectionSemantics.LIST:
        return list(values)
    if contract.collection is CollectionSemantics.BAG:
        counts: dict[str, int] = {}
        for value in values:
            key = str(value) if relation.object.target.kind is TargetKind.ENTITY else repr(value)
            counts[key] = counts.get(key, 0) + 1
        return counts
    # SET: preserve one representative per endpoint equality key.
    seen: dict[str, Any] = {}
    for value in values:
        key = str(value) if relation.object.target.kind is TargetKind.ENTITY else repr(value)
        seen.setdefault(key, value)
    return set(seen.values())


def assertion_surface(assertion: RelationAssertion) -> dict[str, object]:
    return {
        "assertion_id": assertion.assertion_id,
        "relation_id": assertion.relation_id,
        "roles": dict(assertion.roles),
        "effective_at": assertion.effective_at,
        "observed_at": assertion.observed_at,
        "provenance": list(assertion.provenance),
    }
