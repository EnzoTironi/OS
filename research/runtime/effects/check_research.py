#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0041-external-effects.json"
LAW_RE = re.compile(r"^## (L-EFF-\d{2})\b", re.MULTILINE)
SCENARIO_RE = re.compile(r"^## (S-EFF-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-EFF-\d{2})$")


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def before_marker(text: str, marker: str) -> str:
    """Return normative prose before an explicit rejected/non-law section.

    Research artifacts deliberately preserve anti-patterns in rejection lists. A
    regression guard must not fail merely because the corpus documents the exact
    sentence it rejects.
    """
    return text.split(marker, 1)[0]


def main() -> int:
    required = [
        "README.md", "source-study.md", "effect-contract.md", "candidate-laws.md",
        "adversarial-cases.md", "reference_model.py", "test_reference_model.py", "open-questions.md",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing or not INDEX.exists():
        fail(f"missing artifacts: {missing + ([] if INDEX.exists() else [str(INDEX.relative_to(ROOT))])}")

    laws_text = (HERE / "candidate-laws.md").read_text(encoding="utf-8")
    scenarios_text = (HERE / "adversarial-cases.md").read_text(encoding="utf-8")
    laws = LAW_RE.findall(laws_text)
    scenarios = SCENARIO_RE.findall(scenarios_text)
    if laws != [f"L-EFF-{i:02d}" for i in range(1, 31)]:
        fail(f"expected contiguous laws 01..30, got {laws}")
    if scenarios != [f"S-EFF-{i:02d}" for i in range(1, 71)]:
        fail(f"expected contiguous scenarios 01..70, got {scenarios}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 41 or entry.get("artifact") != "research/runtime/effects/README.md":
        fail("index locator/issue mismatch")

    indexed = []
    for record in entry.get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed.append(match.group(1))
    if sorted(indexed) != sorted(laws):
        fail(f"candidate-law index drift: {indexed} != {laws}")

    readme = (HERE / "README.md").read_text(encoding="utf-8")
    contract = (HERE / "effect-contract.md").read_text(encoding="utf-8")
    open_questions = (HERE / "open-questions.md").read_text(encoding="utf-8")
    bundle = "\n".join([readme, contract, laws_text, open_questions]).lower()

    required_phrases = [
        "transport success",
        "accepted/pending",
        "effectrequestid",
        "commitoutcomeindeterminate",
        "compensation/reversal",
    ]
    for phrase in required_phrases:
        if phrase not in bundle:
            fail(f"missing semantic guard phrase: {phrase}")

    # Search only normative sections. Rejected examples are intentionally kept in
    # README/candidate-laws so future readers can see the exact anti-patterns.
    normative_bundle = "\n".join([
        before_marker(readme.lower(), "## what this research refuses"),
        contract.lower(),
        before_marker(laws_text.lower(), "# explicit non-laws"),
        open_questions.lower(),
    ])
    forbidden_normative = [
        re.compile(r"http (?:2\d\d|200|201|202) (?:means|=|is) (?:the )?(?:business )?effect (?:has )?succeeded"),
        re.compile(r"timeout (?:means|=|is) (?:the )?(?:business )?effect (?:has )?failed"),
        re.compile(r"webhook (?:delivery )?count (?:equals|=) effect count"),
    ]
    for pattern in forbidden_normative:
        if pattern.search(normative_bundle):
            fail(f"effect semantic regression detected: {pattern.pattern}")

    # Guard R-EFF-01 specifically: local effect identity must not silently become
    # a required provider-side operation/idempotency identity.
    model = (HERE / "reference_model.py").read_text(encoding="utf-8")
    tests = (HERE / "test_reference_model.py").read_text(encoding="utf-8")
    if "remote_dedup_key" not in model or "known_remote_receipts" not in model:
        fail("R-EFF-01 regression: model must represent optional remote dedupe keys and learned receipts")
    if re.search(r"^\s*remote_operation_id:\s*str\s*$", model, re.MULTILINE):
        fail("R-EFF-01 regression: reference model requires a universal remote_operation_id")
    if "remote_dedup_key=None" not in tests:
        fail("R-EFF-01 regression: tests must cover a provider with no pre-send remote key")

    print(f"ok: {len(laws)} laws, {len(scenarios)} scenarios, index aligned, R-EFF-01 guarded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
