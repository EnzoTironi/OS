# Where fact decomposition harms

**Kind:** domain evidence, source-system artifact, candidate law, counterexample, runtime consequence  
**Decision state:** `supported` that Fact-as-write-unit is harmful in the cases below. `undetermined` whether a Fact type remains useful as interchange.  
**Issue:** https://github.com/EnzoTironi/OS/issues/59

RFC-0001 sketches Fact as subject, predicate, value or object, valid time, and provenance. This note asks what breaks if that shape becomes the write unit for everything.

## Identity

**Domain evidence.** A journal voucher, an order, a lot, and an exclusive seat are addressable things. Their parts are not separately true in the way an employee's name and an employee's room are separately true.

Halpin defines an elementary fact as a relationship that cannot be split into shorter facts without introducing new object types. He then spends the mapping chapter grouping those facts back into tables. Objectification exists because some relationships need identity of their own. DegreeAcquisition and Teaching are his examples. That is an admission that "everything is an elementary fact" is an analysis step, not a stored identity model.

SQL:2011 makes the same cut on the temporal side. After `FOR PORTION OF` update, three Emp rows share one `ENo`. The primary key must include the period. Identity of the person and identity of the assignment-during-an-interval are different.

Datomic `since` drops the identifying datoms that were asserted in the first transaction. The filtered view cannot resolve `:item/id`. Callers must join a "now" database to recover identity, then read history on the side. A fact stream that forgets which atoms are identity is not a safe object model.

Palantir resolves multi-source objects by primary key, then picks a winner per property. The losing value leaves the object. The object identity survives. The rival assertion does not. That is workable operations and failed Class D history.

**Source-system artifact.** ORM NORMA generating SQL tables. Datomic `[e a v tx added]`. Palantir object index. Do not promote those encodings.

**Candidate law.** Identity-bearing aggregates commit as one Action or document. Independent Fact writes against their parts are illegal unless the type says the part has its own lifecycle. `supported`

**Counterexample that would reject it.** A production domain where every spanning invariant remains true after arbitrary per-predicate commits, with no extra transaction around the set. Not found.

**Runtime consequence.** The commit unit is the Action, event, or document. A Fact store, if any, is filled by that commit, not by user-authored triples.

## Invariants

**Domain evidence.** Double-entry is a set constraint. ERPNext cancels a Journal Entry by retaining the original debit and credit and adding opposite rows for the same voucher. The combined effect is zero. The audit trail still shows what was posted. A writer who can assert the debit Fact without the credit Fact has already left the ledger.

ValueFlows says recorded activity that affects financial reports cannot be changed directly. The correction is another EconomicEvent with `corrects`. Economic information on a resource may be updated only by an event. Non-economic notes may be updated on the resource. That split is an invariant about what may be a Fact-like mutation at all.

SQL:2011 `WITHOUT OVERLAPS` is optional because exclusivity is not a universal fact constraint. Forcing it on every binary relationship invents illegal concurrent contracts. Omitting it on an exclusive seat invents two holders.

FIFO and moving average are order-sensitive folds. ERPNext says inserting an earlier stock movement can change later layers and Cost of Goods Sold. Independent quantity facts with no sequence key do not preserve valuation.

**Candidate law.** A spanning invariant is evaluated at the commit of the identity-bearing record, not after a later assembly of facts. `supported` for ledger and exclusive-assignment types

**Counterexample.** A regulated sensor whose posterior is legally sufficient without a Decision. Issue 4 already flagged that case. Not found here. It would challenge authority, not this invariant law.

**Runtime consequence.** Constraint evaluation sees the post-commit aggregate. A Fact API that exposes partial writes needs a hidden transaction. Hidden transactions are the convention constitution §1 forbids.

## Write ergonomics

**Domain evidence.** People submit invoices, receipts, work orders, and Actions. They do not author "subject predicate value valid-time provenance" rows for each field.

Palantir's mutation path is an Action applied to an object, link, or object set. The index updates immediately. Persistent merge happens later. The write shape is the object edit.

ERPNext Item Price is a form. Item, Price List, Rate, UOM, Valid From, Valid Upto, customer or supplier, batch. That is already a dated assignment object. Splitting it into five facts does not help the buyer or the agent.

Fowler notes that event-driven systems tempt authors into Transaction Scripts, and that this is an illusion. Domain logic can still sit in a model. The event is the change record, not the authoring UI.

Young is blunt. The largest failure he sees is people trying to use event sourcing everywhere. InfoQ reports the 2016 line. A whole system based on event sourcing is an anti-pattern. An event-sourced monolith is the Fact-everywhere thesis in other clothes.

**Source-system artifact.** Foundry Funnel queues and six-hour flush. ERPNext DocType forms. Fowler's shipping-tracker toy. None of these is an OS primitive.

**Candidate law.** Authoring and commit speak in Actions, events, and objects. Fact-shaped records, if they exist, are derived or interchange. `supported` as a write-shape rule. `undetermined` as a kernel-type decision

**Counterexample.** A domain whose only honest authoring form is a triple store, and whose users already think in elementary facts. ORM workshops do this for analysis. They still map to tables for use. That is not a counterexample.

## Performance

**Domain evidence.** Fowler says rebuilding application state from a blank start plus every event is a slow process when there are many events. Systems keep current state or periodic snapshots for that reason. Azure's Event Sourcing page repeats the cost. Long streams need snapshots. Snapshots are an optimization, not a second truth.

XTDB puts four temporal columns on every table, then builds specific indexes so current-time queries stay close to atemporal cost. The product would not need that sentence if ubiquitous history were free.

Datomic says the present pays no penalty because the unfiltered database does not consider history. The corollary is that filtered history does pay. `history` cannot even build an entity view, because an entity is a point-in-time slice.

SQL Server warns that `(n)varchar(max)`, `varbinary(max)`, and similar types in temporal tables incur significant storage cost. Graph node and edge tables cannot be temporal at all.

ERPNext says recomputing every later stock or accounting entry can be expensive on a large database. The original immutable-ledger release blocked some backdated stock writes for that reason. Current builds add a Repost Item Valuation job. The job is the cost made visible.

**Source-system artifact.** XTDB current-time indexes. Datomic AVET. SQL Server history table plus `PAGE` compression. ERPNext background repost. Wave B may pick any of these. None is a semantic law.

**Candidate law.** Current operational reads must not pay full historical reconstruction. History is a declared capability. `supported` as pressure. `undetermined` as an index design

**Counterexample.** A workload whose current-state queries stay fast after every property is a bitemporal Fact, with no extra current index, no snapshot, and no denormalized object. Not observed in these sources. XTDB's extra indexes point the other way.

## What this does not reject

A Fact-shaped interchange record can still be useful for dated, sourced assertions that cross system boundaries. Issue 4's weaker claim stays `hypothesis`. This kill test rejects Fact as the fundamental write and identity unit. It does not close Q2.
