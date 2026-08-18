from __future__ import annotations

from typing import Any

from services.errors import InputError
from services.ledger import Ledger, qualify

RUN_EXAMPLE = "os scenario run v001 --output json"


def attribution_of(payload: dict[str, Any] | None) -> dict[str, str]:
    if not payload:
        raise InputError("missing_attribution", "attribution is required", RUN_EXAMPLE)
    fields = {
        "actor_id": payload.get("actor_id"),
        "represented_principal_id": payload.get("represented_principal_id"),
        "workload_id": payload.get("workload_id"),
        "delegation_id": payload.get("delegation_id"),
    }
    if "principal_id" in payload:
        raise InputError("collapsed_principal", "principal_id is not an attribution dimension", RUN_EXAMPLE)
    if any(not value for value in fields.values()):
        raise InputError("incomplete_attribution", "actor, principal, workload and delegation must all be present", RUN_EXAMPLE)
    if len(set(fields.values())) != 4:
        raise InputError("collapsed_attribution", "attribution dimensions must be distinct", RUN_EXAMPLE)
    return fields


class AuthorityService:
    def __init__(self, ledger: Ledger) -> None:
        self.ledger = ledger

    def remember_delegation(self, raw: dict[str, Any] | None, attribution: dict[str, str]) -> dict[str, Any]:
        if raw:
            record = {
                "delegation_id": raw["delegation_id"],
                "grantor_id": raw.get("grantor_id"),
                "actor_id": raw.get("actor_id") or attribution["actor_id"],
                "represented_principal_id": raw.get("represented_principal_id") or attribution["represented_principal_id"],
                "action_scope": list(raw.get("action_scope") or []),
                "resource_scope": list(raw.get("resource_scope") or []),
                "purpose": raw.get("purpose"),
                "valid_from": raw.get("valid_from"),
                "valid_until": raw.get("valid_until"),
                "bound_workload_id": raw.get("bound_workload_id") or attribution["workload_id"],
            }
            if self.ledger.get("delegations", record["delegation_id"]) is None:
                self.ledger.put("delegations", record["delegation_id"], record)
            return record
        stored = self.ledger.get("delegations", attribution["delegation_id"])
        if stored is None:
            raise InputError("unknown_delegation", "commit requires the stored delegation", RUN_EXAMPLE)
        return stored

    def approve(self, command: dict[str, Any]) -> dict[str, Any]:
        proposal = self.ledger.get("proposals", command["proposal_id"])
        if proposal is None:
            raise InputError("unknown_proposal", "approval requires a stored proposal", RUN_EXAMPLE)
        approver = attribution_of(command.get("attribution"))
        revision = self.ledger.next_revision()
        approval = {
            "approval_id": command["approval_id"],
            "proposal_ref": proposal["proposal_id"],
            "proposal_digest": proposal["intent_digest"],
            "approved_bounds": dict(command.get("approved_bounds") or {}),
            "state_basis_ref": proposal["state_basis"]["basis_id"],
            "attribution": approver,
            "known_revision": revision,
        }
        self.ledger.put("approvals", approval["approval_id"], approval)
        return {
            "command_type": "RecordApproval",
            "outcome": "approved",
            "known_revision": revision,
            "record_refs": [qualify("approval", approval["approval_id"])],
            "details": {
                "approval_id": approval["approval_id"],
                "proposal_digest": approval["proposal_digest"],
                "state_basis_ref": approval["state_basis_ref"],
            },
        }
