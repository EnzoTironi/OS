#!/usr/bin/env python3
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MODEL = HERE / "reference_model.py"
ATOMIC_MODEL = HERE / "atomic_model.py"
COMPETITORS = HERE / "competitors.py"
TESTS = HERE / "test_model.py"
ATOMIC_TESTS = HERE / "test_atomic_hardening.py"
PRIVACY_TESTS = HERE / "test_privacy_policy.py"
COMPETITOR_TESTS = HERE / "test_competitors.py"
README = HERE / "README.md"
LAWS = HERE / "candidate-laws.md"
SCENARIOS = HERE / "scenarios.md"
PATHS = HERE / "write-paths.md"
INDEX = ROOT / "research" / "index" / "issue-0157-occurrence-no-bypass.json"
RFC2 = ROOT / "rfcs" / "0002-executable-metamodel-hypothesis-v1.md"

LAW_RE = re.compile(r"^## (L-OCC-\d{2})\b", re.MULTILINE)
SCENARIO_RE = re.compile(r"\*\*(S-OCC-\d{2})\*\*", re.MULTILINE)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def no_module_tests(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    names = re.findall(r"^def (test_[A-Za-z0-9_]+)\(", text, re.MULTILINE)
    if names:
        fail(f"unittest would skip module-level tests in {path.name}: {names}")


def class_source(source: str, class_name: str) -> str:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return ast.get_source_segment(source, node) or ""
    fail(f"missing class {class_name}")
    return ""


def semantic_identifiers(source: str) -> set[str]:
    tree = ast.parse(source)
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            out.add(node.name.lower())
        elif isinstance(node, ast.Name):
            out.add(node.id.lower())
        elif isinstance(node, ast.Attribute):
            out.add(node.attr.lower())
        elif isinstance(node, ast.arg):
            out.add(node.arg.lower())
    return out


def main() -> int:
    for path in [
        MODEL, ATOMIC_MODEL, COMPETITORS, TESTS, ATOMIC_TESTS, PRIVACY_TESTS,
        COMPETITOR_TESTS, README, LAWS, SCENARIOS, PATHS, INDEX, RFC2,
    ]:
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}")

    model = MODEL.read_text(encoding="utf-8")
    atomic_model = ATOMIC_MODEL.read_text(encoding="utf-8")
    semantic_store = class_source(model, "SemanticStore")
    atomic_store = class_source(atomic_model, "AtomicSemanticStore")
    identifiers = semantic_identifiers(semantic_store + "\n" + atomic_store)
    forbidden = {"event", "eventtype", "occurrence", "occurrencetype", "is_event", "is_occurrence"}
    leaked = identifiers.intersection(forbidden)
    if leaked:
        fail(f"generic candidate recreated Event/Occurrence interpreter identifiers: {sorted(leaked)}")
    for required in [
        "sealed_semantics", "replace_semantic_core", "redact_payload", "append_correction",
        "migrate_representation", "rebuild_projection", "issue_proof", "_verify_proof",
    ]:
        if required not in semantic_store:
            fail(f"generic lifecycle mechanism disappeared: {required}")
    for required in [
        "AtomicSemanticStore", "_atomic_authority_operation", "attach_evidence",
        "semantic_record_fingerprint", "set_privacy_policy", "privacy_policy_revision",
    ]:
        if required not in atomic_model:
            fail(f"post-green atomic/provenance/privacy hardening disappeared: {required}")
    if "record.type_name in" in semantic_store + atomic_store:
        fail("generic candidate branches on concrete Type names")

    tests = TESTS.read_text(encoding="utf-8")
    atomic_tests = ATOMIC_TESTS.read_text(encoding="utf-8")
    privacy_tests = PRIVACY_TESTS.read_text(encoding="utf-8")
    competitor_tests = COMPETITOR_TESTS.read_text(encoding="utf-8")
    required_tests = [
        "test_every_authoritative_write_path_cannot_replace_committed_semantic_core",
        "test_same_contract_protects_non_event_published_definition",
        "test_wrong_occurrence_is_corrected_by_append_not_rewrite",
        "test_redaction_removes_designated_payload_without_rewriting_semantic_core",
        "test_migration_cannot_hide_semantic_change_as_representation_rewrite",
        "test_type_revision_change_does_not_reinterpret_existing_record",
        "test_projection_rebuild_does_not_create_business_occurrence",
        "test_source_replay_same_semantics_does_not_create_second_occurrence",
        "test_source_replay_conflict_never_overwrites_accepted_occurrence",
        "test_unsafe_admin_mutant_reproduces_bypass",
        "test_unsafe_replay_mutant_reproduces_history_rewrite",
        "test_native_event_competitor_blocks_occurrence_but_not_generic_non_event_record",
    ]
    for name in required_tests:
        if name not in tests:
            fail(f"required no-bypass regression missing: {name}")
    for name in [
        "test_failed_conflicting_create_does_not_consume_operation_id",
        "test_failed_correction_does_not_consume_operation_id",
        "test_new_source_evidence_uses_explicit_envelope_operation",
        "test_evidence_attachment_is_idempotent_and_mismatch_safe",
    ]:
        if name not in atomic_tests:
            fail(f"required post-green atomic/provenance regression missing: {name}")
    for name in [
        "test_current_policy_can_make_old_payload_field_erasable_without_reinterpreting_record",
        "test_historical_type_default_does_not_override_current_privacy_policy",
        "test_proof_bound_to_old_privacy_revision_does_not_survive_policy_revision_change",
    ]:
        if name not in privacy_tests:
            fail(f"required current-privacy-policy regression missing: {name}")
    for name in [
        "test_physical_append_only_prevents_payload_erasure",
        "test_physical_append_only_prevents_representation_migration",
    ]:
        if name not in competitor_tests:
            fail(f"append-only competitor sensitivity missing: {name}")
    for path in [TESTS, ATOMIC_TESTS, PRIVACY_TESTS, COMPETITOR_TESTS]:
        no_module_tests(path)

    laws = LAW_RE.findall(LAWS.read_text(encoding="utf-8"))
    expected_laws = [f"L-OCC-{i:02d}" for i in range(1, 21)]
    if laws != expected_laws:
        fail(f"expected contiguous L-OCC-01..20, got {laws}")
    scenarios = SCENARIO_RE.findall(SCENARIOS.read_text(encoding="utf-8"))
    expected_scenarios = [f"S-OCC-{i:02d}" for i in range(1, 51)]
    if scenarios != expected_scenarios:
        fail(f"expected contiguous S-OCC-01..50, got {scenarios}")

    text = (README.read_text(encoding="utf-8") + "\n" + PATHS.read_text(encoding="utf-8")).lower()
    text = text.replace("**", "").replace("`", "")
    for phrase in [
        "action != occurrence",
        "sealed_semantics",
        "publisheddefinition",
        "privacy",
        "representation migration",
        "projection rebuild",
        "restore/replay",
        "architecture decision: none",
        "passing #157 does not make event",
    ]:
        if phrase not in text:
            fail(f"research lost lifecycle/epistemic boundary: {phrase}")

    shard = json.loads(INDEX.read_text(encoding="utf-8"))
    entries = shard.get("entries", [])
    if shard.get("schema_version") != 2 or shard.get("kind") != "shard" or len(entries) != 1:
        fail("issue #157 index must be one v2 shard")
    entry = entries[0]
    if entry.get("issue") != 157 or entry.get("artifact") != "research/kill/occurrence-no-bypass/README.md":
        fail("issue #157 index locator drift")
    if entry.get("review_status") not in {"unreviewed", "review-clean"}:
        fail("invalid issue #157 review status")
    indexed_laws = sorted(
        record["ref"].split("#")[-1]
        for record in entry.get("records", [])
        if "#L-OCC-" in record.get("ref", "")
    )
    if indexed_laws != sorted(laws):
        fail("issue #157 candidate-law index drift")

    rfc = RFC2.read_text(encoding="utf-8").lower().replace("`", "")
    if "status: hypothesis" not in rfc or "decision: none" not in rfc:
        fail("RFC-0002 was promoted during Event kill test")
    if "r6-capability accepted" in rfc:
        fail("R6 was accepted from #157 automatically")

    print(
        "ok: generic sealed-semantic Type candidate + atomic authority/provenance/current-privacy hardening have no Event/Occurrence interpreter; "
        f"20 laws, 50 scenarios and required regressions/competitors present; review={entry.get('review_status')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
