#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVALUATOR = HERE / "evaluate_scorecard.py"
SCHEMA = HERE / "scorecard.schema.json"
CRITERIA = HERE / "criteria.json"
CURRENT = HERE / "current-assessment.json"
VALID = HERE / "fixtures" / "valid"
MUTANTS = HERE / "fixtures" / "mutants"

MUTANT_FINDINGS = {
    "hypothesis-without-falsifier.json": "hypothesis-without-falsifier",
    "locator-missing.json": "locator-missing",
    "bakeoff-single-candidate.json": "bakeoff-single-candidate",
    "source-shaped-acceptance.json": "source-shaped-acceptance",
    "blocking-question-omitted.json": "blocking-question-omitted",
    "architectural-promotion-accepted.json": "architectural-promotion-accepted",
}


def run_cli(*args: str, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(EVALUATOR), *args],
        capture_output=True,
        text=True,
        env=env,
    )


def payload_of(result: subprocess.CompletedProcess[str]) -> dict:
    return json.loads(result.stdout)


class ScorecardCliTests(unittest.TestCase):
    def test_help_is_portuguese(self) -> None:
        result = run_cli("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("Avalia assessments de readiness", result.stdout)
        self.assertIn("não escolhe stack", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_usage_without_args_is_exit_2(self) -> None:
        result = run_cli()
        self.assertEqual(result.returncode, 2)
        self.assertIn("uso:", result.stderr)
        document = payload_of(result)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "usage")

    def test_current_assessment_allows_only_experiment(self) -> None:
        result = run_cli(str(CURRENT))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        document = payload_of(result)
        self.assertEqual(document["status"], "valid")
        gates = document["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "block")
        self.assertEqual(gates["architectural_promotion"], "block")
        self.assertEqual(document["findings"], [])

    def test_green_experiment_only_allows_only_experiment(self) -> None:
        result = run_cli(str(VALID / "experiment-only.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        gates = payload_of(result)["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "block")
        self.assertEqual(gates["architectural_promotion"], "block")

    def test_green_bakeoff_keeps_promotion_blocked(self) -> None:
        result = run_cli(str(VALID / "bakeoff-allowed.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        gates = payload_of(result)["assessments"][0]["gate_results"]
        self.assertEqual(gates["experiment"], "allow")
        self.assertEqual(gates["stack_bakeoff"], "allow")
        self.assertEqual(gates["architectural_promotion"], "block")

    def test_green_eligible_is_not_accepted(self) -> None:
        result = run_cli(str(VALID / "eligible-governance.json"))
        self.assertEqual(result.returncode, 0, result.stdout)
        document = payload_of(result)
        gates = document["assessments"][0]["gate_results"]
        self.assertEqual(gates["architectural_promotion"], "eligible_for_governance_review")
        self.assertNotIn("accepted", json.dumps(document))
        self.assertNotEqual(gates["architectural_promotion"], "allow")

    def test_all_green_fixtures_together(self) -> None:
        paths = sorted(str(path) for path in VALID.glob("*.json"))
        result = run_cli(*paths)
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_mutant_batch_is_exit_1(self) -> None:
        paths = sorted(str(path) for path in MUTANTS.glob("*.json"))
        result = run_cli(*paths)
        self.assertEqual(result.returncode, 1, result.stdout)
        document = payload_of(result)
        self.assertEqual(document["status"], "invalid")
        self.assertTrue(document["findings"])

    def test_cli_validates_date_and_date_time_formats(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            cases = {
                "not-a-date-time": False,
                "2026-08-18T10:30:00": False,
                "2026-02-30T10:30:00Z": False,
                "2026-08-18T10:30:00+08:00": True,
            }
            for value, ok in cases.items():
                target = work / "probe.json"
                document = json.loads((VALID / "experiment-only.json").read_text(encoding="utf-8"))
                document["assessed_at"] = value
                target.write_text(json.dumps(document), encoding="utf-8")
                result = run_cli(str(target))
                payload = payload_of(result)
                if ok:
                    self.assertEqual(result.returncode, 0, value)
                    self.assertEqual(payload["status"], "valid")
                else:
                    self.assertEqual(result.returncode, 1, value)
                    codes = [item["code"] for item in payload["findings"]]
                    self.assertEqual(codes, ["schema-violation"])
                    self.assertEqual(payload["findings"][0]["pointer"], "/assessed_at")

    def test_non_utf8_input_is_invalid_json_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "broken.json"
            target.write_bytes(b'{"schema_version": 1,\xff}')
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stderr, "")
        document = payload_of(result)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "invalid-json")
        self.assertEqual(
            document["findings"][0]["message"],
            "JSON inválido: o arquivo precisa usar UTF-8",
        )
        self.assertEqual(document["findings"][0]["pointer"], "")
        self.assertIs(document["findings"][0]["valid"], False)
        self.assertNotIn("codec", document["findings"][0]["message"])
        self.assertNotIn("0xff", document["findings"][0]["message"])

    def test_invalid_json_is_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "truncated.json"
            target.write_text("{", encoding="utf-8")
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        document = payload_of(result)
        self.assertEqual(document["findings"][0]["code"], "invalid-json")

    def test_array_document_is_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "array.json"
            target.write_text("[]", encoding="utf-8")
            result = run_cli(str(target))
        self.assertEqual(result.returncode, 2)
        document = payload_of(result)
        self.assertEqual(document["findings"][0]["message"], "o documento precisa ser um objeto JSON")

    def test_internal_schema_failure_remains_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            shutil.copy(EVALUATOR, work / "evaluate_scorecard.py")
            shutil.copy(CRITERIA, work / "criteria.json")
            (work / "scorecard.schema.json").write_text("{", encoding="utf-8")
            shutil.copy(VALID / "experiment-only.json", work / "ok.json")
            result = subprocess.run(
                [sys.executable, str(work / "evaluate_scorecard.py"), str(work / "ok.json")],
                capture_output=True,
                text=True,
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            )
        self.assertEqual(result.returncode, 3)
        document = json.loads(result.stdout)
        self.assertEqual(document["status"], "error")
        self.assertEqual(document["findings"][0]["code"], "internal-error")


class MutantIsolationTests(unittest.TestCase):
    def test_each_mutant_returns_only_expected_finding(self) -> None:
        for name, expected in MUTANT_FINDINGS.items():
            with self.subTest(name=name):
                result = run_cli(str(MUTANTS / name))
                self.assertEqual(result.returncode, 1, result.stdout)
                document = payload_of(result)
                codes = [item["code"] for item in document["findings"]]
                self.assertEqual(codes, [expected], document)

    def test_replacing_mutant_with_green_makes_assertion_fail(self) -> None:
        green = run_cli(str(VALID / "experiment-only.json"))
        self.assertEqual(green.returncode, 0)
        green_codes = [item["code"] for item in payload_of(green)["findings"]]
        for expected in MUTANT_FINDINGS.values():
            with self.subTest(expected=expected):
                self.assertNotIn(expected, green_codes)


if __name__ == "__main__":
    unittest.main()
