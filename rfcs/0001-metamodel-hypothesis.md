# RFC-0001 — Metamodel hypothesis v0

**Status:** hypothesis  
**Decision:** none  
**Purpose:** provide a concrete model to attack, not a model to implement unchanged.

## Context

OS needs a small semantic core capable of representing real organizations and their operations without inheriting one ERP schema or one ontology platform's assumptions.

We do not yet know the correct primitives.

This RFC intentionally proposes a candidate set so research can falsify it.

## Candidate semantic forms

The current candidate vocabulary is:

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

Several may collapse into others. Several missing concepts may prove necessary.

### Type / ObjectType

Candidate meaning: a category of identifiable things or concepts.

Open questions:

- Should events be ordinary typed objects implementing an `Event` interface?
- Should roles and phases be represented as types, interfaces, relations, or native ontological categories?
- Does every operationally meaningful thing need stable identity?
- Do value objects need a separate category or can typed properties cover them?

### Interface

Candidate meaning: a contract/capability shared by otherwise different types.

Possible uses:

```text
Principal
Actor
Locatable
Priceable
InventoryResource
Fulfillable
```

Open questions:

- Is interface enough to represent roles?
- Does an interface contain properties only, or also relationships/actions/functions?
- Can interfaces compose safely without multiple-inheritance ambiguity?

### Property

Candidate meaning: a typed characteristic.

Open questions:

- How are units, currency, uncertainty, intervals, and validity represented?
- Are derived properties merely zero-argument functions?
- Are historical property values facts, versions, or event consequences?

### Relationship / Link

Candidate meaning: a typed relation between identifiable things when the relation does not itself require independent lifecycle/identity.

Hypothesis to test:

> If a relationship has meaningful attributes, lifecycle, authority, or actions of its own, it may be better represented by a relational entity/relator rather than an enriched edge.

Example:

```text
Person --employedBy--> Organization
```

may be insufficient when employment has start/end dates, compensation, position, suspension, termination, etc. Then:

```text
Person -> Employment -> Organization
```

may better reflect the domain.

Open questions:

- Should `Relator` be a native category?
- Is an object-backed link simply an object plus two constrained relationships?
- How should cardinality and exclusivity be enforced?

### Action

Candidate meaning: an explicit attempted intervention or business decision.

Working hypothesis:

- meaningful mutations are addressed through actions;
- actions have typed inputs;
- actions can have preconditions/constraints/policies;
- humans, agents, automations, and APIs can invoke the same action semantics;
- an action invocation does not prove its intended real-world result occurred.

Open questions:

- Do all mutations require named actions?
- Is there a generic low-level action family for administrative/model operations?
- How should preview, approval, revalidation, commit, and external effects relate to the core Action concept?
- Is an action definition immutable under an ontology revision?

### Function

Candidate meaning: typed computation over ontology values/state with no direct mutation.

Possible properties:

- deterministic or explicitly nondeterministic;
- pure or dependent on declared external inputs;
- versioned;
- reusable in properties, constraints, policies, actions, queries, and optimization.

Open questions:

- Should optimization/planning models be Functions?
- How are probabilistic functions represented?
- Can agent reasoning itself appear as a typed function with explicit uncertainty/provenance, or should it remain outside deterministic semantics?

### Constraint

Candidate meaning: a condition that some operation/state is not allowed to violate.

Hypothesis to test:

```text
Constraint = Function<Context, Bool> + enforcement semantics
```

If that composition is sufficient, Constraint may not need to be a separate base primitive.

Open questions:

- at what phases can constraints be evaluated?
- are database cardinality, accounting balance, and state-machine legality the same semantic category?
- how are cross-object and temporal constraints expressed?

### Policy

Candidate meaning: authority decision over a principal/action/resource/context.

Hypothesis to test:

Policy might be expressible as a function but require native fail-closed enforcement points.

Open questions:

- relationship-based authorization versus contextual policy;
- delegation by task/session/purpose;
- agent acting `as` versus `on behalf of` a human;
- whether policy history must be reconstructable for historical decisions.

### Event / Event-nature

Candidate meaning: an occurrence, not an attempted intervention.

Working hypothesis:

```text
Action != Event
```

An action may result in zero, one, or many events. Events may also originate externally without an OS action.

Open questions:

- Is `Event` a primitive or `Type implements Event`?
- Are events immutable?
- Is correction represented by superseding facts/events rather than mutation?
- How do REA EconomicEvent, EPCIS events, audit events, and domain events differ?

### Fact

Candidate meaning: a temporally and provenance-aware assertion about the modeled world.

Possible shape, intentionally incomplete:

```text
subject
predicate
value | object
valid time
provenance
```

The engine may add system/knowledge time and ontology revision.

This is highly speculative.

Open questions:

- Is Fact the fundamental information model or merely one representation?
- Are object snapshots collections of facts?
- Are relationships facts?
- Are events objects that generate facts, or facts themselves?
- How are contradictory facts represented?
- What separates observation, assertion, accepted fact, and derived fact?

## Candidate cross-cutting semantics

These may be fundamental without being first-class language nodes.

### Identity

The same real-world thing must remain addressable across time and sources.

Questions:

- natural versus surrogate identity;
- identity reconciliation across systems;
- identity of roles/relators/events;
- merge/split/correction semantics.

### Time

Candidate dimensions:

```text
valid time
system / knowledge time
```

Questions:

- must every fact carry both?
- can events use point/interval time while enduring objects use validity intervals?
- how do backdated corrections affect projections and actions?

### Provenance

Candidate concerns:

```text
source
actor
activity
derivation
evidence
confidence / uncertainty
```

W3C PROV-O is a research reference. We have not chosen its vocabulary as OS vocabulary.

### Ontology revision

Working hypothesis: historical actions and decisions may need to pin the exact ontology/policy/function definitions under which they ran.

Questions:

- content-addressed revision versus version number;
- compatibility rules;
- migration semantics;
- replay under historical versus current ontology.

## Concepts intentionally NOT proposed as semantic primitives

The following appeared in earlier hypotheses but are deliberately excluded from the current primitive list until evidence requires them:

### Pack

May be a useful distribution/module construct, but a business does not contain a `ManufacturingPack` as a real-world entity.

### Compiler

Generation/compilation may be an engine/toolchain implementation technique, not domain semantics.

### Deterministic Kernel

Accounting, inventory, MRP, etc. contain deterministic logic, but that logic may be expressible as Functions, Constraints, Actions, and Facts inside the same ontology.

### Agent

An AI agent may be representable as an object implementing interfaces/capabilities such as `Actor`, `Principal`, and `SoftwareAgent` rather than requiring a unique base primitive.

### View / UI / MCP Tool / API

These are currently treated as surfaces over ontology semantics, not the source of those semantics.

### Workflow

A workflow may turn out to be composition/orchestration of actions/events/conditions rather than a base ontology primitive. This must be tested against long-running enterprise processes.

## Falsification targets

This hypothesis should be challenged by at least the following questions:

1. Can the model represent order-to-cash without source-system-shaped exceptions?
2. Can it distinguish requested, committed, planned, and actual flows cleanly?
3. Can it model inventory ownership, custody, reservation, lot identity, and movement without conflating them?
4. Can manufacturing distinguish specification, plan/authorization, operation, resource capability, and actual execution?
5. Can accounting invariants live in the same model without a hidden second business engine?
6. Can a human and an agent invoke the same business operation without weakening policy?
7. Can an external timeout remain explicitly unknown and later reconcile?
8. Can historical state be queried both as valid then and as known then?
9. Can provenance affect authority without being an ad-hoc side channel?
10. Can roles and relational entities be expressed without multiplying special primitives?
11. Can ontology evolution preserve historical explainability?
12. Can domain-specific extensions be added without changing the generic engine?

Failure on these questions is expected and useful.

## Explicit non-decisions

This RFC does not choose syntax, programming language, storage engine, graph model, query language, transaction protocol, event store, policy engine, UI framework, agent framework, or deployment architecture.
