from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(_ROOT / "scripts"))

import analyze_structure
from os_kernel.kernel import Kernel
from support import v001_kernel, v001_run
from verify import evaluate_run, instrumented_run, validate_scenario_run


class V001PropertyTests(unittest.TestCase):
    def test_black_box_properties_pass_without_fixture_expectations(self) -> None:
        run = instrumented_run(Kernel, "ontology", "0" * 40)
        validate_scenario_run(run)
        comparison = evaluate_run(run, analyze_structure.analyze("0" * 40))
        failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
        self.assertEqual(failed, [])

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
        self.assertNotEqual(receipt["planned_quantity"], receipt["committed_quantity"])
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["carrier-timeout"]["outcome"], "unknown")
        self.assertEqual(cmds["carrier-retry"]["outcome"], "unsafe_retry")
        self.assertEqual(cmds["replay-purchase"]["outcome"], "replayed")
        self.assertEqual(run["records"]["reconciliations"][0]["resulting_knowledge"], "confirmed")
        self.assertEqual(run["records"]["effect_attempts"][0]["outcome"], "sent_no_response")

    def test_temporal_queries_differ(self) -> None:
        run = v001_run()
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        known_sum = sum(item["value"] for item in known["contributors"])
        believed_sum = sum(item["value"] for item in believed["contributors"])
        self.assertEqual(known["value"], known_sum)
        self.assertEqual(believed["value"], believed_sum)
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
        self.assertTrue(any(item["cause_ref"].startswith("operation:") for item in graph["causal_links"]))
