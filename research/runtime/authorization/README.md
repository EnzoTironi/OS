# Authorization, delegation, agents, workloads, and authority context

- Artifact ID: `issue-0042-authorization-delegation`
- Issue: <https://github.com/EnzoTironi/OS/issues/42>
- Track: Wave B authority/runtime research
- Date: 2026-08-16
- Inputs: Wave A #11/#60/#67 plus merged #40 commit semantics, #45 ingest/identity semantics, and #41 external-effect semantics
- Decision: none. This folder derives an authorization/delegation contract and tests competing evaluators. It does not select Cedar, OpenFGA, AuthZEN, SPIFFE, or a combined stack.

## Question

How should OS decide whether a human, agent, service, automation, or connector may perform one semantic operation when:

- the executing workload is not the business actor;
- an agent acts on behalf of a human or organization;
- authority was delegated for one task/purpose/window;
- the grant can be narrowed, revoked, or delegated again;
- current policy/state can change after proposal/approval;
- separation of duties depends on **combinations** of powers/actions;
- local commit and later external-effect execution can have different authority timing?

The key mistake to avoid is one overloaded `principal` field.

## Core distinction

A governed operation can involve several identities simultaneously:

```text
Business actor / decision subject
  Agent A wants to invoke Action X

Represented / authority source
  Human H or Organization O on whose behalf A acts

Delegation / task grant
  Grant G says what A may do, to which resources, for what purpose,
  until when, with what limits, and whether it may subdelegate

Executing workload
  Workload W is the authenticated process/pod/service instance actually
  presenting credentials to the runtime

Approver(s)
  P1/P2 may be separate actors whose approval evidence is required by the
  business operation, not merely by request-time IAM
```

Example:

```text
Human H
  └─ delegates task G: "negotiate supplier quotes up to R$ 50k"
       └─ Agent A
            └─ executes through Workload W
                 └─ proposes PurchaseAction P
                      └─ Approval by Manager M
                           └─ commit under #40 state/authority basis
```

`W authenticated` does not prove `A may act for H`.  
`A may act for H` does not prove `Action X is permitted on Resource R now`.  
`X is permitted` does not prove the same actor may approve its own proposal.

## Authorization request envelope

The strongest current working model evaluates a request conceptually like:

```text
AuthorizationRequest {
  actor                  // human, agent, service acting semantically
  representedPrincipal?  // on-behalf-of / authority source when applicable
  workload               // authenticated execution identity
  action                 // semantic Action/capability
  resource(s)            // object/set/context target
  context                // amount, tenant, purpose, time, risk, state, channel...
  grantChain[]            // delegation/task grants relied upon
  proposal/approvalRefs? // when operation semantics require them
  policyRevisionBasis
}
```

This is research vocabulary, not a required wire format.

## Strongest finding: authentication, delegation, authorization, and governance are four different jobs

### Authentication/workload identity

Answers:

> what workload/process is this credential bound to?

SPIFFE/SVID is a strong donor for this layer.

### Delegation

Answers:

> why may actor A exercise some authority originally held by H/O, and how narrowly?

This requires durable grant/task semantics and provenance.

### Request-time authorization

Answers:

> may this actor, under these grants and this current context, invoke Action X on Resource R?

Cedar/OpenFGA/AuthZEN are relevant here in different roles.

### Business governance

Answers:

> does the business operation also require approval, four-eyes, waiver, control evidence, limit review, etc.?

Wave A #67 showed these are business objects/processes, not reducible to one PDP boolean.

## Delegation grant

A useful delegation/task grant needs enough semantics to prevent `agent has user's role` from becoming unlimited authority:

```text
Grant {
  grantId
  grantor / authority source
  grantee actor
  parentGrant? / delegation chain
  allowed semantic actions/capabilities
  resource/object/set scope
  purpose/task/session scope
  contextual limits          // amount, quantity, geography, channel, risk...
  validFrom / expiresAt
  maxDelegationDepth?
  maySubdelegate?
  call/usage budget?         // when relevant
  revocation/fencing state
  issuance policy/revision/evidence
}
```

The exact representation may be ordinary ontology objects/links rather than a metamodel primitive.

## Delegation is monotonic narrowing by default

A subgrant should not create authority its parent did not have or delegate:

```text
parent allows {A,B,C} on set S until T, amount <= 50k
child may allow {B} on subset S2 until T2<=T, amount <= 20k
child may not create D, a broader set, later expiry, or 100k limit
```

Some organizations may issue an independent grant from another authority source; that is a new authority path, not an expansion of the parent grant.

## Current versus vested authority

#40 and #41 prevent a universal rule `reauthorize everything at every later step`.

Different conditions can have different temporal contracts:

```text
approval evidence                 historical/pinned
agent task grant at local commit  usually current according to grant contract
emergency tenant freeze           current/non-waivable
commercial quote                  possibly frozen
EffectRequest execution right     may vest at local commit OR require current attempt-time authority
credential/SPIFFE identity        current for the workload attempting execution
```

The operation/effect contract must declare which authority is vested and which remains current.

A local Action that committed a payment EffectRequest can legitimately authorize a later executor to send it even after the initiating chat session ends **if** authority vested at commit. A separate emergency kill switch may still block execution if defined as current/non-waivable.

## Revocation needs a race contract

`grant revoked` is not enough. We must define what happens when revocation races commit/effect execution.

Potential mechanisms:

```text
same-store grant revision checked inside #40 commit
short-lived capability/token with expiry
lease/fencing revision
linearizable PDP/grant store decision
versioned authorization decision with bounded staleness
emergency deny checked at a stronger current boundary
```

The semantic requirement is:

> the commit/effect attempt must satisfy the operation's declared authority basis.

It is not:

> every DB transaction magically performs an atomic distributed read of every IAM system.

## Separation of duties is not independent per-action allow

A user/agent can individually be allowed to:

```text
CreatePaymentProposal
ApprovePayment
```

while policy forbids the **same relevant actor/authority chain** from doing both for one payment.

Therefore SoD needs history/context/relationship semantics such as:

```text
forbid ApprovePayment(P)
when actor/grant-chain participated in creating P
unless an explicitly governed exception applies
```

It cannot be inferred from two independent `allowed(action)` checks.

## One-engine-first evaluation

This research follows the explicit constraint: **do not assume Cedar + OpenFGA together**.

Candidate strategies:

### A — Cedar as the single PDP; OS supplies entity/grant graph

Cedar is strong at:

- Principal / Action / Resource / Context requests;
- entity hierarchies and attributes;
- conditional policy;
- explicit permit/forbid semantics;
- default deny and forbid-overrides-permit behavior;
- schema validation and policy explanation/tooling ecosystem.

OS would remain system of record for business actors/grants/relationships and supply the relevant entity slice/context to Cedar.

**Main question:** can large/dynamic relationship/delegation traversal remain operationally manageable without turning Cedar input assembly into a hidden authorization engine?

### B — OpenFGA as the single authorization relation store/evaluator

OpenFGA is strong at:

- persistent relationship tuples;
- usersets and graph-like relationship traversal;
- RBAC/ReBAC modeling;
- contextual tuples for request-local relationships;
- conditions for context-dependent tuple applicability;
- explicit model versions/authorization models.

**Main question:** can numeric/risk/purpose/current-context policy, explicit emergency deny semantics, delegation limits and complex SoD remain clear and explainable without building a second policy interpreter around FGA?

### C — OS-native authorization semantics + one replaceable evaluator backend

OS owns grant/policy semantics and compiles/evaluates them through one backend where possible.

**Benefit:** preserves the semantic contract if backend changes.  
**Risk:** accidentally building a new policy language/engine before evidence requires it.

### D — complementary evaluators

Example: OpenFGA relationship graph + Cedar contextual/deny policy.

**Benefit:** each does what it is strong at.  
**Risk:** two decision systems, conflicting semantics, duplicated policy, more difficult explanation and atomic revisioning.

**Rule:** D loses by default unless A/B/C fail concrete scenarios in ways that cannot be fixed with ordinary data-model composition.

## AuthZEN and SPIFFE have narrower jobs

### AuthZEN

Current OpenID AuthZEN Authorization API 1.0 standardizes the PEP↔PDP API boundary around authorization requests/decisions. It can be valuable as a wire/interoperability contract.

It does not by itself define OS business delegation, grant storage, SoD, policy language, or the ontology.

### SPIFFE/SPIRE

SPIFFE gives cryptographic workload identity (SPIFFE ID + SVID) and trust-domain semantics.

It answers `which workload is calling?`, not `which business actor is this workload acting for and what task authority was delegated?`.

## Current reduction result

No evidence yet requires `Principal`, `Grant`, `Delegation`, or `Role` as root metamodel sorts.

Strongest current hypothesis:

- Person/Organization/Agent/Service are ordinary typed actors/entities;
- workload identity is runtime/security identity linked to the semantic actor where appropriate;
- delegation/task grants are durable typed relationship/relator-like business/security records;
- Action + Resource + Context authorization is a generic engine/runtime capability;
- policy evaluation can be backed by a mature evaluator if it passes the semantic suite;
- approval/GRC remains separate business/governance semantics.

## Files

| File | Purpose |
| --- | --- |
| `source-study.md` | current primary-source study of Cedar, OpenFGA, AuthZEN, SPIFFE plus Wave A/#40/#41 |
| `authorization-contract.md` | actor/workload/grant/authorization/SoD/revocation semantics |
| `candidate-laws.md` | falsifiable laws |
| `adversarial-cases.md` | agent, subagent, revocation, SoD and cross-tenant scenarios |
| `reference_model.py` | executable minimal delegation/authorization semantics model |
| `test_reference_model.py` | litmus tests; not production auth engine |
| `open-questions.md` | handoff to #39/#43/#47/#49/#53/#70 |

## What this research refuses

```text
authenticated workload = authorized business actor
agent = user's full permissions
on-behalf-of = impersonation with no scope
role membership = unlimited delegation
approval = authorization policy boolean
request-time allow = historical business approval
one `principal_id` explains human + agent + workload + represented party
subagent can expand parent grant
revoked task grant may be ignored because agent started earlier
same actor may create and approve whenever each action is independently allowed
SPIFFE ID = business identity
AuthZEN API = authorization semantics
Cedar + OpenFGA must both be used
relationship graph alone = complete contextual policy
policy evaluator alone = durable delegation/business-governance model
```
