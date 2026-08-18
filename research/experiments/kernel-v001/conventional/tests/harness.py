from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parents[1]
EXPERIMENT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
if str(EXPERIMENT / "scripts") not in sys.path:
    sys.path.insert(0, str(EXPERIMENT / "scripts"))

from services.engine import ConventionalEngine, run_named_scenario

FIXTURE = EXPERIMENT / "fixtures" / "v001" / "scenario.json"
FIXTURE_V002 = EXPERIMENT / "fixtures" / "v002" / "scenario.json"


def load_scenario() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def load_v002() -> dict[str, Any]:
    return json.loads(FIXTURE_V002.read_text(encoding="utf-8"))


def run_v001() -> dict[str, Any]:
    return run_named_scenario("v001")


def run_v002() -> dict[str, Any]:
    return run_named_scenario("v002")


def run_document(scenario: dict[str, Any]) -> dict[str, Any]:
    engine = ConventionalEngine(deepcopy(scenario))
    return engine.run()


def remap_strings(value: Any, mapping: dict[str, str]) -> Any:
    if isinstance(value, str):
        for old, new in mapping.items():
            if old in value:
                value = value.replace(old, new)
        return value
    if isinstance(value, list):
        return [remap_strings(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: remap_strings(item, mapping) for key, item in value.items()}
    return value
