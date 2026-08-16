# RuleBinding reduction kill test — post-R5

**Issue:** #156  
**Consumes:** #8, #40, #41, #42, #46, #56, #70  
**Status:** hypothesis under attack  
**Architecture decision:** none

## Question

Can RFC-0002's `RuleBinding` disappear as a base executable form without rebuilding a binding dispatcher under another name?

R5 is:

```text
Type
Relation
Computation
Action
RuleBinding
```

This folder attacks only the fifth form. A lower form count is not success if another form or runtime subsystem silently acquires the same scheduling/locus/basis/error/obligation protocol.

## Anti-cheat criterion

A model does **not** reduce RuleBinding if runtime still performs the equivalent of:

```text
find rules attached to target + locus
choose current/pinned basis
evaluate them
combine outcomes
map false/error to enforcement
record determining evidence
```

regardless of whether the stored record is called `Binding`, `Relation`, `Annotation`, `Decorator`, `Hook`, or `Constraint`.

A real reduction must make at least one of those jobs disappear by deriving it from a generic mechanism already required for an independent reason.

## Competitors

### M0 — R5 explicit RuleBinding

Control. A binding registry is queried by locus/scope, evaluators run, outcomes are enforced.

### M1 — definition graph + binding dispatcher

Bindings become ordinary Types/Relations but runtime still traverses them by phase/target.

**Verdict:** hidden recreation.

### M2 — inline Action/Type contracts

Actions and Types list local evaluators.

**Verdict:** insufficient. The executable sensitivity model blocks an illegal Action while an independent admin path bypasses the invariant.

### M3 — generic executable Relation triggers

Relation gains trigger/phase/evaluator semantics.

**Verdict:** hidden recreation or primitive overloading. Runtime still needs trigger dispatch.

### M4-v2 — proof-carrying refined Types + privileged operation signatures

This is the strongest candidate.

The first M4 shape called these **proof-carrying capability types**. That formulation was deliberately rejected as potentially replacing one primitive with another. The current candidate has no `CapabilityType` semantic class.

Instead, one generic Type mechanism validates both ordinary business values and authority proofs:

```text
Type PositiveAmount
  contract: value
  refinement: Positive

Type CommitPermit<Purchase>
  contract: capability
  refinement: AuthorizePurchaseCommit

Type PostStateValid<Ledger>
  contract: capability
  refinement: BalancedPendingState
```

All use the same:

```text
TypeDef + refinements + construct()
```

Privileged operations declare the exact proof Types they require in ordinary typed signatures:

```text
preview:Purchase    requires PreviewPermit
commit:Purchase     requires CommitPermit + PostStateValid
admin:ledger        requires AdminPermit + PostStateValid
read:Journal        requires ReadPermit
effect-attempt      requires EffectAttemptPermit
update:Occurrence   requires UpdatePermitOccurrence
```

There is **no locus field** and no scope/locus rule lookup in the M4 candidate.

## Why the runtime capability boundary has an independent reason to exist

Even with zero business Constraints, Policies or Invariants, ordinary Computations must not gain ambient authority to:

- mutate accepted state;
- use credentials;
- dispatch external effects;
- cross tenant/environment authority boundaries.

That independent runtime reason matters. R6 tries to reuse an already-required authority boundary rather than invent a scheduler solely to replace RuleBinding.

The malicious-refinement sensitivity test mutates authoritative state from a Computation; the engine restores state and refuses to mint the value.

## M4-v1 was falsified after a green run

The first generic-Type candidate bound proofs to:

```text
type
target
semantic operation
current revision or pinned basis
```

That was not enough.

A proof that validated balanced state `S1` could be reused for a different state `S2` in the same revision. Likewise authorization for one parameter set could be reused for changed Action inputs. This is a context-substitution / TOCTOU failure.

The green run is intentionally retained in the evidence history as proof that revision freshness alone does not make an authority proof safe.

## M4-v2 hardening — exact validated context

The current candidate binds every operational proof to the exact semantic context it validated:

```text
target
semantic operation identity
inputs
pending / proposed state
pinned basis
payload where relevant
```

The runtime also seals the issued proof over its Type, context digest, state basis, determining evidence and evaluator revisions.

The concrete model uses HMAC-SHA256 only to make forgery testable. The semantic law is simpler:

> an untrusted caller must not be able to mint, retarget or rewrite an authority proof outside the trusted runtime boundary.

Permanent regressions now distinguish:

```text
changed validated context -> ContextMismatch
same context + tampered sealed proof -> ForgedProof
```

The hardening did not reintroduce RuleBinding, `locus`, scope lookup or `CapabilityType`.

## Required semantic pressure

Every serious model must preserve:

1. global accounting invariant across every authoritative mutation path;
2. authorization with `Permit | Deny | Error` and determining evidence;
3. current vs pinned/vested authority basis;
4. preview distinct from commit and commit-time revalidation;
5. occurrence lifecycle immutability;
6. effect-attempt admission distinct from Action commit;
7. read authority;
8. exact evaluator/model/ontology revision in explanation;
9. evaluator error distinct from denial;
10. no generic/admin bypass represented by the model;
11. exact-context proof binding, not revision-only freshness;
12. runtime-issued/unforgeable operational authority.

## What would make M4-v2 a real reduction

M4-v2 passes the anti-cheat test only if:

- no registry is queried by locus/scope;
- operation phase is represented by typed operation identity/signature, not scheduler metadata;
- Type refinement is generic value-construction semantics and remains useful outside capabilities;
- current/pinned/dependency basis is proof-value validity, not a dynamic RuleBinding lookup;
- cross-cutting invariants are requirements of the lowest authoritative commit signature;
- authorization combination can remain in a typed/inspectable PDP Computation whose result/evidence constructs the proof;
- capability machinery remains useful in a model with zero business rules because it isolates Computation from privileged runtime authority;
- actor/workload/represented-principal come from trusted execution context rather than caller assertion;
- exact semantic context can be bound without growing proof Types into arbitrary locus/scope/binding records.

If those conditions fail, M4 is hidden recreation and R5 survives.

## Current candidate

If M4-v2 survives review and downstream falsification, the candidate core is:

```text
Type
Relation
Computation
Action
```

This is provisionally called `R6-capability`. It is materially different from Wave A's rejected quartet because the Type/runtime model now carries generic refinements, explicit privileged-operation signatures and exact-context runtime-issued proof values.

It is still only a candidate.

## Promotion blockers

#156 alone cannot update RFC-0002. At minimum:

- #157 must attack no-bypass across admin/import/migration/privacy/repair paths;
- #158 must attack Relation unification;
- #71 must attack the same R6 semantics across the first cross-cycle acceptance vertical;
- trusted execution identity and dependency-sensitive StateBasis must remain explicit runtime requirements.

## Epistemic rule

`review-clean`, if reached, means only that #156 found no internal contradiction requiring R6-capability to be discarded before downstream falsification.

It does **not** mean accepted architecture, proven minimality, production readiness, or permission to rewrite RFC-0002.
