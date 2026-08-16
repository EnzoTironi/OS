#!/usr/bin/env python3
"""Small executable research model for issue #41 external-effect semantics.

NOT a connector runtime or target metamodel. The model makes these distinctions
executable:

* one EffectRequest survives several transport Attempts;
* request acceptance/pending differs from confirmed business outcome;
* lost response after send produces indeterminate knowledge, not failure;
* retry safety depends on remote idempotency evidence;
* duplicate/out-of-order observations do not create duplicate effects;
* reconciliation changes knowledge about the original effect;
* compensation is a new EffectRequest and does not erase the original.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256


class Knowledge(str, Enum):
    NOT_ATTEMPTED = "not_attempted"
    PENDING = "pending"
    INDETERMINATE = "indeterminate"
    CONFIRMED_SUCCEEDED = "confirmed_succeeded"
    CONFIRMED_REJECTED = "confirmed_rejected"
    PARTIAL = "partial"
    CANCELLED_BEFORE_ATTEMPT = "cancelled_before_attempt"


class AttemptEvidence(str, Enum):
    DEFINITELY_NOT_SENT = "definitely_not_sent"
    SENT_NO_RESPONSE = "sent_no_response"
    ACCEPTED_PENDING = "accepted_pending"
    CONFIRMED_SUCCEEDED = "confirmed_succeeded"
    DEFINITIVE_REJECTION = "definitive_rejection"
    PARTIAL = "partial"


@dataclass(frozen=True)
class ProtocolContract:
    name: str
    idempotent_replay: bool = False
    idempotency_window_open: bool = False
    authoritative_readback: bool = False


@dataclass(frozen=True)
class Attempt:
    attempt_id: str
    evidence: AttemptEvidence
    remote_receipt_id: str | None = None


@dataclass(frozen=True)
class Observation:
    observation_id: str
    remote_operation_id: str
    knowledge: Knowledge
    authoritative_for_outcome: bool
    provider_sequence: int | None = None


@dataclass
class EffectRequest:
    effect_request_id: str
    local_operation_id: str
    intent_digest: str
    remote_operation_id: str
    protocol: ProtocolContract
    attempts: list[Attempt] = field(default_factory=list)
    observations: dict[str, Observation] = field(default_factory=dict)
    knowledge: Knowledge = Knowledge.NOT_ATTEMPTED
    last_provider_sequence: int | None = None
    cancelled: bool = False

    def record_attempt(self, attempt: Attempt) -> None:
        if self.cancelled and not self.attempts:
            raise ValueError("effect cancelled before first attempt")
        if any(existing.attempt_id == attempt.attempt_id for existing in self.attempts):
            return
        self.attempts.append(attempt)

        if attempt.evidence == AttemptEvidence.DEFINITELY_NOT_SENT:
            # Still no evidence that remote state changed. A later attempt can be
            # made if the effect request itself remains valid.
            self.knowledge = Knowledge.NOT_ATTEMPTED
        elif attempt.evidence == AttemptEvidence.SENT_NO_RESPONSE:
            self.knowledge = Knowledge.INDETERMINATE
        elif attempt.evidence == AttemptEvidence.ACCEPTED_PENDING:
            self.knowledge = Knowledge.PENDING
        elif attempt.evidence == AttemptEvidence.CONFIRMED_SUCCEEDED:
            self.knowledge = Knowledge.CONFIRMED_SUCCEEDED
        elif attempt.evidence == AttemptEvidence.DEFINITIVE_REJECTION:
            self.knowledge = Knowledge.CONFIRMED_REJECTED
        elif attempt.evidence == AttemptEvidence.PARTIAL:
            self.knowledge = Knowledge.PARTIAL

    def can_retry_same_remote_operation(self) -> tuple[bool, str]:
        if self.cancelled and not self.attempts:
            return False, "cancelled before attempt"
        if self.knowledge in {Knowledge.CONFIRMED_SUCCEEDED, Knowledge.PARTIAL}:
            return False, "remote effect already happened at least partially"
        if self.knowledge == Knowledge.PENDING:
            return False, "remote request accepted; reconcile/poll instead of duplicate submission"
        if self.knowledge == Knowledge.CONFIRMED_REJECTED:
            return False, "definitive rejection; retry requires operation-specific policy/reproposal"
        if self.knowledge == Knowledge.NOT_ATTEMPTED:
            return True, "no evidence request reached remote mutation boundary"
        if self.knowledge == Knowledge.INDETERMINATE:
            if self.protocol.idempotent_replay and self.protocol.idempotency_window_open:
                return True, "same remote operation replay is contractually idempotent"
            return False, "indeterminate remote outcome without adequate current idempotency guarantee"
        return False, "retry not established safe"

    def reconcile(self, observation: Observation) -> bool:
        """Return True when this observation changed effect knowledge.

        An observation must correlate exactly to the remote operation in this toy
        model. Real #45 correlation can be probabilistic/candidate and must not be
        auto-confirmed until its assurance policy permits it.
        """
        if observation.observation_id in self.observations:
            return False
        if observation.remote_operation_id != self.remote_operation_id:
            raise ValueError("observation belongs to another remote operation")
        self.observations[observation.observation_id] = observation

        if not observation.authoritative_for_outcome:
            return False

        # If provider supplies sequence/version, stale out-of-order observations
        # must not regress newer authoritative knowledge.
        if observation.provider_sequence is not None:
            if self.last_provider_sequence is not None and observation.provider_sequence < self.last_provider_sequence:
                return False
            self.last_provider_sequence = observation.provider_sequence

        prior = self.knowledge
        self.knowledge = observation.knowledge
        return self.knowledge != prior

    def cancel_before_attempt(self) -> bool:
        if self.attempts:
            return False
        self.cancelled = True
        self.knowledge = Knowledge.CANCELLED_BEFORE_ATTEMPT
        return True


@dataclass
class EffectBook:
    requests: dict[str, EffectRequest] = field(default_factory=dict)

    def create(self, request: EffectRequest) -> EffectRequest:
        existing = self.requests.get(request.effect_request_id)
        if existing is None:
            self.requests[request.effect_request_id] = request
            return request
        if (
            existing.local_operation_id != request.local_operation_id
            or existing.intent_digest != request.intent_digest
            or existing.remote_operation_id != request.remote_operation_id
        ):
            raise ValueError("effect request identity reused for different semantic intent")
        return existing

    def compensate(
        self,
        original_effect_id: str,
        *,
        new_effect_id: str,
        new_local_operation_id: str,
        intent: str,
        remote_operation_id: str,
        protocol: ProtocolContract,
    ) -> EffectRequest:
        original = self.requests[original_effect_id]
        if original.knowledge not in {Knowledge.CONFIRMED_SUCCEEDED, Knowledge.PARTIAL}:
            raise ValueError("compensation requires evidence original effect happened at least partially")
        return self.create(
            EffectRequest(
                effect_request_id=new_effect_id,
                local_operation_id=new_local_operation_id,
                intent_digest=digest(intent),
                remote_operation_id=remote_operation_id,
                protocol=protocol,
            )
        )


def digest(text: str) -> str:
    return sha256(text.encode()).hexdigest()
