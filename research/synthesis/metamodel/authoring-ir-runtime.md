# Authoring resources, canonical IR, and runtime behavioral forms

**Issue:** #70  
**Purpose:** prevent fake primitive reduction by separating three representations of the same semantics.

## 1. Three layers

### Authoring resources

What ontology authors, agents and tooling should work with because the distinction is meaningful and ergonomic:

```text
ObjectType / ValueType
Property
Link
Interface / ShapeContract
ActionType
Function / Query / Solver
Invariant
Policy
EventType / OccurrenceContract
Projection
Effect capability/contract
```

The authoring layer should **not** be forced to expose the smallest kernel vocabulary if doing so makes intent obscure.

An author should be allowed to say:

```text
EventType StockMovement
Invariant BalancedJournal
Policy PurchaseAuthority
Interface Priceable
```

rather than manually constructing low-level relations/bindings every time.

### Canonical semantic IR

The normalized executable definitions after authoring sugar/contracts are expanded. R5 currently hypothesizes these behavioral forms:

```text
Type
Relation
Computation
Action
RuleBinding
```

Canonical IR is still semantic. It is not SQL schema, AST bytecode, graph triples, or a workflow definition.

### Runtime capabilities / dispatch

What the engine must do specially and cannot obtain from passive data representation alone:

```text
type/identity validation
relation/cardinality/integrity enforcement
computation capability isolation/execution
action invocation + semantic commit/replay
rule-binding discovery/evaluation at required loci
external effect execution
transaction implementation
PDP/solver/agent specialized evaluator adapters
durable orchestration
materialization/index maintenance
```

Some runtime capabilities correspond to R5 base forms; others implement standard contracts without creating new semantic forms.

## 2. The anti-cheat rule

> **Encoding a concept as ordinary Type/Relation data is not a semantic reduction if the runtime still contains a concept-specific dispatcher that reconstructs exactly the deleted form's behavior.**

Example fake Action reduction:

```text
Type OperationDefinition
Relations:
  planner
  input
  policy
  stateBasis
  operationIdStrategy
  effects

runtime:
  if type == OperationDefinition:
      do actor binding
      enforce semantic operation identity
      plan
      validate current/pinned basis
      commit atomically
      persist replay result
      create EffectRequests
```

This is an `Action` form encoded as data. The name disappeared; the irreducible behavior did not.

The same applies to RuleBinding:

```text
Type BindingRecord
```

is not a demotion if the runtime must recognize `BindingRecord` specially to schedule evaluator E at locus L under basis B and error algebra A. It may be the *physical/meta representation* of RuleBinding, but RuleBinding remains a behavioral form.

## 3. Why Event is materially different

Wave A tested:

```text
Event = Type + tag/interface
```

and rejected it because ordinary update/delete remained possible.

R5 tests:

```text
EventType authoring resource
  -> Type contracts=[occurrence]
  -> generic lifecycle RuleBindings:
       no ordinary update
       no ordinary delete
       correction by new governed operation/occurrence
```

The runtime does **not** need:

```text
if type.is_event: use special event database/mutation engine
```

It already knows how to enforce any RuleBinding at `lifecycle:update/delete`.

Therefore Event demotion can be real if every exported mutation path uses generic lifecycle enforcement.

The occurrence nature remains semantically visible for query/tooling/explanation. What disappears is a distinct kernel mutation species.

## 4. Why Policy can be demoted without becoming Bool

Policy authoring may compile to:

```text
Computation/PDP evaluator with typed DecisionResult
RuleBinding:
  obligation=authority
  locus=commit/effect-attempt/...
  basis=current/pinned/vested rules
  on_error=deny or declared algebra
```

The engine already dispatches RuleBinding generically and evaluator capability by its declared execution protocol.

No `if semantic_form == Policy` branch is necessary if the typed authority evaluator/result protocol plus binding attributes fully determine behavior.

If a future authorization feature requires Policy-only runtime semantics that cannot be represented in evaluator protocol + RuleBinding, Policy must be promoted again.

## 5. Why Invariant/Constraint can be demoted

Authoring:

```text
Invariant InventoryConservation
```

Canonical:

```text
Computation InventoryConservationCheck
RuleBinding:
  obligation=system
  locus=commit
  timing=after/before as defined
  dependency basis=...
  on_deny=deny
  on_error=deny
```

No invariant-specific dispatcher is needed beyond generic binding and transaction dependency machinery.

A generated/static `Invariant` authoring resource remains useful because it communicates intent and can restrict invalid combinations of RuleBinding fields.

## 6. Property and Link

Authoring can keep both because humans/tools care about the difference:

```text
Property unitPrice : Money
Link supplier      : Organization
```

Canonical Relation IR can normalize them to endpoint-typed relations.

The runtime may physically implement them differently:

```text
scalar -> typed column/value table
link   -> foreign key/edge/index
```

Physical specialization does not revive separate semantic base forms unless the semantic constraint algebras diverge irreducibly.

## 7. Interface

Interface/ShapeContract is likely an authoring/static semantic contract rather than a runtime behavioral form.

It can define requirements over:

```text
Relations
Actions
Computations/Queries
other contracts
```

Generic type/conformance tooling can compute satisfaction. If Action/query/runtime polymorphism later needs nominal identity or variance rules that cannot be represented through Type-system contract metadata, Interface can earn stronger status.

Crucially:

```text
Interface != Role != entity identity
```

## 8. Effect

Effect is the useful inverse example.

Semantic `EffectType` may remain demoted while a **native runtime capability** is still mandatory:

```text
ordinary typed EffectRequest/Attempt/Observation/Outcome records
          +
privileged external-I/O executor
```

The executor is special because network/secrets/environment/idempotency/reconciliation are capabilities, not ordinary computations.

That does not force `Effect` to be one of the canonical ontology forms if its records/lifecycle compose generically.

## 9. Workflow

Workflow is even clearer:

```text
business ontology          canonical semantic IR
       |                           |
       +---------------------------+
                    |
             durable runtime
```

The orchestration engine has special runtime state/dispatch, but its tokens/timers/history remain execution memory rather than ontology forms.

Native runtime capability is therefore neither necessary nor sufficient evidence for semantic primitive status.

## 10. Refined primitive criterion

A candidate remains a canonical base executable form when:

1. multiple unrelated domains require the behavior;
2. deleting it loses generic static/runtime semantics or explanation;
3. repairing the deletion requires a dedicated runtime dispatch/protocol equivalent to the deleted form;
4. the behavior cannot be expressed by an existing base form + standard contract + already-required runtime capability without special-case reconstruction.

A candidate is demoted when:

1. authoring meaning can remain explicit as sugar/contract;
2. canonical semantics normalize to existing forms;
3. existing generic runtime dispatch enforces it;
4. no hidden concept-specific escape hatch is introduced.

## 11. Current implication for R5

Under this criterion:

```text
Type         strong survivor
Relation     strong/medium survivor; broad algebra still being tested
Computation  strong/medium survivor; execution-class boundaries still open
Action       strong survivor: deleting it recreates semantic operation protocol
RuleBinding  medium/strong survivor: deleting it currently recreates mandatory-locus protocol
```

And:

```text
Event        plausible real demotion after Wave B
Policy       plausible real demotion
Invariant    plausible real demotion
Constraint   plausible real demotion
Projection   real demotion to derivation/materialization
Workflow     real demotion to runtime
Effect       plausible semantic demotion while native I/O capability remains
Property     plausible normalization into Relation
Link         plausible normalization into Relation
Interface    likely standard contract, still needs tooling experiment
Fact         unresolved
```

This is more meaningful than counting syntax nodes. The goal is **minimum irreducible behavior with maximum explicit authoring semantics**.
