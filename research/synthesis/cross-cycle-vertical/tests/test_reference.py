from __future__ import annotations

import unittest

from adapters.reference import ReferenceRuntime
from harness.runner import assert_suite


class ReferenceTests(unittest.TestCase):
    def test_reference_passes_the_published_suite(self) -> None:
        report = assert_suite(ReferenceRuntime())
        self.assertEqual(report["scenario_id"], "cross-cycle-71")
        self.assertGreaterEqual(len(report["receipts"]), 20)
        accept = next(item["result"] for item in report["explanations"] if item["id"] == "explain-accept-order")
        self.assertEqual(accept["ontology_revision"], "v1")
        ship = next(item["result"] for item in report["explanations"] if item["id"] == "explain-ship")
        self.assertEqual(ship["corrections"], ["ret:b1-2"])
