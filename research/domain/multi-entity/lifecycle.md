---
issue: 31
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Lifecycles

These are domain lifecycles. They are not a schema and not an RFC-0001 edit. Each phase names the kind of claim and the evidence that forced it.

## Group membership

**Kind.** Domain evidence plus candidate law.

A legal person can exist before it belongs to a group. GLEIF Level 1 is who is who. Level 2 is who owns whom. E24. IFRS 10 starts consolidation on the date control is obtained and stops it on the date control is lost. E16, E18.

Phases that must remain distinguishable:

1. Legal person exists and can contract. E23.
2. Ownership interest exists. This is not yet control. E20.
3. Control exists. Power, variable returns, and the link. E16.
4. The person is inside a consolidation scope. GLEIF calls this accounting consolidating parent. E24.
5. Control is lost. Assets and liabilities leave the group projection. A retained interest may become an associate. E18, E20, E22.

ERPNext Parent Company and Odoo parent or branch links look like current-state trees. Moqui PartyRelationship is dated. E31. Whether ERP trees are effective-dated stays `undetermined`.

**Runtime consequence.** Queries of the form "who was in the group on 12 March" and "when did we learn that" are different. Constitution §10. Do not collapse them into a mutable parent field.

**Decision state.** `supported` that membership is dated. `hypothesis` for bitemporal storage.

## Intercompany trade

**Kind.** Domain evidence.

Happy path from E3 and E4:

1. Two legal persons already exist and keep books.
2. Each person plays a role toward the other. Internal customer or supplier in ERPNext. Shared contact in Odoo. Party role in Moqui. E26.
3. One person sells goods, services, or a recharge.
4. The seller records revenue or a due-from. The buyer records expense, asset, or a due-to.
5. Stock, if any, moves with commercial documents or with an explicit paired stock event. E5, E11.
6. Taxes are computed per legal person. E29.
7. Payments settle the claim. They do not erase the two original events.
8. Group reporting eliminates the revenue, expense, receivable, payable, and any unrealized profit still in inventory. E17.

Failure phases that the sources already name:

- One invoice submitted, counterpart missing. E3.
- One journal cancelled, the other still posted. E4.
- Stock moved by warehouse transfer across companies. ERPNext collaborators say this may not work. E5.
- Both counterparts created independently, so the trade is recorded twice. E3.

**Runtime consequence.** Completeness is a pair invariant, not a single document status.

**Decision state.** `supported`.

## Shared warehouse and shared service

**Kind.** Domain evidence.

Physical site and stock ledger diverge. E5. Shared service and free transfer diverge. E28.

Phases:

1. A site exists in the world. Issue 18 owns custody and ownership at that site.
2. Each legal person that stores goods there has its own stock ledger and warehouse account.
3. A move that changes ownership is intercompany trade, not a bin transfer.
4. A service consumed by one person and paid by another creates a claim.

**Counterexample.** Odoo 19 Synchronize Stock Moves may collapse step 3. That is a source artifact until independent evidence shows one stock event can carry two legal-person ledgers without losing tax and cancellation independence. ME-034.

**Decision state.** `hypothesis` for the domain law. `supported` for ERPNext's refusal to share a warehouse ledger.

## Currency

**Kind.** Domain evidence.

Issue 21 owns the book-level mechanics. This lifecycle only records the group-level sequence.

1. Each legal person has a functional currency. IAS 21. E21.
2. A transaction may use a foreign currency. Record it in functional currency at the transaction-date rate.
3. Open foreign balances are revalued. Realized difference at settlement. Unrealized difference at a reporting date. E6.
4. Group presentation may use another currency. Translate equity at historical rates, profit and loss at average or transaction rates, other balance-sheet items at closing. E12, E21.
5. Functional currency changes only when the underlying economic environment changes. E21.

ERPNext Company currency and Reporting currency, plus report presentation currency, are source names for pieces of this cut. E1, E6, E25.

**Decision state.** `supported` for the three-way cut. `undetermined` for book-versus-entity identity.

## Historical reorganization

**Kind.** Domain evidence.

IFRS 3 measures an acquisition. IFRS 10 dates control. GLEIF stores direct and ultimate consolidating parents as relationship records. E22, E18, E24.

Phases that a rename of Company.parent cannot express:

1. Before. Person A is independent or belongs to another group.
2. Acquisition or loss of control on a valid date.
3. Measurement of goodwill, bargain purchase, or retained interest.
4. After. Consolidation scope, NCI, and intercompany elimination set change.
5. Knowledge time. The system may learn the deal late. Constitution §10.

A spin-off, merger, or CNPJ succession is a legal-person event. Issue 14 owns merge versus succession. Issue 30 owns Brazilian fiscal succession. This folder only insists the group structure is a dated relationship.

**Decision state.** `supported` that reorganization is dated. `undetermined` for the exact actions.

## Consolidation cycle

**Kind.** Domain evidence.

1. Each legal person closes its own books. IAS 27 separate statements. E19.
2. Maps or alignments join unlike charts. E12. ERPNext expects child accounts to match a parent structure. E1. How far that matching goes is `undetermined` after the 404.
3. Translate into presentation currency. E12, E21.
4. Combine like items. E17.
5. Eliminate investment versus equity, and all intragroup positions and unrealized profits. E17.
6. Present NCI in equity. E18.
7. Do not write those eliminations back into statutory ledgers. E12 regular ledgers exclude consolidation-adjustment journals.

**Runtime consequence.** Consolidation is a function over a scope, a date, a policy set, and a rate set. It is not a third operating company that users invoice.

**Decision state.** `supported`.

## Permission lifecycle

**Kind.** Source-system artifact with a domain reading.

A principal may be allowed to see several legal persons and to post in one. E13, E15, E30. Grant, restrict, and revoke are policy events. They do not change control under IFRS 10.

**Decision state.** `supported` as a recurring pattern. Issue 11 owns Principal.
