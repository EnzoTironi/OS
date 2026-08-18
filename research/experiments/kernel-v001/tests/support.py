from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from os_kernel.canonical import digest
from os_kernel.definitions import load_bundle
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.scenario import load_json, run_scenario, scenario_dir, scenario_run_document

FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER


def validator(schema: dict[str, Any]) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FORMAT_CHECKER)


def load_schema(name: str) -> dict[str, Any]:
    return json.loads((ROOT / "schemas" / name).read_text(encoding="utf-8"))


def open_kernel() -> Kernel:
    return Kernel.open(load_json(ROOT / "fixtures" / "v001" / "definitions.json"), ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())


def v001_run() -> dict[str, Any]:
    return scenario_run_document("v001", "ontology")


def v001_kernel() -> Kernel:
    kernel, _, _ = run_scenario("v001")
    return kernel


def apply_scenario_commands(kernel: Kernel, scenario: dict[str, Any], folder: Path) -> list[dict[str, Any]]:
    commands = scenario.get("commands", [])
    cut_before: dict[str, str] = {}
    for alias, spec in (scenario.get("knowledge_cuts") or {}).items():
        if isinstance(spec, dict) and spec.get("before_command_id"):
            cut_before[spec["before_command_id"]] = alias
    receipts: list[dict[str, Any]] = []
    for index, command in enumerate(commands):
        payload = dict(command)
        nxt = commands[index + 1] if index + 1 < len(commands) else None
        if nxt is not None:
            alias = cut_before.get(nxt.get("command_id"))
            if alias:
                payload["alias_revision_as"] = alias
        if "definitions_file" in payload:
            payload["definitions"] = load_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        receipt = kernel.apply(payload)
        receipts.append(
            {
                "command_id": command.get("command_id"),
                "type": command.get("type"),
                "outcome": receipt.outcome,
                "known_revision": receipt.known_revision,
                "record_refs": list(receipt.record_refs),
                "details": receipt.details,
            }
        )
    return receipts


def scenario_document_from_kernel(
    kernel: Kernel,
    scenario: dict[str, Any],
    receipts: list[dict[str, Any]],
    engine: str,
    folder: Path,
) -> dict[str, Any]:
    report = kernel.query({"type": "scenario-report", "scenario_id": scenario.get("scenario_id", "v001")})
    queries = [kernel.query(query) for query in scenario.get("closing_queries", [])]
    explanations = [kernel.explain(reference) for reference in scenario.get("closing_explains", [])]
    input_digest = digest(
        {
            "definitions": load_json(folder / "definitions.json"),
            "scenario": {key: value for key, value in scenario.items() if key != "black_box_expectations"},
        }
    )
    return {
        "contract_version": "kernel-v001-scenario-run/1",
        "scenario_id": scenario.get("scenario_id", "v001"),
        "engine": engine,
        "input_digest": input_digest,
        "definition_revisions": report["definition_revisions"],
        "records": report["records"],
        "queries": queries,
        "explanations": explanations,
        "operation_receipts": report["operation_receipts"],
        "effect_knowledge": report["effect_knowledge"],
        "command_receipts": receipts,
        "record_counts": report["record_counts"],
        "aliases": report["aliases"],
        "temporal_limit": scenario.get("temporal_limit"),
    }


def run_with_class(kernel_cls: type[Kernel]) -> tuple[Kernel, list[dict[str, Any]]]:
    folder = scenario_dir("v001")
    scenario = load_json(folder / "scenario.json")
    clock = ScriptedClock(scenario.get("clock", {}).get("start", "2030-08-10T10:00:00Z"))
    kernel = kernel_cls.open(load_bundle(load_json(folder / "definitions.json")), clock, SeqIds())
    receipts = apply_scenario_commands(kernel, scenario, folder)
    return kernel, receipts


def remap_strings(value: Any, mapping: dict[str, str]) -> Any:
    if isinstance(value, str):
        return mapping.get(value, value)
    if isinstance(value, list):
        return [remap_strings(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: remap_strings(item, mapping) for key, item in value.items()}
    return value
