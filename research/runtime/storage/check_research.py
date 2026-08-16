#!/usr/bin/env python3
"""Structural/regression checks for issue #39 storage research."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0039-storage-models.json"
LAW_RE = re.compile(r"^## (L-STO-\d{2})\b", re.MULTILINE)
CASE_RE = re.compile(r"^## (S-STO-\d{2})\b", re.MULTILINE)
CQ_RE = re.compile(r"^## (CQ-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-STO-\d{2})$")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def before_marker(text: str, marker: str) -> str:
    return text.split(marker, 1)[0]


def main() -> int:
    required = [
        "README.md",
        "workload-matrix.md",
        "competency-questions.md",
        "source-study.md",
        "architecture-candidates.md",
        "candidate-laws.md",
        "adversarial-cases.md",
        "open-questions.md",
        "review.md",
        "experiments/postgres18/README.md",
        "experiments/postgres18/test_storage_contract.py",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing or not INDEX.exists():
        fail(f"missing artifacts: {missing + ([] if INDEX.exists() else [str(INDEX.relative_to(ROOT))])}")

    laws_text = (HERE / "candidate-laws.md").read_text(encoding="utf-8")
    cases_text = (HERE / "adversarial-cases.md").read_text(encoding="utf-8")
    cq_text = (HERE / "competency-questions.md").read_text(encoding="utf-8")
    laws = LAW_RE.findall(laws_text)
    cases = CASE_RE.findall(cases_text)
    cqs = CQ_RE.findall(cq_text)
    if laws != [f"L-STO-{i:02d}" for i in range(1, 36)]:
        fail(f"expected contiguous laws 01..35, got {laws}")
    if cases != [f"S-STO-{i:02d}" for i in range(1, 71)]:
        fail(f"expected contiguous scenarios 01..70, got {cases}")
    if cqs != [f"CQ-{i:02d}" for i in range(1, 56)]:
        fail(f"expected contiguous competency questions 01..55, got {cqs}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 39 or entry.get("artifact") != "research/runtime/storage/README.md":
        fail("index locator/issue mismatch")
    indexed = []
    for record in entry.get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed.append(match.group(1))
    if sorted(indexed) != sorted(laws):
        fail(f"candidate-law index drift: {indexed} != {laws}")

    readme = (HERE / "README.md").read_text(encoding="utf-8")
    bundle = "\n".join(
        (HERE / name).read_text(encoding="utf-8")
        for name in ["README.md", "workload-matrix.md", "architecture-candidates.md", "candidate-laws.md", "open-questions.md", "review.md"]
    ).lower()
    for phrase in [
        "one unambiguous writable authority",
        "universal bitemporal",
        "point-in-time recovery",
        "effectrequestid",
        "derived",
        "rebuild",
    ]:
        if phrase not in bundle:
            fail(f"missing storage semantic guard phrase: {phrase}")

    normative = "\n".join([
        before_marker(readme.lower(), "## explicit non-decisions"),
        (HERE / "workload-matrix.md").read_text(encoding="utf-8").lower(),
        (HERE / "architecture-candidates.md").read_text(encoding="utf-8").lower(),
        before_marker(laws_text.lower(), "# explicit non-laws"),
        (HERE / "open-questions.md").read_text(encoding="utf-8").lower(),
    ])
    forbidden = [
        re.compile(r"single source of truth\s*=\s*one physical database"),
        re.compile(r"pit[r]?\s*=\s*business time travel"),
        re.compile(r"kafka exactly-once\s*=\s*business exactly-once"),
        re.compile(r"every (?:row|object|fact).{0,30}(?:must|needs to) (?:be )?bitemporal"),
        re.compile(r"graph ontology.{0,30}(?:requires|must use) (?:a )?graph database"),
    ]
    for pattern in forbidden:
        if pattern.search(normative):
            fail(f"storage semantic regression detected: {pattern.pattern}")

    experiment = (HERE / "experiments/postgres18/test_storage_contract.py").read_text(encoding="utf-8")
    for marker in [
        'run_write_skew("REPEATABLE READ")',
        'run_write_skew("SERIALIZABLE")',
        "semantic_operation",
        "source_binding",
        "source_observation",
    ]:
        if marker not in experiment:
            fail(f"PostgreSQL experiment lost required competency marker: {marker}")

    print(
        f"ok: {len(laws)} laws, {len(cases)} scenarios, {len(cqs)} competency questions, index aligned, experiment guards present"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
