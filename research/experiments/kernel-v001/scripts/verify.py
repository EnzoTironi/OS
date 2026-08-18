#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
TESTS = ROOT / "tests"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))
if str(TESTS) not in sys.path:
    sys.path.insert(0, str(TESTS))

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

import analyze_structure
from mutants import ALLOWED_FAILURES, ASSIGNED_PROPERTIES, MUTANTS
from os_kernel.canonical import digest
from os_kernel.definitions import load_bundle
from os_kernel.errors import InputError
from os_kernel.kernel import Kernel, ScriptedClock, SeqIds
from os_kernel.model import Claim, Provenance, ValidTime
from os_kernel.scenario import load_json, scenario_dir
from os_kernel.validation import load_schema, validator_for
from support import scenario_document_from_kernel

MISSING = "missing"
AMBIGUOUS = "ambiguous"
WRONG_KIND = "wrong-kind"
FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER
EVALUATE_RUN_CALLS = 0


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict) and "number" in value:
        return float(value["number"])
    return None


def _numbers(value: Any) -> list[float]:
    found: list[float] = []
    number = _number(value)
    if number is not None:
        found.append(number)
    elif isinstance(value, dict):
        for item in value.values():
            found.extend(_numbers(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(_numbers(item))
    return found


def _agree(values: list[Any]) -> bool:
    present = [item for item in values if item is not None]
    if len(present) < 2:
        return False
    first = present[0]
    return all(item == first for item in present[1:])


def _observation(
    evidence_id: str,
    operation: str,
    before_digest: str,
    after_digest: str,
    observed_refs: list[str],
) -> dict[str, Any]:
    return {
        "evidence_id": evidence_id,
        "operation": operation,
        "before_digest": before_digest,
        "after_digest": after_digest,
        "observed_refs": list(observed_refs),
    }


def _report(kernel: Kernel, scenario_id: str = "v001") -> dict[str, Any]:
    return kernel.query({"type": "scenario-report", "scenario_id": scenario_id})


def _records_digest(kernel: Kernel) -> str:
    return digest(_report(kernel)["records"])


def _claim_slice(report: dict[str, Any], subject: str | None, predicate: str | None, ids: set[str] | None = None) -> list[dict[str, Any]]:
    claims = list(report["records"].get("claims") or [])
    if subject is not None and predicate is not None:
        claims = [item for item in claims if item.get("subject_ref") == subject and item.get("predicate_ref") == predicate]
    if ids is not None:
        claims = [item for item in claims if item.get("claim_id") in ids]
    claims.sort(key=lambda item: item.get("claim_id") or "")
    return claims


def _public_methods(kernel: Kernel) -> list[str]:
    names = []
    for name in dir(kernel):
        if name.startswith("_"):
            continue
        if callable(getattr(kernel, name, None)):
            names.append(name)
    return sorted(names)


def raw_write_observation(kernel_cls: type[Kernel]) -> dict[str, Any]:
    definitions = load_json(ROOT / "fixtures" / "v001" / "definitions.json")
    kernel = kernel_cls.open(load_bundle(definitions), ScriptedClock("2030-08-10T10:00:00Z"), SeqIds())
    before = _records_digest(kernel)
    surface = getattr(kernel, "write_authoritative_claim", None)
    refs = ["obs:public-methods"]
    if callable(surface):
        claim = Claim(
            claim_id="claim:raw-write-probe",
            subject_ref="stock:probe",
            predicate_ref="available-quantity",
            value=1,
            valid_time=ValidTime(instant="2030-08-10"),
            known_revision="kr:probe",
            provenance=Provenance(
                "source:probe",
                "loc:probe",
                "cap:probe",
                "rev:probe",
                "actor:probe",
                "workload:probe",
            ),
        )
        surface(claim)
        refs.append("obs:raw-write")
        after = _records_digest(kernel)
        return _observation("obs:raw-write", "raw-write-invoked", before, after, refs)
    after = _records_digest(kernel)
    return _observation("obs:raw-write", "raw-write-absent", before, after, refs)


def instrumented_run(kernel_cls: type[Kernel], engine: str, source_sha: str) -> dict[str, Any]:
    folder = scenario_dir("v001")
    scenario = load_json(folder / "scenario.json")
    definitions = load_json(folder / "definitions.json")
    kernel = kernel_cls.open(load_bundle(definitions), ScriptedClock(scenario.get("clock", {}).get("start", "2030-08-10T10:00:00Z")), SeqIds())
    queries = scenario.get("closing_queries") or []
    subject = next((item.get("subject") for item in queries if item.get("subject")), None)
    predicate = next((item.get("predicate") for item in queries if item.get("predicate")), None)
    observations: list[dict[str, Any]] = []
    commands = scenario.get("commands", [])
    cut_before: dict[str, str] = {}
    for alias, spec in (scenario.get("knowledge_cuts") or {}).items():
        if isinstance(spec, dict) and spec.get("before_command_id"):
            cut_before[spec["before_command_id"]] = alias
    receipts: list[dict[str, Any]] = []
    seen_reconcile = False
    commit_count = 0
    late_ids: set[str] = set()
    for index, command in enumerate(commands):
        payload = dict(command)
        nxt = commands[index + 1] if index + 1 < len(commands) else None
        if nxt is not None:
            alias = cut_before.get(nxt.get("command_id"))
            if alias:
                payload["alias_revision_as"] = alias
        if "definitions_file" in payload:
            payload["definitions"] = load_json(folder / payload["definitions_file"])
            del payload["definitions_file"]
        command_type = payload.get("type")
        if command_type == "ProposeOperation":
            before = _records_digest(kernel)
        elif command_type == "CommitOperation":
            before = _records_digest(kernel)
        elif command_type == "RecordClaim" and seen_reconcile:
            before_report = _report(kernel)
            late_claims = _claim_slice(before_report, subject, predicate)
            late_ids = {item["claim_id"] for item in late_claims}
            observations.append(
                _observation(
                    "obs:claims-before-late",
                    "claims-before-late-evidence",
                    digest(late_claims),
                    digest(late_claims),
                    sorted(late_ids),
                )
            )
            before = _records_digest(kernel)
        else:
            before = None
        receipt = kernel.apply(payload)
        receipts.append(
            {
                "command_id": command.get("command_id"),
                "type": command.get("type"),
                "outcome": receipt.outcome,
                "known_revision": receipt.known_revision,
                "record_refs": list(receipt.record_refs),
                "details": receipt.details,
            }
        )
        after = _records_digest(kernel)
        if command_type == "ProposeOperation":
            observations.append(_observation("obs:proposal", "proposal-apply", before or after, after, ["obs:proposal"]))
        elif command_type == "CommitOperation":
            commit_count += 1
            name = "obs:after-commit" if commit_count == 1 else "obs:replay"
            operation = "commit-apply" if commit_count == 1 else "replay-apply"
            observations.append(_observation(name, operation, before or after, after, [name]))
        elif command_type == "RecordClaim" and seen_reconcile:
            after_report = _report(kernel)
            after_same = _claim_slice(after_report, subject, predicate, late_ids)
            observations.append(
                _observation(
                    "obs:claims-after-late",
                    "claims-after-late-evidence",
                    digest(_claim_slice(before_report, subject, predicate, late_ids)),
                    digest(after_same),
                    sorted(late_ids),
                )
            )
            observations.append(_observation("obs:records-after-late", "late-evidence-records", before or after, after, ["obs:records-after-late"]))
        elif command_type == "ReconcileEffect":
            seen_reconcile = True
    methods = _public_methods(kernel)
    observations.append(_observation("obs:public-methods", "public-methods", digest(methods), digest(methods), ["obs:public-methods"]))
    observations.append(raw_write_observation(kernel_cls))
    run = scenario_document_from_kernel(kernel, scenario, receipts, engine, folder)
    proof = copy.deepcopy(run)
    proof["source_sha"] = source_sha
    proof["proof_observations"] = observations
    return proof


def _register(index: dict[str, list[Any]], key: str | None, item: Any) -> None:
    if not key:
        return
    index.setdefault(str(key), []).append(item)


def evidence_index(run: dict[str, Any]) -> dict[str, list[Any]]:
    index: dict[str, list[Any]] = {}
    records = run.get("records") or {}
    for claim in records.get("claims") or []:
        _register(index, claim.get("claim_id"), claim)
    for proposal in records.get("proposals") or []:
        _register(index, proposal.get("proposal_id"), proposal)
        basis = proposal.get("state_basis") or {}
        if basis.get("basis_id"):
            _register(index, basis["basis_id"], basis)
    for approval in records.get("approvals") or []:
        _register(index, approval.get("approval_id"), approval)
    for receipt in run.get("operation_receipts") or []:
        _register(index, f"receipt:{receipt.get('operation_id')}", receipt)
    for envelope in records.get("envelopes") or []:
        operation_id = envelope.get("operation_id")
        if operation_id:
            _register(index, f"operation:{run.get('scenario_id')}:{operation_id}", envelope)
            _register(index, f"envelope:{operation_id}", envelope)
    for item in records.get("effect_requests") or []:
        _register(index, item.get("request_id"), item)
        if item.get("request_id") and not str(item.get("request_id")).startswith("effect:"):
            _register(index, f"effect:{item.get('request_id')}", item)
    for item in records.get("effect_attempts") or []:
        _register(index, item.get("attempt_id"), item)
    for item in records.get("reconciliations") or []:
        _register(index, item.get("reconciliation_id"), item)
    for item in records.get("occurrences") or []:
        _register(index, item.get("occurrence_id"), item)
    for item in records.get("causal_links") or []:
        _register(index, item.get("link_id"), item)
        if item.get("link_id") and not str(item.get("link_id")).startswith("link:"):
            _register(index, f"link:{item.get('link_id')}", item)
    for item in run.get("effect_knowledge") or []:
        _register(index, item.get("record_id"), item)
    for item in run.get("command_receipts") or []:
        if item.get("command_id"):
            _register(index, f"command:{item.get('command_id')}", item)
    for item in run.get("queries") or []:
        if item.get("type"):
            _register(index, f"query:{item.get('type')}", item)
    for item in run.get("explanations") or []:
        if item.get("reference"):
            _register(index, f"explanation:{item.get('reference')}", item)
    for item in run.get("proof_observations") or []:
        _register(index, item.get("evidence_id"), item)
    return index


def lookup_evidence(index: dict[str, list[Any]], reference: str) -> tuple[str, Any | None]:
    items = index.get(reference) or []
    if len(items) == 1:
        return ("ok", items[0])
    if len(items) > 1:
        return (AMBIGUOUS, None)
    if ":" in reference:
        remainder = reference.split(":", 1)[1]
        others = [key for key in index if key != reference and (key.split(":", 1)[-1] == remainder or key.endswith(":" + remainder))]
        if others:
            return (WRONG_KIND, None)
    return (MISSING, None)


def _resolve_refs(index: dict[str, list[Any]], refs: list[str]) -> bool:
    if not refs:
        return False
    for reference in refs:
        status, _ = lookup_evidence(index, reference)
        if status != "ok":
            return False
    return True


def _observation_map(run: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["evidence_id"]: item for item in run.get("proof_observations") or [] if item.get("evidence_id")}


def _first(items: list[dict[str, Any]], predicate) -> dict[str, Any]:
    for item in items:
        if predicate(item):
            return item
    return {}


def _attribution_ok(payload: dict[str, Any] | None) -> bool:
    if not payload:
        return False
    fields = [
        payload.get("actor_id"),
        payload.get("represented_principal_id"),
        payload.get("workload_id"),
        payload.get("delegation_id"),
    ]
    return "principal_id" not in payload and all(fields) and len(set(fields)) == 4


def _independent_explanation_ref(run: dict[str, Any], envelopes: list[dict[str, Any]], receipts: list[dict[str, Any]]) -> str | None:
    scenario_id = run.get("scenario_id")
    operation_id = None
    if receipts:
        operation_id = receipts[0].get("operation_id")
    if not operation_id and envelopes:
        operation_id = envelopes[0].get("operation_id")
    if not scenario_id or not operation_id:
        return None
    return f"{scenario_id}:operation:{operation_id}"


def _contributor_sum(query: dict[str, Any]) -> float | None:
    total = 0.0
    contributors = query.get("contributors") or []
    if not contributors:
        return None
    for item in contributors:
        number = _number(item.get("value"))
        if number is None:
            return None
        total += number
    return total


def evaluate_run(run: dict, structure: dict) -> dict:
    global EVALUATE_RUN_CALLS
    EVALUATE_RUN_CALLS += 1
    index = evidence_index(run)
    observations = _observation_map(run)
    records = run.get("records") or {}
    queries = {item.get("type"): item for item in run.get("queries") or []}
    known = queries.get("known-then") or {}
    believed = queries.get("now-believed-for-then") or {}
    explanation = (run.get("explanations") or [{}])[0]
    receipts = run.get("operation_receipts") or []
    commands = run.get("command_receipts") or []
    receipt = _first(receipts, lambda item: item.get("operation_id") == (explanation.get("operation_receipt") or {}).get("operation_id"))
    if not receipt and receipts:
        receipt = receipts[0]
    proposals = records.get("proposals") or []
    approvals = records.get("approvals") or []
    envelopes = records.get("envelopes") or []
    proposal = proposals[0] if proposals else {}
    approval = approvals[0] if approvals else {}
    commit_cmd = _first(commands, lambda item: item.get("type") == "CommitOperation" and item.get("outcome") == "committed")
    replay_cmd = _first(commands, lambda item: item.get("outcome") == "replayed")
    attempt_cmds = [item for item in commands if item.get("type") == "RecordEffectAttempt"]
    timeout_cmd = attempt_cmds[0] if attempt_cmds else {}
    retry_cmd = attempt_cmds[1] if len(attempt_cmds) > 1 else {}
    attempts = records.get("effect_attempts") or []
    reconciliations = records.get("reconciliations") or []
    occurrences = records.get("occurrences") or []
    subject = known.get("subject") or believed.get("subject")
    predicate = known.get("predicate") or believed.get("predicate")
    stock = [
        item
        for item in records.get("claims") or []
        if item.get("subject_ref") == subject and item.get("predicate_ref") == predicate
    ]
    inputs = explanation.get("inputs") or {}
    planned = receipt.get("planned_quantity")
    committed = receipt.get("committed_quantity")
    bound_values = _numbers((explanation.get("approval") or {}).get("approved_bounds") or approval.get("approved_bounds"))
    within_bound = committed is not None and bound_values and all(_number(committed) is not None and _number(committed) <= item for item in bound_values)
    commit_quantity_copies = [
        committed,
        (explanation.get("operation_receipt") or {}).get("committed_quantity"),
        (commit_cmd.get("details") or {}).get("committed_quantity") or ((commit_cmd.get("details") or {}).get("receipt") or {}).get("committed_quantity"),
    ]
    intent_copies = [
        proposal.get("intent_digest"),
        receipt.get("intent_digest"),
        ((commit_cmd.get("details") or {}).get("receipt") or {}).get("intent_digest"),
    ]
    proposal_basis_copies = [
        (proposal.get("state_basis") or {}).get("digest"),
        receipt.get("proposal_basis_digest"),
        (explanation.get("state_basis") or {}).get("proposal_digest"),
    ]
    commit_basis_copies = [
        receipt.get("commit_basis_digest"),
        (explanation.get("state_basis") or {}).get("commit_digest"),
    ]
    revision_copies = [
        proposal.get("action_revision"),
        receipt.get("action_revision"),
        (envelopes[0] if envelopes else {}).get("action_revision"),
    ]
    late_before = observations.get("obs:claims-before-late") or {}
    late_after = observations.get("obs:claims-after-late") or {}
    raw_write = observations.get("obs:raw-write") or {}
    replay_obs = observations.get("obs:replay") or {}
    known_sum = _contributor_sum(known)
    believed_sum = _contributor_sum(believed)
    known_value = _number(known.get("value"))
    believed_value = _number(believed.get("value"))
    operation_id = receipt.get("operation_id")
    produced_claim = any(str(item).startswith("claim:") for item in receipt.get("committed_refs") or [])
    effect_present = bool(records.get("effect_requests") or explanation.get("effect_requests"))
    envelope_link = any(
        item.get("relation") == "committed-as" and str(item.get("cause_ref", "")).startswith("operation:")
        for item in records.get("causal_links") or []
    ) or any(
        item.get("relation") == "committed-as" and str(item.get("cause_ref", "")).startswith("operation:")
        for item in explanation.get("causal_links") or []
    )
    explanation_identity = _independent_explanation_ref(run, envelopes, receipts)

    def result(property_id: str, passed: bool, refs: list[str]) -> dict[str, Any]:
        evidence_refs = [item for item in refs if item]
        if not evidence_refs:
            evidence_refs = [f"evidence:unresolved:{property_id}"]
        resolved = _resolve_refs(index, evidence_refs)
        return {"property_id": property_id, "passed": bool(passed) and resolved, "evidence_refs": evidence_refs}

    properties = [
        result(
            "P1_RIVAL_CLAIMS_WITH_PROVENANCE",
            len(stock) >= 2
            and all((item.get("provenance") or {}).get("source_locator") and (item.get("provenance") or {}).get("capture_id") for item in stock),
            [item["claim_id"] for item in stock if item.get("claim_id")],
        ),
        result(
            "P6_STALE_APPROVAL_REVALIDATED",
            bool(receipt)
            and receipt.get("stale") is True
            and receipt.get("proposal_basis_digest") != receipt.get("commit_basis_digest")
            and planned == inputs.get("quantity")
            and committed != planned
            and within_bound
            and _agree(commit_quantity_copies)
            and _agree(intent_copies)
            and _agree(proposal_basis_copies)
            and _agree(commit_basis_copies)
            and _agree(revision_copies)
            and produced_claim
            and effect_present
            and bool(commit_cmd)
            and bool(proposal)
            and bool(approval),
            [item for item in [proposal.get("proposal_id"), approval.get("approval_id"), f"receipt:{operation_id}", "obs:after-commit"] if item],
        ),
        result(
            "P8_TIMEOUT_REMAINS_UNKNOWN",
            timeout_cmd.get("outcome") == "unknown"
            and all(item.get("outcome") != "failed" for item in attempts)
            and all(item.get("new_knowledge") != "failed" for item in run.get("effect_knowledge") or []),
            [item for item in [timeout_cmd.get("command_id") and f"command:{timeout_cmd.get('command_id')}", (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
        result(
            "P8_NO_BLIND_RETRY",
            retry_cmd.get("outcome") == "unsafe_retry" and len(attempts) == 1,
            [item for item in [retry_cmd.get("command_id") and f"command:{retry_cmd.get('command_id')}", (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
        result(
            "REVISION_PINNED_REPLAY",
            replay_cmd.get("outcome") == "replayed"
            and receipt.get("committed_quantity")
            == ((replay_cmd.get("details") or {}).get("receipt") or {}).get("committed_quantity")
            and receipt.get("intent_digest")
            == (((replay_cmd.get("details") or {}).get("receipt") or {}).get("intent_digest") or receipt.get("intent_digest"))
            and replay_obs.get("before_digest") == replay_obs.get("after_digest"),
            [item for item in [f"receipt:{operation_id}", replay_cmd.get("command_id") and f"command:{replay_cmd.get('command_id')}", "obs:replay"] if item],
        ),
        result(
            "ATTRIBUTION_DIMENSIONS_SEPARATE",
            all(_attribution_ok(item.get("attribution")) for item in envelopes + proposals + approvals),
            [
                *(item.get("proposal_id") for item in proposals if item.get("proposal_id")),
                *(item.get("approval_id") for item in approvals if item.get("approval_id")),
                *(f"envelope:{item.get('operation_id')}" for item in envelopes if item.get("operation_id")),
            ],
        ),
        result(
            "NO_AUTHORITATIVE_WRITE_BYPASS",
            raw_write.get("operation") == "raw-write-absent" and raw_write.get("before_digest") == raw_write.get("after_digest"),
            ["obs:raw-write", "obs:public-methods"],
        ),
        result(
            "ACTION_IS_NOT_OCCURRENCE",
            bool(occurrences)
            and all(item.get("causal_operation_ref") != operation_id for item in occurrences)
            and bool(receipt),
            [item.get("occurrence_id") for item in occurrences if item.get("occurrence_id")] + ([f"receipt:{operation_id}"] if operation_id else []),
        ),
        result(
            "EVIDENCE_IS_APPEND_ONLY",
            bool(late_before)
            and bool(late_after)
            and late_before.get("before_digest") == late_after.get("after_digest")
            and set(late_before.get("observed_refs") or []).issubset({item.get("claim_id") for item in records.get("claims") or []}),
            ["obs:claims-before-late", "obs:claims-after-late"],
        ),
        result(
            "P10_KNOWN_THEN_DIFFERS",
            known_sum is not None
            and believed_sum is not None
            and known_value == known_sum
            and believed_value == believed_sum
            and (
                known_value != believed_value
                or known.get("contributor_digest") != believed.get("contributor_digest")
            )
            and known.get("contributor_digest") != believed.get("contributor_digest"),
            ["query:known-then", "query:now-believed-for-then"],
        ),
        result(
            "EXPLANATION_COMPLETE",
            explanation.get("complete") is True
            and list(explanation.get("gaps") or []) == []
            and bool(inputs)
            and explanation.get("actor_id")
            and explanation.get("represented_principal_id")
            and explanation.get("workload_id")
            and explanation.get("delegation_id")
            and explanation.get("proposal")
            and explanation.get("approval")
            and explanation.get("effect_requests")
            and explanation.get("effect_attempts")
            and explanation.get("reconciliation_records")
            and envelope_link,
            [f"explanation:{explanation_identity}"] if explanation_identity else [],
        ),
        result(
            "RECONCILED_KEEPING_TIMEOUT",
            bool(reconciliations)
            and reconciliations[0].get("resulting_knowledge") == "confirmed"
            and any(item.get("outcome") == "sent_no_response" for item in attempts),
            [item for item in [(reconciliations[0].get("reconciliation_id") if reconciliations else None), (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
    ]
    return {
        "contract_version": "kernel-v001-comparison/1",
        "scenario_id": run.get("scenario_id"),
        "engine": run.get("engine"),
        "input_digest": run.get("input_digest"),
        "source_sha": run.get("source_sha") or structure.get("source_sha"),
        "property_results": properties,
        "structural_metrics": {
            "domain_branches": structure.get("domain_branches"),
            "duplicated_rule_groups": structure.get("duplicated_rule_groups"),
            "escape_hatches": structure.get("escape_hatches"),
            "caller_contract": structure.get("caller_contract"),
            "trusted_commit_path": structure.get("trusted_commit_path"),
        },
    }


def validate_schema_document(schema_name: str, payload: Any, *, def_name: str | None = None) -> None:
    schema = load_schema(schema_name)
    if def_name:
        validator = Draft202012Validator(
            {"$ref": f"#/$defs/{def_name}", "$defs": schema.get("$defs", {})},
            format_checker=FORMAT_CHECKER,
        )
    else:
        validator = validator_for(schema)
    validator.validate(payload)


def validate_scenario_run(run: dict[str, Any]) -> None:
    try:
        validate_schema_document("scenario-run.schema.json", run)
    except ValidationError as exc:
        raise InputError("invalid_scenario_run", exc.message, "os scenario run v001 --output json") from exc


def validate_comparison(payload: dict[str, Any]) -> None:
    try:
        validate_schema_document("comparison-output.schema.json", payload)
    except ValidationError as exc:
        raise InputError("invalid_comparison", exc.message, "os scenario run v001 --output json") from exc


def engine_catalog() -> list[tuple[str, type[Kernel]]]:
    return [("Kernel", Kernel), *MUTANTS.items()]


def run_gauntlet(source_sha: str, structure: dict[str, Any]) -> dict[str, Any]:
    global EVALUATE_RUN_CALLS
    start = EVALUATE_RUN_CALLS
    engines = []
    for name, cls in engine_catalog():
        assigned = ASSIGNED_PROPERTIES.get(name)
        allowed = ALLOWED_FAILURES.get(name, {})
        exception = None
        failed: list[str] = []
        evidence: dict[str, list[str]] = {}
        valid = False
        status = "error"
        try:
            run = instrumented_run(cls, name, source_sha)
            validate_scenario_run(run)
            valid = True
            comparison = evaluate_run(run, structure)
            validate_comparison(comparison)
            failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
            evidence = {item["property_id"]: item["evidence_refs"] for item in comparison["property_results"]}
            extra = set(failed) - set(allowed)
            if name == "Kernel":
                status = "passed" if not failed else "failed"
            elif assigned in failed and not extra:
                status = "killed"
            else:
                status = "failed"
        except Exception as exc:
            exception = f"{type(exc).__name__}: {exc}"
            status = "error"
        engines.append(
            {
                "engine": name,
                "assigned_property": assigned,
                "failed_properties": failed,
                "allowed_failures": allowed,
                "status": status,
                "valid_scenario_run": valid,
                "exception": exception,
                "evidence_refs": evidence,
            }
        )
    return {
        "contract_version": "kernel-v001-mutant-matrix/1",
        "source_sha": source_sha,
        "evaluate_run_calls": EVALUATE_RUN_CALLS - start,
        "engines": engines,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="ontology")
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scenario-output", required=True)
    parser.add_argument("--mutant-output", required=True)
    args = parser.parse_args()
    if args.engine != "ontology":
        raise InputError("unsupported_engine", "only ontology is supported", "os scenario run v001 --engine ontology --output json")
    structure = analyze_structure.analyze(args.source_sha)
    run = instrumented_run(Kernel, "ontology", args.source_sha)
    validate_scenario_run(run)
    comparison = evaluate_run(run, structure)
    validate_comparison(comparison)
    matrix = run_gauntlet(args.source_sha, structure)
    try:
        validate_schema_document("comparison-output.schema.json", matrix, def_name="mutant_matrix")
        validate_schema_document("comparison-output.schema.json", structure, def_name="structure_report")
    except ValidationError as exc:
        raise InputError("invalid_artifact", exc.message, "os scenario run v001 --output json") from exc
    Path(args.scenario_output).write_text(json.dumps(run, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    Path(args.output).write_text(json.dumps(comparison, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    Path(args.mutant_output).write_text(json.dumps(matrix, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    failed = [item["property_id"] for item in comparison["property_results"] if not item["passed"]]
    bad = [item["engine"] for item in matrix["engines"] if item["engine"] == "Kernel" and item["status"] != "passed" or item["engine"] != "Kernel" and item["status"] != "killed"]
    if failed or bad:
        sys.stderr.write("failed properties: " + ", ".join(failed) + "\n")
        sys.stderr.write("gauntlet failures: " + ", ".join(bad) + "\n")
        return 1
    if matrix["evaluate_run_calls"] != 11:
        sys.stderr.write(f"evaluate_run ran {matrix['evaluate_run_calls']} times\n")
        return 1
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
