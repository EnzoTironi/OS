#!/usr/bin/env python3
from __future__ import annotations

import inspect
import unittest

import surface_generators
from models import Cardinality, PARTY, PRODUCT, QUANTITY, SALES_ORDER, STRING, RelationDef, Role, enterprise_relation_slice
from surface_generators import mutation_tool, query_result_type, sdk_member, ui_affordance


REL = {r.stable_id: r for r in enterprise_relation_slice()}


class SurfaceGenerationTests(unittest.TestCase):
    def test_scalar_and_entity_tools_share_one_generator(self) -> None:
        name = mutation_tool(REL["r:product-name"])
        customer = mutation_tool(REL["r:order-customer"])
        self.assertEqual(name["name"], "set_name")
        self.assertEqual(name["arguments"], {"product": "Product", "value": "str"})
        self.assertEqual(customer["name"], "set_customer")
        self.assertEqual(customer["arguments"], {"order": "SalesOrder", "party": "Party"})

    def test_many_relation_changes_operation_by_cardinality_not_property_link_kind(self) -> None:
        tags = mutation_tool(REL["r:product-tags"])
        lines = mutation_tool(REL["r:order-lines"])
        self.assertEqual(tags["name"], "add_tags")
        self.assertEqual(lines["name"], "add_lines")
        self.assertEqual(tags["multiplicity"], "many")
        self.assertEqual(lines["multiplicity"], "many")

    def test_ui_lowering_is_endpoint_type_specific_without_canonical_split(self) -> None:
        self.assertEqual(ui_affordance(REL["r:product-name"]), "ValueInput")
        self.assertEqual(ui_affordance(REL["r:product-weight"]), "QuantityInput")
        self.assertEqual(ui_affordance(REL["r:product-status"]), "EnumSelect")
        self.assertEqual(ui_affordance(REL["r:order-customer"]), "EntityPicker")
        self.assertEqual(ui_affordance(REL["r:order-lines"]), "MultiEntityPicker")

    def test_nary_relation_gets_tuple_tool_and_result(self) -> None:
        availability = REL["r:availability"]
        tool = mutation_tool(availability)
        self.assertEqual(tool["name"], "assert_available_quantity")
        self.assertEqual(query_result_type(availability), "tuple[Product, Warehouse, Quantity]")

    def test_query_result_types_stay_precise(self) -> None:
        self.assertEqual(query_result_type(REL["r:product-name"]), "str")
        self.assertEqual(query_result_type(REL["r:product-weight"]), "Quantity | None")
        self.assertEqual(query_result_type(REL["r:product-tags"]), "set[str]")
        self.assertEqual(query_result_type(REL["r:order-customer"]), "Party")
        self.assertEqual(query_result_type(REL["r:order-lines"]), "list[OrderLine]")

    def test_exhaustive_endpoint_and_cardinality_surface_generation(self) -> None:
        targets = [STRING, PARTY, QUANTITY]
        cards = [Cardinality(1, 1), Cardinality(0, 1), Cardinality(0, None), Cardinality(0, None, ordered=True)]
        for target in targets:
            for card in cards:
                with self.subTest(target=target.name, card=card):
                    relation = RelationDef(
                        f"r:{target.name}:{card.minimum}:{card.maximum}:{card.ordered}",
                        "x",
                        (Role("owner", PRODUCT), Role("value", target, card)),
                    )
                    self.assertTrue(sdk_member(relation))
                    self.assertTrue(query_result_type(relation))
                    self.assertTrue(mutation_tool(relation)["name"])
                    self.assertTrue(ui_affordance(relation))

    def test_canonical_generators_do_not_dispatch_on_property_or_link_classes(self) -> None:
        for fn in [sdk_member, mutation_tool, ui_affordance, query_result_type]:
            source = inspect.getsource(fn).lower()
            self.assertNotIn("propertydef", source)
            self.assertNotIn("linkdef", source)
            self.assertNotIn("property", source.replace("property/link", ""))
            self.assertNotIn("linkdef", source)


if __name__ == "__main__":
    unittest.main()
