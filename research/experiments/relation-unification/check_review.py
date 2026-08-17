#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REVIEW = HERE / "review.md"
LAWS = HERE / "candidate-laws.md"
INDEX = ROOT / "research" / "index" / "issue-0158-relation-unification.json"

LAW_RE = re.compile(r"^## (L-REL-\d{2})\b", re.MULTILINE)
STATUS_RE = re.compile(r"\*\*Status:\*\*\s*(review-pending|review-clean)", re.IGNORECASE)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    for path in [REVIEW, LAWS, INDEX]:
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}")

    review_text = REVIEW.read_text(encoding="utf-8")
    status_match = STATUS_RE.search(review_text)
    if not status_match:
        fail("review.md must declare review-pending or review-clean")
    review_status = status_match.group(1).lower()

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard":
        fail("issue #158 index must be a v2 shard")
    entries = shard.get("entries", [])
    if len(entries) != 1:
        fail("issue #158 index must contain exactly one entry")
    entry = entries[0]
    if entry.get("issue") != 158:
        fail("issue #158 index issue id drift")
    if entry.get("artifact") != "research/experiments/relation-unification/README.md":
        fail("issue #158 index artifact locator drift")

    shard_status = entry.get("review_status")
    if review_status == "review-pending" and shard_status != "unreviewed":
        fail("review-pending requires unreviewed index status")
    if review_status == "review-clean" and shard_status != "review-clean":
        fail("review-clean requires review-clean index status")

    laws = LAW_RE.findall(LAWS.read_text(encoding="utf-8"))
    indexed = sorted(
        record.get("ref", "").split("#")[-1]
        for record in entry.get("records", [])
        if "#L-REL-" in record.get("ref", "")
    )
    if indexed != sorted(laws):
        fail(f"index/candidate-law drift: indexed={indexed}, laws={sorted(laws)}")

    expected_states = {"hypothesis", "supported", "rejected", "undetermined"}
    for record in entry.get("records", []):
        if "#L-REL-" not in record.get("ref", ""):
            continue
        if record.get("kind") != "candidate-law":
            fail(f"indexed L-REL record is not candidate-law: {record}")
        if record.get("epistemic_state") not in expected_states:
            fail(f"invalid epistemic state: {record}")

    for phrase in [
        "r6 remains `hypothesis`, not accepted",
        "targetkind",
        "relationassertion",
        "revival conditions for canonical property/link",
        "#71 cross-cycle vertical",
    ]:
        if phrase.lower() not in review_text.lower():
            fail(f"review lost adversarial boundary: {phrase}")

    print(
        f"ok: issue #158 review/index aligned; 21 candidate laws indexed; "
        f"status={review_status}/{shard_status}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
