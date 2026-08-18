from __future__ import annotations

import unittest

from harness.loader import load_cuts, load_scenario


class CoverageTests(unittest.TestCase):
    def test_every_cut_has_a_step_or_check(self) -> None:
        scenario = load_scenario()
        tagged: dict[str, set[str]] = {}
        for step in scenario["steps"]:
            for cut in step.get("cuts") or []:
                tagged.setdefault(cut, set()).add(step["id"])
        for item in list(scenario.get("closing_queries") or []) + list(scenario.get("closing_explains") or []):
            for cut in item.get("cuts") or []:
                tagged.setdefault(cut, set()).add(item["id"])
        cuts = load_cuts()["cuts"]
        missing = sorted(name for name in cuts if name not in tagged)
        self.assertEqual(missing, [])
        for name, expected_ids in cuts.items():
            self.assertTrue(set(expected_ids) <= tagged[name], msg=name)

    def test_required_issue_cuts_are_declared(self) -> None:
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
        self.assertEqual(required, set(load_cuts()["cuts"]))
