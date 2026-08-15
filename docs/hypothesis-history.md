# Hypothesis history — how we arrived here

**Purpose:** preserve the path of reasoning without turning any past idea into doctrine.

This document records the major hypotheses considered during the initial design session. Earlier hypotheses are intentionally kept even when later weakened. The history matters because future evidence may revive an older path.

## H0 — Replace a traditional ERP with a more modern ERP

Initial framing:

```text
Protheus -> ERPNext
```

The motivation was practical: ERPNext appeared to cover a large portion of commercial, inventory, purchasing, accounting, and manufacturing behavior while offering a much more extensible and API-friendly platform.

### What we learned

This framing was too narrow. It treated ERP as the fundamental product and agents/ontology as integrations around it.

However, it established an important research asset: mature ERP systems contain years of encoded operational knowledge and edge cases.

**Current status:** rejected as the top-level product framing; retained as an important source of domain evidence.

---

## H1 — ERP transaction substrate + operational ontology above it

The next architecture was approximately:

```text
sources
   -> operational ontology
   -> governed actions
   -> ERP transactions
```

Candidates such as Open Foundry, Ontologiq, ObjectStack, OpenBKN, Xpert, and Palantir-inspired designs suggested a clear separation between semantic/agentic operation and traditional transaction systems.

### What we learned

This was much closer to the problem. `Objects + Links + Actions + Policy` is becoming a recognizable software category.

But the architecture still assumed the ERP and ontology were two separate semantic authorities. That risks defining Product, Order, Action, permissions, and lifecycle multiple times.

**Current status:** still plausible as an integration architecture for existing companies, but no longer assumed to be the ideal greenfield architecture.

---

## H2 — Agentic Business OS with packs, compiler, and deterministic kernels

We then proposed something like:

```text
Business Definition
    |
    +-- Objects / Links / Actions / Policies
    |
    -> Compiler
    |
    -> Deterministic Kernels
         accounting
         inventory
         manufacturing
         fiscal
    |
    -> Surfaces / Agents / APIs
```

`Packs` were proposed for manufacturing, accounting, Brazil, and other domains. A compiler would generate UI/API/MCP/etc. Deterministic kernels would protect accounting, inventory, costing, MRP, and similar logic from probabilistic agent reasoning.

### Why this hypothesis was useful

It clarified several durable ideas:

- business Actions should be shared by humans and agents;
- UI/API/MCP should derive from the same business semantics;
- deterministic logic must remain deterministic even in an agentic product;
- country/company-specific concepts must not contaminate a generic runtime;
- enterprise domains need composability.

### Why we weakened it

We realized we had promoted implementation mechanisms into domain abstractions before proving them.

- A business does not contain a `ManufacturingPack`; package/module boundaries may be distribution mechanics.
- `Compiler` may be an implementation detail: the engine may interpret, generate, cache, materialize, or compile different parts.
- An `AccountingKernel` below the ontology creates a second business model. Accounting invariants can instead be part of the executable ontology itself.

**Current status:** important intermediate hypothesis. `Pack`, `Compiler`, and `Deterministic Kernel` are no longer assumed to be semantic primitives.

---

## H3 — Modernize ERPNext/Frappe itself into the Business OS

Because Frappe already provides metadata-driven DocTypes, APIs, permissions, UI generation, and ERPNext contains rich enterprise behavior, we considered making it the core and adding:

```text
first-class links
first-class actions
agent/service identities
action policies
provenance
temporal semantics
agent tooling
```

### What we learned

The thought experiment was highly valuable: if ERPNext were written today, UI would likely be only one surface and business verbs would likely be more fundamental than generic CRUD.

But choosing Frappe as foundation would prematurely inherit its schema, storage assumptions, lifecycle semantics, and application-era abstractions.

**Current status:** rejected as an assumed greenfield foundation. ERPNext is promoted to a primary research corpus.

---

## H4 — Build the executable ontology itself as the primary system

The current thesis emerged by removing assumptions from H1-H3.

Instead of:

```text
ontology -> ERP
```

or:

```text
ontology -> specialized business kernels
```

we ask whether the business logic normally buried inside ERP modules can itself live in one executable ontology:

```text
Objects / kinds / roles
Relationships
Actions
Events / facts
Functions
Constraints
Policies
Time
Provenance
```

Accounting, inventory, manufacturing, commerce, logistics, and fiscal behavior would then be domain definitions executed by a generic ontology engine.

ERP becomes a family of operational surfaces and conventions over this model rather than the root abstraction.

### Why this became plausible now

Our optimization target changed.

The previous instinct was to minimize new software by assembling existing platforms. With strong AI systems, implementation and analysis costs can fall enough that we can instead optimize for:

- semantic correctness;
- orthogonality;
- explainability;
- formal enforcement;
- evolvability;
- agent-native operation;
- ability to synthesize decades of enterprise knowledge from existing systems.

We can use agents to read implementations, documentation, tests, issues, standards, and real scenarios at scales that were previously impractical.

**Current status:** leading research hypothesis, not a frozen decision.

---

## H5 — ERP implementations as an empirical corpus for discovering domain laws

This is a methodological hypothesis more than an architecture.

ERPNext, Odoo, Moqui/Mantle, and other mature systems should be mined for:

```text
concepts
relationships
states
transitions
actions
invariants
failure modes
historical fixes
edge cases
```

Then compared against independent traditions:

```text
REA / ValueFlows
Palantir operational ontology
OntoUML / UFO
GS1 EPCIS
ISA-95
FIBO
W3C PROV
formal temporal models
```

If multiple independent systems converge on the same distinction, confidence increases that it reflects the real domain rather than one product's schema.

If they disagree, we investigate why.

**Current status:** strongly favored research method.

---

## Important unresolved hypotheses from the session

The following ideas are explicitly preserved for testing rather than adoption:

- `Action` is likely more fundamental for mutation than generic CRUD.
- `Action` and `Event` should probably remain distinct: intent/intervention is not occurrence.
- current state may often be a projection over durable facts/events rather than the primary truth;
- valid time and system/knowledge time may need native representation;
- provenance may need to be first-class rather than log metadata;
- `Supplier`, `Customer`, `Employee`, etc. may often be roles played by more fundamental entities rather than fundamental entity kinds themselves;
- some relationships with attributes/lifecycle may be real relational entities (`Relator`-like) rather than links;
- an `Agent` may not require a special ontology primitive if it can implement capabilities such as `Actor` and `Principal`;
- a constraint/invariant may be a specialized function rather than its own base primitive;
- policy may be expressible as logic but still require native enforcement semantics;
- `Fact` may be the more fundamental information unit than a mutable row/object snapshot;
- storage layout, generated code, modules/packages, and compiler architecture should not determine domain semantics;
- ontology revisions may need to be pinned to actions and historical decisions for reproducibility;
- AGI may make continuous ontology discovery, semantic fuzzing, migration synthesis, and self-audit practical.

None of these items is a definition of OS yet.
