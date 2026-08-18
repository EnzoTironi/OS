from __future__ import annotations

import ast
import json
import subprocess
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(_ROOT / "scripts"))

import analyze_structure
from os_kernel.definitions import load_bundle
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from support import apply_scenario_commands, load_json, remap_strings, scenario_document_from_kernel
from verify import evaluate_run, validate_scenario_run


class NoDomainHardcodeTests(unittest.TestCase):
    def test_checker_passes(self) -> None:
        script = _ROOT / "scripts" / "check_no_domain_branches.py"
        proc = subprocess.run([sys.executable, str(script)], check=False, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_checker_and_analyzer_domain_findings_match(self) -> None:
        from_check = analyze_structure.domain_branch_findings()
        from_analyzer = analyze_structure.analyze("0" * 40)["domain_branches"]["findings"]
        self.assertEqual(from_check, from_analyzer)
        self.assertEqual(json.dumps(from_check), json.dumps(from_analyzer))

    def test_kernel_has_no_public_bypass(self) -> None:
        self.assertFalse(hasattr(Kernel, "append"))
        self.assertFalse(hasattr(Kernel, "set_state"))
        self.assertFalse(hasattr(Kernel, "update"))
        self.assertFalse(hasattr(Kernel, "delete"))
        self.assertFalse(hasattr(Kernel, "write_authoritative_claim"))

    def test_production_modules_do_not_import_mutants(self) -> None:
        for path in sorted((_ROOT / "os_kernel").glob("*.py")):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        self.assertNotIn("mutants", alias.name.split("."))
                if isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    self.assertNotIn("mutants", module.split("."))

    def test_opaque_domain_remap_stays_green(self) -> None:
        folder = _ROOT / "fixtures" / "v001"
        banned = analyze_structure.banned_domain_ids()
        mapping = {name: f"opaque.{index:04d}" for index, name in enumerate(sorted(banned))}
        definitions = remap_strings(load_json(folder / "definitions.json"), mapping)
        scenario = remap_strings(load_json(folder / "scenario.json"), mapping)
        for command in scenario.get("commands", []):
            if command.get("definitions_file") == "definitions-r2.json" or command.get("definitions_file") == mapping.get("definitions-r2.json"):
                command["definitions"] = remap_strings(load_json(folder / "definitions-r2.json"), mapping)
                command.pop("definitions_file", None)
        clock = ScriptedClock(scenario.get("clock", {}).get("start", "2030-08-10T10:00:00Z"))
        kernel = Kernel.open(load_bundle(definitions), clock, SeqIds())
        receipts = apply_scenario_commands(kernel, scenario, folder)
        run = scenario_document_from_kernel(kernel, scenario, receipts, "ontology", folder)
        run["source_sha"] = "0" * 40
        run["proof_observations"] = [
            {
                "evidence_id": "obs:raw-write",
                "operation": "raw-write-absent",
                "before_digest": "same",
                "after_digest": "same",
                "observed_refs": ["obs:public-methods"],
            },
            {
                "evidence_id": "obs:public-methods",
                "operation": "public-methods",
                "before_digest": "same",
                "after_digest": "same",
                "observed_refs": ["obs:public-methods"],
            },
            {
                "evidence_id": "obs:claims-before-late",
                "operation": "claims-before-late-evidence",
                "before_digest": "late",
                "after_digest": "late",
                "observed_refs": [],
            },
            {
                "evidence_id": "obs:claims-after-late",
                "operation": "claims-after-late-evidence",
                "before_digest": "late",
                "after_digest": "late",
                "observed_refs": [],
            },
            {
                "evidence_id": "obs:after-commit",
                "operation": "commit-apply",
                "before_digest": "commit",
                "after_digest": "commit",
                "observed_refs": ["obs:after-commit"],
            },
            {
                "evidence_id": "obs:replay",
                "operation": "replay-apply",
                "before_digest": "replay",
                "after_digest": "replay",
                "observed_refs": ["obs:replay"],
            },
        ]
        validate_scenario_run(run)
        comparison = evaluate_run(run, analyze_structure.analyze("0" * 40))
        failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
        self.assertEqual(failed, [])
