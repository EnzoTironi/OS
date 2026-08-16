# Open questions and downstream handoff

**Issue:** #41  
**Status:** unresolved unless explicitly answered.

# Questions #41 can answer now

## Q-EFF-01 — does local Action commit imply remote business success?

**Answer:** no.

Local commit can create a durable EffectRequest. Remote attempt/outcome is a separate causal stage unless a stronger coordinated transaction protocol proves atomicity.

## Q-EFF-02 — is HTTP timeout evidence of remote failure?

**Answer:** no generally.

Timeout can happen after send/remote commit. Recovery depends on typed attempt evidence, remote idempotency and authoritative read-back.

## Q-EFF-03 — is an async acceptance response terminal success?

**Answer:** no.

It can establish `request accepted/pending` while final business outcome remains unresolved.

## Q-EFF-04 — can webhook deliveries be treated as business events one-for-one?

**Answer:** no.

Duplicate and out-of-order delivery are normal in mature webhook systems. Webhook is source evidence; correlation/authority determines the business statement it supports.

## Q-EFF-05 — does outbox solve remote exactly-once?

**Answer:** no.

It solves local causal durability between committed state and publication intent. Remote executor/outcome still needs its own identity/idempotency/reconciliation contract.

## Q-EFF-06 — does Temporal make external side effects exactly once?

**Answer:** no.

Write-side Activities can execute at least once/retry; external operation must be idempotent/reconcilable.

## Q-EFF-07 — is compensation the same as rollback?

**Answer:** no after the effect happened.

Compensation/reversal is a new governed operation with its own external effect/outcome.

# Open metamodel/runtime questions

## Q-EFF-10 — is `Effect`/`EffectType` a metamodel primitive?

Current answer: `undetermined`; not earned.

The semantic distinctions currently compose from ordinary typed request/attempt/observation/outcome records plus a generic privileged effect execution capability. #47/#70 should attack whether native effect semantics are required for enforcement/tooling.

## Q-EFF-11 — is `OutcomeIndeterminate` a universal status value?

No. It is a generic epistemic family/condition. Exact evidence/recovery guarantees differ by protocol. A provider may expose pending/processing; another may offer no status; another may prove rejection.

The generic runtime needs to preserve uncertainty, not force one status enum into every domain object.

## Q-EFF-12 — should remote outcome states live in connector metadata or business ontology?

Working hypothesis:

- protocol mechanics/transport acknowledgements belong to connector/capability contract;
- business meaning such as payment succeeded, fiscal authorized, listing active belongs to domain/source ontology;
- mapping from protocol response/observation to that meaning is versioned adapter/domain knowledge.

Need #63/#64/#70 synthesis.

## Q-EFF-13 — when can a definitive rejection reuse the same EffectRequest?

Protocol-specific.

A transient rate-limit or retryable provider error can be another Attempt under same effect. A payload/intent correction can require new/revised EffectRequest/reproposal. Generic runtime should not infer this solely from HTTP status.

## Q-EFF-14 — how should partial remote outcomes be represented?

Ordinary typed item/result records may suffice. A generic `Partial` flag can lose which sub-effects occurred. #70 should test whether partial outcome is just a composition of confirmed item outcomes plus unresolved/rejected remainder.

## Q-EFF-15 — how long must attempt/outcome evidence be retained?

Depends on operation risk, remote dedupe window, audit/legal requirements, privacy and reconciliation horizon. No universal forever-retention law.

# Handoff to #42 — authorization/delegation

External effects add authority questions beyond local Action approval:

1. Which principal/delegation authorizes **creating** EffectRequest?
2. Which workload/service identity may execute the target capability?
3. Are remote credentials scoped to the local actor, tenant, task or shared connector service?
4. If initiating actor's grant is revoked after local Action committed but before executor sends E, does E remain authorized? This must be explicit per operation; local commit may itself have vested authority to execute later.
5. Which current/non-waivable policies must be rechecked at effect-attempt time (sanctions, environment, secrets, remote account status)?
6. Can an agent cancel/retry/compensate an effect it did not initiate?
7. How are credential rotation/revocation races fenced?
8. Can a historical committed EffectRequest be blocked by a later emergency kill switch, and how is that represented?

Important: do not automatically re-use #40's current-at-commit authorization as `current-at-effect-attempt`. The effect contract must say which authority vested at commit and which controls remain current.

# Handoff to #43 — durable execution/orchestration

Temporal-like orchestration can schedule/retry/reconcile EffectRequests, but:

```text
Workflow/Activity retry identity
!=
EffectRequest identity
!=
remote operation identity
!=
Attempt identity
```

#43 must ensure workflow replay does not re-execute already confirmed effects and that write-side Activities use stable effect/remote IDs.

Required scenarios:

- workflow worker crashes after remote send;
- workflow retries Activity while effect outcome indeterminate;
- timer wakes after provider idempotency window expired;
- webhook/signal confirms outcome while retry timer is queued;
- cancellation races Activity send;
- workflow version upgrade while effect pending.

# Handoff to #47 — safe effect execution

Strong pressure:

- pure Functions should not have arbitrary network/secrets access;
- effect executor needs typed capability allowlist, credential scope, environment, egress policy, rate limits, payload size/classification, timeout semantics and protocol revision;
- historical replay/test branches must not hit production remotes by accident;
- connector code should not be able to mutate local authoritative state outside #40 commit contract as a side channel.

Test whether a native **runtime effect capability system** is required even if `Effect` is not a semantic ontology primitive.

# Handoff to #39 — storage

Persistence must support:

```text
EffectRequest identity + parent local operation
remote operation/idempotency key mapping
attempt history
request/response digests/evidence as retained
pending/indeterminate knowledge
observation correlations
reconciliation evidence
compensation causal links
executor leases/fencing if implementation uses them
```

Do not infer universal event sourcing. Current projections may be materialized, while enough causal evidence remains durable.

# Handoff to #46 — verification/fuzzing

High-value generated properties:

1. **Attempt monotonicity:** a later definitely-not-sent attempt cannot erase an earlier sent/no-response uncertainty.
2. **Duplicate observation invariance:** redelivery of the same provider event cannot create a second effect/outcome transition.
3. **Out-of-order safety:** receive order alone cannot regress confirmed provider state where protocol sequence/read-back proves newer evidence.
4. **Retry identity preservation:** retry of same effect under idempotent protocol retains EffectRequest + remote operation identity.
5. **Idempotency expiry safety:** when remote dedupe guarantee expires, generic retry is no longer automatically safe.
6. **Local-unknown isolation:** retrying a locally indeterminate Action cannot create E2 if original O/E actually committed.
7. **Compensation causality:** compensating effect never deletes/rewrites original confirmed effect.
8. **Environment safety:** historical replay/test cannot invoke production capability.
9. **Correlation assurance:** fuzzy observation/effect correlation cannot auto-confirm high-risk outcome.
10. **Claim precision:** confirmation cannot assert a stronger domain outcome than source evidence supports.

# Handoff to #49 — observability

Required causal graph:

```text
LocalOperation O
  committed under CommitWitness W
  -> EffectRequest E
       -> Attempt A1 sent/no-response
       -> Attempt A2 same remote key
       -> remote receipt R
       -> Observation W1 webhook
       -> Observation W2 read-back
       -> Reconciliation C confirms outcome
       -> CompensationOperation O2? -> EffectRequest E2?
```

Operators/agents must answer:

- Was the effect ever attempted?
- Which attempt may have changed remote state?
- Which idempotency/remote key was used?
- Why did executor retry or refuse to retry?
- What evidence currently confirms/pends/contradicts outcome?
- Is a missing webhook meaningful?
- Did remote user manually change state later?
- Which effect is awaiting reconciliation and for how long?
- Has compensation been requested/confirmed?

# Handoff to #63/#64 — composition and connector definitions

Effect capability definitions need reusable/versioned distribution without leaking remote product names into engine core.

Likely separation:

```text
business/domain ontology
connector capability contract
source/effect adapter implementation
credentials/environment configuration
```

# Handoff to #70 — primitive reduction

Compare at least:

### M-E1 native Effect primitive

Engine knows Effect definitions/request/attempt/outcome lifecycle.

### M-E2 ordinary typed operational records + native runtime effect capability

Business/domain ontology models request/outcome records compositionally; runtime owns safe external-I/O execution facilities.

### M-E3 generic message/event workflow only

Everything represented as messages/events + orchestration.

Attack M-E3 on security capability, idempotency identity, authority and message-vs-outcome confusion. Attack M-E2 on convention drift/enforcement. Promote native Effect only if those failures cannot be solved by smaller interfaces/contracts.

Current strongest hypothesis: **M-E2**, still unselected.
