# Reference landscape — ideas to steal, assumptions to attack

**Status:** research snapshot, 2026-08-15.  
**Decision:** none.  
**Purpose:** preserve what we learned from nearby systems without turning any of them into a foundation by default.

OS emerged partly because several independent projects are converging on the idea that enterprise software should expose business meaning and business operations directly to humans and agents. This document records the strongest lessons from that landscape.

It is not a vendor comparison and not a dependency shortlist.

## Palantir Ontology

Palantir remains the clearest mature reference for an **operational ontology** rather than a passive knowledge graph.

Important ideas to study:

- Object Types, Properties, Link Types, Interfaces, Actions, Functions, security;
- ontology as a shared language for data, logic, actions, and users;
- Actions as explicit business mutations rather than generic record editing;
- Interfaces for shared capabilities across otherwise different types;
- object-backed links when a relationship itself carries meaningful data/lifecycle;
- Object Sets and ontology-aware querying;
- domain modeling guidance that starts from real-world concepts rather than mirroring source schemas.

Questions for OS:

- Which Palantir primitives are fundamental and which are pragmatic product abstractions?
- Can OS obtain stronger temporal, causal, relational, and formal semantics without losing operational usability?
- Should cardinality, invariants, and action consequences be more strongly enforceable than in a general-purpose ontology product?

## Open Foundry

Open Foundry is one of the strongest open-source attempts at a Palantir-like operational ontology.

Relevant ideas:

- a single definition language for Object Types, Link Types, Actions, and Permissions;
- object sets, history, lineage, GraphQL/REST surfaces, and relationship-aware authorization;
- domain examples including supply chain;
- governed actions instead of treating arbitrary CRUD as the primary mutation model.

Important warning from code inspection:

- local mutations and external side effects are not one atomic reality; the current executor can commit local effects and then attempt external side effects, with best-effort compensation in some failure modes;
- a dry-run path inspected during research did not provide the full semantics we would want from a true preview/commit protocol.

Lesson:

> `Objects + Links + Actions + Permissions` is increasingly commodity. Correct semantics around authority, stale decisions, external effects, and historical explanation may be harder.

## Ontologiq

Ontologiq is very young, but several design choices are unusually aligned with safe agentic operation.

Relevant ideas:

- stable object identity plus computed/live state, relations, and governed actions;
- durable proposals for sensitive actions;
- human approval separate from the agent;
- rechecking preconditions after approval, before execution;
- hashing/binding approved arguments;
- distinguishing an external outcome that is `unknown` from a known failure.

Limitations observed during research:

- very early maturity;
- state is currently much closer to a view over source data than to a general multi-source truth model;
- entity resolution and richer cross-source authority semantics are not yet the center of the design.

Lesson:

> Approval should not authorize a stale world. `propose -> approve -> re-read/revalidate -> execute` is a serious candidate semantic pattern.

## ObjectStack

ObjectStack is a modern metadata-driven application/OS project and one of the closest references to the thesis that business semantics should generate many interaction surfaces.

Relevant ideas:

- metadata for objects, fields, actions, flows, permissions, views, agents, tools, and MCP;
- a single business Action can serve human UI and AI tooling;
- AI exposure is explicit/opt-in;
- generated APIs/UI/tooling from shared metadata;
- explicit runtime identity and automation attribution.

Important warning from its current documented execution model:

- some script/body Actions are treated as trusted application code after invocation authorization; their internal data access can have broader authority than the caller's row-level context;
- this is a useful reminder that "same Action for humans and agents" is only safe if execution semantics preserve the intended authority boundary all the way through the effect.

Lesson:

> The Action should be the reusable business operation. UI button, API operation, automation, and agent tool should not each reimplement the business verb.

## OpenBKN

OpenBKN explores a business knowledge network plus governed agent execution.

Relevant ideas:

```text
Object -> Action -> Rule -> Constraint / Risk
```

and explicit evidence/provenance from intent toward source, mapping, rule, and invocation.

It also explores object/action-level permissions, simulation/risk checks, SDK/CLI/MCP surfaces, and audit.

Questions:

- how much of its evidence graph is descriptive versus authoritative;
- whether its model can represent competing claims and accepted operational truth cleanly;
- which components are appropriate for reuse given its mixed licensing model.

Lesson:

> Risk and evidence belong close to executable business operations, not only in an observability layer after execution.

## Xpert / Data Xpert / UOSE direction

Xpert is a comparatively mature agent/workflow platform with enterprise data, tools, MCP, approvals, workbenches, and audit.

Relevant ideas:

- hybrid agent + deterministic workflow execution;
- typed tools and semantic business objects;
- human-reviewable workbenches;
- policy/approval boundaries around business actions;
- plugins and reusable Skills/MCP integrations.

The more ontology-like UOSE direction is interesting but should not be treated as fully validated until its implementation is traced more deeply than marketing terminology.

Lesson:

> Agent reasoning and deterministic process execution can coexist; neither has to pretend to be the other.

## Moqui / Mantle

Moqui is an older but important reference because it independently converged on a service-oriented enterprise architecture.

Relevant ideas:

```text
Entity
Service
Screen
```

Writes are naturally modeled through Services, which gives the design a verb/noun shape closer to business Actions than unrestricted table mutation.

Mantle adds reusable enterprise/business artifacts.

Questions:

- which Entity/Service distinctions encode real domain knowledge;
- which are artifacts of a pre-agent application framework;
- whether service-oriented business verbs offer edge cases not obvious in newer ontology projects.

Lesson:

> Mature service-oriented ERP frameworks are valuable evidence that business mutations deserve named, governed operations.

## REA / ValueFlows / hREA

REA and ValueFlows provide an independent conceptual tradition that starts from economic reality rather than ERP documents.

Especially valuable distinctions include:

```text
Intent
Commitment
EconomicEvent
Claim
Agreement
Process
EconomicResource
Agent
```

This helps distinguish, for example:

```text
customer requested date
company promised date
production planned date
actual delivery date
```

instead of forcing all four concepts into one `delivery_date` field.

hREA demonstrates that much of this model can be implemented as an operational coordination system, but its Holochain architecture is not assumed to be appropriate for OS.

Lesson:

> Planned, promised, claimed, and observed reality are different ontological categories even when traditional ERP screens collapse them together.

## ERPNext

ERPNext is not currently a presumed foundation. It is one of the primary **empirical corpora** for OS research.

The value is in the accumulated domain decisions forced by production use:

- Sales Order vs Delivery vs Invoice vs Payment;
- BOM vs Work Order vs Operation vs Job Card;
- source/WIP/target warehouses;
- stock ledger semantics;
- lots, serials, reservations, subcontracting, scrap, rework;
- immutable/reversal-oriented ledger behavior;
- partial fulfillment and cancellation constraints;
- accounting consequences of operational events.

Research question:

> Why does each concept exist, and which real-world invariant or failure mode forced it into existence?

The answer matters more than the Python implementation.

## Odoo

Odoo is a second large operational corpus with independent design history.

Its value is comparative. When ERPNext and Odoo independently distinguish similar things — e.g. BoM, manufacturing order, work orders, lots/serials, stock moves, routings, partial fulfillment — the convergence is stronger evidence that the distinction belongs to the domain rather than one schema.

Divergence is equally useful: it produces a research question rather than a winner.

## Formal and industry references

Several standards/ontologies should act as independent adversaries to ERP-derived assumptions:

- **OntoUML / UFO** — kinds, roles, phases, events, relators and ontological rigor;
- **W3C PROV-O** — Entity / Activity / Agent provenance and derivation;
- **GS1 EPCIS** — supply-chain visibility and transformation events;
- **ISA-95 / IEC 62264** — enterprise/manufacturing concepts and boundaries;
- **FIBO** — financial-domain ontology;
- **SQL temporal / bitemporal systems such as XTDB** — valid-time versus knowledge/system-time semantics.

These are not automatically OS vocabulary. They are evidence and counterexamples.

## What is *not* a substitute for an operational ontology by itself

Knowledge graphs, graph databases, semantic search, RAG memory, vector stores, RDF/OWL engines, and temporal databases may be excellent infrastructure, but they do not automatically provide:

```text
business identity
+ executable actions
+ authority
+ invariants
+ real-world effects
+ reconciliation
```

Examples such as Graphiti, TypeDB, RDF stacks, or generic graph infrastructure should therefore be evaluated for the primitive they provide, not mistaken for the whole OS thesis.

## Current meta-lesson

The landscape increasingly suggests three things:

1. **representation is not enough** — the business model must contain verbs;
2. **verbs are not enough** — attempted intervention must remain distinct from observed outcome;
3. **agent access is not enough** — authority, evidence, temporal assumptions, and external uncertainty need explicit semantics.

OS should keep mining these projects, but none is currently treated as the canonical architecture.