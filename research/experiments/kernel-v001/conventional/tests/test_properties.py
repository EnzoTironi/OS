from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parents[1]
EXPERIMENT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(EXPERIMENT / "scripts") not in sys.path:
    sys.path.insert(0, str(EXPERIMENT / "scripts"))

import analyze
import verify
from services.canonical import dumps_pretty
from harness import run_v001

SCHEMA = json.loads((EXPERIMENT / "schemas" / "scenario-run.schema.json").read_text(encoding="utf-8"))


class PropertyTests(unittest.TestCase):
    def test_black_box_suite_passes(self) -> None:
        run = run_v001()
        Draft202012Validator(SCHEMA, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(run)
        self.assertEqual(run["engine"], "conventional")
        comparison = verify.evaluate_run(run, analyze.analyze("0" * 40))
        failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
        self.assertEqual(failed, [])
        self.assertEqual(len(comparison["property_results"]), 12)

    def test_two_runs_are_byte_identical(self) -> None:
        first = dumps_pretty(run_v001())
        second = dumps_pretty(run_v001())
        self.assertEqual(first, second)

    def test_acceptance_outcomes_are_derived(self) -> None:
        run = run_v001()
        receipt = run["operation_receipts"][0]
        self.assertTrue(receipt["stale"])
        self.assertNotEqual(receipt["planned_quantity"], receipt["committed_quantity"])
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["carrier-timeout"]["outcome"], "unknown")
        self.assertEqual(cmds["carrier-retry"]["outcome"], "unsafe_retry")
        self.assertEqual(cmds["replay-purchase"]["outcome"], "replayed")
        self.assertEqual(run["records"]["reconciliations"][0]["resulting_knowledge"], "confirmed")
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["value"], sum(item["value"] for item in known["contributors"]))
        self.assertEqual(believed["value"], sum(item["value"] for item in believed["contributors"]))
        self.assertNotEqual(known["contributor_digest"], believed["contributor_digest"])
        explanation = run["explanations"][0]
        self.assertTrue(explanation["complete"])
        self.assertEqual(explanation["gaps"], [])
