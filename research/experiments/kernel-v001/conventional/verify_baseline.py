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
SCRIPTS = EXPERIMENT / "scripts"
SCHEMAS = EXPERIMENT / "schemas"
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import analyze
import verify

KERNEL_SHA = "a6d03ea92b3966d9a2fdc333bc15f29583868fef"
FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _validate(schema_name: str, payload: dict[str, Any]) -> None:
    schema = _load(SCHEMAS / schema_name)
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FORMAT_CHECKER).validate(payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--scenario-output", required=True)
    parser.add_argument("--comparison-output", required=True)
    parser.add_argument("--structure-output", required=True)
    parser.add_argument("--comparison-input", required=False)
    args = parser.parse_args()
    run = _load(Path(args.scenario_output))
    run["source_sha"] = args.source_sha
    if run.get("engine") != "conventional":
        sys.stderr.write("engine must be conventional\n")
        return 1
    _validate("scenario-run.schema.json", run)
    structure = analyze.analyze(args.source_sha)
    comparison = verify.evaluate_run(run, structure)
    _validate("comparison-output.schema.json", comparison)
    failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
    _write(Path(args.structure_output), structure)
    _write(Path(args.comparison_output), comparison)
    ontology_structure = __import__("analyze_structure").analyze(KERNEL_SHA)
    ontology_cls = verify.engine_catalog()[0][1]
    ontology_run = verify.instrumented_run(ontology_cls, "ontology", KERNEL_SHA)
    ontology_comparison = verify.evaluate_run(ontology_run, ontology_structure)
    comparison_input = {
        "contract_version": "kernel-v001-comparison-input/1",
        "scenario_id": run.get("scenario_id"),
        "baseline_sha": args.source_sha,
        "kernel_sha": KERNEL_SHA,
        "property_results": {
            "conventional": comparison["property_results"],
            "ontology": ontology_comparison["property_results"],
        },
        "structure_report": {
            "conventional": structure,
            "ontology": ontology_structure,
        },
        "locators": {
            "baseline_branch": "cursor/kernel-v001-conventional-a60c",
            "kernel_branch": "cursor/kernel-v001-v3-a60c",
            "baseline_head": args.source_sha,
            "kernel_head": KERNEL_SHA,
            "shared_evaluator": "research/experiments/kernel-v001/scripts/verify.py",
            "evaluator_symbol": "evaluate_run",
            "conventional_analyzer": "research/experiments/kernel-v001/conventional/analyze.py",
            "ontology_analyzer": "research/experiments/kernel-v001/scripts/analyze_structure.py",
            "scenario_fixture": "research/experiments/kernel-v001/fixtures/v001/scenario.json",
        },
    }
    comparison_input_path = Path(args.comparison_input) if args.comparison_input else Path(args.comparison_output).with_name("kernel-v001-conventional-comparison-input.json")
    _write(comparison_input_path, comparison_input)
    if failed:
        sys.stderr.write("failed properties: " + ", ".join(failed) + "\n")
        return 1
    print(args.comparison_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
