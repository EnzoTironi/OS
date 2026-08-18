from __future__ import annotations

import os_kernel.protocol as protocol
from os_kernel.definitions import resolve_computation
from os_kernel.effects import reduce_attempt
from os_kernel.expression import EvalContext, evaluate
from os_kernel.kernel import Kernel
from os_kernel.model import Claim, CommandReceipt, EffectAttempt, EffectKnowledgeRecord, Occurrence, ValidTime
from os_kernel.temporal import evaluate_quantity


def _store(kernel: Kernel):
    return object.__getattribute__(kernel, "_Kernel__store")


class CollapsedAttribution:
    def __init__(self, principal_id: str) -> None:
        self.principal_id = principal_id
        self.actor_id = principal_id
        self.represented_principal_id = principal_id
        self.workload_id = principal_id
        self.delegation_id = principal_id

    def as_dict(self) -> dict[str, str]:
        return {
            "principal_id": self.principal_id,
            "actor_id": self.actor_id,
            "represented_principal_id": self.represented_principal_id,
            "workload_id": self.workload_id,
            "delegation_id": self.delegation_id,
        }


class MergeRivalClaimsKernel(Kernel):
    def apply(self, command):
        receipt = super().apply(command)
        store = _store(self)
        latest: dict[tuple[str, str], str] = {}
        for claim_id, claim in list(store._tables["claims"].items()):
            key = (claim.subject_ref, claim.predicate_ref)
            if key in latest:
                store._tables["claims"].pop(latest[key], None)
            latest[key] = claim_id
        return receipt


class AcceptStaleApprovalKernel(Kernel):
    def _commit(self, command: dict) -> CommandReceipt:
        store = _store(self)
        proposal = store.get("proposals", command["proposal_id"])
        if proposal is None:
            return super()._commit(command)
        original = protocol.capture_basis

        def frozen(*_args, **_kwargs):
            return proposal.state_basis

        protocol.capture_basis = frozen
        try:
            return super()._commit(command)
        finally:
            protocol.capture_basis = original


class TimeoutIsFailedKernel(Kernel):
    def _attempt(self, command: dict) -> CommandReceipt:
        receipt = super()._attempt(command)
        if command.get("outcome") == "sent_no_response" and receipt.outcome == "unknown":
            return CommandReceipt(
                receipt.command_type,
                "failed",
                receipt.known_revision,
                receipt.record_refs,
                {**receipt.details, "knowledge": "failed"},
            )
        return receipt


class BlindRetryAfterUnknownKernel(Kernel):
    def _attempt(self, command: dict) -> CommandReceipt:
        store = _store(self)
        request = store.get("effect_requests", command["request_id"])
        if request is None:
            return super()._attempt(command)
        knowledge = store.latest_knowledge(request.request_id)
        if knowledge != "unknown":
            return super()._attempt(command)
        revision = store._next_revision()
        attempt = EffectAttempt(
            attempt_id=command.get("attempt_id") or self._ids.next("attempt"),
            request_id=request.request_id,
            request_digest=request.intent_digest,
            started_revision=revision,
            observed_revision=revision,
            outcome=command["outcome"],
            transport_evidence=command.get("transport_evidence") or {},
        )
        store._put_effect_attempt(attempt)
        store._put_effect_knowledge(
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
        return CommandReceipt(
            "RecordEffectAttempt",
            "retried",
            revision,
            (f"attempt:{attempt.attempt_id}",),
            {"knowledge": "unknown"},
        )


class ReplayUnderCurrentRevisionKernel(Kernel):
    def _commit(self, command: dict) -> CommandReceipt:
        store = _store(self)
        namespace = command.get("authority_namespace") or command.get("namespace") or "v001"
        existing = store.receipt_for(namespace, command["operation_id"])
        if existing is None:
            return super()._commit(command)
        planner = resolve_computation(self._current, next(iter(self._current.actions.values())).planner_ref)
        value = evaluate(
            planner.expression,
            EvalContext({"proposed_quantity": 1, "current_available": 1, "basis_available": 1}, store),
        )
        quantity = value.get("quantity") if isinstance(value, dict) else value
        return CommandReceipt(
            "CommitOperation",
            "replayed",
            store.current_revision(),
            (),
            {"receipt": {"committed_quantity": quantity, "intent_digest": existing.intent_digest}, "replayed": True},
        )


class CollapseActorAndWorkloadKernel(Kernel):
    def _propose(self, command: dict) -> CommandReceipt:
        receipt = super()._propose(command)
        store = _store(self)
        stored = store._tables["proposals"].get(command["proposal_id"])
        if stored is not None:
            object.__setattr__(stored, "proposer", CollapsedAttribution(command["attribution"]["actor_id"]))
        return receipt


class RawWriteBypassKernel(Kernel):
    def write_authoritative_claim(self, claim: Claim) -> None:
        store = _store(self)
        store._put_claim(claim)


class ActionIsOccurrenceKernel(Kernel):
    def _commit(self, command: dict) -> CommandReceipt:
        receipt = super()._commit(command)
        if receipt.outcome != "committed":
            return receipt
        store = _store(self)
        claims = store.claims()
        if not claims or not self._current.types:
            return receipt
        type_def = next(iter(self._current.types.values()))
        store._put_occurrence(
            Occurrence(
                occurrence_id=f"occurrence:action-{command['operation_id']}",
                occurrence_ref=type_def.definition_ref,
                valid_time=ValidTime(instant=self._clock.now()),
                known_revision=receipt.known_revision,
                payload={"action": command["operation_id"]},
                provenance=claims[0].provenance,
                causal_operation_ref=command["operation_id"],
            )
        )
        return receipt


class OverwriteEvidenceKernel(Kernel):
    def _record_claim(self, command: dict) -> CommandReceipt:
        receipt = super()._record_claim(command)
        store = _store(self)
        for claim in store._tables["claims"].values():
            if (
                claim.subject_ref == command["subject_ref"]
                and claim.predicate_ref == command["predicate_ref"]
                and claim.claim_id != command["claim_id"]
            ):
                object.__setattr__(claim, "value", command["value"])
        return receipt


class CollapseKnownThenKernel(Kernel):
    def query(self, query: dict) -> dict:
        if query.get("type") in {"known-then", "now-believed-for-then"}:
            store = _store(self)
            result = evaluate_quantity(
                self._current,
                store,
                query["subject"],
                query["predicate"],
                query["valid_at"],
                None,
            )
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

ASSIGNED_PROPERTIES = {
    "merge-rival-claims": "P1_RIVAL_CLAIMS_WITH_PROVENANCE",
    "accept-stale-approval": "P6_STALE_APPROVAL_REVALIDATED",
    "timeout-is-failed": "P8_TIMEOUT_REMAINS_UNKNOWN",
    "blind-retry-after-unknown": "P8_NO_BLIND_RETRY",
    "replay-under-current-revision": "REVISION_PINNED_REPLAY",
    "collapse-actor-and-workload": "ATTRIBUTION_DIMENSIONS_SEPARATE",
    "raw-write-bypass": "NO_AUTHORITATIVE_WRITE_BYPASS",
    "action-is-occurrence": "ACTION_IS_NOT_OCCURRENCE",
    "overwrite-evidence": "EVIDENCE_IS_APPEND_ONLY",
    "collapse-known-then": "P10_KNOWN_THEN_DIFFERS",
}

ALLOWED_FAILURES = {
    "merge-rival-claims": {
        "P1_RIVAL_CLAIMS_WITH_PROVENANCE": "later evidence replaces earlier rivals instead of keeping them",
        "EVIDENCE_IS_APPEND_ONLY": "the dropped rivals are missing from the late-evidence after digest",
    },
    "accept-stale-approval": {
        "P6_STALE_APPROVAL_REVALIDATED": "commit reuses the proposal basis so stale never appears",
    },
    "timeout-is-failed": {
        "P8_TIMEOUT_REMAINS_UNKNOWN": "timeout command receipt is rewritten to failed",
    },
    "blind-retry-after-unknown": {
        "P8_NO_BLIND_RETRY": "a second attempt is written while knowledge is still unknown",
    },
    "replay-under-current-revision": {
        "REVISION_PINNED_REPLAY": "replay evaluates the current planner and disagrees with the stored receipt",
    },
    "collapse-actor-and-workload": {
        "ATTRIBUTION_DIMENSIONS_SEPARATE": "proposal attribution collapses the four dimensions into principal_id",
    },
    "raw-write-bypass": {
        "NO_AUTHORITATIVE_WRITE_BYPASS": "the extra public write changes the isolated record digest",
    },
    "action-is-occurrence": {
        "ACTION_IS_NOT_OCCURRENCE": "commit also writes an occurrence keyed to the operation",
    },
    "overwrite-evidence": {
        "EVIDENCE_IS_APPEND_ONLY": "later evidence mutates the values of earlier claims",
    },
    "collapse-known-then": {
        "P10_KNOWN_THEN_DIFFERS": "both temporal queries ignore the knowledge cut",
    },
}
