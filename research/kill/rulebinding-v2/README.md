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

A real reduction must make at least one of those jobs disappear by deriving it from a generic mechanism already required for another independent reason.

## Competitors

### M0 — R5 explicit RuleBinding

Control. A binding registry is queried by locus/scope, evaluators run, outcomes are enforced.

**State:** control, not re-evaluated as accepted.

### M1 — definition graph + binding dispatcher

Bindings are ordinary Types/Relations:

```text
Rule --evaluatedBy--> Computation
Rule --appliesTo--> Target
Rule --locus--> Commit
```

Runtime traverses those relations at commit/read/effect/lifecycle time.

**Expected verdict:** hidden recreation. Storage changed; semantic job did not.

### M2 — inline Action/Type contracts

Actions and Types directly list evaluator names. Action code checks its own pre/post rules; Types list lifecycle/invariant checks.

**Expected pressure:** alternate mutation paths, read authority, effect attempts and cross-cutting global invariants either bypass enforcement or force every operation family to rebuild the same attachment protocol.

### M3 — generic executable Relation triggers

`Relation` itself may carry trigger/locus/evaluator metadata.

**Expected pressure:** either Relation becomes an overpowered RuleBinding super-form or runtime still dispatches relation records by semantic trigger role. The form count may fall while primitive complexity rises.

### M4 — proof-carrying capability types

This is the strongest new candidate and the reason #156 exists.

Operations are not told to "run bindings at locus L". Instead, every privileged operation has a typed signature requiring one or more ephemeral capability values:

```text
preview(Action)      requires PreviewPermit<Action>
commit(Action)       requires CommitPermit<Action>
commitMutation(T)    requires PostStateValid<T>
read(T)              requires ReadPermit<T>
update(Occurrence)   requires UpdatePermit<Occurrence>
effectAttempt(E)     requires EffectAttemptPermit<E>
```

A capability type is an ordinary `Type` under a standard capability/refinement contract. It names the Computation(s) that can validate/mint values of that type. Capability values carry operation/target, evidence and basis/revision. Operations only consume values of the types declared in their signatures.

The runtime therefore needs a generic capability mint/verify mechanism for a reason independent of RuleBinding: `Computation` already must be unable to mutate authoritative state or perform external writes without privileged capabilities.

Potential genuine reduction:

```text
RuleBinding scheduling by locus
        ↓ remove
operation signature requires CapabilityType
        ↓
generic capability mint validates Type refinements
```

The critical question is whether `CapabilityType + refinements + operation signature` is truly existing `Type/Relation/Computation/Action` semantics plus runtime authority, or whether it is RuleBinding decomposed into three fields and renamed.

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
10. no generic/admin bypass represented by the model.

## What would make M4 a real reduction

M4 passes the anti-cheat test only if:

- there is no registry queried by locus/scope;
- operation locus is represented by ordinary typed operation signatures, not a `locus` field interpreted by a rule dispatcher;
- validation runs because a capability value is being constructed, exactly as any refined value is validated;
- currentness/replay checks are generic properties of capability values, not RuleBinding metadata;
- cross-cutting invariants are requirements of the single low-level authoritative commit capability, so Action and admin paths cannot omit them;
- authorization combination can live inside a typed PDP Computation whose result/evidence is carried by the capability, rather than in generic binding combination metadata;
- capability machinery remains useful even in a model with zero business rules, because it isolates Computation from mutation/external I/O.

If those conditions fail, M4 is hidden recreation and R5 survives.

## Epistemic rule

Even if M4 passes the bounded model, the result is only a **candidate R6** until #157/#158 and a real implementation-neutral vertical attack the same mechanism. This folder must not edit RFC-0002 to `accepted` or claim universal minimality.
