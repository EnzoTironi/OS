from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.definitions import load_bundle
from os_kernel.errors import InternalError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.scenario import load_json, scenario_dir
from support import open_kernel


def apply_v001_until_commit_purchase() -> tuple[Kernel, ScriptedClock]:
    folder = scenario_dir("v001")
    scenario = load_json(folder / "scenario.json")
    clock = ScriptedClock(scenario["clock"]["start"])
    kernel = Kernel.open(load_bundle(load_json(folder / "definitions.json")), clock, SeqIds())
    for command in scenario["commands"]:
        if command.get("command_id") == "commit-purchase":
            break
        payload = dict(command)
        if "definitions_file" in payload:
            payload["definitions"] = load_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        if command.get("clock_time"):
            clock.set(command["clock_time"])
        kernel.apply(payload)
    return kernel, clock


class CommitIdentityTests(unittest.TestCase):
    def test_first_commit_rejects_command_identity_not_on_proposal(self) -> None:
        kernel, clock = apply_v001_until_commit_purchase()
        store = object.__getattribute__(kernel, "_Kernel__store")
        proposal = store.get("proposals", "proposal:purchase-raw-1")
        self.assertEqual(proposal.operation_id, "purchase-raw-1")
        self.assertEqual(proposal.authority_namespace, "v001")
        clock.set("2030-08-10T10:08:00Z")
        receipt = kernel.apply(
            {
                "type": "CommitOperation",
                "operation_id": "attacker-op",
                "authority_namespace": "attacker-ns",
                "proposal_id": "proposal:purchase-raw-1",
                "approval_id": "approval:purchase-raw-1",
                "attribution": {
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "workload_id": "workload:agent-pod-1",
                    "delegation_id": "delegation:buy-raw-1",
                },
            }
        )
        self.assertEqual(receipt.outcome, "intent_mismatch")
        self.assertIn(receipt.details.get("reason"), {"operation_id", "authority_namespace"})
        self.assertIsNone(store.receipt_for("attacker-ns", "attacker-op"))
        report = kernel.query({"type": "scenario-report", "scenario_id": "v001"})
        attacker_receipts = [
            item
            for item in report["operation_receipts"]
            if item.get("operation_id") == "attacker-op" or item.get("authority_namespace") == "attacker-ns"
        ]
        self.assertEqual(attacker_receipts, [])
        self.assertEqual(store.keys("receipts"), [])

    def test_approval_alone_does_not_make_commit_stale(self) -> None:
        kernel = open_kernel()
        kernel.apply(
            {
                "type": "RecordClaim",
                "claim_id": "claim:erp",
                "subject_ref": "stock:sku-x",
                "predicate_ref": "available-quantity",
                "value": 20,
                "valid_time": {"instant": "2030-08-10"},
                "provenance": {
                    "source_id": "source:test",
                    "source_locator": "loc",
                    "capture_id": "cap",
                    "capture_revision": "r1",
                    "actor_id": "actor:ingest",
                    "workload_id": "workload:ingest-1",
                },
            }
        )
        kernel.apply(
            {
                "type": "ProposeOperation",
                "proposal_id": "proposal:purchase-raw-1",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "action_id": "action.purchase-raw",
                "inputs": {"quantity": 10, "subject": "stock:sku-x", "predicate": "available-quantity"},
                "replan_bounds": {"max_quantity": 10},
                "attribution": {
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "workload_id": "workload:agent-pod-1",
                    "delegation_id": "delegation:buy-raw-1",
                },
                "delegation": {
                    "delegation_id": "delegation:buy-raw-1",
                    "grantor_id": "party:org-a",
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "action_scope": ["action.purchase-raw"],
                    "resource_scope": ["stock:sku-x"],
                    "purpose": "cover demand wave",
                    "valid_from": "2030-08-10T10:00:00Z",
                    "valid_until": None,
                    "bound_workload_id": "workload:agent-pod-1",
                },
            }
        )
        kernel.apply(
            {
                "type": "RecordApproval",
                "approval_id": "approval:purchase-raw-1",
                "proposal_id": "proposal:purchase-raw-1",
                "approved_bounds": {"max_quantity": 10},
                "attribution": {
                    "actor_id": "actor:human-buyer",
                    "represented_principal_id": "party:org-a",
                    "workload_id": "workload:desktop-1",
                    "delegation_id": "delegation:approve-buy-1",
                },
            }
        )
        try:
            receipt = kernel.apply(
                {
                    "type": "CommitOperation",
                    "operation_id": "purchase-raw-1",
                    "authority_namespace": "v001",
                    "proposal_id": "proposal:purchase-raw-1",
                    "approval_id": "approval:purchase-raw-1",
                    "attribution": {
                        "actor_id": "actor:planner-agent",
                        "represented_principal_id": "party:org-a",
                        "workload_id": "workload:agent-pod-1",
                        "delegation_id": "delegation:buy-raw-1",
                    },
                }
            )
        except InternalError as exc:
            self.fail(f"approval advanced knowledge_cut and commit raised {exc.code}")
        self.assertEqual(receipt.outcome, "committed")
        self.assertFalse(receipt.details.get("stale"))
