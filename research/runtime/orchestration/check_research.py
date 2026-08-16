#!/usr/bin/env python3
"""Structural/regression checks for issue #43 research.

This does not prove semantic truth. It keeps IDs/index/artifacts aligned and
protects a few distinctions discovered by adversarial review.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0043-durable-orchestration.json"

LAW_RE = re.compile(r"^## (L-ORCH-\d{2})\b", re.MULTILINE)
SCENARIO_RE = re.compile(r"^## (S-ORCH-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-ORCH-\d{2})$")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def before_marker(text: str, marker: str) -> str:
    return text.split(marker, 1)[0]


def main() -> int:
    required = [
        "README.md",
        "source-study.md",
        "capability-matrix.md",
        "orchestration-contract.md",
        "candidate-laws.md",
        "adversarial-cases.md",
        "reference_model.py",
        "test_reference_model.py",
        "open-questions.md",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing or not INDEX.exists():
        fail(f"missing artifacts: {missing + ([] if INDEX.exists() else [str(INDEX.relative_to(ROOT))])}")

    laws_text = (HERE / "candidate-laws.md").read_text(encoding="utf-8")
    scenarios_text = (HERE / "adversarial-cases.md").read_text(encoding="utf-8")
    laws = LAW_RE.findall(laws_text)
    scenarios = SCENARIO_RE.findall(scenarios_text)
    if laws != [f"L-ORCH-{i:02d}" for i in range(1, 31)]:
        fail(f"expected contiguous laws 01..30, got {laws}")
    if scenarios != [f"S-ORCH-{i:02d}" for i in range(1, 71)]:
        fail(f"expected contiguous scenarios 01..70, got {scenarios}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 43 or entry.get("artifact") != "research/runtime/orchestration/README.md":
        fail("index locator/issue mismatch")

    indexed_laws = []
    for record in entry.get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed_laws.append(match.group(1))
    if sorted(indexed_laws) != sorted(laws):
        fail(f"candidate-law index drift: {indexed_laws} != {laws}")

    readme = (HERE / "README.md").read_text(encoding="utf-8")
    for name in required[1:]:
        if name not in readme and name not in {"reference_model.py", "test_reference_model.py"}:
            fail(f"README does not reference {name}")

    bundle = "\n".join(
        (HERE / name).read_text(encoding="utf-8")
        for name in ["README.md", "orchestration-contract.md", "candidate-laws.md", "open-questions.md"]
    ).lower()
    for phrase in [
        "processo de negócio",  # Portuguese thesis can appear in README? don't require; see below
    ]:
        # no-op marker: intentionally not required because artifacts are English.
        _ = phrase

    required_semantics = [
        "timer firing",
        "business approval",
        "effectrequestid",
        "ontology revision",
        "runtime cancellation",
        "business completion",
    ]
    for phrase in required_semantics:
        if phrase not in bundle:
            fail(f"missing semantic distinction: {phrase}")

    normative = "\n".join([
        before_marker(readme.lower(), "## explicit non-decisions"),
        (HERE / "orchestration-contract.md").read_text(encoding="utf-8").lower(),
        before_marker(laws_text.lower(), "# explicit non-laws"),
        (HERE / "open-questions.md").read_text(encoding="utf-8").lower(),
    ])
    forbidden_patterns = [
        re.compile(r"workflow (?:execution )?completed (?:=|means|proves) business (?:process )?completed"),
        re.compile(r"timer fired (?:=|means|proves) (?:the )?deadline (?:was )?breached"),
        re.compile(r"human task (?:completed|completion) (?:=|means|proves) (?:business )?approval"),
        re.compile(r"signal (?:received|delivery) (?:=|means|proves) (?:a )?business event"),
        re.compile(r"activity retry (?:=|means|proves) (?:a )?safe (?:external )?effect retry"),
    ]
    for pattern in forbidden_patterns:
        if pattern.search(normative):
            fail(f"orchestration semantic regression: {pattern.pattern}")

    model = (HERE / "reference_model.py").read_text(encoding="utf-8")
    tests = (HERE / "test_reference_model.py").read_text(encoding="utf-8")
    if "OrchestrationExecution" not in model or "DomainWorld" not in model:
        fail("reference model must keep runtime execution and domain world separate")
    if "evaluate_commitment_after_timer" not in model:
        fail("reference model must re-evaluate domain commitment after runtime timer")
    if "test_timer_after_fulfillment_does_not_create_false_breach" not in tests:
        fail("timer/domain boundary regression test missing")
    if "test_runtime_completion_does_not_fulfill_business_commitment" not in tests:
        fail("runtime/domain completion boundary regression test missing")
    if "test_human_task_completion_is_not_business_approval" not in tests:
        fail("human-task/approval boundary regression test missing")

    print(f"ok: {len(laws)} laws, {len(scenarios)} scenarios, index aligned, semantic guards present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
