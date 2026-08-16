#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CANDIDATE = HERE / "candidate.json"
MODEL = HERE / "reference_model.py"
TESTS = HERE / "test_models.py"
README = HERE / "README.md"
MODELS = HERE / "models.md"
INDEX = ROOT / "research" / "index" / "issue-0156-rulebinding-reduction.json"
RFC2 = ROOT / "rfcs" / "0002-executable-metamodel-hypothesis-v1.md"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def norm(text: str) -> str:
    return text.lower().replace("**", "").replace("`", "")


def semantic_identifiers(source: str) -> set[str]:
    """Return code identifiers while ignoring comments/docstrings/string prose."""
    tree = ast.parse(source)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
    return names


def main() -> int:
    for path in [CANDIDATE, MODEL, TESTS, README, MODELS, RFC2]:
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}")

    candidate = json.loads(CANDIDATE.read_text(encoding="utf-8"))
    if candidate.get("decision_state") != "hypothesis":
        fail("issue #156 must remain hypothesis")
    if candidate.get("review_status") not in {"unreviewed", "review-clean"}:
        fail("invalid review status")
    if candidate["control"]["base_forms"] != ["Type", "Relation", "Computation", "Action", "RuleBinding"]:
        fail("R5 control drifted")
    if candidate["candidate"]["base_forms"] != ["Type", "Relation", "Computation", "Action"]:
        fail("R6-capability must remain the exact quartet under test")
    if candidate["candidate"]["architecture_state"] != "not-accepted":
        fail("R6-capability was promoted automatically")

    source = MODEL.read_text(encoding="utf-8")
    if "class RuleBinding" in source:
        fail("reference model reintroduced RuleBinding class")
    if "class CapabilityEngine" not in source or "class CapabilityType" not in source:
        fail("M4 capability model disappeared")

    # Inspect only the M4 candidate implementation. Competitor M1/M3 are
    # intentionally allowed to contain locus/trigger dispatch so tests can show
    # why they are hidden recreation. AST identifiers avoid #46-style false
    # negatives where explanatory prose contains the forbidden word in a
    # sentence such as "there is no binding registry".
    marker = "# Weaker/alternative competitors"
    if marker not in source:
        fail("cannot isolate M4 candidate region")
    m4 = source.split(marker, 1)[0]
    ids = {name.lower() for name in semantic_identifiers(m4)}
    forbidden_ids = {"rulebinding", "scope_kind", "bindings_for", "_bindings_for", "_enforce", "locus"}
    leaked = forbidden_ids.intersection(ids)
    if leaked:
        fail(f"M4 candidate recreated binding machinery as code identifiers: {sorted(leaked)}")

    for required in [
        "CapabilityType",
        "CapabilityToken",
        "OperationSignature",
        "mint(",
        "_verify_signature",
        "authoritative_commit",
        "ComputationMutation",
    ]:
        if required not in m4:
            fail(f"M4 lost required capability mechanism: {required}")

    tests = TESTS.read_text(encoding="utf-8")
    for mutant in ["DefinitionGraphDispatcher", "InlineContractEngine", "ExecutableRelationDispatcher"]:
        if mutant not in tests:
            fail(f"sensitivity competitor missing: {mutant}")
    for pressure in [
        "test_global_post_state_invariant_covers_action_and_admin_paths",
        "test_authorization_deny_and_evaluator_error_remain_distinct",
        "test_preview_capability_cannot_authorize_commit",
        "test_current_capability_becomes_stale_after_revision_change",
        "test_pinned_capability_survives_unrelated_revision_but_not_basis_change",
        "test_read_and_effect_attempt_have_distinct_typed_authority",
        "test_occurrence_update_cannot_obtain_required_capability",
        "test_computation_cannot_mutate_even_when_used_as_refinement",
        "test_no_authoritative_path_can_commit_unbalanced_post_state",
    ]:
        if pressure not in tests:
            fail(f"required semantic pressure test missing: {pressure}")

    # #46 lesson: unittest discover silently skips module-level test functions.
    undiscoverable = re.findall(r"^def (test_[A-Za-z0-9_]+)\(", tests, re.MULTILINE)
    if undiscoverable:
        fail(f"unittest would skip module-level tests: {undiscoverable}")

    readme = norm(README.read_text(encoding="utf-8"))
    models = norm(MODELS.read_text(encoding="utf-8"))
    for phrase in [
        "anti-cheat criterion",
        "proof-carrying capability types",
        "no locus field",
        "independent runtime reason",
    ]:
        if phrase not in readme + "\n" + models:
            fail(f"research lost anti-cheat boundary: {phrase}")
    for phrase in [
        "m1 — definition graph plus special dispatcher",
        "m2 — inline contracts",
        "m3 — executable relation trigger",
        "m4 — proof-carrying refined capabilities",
    ]:
        if phrase not in models:
            fail(f"competitor missing from models.md: {phrase}")

    rfc2 = norm(RFC2.read_text(encoding="utf-8"))
    if "status: hypothesis" not in rfc2 or "decision: none" not in rfc2 or "supersedes: nothing" not in rfc2:
        fail("RFC-0002 was promoted while #156 is still a kill test")

    if INDEX.exists():
        shard = json.loads(INDEX.read_text(encoding="utf-8"))
        entries = shard.get("entries", [])
        if shard.get("schema_version") != 2 or len(entries) != 1:
            fail("issue #156 index must be one v2 shard")
        entry = entries[0]
        if entry.get("issue") != 156:
            fail("issue #156 index locator drift")
        if entry.get("review_status") != candidate.get("review_status"):
            fail("candidate/index review status drift")

    print(
        "ok: R5 control preserved; R6-capability quartet remains hypothesis; "
        "M4 AST has no locus/scope/binding dispatcher; M1/M2/M3 sensitivity retained; RFC-0002 unchanged"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
