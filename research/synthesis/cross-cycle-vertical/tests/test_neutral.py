from __future__ import annotations

from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parents[1]
HARNESS = HERE / "harness"
SUITE = HERE / "suite"

FORBIDDEN_IR = (
    "class Type",
    "class Relation",
    "class Computation",
    "CANONICAL_FORMS",
    "R6-capability",
)


class NeutralityTests(unittest.TestCase):
    def test_harness_does_not_freeze_a_metamodel(self) -> None:
        text = "\n".join(path.read_text(encoding="utf-8") for path in HARNESS.glob("*.py"))
        for token in FORBIDDEN_IR:
            self.assertNotIn(token, text)

    def test_suite_contract_is_json_and_not_r6(self) -> None:
        scenario = (SUITE / "scenario.json").read_text(encoding="utf-8")
        self.assertNotIn("Type + Relation + Computation + Action", scenario)
        self.assertIn("cross-cycle-71", scenario)
        self.assertIn('"architecture_decision": "none"', scenario)
