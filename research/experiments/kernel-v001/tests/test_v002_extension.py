from __future__ import annotations

import ast
import io
import json
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
_REPO = _ROOT.parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.canonical import canonical_dumps
from os_kernel.cli import main
from os_kernel.kernel import Kernel
from os_kernel.scenario import run_scenario, scenario_run_document

PARENT_SHA = "a6d03ea92b3966d9a2fdc333bc15f29583868fef"
CHANGED_FILES = (
    "research/experiments/kernel-v001/fixtures/v002/definitions.json",
    "research/experiments/kernel-v001/fixtures/v002/scenario.json",
    "research/experiments/kernel-v001/tests/test_v002_extension.py",
)
NONBLANK_LINES = 883
V002_IDS = (
    "lot:lot-q-1",
    "product:widget-q",
    "party:plant-a",
    "party:lab-b",
    "action.release-lot",
    "action.quarantine-lot",
    "effect.move-lot",
    "effect.release-lot",
    "quality-approval",
    "claim:sensor-in-spec",
    "claim:inspector-out-of-spec",
    "claim:calibration-correction",
    "claim:lot-released",
    "claim:lot-quarantined",
    "effect:move-lot-1",
    "effect:release-lot-1",
    "v002:operation:quarantine-lot-1",
    "defrev:v002-r1",
    "kr:before-late-calibration",
)


def _nonblank_lines(path: Path) -> int:
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def _v002_run() -> dict:
    return scenario_run_document("v002", "ontology")


def _cli(argv: list[str]) -> tuple[int, str, str]:
    out = io.StringIO()
    err = io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = main(argv)
    return code, out.getvalue(), err.getvalue()


class V002ExtensionTests(unittest.TestCase):
    def test_records_exact_changed_files_and_nonblank_lines(self) -> None:
        recorded = list(CHANGED_FILES)
        nonblank = {rel: _nonblank_lines(_REPO / rel) for rel in recorded}
        self.assertEqual(
            recorded,
            [
                "research/experiments/kernel-v001/fixtures/v002/definitions.json",
                "research/experiments/kernel-v001/fixtures/v002/scenario.json",
                "research/experiments/kernel-v001/tests/test_v002_extension.py",
            ],
        )
        self.assertEqual(sum(nonblank.values()), NONBLANK_LINES)
        proc = subprocess.run(
            ["git", "diff", "--name-only", PARENT_SHA],
            cwd=_REPO,
            check=True,
            capture_output=True,
            text=True,
        )
        tracked = [line for line in proc.stdout.splitlines() if line]
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=_REPO,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()
        present = [rel for rel in CHANGED_FILES if (_REPO / rel).is_file()]
        self.assertEqual(present, list(CHANGED_FILES))
        extra = [path for path in tracked + untracked if path.startswith("research/experiments/kernel-v001/") and path not in CHANGED_FILES]
        self.assertEqual(extra, [])
        kernel_hits = [rel for rel in tracked if rel.startswith("research/experiments/kernel-v001/os_kernel/")]
        self.assertEqual(kernel_hits, [])
        print(f"files_changed={recorded}")
        print(f"nonblank_lines={sum(nonblank.values())}")
        print(f"nonblank_by_file={nonblank}")

    def test_cli_runs_v002_without_cli_change(self) -> None:
        code, out, err = _cli(["scenario", "run", "v002", "--output", "json"])
        self.assertEqual(code, 0, err)
        first = json.loads(out)
        self.assertEqual(first["scenario_id"], "v002")
        self.assertEqual(first["engine"], "ontology")
        code, second, err = _cli(["scenario", "run", "v002", "--output", "json"])
        self.assertEqual(code, 0, err)
        self.assertEqual(out, second)

    def test_two_public_runs_are_byte_identical(self) -> None:
        first = canonical_dumps(_v002_run())
        second = canonical_dumps(_v002_run())
        self.assertEqual(first, second)
        json.loads(first)

    def test_rival_claims_survive_with_provenance(self) -> None:
        run = _v002_run()
        measured = [
            item
            for item in run["records"]["claims"]
            if item["subject_ref"] == "lot:lot-q-1" and item["predicate_ref"] == "measurement"
        ]
        sources = {item["provenance"]["source_id"] for item in measured}
        ids = {item["claim_id"] for item in measured}
        self.assertIn("claim:sensor-in-spec", ids)
        self.assertIn("claim:inspector-out-of-spec", ids)
        self.assertIn("source:sensor", sources)
        self.assertIn("source:inspector", sources)
        sensor = next(item for item in measured if item["claim_id"] == "claim:sensor-in-spec")
        inspector = next(item for item in measured if item["claim_id"] == "claim:inspector-out-of-spec")
        self.assertEqual(sensor["value"], 10.2)
        self.assertEqual(inspector["value"], 12.8)
        self.assertNotEqual(sensor["value"], inspector["value"])
        identities = {item["identity_id"] for item in run["records"]["contextual_identities"]}
        self.assertIn("identity:lot-q-1-of-widget", identities)
        self.assertIn("identity:lab-b-inspector", identities)

    def test_release_without_quality_approval_is_denied(self) -> None:
        run = _v002_run()
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-release"]["outcome"], "denied")
        self.assertEqual(cmds["commit-release"]["details"]["rule"], "rule.release-requires-quality-approval")
        self.assertEqual(run["records"]["occurrences"], [])
        self.assertFalse(any(item["claim_id"] == "claim:lot-released" for item in run["records"]["claims"]))
        self.assertFalse(any(item["request_id"] == "effect:release-lot-1" for item in run["records"]["effect_requests"]))
        approvals = {item["predicate_ref"] for item in run["records"]["claims"]}
        self.assertNotIn("quality-approval", approvals)

    def test_quarantine_commits_and_replay_is_idempotent(self) -> None:
        run = _v002_run()
        cmds = {item["command_id"]: item for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-quarantine"]["outcome"], "committed")
        self.assertEqual(cmds["replay-quarantine"]["outcome"], "replayed")
        self.assertEqual(cmds["move-timeout"]["outcome"], "unknown")
        self.assertEqual(cmds["move-retry"]["outcome"], "unsafe_retry")
        self.assertEqual(cmds["reconcile-move"]["outcome"], "confirmed")
        self.assertEqual(run["records"]["reconciliations"][0]["resulting_knowledge"], "confirmed")
        self.assertEqual(run["records"]["effect_attempts"][0]["outcome"], "sent_no_response")
        self.assertEqual(len(run["records"]["effect_requests"]), 1)
        self.assertEqual(run["records"]["effect_requests"][0]["request_id"], "effect:move-lot-1")
        self.assertEqual(run["records"]["effect_requests"][0]["parent_operation_id"], "quarantine-lot-1")
        receipts = [item for item in run["operation_receipts"] if item["operation_id"] == "quarantine-lot-1"]
        self.assertEqual(len(receipts), 1)

    def test_temporal_queries_exclude_late_calibration_from_known_then(self) -> None:
        run = _v002_run()
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        known_ids = {item["claim_id"] for item in known["contributors"]}
        believed_ids = {item["claim_id"] for item in believed["contributors"]}
        self.assertNotIn("claim:calibration-correction", known_ids)
        self.assertIn("claim:calibration-correction", believed_ids)
        self.assertIn("claim:sensor-in-spec", known_ids)
        self.assertIn("claim:inspector-out-of-spec", known_ids)
        self.assertNotEqual(known["value"], believed["value"])
        self.assertNotEqual(known["contributor_digest"], believed["contributor_digest"])
        self.assertNotEqual(known_ids, believed_ids)

    def test_quarantine_explanation_resolves_causal_records(self) -> None:
        kernel, _, _ = run_scenario("v002")
        graph = kernel.explain("v002:operation:quarantine-lot-1")
        for key in (
            "action_revision",
            "inputs",
            "actor_id",
            "represented_principal_id",
            "workload_id",
            "delegation_id",
            "proposal",
            "approval",
            "state_basis",
            "rule_decisions",
            "claims_consumed",
            "mutation_plan",
            "operation_receipt",
            "effect_requests",
            "effect_attempts",
            "reconciliation_records",
        ):
            self.assertTrue(graph.get(key), key)
        self.assertTrue(graph["complete"])
        self.assertEqual(list(graph["gaps"]), [])
        self.assertEqual(graph["actor_id"], "actor:planner-agent")
        self.assertEqual(graph["delegation_id"], "delegation:quarantine-lot-1")
        self.assertEqual(graph["represented_principal_id"], "party:plant-a")
        self.assertTrue(any(item["request_id"] == "effect:move-lot-1" for item in graph["effect_requests"]))
        self.assertTrue(any(item["attempt_id"] == "attempt:move-1" for item in graph["effect_attempts"]))
        self.assertTrue(any(item["reconciliation_id"] == "recon:move-1" for item in graph["reconciliation_records"]))
        self.assertIn("claim:sensor-in-spec", graph["claims_consumed"])
        self.assertIn("claim:inspector-out-of-spec", graph["claims_consumed"])
        self.assertTrue(any(item["outcome"] == "permit" for item in graph["rule_decisions"]))
        self.assertTrue(any(item["cause_ref"].startswith("operation:") for item in graph["causal_links"]))

    def test_uses_only_public_api_symbols(self) -> None:
        tree = ast.parse(Path(__file__).read_text(encoding="utf-8"), filename=str(Path(__file__)))
        imported: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module)
        self.assertIn("os_kernel.kernel", imported)
        self.assertIn("os_kernel.scenario", imported)
        self.assertIn("os_kernel.cli", imported)
        self.assertNotIn("verify", imported)
        self.assertNotIn("os_kernel.store", imported)
        self.assertNotIn("os_kernel.protocol", imported)
        self.assertTrue(hasattr(Kernel, "apply"))
        self.assertTrue(hasattr(Kernel, "query"))
        self.assertTrue(hasattr(Kernel, "explain"))
        self.assertTrue(callable(scenario_run_document))
        self.assertTrue(callable(run_scenario))

    def test_no_v002_ids_in_os_kernel(self) -> None:
        for path in sorted((_ROOT / "os_kernel").glob("*.py")):
            text = path.read_text(encoding="utf-8")
            for token in V002_IDS:
                self.assertNotIn(token, text, f"{path.name} contains {token}")

    def test_domain_branch_check_stays_green(self) -> None:
        script = _ROOT / "scripts" / "check_no_domain_branches.py"
        proc = subprocess.run([sys.executable, str(script)], check=False, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(proc.stdout.strip(), "ok")

    def test_v001_public_run_still_works(self) -> None:
        run = scenario_run_document("v001", "ontology")
        self.assertEqual(run["scenario_id"], "v001")
        cmds = {item["command_id"]: item["outcome"] for item in run["command_receipts"]}
        self.assertEqual(cmds["commit-purchase"], "committed")
        self.assertEqual(cmds["replay-purchase"], "replayed")
        self.assertGreaterEqual(len(run["queries"]), 2)
