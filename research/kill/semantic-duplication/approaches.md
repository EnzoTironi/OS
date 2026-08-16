# Four placements of state

**Kind.** explanation
**Fetched.** 2026-08-16
**Decision.** per approach. Never `accepted`.

This file compares the four placements issue 72 named. It is not a shopping list. It says what each placement duplicates.

## What "duplication" means here

Two different costs get collapsed into one complaint.

**Model duplication.** A second vocabulary for the same grain. Mappings, table maps, CVI link tables, GraphQL `@shareable`, SPARQL `SERVICE` endpoints.

**State duplication.** A second row that can drift. Dual-write copies, Funnel indexes, SAP Customer next to Business Partner, a paused map, a user-edit overlay that ignores the next ERP write.

A virtual ontology always pays the first cost. A materialized ontology pays both. Replacement pays a migration cost once, then deletes the first store for that grain. Hybrid pays both costs on the grains you copy and only the first cost on the grains you virtualize.

The ontology benefit in `docs/thesis.md` is one Action for human, agent, API, and automation. That benefit does not require a second row. It requires a typed operation that either owns the grain or delegates to the owner.

## Virtual or federated

**Decision state.** `supported` as the default for foreign systems of record.

Dataverse virtual tables, F&O virtual entities, Salesforce External Objects, SPARQL `SERVICE`, and Palantir virtual tables (as pointers, not as indexed objects) all keep the row in the source.

What they remove. The second row. The merge rule. The pause window. The Postprocessing Office for that grain.

What they add. A mapping. A capability tax (E-007). Dual governance (E-008, E-017). Network latency. A write path that must invoke source logic (E-008) or refuse the write.

What they do not do. They do not make OS the system of record. They do not survive source downtime as a writer. They do not give you offline (E-007, E-014).

Palantir's warning matters. A virtual table is a pointer. An ontology object backed by that table is stored again (E-002). Calling the placement "virtual" while indexing objects is materialization with extra steps.

## Materialized ontology

**Decision state.** `rejected` as the default. `hypothesis` as a named, stale-tolerant projection.

Palantir Funnel and Microsoft dual-write are the mature forms.

What they promise. One object graph, search, offline, calculated columns, a place for user edits.

What they actually add. A second writer. A merge rule that picks a loser (E-004). A webhook or plug-in that is not 2PC (E-003, E-011). A bypass path (E-012). Schema pollution of the other model (E-010). An office that reprocesses drift (E-016).

Default Palantir merge is the honest one. User edits win, and later source updates to those properties are ignored. That is convenient for a workshop app. It is a lie about the ERP. Recency merge is not better for fiscal or bank facts. A SEFAZ authorization at 09:00 is not weaker than an ontology edit at 09:05.

Issue 60 already rejected a standing winner table. This folder agrees. A materialized current object must not be the only remaining evidence.

## Source-of-truth replacement

**Decision state.** `supported` only when OS is the only writer and has legal capacity. `rejected` as a global cutover while issue 72's systems remain.

Replacement is the only placement that removes both model and state duplication for a grain. Users stop typing in the old screen. The old API closes or becomes a read replica of OS. Bypass is a defect.

That is how a greenfield company can use an ERP as SoR today. It is not how a company with SEFAZ, a bank, a marketplace, and a shop-floor historian works. Those writers will not close because OS shipped an Object Type.

Replacement of an internal CRM note, an OS-native policy, or a commitment that never existed outside OS is ordinary. Replacement of NF-e, a bank posting, or a marketplace order is not available.

## Hybrid

**Decision state.** `hypothesis` as the only surviving architecture. `supported` that every mature vendor already does some hybrid.

Microsoft sells dual-write and virtual tables in the same training unit and says pick by ownership (E-014). Palantir sells virtual tables and dataset sync on the same page and says pick per workflow (E-002). SAP made Business Partner the entry point and kept Customer and Vendor because documents still point at them (E-015).

Hybrid is where the complexity lives. The complexity is not a reason to copy everything. It is a reason to refuse most copies.

The smallest hybrid that still has an ontology benefit:

```text
own     OS-native Actions, policies, and grains with no foreign writer
virtual foreign SoR rows and the Actions that must run their logic
project stale-tolerant search or joins with valid time and knowledge time
refuse  legally issued identities and grains that would collapse
```

If that hybrid still needs a general MDM bus, a 2PC coordinator, and a Postprocessing Office to stay correct, the ontology benefit has lost. Say so and stop. That loss is `supported` for blanket materialization. It is `undetermined` for refuse-by-default.

## Net duplication

| Placement | Models after adoption | Independently writable rows | Typical failure |
| --- | --- | --- | --- |
| Virtual or federated | source + mapping | one | capability tax, source down |
| Materialized ontology | source + mapping + ontology | two or more | stale replica, silent loser |
| SoR replacement | ontology only, for that grain | one | illegal or operationally impossible |
| Hybrid | per grain | per grain | wrong grain gets copied |

Issue 72 asked whether a new ontology engine creates more semantic duplication than it removes. For the materialized default, yes. For replacement of a grain OS can own, no. For virtualize-and-refuse, it adds mappings and does not add rows. That mapping cost is real. It is the price of not lying about who owns the fact.
