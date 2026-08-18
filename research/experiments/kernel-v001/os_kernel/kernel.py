from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from os_kernel.canonical import public_output, retained
from os_kernel.definitions import DefinitionBundle, load_bundle, resolve_action, resolve_computation, resolve_effect
from os_kernel.effects import reconcile_knowledge, reduce_attempt, retry_allowed
from os_kernel.errors import InputError
from os_kernel.explanation import explain as explain_store
from os_kernel.expression import EvalContext, evaluate
from os_kernel.model import (
    Approval,
    Attribution,
    CausalLink,
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
from os_kernel.protocol import capture_basis, commit_operation, intent_digest, proposal_digest
from os_kernel.store import Store
from os_kernel.temporal import evaluate_quantity
from os_kernel.validation import (
    check_delegation,
    derived_resources,
    parse_valid_time,
    qualify,
    resolve_protocol_ref,
    schema_for_predicate,
    validate_command,
    validate_query,
    validate_value,
)


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
    return parse_valid_time(raw)


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


def _delegation_payload(delegation: Delegation) -> dict[str, Any]:
    return {
        "delegation_id": delegation.delegation_id,
        "grantor_id": delegation.grantor_id,
        "actor_id": delegation.actor_id,
        "represented_principal_id": delegation.represented_principal_id,
        "action_scope": list(delegation.action_scope),
        "resource_scope": list(delegation.resource_scope),
        "purpose": delegation.purpose,
        "valid_from": delegation.valid_from,
        "valid_until": delegation.valid_until,
        "revocation_revision": delegation.revocation_revision,
        "bound_workload_id": delegation.bound_workload_id,
        "parent_id": delegation.parent_id,
    }


class Kernel:
    def __init__(self, bundle: DefinitionBundle, clock: Clock, ids: IdSource) -> None:
        self._clock = clock
        self._ids = ids
        self.__store = Store()
        self._current = bundle
        self.__aliases: dict[str, str] = {}
        self.__installed: list[tuple[str, str]] = []
        self.__store._put_definition_revision(bundle.revision_id, bundle)
        self.__installed.append((self.__store.current_revision(), bundle.revision_id))

    @classmethod
    def open(cls, definitions: DefinitionBundle | dict[str, Any], clock: Clock, ids: IdSource) -> "Kernel":
        bundle = definitions if isinstance(definitions, DefinitionBundle) else load_bundle(definitions)
        return cls(bundle, clock, ids)

    def apply(self, command: dict[str, Any] | Any) -> CommandReceipt:
        if not isinstance(command, dict):
            raise InputError("invalid_command", "command must be an object", "os scenario run v001 --output json")
        payload = public_output(command)
        validate_command(payload)
        command_type = payload.get("type")
        clock_time = payload.get("clock_time")
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
        receipt = handler(payload)
        alias = payload.get("alias_revision_as")
        if alias:
            self.__aliases[alias] = receipt.known_revision
        return CommandReceipt(
            receipt.command_type,
            receipt.outcome,
            receipt.known_revision,
            receipt.record_refs,
            public_output(receipt.details),
        )

    def query(self, query: dict[str, Any]) -> dict[str, Any]:
        payload = public_output(query)
        validate_query(payload)
        kind = payload.get("type")
        if kind == "known-then":
            known_at = self._resolve_cut(payload["known_at"])
            bundle = self._bundle_at(known_at)
            return public_output(
                {
                    "type": "known-then",
                    **evaluate_quantity(
                        bundle,
                        self.__store,
                        payload["subject"],
                        payload["predicate"],
                        payload["valid_at"],
                        known_at,
                    ),
                }
            )
        if kind == "now-believed-for-then":
            bundle = self._current
            return public_output(
                {
                    "type": "now-believed-for-then",
                    **evaluate_quantity(
                        bundle,
                        self.__store,
                        payload["subject"],
                        payload["predicate"],
                        payload["valid_at"],
                        None,
                    ),
                }
            )
        if kind == "scenario-report":
            return public_output(self._scenario_report(payload.get("scenario_id", "")))
        raise InputError(
            "unknown_query",
            f"unsupported query {kind!r}",
            "os query known-then --scenario v001 --subject <subject> --predicate <predicate> --valid-at <date> --known-at <cut> --output json",
        )

    def explain(self, reference: str) -> dict[str, Any]:
        return public_output(explain_store(self.__store, reference))

    def record_counts(self) -> dict[str, int]:
        return self.__store.record_counts()

    def _resolve_cut(self, known_at: str) -> str:
        return self.__aliases.get(known_at, known_at)

    def _bundle_at(self, cut: str) -> DefinitionBundle:
        chosen = self.__installed[0][1]
        for known_revision, revision_id in self.__installed:
            if known_revision <= cut:
                chosen = revision_id
        bundle = self.__store.get("definition_revisions", chosen)
        if bundle is None:
            raise InputError("unknown_revision", f"no definition revision is known at {cut}", "os scenario run v001 --output json")
        return bundle

    def _pinned(self, revision_id: str) -> DefinitionBundle:
        bundle = self.__store.get("definition_revisions", revision_id)
        if bundle is None:
            raise InputError("unknown_revision", f"revision {revision_id} is not stored", "os scenario run v001 --output json")
        return bundle

    def _install(self, command: dict[str, Any]) -> CommandReceipt:
        bundle = load_bundle(command["definitions"])
        self.__store._put_definition_revision(bundle.revision_id, bundle)
        self._current = bundle
        revision = self.__store._next_revision()
        self.__installed.append((revision, bundle.revision_id))
        return CommandReceipt("InstallDefinitionRevision", "installed", revision, (qualify("defrev", bundle.revision_id),), {"revision_id": bundle.revision_id})

    def _create_entity(self, command: dict[str, Any]) -> CommandReceipt:
        forbidden = {"properties", "labels", "values", "attributes", "fields"}
        extra = forbidden.intersection(command)
        if extra:
            raise InputError(
                "raw_entity_write",
                f"CreateEntity does not accept {sorted(extra)}",
                "os scenario run v001 --output json",
            )
        revision = self.__store._next_revision()
        entity = Entity(
            entity_id=command["entity_id"],
            type_ref=_type_ref(command["type_ref"], self._current),
            created_at=self._clock.now(),
            creation_provenance=_provenance(command["provenance"]),
        )
        self.__store._put_entity(entity)
        return CommandReceipt("CreateEntity", "created", revision, (qualify("entity", entity.entity_id),), {})

    def _record_claim(self, command: dict[str, Any]) -> CommandReceipt:
        revision = self.__store._next_revision()
        validate_value(schema_for_predicate(self._current, command["predicate_ref"]), command["value"])
        claim = Claim(
            claim_id=command["claim_id"],
            subject_ref=command["subject_ref"],
            predicate_ref=command["predicate_ref"],
            value=retained(command["value"]),
            valid_time=_valid_time(command.get("valid_time")),
            known_revision=revision,
            provenance=_provenance(command["provenance"]),
            derived_from=tuple(command.get("derived_from") or ()),
            corrects=command.get("corrects"),
        )
        self.__store._put_claim(claim)
        refs = [qualify("claim", claim.claim_id)]
        relation = self._current.relations.get(claim.predicate_ref)
        if relation is not None and relation.projects_contextual_identity:
            payload = claim.value if isinstance(claim.value, dict) or hasattr(claim.value, "get") else {}
            identity = ContextualIdentity(
                identity_id=payload.get("identity_id") or self._ids.next("identity"),
                entity_id=claim.subject_ref,
                context_entity_id=payload["context_entity_id"],
                role_definition_ref=relation.definition_ref,
                provenance=claim.provenance,
                valid_time=claim.valid_time,
            )
            self.__store._put_identity(identity)
            refs.append(qualify("identity", identity.identity_id))
        return CommandReceipt("RecordClaim", "recorded", revision, tuple(refs), {"claim_id": claim.claim_id})

    def _record_occurrence(self, command: dict[str, Any]) -> CommandReceipt:
        revision = self.__store._next_revision()
        occurrence_ref = _type_ref(command["occurrence_ref"], self._current)
        occurrence = Occurrence(
            occurrence_id=command["occurrence_id"],
            occurrence_ref=occurrence_ref,
            valid_time=_valid_time(command.get("valid_time")),
            known_revision=revision,
            payload=retained(command.get("payload") or {}),
            provenance=_provenance(command["provenance"]),
            causal_operation_ref=command.get("causal_operation_ref"),
        )
        self.__store._put_occurrence(occurrence)
        refs = [qualify("occurrence", occurrence.occurrence_id)]
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
                    self.__store,
                    valid_at=self._clock.now(),
                    known_at=revision,
                ),
            )
            if isinstance(built, dict) and built.get("_kind") == "claim_draft":
                validate_value(schema_for_predicate(self._current, built["predicate_ref"]), built["value"])
                claim = Claim(
                    claim_id=built.get("claim_id") or self._ids.next("claim"),
                    subject_ref=built["subject_ref"],
                    predicate_ref=built["predicate_ref"],
                    value=retained(built["value"]),
                    valid_time=_valid_time(built.get("valid_time") or occurrence.valid_time),
                    known_revision=revision,
                    provenance=occurrence.provenance,
                    derived_from=(qualify("occurrence", occurrence.occurrence_id),),
                )
                self.__store._put_claim(claim)
                refs.append(qualify("claim", claim.claim_id))
        return CommandReceipt("RecordExternalOccurrence", "recorded", revision, tuple(refs), {})

    def _propose(self, command: dict[str, Any]) -> CommandReceipt:
        attribution = _attribution(command["attribution"])
        action = resolve_action(self._current, command["action_id"])
        if action.input_schema:
            validate_value(action.input_schema, command["inputs"], code="invalid_action_input")
        inputs = retained(command["inputs"])
        delegation = None
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
            parent = self.__store.get("delegations", delegation.parent_id) if delegation.parent_id else None
            check_delegation(
                delegation,
                attribution,
                action.definition_ref.definition_id,
                derived_resources(action.state_basis_spec, inputs),
                self._clock.now(),
                parent,
            )
            if self.__store.get("delegations", delegation.delegation_id) is None:
                self.__store._put_delegation(delegation)
        elif attribution.delegation_id:
            stored = self.__store.get("delegations", attribution.delegation_id)
            if stored is None:
                raise InputError("unknown_delegation", "proposal requires a stored or inline delegation", "os scenario run v001 --output json")
            check_delegation(
                stored,
                attribution,
                action.definition_ref.definition_id,
                derived_resources(action.state_basis_spec, inputs),
                self._clock.now(),
                self.__store.get("delegations", stored.parent_id) if stored.parent_id else None,
            )
            delegation = stored
        basis = capture_basis(
            self._current,
            self.__store,
            action.state_basis_spec,
            {**inputs, "now": self._clock.now()},
            self.__store.current_revision(),
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
                self.__store,
                valid_at=self._clock.now(),
                known_at=self.__store.current_revision(),
            ),
        )
        digest_value = intent_digest(
            action.definition_ref,
            inputs,
            attribution,
            command["proposal_id"],
            command.get("authority_namespace", "v001"),
            command["operation_id"],
            _delegation_payload(delegation) if delegation is not None else None,
        )
        revision = self.__store._next_revision()
        proposal = Proposal(
            proposal_id=command["proposal_id"],
            operation_id=command["operation_id"],
            authority_namespace=command.get("authority_namespace", "v001"),
            action_ref=action.definition_ref,
            canonical_inputs=inputs,
            intent_digest=digest_value,
            preview_plan=retained(preview if isinstance(preview, dict) else {"value": preview}),
            state_basis=basis,
            proposer=attribution,
            validity=command.get("validity") or self._clock.now(),
            replan_bounds=retained(command.get("replan_bounds") or {}),
            known_revision=revision,
        )
        self.__store._put_proposal(proposal)
        return CommandReceipt(
            "ProposeOperation",
            "proposed",
            revision,
            (qualify("proposal", proposal.proposal_id), qualify("basis", basis.basis_id)),
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
        proposal = self.__store.get("proposals", command["proposal_id"])
        if proposal is None:
            raise InputError("unknown_proposal", "approval requires a stored proposal", "os scenario run v001 --output json")
        basis = proposal.state_basis
        if basis is None:
            raise InputError("approval_without_basis", "approval requires state_basis", "os scenario run v001 --output json")
        if command.get("state_basis_ref") and command["state_basis_ref"] != basis.basis_id:
            raise InputError("basis_mismatch", "approval basis does not match proposal", "os scenario run v001 --output json")
        pinned = self._pinned(proposal.action_ref.revision_id)
        action = resolve_action(pinned, proposal.action_ref.definition_id)
        approver = _attribution(command["attribution"])
        approval_rules = [pinned.rules[rule_id] for rule_id in action.rule_refs if pinned.rules[rule_id].enforcement_locus == "approval"]
        approval_rules.sort(key=lambda item: item.combination_order)
        policy_refs = tuple(rule.definition_ref for rule in approval_rules)
        for rule in approval_rules:
            computation = resolve_computation(pinned, rule.computation_ref)
            outcome_value = evaluate(
                computation.expression,
                EvalContext(
                    {
                        "approver_actor_id": approver.actor_id,
                        "approver_delegation_id": approver.delegation_id,
                        "approver_principal_id": approver.represented_principal_id,
                        "approver_workload_id": approver.workload_id,
                        "proposal_id": proposal.proposal_id,
                    },
                    self.__store,
                    valid_at=self._clock.now(),
                    known_at=self.__store.current_revision(),
                ),
            )
            permitted = bool(outcome_value) if not isinstance(outcome_value, dict) else bool(outcome_value.get("permit", True))
            if not permitted:
                raise InputError(
                    "approval_denied",
                    "approver is not permitted by the pinned approval rule",
                    "os scenario run v001 --output json",
                )
        revision = self.__store._next_revision()
        approval = Approval(
            approval_id=command["approval_id"],
            proposal_ref=proposal.proposal_id,
            proposal_digest=proposal_digest(proposal),
            approved_bounds=retained(command["approved_bounds"]),
            state_basis_ref=basis.basis_id,
            state_basis=basis,
            approver=approver,
            policy_refs=policy_refs,
            known_revision=revision,
        )
        self.__store._put_approval(approval)
        return CommandReceipt(
            "RecordApproval",
            "approved",
            revision,
            (qualify("approval", approval.approval_id),),
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
        proposal = self.__store.get("proposals", command["proposal_id"])
        if proposal is not None:
            stored = self.__store.get("delegations", proposal.proposer.delegation_id)
            if stored is not None:
                pinned = self._pinned(proposal.action_ref.revision_id)
                action = resolve_action(pinned, proposal.action_ref.definition_id)
                check_delegation(
                    stored,
                    proposal.proposer,
                    action.definition_ref.definition_id,
                    derived_resources(action.state_basis_spec, proposal.canonical_inputs),
                    self._clock.now(),
                    self.__store.get("delegations", stored.parent_id) if stored.parent_id else None,
                )
        return commit_operation(self._current, self.__store, command, self._clock.now(), self._ids.next, provenance)

    def _attempt(self, command: dict[str, Any]) -> CommandReceipt:
        request = self.__store.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", "os scenario run v001 --output json")
        bundle = self._pinned(request.effect_ref.revision_id)
        effect = resolve_effect(bundle, request.effect_ref.definition_id)
        knowledge = self.__store.latest_knowledge(request.request_id)
        allowed, reason = retry_allowed(effect, knowledge)
        if knowledge != "not_attempted" and not allowed:
            return CommandReceipt(
                "RecordEffectAttempt",
                reason,
                self.__store.current_revision(),
                (),
                {"code": reason, "knowledge": knowledge},
            )
        self.__store._begin()
        try:
            revision = self.__store._next_revision()
            attempt = EffectAttempt(
                attempt_id=command.get("attempt_id") or self._ids.next("attempt"),
                request_id=request.request_id,
                request_digest=request.intent_digest,
                started_revision=revision,
                observed_revision=revision,
                outcome=command["outcome"],
                transport_evidence=retained(command.get("transport_evidence") or {}),
                remote_receipt=command.get("remote_receipt"),
            )
            new_knowledge = reduce_attempt(knowledge, attempt.outcome)
            self.__store._put_effect_attempt(attempt)
            self.__store._put_effect_knowledge(
                EffectKnowledgeRecord(
                    record_id=self._ids.next("ek"),
                    request_id=request.request_id,
                    prior_knowledge=knowledge,
                    evidence_refs=(qualify("attempt", attempt.attempt_id),),
                    new_knowledge=new_knowledge,
                    reducer_ref=effect.definition_ref,
                    known_revision=revision,
                )
            )
            link = CausalLink(
                self._ids.next("link"),
                qualify("effect", request.request_id),
                "attempted-as",
                qualify("attempt", attempt.attempt_id),
                effect.definition_ref,
                revision,
            )
            self.__store._put_link(link)
            self.__store._commit()
        except Exception:
            self.__store._rollback()
            raise
        return CommandReceipt(
            "RecordEffectAttempt",
            new_knowledge,
            revision,
            (qualify("attempt", attempt.attempt_id), qualify("link", link.link_id)),
            {"attempt_id": attempt.attempt_id, "knowledge": new_knowledge, "outcome": attempt.outcome},
        )

    def _reconcile(self, command: dict[str, Any]) -> CommandReceipt:
        request = self.__store.get("effect_requests", command["request_id"])
        if request is None:
            raise InputError("unknown_effect", "effect request is not stored", "os scenario run v001 --output json")
        bundle = self._pinned(request.effect_ref.revision_id)
        effect = resolve_effect(bundle, request.effect_ref.definition_id)
        prior = self.__store.latest_knowledge(request.request_id)
        evidence_refs = tuple(qualify(ref.split(":", 1)[0], ref) if ":" in ref else ref for ref in (command.get("evidence_refs") or ()))
        for reference in evidence_refs:
            resolve_protocol_ref(self.__store, reference)
        computed: Any = command.get("resulting_knowledge")
        if effect.reconciliation_ref:
            computation = resolve_computation(bundle, effect.reconciliation_ref)
            computed = evaluate(
                computation.expression,
                EvalContext(
                    {
                        "evidence_count": len(evidence_refs),
                        "evidence_refs": list(evidence_refs),
                        "prior_knowledge": prior,
                    },
                    self.__store,
                    known_at=self.__store.current_revision(),
                ),
            )
            if isinstance(computed, dict):
                computed = computed.get("knowledge")
        new_knowledge = reconcile_knowledge(prior, computed)
        self.__store._begin()
        try:
            revision = self.__store._next_revision()
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
            self.__store._put_reconciliation(record)
            self.__store._put_effect_knowledge(
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
            links = [
                CausalLink(
                    self._ids.next("link"),
                    qualify("effect", request.request_id),
                    "reconciled-by",
                    qualify("recon", record.reconciliation_id),
                    effect.definition_ref,
                    revision,
                )
            ]
            for reference in evidence_refs:
                links.append(
                    CausalLink(
                        self._ids.next("link"),
                        reference,
                        "evidenced",
                        qualify("recon", record.reconciliation_id),
                        None,
                        revision,
                    )
                )
            for link in links:
                self.__store._put_link(link)
            self.__store._commit()
        except Exception:
            self.__store._rollback()
            raise
        attempts = [item for item in self.__store.all("effect_attempts") if item.request_id == request.request_id]
        return CommandReceipt(
            "ReconcileEffect",
            new_knowledge,
            revision,
            (qualify("recon", record.reconciliation_id), *(qualify("link", link.link_id) for link in links)),
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
            for item in self.__store.claims()
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
            for item in self.__store.all("receipts")
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
            for item in self.__store.all("effect_knowledge")
        ]
        knowledge.sort(key=lambda item: item["record_id"])
        identities = [
            {
                "identity_id": item.identity_id,
                "entity_id": item.entity_id,
                "context_entity_id": item.context_entity_id,
                "role_definition_ref": item.role_definition_ref.definition_id,
            }
            for item in self.__store.all("contextual_identities")
        ]
        identities.sort(key=lambda item: item["identity_id"])
        return {
            "scenario_id": scenario_id,
            "definition_revisions": sorted(self.__store.keys("definition_revisions")),
            "records": {
                "claims": claims,
                "occurrences": [
                    {
                        "occurrence_id": item.occurrence_id,
                        "occurrence_ref": item.occurrence_ref.definition_id,
                        "known_revision": item.known_revision,
                        "causal_operation_ref": item.causal_operation_ref,
                    }
                    for item in sorted(self.__store.all("occurrences"), key=lambda item: item.occurrence_id)
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
                    for item in sorted(self.__store.all("proposals"), key=lambda item: item.proposal_id)
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
                    for item in sorted(self.__store.all("approvals"), key=lambda item: item.approval_id)
                ],
                "rule_decisions": [
                    {"decision_id": item.decision_id, "outcome": item.outcome, "locus": item.locus}
                    for item in sorted(self.__store.all("rule_decisions"), key=lambda item: item.decision_id)
                ],
                "causal_links": [
                    {
                        "link_id": item.link_id,
                        "cause_ref": item.cause_ref,
                        "relation": item.relation,
                        "consequence_ref": item.consequence_ref,
                    }
                    for item in sorted(self.__store.all("causal_links"), key=lambda item: item.link_id)
                ],
                "effect_requests": [
                    {
                        "request_id": item.request_id,
                        "parent_operation_id": item.parent_operation_id,
                        "effect_ref": item.effect_ref.definition_id,
                    }
                    for item in sorted(self.__store.all("effect_requests"), key=lambda item: item.request_id)
                ],
                "effect_attempts": [
                    {
                        "attempt_id": item.attempt_id,
                        "request_id": item.request_id,
                        "outcome": item.outcome,
                    }
                    for item in sorted(self.__store.all("effect_attempts"), key=lambda item: item.attempt_id)
                ],
                "reconciliations": [
                    {
                        "reconciliation_id": item.reconciliation_id,
                        "request_id": item.request_id,
                        "prior_knowledge": item.prior_knowledge,
                        "resulting_knowledge": item.resulting_knowledge,
                        "evidence_refs": list(item.evidence_refs),
                    }
                    for item in sorted(self.__store.all("reconciliations"), key=lambda item: item.reconciliation_id)
                ],
                "envelopes": [
                    {
                        "operation_id": item.operation_id,
                        "attribution": item.attribution.as_dict(),
                        "action_revision": item.action_ref.revision_id,
                    }
                    for item in sorted(self.__store.all("envelopes"), key=lambda item: item.operation_id)
                ],
            },
            "operation_receipts": receipts,
            "effect_knowledge": knowledge,
            "record_counts": self.record_counts(),
            "aliases": dict(sorted(self.__aliases.items())),
        }
