# Wave A contract. Issue 59

**Track:** kill  
**Issue:** https://github.com/EnzoTironi/OS/issues/59  
**Open questions:** Q2, Q6, Q7 remain open as architecture. This folder rejects only the "everywhere" reading.  
**Decision state:** over-generalized Fact and pervasive bitemporality are `rejected`. Remnants are placed per [`domain-map.md`](domain-map.md).  
**Retrieved:** 2026-08-16  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This file is the single-page contract. The other files in this folder are the queryable cards.

## 1. Question

Are Fact-oriented and bitemporal semantics over-generalized? Where are they unnecessary or harmful? Where does their absence make historical explanation impossible?

Subquestions from the issue, answered only as far as the sources reach.

- Compare snapshot, event, temporal-table, immutable-ledger, and fact-oriented models.
- Find cases where fact decomposition harms identity, invariants, write ergonomics, or performance.
- Find cases where valid time and system time add no business value.
- Find cases where temporal semantics belong only to selected properties or events.
- Find cases where missing those semantics makes history unexplainable.
- Deliver a domain map and explicit native, optional, compositional, or rejected criteria.

## 2. Sources

Exact list in [`sources.md`](sources.md). Families used in this pass.

- Snapshot and object. Palantir object edits. SQL Server current-plus-history tables.
- Event and ledger. Fowler Event Sourcing. Young. Azure Event Sourcing. ValueFlows. ERPNext immutable ledger. Odoo year-end locks. GS1 EPCIS.
- Temporal engines. SQL:2011 via Kulkarni and Michels. XTDB. Datomic filters and schema change.
- Fact-oriented analysis. Halpin ORM white paper and ORM/NIAM chapter.

ERPNext and Odoo code were not cloned. Manuals only. Gap for issues 32 and 33.

Sibling notes on issues 4, 5, 8, 9, and 13 were read with `git show` and are not copied. Issue 56 was not on a remote branch.

## 3. Evidence

**Domain evidence.**

- Authors commit vouchers, objects, actions, and typed events. They do not commit elementary facts as the working write. Halpin himself maps facts into tables. Young rejects event sourcing as a system-wide default.
- A published economic record is corrected by a later record. ValueFlows `corrects`. ERPNext original plus reversal. EPCIS `errorDeclaration`.
- World time and record time come apart. Kulkarni insurance insert. XTDB future address. ValueFlows event date versus `created`. EPCIS Event Time versus Record Time. ERPNext posting date versus creation.
- Some types have only one of those questions. Item Price validity. Display names. Sensor points. SQL Server system-time-only tables. Datomic transaction-time-only filters.
- Some explanations die without the extra stamp or the extra record. S-007. Closed-period audit. Future-dated policy. S-001 layer split. EPCIS ILMD. S-012 definition pin.

**Source-system artifact.** See section 4.

## 4. Source artifacts

Do not promote these into OS primitives.

- XTDB hidden `_system_from`, `_system_to`, `_valid_from`, `_valid_to` on every table.
- SQL:2011 `PERIOD` as table metadata. `FOR PORTION OF` row split. At most one period of each kind per table.
- SQL Server `SYSTEM_VERSIONING`, history table, and `ValidFrom` names that mean system time.
- Datomic `[e a v tx added]`, `as-of`, `since`, `history`, `:db/txInstant`, `:db/noHistory`.
- Palantir user-edits-win, most-recent-timestamp, and deletable edit history.
- ERPNext DocType, GL Entry, Stock Ledger Entry, Repost Item Valuation, Item Price fields.
- Odoo lock dates and Hard Lock.
- ValueFlows `corrects` link.
- EPCIS `errorDeclaration` and optional `eventID`.
- Halpin CSDP diagrams and NORMA-generated SQL.

## 5. Convergence

Independent sources share these cuts.

| Cut | Who |
| --- | --- |
| Write unit is an object, document, action, or typed event | Palantir, ERPNext, ValueFlows, Fowler, Young |
| Elementary facts are for analysis, then grouped | Halpin |
| Published effects append a correction | ValueFlows, ERPNext, EPCIS, Odoo |
| Two time questions, different owners | SQL:2011, XTDB, EPCIS, ValueFlows, ERPNext |
| Dual time is opt-in or missing in shipping products | SQL:2011, SQL Server, Datomic, Palantir |
| Current reads need a cheap path | Fowler snapshots, XTDB current indexes, Datomic present-pays-no-penalty, ERPNext repost cost |
| Schema meaning is a third pin | Datomic schema change, S-012 |

## 6. Divergence

| Topic | Split | Plausible reason |
| --- | --- | --- |
| Must every row carry both axes | XTDB yes in storage. SQL:2011 no. Datomic no valid time. SQL Server no application time. Palantir no | Product thesis versus incremental standard versus transaction log versus operational index |
| How to correct a wrong past | SQL:2011 and XTDB portion-update. ERPNext and ValueFlows append. EPCIS error declaration | Row-version databases versus published ledgers versus visibility logs |
| What `as-of` means | Datomic transaction time. XTDB valid-now plus system-best-known by default. SQL Server system time under a `ValidFrom` name | Collapsing the two questions is the common failure |
| Unit of information | Foundry object. REA event. Datomic datom. ERP document plus ledger row. ORM elementary fact at analysis time | Different jobs. Do not average them into one Fact type |

## 7. Candidate laws

All stated in [`candidate-laws.md`](candidate-laws.md). Short list.

| Law | State |
| --- | --- |
| K1 Fact is not the fundamental write unit | `rejected` as a universal claim |
| K2 Elementary-fact analysis is not a storage default | `supported` |
| K3 Aggregates are not independently writable fact bags | `supported` for journal, order, lot, exclusive seat |
| K4 Ledger-class correction appends | `supported` for ledger-class |
| K5 Two time questions exist | `supported` |
| K6 Ubiquitous bitemporal rows are not a domain law | `rejected` as a default |
| K7 Knowledge time is runtime-owned | `supported` |
| K8 Valid or occurrence time is user-owned and optional | `supported` |
| K9 Temporal natures are not one rectangle | `supported` as a do-not-collapse rule |
| K10 Temporal cardinality is earned | `supported` |
| K11 Schema time is not fact time | `supported` as a requirement |
| K12 Period locks are authority, not a clock | `supported` |
| K13 Current state must not pay full history | `supported` as pressure |
| K14 Selected history is required for some explanations | `supported` |

## 8. Counterexamples

Cards in [`counterexamples.md`](counterexamples.md). They bound the laws. They do not restore the two attractive hypotheses.

## 9. Runtime pressure

If the surviving claims hold, the engine has to do these things. Storage layout stays an implementation choice. Wave B waits.

1. **Write boundary.** Assign knowledge time. Refuse client mutation of that stamp. Parse valid time or occurrence time only when the type declares it.
2. **Commit unit.** Actions, events, and documents commit. Independent Fact writes against identity-bearing parts are illegal.
3. **Ledger kernel.** Types marked ledger-class reject in-place valid-time rewrite. Accept reversal, amendment, return, or `corrects`.
4. **Declared history.** Edit history, validity intervals, and full bitemporal rectangles are capabilities a type or property declares.
5. **Query names the question.** Default read is valid-now and known-best when both exist. A single `as-of` is forbidden as an ambiguous API.
6. **Projection cost.** Now-reads do not replay full history. FIFO and other folds use the domain sequence key.
7. **Period lock.** Policy on the Action, not a missing column.
8. **Ontology pin.** Historical explanation of a decision names definition revisions. Issue 9 owns the representation.

No store, queue, or language is selected.

## 10. Open questions

These stay open. This folder does not invent answers.

- Q2. Is Fact a kernel type at all. This pass rejects Fact as the fundamental unit. It leaves interchange-Fact `hypothesis`.
- Q6. Which properties are legitimate mutable facts versus projections. Inventory quantity leans projection. Display name leans mutable snapshot. No closed list.
- Q7. Must every fact carry both dimensions. This pass answers no as a default, and does not answer for every remaining type.
- Issue 4 Class D. When rival live records are required, what identity do they have if not Fact.
- Issue 5 type-level temporal natures. This map is a first cut, not a closed taxonomy.
- Issue 9 representation of the ontology pin.
- Issues 32, 33, 35, 38. Confirm manuals against code and standards text already cited.

No new GitHub issue is opened. The questions above already exist.

## 11. Decision state

| Claim | State |
| --- | --- |
| Fact is the fundamental information unit | `rejected` |
| Fact as optional interchange or storage encoding | `hypothesis` |
| Bitemporality is a pervasive semantic requirement | `rejected` |
| Two query questions exist in selected domains | `supported` |
| Universal bitemporal rows as a metamodel default | `rejected` |
| Ledger-class append-only correction | `supported` |
| Placement criteria in [`criteria.md`](criteria.md) | `supported` as a procedure. Cells in the map vary |
| Q2 resolved | `undetermined` |
| Q6 resolved | `undetermined` |
| Q7 resolved | `undetermined` |
| RFC-0001 edited | no |

## Overview

The attractive pair is a Fact atom with four timestamps. It looks orthogonal and complete. Shipping systems do not live there.

They write objects and documents. They keep cheap current pictures. They add a second clock or an append-only correction only where operators already ask the extra question. SQL:2011, SQL Server, and Datomic each refuse at least one axis as a default. XTDB stores both and still treats ordinary SQL as the common path.

The other attractive pair is a mutable row with one `updated_at`. That dies on late stock, closed periods, future-dated policies, promised versus delivered dates, as-built data, and old rules. The kill test cuts both ways. Use the map. Do not install either pair as a default.

## Key concepts

**Fact over-generalization.** Treating a dated, sourced assertion as the write and identity unit for every type.

**Bitemporal over-generalization.** Putting valid time and system time on every property because the two questions exist somewhere.

**Ledger-class.** A record that may already have been published. Corrected by a later record.

**Placement.** Native, optional, compositional, or rejected, applied per type or property.

## How it works

Walk [`criteria.md`](criteria.md) for each type. Write the result into the domain map. Attack the result with [`counterexamples.md`](counterexamples.md). If a later corpus note flips a cell, change the cell and the law, not RFC-0001.

## Where things live

| Concern | Card |
| --- | --- |
| Native versus rejected tests | [`criteria.md`](criteria.md) |
| Per-domain placement | [`domain-map.md`](domain-map.md) |
| Identity, invariant, write, cost harm | [`fact-decomposition-harm.md`](fact-decomposition-harm.md) |
| Where dual time is local or useless | [`bitemporal-scope.md`](bitemporal-scope.md) |
| Where missing history cannot explain | [`absence-impossible.md`](absence-impossible.md) |
| Laws and states | [`candidate-laws.md`](candidate-laws.md) |
| Attacks | [`counterexamples.md`](counterexamples.md) |

## Gotchas

- SQL Server `ValidFrom` is system time. The name lies.
- Datomic `as-of` is not `valid then`.
- XTDB ubiquitous columns are a product choice. The interesting sentence is that most queries ignore them.
- Odoo can move a late invoice to the day after the lock. That is recognition, not occurrence.
- Halpin "everything is a fact" is an analysis slogan. His mapping chapter undoes it for implementation.
- Issue 4 and issue 5 already asked neighboring questions. This folder is the adversarial twin, not a copy.
