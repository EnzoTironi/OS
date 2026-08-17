#!/usr/bin/env python3
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
README = HERE / "README.md"
MODELS = HERE / "models.py"
HARDENED = HERE / "hardened_relation.py"
HARDENING = HERE / "hardening.md"
HELPERS = HERE / "semantic_helpers.py"
SURFACES = HERE / "surface_generators.py"
TESTS = HERE / "test_models.py"
EXTENDED = HERE / "test_extended_cases.py"
HARDENING_TESTS = HERE / "test_hardening.py"
SURFACE_TESTS = HERE / "test_surfaces.py"
LAWS = HERE / "candidate-laws.md"
SCORECARD = HERE / "scorecard.md"
RENDER = HERE / "render_samples.py"
RFC2 = ROOT / "rfcs" / "0002-executable-metamodel-hypothesis-v1.md"

LAW_RE = re.compile(r"^## (L-REL-\d{2})\b", re.MULTILINE)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def norm(text: str) -> str:
    return text.lower().replace("**", "").replace("`", "")


def names_in_function(source: str, function_name: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name:
            return {
                child.id.lower() for child in ast.walk(node) if isinstance(child, ast.Name)
            } | {
                child.attr.lower() for child in ast.walk(node) if isinstance(child, ast.Attribute)
            }
    fail(f"missing function {function_name}")
    return set()


def semantic_names(source: str) -> set[str]:
    tree = ast.parse(source)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            names.add(node.name.lower())
        elif isinstance(node, ast.Name):
            names.add(node.id.lower())
        elif isinstance(node, ast.Attribute):
            names.add(node.attr.lower())
    return names


def no_module_level_tests(path: Path) -> None:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    bad = [node.name for node in tree.body if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")]
    if bad:
        fail(f"unittest discover would skip module-level tests in {path.name}: {bad}")


def main() -> int:
    for path in [
        README, MODELS, HARDENED, HARDENING, HELPERS, SURFACES, TESTS, EXTENDED,
        HARDENING_TESTS, SURFACE_TESTS, LAWS, SCORECARD, RENDER, RFC2,
    ]:
        if not path.exists():
            fail(f"missing {path.relative_to(ROOT)}")

    model_source = MODELS.read_text(encoding="utf-8")
    hardened_source = HARDENED.read_text(encoding="utf-8")
    surface_source = SURFACES.read_text(encoding="utf-8")
    lower = model_source.lower()

    for required in ["class relationdef", "class propertydef", "class linkdef", "class slotdef", "class predicatedef"]:
        if required not in lower:
            fail(f"competitor model missing: {required}")

    for fn in ["relation_surface", "query_path", "relation_statement_shape", "satisfies_shape", "migration_classification"]:
        names = names_in_function(model_source, fn)
        leaked = names.intersection({"propertydef", "linkdef", "slotdef"})
        if leaked:
            fail(f"unified canonical function {fn} leaked split semantic classes: {sorted(leaked)}")
    for fn in ["sdk_member", "mutation_tool", "ui_affordance", "query_result_type"]:
        names = names_in_function(surface_source, fn)
        leaked = names.intersection({"propertydef", "linkdef", "slotdef"})
        if leaked:
            fail(f"unified surface generator {fn} leaked split semantic classes: {sorted(leaked)}")

    physical_names = names_in_function(model_source, "relation_physical_lowering")
    if physical_names.intersection({"propertydef", "linkdef", "slotdef"}):
        fail("physical lowering recreated Property/Link class dispatch")
    if "targetkind" not in physical_names:
        fail("physical lowering no longer demonstrates endpoint-type specialization")

    hardened_names = semantic_names(hardened_source)
    leaked = hardened_names.intersection({"propertydef", "linkdef", "slotdef"})
    if leaked:
        fail(f"Relation hardening recreated split semantic classes: {sorted(leaked)}")
    for required in [
        "collectionsemantics", "binaryrelationcontract", "relationassertion",
        "relationcorrection", "inverse_sdk_type", "collection_sdk_type",
    ]:
        if required not in hardened_names:
            fail(f"post-green Relation hardening disappeared: {required}")

    laws = LAW_RE.findall(LAWS.read_text(encoding="utf-8"))
    expected = [f"L-REL-{i:02d}" for i in range(1, 22)]
    if laws != expected:
        fail(f"expected contiguous L-REL-01..21, got {laws}")

    for path in [TESTS, EXTENDED, HARDENING_TESTS, SURFACE_TESTS]:
        no_module_level_tests(path)

    test_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in [TESTS, EXTENDED, HARDENING_TESTS, SURFACE_TESTS]
    )
    required_tests = [
        "test_required_optional_and_multi_scalar_signatures",
        "test_absence_unknown_and_not_applicable_are_not_collapsed",
        "test_entity_relations_generate_entity_signatures_without_link_kind",
        "test_inverse_navigation_is_relation_metadata",
        "test_ordered_relation_changes_container_not_relation_species",
        "test_nary_relation_is_same_relation_form",
        "test_lifecycle_relationship_is_identifiable_type_plus_relations",
        "test_shape_contract_can_require_scalar_and_entity_relation_capabilities",
        "test_temporal_and_provenance_annotations_apply_to_value_relation",
        "test_unified_and_split_models_generate_same_binary_sdk_shapes",
        "test_scalar_to_entity_is_identity_semantics_change",
        "test_one_to_one_is_relation_cardinality_plus_inverse_constraint",
        "test_many_to_many_is_same_relation_form",
        "test_identifiable_relationship_can_be_action_target",
        "test_many_to_one_collapse_requires_data_evidence",
        "test_scalar_and_entity_tools_share_one_generator",
        "test_canonical_generators_do_not_dispatch_on_property_or_link_classes",
        "test_many_to_one_forward_can_have_one_to_many_inverse",
        "test_set_list_and_bag_have_distinct_semantics",
        "test_collection_semantics_apply_to_entity_targets_too",
        "test_scalar_and_entity_assertions_share_one_envelope",
        "test_correction_uses_new_assertion_identity_instead_of_rewriting_old",
        "test_hardening_module_does_not_dispatch_property_link_species",
    ]
    for name in required_tests:
        if name not in test_text:
            fail(f"required issue #158 regression missing: {name}")

    readme = norm(README.read_text(encoding="utf-8"))
    for phrase in [
        "architecture decision: none",
        "authoring vocabulary",
        "canonical semantic ir",
        "physical lowering",
        "property vs link",
        "hidden interpreter branches",
        "passing this experiment",
    ]:
        if phrase not in readme:
            fail(f"README lost semantic boundary: {phrase}")

    hardening = norm(HARDENING.read_text(encoding="utf-8"))
    for phrase in [
        "forward cardinality does not determine inverse cardinality",
        "collection semantics",
        "relationassertion",
        "not a decision that fact is a metamodel primitive",
        "scalar-to-entity migration",
        "n-ary uniqueness constraints",
    ]:
        if phrase not in hardening:
            fail(f"hardening history lost adversarial boundary: {phrase}")

    score = norm(SCORECARD.read_text(encoding="utf-8"))
    for phrase in [
        "a unified relation",
        "b property + link",
        "c slot + link",
        "d tuple/predicate ir",
        "provisional",
        "not architecture votes",
    ]:
        if phrase not in score:
            fail(f"scorecard lost competitor/epistemic boundary: {phrase}")

    rfc = norm(RFC2.read_text(encoding="utf-8"))
    if "status: hypothesis" not in rfc or "decision: none" not in rfc:
        fail("RFC-0002 was promoted during #158")
    if "r6 accepted" in rfc:
        fail("R6 was accepted automatically from Relation experiment")

    print(
        "ok: issue #158 has four executable IR competitors, 21 candidate laws, "
        "inverse/collection/assertion hardening, required semantic/tooling/migration cases "
        "and no Property/Link dispatch in unified canonical generators"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
