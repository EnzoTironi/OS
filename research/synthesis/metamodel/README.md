# Reduced executable metamodel — issue #70 synthesis

- Artifact ID: `issue-0070-metamodel-synthesis`
- Issue: <https://github.com/EnzoTironi/OS/issues/70>
- Track: synthesis
- Date: 2026-08-16
- Base: RFC-0001 + reviewed Wave A primitive kill tests + reviewed Wave B ingest/commit/effects/authorization/orchestration/storage/verification research
- Decision: **hypothesis under kill test**. This folder does not edit RFC-0001 until the reduced model survives its executable and adversarial gates.

## Question

What is the **smallest executable semantic language** whose composition can still preserve the meaning, enforcement and explainability required by the reviewed corpus?

The key correction to earlier reduction work is to separate four levels that were often collapsed into one word, “primitive”:

```text
1. BASE EXECUTABLE FORM
   an irreducible language construct the engine must interpret directly

2. STANDARD SEMANTIC CONTRACT
   a reusable composition of base forms with mandatory semantics/enforcement

3. RUNTIME CAPABILITY
   privileged mechanism required to execute/enforce contracts safely

4. DOMAIN TYPE / PATTERN
   a concept that exists in business reality but does not require a new engine sort

5. TOOLING / PHYSICAL REPRESENTATION
   compiler, package, table, graph index, workflow engine, UI, SDK, MCP surface, etc.
```

A concept can require native **runtime enforcement** without earning a separate **semantic base sort**. Wave B made this distinction concrete for authorization, effects, transactions, orchestration and storage.

## Prior hypothesis under attack

RFC-0001 proposed:

```text
Type / ObjectType
Interface
Property
Relationship / Link
Action
Function
Constraint
Policy
Event or Event-nature
Fact
```

Wave A issue #56 already rejected both the full ten-sort list and the smaller quartet `Type + Link + Function + Action`. Its smallest survivor was the research-labelled:

```text
Type
Link
Action
Event
Eval
Bind
```

That result was intentionally not accepted. In particular, `Eval` and `Bind` described jobs, not final OS vocabulary.

Wave B now lets us rerun the reduction with stronger contracts:

- #45: source evidence/observation and business truth must remain distinguishable, but `Observation`, `Binding` and `Fact` are not yet earned as base sorts;
- #40: transaction correctness requires explicit semantic operation identity, StateBasis/dependencies, invariants and current/pinned authority at the correct commit boundary;
- #41: external effects require a privileged capability and typed request/attempt/evidence lifecycle, but a semantic `Effect` sort is not yet earned;
- #42: authorization requires actor/represented/workload/grant/policy semantics and fail-safe enforcement, but `Grant`, `Role` and one product PDP are not base metamodel forms;
- #43: durable orchestration is execution memory, not business Process/Workflow authority;
- #39: storage representation and physical time models must not become ontology semantics;
- #46: reductions must be falsified with explicit counterexamples and evidence classes, not accepted because examples look elegant.

## Working candidate: R5

The smallest set currently worth attacking is:

```text
Type
Relation
Computation
Action
RuleBinding
```

These names are provisional research labels.

### `Type`

Defines a typed value/entity space and its identity/equality semantics.

A Type must be able to distinguish at least:

```text
entity/reference identity   // same thing can change while remaining itself
value equality              // Money, Quantity, DateInterval, etc.
```

`ObjectType` and `ValueType` can be categories of one type system rather than unrelated engine primitives.

### `Relation`

A typed n-ary relation over entities and/or values with declarable cardinality, uniqueness and participation constraints.

Under R5:

```text
Property = unary-owner relation to a value
Link     = relation between identifiable entities
Relator  = ordinary Type with participant Relations when the relationship itself has identity/lifecycle
```

The semantic abstraction does **not** require every scalar property to be stored as a graph edge.

### `Computation`

A versioned typed executable definition that returns a value/decision/search result **without directly committing authoritative mutation**.

Execution classes such as pure deterministic evaluation, solver/search, relation evaluation, external-read or agentic judgment may require distinct runtime capabilities/result algebras. The reduction claim is only that they need not automatically become unrelated base semantic sorts.

A computation definition is not permission to call arbitrary network or write APIs.

### `Action`

A typed attempted intervention/decision surface with stable semantic invocation identity.

Action remains a strong candidate for an irreducible executable form because a computation alone does not carry:

```text
actor / represented principal / workload context
semantic operation identity + intent digest
state basis / approval basis
commit boundary
mutation plan
causal resulting occurrences
EffectRequest creation
replay/mismatch semantics
```

The burden is now on any smaller model to encode those without recreating `Action` under another name.

### `RuleBinding`

Binds a computation or specialized decision evaluator to a mandatory enforcement job.

Candidate dimensions include:

```text
subject/scope    Type | Relation | Action | runtime capability
obligation       caller | system | authority | none
locus            read | preview | commit | effect-attempt | projection | lifecycle
basis            current | pinned | immutable | as-of | declared dependency set
false outcome    ignore | warn | deny | audit | ...
error outcome    deny | skip | retryable-error | undefined | ...
combination      when the evaluator returns an authority/decision algebra
revision         exact definition/model/policy revision used
```

This is deliberately richer than `Function<Bool> + failClosed`. Wave A already killed that collapse; #40/#42 made the required currentness/basis semantics more precise.

`RuleBinding` is a working language form, not the same concept as #45 source-to-entity `Binding`.

## Candidate reductions

R5 tries to demote the following without deleting their meaning.

| RFC / adjacent concept | R5 classification | Working encoding |
| --- | --- | --- |
| Property | standard relation role | `Relation(owner, Value)` + cardinality |
| Link | standard relation role | `Relation(Entity, Entity, ...)` |
| Interface | standard schema/capability contract | requirements over Type/Relation/Action signatures; no identity/Role semantics |
| Constraint | standard RuleBinding contract | system obligation at declared locus/basis |
| Invariant | standard RuleBinding contract | non-waivable system obligation on all exported mutation paths |
| Policy | standard RuleBinding contract | authority decision algebra + fail-safe locus/currentness |
| Projection | computation + runtime materialization | Computation/Query + revision/freshness/lineage materialization metadata |
| Event / Occurrence | standard semantic contract over Type | occurrence nature + create-only/append correction lifecycle enforced by RuleBinding/runtime |
| Fact | domain/standard evidence pattern, unresolved | typed assertion/evidence objects/relations with provenance; no universal fact atom |
| Observation | standard evidence contract | ordinary immutable typed evidence + source/provenance/assurance |
| Effect | runtime capability + ordinary typed records | EffectRequest/Attempt/Observation/Outcome domain/runtime records; privileged external I/O executor |
| Workflow | runtime capability/state | durable execution memory only |
| Process | domain Type | independently meaningful transformation/process identity where domain requires it |
| Intent / Commitment / Claim / Agreement | domain Types | economic/legal semantics, not metamodel sorts |
| Role / Phase / Relator | domain patterns | classification/relationship object/lifecycle expressed compositionally |
| Grant / Delegation | domain/governance Types | typed authority relationships consumed by RuleBinding/PDP |
| Proposal / Approval | domain/governance Types | optional records linked to Actions where risk/governance requires them |
| StateBasis | Action/RuleBinding transaction contract | declared dependency/basis metadata, not currently a base semantic sort |
| CommitWitness | audit/projection | durable causal evidence from Action/transaction/authority/outcome records |
| Pack / Compiler | tooling | package/module/toolchain only |

## The important new attack: Event

Wave A rejected:

```text
Event = Type + tag/interface
```

because a tag does not prevent an author from adding `editQuantity` to a posted stock movement or rewriting a historical occurrence.

R5 proposes a **different** reduction:

```text
Event contract
  = Type(nature=occurrence)
  + RuleBinding(lifecycle=create-only / no ordinary update-delete)
  + correction via a new typed occurrence/action/relation
```

If the runtime enforces that lifecycle through every mutation path, the enforcement loss that killed M1 disappears without requiring `Event` to be a separate storage/metamodel sort.

This is a major kill test for #70. If lower-level paths can bypass the contract, Event must be promoted again or the generic lifecycle mechanism strengthened.

## Action is attacked from the opposite direction

Try to encode:

```text
Action = Computation returning MutationPlan + RuleBindings + runtime commit capability
```

If this composition can preserve stable invocation identity, actor intent, authority, idempotent replay, mismatch rejection, StateBasis, commit causality, outcomes and effects **without a hidden Action registry/protocol**, Action can be demoted.

Current expectation: the reduction will recreate an Action contract under another name, so Action likely survives as a first-class executable form.

That expectation is not a decision.

## Property and Link are attacked together

R5 treats them as ergonomically distinct projections of one Relation algebra.

This reduction only survives if the same Relation definition can statically express:

```text
scalar/value target typing
entity target typing
cardinality / optionality / multiplicity
uniqueness / exclusivity
inverse/navigation metadata where useful
n-ary participation
relation provenance where needed
```

and still lets relationship-with-lifecycle become an ordinary identifiable Type rather than an overloaded edge.

If scalar properties repeatedly need semantics that cannot be represented as relation constraints without special hidden machinery, `Property` earns promotion again.

## What is *not* being unified

Reduction must not erase these distinctions:

```text
Action != occurrence/Event
attempt != outcome
source evidence != accepted business state
current authority != historical approval
local commit != remote success
runtime timer != business deadline
workflow completion != domain fulfillment
business valid time != database transaction time
value equality != entity identity
role != kind != interface
relationship object != cheap relation
```

The whole point of R5 is to reduce syntax/categories while preserving those semantics as enforceable contracts.

## Acceptance rule for a primitive

A base form earns survival only if all three hold:

1. removing it forces a required distinction into convention/hidden code;
2. the surviving distinction unlocks generic runtime/static enforcement or explanation across unrelated domains;
3. at least one adversarial scenario fails under the smaller composition and cannot be repaired without recreating the form under another name.

Donor-system vocabulary alone is not evidence of irreducibility.

## Files planned in this synthesis

| File | Purpose |
| --- | --- |
| `primitive-reduction-matrix.md` | each RFC/adjacent form vs R5 encoding, enforcement, kill/revival criteria |
| `encodings.md` | concrete accounting/inventory/identity/evidence/authorization/effect encodings |
| `kill-tests.md` | adversarial reductions and expected failures |
| `reference_model.py` | executable small model of R5 contracts and deliberately weaker variants |
| `test_reductions.py` | executable kill tests and verifier sensitivity |
| `open-questions.md` | what #70 still cannot legitimately decide |
| `review.md` | adversarial self-review before any RFC update |

## Explicit non-decisions

This document does **not** yet:

- update RFC-0001;
- select syntax or implementation language;
- select PostgreSQL/FoundationDB/XTDB or any storage stack;
- select Cedar/OpenFGA or an authorization backend;
- select Temporal/Restate/Camunda or an orchestration backend;
- assert that Event is successfully demoted;
- assert that Fact is unnecessary forever;
- assert that R5 is minimal;
- assert that every Computation execution mode can share one runtime;
- assert that Interface can disappear from authoring/tooling APIs.

Those claims must survive the kill tests first.
