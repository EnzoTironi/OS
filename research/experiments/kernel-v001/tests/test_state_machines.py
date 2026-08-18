from __future__ import annotations

import sys
import unittest
from pathlib import Path

from hypothesis import settings, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.errors import InputError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.model import Attribution
from support import ROOT, load_json, v001_kernel


class ReplayMismatchMachine(RuleBasedStateMachine):
    def __init__(self) -> None:
        super().__init__()
        self.kernel = v001_kernel()
        self.counts = self.kernel.record_counts()

    @rule()
    def replay(self) -> None:
        receipt = self.kernel.apply(
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
        assert receipt.outcome == "replayed"
        assert self.kernel.record_counts() == self.counts

    @rule(extra=st.integers(min_value=1, max_value=50))
    def mismatch(self, extra: int) -> None:
        receipt = self.kernel.apply(
            {
                "type": "CommitOperation",
                "operation_id": "purchase-raw-1",
                "authority_namespace": "v001",
                "proposal_id": "proposal:purchase-raw-1",
                "approval_id": "approval:purchase-raw-1",
                "canonical_inputs": {"quantity": 1000 + extra, "subject": "stock:sku-x", "predicate": "available-quantity"},
                "attribution": {
                    "actor_id": "actor:planner-agent",
                    "represented_principal_id": "party:org-a",
                    "workload_id": "workload:agent-pod-1",
                    "delegation_id": "delegation:buy-raw-1",
                },
            }
        )
        assert receipt.outcome == "intent_mismatch"
        assert self.kernel.record_counts() == self.counts

    @invariant()
    def one_receipt(self) -> None:
        assert len(self.kernel._store.all("receipts")) == 1


class StateMachineTests(unittest.TestCase):
    def test_replay_and_mismatch_machine(self) -> None:
        ReplayMismatchMachine.TestCase.settings = settings(max_examples=25, deadline=None)
        ReplayMismatchMachine.TestCase().runTest()

    def test_effect_unknown_blocks_retry(self) -> None:
        from os_kernel.scenario import load_json, scenario_dir
        from os_kernel.definitions import load_bundle
        from os_kernel.kernel import ScriptedClock, SeqIds

        folder = scenario_dir("v001")
        scenario = load_json(folder / "scenario.json")
        kernel = Kernel.open(load_bundle(load_json(folder / "definitions.json")), ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())
        for command in scenario["commands"]:
            payload = dict(command)
            if payload.get("command_id") == "carrier-retry":
                break
            if "definitions_file" in payload:
                payload["definitions"] = load_json(folder / payload["definitions_file"])
                del payload["definitions_file"]
            kernel.apply(payload)
        receipt = kernel.apply(
            {
                "type": "RecordEffectAttempt",
                "request_id": "effect:book-carrier-1",
                "outcome": "sent_no_response",
            }
        )
        self.assertEqual(receipt.outcome, "unsafe_retry")

    def test_atomicity_on_denied_rule(self) -> None:
        kernel = Kernel.open(load_json(ROOT / "fixtures" / "v001" / "definitions.json"), ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())
        before = kernel.record_counts()
        with self.assertRaises(InputError):
            kernel.apply({"type": "CommitOperation", "operation_id": "missing", "proposal_id": "no", "approval_id": "no", "attribution": {
                "actor_id": "a1", "represented_principal_id": "a2", "workload_id": "a3", "delegation_id": "a4"
            }})
        self.assertEqual(kernel.record_counts(), before)

    def test_attribution_constructor(self) -> None:
        Attribution("a", "b", "c", "d")
        with self.assertRaises(ValueError):
            Attribution("a", "b", "a", "d")
