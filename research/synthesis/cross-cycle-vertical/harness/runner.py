from __future__ import annotations

from typing import Any, Mapping

from harness.check import ExpectationError, subset
from harness.loader import load_scenario
from harness.protocol import Runtime


def run_suite(runtime: Runtime, scenario: Mapping[str, Any] | None = None) -> dict[str, Any]:
    spec = dict(scenario or load_scenario())
    receipts: list[dict[str, Any]] = []
    for step in spec["steps"]:
        command = dict(step["command"])
        receipt = dict(runtime.apply(command))
        expect = step.get("expect") or {}
        if expect:
            subset(receipt, expect, path=f"step:{step['id']}")
        receipts.append({"id": step["id"], "receipt": receipt})

    queries: list[dict[str, Any]] = []
    for item in spec.get("closing_queries") or []:
        result = dict(runtime.query(item["query"]))
        expect = item.get("expect") or {}
        if expect:
            subset(result, expect, path=f"query:{item['id']}")
        queries.append({"id": item["id"], "result": result})

    explanations: list[dict[str, Any]] = []
    for item in spec.get("closing_explains") or []:
        result = dict(runtime.explain(item["operation_id"]))
        expect = item.get("expect") or {}
        if expect:
            subset(result, expect, path=f"explain:{item['id']}")
        explanations.append({"id": item["id"], "result": result})

    return {"scenario_id": spec["scenario_id"], "receipts": receipts, "queries": queries, "explanations": explanations}


def assert_suite(runtime: Runtime) -> dict[str, Any]:
    try:
        return run_suite(runtime)
    except ExpectationError:
        raise
