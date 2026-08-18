from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


PROTOCOL_COMMANDS = (
    "InstallDefinitionRevision",
    "CreateEntity",
    "RecordClaim",
    "RecordExternalOccurrence",
    "ProposeOperation",
    "RecordApproval",
    "CommitOperation",
    "RecordEffectAttempt",
    "ReconcileEffect",
)

EFFECT_KNOWLEDGE = (
    "not_attempted",
    "definitely_not_sent",
    "unknown",
    "accepted_pending",
    "confirmed",
    "confirmed_no_effect",
    "contradicted",
)

ATTEMPT_OUTCOMES = (
    "sent_no_response",
    "accepted",
    "rejected_before_send",
    "remote_receipt",
)


def _require_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{name} must be a non-empty string")
    return value


@dataclass(frozen=True)
class DefinitionRef:
    definition_id: str
    revision_id: str
    definition_digest: str = ""

    def key(self) -> tuple[str, str]:
        return (self.definition_id, self.revision_id)


@dataclass(frozen=True)
class Provenance:
    source_id: str
    source_locator: str
    capture_id: str
    capture_revision: str
    actor_id: str
    workload_id: str
    mapping_revision: str | None = None
    integrity_evidence: str | None = None


@dataclass(frozen=True)
class Attribution:
    actor_id: str
    represented_principal_id: str
    workload_id: str
    delegation_id: str

    def __post_init__(self) -> None:
        ids = (
            _require_text("actor_id", self.actor_id),
            _require_text("represented_principal_id", self.represented_principal_id),
            _require_text("workload_id", self.workload_id),
            _require_text("delegation_id", self.delegation_id),
        )
        if len(set(ids)) != 4:
            raise ValueError("attribution dimensions must be distinct")

    def as_dict(self) -> dict[str, str]:
        return {
            "actor_id": self.actor_id,
            "represented_principal_id": self.represented_principal_id,
            "workload_id": self.workload_id,
            "delegation_id": self.delegation_id,
        }


@dataclass(frozen=True)
class ValidTime:
    instant: str | None = None
    start: str | None = None
    end: str | None = None

    def covers(self, valid_at: str) -> bool:
        point = self.instant if self.instant is not None else self.start
        if point is None:
            return True
        if len(valid_at) == 10:
            return point[:10] <= valid_at
        if self.instant is not None:
            return self.instant <= valid_at
        start = self.start or ""
        end = self.end
        if start and valid_at < start:
            return False
        if end is not None and valid_at >= end:
            return False
        return True


@dataclass(frozen=True)
class Entity:
    entity_id: str
    type_ref: DefinitionRef
    created_at: str
    creation_provenance: Provenance


@dataclass(frozen=True)
class ContextualIdentity:
    identity_id: str
    entity_id: str
    context_entity_id: str
    role_definition_ref: DefinitionRef
    provenance: Provenance
    valid_time: ValidTime | None = None


@dataclass(frozen=True)
class Claim:
    claim_id: str
    subject_ref: str
    predicate_ref: str
    value: Any
    valid_time: ValidTime
    known_revision: str
    provenance: Provenance
    derived_from: tuple[str, ...] = ()
    corrects: str | None = None


@dataclass(frozen=True)
class Delegation:
    delegation_id: str
    grantor_id: str
    actor_id: str
    represented_principal_id: str
    action_scope: tuple[str, ...]
    resource_scope: tuple[str, ...]
    purpose: str
    valid_from: str
    valid_until: str | None
    revocation_revision: str | None
    bound_workload_id: str
    parent_id: str | None = None


@dataclass(frozen=True)
class StateDependency:
    dependency_id: str
    mode: str
    query: dict[str, Any]
    evaluated_value: Any
    result_digest: str
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True)
class StateBasis:
    basis_id: str
    dependencies: tuple[StateDependency, ...]
    knowledge_cut: str
    definition_refs: tuple[DefinitionRef, ...]
    digest: str


@dataclass(frozen=True)
class Proposal:
    proposal_id: str
    operation_id: str
    authority_namespace: str
    action_ref: DefinitionRef
    canonical_inputs: dict[str, Any]
    intent_digest: str
    preview_plan: dict[str, Any]
    state_basis: StateBasis
    proposer: Attribution
    validity: str
    replan_bounds: dict[str, Any]
    known_revision: str


@dataclass(frozen=True)
class Approval:
    approval_id: str
    proposal_ref: str
    proposal_digest: str
    approved_bounds: dict[str, Any]
    state_basis_ref: str
    state_basis: StateBasis
    approver: Attribution
    policy_refs: tuple[DefinitionRef, ...]
    known_revision: str

    def __post_init__(self) -> None:
        if self.state_basis is None:
            raise ValueError("approval requires state_basis")
        if not self.state_basis_ref or not self.proposal_digest:
            raise ValueError("approval requires proposal digest and state basis")


@dataclass(frozen=True)
class OperationEnvelope:
    operation_id: str
    authority_namespace: str
    action_ref: DefinitionRef
    canonical_inputs: dict[str, Any]
    intent_digest: str
    attribution: Attribution
    proposal_ref: str
    approval_ref: str
    created_revision: str


@dataclass(frozen=True)
class RuleDecision:
    decision_id: str
    rule_ref: DefinitionRef
    locus: str
    basis_ref: str
    outcome: str
    determining_evidence: tuple[str, ...]
    evaluated_revision: str


@dataclass(frozen=True)
class MutationPlan:
    planner_ref: DefinitionRef
    mutations: tuple[dict[str, Any], ...]
    expected_result: dict[str, Any]
    causal_inputs: tuple[str, ...]


@dataclass(frozen=True)
class OperationReceipt:
    operation_id: str
    authority_namespace: str
    intent_digest: str
    action_ref: DefinitionRef
    outcome: str
    result: dict[str, Any]
    committed_refs: tuple[str, ...]
    commit_revision: str
    stale: bool
    proposal_basis_digest: str
    commit_basis_digest: str
    planned_quantity: Any
    committed_quantity: Any


@dataclass(frozen=True)
class Occurrence:
    occurrence_id: str
    occurrence_ref: DefinitionRef
    valid_time: ValidTime
    known_revision: str
    payload: dict[str, Any]
    provenance: Provenance
    causal_operation_ref: str | None = None


@dataclass(frozen=True)
class EffectRequest:
    request_id: str
    parent_operation_id: str
    effect_ref: DefinitionRef
    intent_digest: str
    payload: dict[str, Any]
    retry_safety: dict[str, Any]
    reconciliation_strategy: str
    remote_key: str | None = None


@dataclass(frozen=True)
class EffectAttempt:
    attempt_id: str
    request_id: str
    request_digest: str
    started_revision: str
    observed_revision: str
    outcome: str
    transport_evidence: dict[str, Any]
    remote_receipt: str | None = None


@dataclass(frozen=True)
class EffectKnowledgeRecord:
    record_id: str
    request_id: str
    prior_knowledge: str
    evidence_refs: tuple[str, ...]
    new_knowledge: str
    reducer_ref: DefinitionRef | None
    known_revision: str


@dataclass(frozen=True)
class ReconciliationRecord:
    reconciliation_id: str
    request_id: str
    method_ref: DefinitionRef
    evidence_refs: tuple[str, ...]
    prior_knowledge: str
    resulting_knowledge: str
    attribution: Attribution
    known_revision: str


@dataclass(frozen=True)
class CausalLink:
    link_id: str
    cause_ref: str
    relation: str
    consequence_ref: str
    definition_ref: DefinitionRef | None
    known_revision: str


@dataclass(frozen=True)
class CommandReceipt:
    command_type: str
    outcome: str
    known_revision: str
    record_refs: tuple[str, ...] = ()
    details: dict[str, Any] = field(default_factory=dict)
