from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from os_kernel.canonical import digest
from os_kernel.definitions import DefinitionBundle, load_bundle, resolve_action, resolve_computation, resolve_effect
from os_kernel.effects import reconcile_knowledge, reduce_attempt, retry_allowed
from os_kernel.errors import InputError, InternalError
from os_kernel.explanation import explain as explain_store
from os_kernel.expression import EvalContext, evaluate
from os_kernel.model import (
    Approval,
    Attribution,
    Claim,
    CommandReceipt,
    ContextualIdentity,
    Delegation,
    DefinitionRef,
    EffectAttempt,
    EffectKnowledgeRecord,
    Entity,
    Occurrence,
    Proposal,
    Provenance,
    ReconciliationRecord,
    ValidTime,
)
from os_kernel.protocol import capture_basis, commit_operation, intent_digest
from os_kernel.store import Store
from os_kernel.temporal import evaluate_quantity


class Clock:
    def now(self) -> str:
        raise NotImplementedError


class IdSource:
    def next(self, prefix: str) -> str:
        raise NotImplementedError


@dataclass
class ScriptedClock(Clock):
    current: str

    def now(self) -> str:
        return self.current

    def set(self, value: str) -> None:
        self.current = value


class SeqIds(IdSource):
    def __init__(self) -> None:
        self._n = 0

    def next(self, prefix: str) -> str:
        self._n += 1
        return f"{prefix}:{self._n:04d}"


def _provenance(raw: dict[str, Any]) -> Provenance:
    required = ("source_id", "source_locator", "capture_id", "capture_revision", "actor_id", "workload_id")
    missing = [key for key in required if not raw.get(key)]
    if missing:
        raise InputError(
            "invalid_provenance",
            f"provenance missing {', '.join(missing)}",
            "os scenario run v001 --output json",
        )
    return Provenance(
        raw["source_id"],
        raw["source_locator"],
        raw["capture_id"],
        raw["capture_revision"],
        raw["actor_id"],
        raw["workload_id"],
        raw.get("mapping_revision"),
        raw.get("integrity_evidence"),
    )


def _valid_time(raw: Any) -> ValidTime:
    if raw is None:
        raise InputError("invalid_valid_time", "valid_time is required", "os scenario run v001 --output json")
    if isinstance(raw, str):
        return ValidTime(instant=raw)
    if isinstance(raw, dict):
        return ValidTime(raw.get("instant"), raw.get("start"), raw.get("end"))
    raise InputError("invalid_valid_time", "valid_time must be an instant or interval", "os scenario run v001 --output json")


def _attribution(raw: dict[str, Any]) -> Attribution:
    if "principal_id" in raw:
        raise InputError(
            "collapsed_attribution",
            "principal_id is not an attribution dimension",
            "os scenario run v001 --output json",
        )
    try:
        return Attribution(
            raw["actor_id"],
            raw["represented_principal_id"],
            raw["workload_id"],
            raw["delegation_id"],
        )
    except (KeyError, ValueError) as exc:
        raise InputError("invalid_attribution", str(exc), "os scenario run v001 --output json") from exc


def _type_ref(raw: dict[str, Any], bundle: DefinitionBundle) -> DefinitionRef:
    definition_id = raw["definition_id"]
    revision_id = raw.get("revision_id") or bundle.revision_id
    installed = bundle.types.get(definition_id) or bundle.relations.get(definition_id)
    digest_value = raw.get("definition_digest")
    if installed is not None:
        digest_value = digest_value or installed.definition_ref.definition_digest
        revision_id = installed.definition_ref.revision_id if revision_id == bundle.revision_id else revision_id
    return DefinitionRef(definition_id, revision_id, digest_value or "")


class Kernel:
    def __init__(self, bundle: DefinitionBundle, clock: Clock, ids: IdSource, store: Store | None = None) -> None:
        self._clock = clock
        self._ids = ids
        self._store = store or Store()
        self._current = bundle
        self._store.put_definition_revision(bundle.revision_id, bundle)
        self._aliases: dict[str, str] = {}

    @classmethod
    def open(cls, definitions: DefinitionBundle | dict[str, Any], clock: Clock, ids: IdSource) -> "Kernel":
        bundle = definitions if isinstance(definitions, DefinitionBundle) else load_bundle(definitions)
        return cls(bundle, clock, ids)

    def apply(self, command: dict[str, Any] | Any) -> CommandReceipt:
        if not isinstance(command, dict):
            raise InputError("invalid_command", "command must be an object", "os scenario run v001 --output json")
        command_type = command.get("type")
        clock_time = command.get("clock_time")
        if clock_time:
            setter = getattr(self._clock, "set", None)
            if callable(setter):
                setter(clock_time)
        dispatch: dict[str, Callable[[dict[str, Any]], CommandReceipt]] = {
            "InstallDefinitionRevision": self._install,
            "CreateEntity": self._create_entity,
            "RecordClaim": self._record_claim,
            "RecordExternalOccurrence": self._record_occurrence,
            "ProposeOperation": self._propose,
            "RecordApproval": self._approve,
            "CommitOperation": self._commit,
            "RecordEffectAttempt": self._attempt,
            "ReconcileEffect": self._reconcile,
        }
        handler = dispatch.get(command_type)
        if handler is None:
            raise InputError(
                "unknown_command",
                f"unsupported command {command_type!r}",
                "os scenario run v001 --output json",
            )
        receipt = handler(command)
        alias = command.get("alias_revision_as")
        if alias:
            self._aliases[alias] = receipt.known_revision
        return receipt

    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        kind = query.get("type")
        if kind == "known-then":
            known_at = self.resolve_cut(query["known_at"])
            return {
                "type": "known-then",
                **evaluate_quantity(
                    self._current,
                    self._store,
                    query["subject"],
                    query["predicate"],
                    query["valid_at"],
                    known_at,
                ),
            }
        if kind == "now-believed-for-then":
            return {
                "type": "now-believed-for-then",
                **evaluate_quantity(
                    self._current,
                    self._store,
                    query["subject"],
                    query["predicate"],
                    query["valid_at"],
                    None,
                ),
            }
        if kind == "scenario-report":
            return self._scenario_report(query.get("scenario_id", ""))
        raise InputError(
            "unknown_query",
            f"unsupported query {kind!r}",
            "os query known-then --scenario v001 --subject <subject> --predicate <predicate> --valid-at <date> --known-at <cut> --output json",
        )

    def explain(self, reference: str) -> dict[str, Any]:
        return explain_store(self._store, reference)

    def resolve_cut(self, known_at: str) -> str:
        return self._aliases.get(known_at, known_at)

    def record_counts(self) -> dict[str, int]:
        return self._store.record_counts()

    def _install(self, command: dict[str, Any]) -> CommandReceipt:
        bundle = load_bundle(command["definitions"])
        self._store.put_definition_revision(bundle.revision_id, bundle)
        self._current = bundle
        revision = self._store.next_revision()
        return CommandReceipt("InstallDefinitionRevision", "installed", revision, (f"defrev:{bundle.revision_id}",), {"revision_id": bundle.revision_id})

    def _create_entity(self, command: dict[str, Any]) -> CommandReceipt:
        forbidden = {"properties", "labels", "values", "attributes", "fields"}
        extra = forbidden.intersection(command)
        if extra:
            raise InputError(
                "raw_entity_write",
                f"CreateEntity does not accept {sorted(extra)}",
                "os scenario run v001 --output json",
            )
        revision = self._store.next_revision()
        entity = Entity(
            entity_id=command["entity_id"],
            type_ref=_type_ref(command["type_ref"], self._current),
            created_at=self._clock.now(),
            creation_provenance=_provenance(command["provenance"]),
        )
        self._store.put_entity(entity)
        return CommandReceipt("CreateEntity", "created", revision, (f"entity:{entity.entity_id}",), {})

    def _record_claim(self, command: dict[str, Any]) -> CommandReceipt:
        revision = self._store.next_revision()
        claim = Claim(
            claim_id=command["claim_id"],
            subject_ref=command["subject_ref"],
            predicate_ref=command["predicate_ref"],
            value=command["value"],
            valid_time=_valid_time(command.get("valid_time")),
            known_revision=revision,
            provenance=_provenance(command["provenance"]),
            derived_from=tuple(command.get("derived_from") or ()),
            corrects=command.get("corrects"),
        )
        self._store.put_claim(claim)
        refs = [f"claim:{claim.claim_id}"]
        relation = self._current.relations.get(claim.predicate_ref)
        if relation is not None and relation.projects_contextual_identity:
            payload = claim.value if isinstance(claim.value, dict) else {}
            identity = ContextualIdentity(
                identity_id=payload.get("identity_id") or self._ids.next("identity"),
                entity_id=claim.subject_ref,
                context_entity_id=payload["context_entity_id"],
                role_definition_ref=relation.definition_ref,
                provenance=claim.provenance,
                valid_time=claim.valid_time,
            )
            self._store.put_identity(identity)
            refs.append(f"identity:{identity.identity_id}")
        return CommandReceipt("RecordClaim", "recorded", revision, tuple(refs), {"claim_id": claim.claim_id})

    def _record_occurrence(self, command: dict[str, Any]) -> CommandReceipt:
        revision = self._store.next_revision()
        occurrence_ref = _type_ref(command["occurrence_ref"], self._current)
        occurrence = Occurrence(
            occurrence_id=command["occurrence_id"],
            occurrence_ref=occurrence_ref,
            valid_time=_valid_time(command.get("valid_time")),
            known_revision=revision,
            payload=command.get("payload") or {},
            provenance=_provenance(command["provenance"]),
            causal_operation_ref=command.get("causal_operation_ref"),
        )
        self._store.put_occurrence(occurrence)
        refs = [f"occurrence:{occurrence.occurrence_id}"]
        type_def = self._current.types.get(occurrence_ref.definition_id)
        if type_def is not None and type_def.on_record is not None:
            built = evaluate(
                type_def.on_record,
                EvalContext(
                    {
                        "payload": occurrence.payload,
                        "valid_time": {
                            "instant": occurrence.valid_time.instant,
                            "start": occurrence.valid_time.start,
                            "end": occurrence.valid_time.end,
                        },
                        "now": self._clock.now(),
                    },
                    self._store,
                    valid_at=self._clock.now(),
                    known_at=revision,
                ),
            )
            if isinstance(built, dict) and built.get("_kind") == "claim_draft":
                claim = Claim(
                    claim_id=built.get("claim_id") or self._ids.next("claim"),
                    subject_ref=built["subject_ref"],
                    predicate_ref=built["predicate_ref"],
                    value=built["value"],
                    valid_time=_valid_time(built.get("valid_time") or occurrence.valid_time),
                    known_revision=revision,
                    provenance=occurrence.provenance,
                    derived_from=(f"occurrence:{occurrence.occurrence_id}",),
                )
                self._store.put_claim(claim)
                refs.append(f"claim:{claim.claim_id}")
        return CommandReceipt("RecordExternalOccurrence", "recorded", revision, tuple(refs), {})

    def _propose(self, command: dict[str, Any]) -> CommandReceipt:
        attribution = _attribution(command["attribution"])
        action = resolve_action(self._current, command["action_id"])
        if command.get("delegation"):
            raw = command["delegation"]
            delegation = Delegation(
                delegation_id=raw["delegation_id"],
                grantor_id=raw["grantor_id"],
                actor_id=raw["actor_id"],
                represented_principal_id=raw["represented_principal_id"],
                action_scope=tuple(raw.get("action_scope") or ()),
                resource_scope=tuple(raw.get("resource_scope") or ()),
                purpose=raw.get("purpose", ""),
                valid_from=raw.get("valid_from") or self._clock.now(),
                valid_until=raw.get("valid_until"),
                revocation_revision=raw.get("revocation_revision"),
                bound_workload_id=raw["bound_workload_id"],
                parent_id=raw.get("parent_id"),
            )
            if self._store.get("delegations", delegation.delegation_id) is None:
                self._store.put_delegation(delegation)
        inputs = command["inputs"]
        basis = capture_basis(
            self._current,
            self._store,
            action.state_basis_spec,
            {**inputs, "now": self._clock.now()},
            self._store.current_revision(),
            self._ids.next,
        )
        planner = resolve_computation(self._current, action.planner_ref)
        preview = evaluate(
            planner.expression,
            EvalContext(
                {
                    **inputs,
                    "proposed_quantity": inputs.get("quantity"),
                    "basis_available": basis.dependencies[0].evaluated_value if basis.dependencies else None,
                    "current_available": basis.dependencies[0].evaluated_value if basis.dependencies else None,
                    "approval": command.get("replan_bounds") or {},
                    "stale": False,
                    "now": self._clock.now(),
                },
                self._store,
                valid_at=self._clock.now(),
                known_at=self._store.current_revision(),
            ),
        )
        digest_value = intent_digest(
            action.definition_ref,
            inputs,
            attribution.represented_principal_id,
            attribution.delegation_id,
            command["proposal_id"],
        )
        revision = self._store.next_revision()
        proposal = Proposal(
            proposal_id=command["proposal_id"],
            operation_id=command["operation_id"],
            authority_namespace=command.get("authority_namespace", "v001"),
            action_ref=action.definition_ref,
            canonical_inputs=inputs,
            intent_digest=digest_value,
            preview_plan=preview if isinstance(preview, dict) else {"value": preview},
            state_basis=basis,
            proposer=attribution,
            validity=command.get("validity") or self._clock.now(),
            replan_bounds=command.get("replan_bounds") or {},
            known_revision=revision,
        )
        self._store.put_proposal(proposal)
        return CommandReceipt(
            "ProposeOperation",
            "proposed",
            revision,
            (f"proposal:{proposal.proposal_id}", f"basis:{basis.basis_id}"),
            {
                "proposal_id": proposal.proposal_id,
                "intent_digest": proposal.intent_digest,
                "preview_plan": proposal.preview_plan,
                "state_basis": {
                    "basis_id": basis.basis_id,
                    "digest": basis.digest,
                    "dependencies": [
                        {"dependency_id": dep.dependency_id, "evaluated_value": dep.evaluated_value}
                        for dep in basis.dependencies
                    ],
                },
            },
        )

    def _approve(self, command: dict[str, Any]) -> CommandReceipt:
        proposal = self._store.get("proposals", command["proposal_id"])
        if proposal is None:
            raise InputError("unknown_proposal", "approval requires a stored proposal", "os scenario run v001 --output json")
        basis = proposal.state_basis
        if basis is None:
            raise InputError("approval_without_basis", "approval requires state_basis", "os scenario run v001 --output json")
        if command.get("state_basis_ref") and command["state_basis_ref"] != basis.basis_id:
            raise InputError("basis_mismatch", "approval basis does not match proposal", "os scenario run v001 --output json")
        proposal_digest = digest(
            {
                "proposal_id": proposal.proposal_id,
                "intent_digest": proposal.intent_digest,
                "action_ref": {
                    "definition_id": proposal.action_ref.definition_id,
                    "revision_id": proposal.action_ref.revision_id,
                    "definition_digest": proposal.action_ref.definition_digest,
                },
                "inputs": proposal.canonical_inputs,
                "state_basis": proposal.state_basis.digest,
            }
        )
        revision = self._store.next_revision()
        approval = Approval(
            approval_id=command["approval_id"],
            proposal_ref=proposal.proposal_id,
            proposal_digest=proposal_digest,
            approved_bounds=command["approved_bounds"],
            state_basis_ref=basis.basis_id,
            state_basis=basis,
            approver=_attribution(command["attribution"]),
            policy_refs=tuple(),
            known_revision=revision,
        )
        self._store.put_approval(approval)
        return CommandReceipt(
            "RecordApproval",
            "approved",
            revision,
            (f"approval:{approval.approval_id}",),
            {"approval_id": approval.approval_id, "proposal_digest": approval.proposal_digest, "state_basis_ref": approval.state_basis_ref},
        )

    def _commit(self, command: dict[str, Any]) -> CommandReceipt:
        provenance = _provenance(
            command.get("provenance")
            or {
                "source_id": "runtime:kernel",
                "source_locator": "commit",
                "capture_id": command.get("operation_id", "commit"),
                "capture_revision": self._current.revision_id,
                "actor_id": command["attribution"]["actor_id"],
                "workload_id": command["attribution"]["workload_id"],
            }
        )
        return commit_operation(self._current, self._store, command, self._clock.now(), self._ids.next, provenance)

    def _attempt(self, command: dict[str, Any]) -> CommandReceipt:
        request = self._store.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", "os scenario run v001 --output json")
        effect = resolve_effect(self._current, request.effect_ref.definition_id)
        knowledge = self._store.latest_knowledge(request.request_id)
        allowed, reason = retry_allowed(effect, knowledge)
        if knowledge != "not_attempted" and not allowed:
            return CommandReceipt(
                "RecordEffectAttempt",
                reason,
                self._store.current_revision(),
                (),
                {"code": reason, "knowledge": knowledge},
            )
        revision = self._store.next_revision()
        attempt = EffectAttempt(
            attempt_id=command.get("attempt_id") or self._ids.next("attempt"),
            request_id=request.request_id,
            request_digest=request.intent_digest,
            started_revision=revision,
            observed_revision=revision,
            outcome=command["outcome"],
            transport_evidence=command.get("transport_evidence") or {},
            remote_receipt=command.get("remote_receipt"),
        )
        new_knowledge = reduce_attempt(knowledge, attempt.outcome)
        self._store.put_effect_attempt(attempt)
        self._store.put_effect_knowledge(
            EffectKnowledgeRecord(
                record_id=self._ids.next("ek"),
                request_id=request.request_id,
                prior_knowledge=knowledge,
                evidence_refs=(f"attempt:{attempt.attempt_id}",),
                new_knowledge=new_knowledge,
                reducer_ref=effect.definition_ref,
                known_revision=revision,
            )
        )
        return CommandReceipt(
            "RecordEffectAttempt",
            new_knowledge,
            revision,
            (f"attempt:{attempt.attempt_id}",),
            {"attempt_id": attempt.attempt_id, "knowledge": new_knowledge, "outcome": attempt.outcome},
        )

    def _reconcile(self, command: dict[str, Any]) -> CommandReceipt:
        request = self._store.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", "os scenario run v001 --output json")
        effect = resolve_effect(self._current, request.effect_ref.definition_id)
        prior = self._store.latest_knowledge(request.request_id)
        evidence_refs = tuple(command.get("evidence_refs") or ())
        computed: Any = command.get("resulting_knowledge")
        if effect.reconciliation_ref:
            computation = resolve_computation(self._current, effect.reconciliation_ref)
            computed = evaluate(
                computation.expression,
                EvalContext(
                    {
                        "evidence_count": len(evidence_refs),
                        "evidence_refs": list(evidence_refs),
                        "prior_knowledge": prior,
                    },
                    self._store,
                    known_at=self._store.current_revision(),
                ),
            )
            if isinstance(computed, dict):
                computed = computed.get("knowledge")
        new_knowledge = reconcile_knowledge(prior, computed)
        revision = self._store.next_revision()
        record = ReconciliationRecord(
            reconciliation_id=command.get("reconciliation_id") or self._ids.next("recon"),
            request_id=request.request_id,
            method_ref=effect.definition_ref,
            evidence_refs=evidence_refs,
            prior_knowledge=prior,
            resulting_knowledge=new_knowledge,
            attribution=_attribution(command["attribution"]),
            known_revision=revision,
        )
        self._store.put_reconciliation(record)
        self._store.put_effect_knowledge(
            EffectKnowledgeRecord(
                record_id=self._ids.next("ek"),
                request_id=request.request_id,
                prior_knowledge=prior,
                evidence_refs=evidence_refs,
                new_knowledge=new_knowledge,
                reducer_ref=effect.definition_ref,
                known_revision=revision,
            )
        )
        attempts = [item for item in self._store.all("effect_attempts") if item.request_id == request.request_id]
        return CommandReceipt(
            "ReconcileEffect",
            new_knowledge,
            revision,
            (f"recon:{record.reconciliation_id}",),
            {
                "reconciliation_id": record.reconciliation_id,
                "prior_knowledge": prior,
                "resulting_knowledge": new_knowledge,
                "original_attempts": [
                    {"attempt_id": item.attempt_id, "outcome": item.outcome} for item in attempts
                ],
            },
        )

    def _scenario_report(self, scenario_id: str) -> dict[str, Any]:
        claims = [
            {
                "claim_id": item.claim_id,
                "subject_ref": item.subject_ref,
                "predicate_ref": item.predicate_ref,
                "value": item.value,
                "known_revision": item.known_revision,
                "valid_time": {
                    "instant": item.valid_time.instant,
                    "start": item.valid_time.start,
                    "end": item.valid_time.end,
                },
                "provenance": {
                    "source_id": item.provenance.source_id,
                    "source_locator": item.provenance.source_locator,
                    "capture_id": item.provenance.capture_id,
                    "capture_revision": item.provenance.capture_revision,
                    "actor_id": item.provenance.actor_id,
                    "workload_id": item.provenance.workload_id,
                },
            }
            for item in self._store.claims()
        ]
        claims.sort(key=lambda item: item["claim_id"])
        receipts = [
            {
                "operation_id": item.operation_id,
                "intent_digest": item.intent_digest,
                "action_revision": item.action_ref.revision_id,
                "outcome": item.outcome,
                "stale": item.stale,
                "proposal_basis_digest": item.proposal_basis_digest,
                "commit_basis_digest": item.commit_basis_digest,
                "planned_quantity": item.planned_quantity,
                "committed_quantity": item.committed_quantity,
                "commit_revision": item.commit_revision,
                "committed_refs": list(item.committed_refs),
            }
            for item in self._store.all("receipts")
        ]
        receipts.sort(key=lambda item: item["operation_id"])
        knowledge = [
            {
                "record_id": item.record_id,
                "request_id": item.request_id,
                "prior_knowledge": item.prior_knowledge,
                "new_knowledge": item.new_knowledge,
                "evidence_refs": list(item.evidence_refs),
                "known_revision": item.known_revision,
            }
            for item in self._store.all("effect_knowledge")
        ]
        knowledge.sort(key=lambda item: item["record_id"])
        identities = [
            {
                "identity_id": item.identity_id,
                "entity_id": item.entity_id,
                "context_entity_id": item.context_entity_id,
                "role_definition_ref": item.role_definition_ref.definition_id,
            }
            for item in self._store.all("contextual_identities")
        ]
        identities.sort(key=lambda item: item["identity_id"])
        return {
            "scenario_id": scenario_id,
            "definition_revisions": sorted(self._store.keys("definition_revisions")),
            "records": {
                "claims": claims,
                "occurrences": [
                    {
                        "occurrence_id": item.occurrence_id,
                        "occurrence_ref": item.occurrence_ref.definition_id,
                        "known_revision": item.known_revision,
                        "causal_operation_ref": item.causal_operation_ref,
                    }
                    for item in sorted(self._store.all("occurrences"), key=lambda item: item.occurrence_id)
                ],
                "contextual_identities": identities,
                "proposals": [
                    {
                        "proposal_id": item.proposal_id,
                        "action_revision": item.action_ref.revision_id,
                        "intent_digest": item.intent_digest,
                        "state_basis": {
                            "basis_id": item.state_basis.basis_id,
                            "digest": item.state_basis.digest,
                        },
                        "attribution": item.proposer.as_dict(),
                    }
                    for item in sorted(self._store.all("proposals"), key=lambda item: item.proposal_id)
                ],
                "approvals": [
                    {
                        "approval_id": item.approval_id,
                        "proposal_ref": item.proposal_ref,
                        "proposal_digest": item.proposal_digest,
                        "state_basis_ref": item.state_basis_ref,
                        "approved_bounds": item.approved_bounds,
                        "attribution": item.approver.as_dict(),
                    }
                    for item in sorted(self._store.all("approvals"), key=lambda item: item.approval_id)
                ],
                "rule_decisions": [
                    {"decision_id": item.decision_id, "outcome": item.outcome, "locus": item.locus}
                    for item in sorted(self._store.all("rule_decisions"), key=lambda item: item.decision_id)
                ],
                "causal_links": [
                    {
                        "link_id": item.link_id,
                        "cause_ref": item.cause_ref,
                        "relation": item.relation,
                        "consequence_ref": item.consequence_ref,
                    }
                    for item in sorted(self._store.all("causal_links"), key=lambda item: item.link_id)
                ],
                "effect_requests": [
                    {
                        "request_id": item.request_id,
                        "parent_operation_id": item.parent_operation_id,
                        "effect_ref": item.effect_ref.definition_id,
                    }
                    for item in sorted(self._store.all("effect_requests"), key=lambda item: item.request_id)
                ],
                "effect_attempts": [
                    {
                        "attempt_id": item.attempt_id,
                        "request_id": item.request_id,
                        "outcome": item.outcome,
                    }
                    for item in sorted(self._store.all("effect_attempts"), key=lambda item: item.attempt_id)
                ],
                "reconciliations": [
                    {
                        "reconciliation_id": item.reconciliation_id,
                        "request_id": item.request_id,
                        "prior_knowledge": item.prior_knowledge,
                        "resulting_knowledge": item.resulting_knowledge,
                        "evidence_refs": list(item.evidence_refs),
                    }
                    for item in sorted(self._store.all("reconciliations"), key=lambda item: item.reconciliation_id)
                ],
                "envelopes": [
                    {
                        "operation_id": item.operation_id,
                        "attribution": item.attribution.as_dict(),
                        "action_revision": item.action_ref.revision_id,
                    }
                    for item in sorted(self._store.all("envelopes"), key=lambda item: item.operation_id)
                ],
            },
            "operation_receipts": receipts,
            "effect_knowledge": knowledge,
            "record_counts": self.record_counts(),
            "aliases": dict(sorted(self._aliases.items())),
        }
