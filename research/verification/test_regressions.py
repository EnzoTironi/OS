#!/usr/bin/env python3
from __future__ import annotations

import json
import unittest
from pathlib import Path

from harness import SafetyModel, TraceOperation, effect_uncertainty_erased

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FIXTURES = HERE / "regressions" / "known-counterexamples.json"


class RegressionFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = json.loads(FIXTURES.read_text(encoding="utf-8"))
        cls.fixtures = {fixture["id"]: fixture for fixture in cls.document["fixtures"]}

    def test_fixture_ids_unique_and_test_refs_exist(self) -> None:
        ids = [fixture["id"] for fixture in self.document["fixtures"]]
        self.assertEqual(len(ids), len(set(ids)))
        for fixture in self.document["fixtures"]:
            test_path = fixture["test_ref"].split("::", 1)[0]
            self.assertTrue((ROOT / test_path).exists(), f"missing test ref for {fixture['id']}: {test_path}")
            self.assertTrue((ROOT / fixture["source_artifact"]).exists(), fixture["source_artifact"])

    def test_known_effect_last_write_wins_trace_still_breaks_naive_model(self) -> None:
        fixture = self.fixtures["REG-EFFECT-LAST-ATTEMPT-WINS"]
        trace = [TraceOperation(item["op"], tuple(item["args"])) for item in fixture["minimal_trace"]]
        self.assertTrue(effect_uncertainty_erased(trace))
        safe = SafetyModel()
        for item in trace:
            safe.effect_attempt(str(item.args[0]), str(item.args[1]))
        self.assertEqual(safe.effects["E1"].value, fixture["expected_safe_result"])

    def test_known_derived_dual_write_remains_non_authoritative(self) -> None:
        fixture = self.fixtures["REG-DERIVED-DUAL-WRITE"]
        model = SafetyModel(authoritative_values={"price": 100})
        model.mutate_derived("price", 120)
        self.assertEqual(model.authoritative_values["price"], 100)
        self.assertEqual(model.derived_values["price"], 120)
        self.assertIn("authority remains 100", fixture["expected_safe_rule"])

    def test_known_delegation_escalation_is_rejected_by_executable_model(self) -> None:
        fixture = self.fixtures["REG-DELEGATION-SCOPE-ESCALATION"]
        model = SafetyModel()
        model.grant_root("PARENT", "tenant-A", fixture["minimal_model"]["parent_scopes"])
        result = model.delegate(
            "PARENT",
            "CHILD",
            "tenant-A",
            fixture["minimal_model"]["child_scopes"],
        )
        self.assertEqual(result, "scope_escalation")
        self.assertNotIn("CHILD", model.grants)

    def test_postgres_write_skew_fixture_points_to_real_integration_evidence(self) -> None:
        fixture = self.fixtures["REG-SNAPSHOT-WRITE-SKEW"]
        self.assertIn("PostgreSQL 18", fixture["integration_evidence"])
        self.assertTrue((ROOT / "research/runtime/storage/experiments/postgres18/test_storage_contract.py").exists())


if __name__ == "__main__":
    unittest.main()
