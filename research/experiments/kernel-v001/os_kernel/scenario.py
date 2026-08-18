from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from os_kernel.canonical import digest
from os_kernel.definitions import load_bundle
from os_kernel.errors import InputError, InternalError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "fixtures"


def scenario_dir(scenario_id: str) -> Path:
    path = FIXTURES / scenario_id
    if not path.is_dir():
        raise InputError(
            "unknown_scenario",
            f"cenário {scenario_id} não encontrado",
            "os scenario run v001 --output json",
        )
    return path


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InputError("invalid_json", f"JSON inválido em {path.name}: {exc}", "os scenario run v001 --output json") from exc
    if not isinstance(data, dict):
        raise InputError("invalid_json", f"{path.name} deve ser um objeto", "os scenario run v001 --output json")
    return data


def run_scenario(scenario_id: str) -> tuple[Kernel, dict[str, Any], list[dict[str, Any]]]:
    folder = scenario_dir(scenario_id)
    definitions = load_json(folder / "definitions.json")
    scenario = load_json(folder / "scenario.json")
    if scenario.get("scenario_id") != scenario_id:
        raise InternalError("scenario_mismatch", "scenario_id no arquivo não coincide com o pedido")
    clock = ScriptedClock(scenario.get("clock", {}).get("start", "2030-08-10T10:00:00Z"))
    kernel = Kernel.open(load_bundle(definitions), clock, SeqIds())
    receipts: list[dict[str, Any]] = []
    cuts = scenario.get("knowledge_cuts") or {}
    applied = 0
    for command in scenario.get("commands", []):
        if not isinstance(command, dict):
            raise InputError("invalid_command", "cada comando deve ser um objeto", "os scenario run v001 --output json")
        command_id = command.get("command_id")
        if command_id and any(item.get("before_command_id") == command_id for item in cuts.values() if isinstance(item, dict)):
            for alias, spec in cuts.items():
                if isinstance(spec, dict) and spec.get("before_command_id") == command_id:
                    kernel._aliases[alias] = kernel._store.current_revision()
        payload = dict(command)
        if "definitions_file" in payload:
            payload["definitions"] = load_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        receipt = kernel.apply(payload)
        applied += 1
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
    if applied == 0:
        raise InternalError("empty_scenario", "o cenário não contém comandos")
    return kernel, scenario, receipts


def scenario_run_document(scenario_id: str, engine: str) -> dict[str, Any]:
    kernel, scenario, receipts = run_scenario(scenario_id)
    report = kernel.query({"type": "scenario-report", "scenario_id": scenario_id})
    known_then = None
    now_believed = None
    for query in scenario.get("closing_queries", []):
        result = kernel.query(query)
        if query.get("type") == "known-then":
            known_then = result
        elif query.get("type") == "now-believed-for-then":
            now_believed = result
    explanations = []
    for reference in scenario.get("closing_explains", []):
        explanations.append(kernel.explain(reference))
    input_digest = digest(
        {
            "definitions": load_json(scenario_dir(scenario_id) / "definitions.json"),
            "scenario": {key: value for key, value in scenario.items() if key != "black_box_expectations"},
        }
    )
    return {
        "contract_version": "kernel-v001-scenario-run/1",
        "scenario_id": scenario_id,
        "engine": engine,
        "input_digest": input_digest,
        "definition_revisions": report["definition_revisions"],
        "records": report["records"],
        "queries": [item for item in (known_then, now_believed) if item is not None],
        "explanations": explanations,
        "operation_receipts": report["operation_receipts"],
        "effect_knowledge": report["effect_knowledge"],
        "command_receipts": receipts,
        "record_counts": report["record_counts"],
        "aliases": report["aliases"],
        "temporal_limit": scenario.get("temporal_limit"),
    }
