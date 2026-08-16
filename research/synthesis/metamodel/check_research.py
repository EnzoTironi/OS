#!/usr/bin/env python3
"""Structural and epistemic guard for issue #70 metamodel synthesis."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from reference_model import BASE_FORMS

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
INDEX = ROOT / "research" / "index" / "issue-0070-metamodel-synthesis.json"
RFC = ROOT / "rfcs" / "0001-metamodel-hypothesis.md"
PROPOSED_RFC = ROOT / "rfcs" / "0002-executable-metamodel-hypothesis-v1.md"

LAW_RE = re.compile(r"^## (L-META-\d{2})\b", re.MULTILINE)
KILL_RE = re.compile(r"^### (K70-\d{2})\b", re.MULTILINE)
INDEX_LAW_RE = re.compile(r"#(L-META-\d{2})$")
REVIEW_STATUS_RE = re.compile(r"^status:\s*(review-pending|review-clean)\s*$", re.MULTILINE)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def normalized(text: str) -> str:
    return text.lower().replace("**", "").replace("`", "")


def main() -> int:
    required = [
        "README.md",
        "primitive-reduction-matrix.md",
        "encodings.md",
        "kill-tests.md",
        "candidate-laws.md",
        "candidate-metamodel.json",
        "reference_model.py",
        "test_reductions.py",
        "test_properties.py",
        "test_relation_integrity.py",
        "vertical-business-cycle.md",
        "authoring-ir-runtime.md",
        "open-questions.md",
        "review.md",
        "evidence-index.md",
    ]
    missing = [name for name in required if not (HERE / name).exists()]
    if missing:
        fail(f"missing synthesis artifacts: {missing}")
    if not INDEX.exists():
        fail(f"missing index shard {INDEX.relative_to(ROOT)}")
    if not RFC.exists():
        fail("RFC-0001 disappeared")
    if not PROPOSED_RFC.exists():
        fail("proposed RFC-0002 disappeared")

    laws = LAW_RE.findall((HERE / "candidate-laws.md").read_text(encoding="utf-8"))
    expected_laws = [f"L-META-{i:02d}" for i in range(1, 41)]
    if laws != expected_laws:
        fail(f"expected contiguous laws 01..40, got {laws}")

    kills = KILL_RE.findall((HERE / "kill-tests.md").read_text(encoding="utf-8"))
    expected_kills = [f"K70-{i:02d}" for i in range(1, 51)]
    if kills != expected_kills:
        fail(f"expected contiguous kill tests 01..50, got {kills}")

    candidate = json.loads((HERE / "candidate-metamodel.json").read_text(encoding="utf-8"))
    if candidate.get("decision_state") != "hypothesis" or candidate.get("candidate") != "R5":
        fail("candidate metamodel must remain explicit R5 hypothesis")
    json_base = tuple(item["name"] for item in candidate.get("base_forms", []))
    if json_base != BASE_FORMS:
        fail(f"machine candidate/base model drift: {json_base} != {BASE_FORMS}")
    if len(json_base) != len(set(json_base)):
        fail("duplicate base forms")

    forbidden_base = {
        "Property", "Link", "Interface", "Constraint", "Invariant", "Policy", "Event", "Fact",
        "Projection", "Effect", "Workflow", "Process", "Commitment", "Claim", "Grant", "Pack", "Compiler",
    }
    leaked = forbidden_base.intersection(json_base)
    if leaked:
        fail(f"demoted/domain/tooling forms leaked back into R5 base forms: {sorted(leaked)}")

    critical = candidate.get("critical_kill_tests", [])
    required_critical = {"K70-12", "K70-22", "K70-24", "K70-26", "K70-30", "K70-31", "K70-41", "K70-42", "K70-43"}
    if set(critical) != required_critical:
        fail(f"critical kill-test set drifted: {critical}")

    rfc_marker = candidate.get("rfc_0001_update")
    allowed_rfc_markers = {
        "blocked-pending-review",
        "replacement-rfc-0002-proposed-not-accepted",
    }
    if rfc_marker not in allowed_rfc_markers:
        fail(f"invalid RFC disposition marker: {rfc_marker}")

    test_reductions = (HERE / "test_reductions.py").read_text(encoding="utf-8")
    for mutant in ["TaggedEventEngine", "ComputationOnlyMutationEngine", "ActionLocalInvariantEngine", "BoolPolicyEngine"]:
        if mutant not in test_reductions:
            fail(f"verification sensitivity mutant lost from tests: {mutant}")

    # This branch deliberately uses unittest discovery. As #46 proved, a
    # module-level test function would silently be skipped and could create a
    # false-green gate. Reject that shape in every synthesis test module.
    for test_path in sorted(HERE.glob("test_*.py")):
        text = test_path.read_text(encoding="utf-8")
        undiscoverable = re.findall(r"^def (test_[A-Za-z0-9_]+)\(", text, re.MULTILINE)
        if undiscoverable:
            fail(f"unittest would skip module-level tests in {test_path.name}: {undiscoverable}")

    readme = normalized((HERE / "README.md").read_text(encoding="utf-8"))
    for phrase in [
        "base executable form",
        "standard semantic contract",
        "runtime capability",
        "domain type / pattern",
        "tooling / physical representation",
        "does not yet",
        "event contract",
        "rulebinding",
    ]:
        if phrase not in readme:
            fail(f"README lost synthesis boundary phrase: {phrase}")

    authoring_ir = normalized((HERE / "authoring-ir-runtime.md").read_text(encoding="utf-8"))
    for phrase in [
        "anti-cheat rule",
        "canonical semantic ir",
        "runtime capabilities / dispatch",
        "minimum irreducible behavior with maximum explicit authoring semantics",
    ]:
        if phrase not in authoring_ir:
            fail(f"authoring/IR/runtime boundary lost phrase: {phrase}")

    vertical = normalized((HERE / "vertical-business-cycle.md").read_text(encoding="utf-8"))
    for phrase in [
        "salesorder",
        "commitment",
        "stockmovement",
        "workorder",
        "journalentry",
        "the reduced kernel does not imply a reduced business ontology",
    ]:
        if phrase not in vertical:
            fail(f"enterprise vertical lost synthesis coverage: {phrase}")

    # Keep #70's reduced effect model subordinate to the reviewed #41 contract.
    reference_model = (HERE / "reference_model.py").read_text(encoding="utf-8")
    property_tests = (HERE / "test_properties.py").read_text(encoding="utf-8")
    for phrase in ["CONTRADICTED", "attempts: list[str]", "_merge_effect_knowledge"]:
        if phrase not in reference_model:
            fail(f"R5 effect model lost conservative #41 semantics: {phrase}")
    for phrase in [
        "test_later_sent_no_response_cannot_degrade_known_pending",
        "test_conflicting_terminal_effect_evidence_becomes_contradicted",
    ]:
        if phrase not in property_tests:
            fail(f"R5 effect regression test disappeared: {phrase}")

    # RFC-0001 must remain the untouched attack target. #70 publishes a new
    # hypothesis rather than silently rewriting the old one.
    rfc = normalized(RFC.read_text(encoding="utf-8"))
    if "status: hypothesis" not in rfc or "decision: none" not in rfc:
        fail("RFC-0001 was promoted/rewritten before issue #70 convergence")
    if "working candidate: r5" in rfc or "rulebinding" in rfc:
        fail("RFC-0001 appears to have been updated from #70 synthesis")

    proposed_rfc = normalized(PROPOSED_RFC.read_text(encoding="utf-8"))
    for phrase in [
        "status: hypothesis",
        "decision: none",
        "supersedes: nothing",
        "does not supersede rfc-0001",
        "type\nrelation\ncomputation\naction\nrulebinding",
        "action != occurrence",
        "runtime capability",
        "fact-only kernel is rejected",
    ]:
        if phrase not in proposed_rfc:
            fail(f"proposed RFC-0002 lost epistemic/semantic boundary phrase: {phrase}")

    review_raw = (HERE / "review.md").read_text(encoding="utf-8")
    review = normalized(review_raw)
    status_match = REVIEW_STATUS_RE.search(review)
    if not status_match:
        fail("review.md must declare Status: review-pending or review-clean")
    review_status = status_match.group(1)
    for phrase in [
        "r5 remains hypothesis",
        "review-clean does not mean accepted",
        "anti-cheat rule",
        "event / occurrence",
        "critical falsifier",
        "fact — unresolved",
        "do not rewrite or mark rfc-0001 accepted",
    ]:
        if phrase not in review:
            fail(f"review lost epistemic/adversarial guard: {phrase}")

    evidence = normalized((HERE / "evidence-index.md").read_text(encoding="utf-8"))
    for issue in [3, 4, 8, 10, 39, 40, 41, 42, 43, 45, 46, 56]:
        if f"issue #{issue}" not in evidence:
            fail(f"evidence index lost load-bearing issue #{issue}")
    for phrase in [
        "type",
        "relation",
        "computation",
        "action",
        "rulebinding",
        "event / occurrence",
        "fact / statement",
        "current branch verification evidence",
    ]:
        if phrase not in evidence:
            fail(f"evidence index lost synthesis coverage: {phrase}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("index must be a single-entry v2 shard")
    entry = entries[0]
    if entry.get("issue") != 70 or entry.get("artifact") != "research/synthesis/metamodel/README.md":
        fail("index locator/issue mismatch")
    shard_review = entry.get("review_status")
    if shard_review not in {"unreviewed", "review-clean"}:
        fail("invalid review_status")

    # A clean shard is allowed only when the adversarial review itself is clean
    # and the candidate records that RFC-0002 is proposed but not accepted.
    if shard_review == "review-clean":
        if review_status != "review-clean":
            fail("index says review-clean while review.md is not clean")
        if rfc_marker != "replacement-rfc-0002-proposed-not-accepted":
            fail("review-clean shard must record RFC-0002 as proposed-not-accepted")
    else:
        if review_status != "review-pending":
            fail("unreviewed shard must keep review.md pending")
        if rfc_marker != "blocked-pending-review":
            fail("unreviewed shard must keep RFC disposition blocked-pending-review")

    indexed = []
    for record in entry.get("records", []):
        match = INDEX_LAW_RE.search(record.get("ref", ""))
        if match:
            indexed.append(match.group(1))
    if sorted(indexed) != sorted(laws):
        fail(f"candidate-law index drift: {indexed} != {laws}")

    print(
        f"ok: R5={list(BASE_FORMS)}, {len(laws)} laws, {len(kills)} kill tests, "
        f"enterprise vertical + evidence + RFC-0002 present, RFC-0001 unchanged, "
        f"review={shard_review}/{review_status}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
