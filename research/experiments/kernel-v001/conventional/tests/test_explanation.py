from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from harness import load_scenario
from services.engine import ConventionalEngine


class ExplanationTests(unittest.TestCase):
    def test_complete_is_not_a_literal_constant(self) -> None:
        source = (HERE / "services" / "explain.py").read_text(encoding="utf-8")
        tree = ast.parse(source, filename="services/explain.py")
        assigned = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value == "complete" and isinstance(value, ast.Constant):
                        assigned.append(value.value)
        self.assertNotIn(True, assigned)
        self.assertNotIn('"complete": True', source)
        self.assertNotIn("'complete': True", source)

    def test_nominal_explanation_is_complete(self) -> None:
        engine = ConventionalEngine(load_scenario())
        engine.run()
        graph = engine.explain("v001:operation:purchase-raw-1")
        self.assertTrue(graph["complete"])
        self.assertEqual(graph["gaps"], [])
        self.assertEqual(graph["inputs"]["quantity"], 1000)
        self.assertEqual(graph["actor_id"], "actor:planner-agent")
        self.assertTrue(graph["proposal"])
        self.assertTrue(graph["approval"])
        self.assertTrue(graph["effect_requests"])
        self.assertTrue(graph["causal_links"])

    def test_removing_envelope_link_clears_inputs_and_creates_gap(self) -> None:
        engine = ConventionalEngine(load_scenario())
        engine.run()
        table = engine.ledger._tables["causal_links"]
        drop = [
            key
            for key, link in table.items()
            if link["relation"] == "committed-as" and str(link["cause_ref"]).startswith("operation:")
        ]
        self.assertTrue(drop)
        for key in drop:
            del table[key]
        graph = engine.explain("v001:operation:purchase-raw-1")
        self.assertEqual(graph["inputs"], {})
        self.assertIsNone(graph["actor_id"])
        self.assertIsNone(graph["represented_principal_id"])
        self.assertIsNone(graph["workload_id"])
        self.assertIsNone(graph["delegation_id"])
        self.assertIsNotNone(graph["proposal"])
        self.assertIsNotNone(graph["approval"])
        self.assertTrue(graph["effect_requests"])
        self.assertTrue(graph["gaps"])
        self.assertFalse(graph["complete"])
        self.assertTrue(any(item.get("ref") for item in graph["gaps"]))

    def test_removing_all_links_leaves_incomplete_explanation(self) -> None:
        engine = ConventionalEngine(load_scenario())
        engine.run()
        engine.ledger._tables["causal_links"].clear()
        graph = engine.explain("v001:operation:purchase-raw-1")
        self.assertFalse(graph["complete"])
        self.assertTrue(graph["gaps"])
        self.assertIsNone(graph["proposal"])
        self.assertEqual(list(graph["effect_attempts"]), [])
        self.assertEqual(list(graph["reconciliation_records"]), [])
        self.assertEqual(graph["inputs"], {})
        self.assertIsNone(graph["actor_id"])
        self.assertIsNone(graph["represented_principal_id"])
        self.assertIsNone(graph["workload_id"])
        self.assertIsNone(graph["delegation_id"])
        self.assertTrue(any(item.get("ref") for item in graph["gaps"]))
