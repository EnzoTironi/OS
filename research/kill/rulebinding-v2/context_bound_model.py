#!/usr/bin/env python3
"""Context-bound hardening for the issue #156 M4 refined-Type candidate.

M4-v2 proof values must be bound to every part of the trusted context that can
change the meaning of authority. Business inputs/state alone are not enough:
actor, represented principal, workload and the surrounding authority domain
(tenant/environment/session/task data where relevant) must not be silently
substitutable.

This is a bounded semantic model, not a production identity/session system.
The explicit parameters let tests model what a production runtime must derive
from trusted execution context rather than from untrusted business parameters.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from hmac import compare_digest, new as hmac_new
from secrets import token_bytes
from typing import Any

from reference_model import RefinedTypeEngine, RefinedValue, WrongProof


class ContextMismatch(WrongProof):
    pass


class ForgedProof(WrongProof):
    pass


@dataclass(frozen=True)
class ContextBoundValue(RefinedValue):
    context_digest: str
    seal: str


class ContextBoundEngine(RefinedTypeEngine):
    """M4 hardening: refined values used as authority are context-bound proofs."""

    def __init__(self) -> None:
        super().__init__()
        self._issuer_key = token_bytes(32)

    @staticmethod
    def _stable(value: Any) -> str:
        if isinstance(value, dict):
            return "{" + ",".join(f"{k!r}:{ContextBoundEngine._stable(v)}" for k, v in sorted(value.items())) + "}"
        if isinstance(value, (list, tuple)):
            return "[" + ",".join(ContextBoundEngine._stable(v) for v in value) + "]"
        if isinstance(value, set):
            return "{" + ",".join(sorted(ContextBoundEngine._stable(v) for v in value)) + "}"
        return repr(value)

    @classmethod
    def semantic_context_digest(
        cls,
        *,
        target: str,
        operation_id: str | None,
        actor: str | None,
        represented_principal: str | None,
        workload: str | None,
        authority_context: dict[str, Any] | None,
        inputs: dict[str, Any] | None,
        pending_state: dict[str, Any] | None,
        pinned_state: dict[str, Any] | None,
        payload: Any,
    ) -> str:
        material = cls._stable(
            {
                "target": target,
                "operation_id": operation_id,
                "actor": actor,
                "represented_principal": represented_principal,
                "workload": workload,
                "authority_context": dict(authority_context or {}),
                "inputs": dict(inputs or {}),
                "pending_state": pending_state,
                "pinned_state": pinned_state,
                "payload": payload,
            }
        ).encode("utf-8")
        return sha256(material).hexdigest()

    def _seal(self, value: RefinedValue, context_digest: str) -> str:
        material = self._stable(
            {
                "type_name": value.type_name,
                "target": value.target,
                "payload": value.payload,
                "operation_id": value.operation_id,
                "basis_revision": value.basis_revision,
                "pinned_digest": value.pinned_digest,
                "evidence": value.evidence,
                "evaluator_revisions": value.evaluator_revisions,
                "context_digest": context_digest,
            }
        ).encode("utf-8")
        return hmac_new(self._issuer_key, material, sha256).hexdigest()

    def construct(
        self,
        type_name: str,
        *,
        target: str = "value",
        payload: Any = None,
        operation_id: str | None = None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        pending_state: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> ContextBoundValue:
        base = super().construct(
            type_name,
            target=target,
            payload=payload,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            inputs=inputs,
            pending_state=pending_state,
            pinned_state=pinned_state,
        )
        digest = self.semantic_context_digest(
            target=target,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
            inputs=inputs,
            pending_state=pending_state,
            pinned_state=pinned_state,
            payload=payload,
        )
        return ContextBoundValue(
            type_name=base.type_name,
            target=base.target,
            payload=base.payload,
            operation_id=base.operation_id,
            basis_revision=base.basis_revision,
            pinned_digest=base.pinned_digest,
            evidence=base.evidence,
            evaluator_revisions=base.evaluator_revisions,
            context_digest=digest,
            seal=self._seal(base, digest),
        )

    def _verify_context_value(
        self,
        value: ContextBoundValue,
        expected_type: str,
        *,
        target: str,
        operation_id: str | None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        pending_state: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
        payload: Any = None,
    ) -> None:
        super()._verify_value(
            value,
            expected_type,
            target=target,
            operation_id=operation_id,
            pinned_state=pinned_state,
        )
        expected_seal = self._seal(value, value.context_digest)
        if not compare_digest(value.seal, expected_seal):
            raise ForgedProof(f"{expected_type} proof seal is invalid")
        expected_context = self.semantic_context_digest(
            target=target,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
            inputs=inputs,
            pending_state=pending_state,
            pinned_state=pinned_state,
            payload=payload,
        )
        if value.context_digest != expected_context:
            raise ContextMismatch(f"{expected_type} validated a different semantic/execution context")

    def _verify_signature(
        self,
        operation_name: str,
        proofs: dict[str, ContextBoundValue],
        *,
        target: str,
        operation_id: str | None = None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        pending_state: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        signature = self.signatures[operation_name]
        if set(proofs) != set(signature.required_types):
            raise WrongProof(f"{operation_name} requires {signature.required_types}, got {tuple(sorted(proofs))}")
        for required in signature.required_types:
            self._verify_context_value(
                proofs[required],
                required,
                target=target,
                operation_id=operation_id,
                actor=actor,
                represented_principal=represented_principal,
                workload=workload,
                authority_context=authority_context,
                inputs=inputs,
                pending_state=pending_state,
                pinned_state=pinned_state,
            )

    def preview(
        self,
        action_name: str,
        proof: ContextBoundValue,
        *,
        operation_id: str | None = None,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
    ) -> None:
        self._verify_signature(
            f"preview:{action_name}",
            {proof.type_name: proof},
            target=action_name,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
            inputs=inputs,
        )

    def authoritative_commit(
        self,
        *,
        operation_name: str,
        target: str,
        operation_id: str,
        proposed_state: dict[str, Any],
        proofs: dict[str, ContextBoundValue],
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
        inputs: dict[str, Any] | None = None,
        pinned_state: dict[str, Any] | None = None,
    ) -> None:
        self._verify_signature(
            operation_name,
            proofs,
            target=target,
            operation_id=operation_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
            inputs=inputs,
            pending_state=proposed_state,
            pinned_state=pinned_state,
        )
        self.state = dict(proposed_state)
        self.audit.append(
            {
                "operation": operation_name,
                "operation_id": operation_id,
                "target": target,
                "actor": actor,
                "represented_principal": represented_principal,
                "workload": workload,
                "authority_context": dict(authority_context or {}),
                "context_digest": next(iter(proofs.values())).context_digest if proofs else None,
                "evidence": tuple(
                    evidence
                    for required in self.signatures[operation_name].required_types
                    for evidence in proofs[required].evidence
                ),
                "evaluator_revisions": tuple(
                    revision
                    for required in self.signatures[operation_name].required_types
                    for revision in proofs[required].evaluator_revisions
                ),
            }
        )
        self.revision += 1

    def read(
        self,
        type_name: str,
        proof: ContextBoundValue,
        *,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._verify_signature(
            f"read:{type_name}",
            {proof.type_name: proof},
            target=type_name,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
        )
        return dict(self.state)

    def update_occurrence(
        self,
        occurrence_id: str,
        changes: dict[str, Any],
        proof: ContextBoundValue,
        *,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
    ) -> None:
        self._verify_signature(
            "update:Occurrence",
            {proof.type_name: proof},
            target="Occurrence",
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
        )
        self.occurrences[occurrence_id].update(changes)
        self.revision += 1

    def effect_attempt(
        self,
        effect_id: str,
        proof: ContextBoundValue,
        *,
        actor: str | None = None,
        represented_principal: str | None = None,
        workload: str | None = None,
        authority_context: dict[str, Any] | None = None,
    ) -> None:
        self._verify_signature(
            "effect-attempt",
            {proof.type_name: proof},
            target=effect_id,
            actor=actor,
            represented_principal=represented_principal,
            workload=workload,
            authority_context=authority_context,
        )
        self.effects_attempted.append(effect_id)
