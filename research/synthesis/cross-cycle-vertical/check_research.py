#!/usr/bin/env python3
"""Structural guard for the issue #71 suite. Does not promote architecture."""

from __future__ import annotations

import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
REQUIRED = [
    "README.md",
    "run.py",
    "suite/scenario.json",
    "suite/cuts.json",
    "harness/protocol.py",
    "harness/runner.py",
    "adapters/reference.py",
    "adapters/stub.py",
    "tests/test_reference.py",
    "tests/test_stub.py",
    "tests/test_coverage.py",
    "tests/test_neutral.py",
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    for name in REQUIRED:
        if not (HERE / name).is_file():
            fail(f"missing {name}")
    scenario = json.loads((HERE / "suite/scenario.json").read_text(encoding="utf-8"))
    cuts = json.loads((HERE / "suite/cuts.json").read_text(encoding="utf-8"))
    if scenario.get("architecture_decision") != "none":
        fail("suite must not record an architecture decision")
    if scenario.get("status") != "hypothesis":
        fail("suite status must remain hypothesis")
    if "scorecard" in (HERE / "README.md").read_text(encoding="utf-8").lower():
        if "not a gate" not in (HERE / "README.md").read_text(encoding="utf-8").lower():
            fail("if README mentions scorecard it must say it is not a gate")
    if cuts.get("issue") != 71:
        fail("cuts.json must point at issue 71")
    print("cross-cycle-71 research files ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
