#!/usr/bin/env python3
from __future__ import annotations

import ast
import inspect
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from validate_casebook import evaluate_semantic_rules

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
CLI = HERE / "validate_casebook.py"
SCHEMA = HERE / "casebook-fixture.schema.json"
VALID = "research/experiments/structured-casebook/fixtures/valid-minimal.json"
MUTANTS_DIR = HERE / "fixtures" / "mutants"
MUTANT_CODES = (
    "missing-action-actor-or-grant",
    "workload-used-as-business-actor",
    "responsibility-without-source-or-epistemic-label",
    "claimed-scenario-not-instantiated",
    "ambiguous-occurrence-identity-or-time",
    "gap-owner-exists-but-marked-unknown",
    "stale-approval-accepted",
    "timeout-collapsed-to-failed",
)
FORBIDDEN = ("PurchaseRaw", "LOT-IN-8841", "#25", "V-001")
RUN_ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
        env=RUN_ENV,
    )


def mutant_path(code: str) -> str:
    return f"research/experiments/structured-casebook/fixtures/mutants/{code}.json"


def parse_report(stdout: str) -> dict[str, object]:
    return json.loads(stdout)


class CasebookPilotTests(unittest.TestCase):
    def test_schema_is_draft_2020_12_and_checks(self) -> None:
        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)

    def test_valid_fixture_cli_is_green(self) -> None:
        result = run_cli(VALID)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = parse_report(result.stdout)
        self.assertEqual(report["status"], "valid")
        results = report["results"]
        assert isinstance(results, list)
        self.assertEqual(len(results), 1)
        first = results[0]
        assert isinstance(first, dict)
        self.assertTrue(first["valid"])
        self.assertEqual(first["findings"], [])
        self.assertEqual(first["path"], VALID)

    def test_valid_fixture_has_no_semantic_findings(self) -> None:
        document = json.loads((REPO_ROOT / VALID).read_text(encoding="utf-8"))
        self.assertEqual(evaluate_semantic_rules(document), [])

    def test_each_mutant_is_red_with_stable_code(self) -> None:
        for code in MUTANT_CODES:
            with self.subTest(code=code):
                result = run_cli(mutant_path(code))
                self.assertEqual(result.returncode, 1, result.stdout)
                report = parse_report(result.stdout)
                self.assertEqual(report["status"], "invalid")
                results = report["results"]
                assert isinstance(results, list)
                first = results[0]
                assert isinstance(first, dict)
                self.assertFalse(first["valid"])
                findings = first["findings"]
                assert isinstance(findings, list)
                self.assertTrue(findings, f"mutant {code} passed")
                codes = [item["code"] for item in findings if isinstance(item, dict)]
                self.assertEqual(codes, [code])
                for item in findings:
                    assert isinstance(item, dict)
                    self.assertEqual(set(item), {"code", "json_pointer", "message"})

    def test_mutant_batch_is_red(self) -> None:
        paths = [mutant_path(code) for code in sorted(MUTANT_CODES)]
        result = run_cli(*paths)
        self.assertEqual(result.returncode, 1, result.stdout)
        report = parse_report(result.stdout)
        self.assertEqual(report["status"], "invalid")
        results = report["results"]
        assert isinstance(results, list)
        self.assertEqual(len(results), 8)
        for item, code in zip(results, sorted(MUTANT_CODES), strict=True):
            assert isinstance(item, dict)
            self.assertFalse(item["valid"])
            findings = item["findings"]
            assert isinstance(findings, list)
            self.assertIn(code, [finding["code"] for finding in findings if isinstance(finding, dict)])

    def test_missing_unreadable_and_invalid_json_exit_2(self) -> None:
        missing = run_cli("research/experiments/structured-casebook/fixtures/absent.json")
        self.assertEqual(missing.returncode, 2)
        parse_report(missing.stdout)

        with tempfile.TemporaryDirectory() as tmp:
            bad_json = Path(tmp) / "broken.json"
            bad_json.write_text("{", encoding="utf-8")
            invalid = run_cli(str(bad_json))
            self.assertEqual(invalid.returncode, 2)
            parse_report(invalid.stdout)

            blocked = Path(tmp) / "blocked.json"
            blocked.write_text("{}", encoding="utf-8")
            blocked.chmod(stat.S_IWUSR)
            unreadable = run_cli(str(blocked))
            blocked.chmod(stat.S_IRUSR | stat.S_IWUSR)
            self.assertEqual(unreadable.returncode, 2)
            parse_report(unreadable.stdout)

        empty = run_cli()
        self.assertEqual(empty.returncode, 2)
        parse_report(empty.stdout)

    def test_cli_validates_date_and_date_time_formats(self) -> None:
        document = json.loads((REPO_ROOT / VALID).read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            invalid_dt = json.loads(json.dumps(document))
            invalid_dt["occurrences"][0]["occurred_at"] = "not-a-date-time"
            invalid_dt_path = Path(tmp) / "invalid-date-time.json"
            invalid_dt_path.write_text(json.dumps(invalid_dt), encoding="utf-8")
            invalid_dt_result = run_cli(str(invalid_dt_path))
            self.assertEqual(invalid_dt_result.returncode, 1, invalid_dt_result.stdout)
            invalid_dt_report = parse_report(invalid_dt_result.stdout)
            self.assertEqual(invalid_dt_report["status"], "invalid")
            invalid_dt_results = invalid_dt_report["results"]
            assert isinstance(invalid_dt_results, list)
            invalid_dt_first = invalid_dt_results[0]
            assert isinstance(invalid_dt_first, dict)
            invalid_dt_findings = invalid_dt_first["findings"]
            assert isinstance(invalid_dt_findings, list)
            self.assertEqual(len(invalid_dt_findings), 1)
            invalid_dt_finding = invalid_dt_findings[0]
            assert isinstance(invalid_dt_finding, dict)
            self.assertEqual(invalid_dt_finding["code"], "schema-violation")
            self.assertEqual(invalid_dt_finding["json_pointer"], "/occurrences/0/occurred_at")

            valid_tz = json.loads(json.dumps(document))
            valid_tz["occurrences"][0]["occurred_at"] = "2030-08-18T10:30:00+08:00"
            valid_tz_path = Path(tmp) / "valid-offset-date-time.json"
            valid_tz_path.write_text(json.dumps(valid_tz), encoding="utf-8")
            valid_tz_result = run_cli(str(valid_tz_path))
            self.assertEqual(valid_tz_result.returncode, 0, valid_tz_result.stdout)
            valid_tz_report = parse_report(valid_tz_result.stdout)
            self.assertEqual(valid_tz_report["status"], "valid")
            valid_tz_results = valid_tz_report["results"]
            assert isinstance(valid_tz_results, list)
            valid_tz_first = valid_tz_results[0]
            assert isinstance(valid_tz_first, dict)
            self.assertEqual(valid_tz_first["findings"], [])

            invalid_date = json.loads(json.dumps(document))
            invalid_date["occurrences"][1]["valid_on"] = "2030-02-30"
            invalid_date_path = Path(tmp) / "invalid-date.json"
            invalid_date_path.write_text(json.dumps(invalid_date), encoding="utf-8")
            invalid_date_result = run_cli(str(invalid_date_path))
            self.assertEqual(invalid_date_result.returncode, 1, invalid_date_result.stdout)
            invalid_date_report = parse_report(invalid_date_result.stdout)
            self.assertEqual(invalid_date_report["status"], "invalid")
            invalid_date_results = invalid_date_report["results"]
            assert isinstance(invalid_date_results, list)
            invalid_date_first = invalid_date_results[0]
            assert isinstance(invalid_date_first, dict)
            invalid_date_findings = invalid_date_first["findings"]
            assert isinstance(invalid_date_findings, list)
            self.assertEqual(len(invalid_date_findings), 1)
            invalid_date_finding = invalid_date_findings[0]
            assert isinstance(invalid_date_finding, dict)
            self.assertEqual(invalid_date_finding["code"], "schema-violation")
            self.assertEqual(invalid_date_finding["json_pointer"], "/occurrences/1/valid_on")

    def test_non_utf8_input_is_invalid_json_exit_2(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "non-utf8.json"
            path.write_bytes(b"\xff")
            result = run_cli(str(path))
        self.assertEqual(result.returncode, 2, result.stdout)
        self.assertEqual(result.stderr, "")
        report = parse_report(result.stdout)
        self.assertEqual(report["status"], "error")
        results = report["results"]
        assert isinstance(results, list)
        first = results[0]
        assert isinstance(first, dict)
        self.assertFalse(first["valid"])
        findings = first["findings"]
        assert isinstance(findings, list)
        self.assertEqual(len(findings), 1)
        finding = findings[0]
        assert isinstance(finding, dict)
        self.assertEqual(finding["code"], "invalid-json")
        self.assertEqual(finding["json_pointer"], "")
        message = finding["message"]
        assert isinstance(message, str)
        self.assertEqual(message, "JSON inválido: o arquivo precisa usar UTF-8")
        self.assertNotIn("codec", message)
        self.assertNotIn("can't decode", message)
        self.assertNotIn("0xff", message)
        self.assertNotIn("position", message)

    def test_internal_schema_failure_remains_exit_3(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            cli_copy = work / "validate_casebook.py"
            cli_copy.write_text(CLI.read_text(encoding="utf-8"), encoding="utf-8")
            (work / "casebook-fixture.schema.json").write_text("{", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(cli_copy), VALID],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=False,
                env=RUN_ENV,
            )
        self.assertEqual(result.returncode, 3, result.stdout)
        report = parse_report(result.stdout)
        self.assertEqual(report["status"], "error")
        results = report["results"]
        assert isinstance(results, list)
        first = results[0]
        assert isinstance(first, dict)
        findings = first["findings"]
        assert isinstance(findings, list)
        self.assertTrue(findings)
        finding = findings[0]
        assert isinstance(finding, dict)
        self.assertEqual(finding["code"], "internal-error")

    def test_repeated_runs_are_byte_identical(self) -> None:
        first = run_cli(VALID)
        second = run_cli(VALID)
        self.assertEqual(first.returncode, 0)
        self.assertEqual(second.returncode, first.returncode)
        self.assertEqual(first.stdout, second.stdout)
        mutant = mutant_path("stale-approval-accepted")
        third = run_cli(mutant)
        fourth = run_cli(mutant)
        self.assertEqual(third.returncode, 1)
        self.assertEqual(fourth.returncode, third.returncode)
        self.assertEqual(third.stdout, fourth.stdout)

    def test_help_is_portuguese_and_documents_contract(self) -> None:
        result = run_cli("--help")
        self.assertEqual(result.returncode, 0)
        text = result.stdout
        self.assertIn("valid-minimal.json", text)
        self.assertIn("fixtures/mutants/*.json", text)
        self.assertIn("0  todos os documentos são válidos", text)
        self.assertIn("1  pelo menos um documento viola o schema ou uma regra", text)
        self.assertIn("2  erro de uso, leitura ou JSON", text)
        self.assertIn("3  erro interno do validator", text)
        self.assertIn("não verifica se um locator prova a claim", text)
        self.assertIn("witnesses", text)
        self.assertIn("scopes de owner", text)
        self.assertNotIn("Please", text)
        self.assertNotIn("show this help message", text)
        self.assertIn("mostra esta ajuda e sai", text)
        self.assertIn("uso:", text)

    def test_validator_has_no_coded_case_values_or_inline_imports(self) -> None:
        source = CLI.read_text(encoding="utf-8")
        for token in FORBIDDEN:
            self.assertNotIn(token, source)
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for child in ast.walk(node):
                    self.assertNotIsInstance(child, (ast.Import, ast.ImportFrom))
        signature = inspect.signature(evaluate_semantic_rules)
        self.assertEqual(list(signature.parameters), ["document"])

    def test_mutant_files_match_stable_codes(self) -> None:
        names = sorted(path.stem for path in MUTANTS_DIR.glob("*.json"))
        self.assertEqual(names, sorted(MUTANT_CODES))


if __name__ == "__main__":
    unittest.main()
