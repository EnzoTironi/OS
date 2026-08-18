#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from os_kernel.errors import InputError
from os_kernel.scenario import load_json, scenario_run_document

import analyze_structure


def _refs(*values: str) -> list[str]:
    return [item for item in values if item]


def evaluate_run(run: dict, expectations: dict, structure: dict) -> dict:
    claims = run["records"]["claims"]
    stock = [item for item in claims if item["subject_ref"] == expectations.get("stock_subject", "stock:sku-x") and item["predicate_ref"] == expectations.get("stock_predicate", "available-quantity")]
    receipts = run["operation_receipts"]
    receipt = next((item for item in receipts if item["operation_id"] == "purchase-raw-1"), None)
    attempts = run["records"]["effect_attempts"]
    knowledge = run["effect_knowledge"]
    queries = {item["type"]: item for item in run["queries"]}
    explanation = run["explanations"][0] if run["explanations"] else {}
    known = queries.get("known-then", {})
    believed = queries.get("now-believed-for-then", {})
    replay = next((item for item in run.get("command_receipts", []) if item.get("command_id") == "replay-purchase"), {})
    retry = next((item for item in run.get("command_receipts", []) if item.get("command_id") == "carrier-retry"), {})
    timeout = next((item for item in run.get("command_receipts", []) if item.get("command_id") == "carrier-timeout"), {})
    recon = run["records"]["reconciliations"]
    approvals = run["records"]["approvals"]
    proposals = run["records"]["proposals"]
    envelopes = run["records"]["envelopes"]

    def result(property_id: str, passed: bool, refs: list[str]) -> dict:
        if passed and not refs:
            passed = False
        return {"property_id": property_id, "passed": passed, "evidence_refs": refs or ["missing"]}

    properties = [
        result(
            "P1_RIVAL_CLAIMS_WITH_PROVENANCE",
            len(stock) >= 2 and all(item["provenance"]["source_locator"] and item["provenance"]["capture_id"] for item in stock),
            [item["claim_id"] for item in stock],
        ),
        result(
            "P6_STALE_APPROVAL_REVALIDATED",
            bool(receipt)
            and receipt.get("stale") is True
            and receipt.get("committed_quantity") == expectations["commit_quantity"]
            and receipt.get("planned_quantity") == expectations["proposal_quantity"]
            and receipt.get("proposal_basis_digest") != receipt.get("commit_basis_digest"),
            _refs("basis:proposal", "basis:commit", "operation:purchase-raw-1"),
        ),
        result(
            "P8_TIMEOUT_REMAINS_UNKNOWN",
            timeout.get("outcome") == "unknown" and all(item["outcome"] != "failed" for item in attempts),
            _refs("attempt:carrier-1"),
        ),
        result(
            "P8_NO_BLIND_RETRY",
            retry.get("outcome") == "unsafe_retry" and len(attempts) == 1,
            _refs("attempt:carrier-1", "command:carrier-retry"),
        ),
        result(
            "REVISION_PINNED_REPLAY",
            replay.get("outcome") == "replayed" and receipt is not None and receipt.get("committed_quantity") == expectations["commit_quantity"],
            _refs("operation:purchase-raw-1", "command:replay-purchase"),
        ),
        result(
            "ATTRIBUTION_DIMENSIONS_SEPARATE",
            all(
                len({
                    item["attribution"]["actor_id"],
                    item["attribution"]["represented_principal_id"],
                    item["attribution"]["workload_id"],
                    item["attribution"]["delegation_id"],
                }) == 4
                and "principal_id" not in item["attribution"]
                for item in envelopes + proposals + approvals
            ),
            _refs(*(item["operation_id"] for item in envelopes)),
        ),
        result(
            "NO_AUTHORITATIVE_WRITE_BYPASS",
            not any(item.get("kind") in {"set", "append", "update", "delete"} for item in structure.get("escape_hatches", [])),
            _refs("os_kernel/kernel.py:Kernel.apply"),
        ),
        result(
            "ACTION_IS_NOT_OCCURRENCE",
            all(item.get("causal_operation_ref") != "purchase-raw-1" for item in run["records"]["occurrences"])
            and any(item["occurrence_id"] == "occurrence:wms-800" for item in run["records"]["occurrences"]),
            _refs("occurrence:wms-800", "receipt:purchase-raw-1"),
        ),
        result(
            "EVIDENCE_IS_APPEND_ONLY",
            len({item["claim_id"] for item in stock}) == len(stock)
            and any(item["claim_id"] == "claim:erp-onhand-20" for item in stock)
            and any(item["claim_id"] == "claim:signed-outbound-20" for item in stock),
            [item["claim_id"] for item in stock],
        ),
        result(
            "P10_KNOWN_THEN_DIFFERS",
            known.get("value") == expectations["known_then_available_quantity"]
            and believed.get("value") == expectations["now_believed_available_quantity"]
            and known.get("contributor_digest") != believed.get("contributor_digest"),
            _refs(*(item.get("claim_id") for item in known.get("contributors", [])), *(item.get("claim_id") for item in believed.get("contributors", []))),
        ),
        result(
            "EXPLANATION_COMPLETE",
            all(
                explanation.get(key)
                for key in (
                    "action_revision",
                    "inputs",
                    "actor_id",
                    "represented_principal_id",
                    "workload_id",
                    "delegation_id",
                    "proposal",
                    "approval",
                    "state_basis",
                    "rule_decisions",
                    "claims_consumed",
                    "mutation_plan",
                    "operation_receipt",
                    "effect_requests",
                    "effect_attempts",
                    "reconciliation_records",
                )
            ),
            _refs("v001:operation:purchase-raw-1"),
        ),
        result(
            "RECONCILED_KEEPING_TIMEOUT",
            bool(recon)
            and recon[0]["resulting_knowledge"] == "confirmed"
            and any(item["outcome"] == "sent_no_response" for item in attempts),
            _refs("recon:carrier-1", "attempt:carrier-1"),
        ),
    ]
    return {
        "contract_version": "kernel-v001-comparison/1",
        "scenario_id": run["scenario_id"],
        "engine": run["engine"],
        "input_digest": run["input_digest"],
        "property_results": properties,
        "structural_metrics": {
            "domain_branches": structure.get("domain_branches", []),
            "duplicated_rule_groups": structure.get("duplicated_rule_groups", []),
            "escape_hatches": structure.get("escape_hatches", []),
            "caller_contract": structure.get("caller_contract", []),
            "trusted_commit_path": structure.get("trusted_commit_path", []),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="ontology")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.engine != "ontology":
        raise InputError("unsupported_engine", "only ontology is supported", "os scenario run v001 --engine ontology --output json")
    run = scenario_run_document("v001", args.engine)
    scenario = load_json(ROOT / "fixtures" / "v001" / "scenario.json")
    comparison = evaluate_run(run, scenario.get("black_box_expectations", {}), analyze_structure.analyze())
    Path(args.output).write_text(json.dumps(comparison, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
    if failed:
        sys.stderr.write("failed properties: " + ", ".join(failed) + "\n")
        return 1
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
