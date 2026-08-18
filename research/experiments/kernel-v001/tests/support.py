from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.scenario import load_json, run_scenario, scenario_run_document

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


def run_with_class(kernel_cls: type[Kernel]) -> tuple[Kernel, list[dict[str, Any]]]:
    from os_kernel.definitions import load_bundle
    from os_kernel.scenario import scenario_dir

    folder = scenario_dir("v001")
    definitions = load_json(folder / "definitions.json")
    scenario = load_json(folder / "scenario.json")
    clock = ScriptedClock(scenario.get("clock", {}).get("start", "2030-08-10T10:00:00Z"))
    kernel = kernel_cls.open(load_bundle(definitions), clock, SeqIds())
    receipts = []
    cuts = scenario.get("knowledge_cuts") or {}
    for command in scenario.get("commands", []):
        payload = dict(command)
        command_id = payload.get("command_id")
        if command_id and any(isinstance(spec, dict) and spec.get("before_command_id") == command_id for spec in cuts.values()):
            for alias, spec in cuts.items():
                if isinstance(spec, dict) and spec.get("before_command_id") == command_id:
                    kernel._aliases[alias] = kernel._store.current_revision()
        if "definitions_file" in payload:
            payload["definitions"] = load_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        receipt = kernel.apply(payload)
        receipts.append({"command_id": command.get("command_id"), "outcome": receipt.outcome, "details": receipt.details})
    return kernel, receipts
