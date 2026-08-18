from __future__ import annotations

import copy
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
from os_kernel.errors import InputError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.model import ValidTime
from os_kernel.scenario import load_json, scenario_dir
from support import apply_scenario_commands, load_schema, open_kernel, validator
from test_boundaries import VALID_ATTRIBUTION, apply_fixture

PROVENANCE = {
    "source_id": "source:test",
    "source_locator": "loc",
    "capture_id": "cap",
    "capture_revision": "r1",
    "actor_id": "actor:ingest",
    "workload_id": "workload:ingest-1",
}


def _quantity(kernel: Kernel, valid_at: str = "2030-08-10") -> dict:
    return kernel.query(
        {
            "type": "now-believed-for-then",
            "subject": "stock:sku-x",
            "predicate": "available-quantity",
            "valid_at": valid_at,
        }
    )


def _customer_identities(kernel: Kernel) -> list[str]:
    report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
    return [
        item["identity_id"]
        for item in report["records"]["contextual_identities"]
        if item["entity_id"] == "party:org-b"
        and item["context_entity_id"] == "party:org-a"
        and item["role_definition_ref"] == "relation.customer-of"
    ]


class ValidTimeHighHoleTests(unittest.TestCase):
    def test_interval_honors_end_on_date_query(self) -> None:
        self.assertFalse(ValidTime(start="2030-08-01", end="2030-08-02").covers("2030-08-10"))

    def test_empty_covers_nothing(self) -> None:
        self.assertFalse(ValidTime().covers("2030-08-10"))

    def test_end_only_is_open_start_exclusive_end(self) -> None:
        self.assertFalse(ValidTime(end="2030-08-02").covers("2030-08-10"))

    def test_inverted_interval_covers_nothing(self) -> None:
        self.assertFalse(ValidTime(start="2030-08-10", end="2030-08-01").covers("2030-08-10"))

    def test_instant_date_does_not_cover_a_later_day(self) -> None:
        self.assertFalse(ValidTime(instant="2030-08-10").covers("2030-12-31"))


class DelegationHighHoleTests(unittest.TestCase):
    def test_child_scopes_must_be_subsets_of_parent(self) -> None:
        raw = load_json(_ROOT / "fixtures" / "v001" / "definitions.json")
        purchase = next(item for item in raw["actions"] if item["definition_id"] == "action.purchase-raw")
        other = copy.deepcopy(purchase)
        other["definition_id"] = "action.other"
        raw["actions"].append(other)
        kernel = Kernel.open(raw, ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())
        for entity_id, type_id in (
            ("party:org-a", "type.organization"),
            ("stock:sku-x", "type.stock-position"),
            ("stock:other", "type.stock-position"),
        ):
            kernel.apply(
                {
                    "type": "CreateEntity",
                    "entity_id": entity_id,
                    "type_ref": {"definition_id": type_id},
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
                "attribution": {
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "workload_id": "workload:agent-pod-1",
                    "delegation_id": "delegation:parent-other",
                },
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
        with self.assertRaises(InputError) as ctx:
            kernel.apply(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "proposal:child-buy",
                    "operation_id": "child-buy",
                    "authority_namespace": "v001",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "replan_bounds": {"max_quantity": 1},
                    "attribution": {
                        "actor_id": "actor:planner-agent",
                        "represented_principal_id": "party:org-a",
                        "workload_id": "workload:agent-pod-1",
                        "delegation_id": "delegation:child-buy",
                    },
                    "delegation": {
                        "delegation_id": "delegation:child-buy",
                        "grantor_id": "party:org-a",
                        "actor_id": "actor:planner-agent",
                        "represented_principal_id": "party:org-a",
                        "action_scope": ["action.purchase-raw"],
                        "resource_scope": ["stock:sku-x"],
                        "purpose": "child wider than parent",
                        "valid_from": "2030-08-10T10:00:00Z",
                        "valid_until": None,
                        "bound_workload_id": "workload:agent-pod-1",
                        "parent_id": "delegation:parent-other",
                    },
                }
            )
        self.assertEqual(ctx.exception.code, "invalid_delegation")


class OccurrenceHighHoleTests(unittest.TestCase):
    def test_invalid_derived_claim_leaves_no_occurrence(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="chat-sub")
        before = kernel.record_counts()["occurrences"]
        with self.assertRaises(InputError) as ctx:
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
        self.assertEqual(ctx.exception.code, "invalid_typed_value")
        self.assertEqual(kernel.record_counts()["occurrences"], before)
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        self.assertFalse(any(item["occurrence_id"] == "occurrence:bad-claim" for item in report["records"]["occurrences"]))


class IdentityHighHoleTests(unittest.TestCase):
    def test_identity_unique_per_entity_context_role(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="role-supplier")
        self.assertEqual(_customer_identities(kernel), ["identity:org-b-customer"])
        with self.assertRaises(InputError) as ctx:
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
        self.assertEqual(ctx.exception.code, "duplicate_identity")
        self.assertEqual(_customer_identities(kernel), ["identity:org-b-customer"])
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        claim_ids = [item["claim_id"] for item in report["records"]["claims"]]
        self.assertNotIn("claim:org-b-customer-alias", claim_ids)


class ExpressionHighHoleTests(unittest.TestCase):
    def test_installed_expression_is_frozen(self) -> None:
        kernel = open_kernel()
        apply_fixture(kernel, stop_after="erp-20")
        before = _quantity(kernel)
        computation = kernel._current.computations["computation.available-quantity"]
        computation.expression.clear()
        computation.expression.update({"op": "literal", "value": 99})
        after = _quantity(kernel)
        self.assertEqual(after["value"], before["value"])
        self.assertEqual(after["value"], 20)


class QueryExplainHighHoleTests(unittest.TestCase):
    def test_rivals_are_not_a_copy_of_contributors(self) -> None:
        folder = scenario_dir("v001")
        kernel = open_kernel()
        apply_scenario_commands(kernel, load_json(folder / "scenario.json"), folder)
        result = _quantity(kernel)
        contributors = result["contributors"]
        rivals = result["rivals"]
        self.assertNotEqual(rivals, contributors)
        contrib_ids = {item["claim_id"] for item in contributors}
        rival_ids = {item["claim_id"] for item in rivals}
        self.assertFalse(contrib_ids & rival_ids)

    def test_explain_consumes_commit_determining_claims(self) -> None:
        folder = scenario_dir("v001")
        kernel = open_kernel()
        apply_scenario_commands(kernel, load_json(folder / "scenario.json"), folder)
        graph = kernel.explain("v001:operation:purchase-raw-1")
        consumed = graph.get("claims_consumed") or []
        self.assertTrue("claim:wms-inbound-800" in consumed or graph.get("complete") is False)


class PlannerWiringHighHoleTests(unittest.TestCase):
    def test_propose_and_commit_schema_require_authority_namespace(self) -> None:
        check = validator(load_schema("command.schema.json"))
        attribution = dict(VALID_ATTRIBUTION)
        with self.assertRaises(ValidationError):
            check.validate(
                {
                    "type": "ProposeOperation",
                    "proposal_id": "proposal:ns",
                    "operation_id": "ns",
                    "action_id": "action.purchase-raw",
                    "inputs": {"quantity": 1, "subject": "stock:sku-x", "predicate": "available-quantity"},
                    "attribution": attribution,
                }
            )
        with self.assertRaises(ValidationError):
            check.validate(
                {
                    "type": "CommitOperation",
                    "operation_id": "ns",
                    "proposal_id": "proposal:ns",
                    "approval_id": "approval:ns",
                    "attribution": attribution,
                }
            )

    def test_action_schema_requires_bound_path(self) -> None:
        check = validator(load_schema("definition-bundle.schema.json"))
        with self.assertRaises(ValidationError):
            check.validate(
                {
                    "revision_id": "r",
                    "computations": [{"definition_id": "computation.x", "expression": {"op": "literal", "value": 1}}],
                    "actions": [{"definition_id": "action.x", "planner_ref": "computation.x"}],
                }
            )

    def test_planner_wiring_is_generic(self) -> None:
        protocol = (_ROOT / "os_kernel" / "protocol.py").read_text(encoding="utf-8")
        kernel = (_ROOT / "os_kernel" / "kernel.py").read_text(encoding="utf-8")
        definitions = (_ROOT / "os_kernel" / "definitions.py").read_text(encoding="utf-8")
        self.assertNotIn("dependencies[0]", protocol)
        self.assertNotIn("dependencies[0]", kernel)
        self.assertNotIn('bound_path=item.get("bound_path", "max_quantity")', definitions)
        self.assertNotIn('or "v001"', protocol)
        self.assertNotIn("v001", analyze_structure.PROTOCOL_KEYS)
