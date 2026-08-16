# Open questions and downstream handoff

**Issue:** #42  
**Status:** unresolved unless explicitly answered.

# Questions #42 can answer now

## Q-AUTH-01 — is workload identity sufficient business authorization?

**Answer:** no.

Workload authentication is evidence about the executing software identity. Actor, represented principal, grant/task authority and Action/resource/context remain separate.

## Q-AUTH-02 — should an agent inherit the user's complete permissions?

**Answer:** no as a default.

Delegation should be explicitly scoped and normally narrower than the authority source. Independent broader grants are separate authority paths.

## Q-AUTH-03 — is `on behalf of` equivalent to impersonation?

**Answer:** no.

Audit/security should preserve actor + represented principal + grant chain + workload rather than replacing the actor identity with the represented user.

## Q-AUTH-04 — is business Approval the same thing as PDP `permit`?

**Answer:** no.

Approval is durable governance/decision evidence; request-time authorization is a current operation gate. They can depend on each other but do not collapse.

## Q-AUTH-05 — can SoD be implemented as independent per-action RBAC?

**Answer:** not generally.

SoD can depend on who participated in another Action on the same case and what counts as independent effective authority.

## Q-AUTH-06 — does revocation have one universal timing rule?

**Answer:** no.

Some authority is current at commit/attempt; some can vest; short-lived capabilities can explicitly tolerate bounded revocation lag; emergency controls can demand stronger currentness.

# Open backend questions

## Q-AUTH-10 — can Cedar be the only PDP without hidden relationship-policy logic in entity assembly?

Needs experiment/benchmark.

Test:

- nested organization/resource graph;
- dynamic task grants/subgrants;
- current/historical relationship revisions;
- SoD participation data;
- entity-slice size/latency/caching;
- deterministic construction from OS semantic state;
- emergency deny and numeric/purpose limits.

If data preparation only retrieves/project authoritative semantic facts, Cedar remains the PDP. If application code decides which relationships/constraints count as allow/deny before Cedar, there is a hidden second evaluator.

## Q-AUTH-11 — can OpenFGA be the only evaluator without hidden contextual-policy logic?

Needs experiment/benchmark.

Test:

- emergency deny/exception precedence;
- amount/risk/purpose constraints;
- live vs frozen object-set grants;
- parent/child delegation limits;
- SoD based on case participation;
- transactional call budgets;
- policy/model explanations.

If app code computes the hard decision and passes a conveniently filtered tuple set/context, OpenFGA is not really the only PDP.

## Q-AUTH-12 — do we need multiple evaluators?

Current answer: `undetermined`, with a presumption against it.

A Cedar+OpenFGA architecture must define:

```text
which PDP is authoritative for which predicate
allow/deny combination
what happens on disagreement/error
revision compatibility/atomic rollout
one explanation graph
cache/currentness semantics
```

Only concrete scenario failures justify this complexity.

## Q-AUTH-13 — should AuthZEN be the internal evaluator interface?

Potentially useful for replaceability/interoperability, but first confirm the request/response can carry the OS actor/represented/workload/grant/revision context without semantic loss. Adapter metadata can extend the wire contract if needed; do not distort the business model to fit it.

## Q-AUTH-14 — is Grant/Delegation a metamodel primitive?

Current answer: not earned.

A durable typed relationship/relator-like object can currently represent grant identity/lifecycle/provenance. Native engine support may be justified for mandatory enforcement/capability tokens, but that is separate from semantic sort status.

## Q-AUTH-15 — is Role a primitive?

Still unresolved from Wave A. Authorization evidence strengthens `role as relation/context-dependent capability`, but does not prove a native Role sort. A Person can simultaneously hold many organization/resource relationships.

# Handoff to #39 — storage

Storage/runtime must support whichever authority model wins:

```text
actor/workload bindings
grant identity + parent chain + revisions
role/relationship state
policy/model revision
revocation/fencing/currentness evidence
SoD participation history
transactional hard usage budgets where required
authorization decision/audit evidence
```

If OpenFGA is chosen as the persistent authorization relation store, #39 must still define the source-of-truth relationship between FGA tuples and operational ontology. Avoid rival writable authority.

If Cedar is chosen, #39/query layer must provide deterministic efficient entity/grant projection for PDP requests.

# Handoff to #40 — commit integration refinement

#40's `current authorization` must become an explicit authority basis, e.g.:

```text
GrantRevision(G, rev)
CapabilityToken(token, expiry/audience/revision)
CurrentEmergencyPolicy(rev)
AuthorizationDecision(D, policyModelRev, boundedStaleness)
```

The exact mechanism must be atomically/fail-safely related to commit according to the claimed revocation guarantee.

# Handoff to #41 — effect execution refinement

EffectRequest must state whether execution authority:

```text
vested at local commit
requires current grant at each attempt
requires only current emergency/environment/credential controls
requires both vested business authority + current non-waivable restrictions
```

Do not treat expired initiating session as automatic effect cancellation.

# Handoff to #43 — durable agents/workflows

Long-running workflow should persist authority references, not rely on in-memory user session permissions.

Required tests:

- task grant expires while workflow waits;
- grant revoked while Activity queued;
- authority vested at local commit but workload changes;
- subagent spawned after parent grant narrows;
- workflow version change and policy revision change;
- emergency kill switch while pending effect exists.

# Handoff to #47 — safe execution

Workload/effect execution needs:

```text
cryptographic workload identity
actor/workload binding
capability/effect allowlist
secret access scoped to connector/tenant/environment
production-vs-test fencing
policy/grant context injected by trusted runtime, not model/user text
```

Agent-generated code must not mint grants, override actor identity, or fabricate contextual tuples/entity data.

# Handoff to #49 — observability

For one high-risk Action, explain:

```text
workload W authenticated as runtime workload
W bound to Agent A in tenant T
A represented Human H under Grant G2 -> parent G1
Action X/Resource R/Context C
PDP backend/model/policy revision M
allow/deny evidence
SoD participation evidence
approval A1 (if business governance requires)
#40 commit authority basis
#41 later effect-attempt authority basis
```

A boolean `allowed=true` without these identities is insufficient for forensic explanation.

# Handoff to #53 — agent operating model

Agent context/tool discovery should be filtered by current task/grant, but tool visibility is not final authority.

Every tool invocation must reauthorize at the semantic operation boundary. Agent memory/model context must not become authorization state.

Subagent orchestration must explicitly derive/narrow grant scope rather than pass the parent credential wholesale.

# Handoff to #63 — composition

Authorization/grant concepts may live in reusable security/governance modules/interfaces without being generic kernel business types. Tenant/industry modules can add domain controls such as payment SoD or Brazil fiscal signer rules while reusing generic authority facilities.

# Handoff to #70 — primitive/backend synthesis

Compare:

### M-AUTH1 — native Principal/Grant/Role semantics
### M-AUTH2 — ordinary actors/grants/relations + generic authorize boundary + one PDP backend
### M-AUTH3 — backend model is the authorization ontology
### M-AUTH4 — multiple PDPs

Current strongest semantic hypothesis is **M-AUTH2**. Backend winner remains open between Cedar/OpenFGA until executable scenarios prove whether one can carry the full contract without hidden decision logic.