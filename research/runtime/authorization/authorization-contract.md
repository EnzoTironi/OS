# Candidate authorization and delegation contract

**Issue:** #42  
**Status:** Wave B hypothesis.  
**Goal:** define the authority semantics any evaluator/runtime must preserve before selecting a policy stack.

The vocabulary below names jobs. It does not declare metamodel primitives.

# 1. Keep identity dimensions orthogonal

A request can involve all of these simultaneously:

```text
Actor                // semantic entity taking/owning the action: person, agent, service
RepresentedPrincipal // human/org/party whose delegated authority is exercised
Workload              // authenticated software process/service instance
Grant                 // authority path from grantor to actor
Approver              // actor whose business approval evidence is required
Resource              // semantic target(s)
Action                // named business/runtime capability
Context               // purpose, amount, state, time, tenant, risk, channel...
```

A one-field `principal_id` representation may be a convenient PDP wire format, but it cannot erase these meanings from the audit/operation contract.

# 2. Actor and workload binding

Before request-time business authorization, the runtime must establish:

> which authenticated workload is allowed to present requests as semantic actor A?

This can be represented conceptually as a workload binding/capability:

```text
Workload W
  may execute as Agent/Service A
  in tenant T
  for runtime environment E
  until expiry/revocation
```

A SPIFFE ID/SVID is strong evidence for W's workload identity. The binding from W to A is OS/application security semantics.

## 2.1 No transitive impersonation by default

If W may execute as Agent A and A acts on behalf of H under Grant G, it does not follow that W may freely impersonate H in every system.

Downstream audit should preserve:

```text
workload=W
actor=A
represented=H
grant=G
```

instead of collapsing to `principal=H` and losing the agent/workload provenance.

# 3. Delegation grant semantics

A delegation says:

> grantor/source of authority permits grantee to exercise a bounded subset of authority under stated conditions.

Conceptually:

```text
Grant {
  id
  grantor
  grantee
  representedPrincipal?   // often grantor, but not always
  parentGrant?
  actions/capabilities
  resourceScope
  purpose/taskScope
  contextualLimits
  validFrom
  expiresAt
  usage/callBudget?
  maySubdelegate
  maxDelegationDepth?
  revocationRevision/state
  issuanceAuthority/policyRevision
}
```

## 3.1 Scope is semantic, not only route-level

Examples:

```text
Purchase.Order.create only for supplier candidates in RFQ-7
Payment.Propose up to BRL 50_000
Inventory.Reserve only warehouse MG
Marketplace.Reprice only own listings in campaign C
CustomerCase.Resolve only cases assigned to queue Q
```

`POST /actions/*` permission is not an adequate grant.

## 3.2 Subdelegation is bounded by parent authority

A child grant is valid only if it is a permitted narrowing of the authority actually delegable by its parent/source.

Candidate monotonicity constraints:

```text
child.actions      ⊆ parent.delegableActions
child.resources    ⊆ parent.resourceScope
child.purpose      compatible/narrower
child.time         within parent validity
child.amountLimit  <= parent limit
child.depth        <= remaining delegation depth
child.grantee      permitted delegate class
```

Some constraints are not set inclusion and require domain predicates.

A second independent authority source can issue a broader grant; that is a different chain, not child escalation.

# 4. Representation / on-behalf-of

`on behalf of` is not generic impersonation.

A request acting for represented principal H/O should preserve:

```text
actor A
represented H/O
grant path G1..Gn
action/resource/context
```

The authorization model must be able to express:

- A may act for H only for task P;
- A may read H's order but not approve/refund it;
- A may propose a payment but approval must come from another principal;
- subagent B may receive only a subset of A's grant;
- H/O can revoke future exercise according to the grant's revocation contract.

# 5. Request-time authorization

A generic authorization evaluation answers a scoped question:

```text
may(actor=A,
    represented=H?,
    workload=W,
    action=X,
    resource=R,
    context=C,
    grantChain=G*) ?
```

The evaluator should return at least a decision and enough evidence/identifiers to explain which policy/model/grant revision produced it.

Exact PEP↔PDP wire shape can use AuthZEN or another adapter. The semantic request is richer than any one transport object if needed.

# 6. Policy composition

A useful authorization contract distinguishes several families:

## 6.1 Positive grants/entitlements

Examples:

```text
manager of unit U may approve PurchaseRequest in U
owner/member may read resource
agent with task grant G may invoke X
```

## 6.2 Negative/non-waivable restrictions

Examples:

```text
forbid suspended supplier payments
forbid cross-tenant access
forbid production effect from test workload
forbid self-approval for high-risk payment
emergency freeze tenant/account
```

Whether the backend uses native forbid, exclusions, conditions, or compiled allow-only logic is an implementation choice. The OS semantic contract must make deny/exception precedence explicit.

## 6.3 Contextual constraints

Examples:

```text
amount <= grant.maxAmount
now < grant.expiry
purpose == "rfq-negotiation"
resource.company == represented.company
riskScore < threshold
```

## 6.4 Historical-participation constraints

Examples:

```text
actor who proposed payment P cannot be its required independent approver
same grant chain cannot fill both incompatible roles
```

These require durable participation/provenance input, not only static role membership.

# 7. Separation of duties

SoD is a relation between powers/actions/participants in a scoped business case.

A simple four-eyes invariant might be:

```text
Proposer(P) != RequiredIndependentApprover(P)
```

A stronger form can account for representation/delegation:

```text
no actor in approval authority chain may be the same effective authority
that produced the proposal, unless an explicit exception/waiver rule allows it
```

This requires deciding what counts as `same effective authority`:

- same Person?
- same Agent?
- same represented human/org?
- same parent grant?
- same organizational reporting chain?

That is domain/GRC semantics, not generic identity equality.

# 8. Approval versus authorization

Approval is business evidence that a bounded decision was reviewed/authorized by a required actor under a governance rule.

Request-time authorization asks whether the current invocation may proceed.

They can interact:

```text
approval A historically valid under governance rule v1
AND
current executor/grant still authorized under current-at-commit policy
```

But neither reduces to the other.

A PDP `permit` response is not automatically a durable business Approval object.

# 9. Revocation and temporal authority basis

A grant needs a defined revocation contract.

## 9.1 Future-use revocation

Typical task grant:

```text
revocation prevents future Action commits using grant G
```

A #40 commit should establish that the grant satisfies its required currentness/revision basis.

## 9.2 Vested authority after local commit

A committed operation may vest authority for later execution:

```text
Payment Action commits EffectRequest E while grant G is valid
chat/session grant expires
executor later sends E under the vested EffectRequest authority
```

This is legitimate only if the effect contract says authority vests at commit.

## 9.3 Attempt-time current authority

Other effects require current authority at every attempt:

```text
production environment emergency kill switch
credential scope/account active
sanctions/freeze policy
```

The effect runtime must check those conditions according to #41.

## 9.4 Revocation race

If revocation R and commit C race, the system needs a defined ordering/fencing rule:

```text
same-store revision/CAS
linearizable grant service
lease/capability version
short-lived token with bound grant revision
```

If the mechanism cannot establish ordering, do not claim stronger revocation semantics than it actually provides.

# 10. Capability/delegation token

A token can carry a compact proof/reference of delegated authority, but it does not replace the durable semantic grant.

A robust token/reference might bind:

```text
actor / represented principal
grant id/revision
action/resource/purpose scope
expiry/audience/tenant
workload/client binding when appropriate
```

Short-lived signed tokens can reduce authorization-store reads while bounding revocation lag. The allowed lag is a business/security policy, not an implementation accident.

# 11. Agent and subagent model

## 11.1 Agent is first-class actor for attribution

An agent can own a proposal/action invocation and be separately audited from the human who delegated authority.

## 11.2 Agent is not a copy of the human's permissions

The human's authority can be narrowed by task, amount, resource, time, purpose, call budget and downstream approval requirements.

## 11.3 Subagent requires explicit delegation

Agent A spawning/using B does not automatically transfer G.

A valid child grant/reference must prove B's narrower authority. Hidden framework-level tool calls must not bypass this.

## 11.4 Agent cannot self-expand grant

Agent may propose/request additional authority, but the authority source/governance operation must approve/issue it.

# 12. Service and automation actors

A scheduled automation/service may act under:

- organization-owned service authority;
- a durable service grant;
- a delegated user task;
- a committed EffectRequest authority;
- a system maintenance capability.

Do not force every nonhuman operation to impersonate a Person.

# 13. Authorization decision evidence

For governed/high-risk operations, the #40 commit witness should be able to identify:

```text
authorization decision id/digest?
policy/model revision
grant ids/revisions
actor / represented principal / workload
critical request context
currentness/fencing evidence
explicit deny/exception result where relevant
```

This does not require storing the entire policy database snapshot forever. Retention/explainability requirements determine the evidence granularity.

# 14. One-engine-first backend contract

A backend is acceptable only if it can implement the semantic suite without a hidden second PDP.

## 14.1 Cedar-only candidate

OS supplies:

```text
principal/actor entity
grant/relationship entity slice
resource/action/context
```

Cedar evaluates permit/forbid.

**Pass condition:** entity-data assembly is a deterministic semantic projection from OS grant/ontology state, not an ad hoc authorization algorithm performing its own policy decisions.

## 14.2 OpenFGA-only candidate

OS persists/lower grants/relationships to tuples/model, supplies request context/conditional data, and uses Check.

**Pass condition:** required contextual/deny/SoD/delegation scenarios remain explicit in the authorization model/conditions without an application-side policy engine deciding the hard parts before Check.

## 14.3 Backend-independent semantic layer

OS can own a minimal evaluator-neutral representation of:

```text
actor/workload binding
grant/delegation
Action/resource/context requirement
negative/non-waivable restrictions
SoD predicates
revision/currentness contract
```

But it should **not** become a new general-purpose policy DSL unless Cedar/OpenFGA both fail required semantics.

# 15. Authorization result categories

Do not overfit to one backend's output vocabulary. A useful semantic result can distinguish at least:

```text
Allowed
Denied(reason/evidence)
Indeterminate(error/missing-authority-data)   // fail closed for enforcement
NeedsAdditionalApproval / governance step     // business workflow result, not PDP allow
```

`Indeterminate` must never silently become allow. It is operational uncertainty/error in authorization evaluation, not a business-domain state.

# 16. Cross-tenant and environment isolation

Certain invariants deserve generic fail-closed enforcement:

```text
request tenant == resource tenant unless explicit cross-tenant capability
production effect capability unavailable to test/sandbox workloads by default
workload identity audience/trust domain matches expected runtime
```

The specific business Party/Company models remain domain ontology; the engine owns isolation/enforcement facilities.

# 17. Minimal runtime capabilities implied

If this contract survives, runtime needs:

1. authenticated workload identity;
2. actor/workload binding;
3. represented-principal/on-behalf-of attribution;
4. durable scoped grant/delegation records;
5. monotonic subdelegation validation;
6. request-time Action/resource/context authorization;
7. policy/grant model revision identity;
8. explicit negative/non-waivable restriction semantics;
9. revocation/currentness/fencing contract;
10. SoD/historical participation inputs;
11. fail-closed evaluator errors;
12. authorization evidence linked to #40 commit/#41 effect attempt;
13. tenant/environment isolation;
14. no raw mutation/effect path that bypasses required authorization.

# 18. Primitive reduction competitors

## M-AUTH1 — native Principal/Grant/Role primitives

Engine has fixed authorization ontology.

**Benefit:** uniform enforcement.  
**Risk:** business roles/delegation concepts get frozen into security substrate.

## M-AUTH2 — ordinary actor/grant/relationship ontology + native generic authorization boundary

Business/security ontology models actors/grants/roles/relationships; engine has generic `authorize(Action, Resource, Context, Actor...)` enforcement and one backend/evaluator adapter.

**Benefit:** semantic flexibility + hard enforcement boundary.  
**Risk:** evaluator lowering/entity assembly can become convention-heavy or a hidden PDP.

## M-AUTH3 — backend model *is* authorization semantics

Cedar/OpenFGA definitions directly become the only authority model.

**Benefit:** less custom semantic layer.  
**Risk:** backend-specific limitations/artifacts leak into enterprise ontology and make replacement/historical explanation harder.

## M-AUTH4 — multiple evaluators composed

Relationship engine + policy engine.

**Benefit:** strong specialized features.  
**Risk:** decision-combination semantics, revision synchronization and explanation become a new correctness problem.

### Current verdict

`M-AUTH2` is the strongest working hypothesis, with **one evaluator backend preferred**. It is not selected until the scenarios prove whether Cedar-only or OpenFGA-only can satisfy it without hidden policy logic.