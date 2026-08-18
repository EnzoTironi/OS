from __future__ import annotations

import io
import json
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.cli import main
from os_kernel.kernel import Kernel
from os_kernel.scenario import run_scenario, scenario_run_document


def _load() -> tuple[Kernel, dict[str, Any], list[dict[str, Any]]]:
    kernel, _, receipts = run_scenario("cross-cycle-71")
    report = kernel.query({"type": "scenario-report", "scenario_id": "cross-cycle-71"})
    return kernel, report, receipts


def _claims_by_id(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["claim_id"]: item for item in report["records"]["claims"]}


def _commands_by_id(receipts: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {item["command_id"]: item for item in receipts}


def _stored_claim(kernel: Kernel, claim_id: str) -> Any:
    return kernel._Kernel__store.get("claims", claim_id)


class CrossCycle71Tests(unittest.TestCase):
    def test_accounting_consequence(self) -> None:
        kernel, report, _ = _load()
        claims = _claims_by_id(report)
        self.assertEqual(claims["claim:ar-40"]["predicate_ref"], "receivable-amount")
        self.assertEqual(claims["claim:ar-40"]["value"], 40)
        self.assertEqual(claims["claim:settle-40"]["predicate_ref"], "settled-amount")
        self.assertEqual(claims["claim:settle-40"]["value"], 40)
        receivable = kernel.explain("cross-cycle-71:operation:receivable-1")
        settle = kernel.explain("cross-cycle-71:operation:settle-1")
        self.assertIn("claim:ar-40", receivable["operation_receipt"]["committed_refs"])
        self.assertIn("claim:settle-40", settle["operation_receipt"]["committed_refs"])

    def test_human_and_agent_same_action(self) -> None:
        kernel, _, receipts = _load()
        cmds = _commands_by_id(receipts)
        self.assertEqual(cmds["commit-reserve-human"]["outcome"], "committed")
        self.assertEqual(cmds["commit-reserve-agent"]["outcome"], "committed")
        self.assertEqual(cmds["replay-reserve-human"]["outcome"], "replayed")
        human = kernel.explain("cross-cycle-71:operation:reserve-human-1")
        agent = kernel.explain("cross-cycle-71:operation:reserve-agent-1")
        self.assertEqual(human["action_revision"]["definition_id"], "action.reserve-inventory")
        self.assertEqual(agent["action_revision"]["definition_id"], "action.reserve-inventory")
        self.assertEqual(human["operation_receipt"]["operation_id"], "reserve-human-1")
        self.assertEqual(agent["operation_receipt"]["operation_id"], "reserve-agent-1")
        self.assertEqual(human["workload_id"], "workload:human-1")
        self.assertEqual(agent["workload_id"], "workload:agent-1")

    def test_ontology_revision_mid_cycle(self) -> None:
        kernel, _, _ = _load()
        human = kernel.explain("cross-cycle-71:operation:reserve-human-1")
        receivable = kernel.explain("cross-cycle-71:operation:receivable-1")
        self.assertEqual(human["action_revision"]["revision_id"], "defrev:cross-r1")
        self.assertEqual(receivable["action_revision"]["revision_id"], "defrev:cross-r2")

    def test_correction_not_mutation(self) -> None:
        kernel, report, _ = _load()
        claims = _claims_by_id(report)
        self.assertEqual(claims["claim:ship-4"]["value"], 4)
        self.assertEqual(claims["claim:return-2"]["value"], 2)
        self.assertEqual(_stored_claim(kernel, "claim:ship-4").value, 4)
        self.assertEqual(_stored_claim(kernel, "claim:return-2").corrects, "claim:ship-4")
        self.assertEqual(_stored_claim(kernel, "claim:return-2").value, 2)

    def test_replay_command_receipt(self) -> None:
        _, _, receipts = _load()
        self.assertEqual(_commands_by_id(receipts)["replay-reserve-human"]["outcome"], "replayed")

    def test_cli_scenario_run(self) -> None:
        out = io.StringIO()
        err = io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(["scenario", "run", "cross-cycle-71", "--output", "json"])
        self.assertEqual(code, 0, err.getvalue())
        document = json.loads(out.getvalue())
        self.assertEqual(document["scenario_id"], "cross-cycle-71")
        self.assertEqual(document["engine"], "ontology")
        self.assertEqual(document["input_digest"], scenario_run_document("cross-cycle-71", "ontology")["input_digest"])


if __name__ == "__main__":
    unittest.main()
