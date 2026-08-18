from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import ROOT, load_json, v001_kernel, v001_run


class V001PropertyTests(unittest.TestCase):
    def test_public_kernel_path_and_rival_claims(self) -> None:
        run = v001_run()
        stock = [
            item
            for item in run["records"]["claims"]
            if item["subject_ref"] == "stock:sku-x" and item["predicate_ref"] == "available-quantity"
        ]
        self.assertGreaterEqual(len(stock), 2)
        sources = {item["provenance"]["source_id"] for item in stock}
        self.assertIn("source:erp", sources)
        self.assertIn("source:wms", sources)
        self.assertIn("source:signed-doc", sources)

    def test_stale_replan_and_effect_protocol(self) -> None:
        run = v001_run()
        receipt = run["operation_receipts"][0]
        self.assertTrue(receipt["stale"])
        self.assertEqual(receipt["planned_quantity"], 1000)
        self.assertEqual(receipt["committed_quantity"], 200)
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["carrier-timeout"]["outcome"], "unknown")
        self.assertEqual(cmds["carrier-retry"]["outcome"], "unsafe_retry")
        self.assertEqual(cmds["replay-purchase"]["outcome"], "replayed")
        self.assertEqual(run["records"]["reconciliations"][0]["resulting_knowledge"], "confirmed")
        self.assertEqual(run["records"]["effect_attempts"][0]["outcome"], "sent_no_response")

    def test_temporal_queries_differ(self) -> None:
        run = v001_run()
        expected = load_json(ROOT / "fixtures" / "v001" / "scenario.json")["black_box_expectations"]
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["value"], expected["known_then_available_quantity"])
        self.assertEqual(believed["value"], expected["now_believed_available_quantity"])
        self.assertNotEqual(known["contributor_digest"], believed["contributor_digest"])

    def test_attribution_and_occurrence_split(self) -> None:
        kernel = v001_kernel()
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        envelope = report["records"]["envelopes"][0]["attribution"]
        self.assertEqual(len(set(envelope.values())), 4)
        self.assertNotIn("principal_id", envelope)
        self.assertTrue(any(item["occurrence_id"] == "occurrence:wms-800" for item in report["records"]["occurrences"]))
        self.assertFalse(any(item["causal_operation_ref"] == "purchase-raw-1" for item in report["records"]["occurrences"]))

    def test_explain_resolves_causal_records(self) -> None:
        kernel = v001_kernel()
        graph = kernel.explain("v001:operation:purchase-raw-1")
        for key in (
            "action_revision",
            "inputs",
            "actor_id",
            "represented_principal_id",
            "workload_id",
            "delegation_id",
            "proposal",
            "approval",
            "state_basis",
            "rule_decisions",
            "claims_consumed",
            "mutation_plan",
            "operation_receipt",
            "effect_requests",
            "effect_attempts",
            "reconciliation_records",
        ):
            self.assertTrue(graph.get(key), key)
        self.assertTrue(graph["complete"])
        self.assertEqual(list(graph["gaps"]), [])
        refs = graph["operation_receipt"]["committed_refs"]
        joined = " ".join(refs)
        self.assertNotIn("claim:claim:", joined)
        self.assertNotIn("approval:approval:", joined)
        self.assertNotIn("basis:basis:", joined)
        self.assertNotIn("effect:effect:", joined)
