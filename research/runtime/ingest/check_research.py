#!/usr/bin/env python3
"""Structural consistency checks for issue #45 research artifacts.

This does not validate semantic truth. It only prevents the machine-readable shard
and the human-readable research from drifting apart.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0045-ingest-entity-resolution.json"

LAW_RE = re.compile(r"^## (L-I45-\d{2})\b", re.MULTILINE)
SCENARIO_RE = re.compile(r"^## (S-I45-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-I45-\d{2})$")


def ids(path: Path, pattern: re.Pattern[str]) -> list[str]:
    return pattern.findall(path.read_text(encoding="utf-8"))


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    required = [
        HERE / "README.md",
        HERE / "source-study.md",
        HERE / "ingest-contract.md",
        HERE / "candidate-laws.md",
        HERE / "adversarial-cases.md",
        HERE / "open-questions.md",
        INDEX,
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        fail(f"missing required artifacts: {missing}")

    laws = ids(HERE / "candidate-laws.md", LAW_RE)
    scenarios = ids(HERE / "adversarial-cases.md", SCENARIO_RE)
    if len(laws) != len(set(laws)):
        fail("duplicate candidate-law IDs")
    if len(scenarios) != len(set(scenarios)):
        fail("duplicate scenario IDs")
    if laws != [f"L-I45-{i:02d}" for i in range(1, 20)]:
        fail(f"candidate laws must be contiguous L-I45-01..19, got {laws}")
    if scenarios != [f"S-I45-{i:02d}" for i in range(1, 41)]:
        fail(f"scenarios must be contiguous S-I45-01..40, got {scenarios}")

    doc = json.loads(INDEX.read_text(encoding="utf-8"))
    if doc.get("schema_version") != 2 or doc.get("kind") != "shard":
        fail("index must be schema v2 shard")
    entries = doc.get("entries", [])
    if len(entries) != 1 or entries[0].get("issue") != 45:
        fail("index must contain exactly one issue-45 entry")
    if entries[0].get("artifact") != "research/runtime/ingest/README.md":
        fail("index artifact locator drifted")

    indexed_laws: list[str] = []
    for record in entries[0].get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed_laws.append(match.group(1))
    if sorted(indexed_laws) != sorted(laws):
        fail(f"index laws differ from candidate-laws.md: index={indexed_laws}, markdown={laws}")

    readme = (HERE / "README.md").read_text(encoding="utf-8")
    for name in ["source-study.md", "ingest-contract.md", "candidate-laws.md", "adversarial-cases.md", "open-questions.md"]:
        if name not in readme:
            fail(f"README does not link {name}")

    # Guard the specific epistemic regression discovered in self-review. These
    # phrases would imply that exact identity itself varies by consumer risk.
    contract_bundle = "\n".join(
        (HERE / name).read_text(encoding="utf-8")
        for name in ["README.md", "ingest-contract.md", "candidate-laws.md", "open-questions.md"]
    ).lower()
    forbidden = [
        "exact identity binding for analytics but not for payment",
        "exact identity can be accepted for analytics",
    ]
    for phrase in forbidden:
        if phrase in contract_bundle:
            fail(f"identity/assurance regression detected: {phrase!r}")

    print(f"ok: {len(laws)} candidate laws, {len(scenarios)} adversarial scenarios, index aligned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
