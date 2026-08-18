from __future__ import annotations

from typing import Any

from os_kernel.canonical import copy_structure
from os_kernel.errors import InternalError
from os_kernel.model import (
    Approval,
    CausalLink,
    Claim,
    ContextualIdentity,
    Delegation,
    EffectAttempt,
    EffectKnowledgeRecord,
    EffectRequest,
    Entity,
    Occurrence,
    OperationEnvelope,
    OperationReceipt,
    Proposal,
    ReconciliationRecord,
    RuleDecision,
)


class Store:
    def __init__(self) -> None:
        self._revision = 0
        self._tables: dict[str, dict[str, Any]] = {
            "entities": {},
            "contextual_identities": {},
            "claims": {},
            "delegations": {},
            "proposals": {},
            "approvals": {},
            "envelopes": {},
            "receipts": {},
            "rule_decisions": {},
            "occurrences": {},
            "effect_requests": {},
            "effect_attempts": {},
            "effect_knowledge": {},
            "reconciliations": {},
            "causal_links": {},
            "definition_revisions": {},
        }
        self._stage: dict[str, dict[str, Any]] | None = None
        self._stage_revision: int | None = None

    def current_revision(self) -> str:
        return f"kr:{self._revision:04d}"

    def _next_revision(self) -> str:
        if self._stage is not None:
            if self._stage_revision is None:
                self._stage_revision = self._revision
            self._stage_revision += 1
            return f"kr:{self._stage_revision:04d}"
        self._revision += 1
        return f"kr:{self._revision:04d}"

    def _begin(self) -> None:
        if self._stage is not None:
            raise InternalError("store_stage", "a staged commit is already open")
        self._stage = copy_structure(self._tables)
        self._stage_revision = self._revision

    def _commit(self) -> None:
        if self._stage is None:
            raise InternalError("store_stage", "no staged commit to apply")
        self._tables = self._stage
        if self._stage_revision is not None:
            self._revision = self._stage_revision
        self._stage = None
        self._stage_revision = None

    def _rollback(self) -> None:
        self._stage = None
        self._stage_revision = None

    def _active(self) -> dict[str, dict[str, Any]]:
        return self._stage if self._stage is not None else self._tables

    def _copy(self, value: Any) -> Any:
        return copy_structure(value)

    def _put(self, table: str, key: str, value: Any) -> None:
        active = self._active()
        if key in active[table]:
            raise InternalError("append_only", f"{table} already contains {key}")
        active[table][key] = self._copy(value)

    def _put_entity(self, entity: Entity) -> None:
        self._put("entities", entity.entity_id, entity)

    def _put_identity(self, identity: ContextualIdentity) -> None:
        self._put("contextual_identities", identity.identity_id, identity)

    def _put_claim(self, claim: Claim) -> None:
        self._put("claims", claim.claim_id, claim)

    def _put_delegation(self, delegation: Delegation) -> None:
        self._put("delegations", delegation.delegation_id, delegation)

    def _put_proposal(self, proposal: Proposal) -> None:
        self._put("proposals", proposal.proposal_id, proposal)

    def _put_approval(self, approval: Approval) -> None:
        self._put("approvals", approval.approval_id, approval)

    def _put_envelope(self, envelope: OperationEnvelope) -> None:
        self._put("envelopes", self._operation_key(envelope.authority_namespace, envelope.operation_id), envelope)

    def _put_receipt(self, receipt: OperationReceipt) -> None:
        self._put("receipts", self._operation_key(receipt.authority_namespace, receipt.operation_id), receipt)

    def _put_rule_decision(self, decision: RuleDecision) -> None:
        self._put("rule_decisions", decision.decision_id, decision)

    def _put_occurrence(self, occurrence: Occurrence) -> None:
        self._put("occurrences", occurrence.occurrence_id, occurrence)

    def _put_effect_request(self, request: EffectRequest) -> None:
        self._put("effect_requests", request.request_id, request)

    def _put_effect_attempt(self, attempt: EffectAttempt) -> None:
        self._put("effect_attempts", attempt.attempt_id, attempt)

    def _put_effect_knowledge(self, record: EffectKnowledgeRecord) -> None:
        self._put("effect_knowledge", record.record_id, record)

    def _put_reconciliation(self, record: ReconciliationRecord) -> None:
        self._put("reconciliations", record.reconciliation_id, record)

    def _put_link(self, link: CausalLink) -> None:
        self._put("causal_links", link.link_id, link)

    def _put_definition_revision(self, revision_id: str, bundle: Any) -> None:
        self._put("definition_revisions", revision_id, bundle)

    @staticmethod
    def _operation_key(namespace: str, operation_id: str) -> str:
        return f"{namespace}:{operation_id}"

    def get(self, table: str, key: str) -> Any | None:
        value = self._active()[table].get(key)
        return self._copy(value) if value is not None else None

    def all(self, table: str) -> list[Any]:
        return [self._copy(item) for item in self._active()[table].values()]

    def keys(self, table: str) -> list[str]:
        return list(self._active()[table].keys())

    def claims(self) -> list[Claim]:
        return [self._copy(item) for item in self._active()["claims"].values()]

    def receipt_for(self, namespace: str, operation_id: str) -> OperationReceipt | None:
        return self.get("receipts", self._operation_key(namespace, operation_id))

    def envelope_for(self, namespace: str, operation_id: str) -> OperationEnvelope | None:
        return self.get("envelopes", self._operation_key(namespace, operation_id))

    def latest_knowledge(self, request_id: str) -> str:
        records = [item for item in self.all("effect_knowledge") if item.request_id == request_id]
        if not records:
            return "not_attempted"
        records.sort(key=lambda item: item.known_revision)
        return records[-1].new_knowledge

    def record_counts(self) -> dict[str, int]:
        return {name: len(rows) for name, rows in self._active().items()}
