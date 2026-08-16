# Taxonomy of state forms

**Kind:** candidate model fragment  
**Decision:** hypothesis  
**Fetched:** 2026-08-16

Five forms are enough to classify the issue #12 examples. They are roles a value can play, not five storage engines and not five OS primitives.

A single business number can move between forms. Customer outstanding starts as a committed invoice effect and is later a derived remainder after allocations.

## The five forms

### Observed

A report about the world from a count, sensor, document, or external system. It can be wrong. It does not become operational truth just by arriving.

Domain examples:

- Physical stock count that disagrees with the book.
- Carrier delivery scan.
- Bank statement line.
- Warehouse saying 20 units left on August 8 when the book still shows 100 (scenario S-007).

ERPNext Stock Reconciliation is the accepted intake of an observation. ValueFlows `raise` / `lower` exist for the same gap when the real obtain or loss action is unknown.

### Asserted

A claim entered as a value without being a posted economic effect. Draft fields, names, notes, planned dates, and many Palantir property edits sit here until a later rule promotes them.

Domain examples:

- Draft invoice totals before submit.
- Item description.
- Promised delivery date typed by sales.
- Datomic `:item/count` asserted as a current fact (the inventory tutorial treats count as a property, not as a movement event).
- XTDB `UPDATE addresses SET address = ...` as the current known address.

Asserted is legitimate when the domain object is the thing being described and there is no independent movement ledger that should own the value.

### Committed

An accepted operational or legal decision. Authority has been applied. Later readers may depend on it. History keeps it even if a later compensation undoes its effect.

Domain examples:

- ERPNext submit of a Sales Invoice or Journal Entry.
- ERPNext Stock Reservation Entry.
- Odoo Validate on a transfer that creates an SVL.
- Palantir Action that assigns a role.
- Posted period close / Period Closing Voucher.
- Sales Order as a customer commitment (no GL, still binding for fulfilment).

Committed is a primary fact. The balance it causes is usually not.

### Derived

A value that a function of other facts must be able to recompute. If a user can type a different number with no new fact, the model has lost the plot.

Domain examples:

- On-hand quantity from accepted stock movements.
- Inventory account balance under perpetual inventory.
- Customer outstanding from invoices, credit notes, and allocations (ERPNext Payment Ledger).
- FIFO or AVCO valuation after a sequence of layers (Odoo SVL, ERPNext SLE).
- Available-to-promise from on-hand minus active reservations.
- Palantir "Average employee salary" derived property.
- Datomic entity map as of now.
- Invoice "fully paid" if defined as outstanding equals zero.

### Cached / materialized

A stored copy of derived state kept for speed or export. It is wrong the moment its inputs change and no invalidation ran.

Domain examples:

- ERPNext Bin reserved/actual quantity caches (named here as a common ERP pattern; this session did not fetch a first-party Bin page, so treat the Bin example as hypothesis until a corpus agent cites it).
- ERPNext Repost Item Valuation rewriting later SLE valuation fields after a backdated post.
- Palantir writeback dataset / OSv2 materialization.
- Fowler snapshot of application state taken so replay need not start from zero.
- XTDB current-time index.
- Odoo Stock Valuation dashboard rows if treated as a report over SVLs.

**Kind:** runtime consequence  
A cache may be necessary. It is not a domain concept. Constitution §6 already lists materialized views and caches as implementation mechanics.

## Worked examples

### On-hand quantity

| Form | Example |
| --- | --- |
| Observed | Cycle count of 97 units. |
| Asserted | Opening balance typed at go-live when history is missing. |
| Committed | Delivery Note submitted. Stock Reservation Entry created. |
| Derived | Book quantity after all accepted movements. |
| Cached | Warehouse bin qty used for the next availability check. |

Necessary forms. Observed count (the world can disagree with the book). Committed movements (the evidence). Derived book quantity (the explainable total). Cache only if the derived total is too slow.

Not necessary as a primary mutable field. A user-editable "Qty in warehouse" with no movement history.

### Receivable / outstanding

| Form | Example |
| --- | --- |
| Observed | Customer says they already paid. Bank has not. |
| Asserted | Draft invoice. |
| Committed | Submitted Sales Invoice. Payment Entry. Allocation. |
| Derived | Outstanding = billed − allocated − written off − returned. |
| Cached | Ageing report snapshot. |

ERPNext Payment Ledger exists because outstanding is not the invoice total field after the first partial payment.

### Reservation

Reservation is committed allocation, not a stock movement and not a GL post. ERPNext creates a Stock Reservation Entry. Unreserve cancels that entry. Available quantity is then derived.

If OS stores only `item.reserved_qty` as a mutable integer, it cannot answer who holds the reservation or why.

### WIP

WIP is derived from committed issue and output events against an open production commitment. The Work Order or manufacturing order is committed authorization. Units in the WIP warehouse are derived from those events. A standalone "WIP qty" field is a cache.

### Status

| Status | Form | Why |
| --- | --- | --- |
| Draft / Submitted / Cancelled (ERPNext document) | Committed decision | A person or policy chose to submit or cancel. |
| Posted / Cancelled (Odoo account move, from public model docs) | Committed decision | Same. |
| Fully paid | Derived predicate | Function of outstanding. |
| Available / Partially Available (Odoo move) | Derived predicate, often stored | Result of a reservation check. |
| Overdue | Derived predicate | Function of due date and outstanding, plus "now." |

**Kind:** counterexample  
Odoo stores availability on the move. That does not make availability a primary business fact. It makes it a cached predicate with a stored status for UI and scheduling.

### Aggregate balances

Account balance, stock value, and open commitment totals are derived. Chart-of-accounts reports in ERPNext are projections over GL rows with cancelled rows filtered. Odoo Valuation At Date is a projection over layers.

Storing only the aggregate, then adjusting it with `balance += qty`, loses reconstructability unless the increment is itself a committed fact. Accounting already made that increment a journal line.

## When current state is a primary fact

Use a primary fact when at least one of these holds.

1. The value is a decision or acceptance, not an arithmetic remainder. Submit, reserve, approve, promise, close period.
2. The value is an observation that has not yet been reconciled to movements. Count, scan, bank line, timeout from an external system.
3. The value describes an enduring thing and no independent event stream owns it. Party legal name, item unit of measure, warehouse address.
4. Reconstructing it from events would invent a fake history. Opening balances at cutover.

## When current state should be a projection

Use a projection when at least one of these holds.

1. Two honest clerks would compute the same number from the same committed facts. On-hand, outstanding, valuation, ATP.
2. A backdated or correcting fact must change the number. If it cannot, the number was a stale cache pretending to be truth.
3. Audit asks "why is it this?" and the answer is a list of movements, not a shrug.
4. The same number appears on more than one surface. Invoice paid flag, ageing bucket, customer outstanding widget.

## Pure event sourcing is not a sixth form

Event sourcing is a storage and initiation rule. Every change is an event. State is rebuildable. The event store is the system of record.

That rule can implement derived and cached forms. It is a poor fit for asserted descriptive properties and for observations that are not already domain events. Fowler allows the official record to be current state plus a log. ValueFlows allows stored or derived quantity. XTDB and Palantir present current rows or objects as the thing users write.

See [candidate-laws.md](candidate-laws.md) CL-5.
