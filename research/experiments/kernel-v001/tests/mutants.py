from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from os_kernel.effects import reduce_attempt
from os_kernel.kernel import Kernel
from os_kernel.model import CommandReceipt, Occurrence, ValidTime
from os_kernel.temporal import evaluate_quantity


class MergeRivalClaimsKernel(Kernel):
    def apply(self, command):
        receipt = super().apply(command)
        latest: dict[tuple[str, str], str] = {}
        for claim in list(self._store.claims()):
            key = (claim.subject_ref, claim.predicate_ref)
            if key in latest:
                self._store._active()["claims"].pop(latest[key], None)
            latest[key] = claim.claim_id
        return receipt


class AcceptStaleApprovalKernel(Kernel):
    def _commit(self, command: dict[str, Any]) -> CommandReceipt:
        proposal = self._store.get("proposals", command["proposal_id"])
        import os_kernel.protocol as protocol

        original = protocol.capture_basis

        def frozen(*_args, **_kwargs):
            return proposal.state_basis

        protocol.capture_basis = frozen
        try:
            return super()._commit(command)
        finally:
            protocol.capture_basis = original


class TimeoutIsFailedKernel(Kernel):
    def _attempt(self, command: dict[str, Any]) -> CommandReceipt:
        receipt = super()._attempt(command)
        if command.get("outcome") == "sent_no_response":
            for record in self._store.all("effect_knowledge"):
                if record.new_knowledge == "unknown":
                    object.__setattr__(record, "new_knowledge", "failed")
            return CommandReceipt(receipt.command_type, "failed", receipt.known_revision, receipt.record_refs, {**receipt.details, "knowledge": "failed"})
        return receipt


class BlindRetryAfterUnknownKernel(Kernel):
    def _attempt(self, command: dict[str, Any]) -> CommandReceipt:
        request = self._store.get("effect_requests", command["request_id"])
        if request is None:
            return super()._attempt(command)
        knowledge = self._store.latest_knowledge(request.request_id)
        if knowledge == "unknown":
            revision = self._store.next_revision()
            from os_kernel.model import EffectAttempt, EffectKnowledgeRecord

            attempt = EffectAttempt(
                attempt_id=command.get("attempt_id") or self._ids.next("attempt"),
                request_id=request.request_id,
                request_digest=request.intent_digest,
                started_revision=revision,
                observed_revision=revision,
                outcome=command["outcome"],
                transport_evidence=command.get("transport_evidence") or {},
            )
            self._store.put_effect_attempt(attempt)
            self._store.put_effect_knowledge(
                EffectKnowledgeRecord(
                    record_id=self._ids.next("ek"),
                    request_id=request.request_id,
                    prior_knowledge=knowledge,
                    evidence_refs=(f"attempt:{attempt.attempt_id}",),
                    new_knowledge=reduce_attempt(knowledge, attempt.outcome),
                    reducer_ref=None,
                    known_revision=revision,
                )
            )
            return CommandReceipt("RecordEffectAttempt", "retried", revision, (f"attempt:{attempt.attempt_id}",), {"knowledge": "unknown"})
        return super()._attempt(command)


class ReplayUnderCurrentRevisionKernel(Kernel):
    def _commit(self, command: dict[str, Any]) -> CommandReceipt:
        existing = self._store.receipt_for(command.get("authority_namespace", "v001"), command["operation_id"])
        if existing is None:
            return super()._commit(command)
        from os_kernel.definitions import resolve_computation
        from os_kernel.expression import EvalContext, evaluate

        planner = resolve_computation(self._current, self._current.actions[next(iter(self._current.actions))].planner_ref)
        value = evaluate(planner.expression, EvalContext({"proposed_quantity": 1, "current_available": 1, "basis_available": 1}, self._store))
        quantity = value.get("quantity") if isinstance(value, dict) else value
        object.__setattr__(existing, "committed_quantity", quantity)
        return CommandReceipt("CommitOperation", "replayed", self._store.current_revision(), (), {"receipt": {"committed_quantity": quantity}, "replayed": True})


class CollapseActorAndWorkloadKernel(Kernel):
    def _propose(self, command: dict[str, Any]) -> CommandReceipt:
        receipt = super()._propose(command)
        proposal = self._store.get("proposals", command["proposal_id"])
        collapsed = {"principal_id": command["attribution"]["actor_id"]}
        object.__setattr__(proposal, "proposer", type("P", (), collapsed)())
        return receipt


class RawWriteBypassKernel(Kernel):
    def append(self, table: str, key: str, value: Any) -> None:
        self._store._put(table, key, value)

    def set_state(self, key: str, value: Any) -> None:
        self._store._active().setdefault("claims", {})[key] = value


class ActionIsOccurrenceKernel(Kernel):
    def _commit(self, command: dict[str, Any]) -> CommandReceipt:
        receipt = super()._commit(command)
        if receipt.outcome == "committed":
            self._store.put_occurrence(
                Occurrence(
                    occurrence_id=f"occurrence:{command['operation_id']}",
                    occurrence_ref=self._current.types[next(iter(self._current.types))].definition_ref,
                    valid_time=ValidTime(instant=self._clock.now()),
                    known_revision=receipt.known_revision,
                    payload={"action": command["operation_id"]},
                    provenance=self._store.claims()[0].provenance,
                    causal_operation_ref=command["operation_id"],
                )
            )
        return receipt


class OverwriteEvidenceKernel(Kernel):
    def _record_claim(self, command: dict[str, Any]) -> CommandReceipt:
        receipt = super()._record_claim(command)
        for claim in list(self._store.claims()):
            if claim.subject_ref == command["subject_ref"] and claim.predicate_ref == command["predicate_ref"] and claim.claim_id != command["claim_id"]:
                object.__setattr__(claim, "value", command["value"])
        return receipt


class CollapseKnownThenKernel(Kernel):
    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        if query.get("type") in {"known-then", "now-believed-for-then"}:
            result = evaluate_quantity(self._current, self._store, query["subject"], query["predicate"], query["valid_at"], None)
            result["type"] = query["type"]
            return result
        return super().query(query)


MUTANTS = {
    "merge-rival-claims": MergeRivalClaimsKernel,
    "accept-stale-approval": AcceptStaleApprovalKernel,
    "timeout-is-failed": TimeoutIsFailedKernel,
    "blind-retry-after-unknown": BlindRetryAfterUnknownKernel,
    "replay-under-current-revision": ReplayUnderCurrentRevisionKernel,
    "collapse-actor-and-workload": CollapseActorAndWorkloadKernel,
    "raw-write-bypass": RawWriteBypassKernel,
    "action-is-occurrence": ActionIsOccurrenceKernel,
    "overwrite-evidence": OverwriteEvidenceKernel,
    "collapse-known-then": CollapseKnownThenKernel,
}
