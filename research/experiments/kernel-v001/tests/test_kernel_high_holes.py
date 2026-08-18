from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from support import apply_scenario_commands, open_kernel
from os_kernel.definitions import load_bundle
from os_kernel.errors import InputError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.model import ValidTime
from os_kernel.scenario import load_json, scenario_dir
from test_boundaries import VALID_ATTRIBUTION, apply_fixture
import analyze_structure


PROVENANCE = {
    "source_id": "source:test",
    "source_locator": "loc",
    "capture_id": "cap",
    "capture_revision": "r1",
    "actor_id": "actor:ingest",
    "workload_id": "workload:ingest-1",
}


class ValidTimeTests(unittest.TestCase):
    def test_interval_date_query_honors_end(self) -> None:
        interval = ValidTime(start="2030-08-01", end="2030-08-02")
        self.assertFalse(interval.covers("2030-08-10"))
        self.assertTrue(interval.covers("2030-08-01"))
        self.assertFalse(interval.covers("2030-08-02"))

    def test_empty_does_not_cover(self) -> None:
        self.assertFalse(ValidTime().covers("2030-08-10"))

    def test_end_only_is_exclusive(self) -> None:
        self.assertFalse(ValidTime(end="2030-08-02").covers("2030-08-10"))
        self.assertTrue(ValidTime(end="2030-08-02").covers("2030-08-01"))

    def test_inverted_covers_nothing(self) -> None:
        self.assertFalse(ValidTime(start="2030-08-10", end="2030-08-01").covers("2030-08-05"))

    def test_instant_is_not_open_ended(self) -> None:
        instant = ValidTime(instant="2030-08-10")
        self.assertFalse(instant.covers("2030-12-31"))
        self.assertTrue(instant.covers("2030-08-10"))
        self.assertTrue(instant.covers("2030-08-10T10:00:00Z"))


class ChildDelegationTests(unittest.TestCase):
    def test_child_cannot_widen_parent_scope(self) -> None:
        raw = load_json(_ROOT / "fixtures" / "v001" / "definitions.json")
        purchase = next(item for item in raw["actions"] if item["definition_id"] == "action.purchase-raw")
        other = copy.deepcopy(purchase)
        other["definition_id"] = "action.other"
        raw["actions"].append(other)
        kernel = Kernel.open(raw, ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())
        for entity_id in ("party:org-a", "stock:sku-x", "stock:other"):
            kernel.apply(
                {
                    "type": "CreateEntity",
                    "entity_id": entity_id,
                    "type_ref": {"definition_id": "type.organization" if entity_id.startswith("party") else "type.stock-position"},
                    "provenance": PROVENANCE,
                }
            )
        for subject, claim_id in (("stock:sku-x", "claim:onhand-x"), ("stock:other", "claim:onhand-other")):
            kernel.apply(
                {
                    "type": "RecordClaim",
                    "claim_id": claim_id,
                    "subject_ref": subject,
                    "predicate_ref": "available-quantity",
                    "value": 20,
                    "valid_time": {"instant": "2030-08-10"},
                    "provenance": PROVENANCE,
                }
            )
        parent = kernel.apply(
            {
                "type": "ProposeOperation",
                "proposal_id": "proposal:parent-other",
                "operation_id": "parent-other",
                "authority_namespace": "v001",
                "action_id": "action.other",
                "inputs": {"quantity": 1, "subject": "stock:other", "predicate": "available-quantity"},
                "replan_bounds": {"max_quantity": 1},
                "attribution": dict(VALID_ATTRIBUTION),
                "delegation": {
                    "delegation_id": "delegation:parent-other",
                    "grantor_id": "party:org-a",
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "action_scope": ["action.other"],
                    "resource_scope": ["stock:other"],
                    "purpose": "parent",
                    "valid_from": "2030-08-10T10:00:00Z",
                    "valid_until": None,
                    "bound_workload_id": "workload:agent-pod-1",
                },
            }
        )
        self.assertEqual(parent.outcome, "proposed")
        with self.assertRaises(InputError) as caught:
            kernel.apply(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "proposal:child-buy",
                    "operation_id": "child-buy",
                    "authority_namespace": "v001",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "replan_bounds": {"max_quantity": 1},
                    "attribution": dict(VALID_ATTRIBUTION),
                    "delegation": {
                        "delegation_id": "delegation:child-buy",
                        "grantor_id": "party:org-a",
                        "actor_id": "actor:planner-agent",
                        "represented_principal_id": "party:org-a",
                        "action_scope": ["action.purchase-raw"],
                        "resource_scope": ["stock:sku-x"],
                        "purpose": "wider than parent",
                        "valid_from": "2030-08-10T10:00:00Z",
                        "valid_until": None,
                        "bound_workload_id": "workload:agent-pod-1",
                        "parent_id": "delegation:parent-other",
                    },
                }
            )
        self.assertEqual(caught.exception.code, "invalid_delegation")


class IdentityTests(unittest.TestCase):
    def test_identity_unique_per_entity_context_role(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="role-supplier")
        with self.assertRaises(InputError) as caught:
            kernel.apply(
                {
                    "type": "RecordClaim",
                    "claim_id": "claim:org-b-customer-alias",
                    "subject_ref": "party:org-b",
                    "predicate_ref": "relation.customer-of",
                    "value": {"identity_id": "identity:org-b-customer-alias", "context_entity_id": "party:org-a"},
                    "valid_time": {"instant": "2030-08-02"},
                    "provenance": {
                        "source_id": "source:crm",
                        "source_locator": "crm://alias",
                        "capture_id": "cap:alias",
                        "capture_revision": "c2",
                        "actor_id": "actor:ingest",
                        "workload_id": "workload:ingest-1",
                    },
                }
            )
        self.assertEqual(caught.exception.code, "duplicate_identity")
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        identities = [
            item["identity_id"]
            for item in report["records"]["contextual_identities"]
            if item["entity_id"] == "party:org-b"
            and item["context_entity_id"] == "party:org-a"
            and item["role_definition_ref"] == "relation.customer-of"
        ]
        self.assertEqual(identities, ["identity:org-b-customer"])


class OccurrenceAtomicTests(unittest.TestCase):
    def test_failed_typed_value_does_not_leave_occurrence(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="chat-sub")
        before = kernel.record_counts()["occurrences"]
        with self.assertRaises(InputError) as caught:
            kernel.apply(
                {
                    "type": "RecordExternalOccurrence",
                    "occurrence_id": "occurrence:bad-claim",
                    "occurrence_ref": {"definition_id": "type.goods-receipt"},
                    "valid_time": {"instant": "2030-08-10T10:06:00Z"},
                    "payload": {
                        "claim_id": "claim:bad-signed",
                        "subject": "stock:sku-x",
                        "predicate": "available-quantity",
                        "signed": "not-a-number",
                    },
                    "provenance": {
                        "source_id": "source:wms",
                        "source_locator": "wms://bad",
                        "capture_id": "cap:bad",
                        "capture_revision": "b1",
                        "actor_id": "actor:ingest",
                        "workload_id": "workload:connector-wms",
                    },
                }
            )
        self.assertEqual(caught.exception.code, "invalid_typed_value")
        self.assertEqual(kernel.record_counts()["occurrences"], before)
        self.assertIsNone(kernel._Kernel__store.get("occurrences", "occurrence:bad-claim"))


class ExpressionFreezeTests(unittest.TestCase):
    def test_installed_expression_ignores_in_place_mutation(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="erp-20")
        query = {
            "type": "now-believed-for-then",
            "subject": "stock:sku-x",
            "predicate": "available-quantity",
            "valid_at": "2030-08-10",
        }
        before = kernel.query(query)
        computation = kernel._current.computations["computation.available-quantity"]
        computation.expression.clear()
        computation.expression.update({"op": "literal", "value": 99})
        after = kernel.query(query)
        self.assertEqual(after.get("value"), before.get("value"))


class RivalAndExplainTests(unittest.TestCase):
    def test_rivals_are_not_a_copy_of_contributors(self) -> None:
        folder = scenario_dir("v001")
        kernel = open_kernel()
        apply_scenario_commands(kernel, load_json(folder / "scenario.json"), folder)
        query = kernel.query(
            {
                "type": "now-believed-for-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
            }
        )
        self.assertNotEqual(query.get("rivals"), query.get("contributors"))

    def test_explain_consumes_commit_basis_claims(self) -> None:
        folder = scenario_dir("v001")
        kernel = open_kernel()
        apply_scenario_commands(kernel, load_json(folder / "scenario.json"), folder)
        explanation = kernel.explain("v001:operation:purchase-raw-1")
        consumed = explanation.get("claims_consumed") or []
        self.assertIn("claim:wms-inbound-800", consumed)


class PlannerWiringTests(unittest.TestCase):
    def test_authority_namespace_is_required(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="erp-20")
        payload = {
            "type": "ProposeOperation",
            "proposal_id": "proposal:ns-missing",
            "operation_id": "ns-missing",
            "action_id": "action.purchase-raw",
            "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
            "replan_bounds": {"max_quantity": 1},
            "attribution": dict(VALID_ATTRIBUTION),
            "delegation": {
                "delegation_id": "delegation:buy-raw-1",
                "grantor_id": "party:org-a",
                "actor_id": "actor:planner-agent",
                "represented_principal_id": "party:org-a",
                "action_scope": ["action.purchase-raw"],
                "resource_scope": ["stock:sku-x"],
                "purpose": "cover",
                "valid_from": "2030-08-10T10:00:00Z",
                "valid_until": None,
                "bound_workload_id": "workload:agent-pod-1",
            },
        }
        with self.assertRaises(InputError) as caught:
            kernel.apply(payload)
        self.assertEqual(caught.exception.code, "invalid_command")

    def test_bound_path_is_required_on_actions(self) -> None:
        raw = load_json(_ROOT / "fixtures" / "v001" / "definitions.json")
        action = next(item for item in raw["actions"] if item["definition_id"] == "action.purchase-raw")
        del action["bound_path"]
        with self.assertRaises(InputError) as caught:
            load_bundle(raw)
        self.assertEqual(caught.exception.code, "invalid_definition")

    def test_planner_wiring_not_in_kernel(self) -> None:
        self.assertNotIn("v001", analyze_structure.PROTOCOL_KEYS)
        protocol = (_ROOT / "os_kernel" / "protocol.py").read_text(encoding="utf-8")
        kernel = (_ROOT / "os_kernel" / "kernel.py").read_text(encoding="utf-8")
        definitions = (_ROOT / "os_kernel" / "definitions.py").read_text(encoding="utf-8")
        self.assertNotIn("dependencies[0]", protocol)
        self.assertNotIn("dependencies[0]", kernel)
        self.assertNotIn('bound_path=item.get("bound_path", "max_quantity")', definitions)
        self.assertNotIn('or "v001"', protocol)


if __name__ == "__main__":
    unittest.main()
