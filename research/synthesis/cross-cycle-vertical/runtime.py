#!/usr/bin/env python3
"""Runtime capabilities for the issue #71 reference engine.

These records are explicitly *not* canonical semantic forms. They model the
execution facts any serious runtime needs to preserve around the R6 language:
identity of attempts, state bases, unforgeable authority evidence, external
I/O uncertainty, and explanation metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from hashlib import sha256
import hmac
import json
from typing import Any, Mapping


class RuntimeErrorBase(RuntimeError):
    pass


class StaleBasis(RuntimeErrorBase):
    pass


class AuthorizationError(RuntimeErrorBase):
    pass


class IntentMismatch(RuntimeErrorBase):
    pass


class SemanticConflict(RuntimeErrorBase):
    pass


class UnknownExternalOutcome(RuntimeErrorBase):
    pass


@dataclass(frozen=True)
class ExecutionContext:
    actor: str
    represented_principal: str
    workload: str
    authority_domain: str


@dataclass(frozen=True)
class BasisDependency:
    key: str
    mode: str  # current | pinned
    version: int | None = None
    digest: str | None = None

    def __post_init__(self) -> None:
        if self.mode not in {"current", "pinned"}:
            raise ValueError("basis dependency mode must be current or pinned")
        if self.mode == "current" and self.version is None:
            raise ValueError("current dependency requires version")
        if self.mode == "pinned" and self.digest is None:
            raise ValueError("pinned dependency requires digest")


@dataclass(frozen=True)
class StateBasis:
    dependencies: tuple[BasisDependency, ...]

    def digest(self) -> str:
        rows = [
            {
                "key": d.key,
                "mode": d.mode,
                "version": d.version,
                "digest": d.digest,
            }
            for d in self.dependencies
        ]
        return digest_json(rows)


@dataclass(frozen=True)
class AuthorityProof:
    proof_type: str
    action_id: str
    operation_id: str
    context_digest: str
    input_digest: str
    basis_digest: str
    evaluator_revision: str
    determining_evidence: tuple[str, ...]
    seal: str


@dataclass(frozen=True)
class ApprovalRecord:
    approval_id: str
    proposal_digest: str
    approver: str
    proof: AuthorityProof


@dataclass(frozen=True)
class Proposal:
    operation_id: str
    action_id: str
    action_revision: str
    inputs: Mapping[str, Any]
    input_digest: str
    basis: StateBasis
    context: ExecutionContext
    proof: AuthorityProof
    approval: ApprovalRecord | None = None

    def digest(self) -> str:
        return digest_json(
            {
                "operation_id": self.operation_id,
                "action_id": self.action_id,
                "action_revision": self.action_revision,
                "input_digest": self.input_digest,
                "basis": self.basis.digest(),
                "context": self.context.__dict__,
            }
        )


class TransportEvidence(str, Enum):
    DEFINITELY_NOT_SENT = "definitely-not-sent"
    SENT_NO_RESPONSE = "sent-no-response"
    ACCEPTED_ASYNC = "accepted-async"
    RESPONSE_RECEIVED = "response-received"


class ExternalOutcome(str, Enum):
    UNKNOWN = "unknown"
    CONFIRMED_SUCCESS = "confirmed-success"
    CONFIRMED_FAILURE = "confirmed-failure"
    CONTRADICTED = "contradicted"


@dataclass
class ExternalRequest:
    request_id: str
    causal_operation_id: str
    kind: str
    payload_digest: str
    remote_dedupe_key: str | None = None
    attempts: list["ExternalAttempt"] = field(default_factory=list)
    observations: list["ExternalObservation"] = field(default_factory=list)
    outcome: ExternalOutcome = ExternalOutcome.UNKNOWN
    remote_receipt_id: str | None = None


@dataclass(frozen=True)
class ExternalAttempt:
    attempt_id: str
    request_id: str
    transport: TransportEvidence
    remote_receipt_id: str | None = None


@dataclass(frozen=True)
class ExternalObservation:
    observation_id: str
    request_id: str
    source: str
    terminal: str  # success | failure | nonterminal
    remote_receipt_id: str | None = None
    evidence_digest: str | None = None


@dataclass(frozen=True)
class AuditEntry:
    kind: str
    subject: str
    data: Mapping[str, Any]


def digest_json(value: Any) -> str:
    return sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def context_digest(context: ExecutionContext) -> str:
    return digest_json(context.__dict__)


class ProofIssuer:
    """HMAC only makes proof forgery/context substitution executable in tests."""

    def __init__(self, secret: bytes = b"issue-71-reference-only") -> None:
        self._secret = secret

    def mint(
        self,
        *,
        proof_type: str,
        action_id: str,
        operation_id: str,
        context: ExecutionContext,
        inputs: Mapping[str, Any],
        basis: StateBasis,
        evaluator_revision: str,
        determining_evidence: tuple[str, ...],
    ) -> AuthorityProof:
        payload = {
            "proof_type": proof_type,
            "action_id": action_id,
            "operation_id": operation_id,
            "context_digest": context_digest(context),
            "input_digest": digest_json(inputs),
            "basis_digest": basis.digest(),
            "evaluator_revision": evaluator_revision,
            "determining_evidence": determining_evidence,
        }
        seal = hmac.new(self._secret, digest_json(payload).encode(), sha256).hexdigest()
        return AuthorityProof(seal=seal, **payload)

    def verify(
        self,
        proof: AuthorityProof,
        *,
        proof_type: str,
        action_id: str,
        operation_id: str,
        context: ExecutionContext,
        inputs: Mapping[str, Any],
        basis: StateBasis,
    ) -> None:
        if proof.proof_type != proof_type or proof.action_id != action_id or proof.operation_id != operation_id:
            raise AuthorizationError("authority proof type/action/operation mismatch")
        if proof.context_digest != context_digest(context):
            raise AuthorizationError("authority proof execution-context mismatch")
        if proof.input_digest != digest_json(inputs):
            raise AuthorizationError("authority proof input mismatch")
        if proof.basis_digest != basis.digest():
            raise AuthorizationError("authority proof basis mismatch")
        payload = {
            "proof_type": proof.proof_type,
            "action_id": proof.action_id,
            "operation_id": proof.operation_id,
            "context_digest": proof.context_digest,
            "input_digest": proof.input_digest,
            "basis_digest": proof.basis_digest,
            "evaluator_revision": proof.evaluator_revision,
            "determining_evidence": proof.determining_evidence,
        }
        expected = hmac.new(self._secret, digest_json(payload).encode(), sha256).hexdigest()
        if not hmac.compare_digest(proof.seal, expected):
            raise AuthorizationError("forged authority proof")
