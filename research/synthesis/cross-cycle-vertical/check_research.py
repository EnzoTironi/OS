#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
REQUIRED = ["README.md", "suite/cuts.json", "tests/test_coverage.py"]
FORBIDDEN = [
    "adapters/reference.py",
    "adapters/stub.py",
    "harness/protocol.py",
    "harness/runner.py",
    "suite/scenario.json",
    "run.py",
]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    for name in REQUIRED:
        if not (HERE / name).is_file():
            fail(f"missing {name}")
    for name in FORBIDDEN:
        if (HERE / name).exists():
            fail(f"second kernel leaked back: {name}")
    cuts = json.loads((HERE / "suite/cuts.json").read_text(encoding="utf-8"))
    if cuts.get("kernel_pr") != 169:
        fail("cuts must point at the existing kernel PR")
    print("cross-cycle-71 cuts file ok; no second kernel")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
