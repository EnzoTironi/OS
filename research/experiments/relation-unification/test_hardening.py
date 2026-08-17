#!/usr/bin/env python3
from __future__ import annotations

import inspect
import unittest

import hardened_relation
from hardened_relation import (
    BinaryRelationContract,
    CollectionSemantics,
    RelationAssertion,
    RelationCorrection,
    assertion_surface,
    collection_sdk_type,
    inverse_sdk_type,
    normalize_collection,
)
from models import Cardinality, PARTY, PRODUCT, STRING, RelationDef, Role


class InverseCardinalityTests(unittest.TestCase):
    def test_many_to_one_forward_can_have_one_to_many_inverse(self) -> None:
        customer = RelationDef(
            "r:order-customer",
            "customer",
            (Role("order", PRODUCT), Role("party", PARTY, Cardinality(1, 1))),
        )
        contract = BinaryRelationContract(
            customer.stable_id,
            forward=Cardinality(1, 1),
            inverse=Cardinality(0, None),
        )
        self.assertEqual(inverse_sdk_type(customer, contract), "set[Product]")

    def test_one_to_one_inverse_is_not_fabricated_from_forward(self) -> None:
        relation = RelationDef(
            "r:one-one",
            "paired_with",
            (Role("left", PARTY), Role("right", PARTY, Cardinality(0, 1))),
        )
        one_to_one = BinaryRelationContract(
            relation.stable_id,
            forward=Cardinality(0, 1),
            inverse=Cardinality(0, 1),
        )
        many_inverse = BinaryRelationContract(
            relation.stable_id,
            forward=Cardinality(0, 1),
            inverse=Cardinality(0, None),
        )
        self.assertEqual(inverse_sdk_type(relation, one_to_one), "Party | None")
        self.assertEqual(inverse_sdk_type(relation, many_inverse), "set[Party]")


class CollectionSemanticsTests(unittest.TestCase):
    def relation(self, target=STRING, *, ordered=False) -> RelationDef:
        return RelationDef(
            "r:values",
            "values",
            (Role("owner", PRODUCT), Role("value", target, Cardinality(0, None, ordered=ordered))),
        )

    def test_set_list_and_bag_have_distinct_semantics(self) -> None:
        set_relation = self.relation()
        list_relation = self.relation(ordered=True)
        bag_relation = self.relation()
        set_contract = BinaryRelationContract("r:values", Cardinality(0, None), Cardinality(0, None), CollectionSemantics.SET)
        list_contract = BinaryRelationContract("r:values", Cardinality(0, None, ordered=True), Cardinality(0, None), CollectionSemantics.LIST)
        bag_contract = BinaryRelationContract("r:values", Cardinality(0, None), Cardinality(0, None), CollectionSemantics.BAG)
        self.assertEqual(collection_sdk_type(set_relation, set_contract), "set[str]")
        self.assertEqual(collection_sdk_type(list_relation, list_contract), "list[str]")
        self.assertEqual(collection_sdk_type(bag_relation, bag_contract), "Bag[str]")
        self.assertEqual(normalize_collection(["a", "a", "b"], set_relation, set_contract), {"a", "b"})
        self.assertEqual(normalize_collection(["a", "a", "b"], list_relation, list_contract), ["a", "a", "b"])
        self.assertEqual(normalize_collection(["a", "a", "b"], bag_relation, bag_contract), {"'a'": 2, "'b'": 1})

    def test_collection_semantics_apply_to_entity_targets_too(self) -> None:
        relation = self.relation(PARTY)
        bag = BinaryRelationContract("r:values", Cardinality(0, None), Cardinality(0, None), CollectionSemantics.BAG)
        self.assertEqual(collection_sdk_type(relation, bag), "Bag[Party]")
        self.assertEqual(normalize_collection(["party:1", "party:1", "party:2"], relation, bag), {"party:1": 2, "party:2": 1})


class AssertionEnvelopeTests(unittest.TestCase):
    def test_scalar_and_entity_assertions_share_one_envelope(self) -> None:
        scalar = RelationAssertion(
            "a:price:1",
            "r:line-price",
            {"line": "line:1", "value": {"currency": "BRL", "amount": "10.00"}},
            effective_at="2026-08-16T12:00:00Z",
            observed_at="2026-08-16T12:01:00Z",
            provenance=("source:erp",),
        )
        entity = RelationAssertion(
            "a:customer:1",
            "r:order-customer",
            {"order": "order:1", "party": "party:1"},
            observed_at="2026-08-16T12:01:00Z",
            provenance=("source:crm",),
        )
        self.assertEqual(assertion_surface(scalar)["relation_id"], "r:line-price")
        self.assertEqual(assertion_surface(entity)["relation_id"], "r:order-customer")
        self.assertEqual(type(scalar), type(entity))

    def test_correction_uses_new_assertion_identity_instead_of_rewriting_old(self) -> None:
        old = RelationAssertion("a:1", "r:product-name", {"product": "p:1", "value": "Old"})
        new = RelationAssertion("a:2", "r:product-name", {"product": "p:1", "value": "New"})
        correction = RelationCorrection("c:1", old.assertion_id, new, "source correction")
        self.assertEqual(correction.corrects_assertion_id, "a:1")
        self.assertEqual(correction.replacement.assertion_id, "a:2")

    def test_assertion_envelope_is_not_declared_as_fact_primitive(self) -> None:
        source = inspect.getsource(hardened_relation.RelationAssertion).lower()
        self.assertNotIn("fact", source)
        self.assertNotIn("propertydef", source)
        self.assertNotIn("linkdef", source)


class HardeningHiddenBranchTests(unittest.TestCase):
    def test_hardening_module_does_not_dispatch_property_link_species(self) -> None:
        source = inspect.getsource(hardened_relation).lower()
        self.assertNotIn("propertydef", source)
        self.assertNotIn("linkdef", source)
        self.assertNotIn("slotdef", source)


if __name__ == "__main__":
    unittest.main()
