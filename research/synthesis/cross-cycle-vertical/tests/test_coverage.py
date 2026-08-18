from __future__ import annotations

import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parents[1]


class CoverageTests(unittest.TestCase):
    def test_cuts_name_the_kernel_and_the_gaps(self) -> None:
        cuts = json.loads((HERE / "suite/cuts.json").read_text(encoding="utf-8"))
        required = {
            "identity",
            "customer_intent",
            "commercial_commitment",
            "inventory_availability",
            "procurement_need",
            "action_proposal",
            "policy_approval",
            "stale_revalidation",
            "transactional_commit",
            "external_unknown",
            "reconciliation",
            "accounting_consequence",
            "historical_query",
            "causal_explanation",
            "rival_sources",
            "human_and_agent_same_action",
            "ontology_revision_mid_cycle",
            "no_second_authority",
            "correction_not_mutation",
            "unsafe_retry",
        }
        self.assertEqual(required, set(cuts["cuts"]))
        self.assertEqual(cuts["kernel_pr"], 169)
        missing = [name for name, row in cuts["cuts"].items() if row.get("in_v001") is False]
        self.assertEqual(
            missing,
            [
                "accounting_consequence",
                "human_and_agent_same_action",
                "ontology_revision_mid_cycle",
                "correction_not_mutation",
            ],
        )

    def test_this_folder_has_no_second_kernel(self) -> None:
        banned = [
            HERE / "adapters/reference.py",
            HERE / "harness/protocol.py",
            HERE / "suite/scenario.json",
        ]
        for path in banned:
            self.assertFalse(path.exists(), path)
        text = (HERE / "README.md").read_text(encoding="utf-8")
        self.assertIn("os_kernel", text)
        self.assertNotIn("class ReferenceRuntime", text)
