#!/usr/bin/env python3
"""Structural/coverage guard for issue #46 verification artifacts."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from scenario_registry import build_registry

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INDEX = ROOT / "research" / "index" / "issue-0046-cross-ontology-verification.json"
REGRESSIONS = HERE / "regressions" / "known-counterexamples.json"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    required = [
        "README.md",
        "registry-config.json",
        "scenario_registry.py",
        "verification-matrix.md",
        "harness.py",
        "test_harness.py",
        "modelcheck.py",
        "formal/authorization_z3.py",
        "regressions/known-counterexamples.json",
        "test_regressions.py",
        "open-questions.md",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing or not INDEX.exists():
        fail(f"missing verification artifacts: {missing + ([] if INDEX.exists() else [str(INDEX.relative_to(ROOT))])}")

    registry = build_registry()
    if registry["scenario_count"] != 370 or registry["law_count"] != 163:
        fail(f"registry total drift: {registry['scenario_count']} scenarios / {registry['law_count']} laws")

    scenario_ids = {item["scenario_id"] for item in registry["scenarios"]}
    law_ids = {item["law_id"] for item in registry["laws"]}
    if len(scenario_ids) != 370 or len(law_ids) != 163:
        fail("registry IDs are not globally unique")

    matrix = (HERE / "verification-matrix.md").read_text(encoding="utf-8")
    for index in range(1, 10):
        marker = f"V46-P{index:02d}"
        if marker not in matrix:
            fail(f"verification matrix lost critical property {marker}")

    readme = (HERE / "README.md").read_text(encoding="utf-8").lower()
    for phrase in [
        "cheapest adequate verification mechanism",
        "does not mean verified",
        "counterexample",
        "shrinking",
        "real backend",
        "bounded",
    ]:
        if phrase not in readme:
            fail(f"README lost verification epistemic guard: {phrase}")

    regressions = json.loads(REGRESSIONS.read_text(encoding="utf-8"))
    fixtures = regressions.get("fixtures", [])
    if len(fixtures) < 6:
        fail("expected at least six known counterexample fixtures")
    fixture_ids = [fixture["id"] for fixture in fixtures]
    if len(fixture_ids) != len(set(fixture_ids)):
        fail("duplicate regression fixture IDs")
    for fixture in fixtures:
        source = ROOT / fixture["source_artifact"]
        test_path = ROOT / fixture["test_ref"].split("::", 1)[0]
        if not source.exists():
            fail(f"regression {fixture['id']} lost source artifact {fixture['source_artifact']}")
        if not test_path.exists():
            fail(f"regression {fixture['id']} lost executable evidence path {test_path.relative_to(ROOT)}")

    # Guard verifier sensitivity: each formal/exhaustive checker must include a
    # deliberately buggy configuration that is expected to yield a witness.
    modelcheck = (HERE / "modelcheck.py").read_text(encoding="utf-8")
    if "allow_blind_indeterminate_retry=True" not in modelcheck or "expected buggy counterexample" not in modelcheck:
        fail("bounded model checker lacks sensitivity/counterexample self-test")
    smt = (HERE / "formal" / "authorization_z3.py").read_text(encoding="utf-8")
    if "expected_buggy_scope_counterexample" not in smt or "expected_buggy_sod_counterexample" not in smt:
        fail("SMT model lacks SAT sensitivity witnesses")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 46 or entry.get("artifact") != "research/verification/README.md":
        fail("verification index locator/issue mismatch")

    indexed_properties = {
        match.group(1)
        for record in entry.get("records", [])
        if (match := re.search(r"#(V46-P\d{2})$", record.get("ref", "")))
    }
    expected_properties = {f"V46-P{i:02d}" for i in range(1, 10)}
    if indexed_properties != expected_properties:
        fail(f"indexed critical properties drifted: {sorted(indexed_properties)}")

    print(
        f"ok: {registry['scenario_count']} scenarios, {registry['law_count']} laws, "
        f"{len(fixtures)} regressions, 9 critical verification properties"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
