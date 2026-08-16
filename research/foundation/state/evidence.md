# Evidence for issue 12

**Kind:** mixed. Each block names its kind.  
**Fetched:** 2026-08-16  
**Decision:** observations below are `supported` as readings of the cited pages. Inferences are marked. Laws live in [candidate-laws.md](candidate-laws.md).

Observation is what the page says. Inference is what a later agent might conclude for OS. They are not the same thing.

---

## E-01. ERPNext. Source document versus generated ledger

**Kind:** domain evidence  
**Source:** https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger  
**Decision:** supported as documented behavior

Observation. A draft document has no ledger effect. Submit validates posting date, accounts, and balance, then creates General Ledger, Payment Ledger, and Stock Ledger rows when applicable. The source document describes what happened. The generated entries record the financial or stock effect.

Observation. Quotation, Sales Order, and Purchase Order are commitment documents. They usually create no GL rows. They still reserve or plan stock, track fulfilment, and hold payment schedules. Invoice, Payment Entry, Delivery Note, and Purchase Receipt are ledger documents.

Inference. Commitment and posted effect are different state forms. A Sales Order is not a weak invoice. Outstanding receivable is not a property you type on the customer.

---

## E-02. ERPNext. Immutable ledger and compensating cancel

**Kind:** domain evidence  
**Source:** https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext  
**Decision:** supported as documented behavior

Observation. Cancel keeps the original GL or stock rows and adds opposite rows. Combined effect is zero. Reviewers can still see what was posted first. Cancelled source documents stay because they are the context for those rows.

Observation. The page says GL Entry and Stock Ledger Entry rows are system-generated evidence, not transaction-entry forms. Users must not delete them through the database or API.

Observation. Correction paths are named. Draft edit. Cancel and amend. Return or credit note. Reverse Journal Entry. Repost Accounting Ledger when the source document is still valid but generated accounting is stale.

Inference. ERPNext treats posted ledger rows as committed effects. It does not treat them as user-editable current fields. Cancellation is compensation, not erasure.

---

## E-03. ERPNext. Backdated stock and controlled repost

**Kind:** domain evidence  
**Sources:** https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext and the older https://docs.erpnext.com/docs/user/manual/en/immutable-ledger-in-erpnext  
**Decision:** supported as documented behavior. Product history diverges.

Observation. The v13 user manual said future stock rows cannot be updated, so a later timestamp blocked an earlier posting for the same item.

Observation. The 2026-08-14 Frappe page says current builds can accept a permitted backdated stock transaction and create a Repost Item Valuation job. Later Stock Ledger Entries are recalculated in sequence. Frozen periods, negative-stock rules, serial and batch constraints still apply.

Observation. After repost, later FIFO or moving-average values and related COGS can change. The page tells the user to wait for the job and compare Stock Ledger before and after.

**Kind:** runtime consequence  
Observation. The same page lists why the ledger was protected. FIFO layer consumption changes. Moving-average rates change. Tax declarations for an earlier period can change. Recomputing later entries is expensive.

Inference. Derived valuation is not free to mutate in place. A late fact invalidates later derived values. The product grew a controlled recompute path rather than silent rewrite or a total ban.

---

## E-04. ERPNext. Current balances hide cancelled rows

**Kind:** domain evidence  
**Source:** https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext  
**Decision:** supported as documented behavior

Observation. General Ledger report hides cancelled rows unless "Show Cancelled Entries" is on. Normal balances show active effects. Original plus reversal still exist.

Inference. The report balance is a projection over committed rows with a filter. The rows remain the evidence.

---

## E-05. ERPNext. Perpetual inventory couples stock events to GL

**Kind:** domain evidence  
**Source:** https://docs.frappe.io/erpnext/perpetual-inventory  
**Decision:** supported as documented behavior

Observation. With perpetual inventory, every stock transaction posts accounting. Disable it and users must create manual entries to update the stock-in-hand account.

Observation. Purchase Receipt debits the warehouse account and credits Stock Received But Not Billed. Purchase Invoice later clears that holding account. Delivery Note credits warehouse and debits COGS at valuation, not at sales price.

Inference. On-hand quantity and inventory-account balance are two derived views of the same movement history. They can diverge if backdated stock, cancelled vouchers, or missing perpetual posts occur. The how-transactions page already names a Stock and Account Balance Comparison report for that case.

---

## E-06. ERPNext. Reservation is an explicit entry, not a stock movement

**Kind:** domain evidence  
**Source:** https://docs.frappe.io/erpnext/stock-reservation  
**Decision:** supported as documented behavior

Observation. Reservation sets aside quantity for a Sales Order or Pick List. The system creates Stock Reservation Entry rows. Unreserve cancels those entries. Auto-reserve on purchase creates the entry when the Purchase Receipt is submitted.

Inference. Reserved quantity is a committed allocation. It is not on-hand and not a GL posting. Available-to-promise is then a derived predicate over on-hand minus active reservations.

---

## E-07. Odoo. Validated moves create valuation layers and optional journals

**Kind:** domain evidence  
**Sources:** https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/using_inventory_valuation.html and the 18.0 automatic-valuation and aging pages  
**Decision:** supported as documented user behavior

Observation. After Validate on a purchase order receipt, a Valuation smart button shows how inventory value changed. The same appears on a delivery order. The Stock Valuation dashboard lists Date, Quantity, Unit Value, and Total Value. Valuation At Date shows value as of a prior date.

Observation. Official aging/valuation text calls each dashboard line a stock valuation layer (SVL). SVLs are generated when products move in a way that affects valuation, after the warehouse operation is validated.

Observation. With automated valuation, those layers generate journal entries. Manual revaluation is a separate form that raises or lowers unit price for AVCO or FIFO goods.

Inference. Odoo current stock value is a projection over validated layers. Users can still assert a revaluation. That assertion is a new layer, not an edit of an old one in the user-facing story.

---

## E-08. Odoo. Move status mixes decision and availability predicate

**Kind:** domain evidence  
**Source:** https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/reporting/moves_history.html  
**Decision:** supported as documented user behavior

Observation. Moves History Status can be Done, Available, or Partially Available. Filters split To Do (Available or Partially Available) from Done.

**Kind:** source-system artifact  
**Source:** Odoo 18 public `stock.move` field help on GitHub, confirmed against the user-facing names  
**Decision:** supported as documented field meaning, not as reusable code

Observation. The public help text names New, Waiting Another Move, Waiting Availability, Available, and Done. New has no influence until confirmed. Assigned/Available means reserved. Done means transferred and confirmed.

Inference. Some statuses are decisions (confirm, validate, cancel). Some are predicates after a reservation check (waiting availability, partially available). Odoo stores both on the move. That is a source-system choice, not proof that OS must store derived availability.

---

## E-09. Fowler. Event sourcing is a stronger claim than "keep a log"

**Kind:** domain evidence  
**Sources:** https://martinfowler.com/eaaDev/EventSourcing.html and https://martinfowler.com/articles/201701-event-driven.html  
**Decision:** supported as the author's definition

Observation. Event sourcing means every change is captured as an event, and those events last as long as the application state. The key guarantee is that domain-object changes are initiated by the events. Then you can rebuild state, query a past time, and replay after a correction.

Observation. Fowler also says the official system of record can be the event logs or the current application state. If current state lives in a database, the logs may exist only for audit and special processing.

Observation. The 2017 note tightens the ES test. The event store is the principal source of truth. System state is purely derived. Git is the example. Most processing can still use a working copy that does not know the log.

Observation. Replay breaks when events talk to external systems. Schema change of old events is a real cost. Fowler treats those as problems of ES, not footnotes.

Inference. "Explainable current state" is weaker than "pure event sourcing." A ledger plus source documents can explain a balance without making every object property a replay of domain events.

---

## E-10. Fowler. CQRS is not implied by reconstructability

**Kind:** domain evidence  
**Source:** https://martinfowler.com/bliki/CQRS.html and the 2017 event-driven note  
**Decision:** supported as the author's caution

Observation. CQRS splits the conceptual model into command and query models. Fowler says most systems should not do this. Use it on a bounded context, not a whole product. A reporting database can offload hard queries without splitting every write.

Observation. The 2017 note records a project that blamed event sourcing for double work that sounds like CQRS. The patterns were conflated.

Inference. OS should not adopt CQRS as a semantic primitive because issue #12 needs projections. A derived property or a report is enough until Wave A shows a bounded context that cannot share one model.

---

## E-11. Datomic. Current entity is a projection of indelible facts

**Kind:** domain evidence  
**Sources:** https://docs.datomic.com/datomic-overview.html and https://docs.datomic.com/reference/filters.html  
**Decision:** supported as documented behavior

Observation. A Datomic database is a set of immutable datoms. Transactions add datoms. They never update or remove them. A retraction is a new datom. An entity is an associative view of assertions for one id as of a point in time.

Observation. `as-of` hides later transactions. `history` includes retractions. A history database can see multiple values for the "same" fact. An entity cannot be created from a history database because an entity is a point-in-time view.

Observation. The unfiltered "now" database does no history filtering. Queries about now do not pay a history penalty. That is a documented performance claim, not an OS measurement.

Observation. `:db/cas` succeeds only if the current value matches. Concurrent writers still reason about a current value even though history is indelible.

Inference. Datomic is a fact log with a cheap current projection. It is not domain event sourcing. Asserting `:item/count 250` is a new fact about a property, not a `StockMoved` event. Both can be reconstructable.

---

## E-12. XTDB. Current state is the default. History is ubiquitous.

**Kind:** domain evidence  
**Sources:** https://docs.xtdb.com/about/time-in-xtdb.html and https://docs.xtdb.com/concepts/key-concepts.html  
**Decision:** supported as documented behavior

Observation. XTDB lets you `INSERT`, `UPDATE`, and `DELETE` as in an atemporal database. Every table still keeps system time and valid time. Default SQL is current state as best known, valid as of now.

Observation. Valid-time updates backdate or schedule facts. System time is the audit of when the database learned them. The Mike address example keeps the old belief and the new future-valid address as different rectangles.

Observation. XTDB says it optimizes the three question classes in descending frequency. Current state. History as we now know it. History as we thought at the time. Separate indexes serve current-time queries.

Observation. Key concepts say developers who know soft deletes, event sourcing, and windowed joins will recognize related ideas. The write API remains row update, not an application-level event store.

Inference. Bitemporal current rows can satisfy "what is true now" and "what did we know then" without forcing every domain mutation through a custom event type.

---

## E-13. Palantir. Object properties are current. Some properties are derived. Materializations are optional.

**Kind:** domain evidence  
**Sources:** Palantir Action types overview, derived properties, object-backend overview, OSv1 to OSv2 migration  
**Decision:** supported as documented product behavior

Observation. An Action is a transaction that changes properties and links. The latest object data with user edits is what applications see. OSv1 called the export a writeback dataset. OSv2 calls it a materialization and makes it optional.

Observation. Derived properties are calculated at runtime from linked objects. They are read-only. Actions and functions cannot edit them. Primary keys cannot be derived.

Observation. Funnel indexes Foundry datasources and Action edits into object databases. Object Set Service serves reads. Actions can also create a historical action log of user decisions.

Observation. OSv2 accepts user edits only through Actions.

Inference. Palantir's operational ontology is current-object-centric. History of decisions is an add-on log, not the system of record for property values. Derived properties exist, but they are graph aggregations, not ledger replay.

**Kind:** counterexample  
This is a counterexample to "current state is never a primary fact." Palantir treats many object properties as the committed operational values.

---

## E-14. ValueFlows. Quantity may be stored or derived. Events still own accounting change.

**Kind:** domain evidence  
**Sources:** https://www.valueflo.ws/specification/all_vf/ and https://www.valueflo.ws/concepts/actions/  
**Decision:** supported as specification text

Observation. `onhandQuantity` is the amount under direct control. `accountingQuantity` is the amount for which the agent has primary rights. Each "can be either stored or derived from economic events affecting the resource."

Observation. Only EconomicEvents update accounting-related properties of an EconomicResource. An event's Action declares `onhandEffect` and `accountingEffect` (increment, decrement, decrementIncrement, none).

Observation. `raise` and `lower` exist for opening balances and physical counts when the real obtain/loss action is unknown. The spec prefers the real action when known.

Observation. An EconomicEvent can correct a previous EconomicEvent.

Inference. The independent economic model refuses to pick "always store" or "always derive." It does pick a single class of writes for quantity change. That is closer to OS than either ERP table mutation or pure ES dogma.

---

## E-15. Thesis and constitution already split explainability from event sourcing

**Kind:** domain evidence  
**Sources:** `docs/thesis.md`, `docs/constitution.md`, `docs/open-questions.md` Q6  
**Decision:** supported as OS's own prior stance. Not new corpus evidence.

Observation. The thesis says current state should be an explainable consequence of history and that this does not imply pure event sourcing. Constitution §14 says high-value state needs a causal explanation. The mechanism remains open. Q6 asks which properties are legitimate mutable facts and whether status is a stored decision or a function.

Inference. This research folder is supposed to pressure those questions with corpus evidence, not to answer them inside `docs/open-questions.md`.

---

## Convergence

Independent sources agree on these distinctions.

1. Posted or validated movements are the evidence for balances. ERPNext SLE/GL, Odoo SVL plus journals, ValueFlows EconomicEvent, accounting practice.
2. Cancel or reverse adds an opposite committed effect. It does not delete the original. ERPNext immutable ledger. Common accounting. Fowler reversal discussion.
3. Current quantity or balance is explainable from those effects. Reports and entity views are projections. ERPNext GL filter, Odoo Valuation At Date, Datomic entity, XTDB default SQL.
4. Some current values are still entered as facts. Opening balances, physical counts, reservations, document submit, Palantir Action edits, Datomic assertions, XTDB updates.
5. Late or backdated facts force later derived values to be recomputed or temporally reinterpreted. ERPNext Repost Item Valuation. XTDB valid time. Fowler retroactive events.
6. Performance of "now" is a first-class design problem. Datomic present pays no penalty. XTDB current-time indexes. Fowler snapshots. Palantir materializations.

## Divergence

| Topic | Positions | Plausible reason |
| --- | --- | --- |
| What is the system of record? | ERPNext source document plus generated ledgers. Fowler ES event store. Datomic datom log. Palantir current object plus optional action log. XTDB versioned rows. | Different products optimize audit, agent UX, or query shape. |
| May users update current fields? | Palantir and XTDB yes, through Actions or SQL. ERPNext ledger rows no. Datomic yes via new assertions that change the now view. | Ledger domains punish silent rewrite. Operational ontologies punish making users think in events. |
| Backdated stock | ERPNext v13 ban. ERPNext 2026 controlled repost. XTDB first-class valid time. Fowler replay. | Cost of FIFO rebuild versus product maturity. |
| Status | ERPNext docstatus is a decision. Odoo move state mixes decision and availability. ValueFlows has no single status field. | UI convenience versus predicate purity. |
| Must quantity be derived? | ValueFlows says either. ERPNext/Odoo derive from ledgers and also store running qty on ledger rows. Palantir stores object properties. | Spec versus operational cache. |

**Kind:** source-system artifact  
The ERPNext Stock Ledger Report shows Balance Quantity, Valuation Rate, and Balance Value on each movement line. Those running figures are report fields over the movement sequence. They are not a user-authored on-hand fact.
