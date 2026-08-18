from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(_ROOT / "scripts"))

import analyze_structure
from mutants import ASSIGNED_PROPERTIES, MUTANTS
from os_kernel.kernel import Kernel
from verify import evaluate_run, instrumented_run, run_gauntlet


class MutantGauntletTests(unittest.TestCase):
    def test_same_property_function_runs_eleven_engines(self) -> None:
        matrix = run_gauntlet("0" * 40, analyze_structure.analyze("0" * 40))
        self.assertEqual(matrix["evaluate_run_calls"], 11)
        self.assertEqual(len(matrix["engines"]), 11)
        by_name = {item["engine"]: item for item in matrix["engines"]}
        self.assertEqual(by_name["Kernel"]["status"], "passed")
        self.assertEqual(by_name["Kernel"]["failed_properties"], [])
        for name, assigned in ASSIGNED_PROPERTIES.items():
            row = by_name[name]
            self.assertIsNone(row["exception"], row["exception"])
            self.assertTrue(row["valid_scenario_run"], name)
            self.assertEqual(row["status"], "killed", row)
            self.assertIn(assigned, row["failed_properties"])
            self.assertTrue(set(row["failed_properties"]) <= set(row["allowed_failures"]))

    def test_replacing_each_mutant_with_kernel_makes_assigned_property_green(self) -> None:
        run = instrumented_run(Kernel, "ontology", "0" * 40)
        comparison = evaluate_run(run, analyze_structure.analyze("0" * 40))
        passed = {item["property_id"] for item in comparison["property_results"] if item["passed"]}
        for assigned in ASSIGNED_PROPERTIES.values():
            self.assertIn(assigned, passed)

    def test_mutant_catalog_matches_required_names(self) -> None:
        self.assertEqual(set(MUTANTS), set(ASSIGNED_PROPERTIES))
