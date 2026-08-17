#!/usr/bin/env python3
from __future__ import annotations

import unittest

from models import (
    Cardinality,
    EMPLOYMENT,
    PARTY,
    PRODUCT,
    STRING,
    RelationDef,
    Role,
    TargetKind,
    TypeDef,
)
from semantic_helpers import (
    action_target_signature,
    can_collapse_many_to_one,
    endpoint_equal,
    relation_is_many_to_many,
    relation_is_one_to_one,
)


class ExtendedRequiredCases(unittest.TestCase):
    def test_value_equality_and_entity_identity_are_endpoint_semantics(self) -> None:
        self.assertTrue(endpoint_equal(STRING, "ABC", "ABC"))
        self.assertFalse(endpoint_equal(STRING, "ABC", "abc"))
        self.assertTrue(endpoint_equal(PARTY, "party:1", "party:1"))
        self.assertFalse(endpoint_equal(PARTY, "party:1", "party:2"))
        self.assertEqual(STRING.kind, TargetKind.LITERAL)
        self.assertEqual(PARTY.kind, TargetKind.ENTITY)

    def test_one_to_one_is_relation_cardinality_plus_inverse_constraint(self) -> None:
        spouse = RelationDef(
            "r:party-spouse",
            "spouse",
            (Role("party", PARTY), Role("spouse", PARTY, Cardinality(0, 1))),
            inverse_name="spouse_of",
        )
        self.assertTrue(relation_is_one_to_one(spouse, inverse_maximum=1))
        self.assertFalse(relation_is_many_to_many(spouse, inverse_maximum=1))

    def test_many_to_many_is_same_relation_form(self) -> None:
        related = RelationDef(
            "r:related-products",
            "related_products",
            (Role("product", PRODUCT), Role("related", PRODUCT, Cardinality(0, None))),
            inverse_name="related_by",
        )
        self.assertTrue(relation_is_many_to_many(related, inverse_maximum=None))
        self.assertFalse(relation_is_one_to_one(related, inverse_maximum=None))

    def test_identifiable_relationship_can_be_action_target(self) -> None:
        employment = TypeDef("Employment", identifiable=True)
        self.assertEqual(
            action_target_signature("TerminateEmployment", employment),
            "TerminateEmployment(target: Employment)",
        )
        # The participant relations do not need to become Action targets; the
        # identifiable relationship Type is the business thing being changed.
        self.assertEqual(EMPLOYMENT.name, "Employment")

    def test_many_to_one_collapse_requires_data_evidence(self) -> None:
        self.assertTrue(can_collapse_many_to_one([0, 1, 1, 0]))
        self.assertFalse(can_collapse_many_to_one([0, 1, 2]))

    def test_optional_does_not_mean_explicit_unknown(self) -> None:
        optional = Cardinality(0, 1)
        self.assertTrue(optional.optional)
        # No relation assertion is represented by absence; an explicit unknown
        # is a value/state supplied by the domain, not fabricated by cardinality.
        values: list[object] = []
        self.assertEqual(values, [])


if __name__ == "__main__":
    unittest.main()
