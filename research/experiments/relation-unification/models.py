#!/usr/bin/env python3
"""Executable mini-IRs for issue #158.

The models are intentionally small enough to audit. They are not production
schema compilers. The point is to reveal whether Property/Link must survive as
canonical semantic kinds after authoring sugar is removed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable, Mapping, Sequence


class ModelError(ValueError):
    pass


class CardinalityError(ModelError):
    pass


class MigrationError(ModelError):
    pass


class TargetKind(str, Enum):
    LITERAL = "literal"
    ENTITY = "entity"


@dataclass(frozen=True)
class TargetType:
    name: str
    kind: TargetKind
    sdk_type: str
    pg_type: str | None = None
    equality: str = "value"


@dataclass(frozen=True)
class Cardinality:
    minimum: int
    maximum: int | None  # None = unbounded
    ordered: bool = False

    def __post_init__(self) -> None:
        if self.minimum < 0:
            raise CardinalityError("minimum must be >= 0")
        if self.maximum is not None and self.maximum < self.minimum:
            raise CardinalityError("maximum must be >= minimum")
        if self.ordered and self.maximum == 1:
            raise CardinalityError("ordering a max-one relation is meaningless")

    @property
    def many(self) -> bool:
        return self.maximum is None or self.maximum > 1

    @property
    def optional(self) -> bool:
        return self.minimum == 0


@dataclass(frozen=True)
class AnnotationShape:
    effective_time: bool = False
    observed_time: bool = False
    provenance: bool = False


@dataclass(frozen=True)
class Role:
    name: str
    target: TargetType
    cardinality: Cardinality = Cardinality(1, 1)


@dataclass(frozen=True)
class TypeDef:
    name: str
    identifiable: bool = True


@dataclass(frozen=True)
class ShapeRequirement:
    name: str
    target: TargetType
    cardinality: Cardinality


@dataclass(frozen=True)
class RelationDef:
    """Competitor A: one canonical relation/tuple form."""

    stable_id: str
    name: str
    roles: tuple[Role, ...]
    derived: bool = False
    inverse_name: str | None = None
    annotations: AnnotationShape = AnnotationShape()

    def __post_init__(self) -> None:
        if len(self.roles) < 2:
            raise ModelError("Relation needs at least two roles")
        role_names = [r.name for r in self.roles]
        if len(set(role_names)) != len(role_names):
            raise ModelError("Relation role names must be unique")

    @property
    def binary(self) -> bool:
        return len(self.roles) == 2

    @property
    def subject(self) -> Role:
        if not self.binary:
            raise ModelError("n-ary Relation has no single subject helper")
        return self.roles[0]

    @property
    def object(self) -> Role:
        if not self.binary:
            raise ModelError("n-ary Relation has no single object helper")
        return self.roles[1]


# Competitor B — explicit semantic Property + Link.
@dataclass(frozen=True)
class PropertyDef:
    stable_id: str
    name: str
    owner: TargetType
    value: TargetType
    cardinality: Cardinality
    derived: bool = False
    annotations: AnnotationShape = AnnotationShape()

    def __post_init__(self) -> None:
        if self.owner.kind is not TargetKind.ENTITY:
            raise ModelError("Property owner must be entity-like")
        if self.value.kind is not TargetKind.LITERAL:
            raise ModelError("Property target must be literal/value")


@dataclass(frozen=True)
class LinkDef:
    stable_id: str
    name: str
    source: TargetType
    target: TargetType
    cardinality: Cardinality
    inverse_name: str | None = None
    derived: bool = False
    annotations: AnnotationShape = AnnotationShape()

    def __post_init__(self) -> None:
        if self.source.kind is not TargetKind.ENTITY or self.target.kind is not TargetKind.ENTITY:
            raise ModelError("Link endpoints must be entity-like")


# Competitor C — scalar slots on Type, entity links as canonical relations.
@dataclass(frozen=True)
class SlotDef:
    stable_id: str
    name: str
    owner: TargetType
    value: TargetType
    cardinality: Cardinality
    derived: bool = False
    annotations: AnnotationShape = AnnotationShape()

    def __post_init__(self) -> None:
        if self.value.kind is not TargetKind.LITERAL:
            raise ModelError("Slot target must be literal/value")


# Competitor D — every statement is a typed tuple predicate.
@dataclass(frozen=True)
class PredicateDef:
    stable_id: str
    name: str
    roles: tuple[Role, ...]
    derived: bool = False
    annotations: AnnotationShape = AnnotationShape()

    def __post_init__(self) -> None:
        if not self.roles:
            raise ModelError("Predicate needs roles")


# Shared target types. This distinction exists independently of Property/Link:
# literals use value equality; entities use stable identity.
STRING = TargetType("String", TargetKind.LITERAL, "str", "text", "value")
BOOL = TargetType("Boolean", TargetKind.LITERAL, "bool", "boolean", "value")
MONEY = TargetType("Money", TargetKind.LITERAL, "Money", "jsonb", "value")
QUANTITY = TargetType("Quantity", TargetKind.LITERAL, "Quantity", "jsonb", "value")
INTERVAL = TargetType("Interval", TargetKind.LITERAL, "Interval", "tstzrange", "value")
PRODUCT_STATUS = TargetType("ProductStatus", TargetKind.LITERAL, "ProductStatus", "text", "value")
UNKNOWN = TargetType("UnknownValue", TargetKind.LITERAL, "UnknownValue", "jsonb", "value")
NOT_APPLICABLE = TargetType("NotApplicableValue", TargetKind.LITERAL, "NotApplicableValue", "jsonb", "value")

PARTY = TargetType("Party", TargetKind.ENTITY, "Party", "uuid", "entity-id")
PRODUCT = TargetType("Product", TargetKind.ENTITY, "Product", "uuid", "entity-id")
SALES_ORDER = TargetType("SalesOrder", TargetKind.ENTITY, "SalesOrder", "uuid", "entity-id")
ORDER_LINE = TargetType("OrderLine", TargetKind.ENTITY, "OrderLine", "uuid", "entity-id")
EMPLOYMENT = TargetType("Employment", TargetKind.ENTITY, "Employment", "uuid", "entity-id")
WAREHOUSE = TargetType("Warehouse", TargetKind.ENTITY, "Warehouse", "uuid", "entity-id")


def sdk_value_type(target: TargetType, cardinality: Cardinality) -> str:
    base = target.sdk_type
    if cardinality.many:
        container = "list" if cardinality.ordered else "set"
        return f"{container}[{base}]"
    if cardinality.optional:
        return f"{base} | None"
    return base


def relation_surface(relation: RelationDef) -> str:
    """Generate a field-like SDK view from a binary relation.

    There is deliberately no Property/Link branch. The object role's ordinary
    target type + cardinality determines the view.
    """
    if not relation.binary:
        args = ", ".join(f"{r.name}: {sdk_value_type(r.target, r.cardinality)}" for r in relation.roles)
        return f"relation {relation.name}({args})"
    return f"{relation.name}: {sdk_value_type(relation.object.target, relation.object.cardinality)}"


def property_link_surface(definition: PropertyDef | LinkDef) -> str:
    """Competitor B necessarily branches on its two semantic classes."""
    if isinstance(definition, PropertyDef):
        return f"{definition.name}: {sdk_value_type(definition.value, definition.cardinality)}"
    return f"{definition.name}: {sdk_value_type(definition.target, definition.cardinality)}"


def slot_link_surface(definition: SlotDef | LinkDef) -> str:
    if isinstance(definition, SlotDef):
        return f"{definition.name}: {sdk_value_type(definition.value, definition.cardinality)}"
    return f"{definition.name}: {sdk_value_type(definition.target, definition.cardinality)}"


def predicate_surface(predicate: PredicateDef) -> str:
    args = ", ".join(f"{r.name}: {sdk_value_type(r.target, r.cardinality)}" for r in predicate.roles)
    return f"predicate {predicate.name}({args})"


def inverse_surface(relation: RelationDef) -> str | None:
    if relation.inverse_name is None or not relation.binary:
        return None
    subject = relation.subject
    # Inverse cardinality is not inferable solely from forward object cardinality
    # in every model; the experiment keeps it as authoring/query metadata rather
    # than fabricating one. For this bounded slice the source side is one entity.
    return f"{relation.inverse_name}: set[{subject.target.sdk_type}]"


def query_path(relation: RelationDef, source_expr: str = "x") -> str:
    if not relation.binary:
        return f"match({relation.name}, {source_expr})"
    suffix = "[]" if relation.object.cardinality.many else ""
    return f"{source_expr}.{relation.name}{suffix}"


def relation_physical_lowering(relation: RelationDef) -> str:
    """Illustrative PostgreSQL-like lowering.

    Physical specialization may branch on endpoint representation/cardinality.
    The returned layout is explicitly not semantic authority.
    """
    if not relation.binary:
        roles = ", ".join(f"{r.name} {r.target.pg_type or 'jsonb'}" for r in relation.roles)
        return f"table {relation.name}({roles})"

    obj = relation.object
    target = obj.target
    card = obj.cardinality
    if not card.many:
        if target.kind is TargetKind.ENTITY:
            return f"column {relation.name} uuid REFERENCES {target.name}(id)"
        return f"column {relation.name} {target.pg_type or 'jsonb'}"

    order = ", position integer" if card.ordered else ""
    value_col = "target_id uuid" if target.kind is TargetKind.ENTITY else f"value {target.pg_type or 'jsonb'}"
    return f"table {relation.name}(owner_id uuid, {value_col}{order})"


def relation_statement_shape(relation: RelationDef) -> dict[str, object]:
    """Generic statement-envelope requirements for time/provenance."""
    return {
        "relation": relation.stable_id,
        "effective_time": relation.annotations.effective_time,
        "observed_time": relation.annotations.observed_time,
        "provenance": relation.annotations.provenance,
    }


def validate_relation_value(relation: RelationDef, values: Sequence[object]) -> None:
    if not relation.binary:
        raise ModelError("use tuple validation for n-ary relation")
    card = relation.object.cardinality
    count = len(values)
    if count < card.minimum:
        raise CardinalityError(f"{relation.name}: expected at least {card.minimum}, got {count}")
    if card.maximum is not None and count > card.maximum:
        raise CardinalityError(f"{relation.name}: expected at most {card.maximum}, got {count}")


def validate_tuple(predicate: RelationDef | PredicateDef, tuple_values: Mapping[str, object]) -> None:
    roles = predicate.roles
    missing = [r.name for r in roles if r.cardinality.minimum > 0 and r.name not in tuple_values]
    if missing:
        raise CardinalityError(f"missing required roles: {missing}")
    unknown = set(tuple_values) - {r.name for r in roles}
    if unknown:
        raise ModelError(f"unknown roles: {sorted(unknown)}")


def satisfies_shape(relation: RelationDef, requirement: ShapeRequirement) -> bool:
    if not relation.binary:
        return False
    obj = relation.object
    return (
        relation.name == requirement.name
        and obj.target == requirement.target
        and obj.cardinality == requirement.cardinality
    )


def migration_classification(old: RelationDef, new: RelationDef) -> str:
    """Classify semantic evolution without silently coercing data."""
    if old.stable_id != new.stable_id:
        return "new-relation-identity"
    if not old.binary or not new.binary:
        return "manual-nary-migration"

    old_obj, new_obj = old.object, new.object
    if old_obj.target.kind != new_obj.target.kind:
        return "breaking-equality-identity-change"
    if old_obj.target != new_obj.target:
        return "breaking-target-type-change"
    if old_obj.cardinality == new_obj.cardinality:
        return "compatible-definition-update"
    if not old_obj.cardinality.many and new_obj.cardinality.many:
        return "breaking-sdk-shape-expand-cardinality"
    if old_obj.cardinality.many and not new_obj.cardinality.many:
        return "potentially-lossy-cardinality-collapse"
    if old_obj.cardinality.minimum < new_obj.cardinality.minimum:
        return "breaking-requiredness-increase"
    return "migration-required"


def enterprise_relation_slice() -> tuple[RelationDef, ...]:
    one = Cardinality(1, 1)
    optional = Cardinality(0, 1)
    many = Cardinality(0, None)
    ordered_many = Cardinality(0, None, ordered=True)
    temporal = AnnotationShape(effective_time=True, observed_time=True, provenance=True)

    return (
        RelationDef("r:product-name", "name", (Role("product", PRODUCT), Role("value", STRING, one))),
        RelationDef("r:product-weight", "weight", (Role("product", PRODUCT), Role("value", QUANTITY, optional))),
        RelationDef("r:product-tags", "tags", (Role("product", PRODUCT), Role("value", STRING, many))),
        RelationDef("r:product-status", "status", (Role("product", PRODUCT), Role("value", PRODUCT_STATUS, one))),
        RelationDef("r:order-customer", "customer", (Role("order", SALES_ORDER), Role("party", PARTY, one)), inverse_name="orders"),
        RelationDef("r:order-lines", "lines", (Role("order", SALES_ORDER), Role("line", ORDER_LINE, ordered_many))),
        RelationDef("r:line-product", "product", (Role("line", ORDER_LINE), Role("product", PRODUCT, one))),
        RelationDef("r:line-qty", "quantity", (Role("line", ORDER_LINE), Role("value", QUANTITY, one))),
        RelationDef("r:line-price", "unit_price", (Role("line", ORDER_LINE), Role("value", MONEY, one)), annotations=temporal),
        RelationDef("r:employment-worker", "worker", (Role("employment", EMPLOYMENT), Role("party", PARTY, one))),
        RelationDef("r:employment-employer", "employer", (Role("employment", EMPLOYMENT), Role("party", PARTY, one))),
        RelationDef("r:employment-valid", "valid_during", (Role("employment", EMPLOYMENT), Role("value", INTERVAL, one))),
        RelationDef(
            "r:availability",
            "available_quantity",
            (Role("product", PRODUCT), Role("warehouse", WAREHOUSE), Role("value", QUANTITY)),
            derived=True,
            annotations=temporal,
        ),
    )


def competitor_b_slice() -> tuple[PropertyDef | LinkDef, ...]:
    one = Cardinality(1, 1)
    optional = Cardinality(0, 1)
    many = Cardinality(0, None)
    ordered_many = Cardinality(0, None, ordered=True)
    temporal = AnnotationShape(effective_time=True, observed_time=True, provenance=True)
    return (
        PropertyDef("r:product-name", "name", PRODUCT, STRING, one),
        PropertyDef("r:product-weight", "weight", PRODUCT, QUANTITY, optional),
        PropertyDef("r:product-tags", "tags", PRODUCT, STRING, many),
        PropertyDef("r:product-status", "status", PRODUCT, PRODUCT_STATUS, one),
        LinkDef("r:order-customer", "customer", SALES_ORDER, PARTY, one, inverse_name="orders"),
        LinkDef("r:order-lines", "lines", SALES_ORDER, ORDER_LINE, ordered_many),
        LinkDef("r:line-product", "product", ORDER_LINE, PRODUCT, one),
        PropertyDef("r:line-qty", "quantity", ORDER_LINE, QUANTITY, one),
        PropertyDef("r:line-price", "unit_price", ORDER_LINE, MONEY, one, annotations=temporal),
        LinkDef("r:employment-worker", "worker", EMPLOYMENT, PARTY, one),
        LinkDef("r:employment-employer", "employer", EMPLOYMENT, PARTY, one),
        PropertyDef("r:employment-valid", "valid_during", EMPLOYMENT, INTERVAL, one),
    )


def competitor_c_slice() -> tuple[SlotDef | LinkDef, ...]:
    out: list[SlotDef | LinkDef] = []
    for item in competitor_b_slice():
        if isinstance(item, PropertyDef):
            out.append(SlotDef(item.stable_id, item.name, item.owner, item.value, item.cardinality, item.derived, item.annotations))
        else:
            out.append(item)
    return tuple(out)


def competitor_d_slice() -> tuple[PredicateDef, ...]:
    return tuple(
        PredicateDef(r.stable_id, r.name, r.roles, r.derived, r.annotations)
        for r in enterprise_relation_slice()
    )


def generated_surface_map() -> dict[str, dict[str, str]]:
    unified = {r.stable_id: relation_surface(r) for r in enterprise_relation_slice() if r.binary}
    split = {r.stable_id: property_link_surface(r) for r in competitor_b_slice()}
    slots = {r.stable_id: slot_link_surface(r) for r in competitor_c_slice()}
    predicates = {
        p.stable_id: predicate_surface(p)
        for p in competitor_d_slice()
        if len(p.roles) == 2
    }
    return {"A": unified, "B": split, "C": slots, "D": predicates}
