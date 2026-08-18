from __future__ import annotations

import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import ROOT
from os_kernel.cli import main


OS = ROOT / "os"


class CliTests(unittest.TestCase):
    def _run(self, argv: list[str]) -> tuple[int, str, str]:
        out = io.StringIO()
        err = io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(argv)
        return code, out.getvalue(), err.getvalue()

    def test_help_is_portuguese_and_has_examples(self) -> None:
        code, out, _ = self._run(["--help"])
        self.assertEqual(code, 0)
        self.assertIn("não interativa", out.lower())
        self.assertIn("Exemplos", out + self._run(["scenario", "run", "--help"])[1])
        for argv in (["scenario", "--help"], ["explain", "--help"], ["query", "--help"]):
            code, text, _ = self._run(argv)
            self.assertEqual(code, 0)
            self.assertIn("Exemplos", text)

    def test_scenario_and_engine_default(self) -> None:
        code, out, _ = self._run(["scenario", "run", "v001", "--output", "json"])
        self.assertEqual(code, 0)
        first = json.loads(out)
        self.assertEqual(first["engine"], "ontology")
        code, second, _ = self._run(["scenario", "run", "v001", "--engine", "ontology", "--output", "json"])
        self.assertEqual(code, 0)
        self.assertEqual(out, second)

    def test_conventional_engine_errors(self) -> None:
        code, _, err = self._run(["scenario", "run", "v001", "--engine", "conventional", "--output", "json"])
        self.assertEqual(code, 2)
        payload = json.loads(err)
        self.assertEqual(payload["error"]["code"], "unsupported_engine")
        self.assertIn("os scenario run v001 --engine ontology --output json", payload["error"]["invocation"])

    def test_explain_and_queries(self) -> None:
        code, out, _ = self._run(["explain", "v001:operation:purchase-raw-1", "--output", "json"])
        self.assertEqual(code, 0)
        self.assertIn("operation_receipt", json.loads(out))
        code, out, _ = self._run(
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
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["value"], 820)

    def test_missing_flag_is_user_error(self) -> None:
        code, _, err = self._run(["query", "known-then", "--scenario", "v001", "--output", "json"])
        self.assertEqual(code, 2)
        self.assertIn("invocation", json.loads(err)["error"])

    def test_real_executable(self) -> None:
        proc = subprocess.run([str(OS), "--help"], check=False, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("os", proc.stdout)

    def test_cli_rejects_invalid_rfc3339(self) -> None:
        code, out, err = self._run(
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
                "not-rfc3339",
                "--known-at",
                "kr:before-late-document",
                "--output",
                "json",
            ]
        )
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        payload = json.loads(err)
        self.assertEqual(payload["error"]["class"], "user-input")
        self.assertIn("invocation", payload["error"])
        self.assertNotIn("Traceback", err)

    def test_help_labels_are_pt_br(self) -> None:
        for argv in (["--help"], ["scenario", "--help"], ["scenario", "run", "--help"], ["explain", "--help"], ["query", "--help"]):
            code, text, _ = self._run(argv)
            self.assertEqual(code, 0)
            lowered = text.lower()
            self.assertNotIn("usage", lowered)
            self.assertNotIn("positional arguments", lowered)
            self.assertNotIn("options", lowered)
