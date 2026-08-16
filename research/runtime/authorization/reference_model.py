#!/usr/bin/env python3
"""Minimal executable research model for issue #42.

NOT a PDP, IAM, Cedar/OpenFGA adapter, or target metamodel. It exists to make
several semantic constraints executable before backend selection:

* workload authentication/binding is distinct from semantic actor identity;
* delegation has grantor/grantee/represented principal and bounded scope;
* child grants may narrow but not expand parent-delegable authority;
* current revocation/expiry is explicit;
* request authorization checks action/resource/purpose/amount scope;
* emergency deny overrides positive grants;
* four-eyes can compare effective represented authority, not only actor IDs;
* evaluator errors can remain indeterminate while enforcement fails closed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Iterable


class Decision(str, Enum):
    ALLOWED = "allowed"
    DENIED = "denied"
    INDETERMINATE = "indeterminate"


@dataclass(frozen=True)
class Result:
    decision: Decision
    reason: str
    grant_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class WorkloadBinding:
    workload_id: str
    actor_id: str
    tenant: str
    environment: str = "production"
    active: bool = True


@dataclass(frozen=True)
class Grant:
    grant_id: str
    grantor_id: str
    grantee_actor_id: str
    represented_principal_id: str
    actions: frozenset[str]
    resources: frozenset[str]
    purposes: frozenset[str]
    tenant: str
    amount_limit: int | None = None
    valid_until: int | None = None
    active: bool = True
    may_subdelegate: bool = False
    remaining_depth: int = 0
    parent_grant_id: str | None = None

    def covers(self, *, action: str, resource: str, purpose: str, amount: int | None, now: int) -> bool:
        if not self.active:
            return False
        if self.valid_until is not None and now >= self.valid_until:
            return False
        if action not in self.actions or resource not in self.resources or purpose not in self.purposes:
            return False
        if self.amount_limit is not None and amount is not None and amount > self.amount_limit:
            return False
        return True


@dataclass(frozen=True)
class Request:
    workload_id: str
    actor_id: str
    represented_principal_id: str | None
    tenant: str
    environment: str
    action: str
    resource: str
    purpose: str
    now: int
    amount: int | None = None
    relied_grant_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class Participation:
    case_id: str
    action: str
    actor_id: str
    represented_principal_id: str | None


@dataclass
class AuthorityWorld:
    workload_bindings: dict[tuple[str, str, str, str], WorkloadBinding] = field(default_factory=dict)
    grants: dict[str, Grant] = field(default_factory=dict)
    emergency_denies: set[tuple[str, str, str]] = field(default_factory=set)
    participation: list[Participation] = field(default_factory=list)

    def bind_workload(self, binding: WorkloadBinding) -> None:
        self.workload_bindings[(binding.workload_id, binding.actor_id, binding.tenant, binding.environment)] = binding

    def add_grant(self, grant: Grant) -> None:
        if grant.parent_grant_id is not None:
            parent = self.grants.get(grant.parent_grant_id)
            if parent is None:
                raise ValueError("parent grant missing")
            validate_subgrant(parent, grant)
        self.grants[grant.grant_id] = grant

    def deny(self, tenant: str, action: str, resource: str) -> None:
        self.emergency_denies.add((tenant, action, resource))


class Authorizer:
    def __init__(self, world: AuthorityWorld):
        self.world = world

    def authorize(self, request: Request, *, evaluator_available: bool = True) -> Result:
        if not evaluator_available:
            return Result(Decision.INDETERMINATE, "authorization evaluator unavailable; enforcement must fail closed")

        binding = self.world.workload_bindings.get(
            (request.workload_id, request.actor_id, request.tenant, request.environment)
        )
        if binding is None or not binding.active:
            return Result(Decision.DENIED, "authenticated workload is not actively bound to requested semantic actor/tenant/environment")

        if (request.tenant, request.action, request.resource) in self.world.emergency_denies:
            return Result(Decision.DENIED, "matching non-waivable/emergency deny")

        grants: list[Grant] = []
        for grant_id in request.relied_grant_ids:
            grant = self.world.grants.get(grant_id)
            if grant is None:
                return Result(Decision.DENIED, f"missing relied-upon grant {grant_id}")
            if grant.grantee_actor_id != request.actor_id or grant.tenant != request.tenant:
                return Result(Decision.DENIED, f"grant {grant_id} does not belong to actor/tenant")
            if request.represented_principal_id != grant.represented_principal_id:
                return Result(Decision.DENIED, f"represented principal does not match grant {grant_id}")
            grants.append(grant)

        matching = [
            grant
            for grant in grants
            if grant.covers(
                action=request.action,
                resource=request.resource,
                purpose=request.purpose,
                amount=request.amount,
                now=request.now,
            )
        ]
        if not matching:
            return Result(Decision.DENIED, "no relied-upon active grant covers request")

        return Result(Decision.ALLOWED, "request covered by active scoped grant", tuple(g.grant_id for g in matching))

    def authorize_independent_approval(
        self,
        request: Request,
        *,
        case_id: str,
        prohibited_prior_action: str,
        independence_by: str = "represented_principal",
    ) -> Result:
        base = self.authorize(request)
        if base.decision is not Decision.ALLOWED:
            return base

        for prior in self.world.participation:
            if prior.case_id != case_id or prior.action != prohibited_prior_action:
                continue
            if independence_by == "actor" and prior.actor_id == request.actor_id:
                return Result(Decision.DENIED, "same actor already performed incompatible prior action")
            if (
                independence_by == "represented_principal"
                and prior.represented_principal_id is not None
                and prior.represented_principal_id == request.represented_principal_id
            ):
                return Result(Decision.DENIED, "same represented authority already performed incompatible prior action")
        return base


def validate_subgrant(parent: Grant, child: Grant) -> None:
    if not parent.active:
        raise ValueError("inactive parent cannot issue/validate subgrant")
    if not parent.may_subdelegate or parent.remaining_depth <= 0:
        raise ValueError("parent authority is not delegable")
    if child.parent_grant_id != parent.grant_id:
        raise ValueError("child does not reference parent grant")
    if child.grantor_id != parent.grantee_actor_id:
        raise ValueError("child grantor must be parent grantee in this reference model")
    if child.represented_principal_id != parent.represented_principal_id:
        raise ValueError("child cannot change represented authority source")
    if child.tenant != parent.tenant:
        raise ValueError("child cannot cross tenant")
    if not child.actions.issubset(parent.actions):
        raise ValueError("child actions expand parent")
    if not child.resources.issubset(parent.resources):
        raise ValueError("child resources expand parent")
    if not child.purposes.issubset(parent.purposes):
        raise ValueError("child purposes expand parent")
    if parent.amount_limit is not None:
        if child.amount_limit is None or child.amount_limit > parent.amount_limit:
            raise ValueError("child amount expands parent")
    if parent.valid_until is not None:
        if child.valid_until is None or child.valid_until > parent.valid_until:
            raise ValueError("child validity expands parent")
    if child.remaining_depth >= parent.remaining_depth:
        raise ValueError("child delegation depth must decrease")


def grant(
    grant_id: str,
    grantor: str,
    grantee: str,
    represented: str,
    *,
    actions: Iterable[str],
    resources: Iterable[str],
    purposes: Iterable[str],
    tenant: str = "T1",
    amount_limit: int | None = None,
    valid_until: int | None = None,
    active: bool = True,
    may_subdelegate: bool = False,
    remaining_depth: int = 0,
    parent_grant_id: str | None = None,
) -> Grant:
    return Grant(
        grant_id=grant_id,
        grantor_id=grantor,
        grantee_actor_id=grantee,
        represented_principal_id=represented,
        actions=frozenset(actions),
        resources=frozenset(resources),
        purposes=frozenset(purposes),
        tenant=tenant,
        amount_limit=amount_limit,
        valid_until=valid_until,
        active=active,
        may_subdelegate=may_subdelegate,
        remaining_depth=remaining_depth,
        parent_grant_id=parent_grant_id,
    )
