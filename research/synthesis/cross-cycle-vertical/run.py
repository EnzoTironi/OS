#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json

from adapters.reference import ReferenceRuntime
from adapters.stub import StubRuntime
from harness.runner import assert_suite


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the issue #71 acceptance suite")
    parser.add_argument("--adapter", choices=("reference", "stub"), default="reference")
    args = parser.parse_args()
    runtime = ReferenceRuntime() if args.adapter == "reference" else StubRuntime()
    report = assert_suite(runtime)
    print(json.dumps({"scenario_id": report["scenario_id"], "steps": len(report["receipts"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
