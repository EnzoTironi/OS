from __future__ import annotations

import io
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.cli import main
from os_kernel.scenario import run_scenario, scenario_run_document


def _claims(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["claim_id"]: item for item in report["records"]["claims"]}


def _receipts(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["command_id"]: item for item in items}


class Ontology9Tests(unittest.TestCase):
    def test_historical_query_stays_on_r1(self) -> None:
        kernel, _, _ = run_scenario("ontology-9")
        known = kernel.query(
            {
                "type": "known-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
                "known_at": "kr:before-r2",
            }
        )
        self.assertEqual(known["value"], 20)
        self.assertEqual(known["computation_revision"], "defrev:ontology-9-r1")
        self.assertNotIn("claim:naive-atp-20", [item["claim_id"] for item in known["contributors"]])

    def test_naive_migration_creates_false_current_claim(self) -> None:
        kernel, _, _ = run_scenario("ontology-9")
        report = kernel.query({"type": "scenario-report", "scenario_id": "ontology-9"})
        believed = kernel.query(
            {
                "type": "now-believed-for-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
            }
        )
        self.assertEqual(believed["computation_revision"], "defrev:ontology-9-r2")
        self.assertEqual(believed["value"], 35)
        self.assertIn("claim:naive-atp-20", _claims(report))
        self.assertEqual(_claims(report)["claim:naive-atp-20"]["value"], 20)

    def test_r1_commit_stays_pinned_after_r2(self) -> None:
        kernel, _, receipts = run_scenario("ontology-9")
        cmds = _receipts(receipts)
        self.assertEqual(cmds["commit-reserve"]["outcome"], "committed")
        self.assertEqual(cmds["replay-reserve"]["outcome"], "replayed")
        explanation = kernel.explain("ontology-9:operation:reserve-1")
        self.assertEqual(explanation["action_revision"]["revision_id"], "defrev:ontology-9-r1")
        self.assertIn("claim:reserve-5", explanation["operation_receipt"]["committed_refs"])

    def test_scenario_cli_exits_zero(self) -> None:
        buf = io.StringIO()
        err = io.StringIO()
        with redirect_stdout(buf), redirect_stderr(err):
            code = main(["scenario", "run", "ontology-9", "--output", "json"])
        self.assertEqual(code, 0, err.getvalue())
        document = scenario_run_document("ontology-9", "ontology")
        self.assertEqual(document["scenario_id"], "ontology-9")
        self.assertEqual(len(document["queries"]), 2)
        self.assertEqual(document["queries"][0]["value"], 20)
        self.assertEqual(document["queries"][1]["value"], 35)


if __name__ == "__main__":
    unittest.main()
