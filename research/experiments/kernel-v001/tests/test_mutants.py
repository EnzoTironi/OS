from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from mutants import MUTANTS
from support import ROOT, load_json, run_with_class, v001_run
from os_kernel.kernel import Kernel


def _stock(kernel: Kernel) -> list:
    return [
        claim
        for claim in kernel._store.claims()
        if claim.subject_ref == "stock:sku-x" and claim.predicate_ref == "available-quantity"
    ]


class MutantGauntletTests(unittest.TestCase):
    def test_correct_kernel_passes_named_properties(self) -> None:
        run = v001_run()
        expected = load_json(ROOT / "fixtures" / "v001" / "scenario.json")["black_box_expectations"]
        receipt = run["operation_receipts"][0]
        self.assertGreaterEqual(len([c for c in run["records"]["claims"] if c["predicate_ref"] == "available-quantity" and c["subject_ref"] == "stock:sku-x"]), 2)
        self.assertTrue(receipt["stale"])
        self.assertEqual(receipt["committed_quantity"], expected["commit_quantity"])
        cmds = {item["command_id"]: item["outcome"] for item in run["command_receipts"]}
        self.assertEqual(cmds["carrier-timeout"], "unknown")
        self.assertEqual(cmds["carrier-retry"], "unsafe_retry")
        self.assertEqual(cmds["replay-purchase"], "replayed")
        known = next(item for item in run["queries"] if item["type"] == "known-then")
        believed = next(item for item in run["queries"] if item["type"] == "now-believed-for-then")
        self.assertEqual(known["value"], expected["known_then_available_quantity"])
        self.assertEqual(believed["value"], expected["now_believed_available_quantity"])

    def test_merge_rival_claims(self) -> None:
        kernel, _ = run_with_class(MUTANTS["merge-rival-claims"])
        self.assertLess(len(_stock(kernel)), 3)

    def test_accept_stale_approval(self) -> None:
        kernel, _ = run_with_class(MUTANTS["accept-stale-approval"])
        receipt = kernel._store.all("receipts")[0]
        self.assertEqual(receipt.committed_quantity, 1000)

    def test_timeout_is_failed(self) -> None:
        kernel, receipts = run_with_class(MUTANTS["timeout-is-failed"])
        timeout = next(item for item in receipts if item["command_id"] == "carrier-timeout")
        self.assertEqual(timeout["outcome"], "failed")

    def test_blind_retry_after_unknown(self) -> None:
        kernel, receipts = run_with_class(MUTANTS["blind-retry-after-unknown"])
        retry = next(item for item in receipts if item["command_id"] == "carrier-retry")
        self.assertNotEqual(retry["outcome"], "unsafe_retry")
        self.assertGreaterEqual(len(kernel._store.all("effect_attempts")), 2)

    def test_replay_under_current_revision(self) -> None:
        kernel, receipts = run_with_class(MUTANTS["replay-under-current-revision"])
        replay = next(item for item in receipts if item["command_id"] == "replay-purchase")
        self.assertEqual(replay["details"]["receipt"]["committed_quantity"], 999)

    def test_collapse_actor_and_workload(self) -> None:
        kernel, _ = run_with_class(MUTANTS["collapse-actor-and-workload"])
        proposal = kernel._store.all("proposals")[0]
        self.assertTrue(hasattr(proposal.proposer, "principal_id"))

    def test_raw_write_bypass(self) -> None:
        kernel, _ = run_with_class(MUTANTS["raw-write-bypass"])
        self.assertTrue(callable(getattr(kernel, "append")))
        self.assertTrue(callable(getattr(kernel, "set_state")))
        correct = Kernel
        self.assertFalse(hasattr(correct, "append"))
        self.assertFalse(hasattr(correct, "set_state"))

    def test_action_is_occurrence(self) -> None:
        kernel, _ = run_with_class(MUTANTS["action-is-occurrence"])
        self.assertTrue(any(item.causal_operation_ref == "purchase-raw-1" for item in kernel._store.all("occurrences")))

    def test_overwrite_evidence(self) -> None:
        kernel, _ = run_with_class(MUTANTS["overwrite-evidence"])
        erp = next(item for item in kernel._store.claims() if item.claim_id == "claim:erp-onhand-20")
        self.assertNotEqual(erp.value, 20)

    def test_collapse_known_then(self) -> None:
        kernel, _ = run_with_class(MUTANTS["collapse-known-then"])
        known = kernel.query(
            {
                "type": "known-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
                "known_at": "kr:before-late-document",
            }
        )
        believed = kernel.query(
            {
                "type": "now-believed-for-then",
                "subject": "stock:sku-x",
                "predicate": "available-quantity",
                "valid_at": "2030-08-10",
            }
        )
        self.assertEqual(known["value"], believed["value"])
