from __future__ import annotations

import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SUITE = HERE.parent / "suite"


def load_json(name: str) -> dict[str, Any]:
    path = SUITE / name
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{name} must be an object")
    return data


def load_scenario() -> dict[str, Any]:
    return load_json("scenario.json")


def load_cuts() -> dict[str, Any]:
    return load_json("cuts.json")
