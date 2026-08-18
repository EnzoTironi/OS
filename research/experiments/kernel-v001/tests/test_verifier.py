from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

from jsonschema.exceptions import ValidationError

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(_ROOT / "scripts"))

import analyze_structure
from os_kernel.kernel import Kernel
from support import load_json, load_schema, validator
from verify import (
    evaluate_run,
    evidence_index,
    instrumented_run,
    lookup_evidence,
    raw_write_observation,
    validate_schema_document,
    validate_scenario_run,
)
from mutants import RawWriteBypassKernel


def _failed(comparison: dict) -> set[str]:
    return {item["property_id"] for item in comparison["property_results"] if not item["passed"]}


class VerifierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source_sha = "a" * 40
        self.structure = analyze_structure.analyze(self.source_sha)
        self.run = instrumented_run(Kernel, "ontology", self.source_sha)

    def test_input_schema_rejects_black_box_expectations(self) -> None:
        schema = load_schema("scenario-input.schema.json")
        payload = load_json(_ROOT / "fixtures" / "v001" / "scenario.json")
        validator(schema).validate(payload)
        payload["black_box_expectations"] = {"planned": 1}
        with self.assertRaises(ValidationError):
            validator(schema).validate(payload)

    def test_four_schemas_reject_invalid_documents(self) -> None:
        with self.assertRaises(ValidationError):
            validate_schema_document("scenario-run.schema.json", {"complete": "no"}, def_name="explanation")
        with self.assertRaises(ValidationError):
            validate_schema_document("scenario-run.schema.json", {"subject": "x"}, def_name="query")
        with self.assertRaises(ValidationError):
            validate_schema_document("comparison-output.schema.json", {"trusted_commit_path": 0}, def_name="structure_report")
        with self.assertRaises(ValidationError):
            validate_schema_document("comparison-output.schema.json", {"engines": "Kernel"}, def_name="mutant_matrix")
        validate_schema_document("scenario-run.schema.json", self.run["explanations"][0], def_name="explanation")
        validate_schema_document("scenario-run.schema.json", self.run["queries"][0], def_name="query")
        validate_schema_document("comparison-output.schema.json", self.structure, def_name="structure_report")

    def test_evaluate_run_accepts_only_run_and_structure(self) -> None:
        comparison = evaluate_run(self.run, self.structure)
        self.assertEqual(_failed(comparison), set())
        with self.assertRaises(TypeError):
            evaluate_run(self.run, self.structure, {"planned": 1})

    def test_tamper_planned_committed_and_temporal_values(self) -> None:
        planned = copy.deepcopy(self.run)
        planned["operation_receipts"][0]["planned_quantity"] = (
            planned["operation_receipts"][0]["planned_quantity"] + 1
        )
        self.assertIn("P6_STALE_APPROVAL_REVALIDATED", _failed(evaluate_run(planned, self.structure)))

        committed = copy.deepcopy(self.run)
        committed["operation_receipts"][0]["committed_quantity"] = (
            committed["operation_receipts"][0]["committed_quantity"] + 1
        )
        self.assertIn("P6_STALE_APPROVAL_REVALIDATED", _failed(evaluate_run(committed, self.structure)))

        known = copy.deepcopy(self.run)
        query = next(item for item in known["queries"] if item["type"] == "known-then")
        query["value"] = query["value"] + 1
        self.assertIn("P10_KNOWN_THEN_DIFFERS", _failed(evaluate_run(known, self.structure)))

        believed = copy.deepcopy(self.run)
        query = next(item for item in believed["queries"] if item["type"] == "now-believed-for-then")
        query["value"] = query["value"] + 1
        self.assertIn("P10_KNOWN_THEN_DIFFERS", _failed(evaluate_run(believed, self.structure)))

    def test_external_expectations_copy_cannot_feed_evaluator(self) -> None:
        expectations = {"planned": 1, "committed": 2, "known": 3, "believed": 4}
        first = evaluate_run(self.run, self.structure)
        expectations["planned"] = 99
        second = evaluate_run(self.run, self.structure)
        self.assertEqual(first["property_results"], second["property_results"])

    def test_evidence_refs_resolve_and_reject_bad_refs(self) -> None:
        comparison = evaluate_run(self.run, self.structure)
        index = evidence_index(self.run)
        for item in comparison["property_results"]:
            if not item["passed"]:
                continue
            for reference in item["evidence_refs"]:
                status, found = lookup_evidence(index, reference)
                self.assertEqual(status, "ok", reference)
                self.assertIsNotNone(found)
        missing = copy.deepcopy(self.run)
        missing["explanations"][0]["reference"] = "explanation:does-not-exist"
        # force EXPLANATION_COMPLETE to cite a missing ref by clearing the real reference registration
        broken = evaluate_run(missing, self.structure)
        self.assertIn("EXPLANATION_COMPLETE", _failed(broken))
        status, _ = lookup_evidence(index, "receipt:does-not-exist")
        self.assertEqual(status, "missing")
        status, _ = lookup_evidence(index, "claim:purchase-raw-1")
        self.assertEqual(status, "wrong-kind")
        claim_id = next(
            reference
            for item in comparison["property_results"]
            if item["passed"]
            for reference in item["evidence_refs"]
            if reference.startswith("claim:")
        )
        citing = {
            item["property_id"]
            for item in comparison["property_results"]
            if item["passed"] and claim_id in item["evidence_refs"]
        }
        ambiguous_run = copy.deepcopy(self.run)
        duplicate = next(
            item for item in ambiguous_run["records"]["claims"] if item["claim_id"] == claim_id
        )
        ambiguous_run["records"]["claims"].append(copy.deepcopy(duplicate))
        index = evidence_index(ambiguous_run)
        status, _ = lookup_evidence(index, claim_id)
        self.assertEqual(status, "ambiguous")
        failed = _failed(evaluate_run(ambiguous_run, self.structure))
        self.assertTrue(failed & citing)

    def test_raw_write_probe_changes_only_the_mutant(self) -> None:
        correct = raw_write_observation(Kernel)
        mutant = raw_write_observation(RawWriteBypassKernel)
        self.assertEqual(correct["operation"], "raw-write-absent")
        self.assertEqual(correct["before_digest"], correct["after_digest"])
        self.assertEqual(mutant["operation"], "raw-write-invoked")
        self.assertNotEqual(mutant["before_digest"], mutant["after_digest"])

    def test_source_sha_and_trusted_path(self) -> None:
        validate_scenario_run(self.run)
        self.assertEqual(self.run["source_sha"], self.source_sha)
        self.assertEqual(self.structure["source_sha"], self.source_sha)
        names = {item.get("symbol") for item in self.structure["trusted_commit_path"]["findings"]}
        self.assertIn("Kernel.apply", names)
        self.assertIn("Kernel._commit", names)
        self.assertIn("commit_operation", names)
        self.assertIn("_commit_body", names)
        self.assertIn("Store._begin", names)
        self.assertIn("Store._commit", names)
        self.assertIn("Store._rollback", names)
        self.assertIn("evaluate", names)
        for item in self.structure["trusted_commit_path"]["findings"]:
            self.assertGreater(item.get("nonblank_lines", 0), 0)
            self.assertNotIn("missing", item)
        for key in (
            "domain_branches",
            "duplicated_rule_groups",
            "escape_hatches",
            "caller_contract",
            "trusted_commit_path",
        ):
            metric = self.structure[key]
            self.assertTrue(metric["scan_scope"])
            self.assertTrue(metric["rule"])
            self.assertIn("findings", metric)
        self.assertTrue(self.structure["unsupported"])
        self.assertNotEqual(self.structure["unsupported"], {})

    def test_analyzer_does_not_publish_false_zero(self) -> None:
        raw = json.dumps(self.structure)
        self.assertNotIn('"unsupported": {}', raw)
        self.assertNotIn('"domain_branches": []', raw)
        self.assertNotIn('"trusted_commit_path": []', raw)
