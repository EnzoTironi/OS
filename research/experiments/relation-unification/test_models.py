#!/usr/bin/env python3
from __future__ import annotations

import inspect
import unittest

import models
from models import (
    AnnotationShape,
    Cardinality,
    CardinalityError,
    EMPLOYMENT,
    MONEY,
    NOT_APPLICABLE,
    ORDER_LINE,
    PARTY,
    PRODUCT,
    QUANTITY,
    SALES_ORDER,
    STRING,
    UNKNOWN,
    LinkDef,
    PropertyDef,
    RelationDef,
    Role,
    ShapeRequirement,
    TargetKind,
    TypeDef,
    competitor_b_slice,
    enterprise_relation_slice,
    generated_surface_map,
    inverse_surface,
    migration_classification,
    predicate_surface,
    query_path,
    relation_physical_lowering,
    relation_statement_shape,
    relation_surface,
    satisfies_shape,
    sdk_value_type,
    validate_relation_value,
    validate_tuple,
)


REL = {r.stable_id: r for r in enterprise_relation_slice()}


class UnifiedRelationSemanticsTests(unittest.TestCase):
    def test_required_optional_and_multi_scalar_signatures(self) -> None:
        self.assertEqual(relation_surface(REL["r:product-name"]), "name: str")
        self.assertEqual(relation_surface(REL["r:product-weight"]), "weight: Quantity | None")
        self.assertEqual(relation_surface(REL["r:product-tags"]), "tags: set[str]")

    def test_money_quantity_and_enum_are_typed_values(self) -> None:
        self.assertEqual(REL["r:line-price"].object.target, MONEY)
        self.assertEqual(REL["r:line-qty"].object.target, QUANTITY)
        self.assertEqual(REL["r:product-status"].object.target.name, "ProductStatus")
        self.assertTrue(all(t.kind is TargetKind.LITERAL for t in [MONEY, QUANTITY, REL["r:product-status"].object.target]))

    def test_absence_unknown_and_not_applicable_are_not_collapsed(self) -> None:
        optional = REL["r:product-weight"].object.cardinality
        self.assertTrue(optional.optional)
        self.assertNotEqual(UNKNOWN, NOT_APPLICABLE)
        self.assertNotEqual(UNKNOWN.name, "None")
        self.assertNotEqual(NOT_APPLICABLE.name, "None")

    def test_entity_relations_generate_entity_signatures_without_link_kind(self) -> None:
        self.assertEqual(relation_surface(REL["r:order-customer"]), "customer: Party")
        self.assertEqual(relation_surface(REL["r:order-lines"]), "lines: list[OrderLine]")
        self.assertEqual(REL["r:order-customer"].object.target.equality, "entity-id")
        self.assertEqual(REL["r:product-name"].object.target.equality, "value")

    def test_inverse_navigation_is_relation_metadata(self) -> None:
        self.assertEqual(inverse_surface(REL["r:order-customer"]), "orders: set[SalesOrder]")
        self.assertIsNone(inverse_surface(REL["r:product-name"]))

    def test_ordered_relation_changes_container_not_relation_species(self) -> None:
        lines = REL["r:order-lines"]
        self.assertTrue(lines.object.cardinality.ordered)
        self.assertEqual(relation_surface(lines), "lines: list[OrderLine]")
        self.assertEqual(query_path(lines, "order"), "order.lines[]")

    def test_nary_relation_is_same_relation_form(self) -> None:
        availability = REL["r:availability"]
        self.assertFalse(availability.binary)
        self.assertTrue(availability.derived)
        validate_tuple(availability, {"product": "p1", "warehouse": "w1", "value": 10})
        with self.assertRaises(CardinalityError):
            validate_tuple(availability, {"product": "p1", "value": 10})

    def test_lifecycle_relationship_is_identifiable_type_plus_relations(self) -> None:
        employment = TypeDef("Employment", identifiable=True)
        self.assertTrue(employment.identifiable)
        self.assertEqual(REL["r:employment-worker"].subject.target, EMPLOYMENT)
        self.assertEqual(REL["r:employment-employer"].subject.target, EMPLOYMENT)
        self.assertEqual(relation_surface(REL["r:employment-worker"]), "worker: Party")

    def test_derived_relation_does_not_need_derived_property_species(self) -> None:
        availability = REL["r:availability"]
        self.assertTrue(availability.derived)
        self.assertEqual(
            relation_surface(availability),
            "relation available_quantity(product: Product, warehouse: Warehouse, value: Quantity)",
        )

    def test_shape_contract_can_require_scalar_and_entity_relation_capabilities(self) -> None:
        self.assertTrue(
            satisfies_shape(
                REL["r:product-name"],
                ShapeRequirement("name", STRING, Cardinality(1, 1)),
            )
        )
        self.assertTrue(
            satisfies_shape(
                REL["r:order-customer"],
                ShapeRequirement("customer", PARTY, Cardinality(1, 1)),
            )
        )

    def test_temporal_and_provenance_annotations_apply_to_value_relation(self) -> None:
        shape = relation_statement_shape(REL["r:line-price"])
        self.assertEqual(
            shape,
            {
                "relation": "r:line-price",
                "effective_time": True,
                "observed_time": True,
                "provenance": True,
            },
        )

    def test_same_annotation_mechanism_applies_to_entity_relation(self) -> None:
        temporal_customer = RelationDef(
            "r:temporal-customer",
            "customer",
            (Role("order", SALES_ORDER), Role("party", PARTY)),
            annotations=AnnotationShape(effective_time=True, provenance=True),
        )
        shape = relation_statement_shape(temporal_customer)
        self.assertTrue(shape["effective_time"])
        self.assertTrue(shape["provenance"])

    def test_cardinality_validation_is_endpoint_generic(self) -> None:
        validate_relation_value(REL["r:product-name"], ["widget"])
        with self.assertRaises(CardinalityError):
            validate_relation_value(REL["r:product-name"], [])
        with self.assertRaises(CardinalityError):
            validate_relation_value(REL["r:order-customer"], ["party:1", "party:2"])


class GeneratedSurfaceEquivalenceTests(unittest.TestCase):
    def test_unified_and_split_models_generate_same_binary_sdk_shapes(self) -> None:
        surfaces = generated_surface_map()
        self.assertEqual(surfaces["A"], surfaces["B"])
        self.assertEqual(surfaces["A"], surfaces["C"])

    def test_fully_relational_ir_preserves_types_but_is_less_field_ergonomic(self) -> None:
        surfaces = generated_surface_map()
        self.assertIn("predicate", surfaces["D"]["r:product-name"])
        # This comparison is intentionally at the generated SDK surface, where
        # semantic String lowers to Python `str` for every competitor.
        self.assertIn("str", surfaces["D"]["r:product-name"])
        self.assertNotEqual(surfaces["D"]["r:product-name"], surfaces["A"]["r:product-name"])

    def test_query_navigation_does_not_require_property_link_opcode(self) -> None:
        self.assertEqual(query_path(REL["r:product-name"], "product"), "product.name")
        self.assertEqual(query_path(REL["r:order-customer"], "order"), "order.customer")
        self.assertEqual(query_path(REL["r:order-lines"], "order"), "order.lines[]")


class PhysicalLoweringTests(unittest.TestCase):
    def test_scalar_one_can_lower_to_column(self) -> None:
        self.assertEqual(relation_physical_lowering(REL["r:product-name"]), "column name text")

    def test_entity_one_can_lower_to_foreign_key_column(self) -> None:
        self.assertEqual(
            relation_physical_lowering(REL["r:order-customer"]),
            "column customer uuid REFERENCES Party(id)",
        )

    def test_many_scalar_and_many_entity_lower_to_tables(self) -> None:
        self.assertIn("table tags", relation_physical_lowering(REL["r:product-tags"]))
        lines = relation_physical_lowering(REL["r:order-lines"])
        self.assertIn("target_id uuid", lines)
        self.assertIn("position integer", lines)

    def test_nary_relation_lowers_to_relation_table(self) -> None:
        layout = relation_physical_lowering(REL["r:availability"])
        self.assertIn("table available_quantity", layout)
        self.assertIn("product uuid", layout)
        self.assertIn("warehouse uuid", layout)
        self.assertIn("value jsonb", layout)


class MigrationTests(unittest.TestCase):
    def binary(self, stable_id: str, target, card: Cardinality) -> RelationDef:
        return RelationDef(stable_id, "x", (Role("owner", PRODUCT), Role("value", target, card)))

    def test_single_to_multi_is_explicit_breaking_sdk_shape(self) -> None:
        old = self.binary("r:x", STRING, Cardinality(0, 1))
        new = self.binary("r:x", STRING, Cardinality(0, None))
        self.assertEqual(migration_classification(old, new), "breaking-sdk-shape-expand-cardinality")

    def test_multi_to_single_is_potentially_lossy(self) -> None:
        old = self.binary("r:x", STRING, Cardinality(0, None))
        new = self.binary("r:x", STRING, Cardinality(0, 1))
        self.assertEqual(migration_classification(old, new), "potentially-lossy-cardinality-collapse")

    def test_scalar_to_entity_is_identity_semantics_change(self) -> None:
        old = self.binary("r:x", STRING, Cardinality(0, 1))
        new = self.binary("r:x", PARTY, Cardinality(0, 1))
        self.assertEqual(migration_classification(old, new), "breaking-equality-identity-change")

    def test_requiredness_increase_is_breaking(self) -> None:
        old = self.binary("r:x", STRING, Cardinality(0, 1))
        new = self.binary("r:x", STRING, Cardinality(1, 1))
        self.assertEqual(migration_classification(old, new), "breaking-requiredness-increase")

    def test_new_stable_relation_identity_is_not_silent_rename(self) -> None:
        old = self.binary("r:old", STRING, Cardinality(1, 1))
        new = self.binary("r:new", STRING, Cardinality(1, 1))
        self.assertEqual(migration_classification(old, new), "new-relation-identity")


class HiddenBranchAuditTests(unittest.TestCase):
    def test_unified_relation_generator_has_no_property_or_link_class_dispatch(self) -> None:
        source = inspect.getsource(models.relation_surface).lower()
        self.assertNotIn("propertydef", source)
        self.assertNotIn("linkdef", source)
        self.assertNotIn("isinstance", source)

    def test_split_generator_demonstrably_reintroduces_two_semantic_classes(self) -> None:
        source = inspect.getsource(models.property_link_surface).lower()
        self.assertIn("propertydef", source)
        self.assertIn("isinstance", source)

    def test_physical_lowering_may_specialize_by_endpoint_kind(self) -> None:
        source = inspect.getsource(models.relation_physical_lowering).lower()
        self.assertIn("targetkind.entity", source)
        # This is physical layout selection, not canonical Property/Link identity.
        self.assertNotIn("propertydef", source)
        self.assertNotIn("linkdef", source)


if __name__ == "__main__":
    unittest.main()
