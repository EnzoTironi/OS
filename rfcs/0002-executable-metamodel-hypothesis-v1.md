# RFC-0002 — Executable metamodel hypothesis v1

**Status:** hypothesis  
**Decision:** none  
**Supersedes:** nothing  
**Issue:** #70  

This RFC is a replacement **candidate** for RFC-0001 after Wave A/Wave B synthesis. It does not supersede RFC-0001 and it does not mark the metamodel accepted.

The purpose is to publish the smallest executable semantic language that currently survives the reviewed kill tests, while keeping every unresolved reduction explicit and falsifiable.

## Thesis

A business operating system should expose a rich ontology to humans, agents and tools while keeping the canonical executable kernel as small as the evidence permits.

Small kernel does not mean small business model.

```text
rich authoring/domain ontology
            |
            v
canonical executable semantics
            |
            v
specialized runtime capabilities
            |
            v
physical stores / APIs / UIs / agents
```

The central lesson from the research is that four categories must not be collapsed:

1. **base executable form** — irreducible semantic behavior the engine interprets directly;
2. **standard semantic contract** — reusable, visible composition of base forms with mandatory semantics;
3. **runtime capability** — privileged execution/enforcement machinery that does not automatically become a semantic sort;
4. **domain type/pattern** — a concept in organizational reality that does not require a new metamodel category;
5. **tooling/physical representation** — package, compiler, SQL table, graph node, index, workflow token, UI, SDK or MCP surface.

A concept may require privileged runtime enforcement without earning a distinct semantic base sort.

## Working canonical forms: R5

The current candidate canonical semantic IR is:

```text
Type
Relation
Computation
Action
RuleBinding
```

These names are provisional. Their behavioral boundaries matter more than the names.

### Type

Defines a typed space and its identity/equality semantics.

At minimum, one type system must distinguish:

```text
entity/reference identity
value equality
```

An Organization can change while remaining the same entity. Two independent `Money(100, BRL)` values can be equal without sharing object identity.

This RFC does not yet decide whether authoring exposes `ObjectType`, `ValueType`, sum types, records and opaque identifiers as separate resources or categories of one Type system.

### Relation

Defines a typed relation over entities and/or values with declarable arity, endpoint typing, cardinality and integrity constraints.

Working normalization:

```text
Property -> Relation(entity, value)
Link     -> Relation(entity, entity, ...)
```

A relationship that has lifecycle, actions, authority, independent validity or references should normally become an ordinary identifiable Type with participant Relations rather than a privileged `Relator` storage species.

This is a semantic normalization claim, not a requirement to store every scalar attribute as a graph edge. Physical stores may specialize columns, foreign keys, edge indexes and value tables.

### Computation

Defines versioned typed executable logic that cannot directly commit authoritative mutation.

Possible execution protocols include:

```text
pure deterministic evaluation
query/relational evaluation
solver/search
PDP/graph authorization evaluation
external read
agentic/probabilistic judgment
```

The hypothesis is that these can share one semantic family while runtime capabilities/result algebras remain explicit. If this requires opaque flags or permits illegal combinations, Computation must split.

A Computation is never permission to perform arbitrary external writes or authoritative database mutation.

### Action

Defines a typed attempted intervention or business decision surface.

The generic Action protocol must preserve at least:

```text
semantic operation identity
intent digest / mismatch semantics
actor
represented principal where applicable
workload identity where applicable
state / approval basis
mandatory RuleBindings
planner / mutation plan
atomic local commit boundary
causal resulting records / occurrences
EffectRequest creation where applicable
replay of the same semantic operation
```

Same operation identity + same intent replays the prior semantic result without a second business mutation. Same operation identity + changed intent is not replay.

An Action is not evidence that the intended external-world occurrence happened.

### RuleBinding

Defines the mandatory attachment between an evaluator and an enforcement job.

Candidate dimensions include:

```text
scope / subject
locus
obligation
state basis / currentness
timing
false outcome
error outcome
decision combination algebra
exact evaluator / model / ontology revision
```

Example loci:

```text
read
preview
commit
lifecycle:update
lifecycle:delete
effect-attempt
projection/read admission
```

Example obligations:

```text
caller
system
authority
none
```

A RuleBinding is deliberately more expressive than `Function<Bool> + failClosed`.

Current evidence does not prove RuleBinding is final vocabulary. A future reduction may encode it through ordinary definition relations **only if** the same generic no-bypass enforcement, static checking and explanation survive without a renamed binding dispatcher.

## Authoring resources may remain richer than R5

Primitive reduction is not an ergonomics mandate.

Ontology authors, agents and tooling should be able to work with meaningful resources such as:

```text
ObjectType / ValueType
Property
Link
Interface / ShapeContract
ActionType
Function / Query / Solver
Invariant / Constraint
Policy
EventType / OccurrenceContract
Projection
Effect contract/capability
```

These may normalize to R5 plus standard contracts and runtime capabilities. Their names remain useful because they communicate intent and can constrain valid combinations.

For example:

```text
EventType StockMovement
Invariant BalancedJournal
Policy PurchaseAuthority
Interface Priceable
```

should not require authors to hand-write low-level binding metadata every time.

## Standard semantic contracts under the hypothesis

### Occurrence / Event contract

The semantic distinction between attempted intervention and occurrence is mandatory:

```text
Action != Occurrence
```

Wave A rejected:

```text
Event = Type + unenforced tag/interface
```

because historical occurrences remained editable.

R5 tests a stronger composition:

```text
OccurrenceContract(T)
  = Type T
  + generic lifecycle RuleBindings preventing ordinary update/delete
  + correction/reversal by a new governed Action/occurrence/relation
```

If every exported authoritative mutation path obeys the same lifecycle enforcement, `Event` need not be a separate canonical base form.

This demotes only base-sort status. Occurrence meaning remains explicit in authoring, query, explanation and domain modeling.

**Falsifier:** any legitimate business/admin/import/migration path can mutate committed occurrence semantics while bypassing the generic lifecycle authority.

### Constraint / invariant contract

A Constraint or Invariant is not merely a boolean expression. It is an evaluator bound to a mandatory locus/basis with a system obligation and declared failure/error behavior.

```text
Invariant BalancedJournal
  -> Computation JournalBalanced
  -> RuleBinding(scope=PostJournalEntry, locus=commit,
                 obligation=system, on_deny=deny, on_error=deny)
```

A UI preview or one Action-local `if` cannot satisfy a commit invariant.

### Policy contract

Policy is not `Bool`.

An authorization evaluator may produce:

```text
Permit | Deny | Error
+ determining evidence
+ model/policy revision
```

A RuleBinding declares the authority locus, current/pinned/vested basis and combination/error algebra.

Historical Approval evidence and current authorization are separate concepts.

### Interface / ShapeContract

Interface describes shared shape/capabilities, not Role and not identity.

A standard contract may require Relation, Action, Computation/Query or other contract signatures. Whether Interface should become a stronger canonical semantic form remains open until real SDK/query/Action polymorphism and variance are tested.

### Evidence / Observation contract

Source evidence and accepted business state must remain distinct.

A standard evidence contract may include:

```text
source identity
subject / predicate / value or object
capture/extractor/model revision
provenance / assurance
meaningful time axes
relations to decisions/acceptance/rejection/derivation
```

The fact-only kernel is rejected. Whether a reusable `Statement`/`Fact` contract should be standardized remains unresolved.

### Projection contract

Projection is derivation plus optional materialization, not independent business authority.

A materialization must expose enough lineage/revision/freshness metadata for consumers to know whether it is current, bounded-stale or intentionally pinned evidence.

### Effect contract

External I/O requires a privileged runtime capability but does not yet require `Effect` as a canonical semantic base form.

Typed records may include:

```text
EffectRequest
EffectAttempt
RemoteObservation
EffectOutcome
```

Required laws include:

```text
stable local request identity
provider may lack a pre-send remote key
timeout after send = indeterminate, not failed
blind retry is forbidden when protocol safety is insufficient
reconciliation may resolve unknown outcomes later
local Action commit != remote success
```

## Runtime capabilities that do not automatically become semantic forms

R5 expects specialized runtime implementations behind explicit capability boundaries, including:

```text
transaction / concurrency enforcement
external effect execution
PDP / relation authorization evaluation
solver execution
agent/model execution
query optimization
materialization/index maintenance
durable orchestration / timers / retries
credential/environment isolation
ontology definition validation/migration
```

Native runtime specialization is neither necessary nor sufficient evidence for semantic primitive status.

## Domain ontology remains rich

The following are examples of reusable domain Types/patterns, not canonical metamodel sorts merely because they are important:

```text
Party
Organization
Person
Product
Agreement
Intent
Commitment
Claim
ProcessSpecification
Process
BOM
WorkOrder
StockMovement
JournalEntry
Employment
Role
Grant
Delegation
Proposal
Approval
Observation
Money
Quantity
Address
```

A domain library may standardize these aggressively. That is a different layer from the metamodel.

## Cross-domain laws the model must preserve

The current corpus strongly supports these distinctions:

```text
Action != occurrence
attempt != outcome
source evidence != accepted business state
current authority != historical approval
preview != commit
local commit != remote success
workflow execution != business fulfillment
runtime timer != business deadline
value equality != entity identity
Role != Kind != Interface
relationship object != cheap Relation
semantic form != runtime capability
semantic authority != physical representation
```

Any future reduction that erases one of these distinctions fails even if its syntax becomes smaller.

## Workflow and Process

`Workflow` is durable execution memory, not a canonical business semantic form.

A runtime may maintain:

```text
timers
waits
signals
retries
replay history
version markers
```

A business `Process`, `Commitment` or `Agreement` remains an ordinary domain identity with its own semantics. Workflow completion does not prove business fulfillment.

## Deterministic business logic

Accounting, inventory, costing and manufacturing do not require separate semantic kernels.

Their deterministic laws live in the same executable ontology as typed Computations, Actions, Relations and RuleBindings.

Example:

```text
Type JournalEntry
Type JournalLine
Relation entryLine
Computation JournalBalanced
RuleBinding BalancedJournal at commit
Action PostJournalEntry
OccurrenceContract posted JournalEntry
```

The runtime guarantees deterministic enforcement where declared. The domain logic remains part of the business definition rather than a second hidden ERP authority.

## Pack and compiler

`Pack`, module, namespace and package may organize/distribute software definitions. They are not business ontology primitives.

Compilation, code generation, schema generation, UI generation, SDK generation, indexing and optimization are toolchain/runtime techniques. `Compiler` is not a domain/metamodel primitive.

## Verification and falsification

This hypothesis is valuable only while it remains easy to kill.

Required verification pressure includes:

- explicit adversarial scenarios;
- weaker sensitivity mutants that reproduce known failures;
- property/state-machine testing;
- concurrency/backend experiments where applicable;
- bounded model/SMT checks where they genuinely add evidence;
- regression preservation of discovered counterexamples;
- exact revision/evidence provenance for claims.

A green test suite is evidence, not proof of universal correctness or minimality.

## Primary open questions

The following can still change the canonical form list:

1. Can RuleBinding genuinely reduce without a renamed dispatcher?
2. Can Action genuinely reduce without recreating the semantic operation protocol?
3. Does Event/Occurrence no-bypass enforcement survive real admin/import/migration/privacy paths?
4. Does one Relation algebra subsume Property/Link cleanly across authoring/query/codegen/migration?
5. Should Type cover entity/value/record/sum/reference categories under one form?
6. Is Computation too broad for Query/Search/PDP/agent result/capability algebras?
7. Does Interface require stronger first-class canonical semantics for polymorphism/variance?
8. Should a reusable Statement/Fact contract be standardized?
9. How are metamodel definitions themselves represented, versioned and content-addressed?
10. What mutation authorities exist below business Action without creating bypasses?

These questions are why this RFC has `Status: hypothesis` and `Decision: none`.

## Non-decisions

This RFC does not choose:

- syntax or implementation language;
- PostgreSQL, FoundationDB, XTDB or another storage engine;
- graph versus relational physical representation;
- Cedar, OpenFGA, OPA or another authorization backend;
- Temporal, Restate, Camunda or another orchestration backend;
- an agent framework or model provider;
- UI framework, SDK format, API transport or MCP details;
- package/module format;
- a Brazilian fiscal implementation;
- an accepted production architecture.

## Relationship to RFC-0001

RFC-0001 remains the original metamodel hypothesis and attack target.

RFC-0002 records a stronger synthesis candidate after the reviewed Wave A/Wave B work. It does **not** supersede RFC-0001 today.

Promotion or supersession requires subsequent evidence that the remaining open questions do not materially change the canonical base-form list, followed by an explicit architecture decision. No such decision is made here.
