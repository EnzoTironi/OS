from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from os_kernel.canonical import digest
from os_kernel.errors import InputError, InternalError
from os_kernel.model import ValidTime

SCHEMAS = Path(__file__).resolve().parent.parent / "schemas"
INVOCATION = "os scenario run v001 --output json"
QUERY_INVOCATION = (
    "os query known-then --scenario v001 --subject <subject> "
    "--predicate <predicate> --valid-at <date> --known-at <cut> --output json"
)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$")
FORMAT_CHECKER = Draft202012Validator.FORMAT_CHECKER
REF_KINDS = (
    "claim",
    "approval",
    "basis",
    "effect",
    "proposal",
    "receipt",
    "attempt",
    "recon",
    "entity",
    "occurrence",
    "link",
    "rule",
    "identity",
    "delegation",
    "defrev",
    "operation",
)
KIND_TABLES = {
    "claim": ("claims", "claim_id"),
    "approval": ("approvals", "approval_id"),
    "proposal": ("proposals", "proposal_id"),
    "receipt": ("receipts", "operation_id"),
    "effect": ("effect_requests", "request_id"),
    "attempt": ("effect_attempts", "attempt_id"),
    "recon": ("reconciliations", "reconciliation_id"),
    "entity": ("entities", "entity_id"),
    "occurrence": ("occurrences", "occurrence_id"),
    "link": ("causal_links", "link_id"),
    "rule": ("rule_decisions", "decision_id"),
    "identity": ("contextual_identities", "identity_id"),
    "delegation": ("delegations", "delegation_id"),
}


def is_rfc3339(value: str) -> bool:
    if not isinstance(value, str):
        return False
    if DATE_RE.fullmatch(value):
        try:
            date.fromisoformat(value)
        except ValueError:
            return False
        return True
    if DATETIME_RE.fullmatch(value):
        normalized = value.replace("Z", "+00:00")
        try:
            datetime.fromisoformat(normalized)
        except ValueError:
            return False
        return True
    return False


def require_rfc3339(value: Any, *, invocation: str = QUERY_INVOCATION) -> str:
    if not isinstance(value, str) or not is_rfc3339(value):
        raise InputError("invalid_valid_time", f"tempo {value!r} não é RFC3339", invocation)
    return value


def parse_valid_time(raw: Any, *, invocation: str = INVOCATION) -> ValidTime:
    if raw is None:
        raise InputError("invalid_valid_time", "valid_time is required", invocation)
    if isinstance(raw, ValidTime):
        _check_valid_time(raw, invocation)
        return raw
    if isinstance(raw, str):
        require_rfc3339(raw, invocation=invocation)
        return ValidTime(instant=raw)
    if isinstance(raw, dict):
        instant = raw.get("instant")
        start = raw.get("start")
        end = raw.get("end")
        for item in (instant, start, end):
            if item is not None:
                require_rfc3339(item, invocation=invocation)
        return ValidTime(instant, start, end)
    raise InputError("invalid_valid_time", "valid_time must be an instant or interval", invocation)


def _check_valid_time(value: ValidTime, invocation: str) -> None:
    for item in (value.instant, value.start, value.end):
        if item is not None:
            require_rfc3339(item, invocation=invocation)


def load_schema(name: str) -> dict[str, Any]:
    path = SCHEMAS / name
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InternalError("invalid_schema", f"schema {name} is not valid JSON") from exc
    Draft202012Validator.check_schema(schema)
    return schema


def validator_for(schema: dict[str, Any]) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FORMAT_CHECKER)


def validate_against(schema: dict[str, Any], payload: Any, *, code: str, invocation: str, internal: bool = False) -> None:
    try:
        validator_for(schema).validate(payload)
    except ValidationError as exc:
        message = exc.message
        if internal:
            raise InternalError(code, message) from exc
        raise InputError(code, message, invocation) from exc


def validate_command(payload: dict[str, Any]) -> None:
    validate_against(load_schema("command.schema.json"), payload, code="invalid_command", invocation=INVOCATION)


def validate_query(payload: dict[str, Any]) -> None:
    validate_against(load_schema("query.schema.json"), payload, code="invalid_query", invocation=QUERY_INVOCATION)
    if payload.get("type") in {"known-then", "now-believed-for-then"}:
        require_rfc3339(payload.get("valid_at"))


def validate_scenario(payload: dict[str, Any], *, internal: bool = True) -> None:
    validate_against(
        load_schema("scenario-input.schema.json"),
        payload,
        code="invalid_scenario",
        invocation=INVOCATION,
        internal=internal,
    )


def validate_definition_document(payload: dict[str, Any]) -> None:
    validate_against(
        load_schema("definition-bundle.schema.json"),
        payload,
        code="invalid_definition",
        invocation=INVOCATION,
    )


def validate_json_schema(schema: Any, path: str) -> None:
    if schema in ({}, None):
        return
    if not isinstance(schema, dict):
        raise InputError("invalid_definition", f"{path} must be a JSON Schema object", INVOCATION)
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:
        raise InputError("invalid_definition", f"{path} is not a valid JSON Schema: {exc}", INVOCATION) from exc


def validate_value(schema: dict[str, Any], value: Any, *, code: str = "invalid_typed_value") -> None:
    if not schema:
        return
    try:
        validator_for(schema).validate(value)
    except ValidationError as exc:
        raise InputError(code, exc.message, INVOCATION) from exc


def qualify(kind: str, identifier: str) -> str:
    prefix = f"{kind}:"
    text = identifier
    while text.startswith(prefix):
        text = text[len(prefix):]
    return prefix + text


def parse_ref(reference: str) -> tuple[str, str]:
    if not isinstance(reference, str) or ":" not in reference:
        raise InputError("invalid_ref", f"ref {reference!r} is not a protocol ref", INVOCATION)
    kind, remainder = reference.split(":", 1)
    if kind not in REF_KINDS or not remainder:
        raise InputError("invalid_ref", f"ref {reference!r} has an unknown kind", INVOCATION)
    return kind, qualify(kind, remainder)


def _row_id(row: Any, attr: str) -> str:
    if isinstance(row, dict):
        return str(row.get(attr, ""))
    return str(getattr(row, attr))


def _qualified_id(kind: str, identifier: str) -> str:
    prefix = f"{kind}:"
    if identifier.startswith(prefix):
        return identifier
    return prefix + identifier


def _local_suffix(identifier: str) -> str:
    return identifier.rsplit(":", 1)[-1]


@dataclass(frozen=True)
class _RefCandidate:
    kind: str
    qualified: str
    local: str
    row: Any


def _candidate(kind: str, identifier: str, row: Any) -> _RefCandidate | None:
    if not identifier:
        return None
    return _RefCandidate(kind, _qualified_id(kind, identifier), _local_suffix(identifier), row)


def _dedupe_candidates(candidates: list[_RefCandidate]) -> list[_RefCandidate]:
    unique: dict[tuple[str, str], _RefCandidate] = {}
    for item in candidates:
        key = (item.kind, item.qualified)
        if key not in unique:
            unique[key] = item
    return list(unique.values())


def _table_candidates(store: Any, kind: str) -> list[_RefCandidate]:
    table, attr = KIND_TABLES[kind]
    found: list[_RefCandidate] = []
    for row in store.all(table):
        item = _candidate(kind, _row_id(row, attr), row)
        if item is not None:
            found.append(item)
    return _dedupe_candidates(found)


def _embedded_basis(row: Any) -> Any | None:
    if isinstance(row, Mapping):
        return row.get("state_basis")
    return getattr(row, "state_basis", None)


def _basis_id(basis: Any) -> str:
    if isinstance(basis, Mapping):
        return str(basis.get("basis_id", ""))
    return str(getattr(basis, "basis_id", ""))


def _receipt_result(row: Any) -> Any:
    if isinstance(row, Mapping):
        return row.get("result")
    return getattr(row, "result", None)


def _basis_candidates(store: Any) -> list[_RefCandidate]:
    found: list[_RefCandidate] = []
    for proposal in store.all("proposals"):
        basis = _embedded_basis(proposal)
        if basis is None:
            continue
        item = _candidate("basis", _basis_id(basis), basis)
        if item is not None:
            found.append(item)
    for approval in store.all("approvals"):
        basis = _embedded_basis(approval)
        if basis is None:
            continue
        item = _candidate("basis", _basis_id(basis), basis)
        if item is not None:
            found.append(item)
    for receipt in store.all("receipts"):
        result = _receipt_result(receipt)
        embedded = result.get("commit_basis") if isinstance(result, Mapping) else None
        if isinstance(embedded, Mapping):
            item = _candidate("basis", str(embedded.get("basis_id", "")), embedded)
            if item is not None:
                found.append(item)
    return _dedupe_candidates(found)


def _defrev_candidates(store: Any) -> list[_RefCandidate]:
    found: list[_RefCandidate] = []
    for key in store.keys("definition_revisions"):
        item = _candidate("defrev", key, store.get("definition_revisions", key))
        if item is not None:
            found.append(item)
    return _dedupe_candidates(found)


def _envelope_namespace(row: Any) -> str:
    if isinstance(row, Mapping):
        return str(row.get("authority_namespace", "") or "")
    return str(getattr(row, "authority_namespace", "") or "")


def _envelope_operation_id(row: Any) -> str:
    if isinstance(row, Mapping):
        return str(row.get("operation_id", "") or "")
    return str(getattr(row, "operation_id", "") or "")


def _envelope_candidates(store: Any) -> list[_RefCandidate]:
    found: list[_RefCandidate] = []
    for row in store.all("envelopes"):
        namespace = _envelope_namespace(row)
        operation_id = _envelope_operation_id(row)
        if not namespace or not operation_id:
            continue
        item = _candidate("operation", f"{namespace}:{operation_id}", row)
        if item is not None:
            found.append(item)
    return _dedupe_candidates(found)


def _candidates_by_kind(store: Any) -> dict[str, list[_RefCandidate]]:
    grouped = {name: [] for name in REF_KINDS}
    for kind in KIND_TABLES:
        grouped[kind] = _table_candidates(store, kind)
    grouped["basis"] = _basis_candidates(store)
    grouped["defrev"] = _defrev_candidates(store)
    grouped["operation"] = _envelope_candidates(store)
    return grouped


def _unprefixed(item: _RefCandidate) -> str:
    prefix = f"{item.kind}:"
    if item.qualified.startswith(prefix):
        return item.qualified[len(prefix):]
    return item.qualified


def _other_kind_hits(
    kind: str,
    remainder: str,
    requested: str,
    local_request: bool,
    grouped: dict[str, list[_RefCandidate]],
) -> bool:
    for other, items in grouped.items():
        if other == kind:
            continue
        for item in items:
            if item.qualified == requested or _unprefixed(item) == remainder:
                return True
            if local_request and item.local == remainder:
                return True
    return False


def _one_row(matches: list[_RefCandidate], reference: str) -> Any:
    if len(matches) == 1:
        return matches[0].row
    raise InputError("ambiguous_ref", f"ref {reference} is ambiguous", INVOCATION)


def resolve_protocol_ref(store: Any, reference: str) -> Any:
    kind, _ = parse_ref(reference)
    remainder = reference.split(":", 1)[1]
    grouped = _candidates_by_kind(store)
    requested = _qualified_id(kind, remainder)
    local_request = ":" not in remainder
    own = grouped.get(kind, [])
    exact = [item for item in own if item.qualified == requested]
    if exact:
        return _one_row(exact, reference)
    if local_request:
        local_hits = [item for item in own if item.local == remainder]
        if local_hits:
            return _one_row(local_hits, reference)
    if _other_kind_hits(kind, remainder, requested, local_request, grouped):
        raise InputError("wrong_kind_ref", f"ref {reference} does not match kind {kind}", INVOCATION)
    raise InputError("dangling_ref", f"ref {reference} does not resolve", INVOCATION)


def schema_for_predicate(bundle: Any, predicate_ref: str) -> dict[str, Any]:
    type_def = bundle.types.get(predicate_ref)
    if type_def is not None:
        return type_def.value_schema
    relation = bundle.relations.get(predicate_ref)
    if relation is not None:
        return relation.value_schema
    computation = bundle.computations.get(predicate_ref)
    if computation is not None:
        return computation.result_schema
    matches = [item for item in bundle.computations.values() if item.result_predicate == predicate_ref]
    if len(matches) == 1:
        return matches[0].result_schema
    if len(matches) > 1:
        raise InputError("ambiguous_predicate", f"predicate {predicate_ref} matches more than one schema", INVOCATION)
    raise InputError("unknown_predicate", f"predicate {predicate_ref} has no pinned schema", INVOCATION)


def check_delegation(
    delegation: Any,
    attribution: Any,
    action_id: str,
    resources: list[str],
    now: str,
    parent: Any | None,
) -> None:
    if delegation.actor_id != attribution.actor_id:
        raise InputError("invalid_delegation", "delegation actor does not match attribution", INVOCATION)
    if delegation.represented_principal_id != attribution.represented_principal_id:
        raise InputError("invalid_delegation", "delegation principal does not match attribution", INVOCATION)
    if delegation.bound_workload_id != attribution.workload_id:
        raise InputError("invalid_delegation", "delegation workload does not match attribution", INVOCATION)
    if action_id not in delegation.action_scope:
        raise InputError("invalid_delegation", "delegation action scope excludes the action", INVOCATION)
    for resource in resources:
        if resource not in delegation.resource_scope:
            raise InputError("invalid_delegation", "delegation resource scope excludes a derived resource", INVOCATION)
    if delegation.valid_from and now < delegation.valid_from:
        raise InputError("invalid_delegation", "delegation is not yet valid", INVOCATION)
    if delegation.valid_until and now > delegation.valid_until:
        raise InputError("invalid_delegation", "delegation has expired", INVOCATION)
    if delegation.revocation_revision:
        raise InputError("invalid_delegation", "delegation has been revoked", INVOCATION)
    if delegation.parent_id and parent is None:
        raise InputError("invalid_delegation", "delegation parent does not resolve", INVOCATION)
    if parent is not None:
        if not set(delegation.action_scope) <= set(parent.action_scope):
            raise InputError("invalid_delegation", "child action scope exceeds parent", INVOCATION)
        if not set(delegation.resource_scope) <= set(parent.resource_scope):
            raise InputError("invalid_delegation", "child resource scope exceeds parent", INVOCATION)


def derived_resources(spec: tuple[dict[str, Any], ...], inputs: Any) -> list[str]:
    resources: list[str] = []
    for item in spec:
        query = item.get("query") or {}
        subject = query.get("subject") or inputs.get(query.get("subject_input", "subject"))
        if subject:
            resources.append(str(subject))
    return resources


def definition_content_digest(raw: dict[str, Any]) -> str:
    return digest(
        {
            "revision_id": raw.get("revision_id"),
            "parent_revision_id": raw.get("parent_revision_id"),
            "types": raw.get("types", []),
            "relations": raw.get("relations", []),
            "computations": raw.get("computations", []),
            "rules": raw.get("rules", []),
            "actions": raw.get("actions", []),
            "effects": raw.get("effects", []),
        }
    )
