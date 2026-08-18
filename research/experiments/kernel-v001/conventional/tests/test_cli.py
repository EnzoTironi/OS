from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from services.cli import main


class CliTests(unittest.TestCase):
    def _run(self, argv: list[str]) -> tuple[int, dict]:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(argv)
        raw = stdout.getvalue()
        self.assertEqual(code, 0, stderr.getvalue())
        return code, json.loads(raw)

    def test_scenario_run_json(self) -> None:
        _, payload = self._run(["scenario", "run", "v001", "--output", "json"])
        self.assertEqual(payload["engine"], "conventional")
        self.assertEqual(payload["contract_version"], "kernel-v001-scenario-run/1")
        self.assertTrue(payload["queries"])
        self.assertTrue(payload["explanations"])

    def test_explain_json(self) -> None:
        _, payload = self._run(["explain", "v001:operation:purchase-raw-1", "--output", "json"])
        self.assertTrue(payload["complete"])
        self.assertEqual(payload["gaps"], [])
        self.assertTrue(payload["inputs"])
        self.assertTrue(payload["causal_links"])

    def test_temporal_queries(self) -> None:
        _, known = self._run(
            [
                "query",
                "known-then",
                "--scenario",
                "v001",
                "--subject",
                "stock:sku-x",
                "--predicate",
                "available-quantity",
                "--valid-at",
                "2030-08-10",
                "--known-at",
                "kr:before-late-document",
                "--output",
                "json",
            ]
        )
        _, believed = self._run(
            [
                "query",
                "now-believed-for-then",
                "--scenario",
                "v001",
                "--subject",
                "stock:sku-x",
                "--predicate",
                "available-quantity",
                "--valid-at",
                "2030-08-10",
                "--output",
                "json",
            ]
        )
        self.assertEqual(known["type"], "known-then")
        self.assertEqual(believed["type"], "now-believed-for-then")
        self.assertNotEqual(known["value"], believed["value"])

    def test_missing_output_is_input_error(self) -> None:
        stderr = io.StringIO()
        with redirect_stdout(io.StringIO()), redirect_stderr(stderr):
            code = main(["scenario", "run", "v001"])
        self.assertEqual(code, 2)
        payload = json.loads(stderr.getvalue())
        self.assertEqual(payload["error"]["class"], "user-input")
        self.assertEqual(payload["error"]["code"], "missing_output")
