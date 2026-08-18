#!/usr/bin/env python3
from __future__ import annotations

from typing import Any


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


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


def _index_run(run: dict[str, Any]) -> dict[str, list[Any]]:
    index: dict[str, list[Any]] = {}

    def add(key: str | None, item: Any) -> None:
        if not key:
            return
        index.setdefault(str(key), []).append(item)

    records = run.get("records") or {}
    for claim in records.get("claims") or []:
        add(claim.get("claim_id"), claim)
    for proposal in records.get("proposals") or []:
        add(proposal.get("proposal_id"), proposal)
    for approval in records.get("approvals") or []:
        add(approval.get("approval_id"), approval)
    for receipt in run.get("operation_receipts") or []:
        add(f"receipt:{receipt.get('operation_id')}", receipt)
    for envelope in records.get("envelopes") or []:
        add(f"envelope:{envelope.get('operation_id')}", envelope)
    for item in records.get("effect_requests") or []:
        add(item.get("request_id"), item)
    for item in records.get("effect_attempts") or []:
        add(item.get("attempt_id"), item)
    for item in records.get("reconciliations") or []:
        add(item.get("reconciliation_id"), item)
    for item in records.get("occurrences") or []:
        add(item.get("occurrence_id"), item)
    for item in run.get("command_receipts") or []:
        if item.get("command_id"):
            add(f"command:{item.get('command_id')}", item)
    for item in run.get("queries") or []:
        if item.get("type"):
            add(f"query:{item.get('type')}", item)
    for item in run.get("explanations") or []:
        if item.get("reference"):
            add(f"explanation:{item.get('reference')}", item)
    return index


def _resolved(index: dict[str, list[Any]], refs: list[str]) -> bool:
    if not refs:
        return False
    for reference in refs:
        hits = index.get(reference) or []
        if len(hits) != 1:
            return False
    return True


def _contributor_ids(query: dict[str, Any]) -> set[str]:
    return {item.get("claim_id") for item in query.get("contributors") or [] if item.get("claim_id")}


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


def evaluate_run(run: dict[str, Any]) -> dict[str, Any]:
    index = _index_run(run)
    records = run.get("records") or {}
    queries = {item.get("type"): item for item in run.get("queries") or []}
    known = queries.get("known-then") or {}
    believed = queries.get("now-believed-for-then") or {}
    explanation = (run.get("explanations") or [{}])[0]
    commands = run.get("command_receipts") or []
    receipts = run.get("operation_receipts") or []
    denied = [item for item in commands if item.get("type") == "CommitOperation" and item.get("outcome") == "denied"]
    committed = [item for item in commands if item.get("type") == "CommitOperation" and item.get("outcome") == "committed"]
    replayed = [item for item in commands if item.get("outcome") == "replayed"]
    attempt_cmds = [item for item in commands if item.get("type") == "RecordEffectAttempt"]
    timeout_cmd = attempt_cmds[0] if attempt_cmds else {}
    retry_cmd = attempt_cmds[1] if len(attempt_cmds) > 1 else {}
    attempts = records.get("effect_attempts") or []
    requests = records.get("effect_requests") or []
    reconciliations = records.get("reconciliations") or []
    occurrences = records.get("occurrences") or []
    subject = known.get("subject") or believed.get("subject")
    predicate = known.get("predicate") or believed.get("predicate")
    measured = [
        item
        for item in records.get("claims") or []
        if item.get("subject_ref") == subject and item.get("predicate_ref") == predicate
    ]
    known_ids = _contributor_ids(known)
    believed_ids = _contributor_ids(believed)
    late_ids = believed_ids - known_ids
    known_sum = _contributor_sum(known)
    believed_sum = _contributor_sum(believed)
    known_value = _number(known.get("value"))
    believed_value = _number(believed.get("value"))
    committed_ops = {item.get("operation_id") for item in receipts if item.get("operation_id")}
    denied_ops = {
        (item.get("details") or {}).get("operation_id")
        or ((item.get("details") or {}).get("receipt") or {}).get("operation_id")
        for item in denied
    }
    denied_ops.discard(None)
    effect_parents = {item.get("parent_operation_id") for item in requests}
    envelope_link = any(
        item.get("relation") == "committed-as" and str(item.get("cause_ref", "")).startswith("operation:")
        for item in records.get("causal_links") or []
    ) or any(
        item.get("relation") == "committed-as" and str(item.get("cause_ref", "")).startswith("operation:")
        for item in explanation.get("causal_links") or []
    )
    proposals = records.get("proposals") or []
    approvals = records.get("approvals") or []
    envelopes = records.get("envelopes") or []
    replay_op = ((replayed[0].get("details") or {}).get("receipt") or {}).get("operation_id") if replayed else None
    if not replay_op and receipts:
        replay_op = receipts[0].get("operation_id")
    matching_receipts = [item for item in receipts if item.get("operation_id") == replay_op] if replay_op else []

    def result(property_id: str, passed: bool, refs: list[str]) -> dict[str, Any]:
        evidence_refs = [item for item in refs if item]
        if not evidence_refs:
            evidence_refs = [f"evidence:unresolved:{property_id}"]
        return {
            "property_id": property_id,
            "passed": bool(passed) and _resolved(index, evidence_refs),
            "evidence_refs": evidence_refs,
        }

    properties = [
        result(
            "RIVAL_CLAIMS_WITH_PROVENANCE",
            len(measured) >= 2
            and len({item.get("value") for item in measured}) >= 2
            and len({(item.get("provenance") or {}).get("source_id") for item in measured}) >= 2
            and all((item.get("provenance") or {}).get("source_locator") and (item.get("provenance") or {}).get("capture_id") for item in measured),
            [item["claim_id"] for item in measured if item.get("claim_id")],
        ),
        result(
            "RELEASE_DENIED_WITHOUT_APPROVAL",
            bool(denied)
            and all(item.get("record_refs") == [] for item in denied)
            and not any(item.get("value") is True for item in records.get("claims") or []),
            [f"command:{item.get('command_id')}" for item in denied if item.get("command_id")],
        ),
        result(
            "DENIED_RELEASE_HAS_NO_OCCURRENCE_OR_EFFECT",
            bool(denied)
            and occurrences == []
            and denied_ops.isdisjoint(effect_parents)
            and all(item.get("outcome") != "committed" for item in receipts if item.get("operation_id") in denied_ops),
            [f"command:{item.get('command_id')}" for item in denied if item.get("command_id")],
        ),
        result(
            "HOLD_COMMITTED",
            bool(committed)
            and bool(requests)
            and bool(committed_ops)
            and effect_parents <= committed_ops,
            [f"receipt:{item}" for item in sorted(committed_ops)] + [item.get("request_id") for item in requests if item.get("request_id")],
        ),
        result(
            "REPLAY_IDEMPOTENT",
            bool(replayed)
            and bool(replay_op)
            and len(matching_receipts) == 1,
            [f"command:{item.get('command_id')}" for item in replayed if item.get("command_id")]
            + ([f"receipt:{replay_op}"] if replay_op else []),
        ),
        result(
            "TIMEOUT_REMAINS_UNKNOWN",
            timeout_cmd.get("outcome") == "unknown"
            and all(item.get("outcome") != "failed" for item in attempts)
            and all(item.get("new_knowledge") != "failed" for item in run.get("effect_knowledge") or []),
            [item for item in [timeout_cmd.get("command_id") and f"command:{timeout_cmd.get('command_id')}", (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
        result(
            "NO_BLIND_RETRY",
            retry_cmd.get("outcome") == "unsafe_retry" and len(attempts) == 1,
            [item for item in [retry_cmd.get("command_id") and f"command:{retry_cmd.get('command_id')}", (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
        result(
            "RECONCILIATION_CONFIRMED",
            bool(reconciliations)
            and reconciliations[0].get("resulting_knowledge") == "confirmed"
            and any(item.get("outcome") == "sent_no_response" for item in attempts),
            [item for item in [(reconciliations[0].get("reconciliation_id") if reconciliations else None), (attempts[0].get("attempt_id") if attempts else None)] if item],
        ),
        result(
            "KNOWN_THEN_EXCLUDES_LATE",
            known_sum is not None
            and known_value == known_sum
            and bool(known_ids)
            and bool(late_ids)
            and known_ids.isdisjoint(late_ids),
            ["query:known-then", "query:now-believed-for-then"],
        ),
        result(
            "NOW_BELIEVED_INCLUDES_LATE",
            believed_sum is not None
            and believed_value == believed_sum
            and late_ids
            and late_ids <= believed_ids,
            ["query:known-then", "query:now-believed-for-then"],
        ),
        result(
            "KNOWN_DIFFERS_FROM_BELIEVED",
            known_value is not None
            and believed_value is not None
            and known_value != believed_value
            and known.get("contributor_digest") != believed.get("contributor_digest")
            and known_ids != believed_ids,
            ["query:known-then", "query:now-believed-for-then"],
        ),
        result(
            "EXPLANATION_COMPLETE",
            explanation.get("complete") is True
            and list(explanation.get("gaps") or []) == []
            and bool(explanation.get("inputs"))
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
            [f"explanation:{explanation.get('reference')}"] if explanation.get("reference") else [],
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
    ]
    return {
        "contract_version": "kernel-v002-comparison/1",
        "scenario_id": run.get("scenario_id"),
        "engine": run.get("engine"),
        "input_digest": run.get("input_digest"),
        "source_sha": run.get("source_sha"),
        "property_results": properties,
    }
