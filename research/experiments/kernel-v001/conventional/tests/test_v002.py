from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

HERE = Path(__file__).resolve().parents[1]
EXPERIMENT = HERE.parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import analyze
import evaluate_v002
from harness import load_v002, remap_strings, run_document, run_v002
from services.canonical import dumps_pretty
from services.engine import ConventionalEngine
from services.errors import InputError
from services.quality import QUALITY_ACTIONS, QUALITY_APPROVAL_PREDICATE, QUARANTINE_ACTION, RELEASE_ACTION

SCHEMA = json.loads((EXPERIMENT / "schemas" / "scenario-run.schema.json").read_text(encoding="utf-8"))
ONTOLOGY_OS = EXPERIMENT / "os"
FIXTURE_IDS = (
    "lot:lot-q-1",
    "claim:sensor-in-spec",
    "claim:inspector-out-of-spec",
    "claim:calibration-correction",
    "effect:move-lot-1",
    "effect:release-lot-1",
)
DOMAIN_TOKENS = (RELEASE_ACTION, QUARANTINE_ACTION, QUALITY_APPROVAL_PREDICATE)


def remap_including_keys(value: Any, mapping: dict[str, str]) -> Any:
    if isinstance(value, str):
        return remap_strings(value, mapping)
    if isinstance(value, list):
        return [remap_including_keys(item, mapping) for item in value]
    if isinstance(value, dict):
        remapped = {}
        for key, item in value.items():
            new_key = remap_strings(key, mapping) if isinstance(key, str) else key
            remapped[new_key] = remap_including_keys(item, mapping)
        return remapped
    return value


def _failed(run: dict) -> list[str]:
    comparison = evaluate_v002.evaluate_run(run)
    return [item["property_id"] for item in comparison["property_results"] if not item["passed"]]


def _insert_bool_claim(scenario: dict[str, Any], *, claim_id: str, predicate: str, value: bool = True) -> dict[str, Any]:
    claim = {
        "type": "RecordClaim",
        "command_id": "extra-approval",
        "clock_time": "2030-08-10T09:45:00Z",
        "claim_id": claim_id,
        "subject_ref": "lot:lot-q-1",
        "predicate_ref": predicate,
        "value": value,
        "valid_time": {"instant": "2030-08-10"},
        "provenance": {
            "source_id": "source:qms",
            "source_locator": "qms://approval",
            "capture_id": "cap:qa",
            "capture_revision": "qa-1",
            "actor_id": "actor:ingest",
            "workload_id": "workload:ingest-1",
        },
    }
    commands = list(scenario["commands"])
    index = next(i for i, item in enumerate(commands) if item.get("command_id") == "propose-release")
    commands.insert(index, claim)
    scenario["commands"] = commands
    return scenario


class V002ConventionalTests(unittest.TestCase):
    def test_nominal_run_matches_acceptance_values(self) -> None:
        run = run_v002()
        Draft202012Validator(SCHEMA, format_checker=Draft202012Validator.FORMAT_CHECKER).validate(run)
        self.assertEqual(run["engine"], "conventional")
        self.assertEqual(run["scenario_id"], "v002")
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"]["outcome"], "denied")
        self.assertEqual(cmds["commit-quarantine"]["outcome"], "committed")
        self.assertEqual(cmds["replay-quarantine"]["outcome"], "replayed")
        self.assertEqual(cmds["move-timeout"]["outcome"], "unknown")
        self.assertEqual(cmds["move-retry"]["outcome"], "unsafe_retry")
        self.assertEqual(cmds["reconcile-move"]["outcome"], "confirmed")
        self.assertEqual(run["records"]["occurrences"], [])
        self.assertEqual(len(run["records"]["effect_requests"]), 1)
        self.assertEqual(run["records"]["effect_requests"][0]["parent_operation_id"], "quarantine-lot-1")
        self.assertEqual(run["records"]["reconciliations"][0]["resulting_knowledge"], "confirmed")
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["value"], 23)
        self.assertEqual(believed["value"], 21.4)
        self.assertNotIn("claim:calibration-correction", {item["claim_id"] for item in known["contributors"]})
        self.assertIn("claim:calibration-correction", {item["claim_id"] for item in believed["contributors"]})
        explanation = run["explanations"][0]
        self.assertTrue(explanation["complete"])
        self.assertEqual(explanation["gaps"], [])
        self.assertEqual(_failed(run), [])

    def test_two_runs_are_byte_identical(self) -> None:
        self.assertEqual(dumps_pretty(run_v002()), dumps_pretty(run_v002()))

    def test_shared_evaluator_accepts_both_engines(self) -> None:
        conventional = run_v002()
        proc = subprocess.run(
            [str(ONTOLOGY_OS), "scenario", "run", "v002", "--output", "json"],
            cwd=EXPERIMENT,
            check=True,
            capture_output=True,
            text=True,
        )
        ontology = json.loads(proc.stdout)
        self.assertEqual(conventional["engine"], "conventional")
        self.assertEqual(ontology["engine"], "ontology")
        self.assertEqual(_failed(conventional), [])
        self.assertEqual(_failed(ontology), [])
        conv = evaluate_v002.evaluate_run(conventional)
        onto = evaluate_v002.evaluate_run(ontology)
        self.assertEqual(
            [item["property_id"] for item in conv["property_results"]],
            [item["property_id"] for item in onto["property_results"]],
        )
        self.assertTrue(all(item["passed"] for item in conv["property_results"]))
        self.assertTrue(all(item["passed"] for item in onto["property_results"]))

    def test_entity_operation_effect_date_remap_keeps_properties(self) -> None:
        mapping = {
            "v002": "harbor",
            "lot:lot-q-1": "lot:lot-q",
            "product:widget-q": "product:widget-z",
            "party:plant-a": "party:yard-1",
            "party:lab-b": "party:lab-z",
            "release-lot-1": "free-lot-9",
            "quarantine-lot-1": "hold-lot-9",
            "effect:move-lot-1": "effect:barge-22",
            "claim:sensor-in-spec": "claim:probe-inside",
            "claim:inspector-out-of-spec": "claim:human-outside",
            "claim:calibration-correction": "claim:offset-late",
            "kr:before-late-calibration": "kr:before-late-offset",
            "2030-08-10": "2031-02-11",
            "2030-08-11": "2031-02-12",
            "2030-08-12": "2031-02-13",
        }
        remapped = remap_including_keys(load_v002(), mapping)
        run = run_document(remapped)
        self.assertEqual(run["scenario_id"], "harbor")
        cmds = {item["command_id"]: item["outcome"] for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"], "denied")
        self.assertEqual(cmds["commit-quarantine"], "committed")
        self.assertEqual(cmds["replay-quarantine"], "replayed")
        self.assertEqual(run["records"]["effect_requests"][0]["request_id"], "effect:barge-22")
        self.assertEqual(run["records"]["effect_requests"][0]["parent_operation_id"], "hold-lot-9")
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["subject"], "lot:lot-q")
        self.assertEqual(known["valid_at"], "2031-02-11")
        self.assertEqual(known["value"], 23)
        self.assertEqual(believed["value"], 21.4)
        blob = json.dumps(run)
        self.assertNotIn("lot:lot-q-1", blob)
        self.assertNotIn("effect:move-lot-1", blob)
        self.assertNotIn("quarantine-lot-1", blob)
        self.assertIn(RELEASE_ACTION, blob)
        self.assertIn(QUARANTINE_ACTION, blob)
        self.assertEqual(_failed(run), [])

    def test_action_id_remap_fails_as_domain_coupling(self) -> None:
        mapping = {
            RELEASE_ACTION: "action.free-lot",
            QUARANTINE_ACTION: "action.hold-lot",
        }
        remapped = remap_including_keys(load_v002(), mapping)
        with self.assertRaises(InputError) as ctx:
            run_document(remapped)
        self.assertEqual(ctx.exception.code, "unknown_quality_action")
        self.assertIn(RELEASE_ACTION, ctx.exception.message)
        self.assertIn(QUARANTINE_ACTION, ctx.exception.message)

    def test_quality_approval_predicate_remap_does_not_release(self) -> None:
        scenario = _insert_bool_claim(
            load_v002(),
            claim_id="claim:quality-ok",
            predicate=QUALITY_APPROVAL_PREDICATE,
        )
        remapped = remap_including_keys(scenario, {QUALITY_APPROVAL_PREDICATE: "quality-ok"})
        run = run_document(remapped)
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"]["outcome"], "denied")
        self.assertEqual(cmds["commit-release"]["details"]["rule"], "quality-approval-required")

    def test_true_claim_without_quality_approval_still_denies(self) -> None:
        scenario = _insert_bool_claim(load_v002(), claim_id="claim:lot-cleared", predicate="lot-cleared")
        run = run_document(scenario)
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"]["outcome"], "denied")
        self.assertEqual(cmds["commit-release"]["details"]["rule"], "quality-approval-required")

    def test_quality_approval_predicate_permits_release(self) -> None:
        scenario = _insert_bool_claim(
            load_v002(),
            claim_id="claim:quality-ok",
            predicate=QUALITY_APPROVAL_PREDICATE,
        )
        run = run_document(scenario)
        cmds = {item["command_id"]: item["outcome"] for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"], "committed")
        self.assertEqual(cmds["commit-quarantine"], "committed")

    def test_measurement_variation_changes_derived_values(self) -> None:
        baseline = run_v002()
        scenario = load_v002()
        for command in scenario["commands"]:
            if command.get("command_id") == "sensor-in-spec":
                command["value"] = command["value"] + 0.5
            if command.get("command_id") == "inspector-out-of-spec":
                command["value"] = command["value"] - 1.0
            if command.get("command_id") == "claim-calibration":
                command["value"] = command["value"] - 0.4
        varied = run_document(scenario)
        known_base = next(item for item in baseline["queries"] if item["type"] == "known-then")
        known_var = next(item for item in varied["queries"] if item["type"] == "known-then")
        believed_var = next(item for item in varied["queries"] if item["type"] == "now-believed-for-then")
        self.assertNotEqual(known_base["value"], known_var["value"])
        self.assertNotEqual(known_var["value"], believed_var["value"])
        self.assertEqual(known_var["value"], sum(item["value"] for item in known_var["contributors"]))
        self.assertEqual(believed_var["value"], sum(item["value"] for item in believed_var["contributors"]))
        self.assertEqual(_failed(varied), [])

    def test_removing_links_creates_explanation_gaps(self) -> None:
        engine = ConventionalEngine(load_v002())
        engine.run()
        table = engine.ledger._tables["causal_links"]
        drop = [
            key
            for key, link in table.items()
            if link["relation"] == "committed-as" and str(link["cause_ref"]).startswith("operation:")
        ]
        self.assertTrue(drop)
        for key in drop:
            del table[key]
        graph = engine.explain("v002:operation:quarantine-lot-1")
        self.assertFalse(graph["complete"])
        self.assertTrue(graph["gaps"])
        engine.ledger._tables["causal_links"].clear()
        empty = engine.explain("v002:operation:quarantine-lot-1")
        self.assertFalse(empty["complete"])
        self.assertTrue(empty["gaps"])
        self.assertEqual(empty["inputs"], {})

    def test_services_do_not_hardcode_fixture_outputs(self) -> None:
        forbidden = ("21.4", *FIXTURE_IDS)
        quality = (HERE / "services" / "quality.py").read_text(encoding="utf-8")
        for token in DOMAIN_TOKENS:
            self.assertIn(token, quality)
        self.assertEqual(set(QUALITY_ACTIONS), {RELEASE_ACTION, QUARANTINE_ACTION})
        for path in (HERE / "services").glob("*.py"):
            text = path.read_text(encoding="utf-8")
            for token in forbidden:
                self.assertNotIn(token, text, f"{path.name} contains {token}")
        self.assertNotIn("commit_counts", quality)
        self.assertNotIn("disposition_kind", quality)

    def test_analyzer_measures_quality_path(self) -> None:
        report = analyze.analyze("0" * 40)
        self.assertGreater(len(report["domain_branches"]["findings"]), 0)
        coupled = {item.get("text") for item in report["domain_coupling"]["findings"]}
        self.assertTrue(set(DOMAIN_TOKENS) <= coupled)
        self.assertTrue(all(item.get("locator") and item.get("line") for item in report["domain_coupling"]["findings"]))
        symbols = {item.get("symbol") for item in report["trusted_commit_path"]["findings"]}
        self.assertTrue(any(symbol and "QualityService.commit" in symbol for symbol in symbols))
        self.assertTrue(any(item.get("symbol") == "apply" or (item.get("symbol") or "").endswith(".apply") for item in report["caller_contract"]["findings"]))
        self.assertFalse(any(item.get("line") == 0 for item in report["trusted_commit_path"]["findings"]))
