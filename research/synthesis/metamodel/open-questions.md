# Open questions and downstream handoff

**Issue:** #70  
**Status:** unresolved unless explicitly answered.

## Q-META-01 — is `RuleBinding` truly a base form?

Current answer: `undetermined`, strongest new candidate for further reduction.

R5 gives RuleBinding interpreter-visible semantics because reviewed failures depend on:

```text
scope
locus
obligation
basis/currentness
false/error algebra
combination
revision
```

But a later model may represent a RuleBinding as ordinary relations among definition objects, with a generic enforcement runtime interpreting those relations.

That is a real reduction only if:

- static checking remains generic;
- no bypass path exists;
- audit/explanation can name exact binding/revision;
- enforcement runtime does not reintroduce hidden per-kind branches for Constraint/Policy/Event/etc.

## Q-META-02 — is Action a base form or a standard executable contract?

Current answer: `hypothesis` that it stays first-class.

A candidate reduction is:

```text
Type ActionInvocation
Computation Planner
RuleBindings
runtime CommitCapability
Relations to actor/intent/basis/outcome
```

The hard question is whether that actually removes an Action form or merely moves the full Action protocol into configuration.

Required test: generate SDK/UI/tool discovery and invoke/replay/mismatch semantics without a hidden Action registry/type switch.

## Q-META-03 — can Event really be demoted after Wave B?

Current answer: `hypothesis`.

The reference model demonstrates that an occurrence Type plus inescapable lifecycle RuleBindings can reject update/delete and express correction by append.

Still unproven in a real backend/runtime:

- bulk import;
- administrative repair;
- ontology migration;
- retention/privacy erasure;
- projection rebuild;
- connector-side mutation paths;
- database-level direct access;
- accounting/stock posting under concurrency.

If any legitimate exported path bypasses generic lifecycle enforcement, Event needs promotion or the generic commit/lifecycle authority must be strengthened.

## Q-META-04 — is a reusable Fact/Statement contract worth standardizing?

Current answer: `undetermined`.

The Fact-only kernel is rejected, but #45/#4 pressure remains for:

```text
subject
predicate/relation
object/value
provenance
assurance
source/model revision
time axes actually present
accepted/rejected/derived relation to decisions
```

Options:

1. ordinary domain Evidence/Observation Types per source/domain;
2. a standard Statement/Assertion contract over Type/Relation;
3. native Fact sort.

Benchmark generic contradiction query, provenance traversal, correction, retention and performance before deciding.

## Q-META-05 — does one `Relation` algebra really subsume Property and Link ergonomically and statically?

Current answer: `hypothesis`.

Need real schema/codegen/query experiments covering:

- required/optional scalar;
- repeated values;
- composite value types;
- entity links;
- inverse navigation;
- n-ary relations;
- uniqueness/exclusion;
- relation metadata/provenance;
- object-backed relationship threshold;
- migration/index generation.

Physical storage may still specialize attributes and links even if semantics share one Relation form.

## Q-META-06 — should `Type` contain both entity and value type categories?

Current answer: `hypothesis`.

R5 keeps one Type system with distinct identity/equality modes. Need prove this gives clear authoring/static/runtime semantics for:

```text
EntityType
Money/Quantity/DateInterval
Enum/sum type
structured value/record
opaque identifier
reference
```

Do not give value types fake entity identity to save one language node.

## Q-META-07 — is `Computation` too broad?

Current answer: `undetermined`.

Potential execution classes:

```text
pure deterministic eval
external-read eval
solver/search
relation/PDP evaluation
agent/probabilistic judgment
```

One semantic form is acceptable only if result algebra, capability isolation, versioning and provenance remain statically obvious. If authors need runtime flags whose illegal combinations are checked by ad-hoc code, split the form.

## Q-META-08 — should query be its own base form?

Current answer: `undetermined`, leaning no.

A query may be a Computation over declarative Relation/Type sets. But query systems require:

- composability/laziness;
- cardinality/set semantics;
- authorization folding;
- pagination/as-of basis;
- optimizer-visible structure.

If opaque Computation prevents these, a declarative Query algebra can be a tool/runtime IR or earn a language form independently.

## Q-META-09 — how is Interface/ShapeContract represented without becoming convention?

Current answer: `undetermined` implementation, `supported` semantic distinction.

Need one contract that can require:

```text
Relations/properties
links
Action signatures
Computation/query signatures
possibly other contracts
```

and be honored consistently by codegen, query, Action polymorphism, agents/tools and migration checks.

If each tool reconstructs conformance differently, Interface needs a stronger first-class form.

## Q-META-10 — how are definitions themselves represented and versioned?

R5 discusses Type/Relation/Computation/Action/RuleBinding definitions, but not the meta-circular representation.

Options include:

- engine-internal immutable definition records;
- ontology definitions themselves as typed objects under a higher meta-schema;
- content-addressed definition graph;
- generated executable IR.

Historical Action/Rule decisions need exact revision identity regardless of authoring representation.

Avoid infinite self-hosting ceremony unless it provides concrete migration/tooling value.

## Q-META-11 — what mutation authority exists below Action?

Working pressure:

- meaningful business mutations use Action semantics;
- bootstrap/schema migration/repair/internal projection maintenance still need mechanisms.

Need classify:

```text
business Action
ontology-definition mutation
admin repair
migration
projection/materialization update
runtime bookkeeping
```

A low-level mutation path cannot become an invariant/policy/Event lifecycle bypass simply because it is “internal”.

## Q-META-12 — how does privacy erasure interact with occurrence immutability?

Create-only business occurrence semantics and legal/privacy erasure can conflict physically.

Need distinguish:

- semantic history/correction;
- redaction/tokenization/crypto-erasure;
- legal deletion;
- immutable digest/receipt retained after content erasure;
- backups/PITR.

Do not conclude “Events can never be deleted physically” from semantic append/correction rules.

## Q-META-13 — can policy and invariant truly share RuleBinding?

The binding dimensions converge, but evaluator/result algebras differ.

Need compare:

```text
system invariant -> pass/fail/error + transaction dependencies
authorization -> permit/deny/error + policy combination/determining evidence
pre/postcondition -> obligated party + old/new state
lifecycle -> mutation-kind decision
```

One RuleBinding form must not force one evaluator algebra. Generic binding to typed evaluator protocols may be enough.

## Q-META-14 — should StateBasis remain Action/Rule metadata or gain definition identity?

Capabilities required by #40:

```text
exact revisions
predicates/absence/ranges
aggregate/set dependencies
pinned snapshots
immutable references
current authorization/current emergency policy
```

A named/reusable StateBasis object may help audit/caching/proposals. Promote only if that gives generic enforcement beyond ordinary dependency metadata.

## Q-META-15 — does a native Effect semantic form become necessary for tooling?

#41 currently favors ordinary typed records + native runtime effect capability.

Attack on:

- typed connector capabilities;
- credential/environment policy;
- request/attempt/observation/outcome correlation;
- protocol-specific idempotency;
- unknown/partial outcomes;
- compensation;
- automatic UI/agent explanation.

If every connector invents a different record protocol and generic enforcement drifts, promote a standard Effect contract before a base sort.

## Q-META-16 — what is the standard domain library boundary?

Concepts such as:

```text
Party
Agreement
Intent
Commitment
Claim
ProcessSpecification
Process
EconomicEvent
Money
Quantity
Address
```

may be highly reusable and centrally maintained without living in the metamodel.

Need composition/versioning/namespace rules (#63) after #70 stabilizes base forms.

## Q-META-17 — can definitions support safe extensions without `Pack` becoming semantic?

Need namespace/module/distribution mechanics for domain libraries, connectors, fiscal/localization and UI surfaces.

`Pack` remains software organization. #63 should define packaging over stable definition IDs/dependencies, not contaminate business ontology.

## Q-META-18 — how should verification metadata attach to definitions?

#46 should eventually let a Type/Relation/Action/RuleBinding/Computation definition carry references to:

```text
candidate law
kill tests
property/backend/model-check evidence
evidence revision/status
known counterexamples
```

This must remain epistemic/tooling metadata, not turn `Proof`/`Scenario` into business primitives.

## Q-META-19 — what evidence is sufficient to update RFC-0001?

Proposed gate:

1. R5 executable kill tests green **and sensitivity mutants red**;
2. #46-style checker proves artifacts/decisions aligned;
3. adversarial self-review finds no hidden recreation of deleted forms;
4. at least one real vertical encoding (order/inventory/manufacturing/accounting) uses the reduced model;
5. no unresolved question changes the *base-form list* rather than only runtime implementation.

If Q-META-01/02/03/05/06/07/09 still materially change the base forms, keep RFC-0001 as hypothesis and publish #70 as a stronger candidate instead of editing it.

## Downstream handoff

### #46 verification

Add #70 reduction sensitivity tests to the cross-ontology verification registry once the artifact is merged. Important mutations:

- remove occurrence lifecycle binding -> historical edit becomes reachable;
- remove Action operation identity -> duplicate retry;
- make Policy Bool -> error/deny collapse;
- scope invariant to one Action -> alternate path bypass;
- consume stale projection as current -> illegal commit;
- force remote ID pre-send -> unsupported protocol rejected.

### #63 composition/modules

Assume semantic definitions are individually addressable/versioned; packaging must not introduce `Pack` as a business primitive.

### storage/runtime implementation

Do not map R5 one-to-one to SQL tables/classes. #39 explicitly separates semantic form from physical representation.

### RFC-0001

Do **not** edit until final #70 review resolves whether R5 is truly converged enough. The RFC was intentionally an attack target and should not churn after every hypothesis.
