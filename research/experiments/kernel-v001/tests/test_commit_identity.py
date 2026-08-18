from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.definitions import load_bundle
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.scenario import load_json, scenario_dir


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
