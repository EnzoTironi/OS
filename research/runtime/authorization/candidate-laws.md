# Candidate laws — authorization and delegation

**Issue:** #42  
**Status:** falsifiable Wave B hypotheses. `supported` means scoped evidence is strong, not accepted architecture.

## L-AUTH-01 — workload identity and business actor identity are distinct

**State:** `supported`.

A cryptographically authenticated workload/process does not by itself identify the human/agent/organization whose business authority is exercised.

## L-AUTH-02 — actor and represented principal can be distinct

**State:** `supported`.

An agent/service can act on behalf of another principal without becoming that principal for audit/identity purposes.

## L-AUTH-03 — on-behalf-of authority requires an explicit authority path

**State:** `supported`.

Impersonation by copying a user's role/ID is insufficient; the request must rely on a valid delegation/representation contract.

## L-AUTH-04 — delegation scope is semantic Action/resource/context scope, not only API-route permission

**State:** `supported`.

A task grant can restrict business operation, object/set, amount, purpose, time, tenant, channel, etc.

## L-AUTH-05 — subdelegation cannot expand its parent authority by default

**State:** `supported`.

A child grant must be a permitted narrowing of the authority the parent is allowed to delegate. Independent authority sources can issue independent grants.

## L-AUTH-06 — grant issuance and grant exercise are distinct governed occurrences

**State:** `supported`.

Issuing/revoking a delegation is not the same business Action as exercising it later.

## L-AUTH-07 — agent self-expansion of authority is not permitted by possession of the current grant

**State:** `supported`.

The grantee can request/propose more authority; issuance must come from an authority source/governed process.

## L-AUTH-08 — request-time authorization and business approval are distinct

**State:** `supported`.

A PDP allow decision does not itself become durable four-eyes/business Approval evidence, and a historical Approval does not automatically satisfy current execution authorization.

## L-AUTH-09 — separation of duties constrains combinations/participation, not independent per-action allow

**State:** `supported`.

The same actor/authority chain can be independently allowed to propose and approve while the combination is forbidden for one case.

## L-AUTH-10 — SoD identity equality is domain/context-sensitive

**State:** `supported` as pressure.

`same effective authority` may mean same person, represented principal, grant chain, organization or another relation depending the control. Generic actor-ID inequality is not enough.

## L-AUTH-11 — current authority and historical approval can have different temporal bases

**State:** `supported`.

A historical approval can remain valid after approver deactivation while current executor/delegation/freeze checks are evaluated according to the operation contract.

## L-AUTH-12 — revocation semantics require an ordering/currentness contract

**State:** `supported`.

`revoked=true` stored somewhere does not define races. Commit/effect execution must establish which grant/policy revision or capability was current under the declared authority contract.

## L-AUTH-13 — fail-closed authorization errors are different from business denial

**State:** `supported`.

Missing policy data/PDP outage/invalid signature must not silently allow. Operational `indeterminate/error` can be surfaced separately from a business/policy `Denied` while enforcement remains deny/fail closed.

## L-AUTH-14 — policy/model revision is part of auditable authorization evidence

**State:** `supported`.

Historical explanation must identify which policy/model/grant revision evaluated the request when later definitions change.

## L-AUTH-15 — workload-to-actor binding is an authorization/security relation

**State:** `supported`.

Authenticating W with SPIFFE/SVID still requires OS/runtime rules saying W may execute as semantic Agent/Service A in tenant/environment E.

## L-AUTH-16 — SPIFFE workload identity is not business delegation

**State:** `supported`.

SPIFFE solves workload authentication/trust, not task scope, amount limits, represented humans, approval or SoD.

## L-AUTH-17 — AuthZEN is a PDP API boundary, not OS authorization semantics

**State:** `supported`.

An interoperable PEP↔PDP request/response does not define durable grant ontology, SoD, relationship truth or policy language.

## L-AUTH-18 — one authorization evaluator is preferable until concrete scenarios prove it insufficient

**State:** `hypothesis`, optimization for semantic simplicity rather than a universal law.

Multiple PDPs introduce decision combination, revision synchronization and explanation complexity. Use them only if one backend cannot express/enforce required semantics without hidden policy logic.

## L-AUTH-19 — Cedar can express contextual permits/forbids if OS supplies authoritative entity/grant context

**State:** `supported` as capability evidence; operational sufficiency `hypothesis`.

The open question is efficient/correct relationship-data assembly, not basic conditional policy expressiveness.

## L-AUTH-20 — OpenFGA can persist/evaluate relationship authorization with conditions/contextual tuples

**State:** `supported` as capability evidence; full contextual-policy sufficiency `hypothesis`.

The open question is whether emergency-deny/complex numeric/purpose/SoD semantics remain clear without a second policy interpreter.

## L-AUTH-21 — evaluator input assembly must not become a hidden second PDP

**State:** `supported` as architecture criterion.

Fetching/projection of entity/grant context can be deterministic data preparation. If application code itself makes allow/deny policy choices before invoking the backend, the claimed single-PDP architecture is false.

## L-AUTH-22 — negative/non-waivable restrictions need explicit precedence semantics

**State:** `supported`.

Whether implemented with Cedar forbid, OpenFGA exclusion/condition, or another backend, emergency freeze/cross-tenant/self-approval denial must have unambiguous composition with positive grants.

## L-AUTH-23 — effect-execution authority can vest at local commit or remain current-at-attempt; contract must say which

**State:** `supported`.

#41 proves later EffectRequest execution is a distinct time boundary. Do not globally reauthorize or globally freeze all authority.

## L-AUTH-24 — service/automation authority need not impersonate a person

**State:** `supported`.

An organization-owned service can act under durable service authority/capability while remaining separately attributable.

## L-AUTH-25 — no evidence yet requires `Principal`, `Role`, or `Grant` as root metamodel primitives

**State:** `hypothesis` / `not-earned`.

Current requirements appear composable from typed actors/relationships/grant records plus a generic hard authorization boundary. #70 must try to falsify that reduction.

# Explicit non-laws

Rejected as universal claims:

- `authenticated workload = authorized business actor`;
- `agent gets all permissions of delegating user`;
- `on behalf of = impersonate represented principal`;
- `role membership is a delegation grant`;
- `subagent inherits full parent authority automatically`;
- `approval=true is enough for request-time authorization`;
- `PDP allow response is a business Approval`;
- `same actor id inequality proves four-eyes independence`;
- `all policies/grants freeze at approval`;
- `all policies/grants are reevaluated against latest state at every later step`;
- `revocation is instantaneous without a consistency/fencing mechanism`;
- `SPIFFE ID is Person/Agent identity`;
- `AuthZEN standardizes the organization's authorization ontology`;
- `Cedar + OpenFGA are both required`;
- `OpenFGA is only ReBAC and cannot use contextual conditions`;
- `Cedar persists the organization's authorization graph for us`;
- `Principal/Role/Grant has been proven a metamodel primitive`.
