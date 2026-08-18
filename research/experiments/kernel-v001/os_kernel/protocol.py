from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from os_kernel.canonical import digest, retained
from os_kernel.definitions import ActionDefinition, DefinitionBundle, pinned_expression, resolve_action, resolve_computation, resolve_effect
from os_kernel.errors import InputError, InternalError
from os_kernel.expression import EvalContext, evaluate
from os_kernel.model import (
    Attribution,
    CausalLink,
    Claim,
    CommandReceipt,
    DefinitionRef,
    Delegation,
    EffectKnowledgeRecord,
    EffectRequest,
    MutationPlan,
    OperationEnvelope,
    OperationReceipt,
    Provenance,
    RuleDecision,
    StateBasis,
    StateDependency,
    ValidTime,
)
from os_kernel.store import Store
from os_kernel.validation import parse_valid_time, qualify, schema_for_predicate, validate_value


def intent_digest(
    action_ref: DefinitionRef,
    inputs: Any,
    attribution: Attribution,
    proposal_id: str,
    namespace: str,
    operation_id: str,
    delegation: dict[str, Any] | None,
) -> str:
    return digest(
        {
            "authority_namespace": namespace,
            "operation_id": operation_id,
            "proposal_id": proposal_id,
            "action_ref": {
                "definition_id": action_ref.definition_id,
                "revision_id": action_ref.revision_id,
                "definition_digest": action_ref.definition_digest,
            },
            "inputs": inputs,
            "attribution": attribution.as_dict(),
            "delegation": delegation or {},
        }
    )


def proposal_digest(proposal) -> str:
    return digest(
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
            "preview_plan": proposal.preview_plan,
            "replan_bounds": proposal.replan_bounds,
            "validity": proposal.validity,
        }
    )


def capture_basis(
    bundle: DefinitionBundle,
    store: Store,
    spec: tuple[dict[str, Any], ...],
    inputs: dict[str, Any],
    knowledge_cut: str,
    ids_next,
) -> StateBasis:
    dependencies: list[StateDependency] = []
    refs: list[DefinitionRef] = []
    for item in spec:
        query = dict(item.get("query", {}))
        subject = query.get("subject") or inputs.get(query.get("subject_input", "subject"))
        predicate = query.get("predicate") or inputs.get(query.get("predicate_input", "predicate"))
        computation = resolve_computation(bundle, item["computation_ref"])
        ctx = EvalContext(
            inputs={**inputs, "subject": subject, "predicate": predicate},
            store=store,
            valid_at=inputs.get("valid_at") or inputs.get("now"),
            known_at=knowledge_cut,
            knowledge_cut=knowledge_cut,
        )
        value = evaluate(pinned_expression(computation), ctx)
        evidence = [
            claim.claim_id
            for claim in store.claims()
            if claim.subject_ref == subject and claim.predicate_ref == predicate
        ]
        evidence.sort()
        dependencies.append(
            StateDependency(
                dependency_id=item.get("id") or ids_next("dep"),
                mode=item.get("mode", "current_at_commit"),
                query={"subject": subject, "predicate": predicate, "computation_ref": item["computation_ref"]},
                evaluated_value=value,
                result_digest=digest(value),
                evidence_refs=tuple(evidence),
            )
        )
        refs.append(computation.definition_ref)
    basis_digest = digest(
        {
            "dependencies": [
                {"id": dep.dependency_id, "mode": dep.mode, "value": dep.evaluated_value, "digest": dep.result_digest}
                for dep in dependencies
            ],
        }
    )
    return StateBasis(
        basis_id=ids_next("basis"),
        dependencies=tuple(dependencies),
        knowledge_cut=knowledge_cut,
        definition_refs=tuple(refs),
        digest=basis_digest,
    )


def planner_basis_inputs(proposal_basis: StateBasis, current_basis: StateBasis) -> dict[str, Any]:
    inputs: dict[str, Any] = {}
    for dep in proposal_basis.dependencies:
        inputs[f"basis_{dep.dependency_id}"] = dep.evaluated_value
    for dep in current_basis.dependencies:
        inputs[f"current_{dep.dependency_id}"] = dep.evaluated_value
    return inputs


def _bound_value(approval_bounds: Any, path: str) -> Any:
    current: Any = approval_bounds
    for part in path.split("."):
        if isinstance(current, Mapping):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
    return current


def _valid_time(value: Any, fallback: str) -> ValidTime:
    if value is None:
        return parse_valid_time(fallback)
    if isinstance(value, ValidTime):
        return parse_valid_time(value)
    return parse_valid_time(value)


def _delegation_payload(delegation: Delegation | None) -> dict[str, Any]:
    if delegation is None:
        return {}
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


def commit_operation(
    bundle: DefinitionBundle,
    store: Store,
    command: dict[str, Any],
    clock_now: str,
    ids_next,
    local_provenance: Provenance,
) -> CommandReceipt:
    namespace = command.get("authority_namespace") or command.get("namespace")
    if not namespace:
        raise InputError("invalid_command", "authority_namespace is required", "os scenario run v001 --output json")
    operation_id = command["operation_id"]
    proposal = store.get("proposals", command["proposal_id"])
    approval = store.get("approvals", command["approval_id"])
    if proposal is None or approval is None:
        raise InputError(
            "missing_proposal_or_approval",
            "commit requires stored proposal and approval",
            "os scenario run v001 --output json",
        )
    if approval.proposal_ref != proposal.proposal_id:
        raise InputError("approval_mismatch", "approval does not reference the proposal", "os scenario run v001 --output json")
    if approval.proposal_digest != proposal_digest(proposal):
        raise InputError("approval_digest_mismatch", "approval digest does not match proposal", "os scenario run v001 --output json")
    attribution = Attribution(
        command["attribution"]["actor_id"],
        command["attribution"]["represented_principal_id"],
        command["attribution"]["workload_id"],
        command["attribution"]["delegation_id"],
    )
    if attribution != proposal.proposer:
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "attribution"},
        )
    stored_delegation = store.get("delegations", attribution.delegation_id)
    if stored_delegation is None:
        raise InputError(
            "unknown_delegation",
            "commit requires the stored delegation",
            "os scenario run v001 --output json",
        )
    if operation_id != proposal.operation_id:
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "operation_id"},
        )
    if namespace != proposal.authority_namespace:
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "authority_namespace"},
        )
    existing = store.receipt_for(namespace, operation_id)
    presented_inputs = command.get("canonical_inputs") or proposal.canonical_inputs
    presented_proposal = command.get("alternate_proposal_id") or command.get("proposal_id") or proposal.proposal_id
    presented_revision = command.get("action_revision_id")
    expected_digest = intent_digest(
        proposal.action_ref,
        presented_inputs,
        attribution,
        presented_proposal,
        namespace,
        operation_id,
        _delegation_payload(stored_delegation),
    )
    stored_digest = proposal.intent_digest
    if existing is not None:
        envelope = store.envelope_for(namespace, operation_id)
        same = (
            existing.action_ref.revision_id == proposal.action_ref.revision_id
            and (presented_revision is None or presented_revision == existing.action_ref.revision_id)
            and existing.intent_digest == stored_digest
            and expected_digest == stored_digest
            and digest(presented_inputs) == digest(proposal.canonical_inputs)
            and presented_proposal == proposal.proposal_id
            and envelope is not None
            and envelope.attribution == attribution
        )
        if same:
            return CommandReceipt(
                "CommitOperation",
                "replayed",
                store.current_revision(),
                (qualify("receipt", existing.operation_id),),
                {"receipt": _receipt_dict(existing), "replayed": True},
            )
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {
                "code": "intent_mismatch",
                "stored_digest": existing.intent_digest,
                "presented_digest": expected_digest,
            },
        )
    if digest(presented_inputs) != digest(proposal.canonical_inputs):
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "inputs"},
        )
    if presented_revision and presented_revision != proposal.action_ref.revision_id:
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "action_revision"},
        )
    if command.get("proposal_id") and command.get("alternate_proposal_id"):
        return CommandReceipt(
            "CommitOperation",
            "intent_mismatch",
            store.current_revision(),
            (),
            {"code": "intent_mismatch", "reason": "proposal"},
        )
    pinned_bundle = store.get("definition_revisions", proposal.action_ref.revision_id)
    if pinned_bundle is None:
        raise InternalError("missing_revision", "pinned action revision is not stored")
    pinned_action = resolve_action(pinned_bundle, proposal.action_ref.definition_id)
    store._begin()
    try:
        return _commit_body(
            pinned_action,
            pinned_bundle,
            store,
            command,
            proposal,
            approval,
            attribution,
            stored_digest,
            namespace,
            operation_id,
            clock_now,
            ids_next,
            local_provenance,
        )
    except Exception:
        store._rollback()
        raise


def _commit_body(
    action: ActionDefinition,
    bundle: DefinitionBundle,
    store: Store,
    command: dict[str, Any],
    proposal,
    approval,
    attribution: Attribution,
    expected_digest: str,
    namespace: str,
    operation_id: str,
    clock_now: str,
    ids_next,
    local_provenance: Provenance,
) -> CommandReceipt:
    current_basis = capture_basis(
        bundle,
        store,
        action.state_basis_spec,
        {**proposal.canonical_inputs, "now": clock_now},
        store.current_revision(),
        ids_next,
    )
    stale = current_basis.digest != proposal.state_basis.digest
    planner = resolve_computation(bundle, action.planner_ref)
    planner_inputs = {
        **proposal.canonical_inputs,
        "now": clock_now,
        "proposed_quantity": proposal.canonical_inputs.get("quantity"),
        **planner_basis_inputs(proposal.state_basis, current_basis),
        "approval": approval.approved_bounds,
        "stale": stale,
        "subject": proposal.canonical_inputs.get("subject"),
        "predicate": proposal.canonical_inputs.get("predicate"),
    }
    plan_result = evaluate(
        pinned_expression(planner),
        EvalContext(planner_inputs, store, valid_at=clock_now, known_at=store.current_revision()),
    )
    if not isinstance(plan_result, dict):
        raise InternalError("planner", "planner must return construct_result")
    quantity = plan_result.get("quantity")
    bound = _bound_value(approval.approved_bounds, action.bound_path)
    if bound is not None and quantity is not None and float(quantity) > float(bound):
        store._rollback()
        return CommandReceipt(
            "CommitOperation",
            "needs_reproposal",
            store.current_revision(),
            (),
            {"code": "needs_reproposal", "quantity": quantity, "bound": bound},
        )
    if action.stale_behavior == "reject" and stale:
        store._rollback()
        return CommandReceipt(
            "CommitOperation",
            "stale_rejected",
            store.current_revision(),
            (),
            {"code": "stale_rejected"},
        )
    if stale and float(quantity) == float(proposal.canonical_inputs.get("quantity")):
        raise InternalError("stale_not_replanned", "stale commit kept the proposed quantity")
    decisions: list[RuleDecision] = []
    commit_rules = [bundle.rules[rule_id] for rule_id in action.rule_refs if bundle.rules[rule_id].enforcement_locus != "approval"]
    commit_rules.sort(key=lambda item: item.combination_order)
    for rule in commit_rules:
        computation = resolve_computation(bundle, rule.computation_ref)
        outcome_value = evaluate(
            pinned_expression(computation),
            EvalContext({**planner_inputs, "quantity": quantity}, store, valid_at=clock_now),
        )
        permitted = bool(outcome_value) if not isinstance(outcome_value, dict) else bool(outcome_value.get("permit", True))
        decision = RuleDecision(
            decision_id=ids_next("rule"),
            rule_ref=rule.definition_ref,
            locus=rule.enforcement_locus,
            basis_ref=current_basis.basis_id,
            outcome="permit" if permitted else rule.error_outcome,
            determining_evidence=tuple(),
            evaluated_revision=store.current_revision(),
        )
        if decision.outcome != "permit":
            store._rollback()
            return CommandReceipt("CommitOperation", "denied", store.current_revision(), (), {"rule": rule.definition_ref.definition_id})
        decisions.append(decision)
    mutation_expr = None
    if action.mutation_plan_ref:
        mutation_expr = pinned_expression(resolve_computation(bundle, action.mutation_plan_ref))
    mutations: list[dict[str, Any]] = []
    if mutation_expr is not None:
        built = evaluate(
            mutation_expr,
            EvalContext({**planner_inputs, "quantity": quantity, "plan": plan_result}, store, valid_at=clock_now),
        )
        if isinstance(built, dict):
            if built.get("claim"):
                mutations.append(built["claim"])
            if built.get("effect_request"):
                mutations.append(built["effect_request"])
            extra = built.get("mutations")
            if isinstance(extra, list):
                mutations.extend(extra)
    commit_revision = store._next_revision()
    refs: list[str] = []
    for decision in decisions:
        store._put_rule_decision(decision)
        refs.append(qualify("rule", decision.decision_id))
    local_claims: list[Claim] = []
    effect_requests: list[EffectRequest] = []
    for mutation in mutations:
        kind = mutation.get("_kind")
        if kind == "claim_draft":
            validate_value(schema_for_predicate(bundle, mutation["predicate_ref"]), mutation["value"])
            claim = Claim(
                claim_id=mutation.get("claim_id") or ids_next("claim"),
                subject_ref=mutation["subject_ref"],
                predicate_ref=mutation["predicate_ref"],
                value=retained(mutation["value"]),
                valid_time=_valid_time(mutation.get("valid_time"), clock_now),
                known_revision=commit_revision,
                provenance=local_provenance,
                derived_from=tuple(mutation.get("derived_from") or ()),
            )
            store._put_claim(claim)
            local_claims.append(claim)
            refs.append(qualify("claim", claim.claim_id))
        elif kind == "effect_request_draft":
            effect = resolve_effect(bundle, mutation["effect_id"])
            request = EffectRequest(
                request_id=mutation.get("request_id") or ids_next("effect"),
                parent_operation_id=operation_id,
                effect_ref=effect.definition_ref,
                intent_digest=expected_digest,
                payload=retained(mutation.get("payload") or {}),
                retry_safety=effect.protocol_safety,
                reconciliation_strategy=effect.reconciliation_ref or "",
            )
            store._put_effect_request(request)
            store._put_effect_knowledge(
                EffectKnowledgeRecord(
                    record_id=ids_next("ek"),
                    request_id=request.request_id,
                    prior_knowledge="not_attempted",
                    evidence_refs=(),
                    new_knowledge="not_attempted",
                    reducer_ref=None,
                    known_revision=commit_revision,
                )
            )
            effect_requests.append(request)
            refs.append(qualify("effect", request.request_id))
        elif kind == "occurrence_draft":
            raise InternalError("action_occurrence", "commit mutations must not emit occurrences for the action")
        else:
            raise InternalError("unknown_mutation", f"unsupported mutation {kind}")
    plan = MutationPlan(
        planner_ref=planner.definition_ref,
        mutations=tuple(mutations),
        expected_result={"quantity": quantity, "stale": stale},
        causal_inputs=tuple(dep.evidence_refs[0] for dep in current_basis.dependencies if dep.evidence_refs),
    )
    envelope = OperationEnvelope(
        operation_id=operation_id,
        authority_namespace=namespace,
        action_ref=proposal.action_ref,
        canonical_inputs=retained(proposal.canonical_inputs),
        intent_digest=expected_digest,
        attribution=attribution,
        proposal_ref=proposal.proposal_id,
        approval_ref=approval.approval_id,
        created_revision=commit_revision,
    )
    envelope_ref = qualify("operation", f"{namespace}:{operation_id}")
    receipt_ref = qualify("receipt", operation_id)
    links = [
        CausalLink(ids_next("link"), envelope_ref, "committed-as", receipt_ref, action.definition_ref, commit_revision),
        CausalLink(ids_next("link"), qualify("proposal", proposal.proposal_id), "approved-by", qualify("approval", approval.approval_id), None, commit_revision),
        CausalLink(ids_next("link"), qualify("approval", approval.approval_id), "committed-as", receipt_ref, action.definition_ref, commit_revision),
        CausalLink(ids_next("link"), qualify("basis", proposal.state_basis.basis_id), "proposal-basis", receipt_ref, None, commit_revision),
        CausalLink(ids_next("link"), qualify("basis", current_basis.basis_id), "commit-basis", receipt_ref, None, commit_revision),
    ]
    for decision in decisions:
        links.append(CausalLink(ids_next("link"), qualify("receipt", operation_id), "evaluated-rule", qualify("rule", decision.decision_id), decision.rule_ref, commit_revision))
    for claim in local_claims:
        links.append(CausalLink(ids_next("link"), qualify("receipt", operation_id), "produced-claim", qualify("claim", claim.claim_id), None, commit_revision))
    for request in effect_requests:
        links.append(CausalLink(ids_next("link"), qualify("receipt", operation_id), "requested-effect", qualify("effect", request.request_id), request.effect_ref, commit_revision))
    refs.extend(qualify("link", link.link_id) for link in links)
    refs.append(qualify("receipt", operation_id))
    result = {
        "quantity": quantity,
        "stale": stale,
        "plan": plan_result,
        "commit_basis": _basis_dict(current_basis),
    }
    receipt = OperationReceipt(
        operation_id=operation_id,
        authority_namespace=namespace,
        intent_digest=expected_digest,
        action_ref=proposal.action_ref,
        outcome="committed",
        result=retained(result),
        committed_refs=tuple(refs),
        commit_revision=commit_revision,
        stale=stale,
        proposal_basis_digest=proposal.state_basis.digest,
        commit_basis_digest=current_basis.digest,
        planned_quantity=proposal.canonical_inputs.get("quantity"),
        committed_quantity=quantity,
    )
    store._put_envelope(envelope)
    store._put_receipt(receipt)
    for link in links:
        store._put_link(link)
    store._commit()
    return CommandReceipt(
        "CommitOperation",
        "committed",
        commit_revision,
        tuple(refs),
        {
            "receipt": _receipt_dict(receipt),
            "proposal_basis": _basis_dict(proposal.state_basis),
            "commit_basis": _basis_dict(current_basis),
            "stale": stale,
            "planned_quantity": receipt.planned_quantity,
            "committed_quantity": receipt.committed_quantity,
            "mutation_plan": {
                "planner_ref": {
                    "definition_id": plan.planner_ref.definition_id,
                    "revision_id": plan.planner_ref.revision_id,
                },
                "expected_result": plan.expected_result,
            },
            "rule_decisions": [decision.decision_id for decision in decisions],
            "effect_requests": [request.request_id for request in effect_requests],
            "replayed": False,
        },
    )


def _receipt_dict(receipt: OperationReceipt) -> dict[str, Any]:
    return {
        "operation_id": receipt.operation_id,
        "authority_namespace": receipt.authority_namespace,
        "intent_digest": receipt.intent_digest,
        "action_ref": {
            "definition_id": receipt.action_ref.definition_id,
            "revision_id": receipt.action_ref.revision_id,
            "definition_digest": receipt.action_ref.definition_digest,
        },
        "outcome": receipt.outcome,
        "result": receipt.result,
        "committed_refs": list(receipt.committed_refs),
        "commit_revision": receipt.commit_revision,
        "stale": receipt.stale,
        "proposal_basis_digest": receipt.proposal_basis_digest,
        "commit_basis_digest": receipt.commit_basis_digest,
        "planned_quantity": receipt.planned_quantity,
        "committed_quantity": receipt.committed_quantity,
    }


def _basis_dict(basis: StateBasis) -> dict[str, Any]:
    return {
        "basis_id": basis.basis_id,
        "digest": basis.digest,
        "knowledge_cut": basis.knowledge_cut,
        "dependencies": [
            {
                "dependency_id": dep.dependency_id,
                "mode": dep.mode,
                "evaluated_value": dep.evaluated_value,
                "result_digest": dep.result_digest,
                "evidence_refs": list(dep.evidence_refs),
            }
            for dep in basis.dependencies
        ],
    }
