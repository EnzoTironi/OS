# Thesis — executable ontology for organizations

**Status:** working thesis, not a specification.

## The question

If enterprise software were designed today with modern AI agents, abundant software-generation capacity, mature operational systems to learn from, and no legacy architecture to preserve, would we still build an ERP as a collection of modules and forms around mutable records?

Our current answer is: **probably not**.

The stronger hypothesis is that the primary artifact should be an **executable ontology of the organization**. ERP-like applications would then be one family of surfaces and operational behaviors over that ontology rather than the fundamental abstraction.

## What we currently mean by executable ontology

A single model should be able to express, in some form still under investigation:

- things and concepts with identity;
- typed properties and relationships;
- roles, phases, and relationship-entities when the domain requires them;
- actions that actors may attempt;
- events or facts about what actually happened;
- deterministic business functions;
- constraints and invariants;
- authority and policy;
- temporal history and provenance;
- current state as an explainable consequence of the model's history;
- human, agent, automation, and system interaction through the same business semantics.

This list is **not** a commitment that each bullet deserves a distinct primitive.

## One model, many surfaces

The same business operation should not need a separate semantic implementation for every interface.

A human button, an API call, an automation, and an AI tool should all be able to address the same underlying operation when policy allows it.

Conceptually:

```text
Human UI -----\
Agent tool ----+--> Business Action
Automation ----+
API -----------/
```

UI, REST, GraphQL, MCP, mobile, chat, voice, dashboards, and future interaction modes are therefore candidates for **surfaces**, not sources of business meaning.

## Action is not event

One of the strongest distinctions so far is between an attempted intervention and an observed occurrence.

```text
Action: ShipOrder(order)

may lead to

Event: ShipmentCreated
Event: InventoryMoved
Event: CarrierPickupAccepted
```

An action can fail, be denied, become stale, or produce an external outcome that is temporarily unknown. Treating "requested" and "happened" as the same thing creates serious ambiguity for agents and integrations.

This distinction is reinforced by operational systems and by economic/event models such as REA/ValueFlows.

## Determinism belongs inside the business model

Earlier discussion introduced the phrase "deterministic kernels" for accounting, inventory, MRP, costing, and similar domains. We no longer think a separate conceptual layer is necessary.

The requirement we were trying to protect remains important: an AI model must not improvise accounting equality, stock valuation, BOM explosion, or other hard invariants.

But those can be expressed as deterministic functions, constraints, and actions **inside the same executable ontology**.

For example:

```text
Function DebitTotal(entry)
Function CreditTotal(entry)
Constraint BalancedJournal:
    DebitTotal(entry) == CreditTotal(entry)
Action PostJournalEntry(entry)
```

"Deterministic" is a property of logic and enforcement, not necessarily a separate architecture.

## Mature ERPs are evidence, not foundations by default

ERPNext is especially valuable because many years of production use have forced it to encode distinctions such as:

- BOM versus work order versus actual job execution;
- source, WIP, and target inventory locations;
- stock movements and stock ledger entries;
- submitted transactions versus cancellations and reversals;
- purchase order versus receipt versus invoice versus payment;
- lots, serial numbers, reservations, subcontracting, scrap, rework, and partial fulfillment.

We should not mechanically map ERPNext DocTypes into ontology types. We should ask why each concept exists, which edge cases forced it to exist, and whether independent systems such as Odoo, Moqui, SAP/Dynamics documentation, REA/ValueFlows, GS1 EPCIS, ISA-95, or formal ontologies converge on the same distinction.

Convergence is evidence that a distinction may belong to the domain. Divergence is a research question.

## AGI changes the optimization target

The project does **not** assume that minimizing new code is the goal.

Historically, enterprise systems were shaped by the high cost of understanding domains, implementing software, maintaining variants, migrating schemas, testing edge cases, and documenting behavior. Strong AI systems reduce several of those costs dramatically.

That enables a different strategy:

1. mine mature software, standards, issues, tests, and documentation at scale;
2. extract domain laws, distinctions, and failure modes;
3. synthesize candidate ontologies;
4. generate adversarial scenarios and counterexamples;
5. test and revise the ontology continuously;
6. generate or maintain large amounts of runtime/tooling code around a deliberately small semantic core.

A large implementation is acceptable if it protects a cleaner model.

## Current state should be explainable

We are investigating whether much operational state should be understood as an efficient projection over durable facts/events rather than as arbitrary mutable fields.

This does not imply pure event sourcing. It implies a stronger requirement:

> The system should be able to explain why the world currently appears as it does.

For important business state, we want to be able to reconstruct the relevant causal chain, including actor, action, facts/events, policy, ontology revision, and provenance.

## Time and provenance are first-class research topics

We suspect enterprise truth needs at least two temporal questions:

- when was something valid in the modeled world?;
- when did the system know or record it?

We also need to distinguish source, derivation, actor, activity, evidence, and observation. Bitemporal databases and W3C PROV-O are important references, but we have not selected an implementation or final representation.

## What OS may become

If the thesis survives research, "ERP" becomes a view over a more general operational system:

```text
Executable Ontology
        |
        +--> commerce
        +--> inventory
        +--> manufacturing
        +--> accounting
        +--> logistics
        +--> fiscal
        +--> CRM
        +--> HR
        |
        +--> humans
        +--> agents
        +--> automations
        +--> external systems
```

The engine should remain generic. Domain-specific behavior should be represented in the model rather than hard-coded into the engine.

## What is explicitly not decided

We have **not** decided:

- the final set of ontology primitives;
- whether `Event` is a primitive, a type, or an interface;
- whether `Fact` is the fundamental storage/semantic unit;
- whether roles/phases/relators require native support;
- whether links with lifecycle become objects, relators, or another construct;
- whether policy is its own primitive or a constrained function form;
- how functions are authored or executed;
- whether current state is always derivable;
- whether the system uses event sourcing;
- the physical database or query engine;
- whether the language is declarative, code-first, hybrid, or generated;
- whether a compiler exists as a visible concept;
- whether modules/packages/packs have any semantic meaning;
- the implementation language;
- the distributed-systems architecture.

These are research questions.
