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
CONTEXT_MODEL = HERE / "context_bound_model.py"
TESTS = HERE / "test_models.py"
CONTEXT_TESTS = HERE / "test_context_binding.py"
README = HERE / "README.md"
MODELS = HERE / "models.md"
LAWS = HERE / "candidate-laws.md"
INDEX = ROOT / "research" / "index" / "issue-0156-rulebinding-reduction.json"
RFC2 = ROOT / "rfcs" / "0002-executable-metamodel-hypothesis-v1.md"
LAW_RE = re.compile(r"^## (L-RB-\d{2})\b", re.MULTILINE)


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


def no_module_level_tests(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    undiscoverable = re.findall(r"^def (test_[A-Za-z0-9_]+)\(", text, re.MULTILINE)
    if undiscoverable:
        fail(f"unittest would skip module-level tests in {path.name}: {undiscoverable}")


def main() -> int:
    for path in [CANDIDATE, MODEL, CONTEXT_MODEL, TESTS, CONTEXT_TESTS, README, MODELS, LAWS, RFC2]:
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
    context_source = CONTEXT_MODEL.read_text(encoding="utf-8")
    if "class RuleBinding" in source + context_source:
        fail("candidate reintroduced RuleBinding class")
    if "class CapabilityType" in source + context_source:
        fail("M4 replaced RuleBinding with a dedicated CapabilityType semantic class")
    if "class RefinedTypeEngine" not in source or "class TypeDef" not in source or "class RefinedValue" not in source:
        fail("M4 generic refined Type model disappeared")
    if "class ContextBoundEngine" not in context_source or "class ContextBoundValue" not in context_source:
        fail("context-bound hardening disappeared")

    marker = "# Weaker/alternative competitors"
    if marker not in source:
        fail("cannot isolate M4 candidate region")
    m4 = source.split(marker, 1)[0] + "\n" + context_source
    ids = {name.lower() for name in semantic_identifiers(m4)}
    forbidden_ids = {
        "rulebinding",
        "capabilitytype",
        "capability_types",
        "scope_kind",
        "bindings_for",
        "_bindings_for",
        "_enforce",
        "locus",
    }
    leaked = forbidden_ids.intersection(ids)
    if leaked:
        fail(f"M4 candidate recreated a semantic/binding species as code identifiers: {sorted(leaked)}")

    for required in [
        "TypeDef",
        "RefinedValue",
        "OperationSignature",
        "construct(",
        "_verify_signature",
        "authoritative_commit",
        "ComputationMutation",
        "ContextBoundValue",
        "semantic_context_digest",
        "ContextMismatch",
        "ForgedProof",
        "_seal(",
    ]:
        if required not in m4:
            fail(f"M4 lost required refined-Type/context-bound mechanism: {required}")

    tests = TESTS.read_text(encoding="utf-8")
    context_tests = CONTEXT_TESTS.read_text(encoding="utf-8")
    for mutant in ["DefinitionGraphDispatcher", "InlineContractEngine", "ExecutableRelationDispatcher"]:
        if mutant not in tests:
            fail(f"sensitivity competitor missing: {mutant}")
    for pressure in [
        "test_same_refinement_mechanism_validates_non_capability_business_value",
        "test_ordinary_refined_value_cannot_be_used_as_operation_authority",
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
    for pressure in [
        "test_valid_proofs_commit_exact_context",
        "test_post_state_proof_cannot_be_reused_for_different_proposed_state",
        "test_authorization_proof_cannot_be_reused_for_changed_inputs",
        "test_proof_payload_cannot_be_forged_without_runtime_seal",
        "test_context_bound_proof_is_still_invalidated_by_current_revision_change",
    ]:
        if pressure not in context_tests:
            fail(f"required context-binding regression missing: {pressure}")

    no_module_level_tests(TESTS)
    no_module_level_tests(CONTEXT_TESTS)

    laws = LAW_RE.findall(LAWS.read_text(encoding="utf-8"))
    expected_laws = [f"L-RB-{i:02d}" for i in range(1, 21)]
    if laws != expected_laws:
        fail(f"expected contiguous L-RB-01..20, got {laws}")

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
        "ok: R5 control preserved; R6 quartet remains hypothesis; generic Type refinements cover value+capability; "
        "proofs are exact-context-bound/unforgeable; M4 AST has no locus/scope/binding/CapabilityType dispatcher; "
        "M1/M2/M3 sensitivity retained; RFC-0002 unchanged"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
