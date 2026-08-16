#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0040-commit-semantics.json"
LAW_RE = re.compile(r"^## (L-TX-\d{2})\b", re.MULTILINE)
SCENARIO_RE = re.compile(r"^## (S-TX-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-TX-\d{2})$")


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    required = [
        "README.md", "source-study.md", "commit-contract.md", "candidate-laws.md",
        "adversarial-cases.md", "reference_model.py", "test_reference_model.py", "open-questions.md",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing or not INDEX.exists():
        fail(f"missing artifacts: {missing + ([] if INDEX.exists() else [str(INDEX.relative_to(ROOT))])}")

    laws = LAW_RE.findall((HERE / "candidate-laws.md").read_text(encoding="utf-8"))
    scenarios = SCENARIO_RE.findall((HERE / "adversarial-cases.md").read_text(encoding="utf-8"))
    if laws != [f"L-TX-{i:02d}" for i in range(1, 25)]:
        fail(f"expected contiguous laws 01..24, got {laws}")
    if scenarios != [f"S-TX-{i:02d}" for i in range(1, 51)]:
        fail(f"expected contiguous scenarios 01..50, got {scenarios}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 40 or entry.get("artifact") != "research/runtime/transactions/README.md":
        fail("index locator/issue mismatch")

    indexed = []
    for record in entry.get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed.append(match.group(1))
    if sorted(indexed) != sorted(laws):
        fail(f"candidate-law index drift: {indexed} != {laws}")

    bundle = "\n".join((HERE / name).read_text(encoding="utf-8").lower() for name in [
        "README.md", "commit-contract.md", "candidate-laws.md", "open-questions.md"
    ])
    required_phrases = [
        "semantic operation identity",
        "commitoutcomeindeterminate",
        "state basis",
        "same idempotency identity with materially different intent",
    ]
    for phrase in required_phrases:
        if phrase not in bundle:
            fail(f"missing semantic guard phrase: {phrase}")

    # Guard against the two Wave-A regressions this issue is meant to avoid.
    forbidden_normative = [
        re.compile(r"approval (?:always )?(?:requires|means) reread(?:ing)? (?:the )?current world"),
        re.compile(r"serialization failure (?:is|means) (?:a )?business failure"),
    ]
    for pattern in forbidden_normative:
        if pattern.search(bundle):
            fail(f"semantic regression detected: {pattern.pattern}")

    print(f"ok: {len(laws)} laws, {len(scenarios)} scenarios, index aligned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
