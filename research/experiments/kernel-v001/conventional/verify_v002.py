#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parent
EXPERIMENT = HERE.parent
SCHEMAS = EXPERIMENT / "schemas"
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import analyze
import evaluate_v002
import report_delta

PARENT_SHA = "02ecd61322d05e661dfa15dc2dac1830edf7d8c8"
FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _validate_run(payload: dict[str, Any]) -> None:
    schema = _load(SCHEMAS / "scenario-run.schema.json")
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FORMAT_CHECKER).validate(payload)


def _failed(comparison: dict[str, Any]) -> list[str]:
    return [item["property_id"] for item in comparison["property_results"] if not item["passed"]]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--parent-sha", default=PARENT_SHA)
    parser.add_argument("--conventional-run", required=True)
    parser.add_argument("--ontology-run", required=True)
    parser.add_argument("--comparison-output", required=True)
    parser.add_argument("--structure-output", required=True)
    parser.add_argument("--delta-output", required=True)
    args = parser.parse_args()
    conventional = _load(Path(args.conventional_run))
    ontology = _load(Path(args.ontology_run))
    conventional["source_sha"] = args.source_sha
    ontology["source_sha"] = args.source_sha
    if conventional.get("engine") != "conventional":
        sys.stderr.write("conventional run engine must be conventional\n")
        return 1
    if ontology.get("engine") != "ontology":
        sys.stderr.write("ontology run engine must be ontology\n")
        return 1
    _validate_run(conventional)
    _validate_run(ontology)
    conventional_cmp = evaluate_v002.evaluate_run(conventional)
    ontology_cmp = evaluate_v002.evaluate_run(ontology)
    structure = analyze.analyze(args.source_sha)
    delta = report_delta.measure(args.parent_sha, args.source_sha, structure)
    comparison = {
        "contract_version": "kernel-v002-comparison-input/1",
        "scenario_id": "v002",
        "baseline_sha": args.source_sha,
        "parent_sha": args.parent_sha,
        "property_results": {
            "conventional": conventional_cmp["property_results"],
            "ontology": ontology_cmp["property_results"],
        },
        "structure_report": structure,
        "delta_report": {
            "conventional_files": delta["conventional_extension"]["file_count"],
            "conventional_nonblank_lines": delta["conventional_extension"]["nonblank_lines"],
            "ontology_files": delta["ontology_extension"]["file_count"],
            "ontology_nonblank_lines": delta["ontology_extension"]["nonblank_lines"],
            "domain_branches": delta["structure_delta"]["domain_branches"],
            "duplicated_rule_groups": delta["structure_delta"]["duplicated_rule_groups"],
            "caller_contract": delta["structure_delta"]["caller_contract"],
            "trusted_commit_path": delta["structure_delta"]["trusted_commit_path"],
        },
        "locators": {
            "baseline_branch": "cursor/kernel-v002-conventional-a60c",
            "base_branch": "cursor/kernel-v002-conventional-base-a60c",
            "shared_evaluator": "research/experiments/kernel-v001/conventional/evaluate_v002.py",
            "evaluator_symbol": "evaluate_run",
            "conventional_analyzer": "research/experiments/kernel-v001/conventional/analyze.py",
            "scenario_fixture": "research/experiments/kernel-v001/fixtures/v002/scenario.json",
        },
    }
    _write(Path(args.comparison_output), comparison)
    _write(Path(args.structure_output), structure)
    report_delta.write_report(Path(args.delta_output), delta)
    failed_c = _failed(conventional_cmp)
    failed_o = _failed(ontology_cmp)
    if failed_c or failed_o:
        sys.stderr.write("conventional failed: " + ", ".join(failed_c) + "\n")
        sys.stderr.write("ontology failed: " + ", ".join(failed_o) + "\n")
        return 1
    print(args.comparison_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
