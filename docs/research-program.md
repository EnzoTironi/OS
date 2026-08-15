# Research program v0

**Status:** initial research plan. The scope and corpus are expected to change.

The first job of OS is not to implement an engine. It is to discover which semantic distinctions are robust enough to deserve an engine.

## Research objective

For each enterprise domain, infer a candidate executable ontology from multiple independent sources, then attack it with real and generated counterexamples.

The initial domains are:

1. order-to-cash;
2. procure-to-pay;
3. inventory;
4. manufacturing.

Accounting will be studied immediately where it is causally coupled to those flows, even before it becomes a standalone track.

## Reference families

### Operational systems

- ERPNext / Frappe;
- Odoo;
- Moqui / Mantle;
- Apache OFBiz and Tryton where useful;
- public SAP / Dynamics documentation when it clarifies mature enterprise patterns.

### Operational ontology / application models

- Palantir Ontology;
- Open Foundry;
- ObjectStack;
- Ontologiq;
- OpenBKN and related agentic business runtimes where they expose relevant primitives.

### Formal and industry models

- REA and ValueFlows;
- OntoUML / UFO;
- W3C PROV-O;
- GS1 EPCIS;
- ISA-95 / IEC 62264;
- FIBO;
- temporal database and SQL temporal models.

This list is not an endorsement or dependency list.

## Unit of research: the domain question

Research should not start from a class or table name. It should start from questions such as:

- What real-world distinction does a Work Order encode that a Production Plan does not?
- Is Supplier a kind of organization or a role in a relationship?
- What makes a stock balance trustworthy?
- Is a reservation a property, a relationship, a commitment, or an event-derived state?
- What is the difference between a requested date, promised date, planned date, and actual date?
- What must be true before a journal entry can be posted?
- What does a cancellation mean after irreversible downstream events have happened?

A source implementation is then used to collect evidence for possible answers.

## Evidence extraction loop

For each candidate concept:

```text
1. Identify the real-world question.
2. Inspect multiple systems/standards.
3. Extract concepts and behavior.
4. Extract invariants and failure modes.
5. Inspect historical fixes/tests/issues where available.
6. Record disagreements between references.
7. Propose the smallest semantic distinction that explains the evidence.
8. Generate counterexamples.
9. Revise or reject the candidate.
```

## What to extract from mature codebases

Agents should not merely summarize source files. They should look for evidence encoded in:

- entity/schema definitions;
- controllers/services;
- state transitions;
- validation rules;
- transaction boundaries;
- tests;
- migrations;
- issue history;
- bug fixes;
- comments explaining exceptions;
- reconciliation and cancellation logic;
- permissions;
- reporting queries that reveal derived state;
- integration boundaries.

The output should explain *why a concept or invariant exists*.

## Semantic convergence matrix

For important concepts, maintain a matrix similar to:

```text
Concept/Distinction      ERPNext  Odoo  Moqui  REA/VF  Standard  Notes
-----------------------------------------------------------------------
Plan vs execution           ✓      ✓      ?      ✓        ✓      ...
Lot identity                ✓      ✓      ✓      -        ✓      ...
Supplier as role            ?      ?      ?      ✓        ?      ...
Immutable stock movement    ✓      ✓      ?      ✓        ✓      ...
```

The goal is not feature comparison. It is evidence of semantic convergence or divergence.

## Semantic fuzzing

Every candidate model should be subjected to generated scenarios that vary:

- quantities;
- dates and backdating;
- partial fulfillment;
- cancellation timing;
- duplicate messages/events;
- reordering;
- multiple currencies;
- ownership/custody differences;
- substitutions;
- lot/serial identity;
- scrap and rework;
- subcontracting;
- over/under delivery;
- concurrent decisions;
- stale approvals;
- offline/external failures;
- contradictory observations;
- late corrections;
- schema/ontology revisions.

A model that requires unexplained special-case fields or hidden procedural conventions should be treated as under-specified.

## Research artifacts

Research should produce small, reviewable artifacts rather than giant prose dumps:

- evidence notes;
- concept cards;
- invariant cards;
- scenario cards;
- disagreement notes;
- candidate model fragments;
- counterexamples;
- RFC updates.

See [`../research/README.md`](../research/README.md).

## Initial domain questions

### Order-to-cash

Investigate at least:

- customer/organization/party versus role;
- quote, intent, order, agreement, commitment;
- order line identity and lifecycle;
- pricing versus price agreement;
- requested/promised/planned/actual dates;
- allocation and reservation;
- fulfillment, shipment, delivery;
- invoice, receivable/claim, payment, settlement;
- cancellation and return semantics;
- partial fulfillment.

### Procure-to-pay

Investigate at least:

- supplier as role or kind;
- request, requisition, RFQ, offer/quotation;
- purchase order as document, agreement, or set of commitments;
- receipt versus ownership transfer;
- three-way matching;
- payable/claim creation;
- partial receipts and invoices;
- returns;
- supplier substitutions;
- landed cost and valuation consequences.

### Inventory

Investigate at least:

- item/product/resource/specification distinctions;
- location, warehouse, bin, custody, ownership;
- stock movement as event/fact;
- current quantity as fact versus projection;
- reservation/allocation;
- lot, batch, serial and identity;
- transfer;
- adjustment and reconciliation;
- negative stock;
- valuation layers;
- backdated movements;
- transformation inputs/outputs.

### Manufacturing

Investigate at least:

- product/resource specification;
- BOM versus process specification/recipe;
- operation and capability;
- workstation/work center/machine/resource;
- production intent/plan/order/authorization;
- actual execution/job/activity;
- material issue/consumption;
- WIP;
- output production;
- scrap, by-products, co-products;
- rework;
- subcontracting;
- routing and dependencies;
- capacity;
- quality inspection and release;
- version/effectivity of specifications.

## Research agents

Because the project assumes strong AI capability, we should design explicit research roles. Candidate roles include:

- **Archaeologist:** reconstruct why a mature system models something the way it does.
- **Comparativist:** compare the same domain distinction across independent systems.
- **Ontologist:** propose the smallest model explaining the evidence.
- **Adversary:** generate counterexamples and edge cases.
- **Historian:** inspect bugs/migrations to discover previously violated assumptions.
- **Formalizer:** turn prose distinctions into candidate invariants and executable scenarios.
- **Licensing reviewer:** ensure research output stays on the conceptual/behavioral side unless reuse is explicitly approved.

These roles are a research workflow, not OS runtime primitives.

## Exit criteria for implementation

We should not wait for a complete enterprise ontology before coding anything. But an engine feature should be justified by a stable-enough need.

A candidate primitive is ready for experimental implementation when:

- multiple domain scenarios require it;
- alternatives were documented;
- counterexamples were attempted;
- its enforcement semantics are understood;
- we can state what would falsify the design;
- it does not merely encode one source system's schema.

Experimental implementation still does not make the primitive permanent.
