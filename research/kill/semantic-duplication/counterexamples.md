# Counterexamples

**Kind.** counterexample
**Fetched.** 2026-08-16
**Decision.** per card. A card that would kill a law is marked. A card that the current evidence already produces is a supporting attack, not a rejector.

These are adversarial scenarios for the placement laws. Happy-path sync is not evidence.

## X-001 Writeback timeout after possible success

- Attacks: L-008, L-002
- Setup: OS Action requests the ERP to change an order. The request leaves OS. The connection times out. The ERP may have posted.
- Expected if laws hold: Action outcome stays `unknown`. No second Sales Order is minted as current truth. Reconciliation consumes later ERP observation.
- Would reject L-008: a 2PC that never leaves `unknown`.
- Repo scenario: S-004
- Decision state: `supported` as a required case. Palantir documents the split (E-003). Microsoft documents the product-receipt split (E-011).

## X-002 ERP user uses the unhooked write

- Attacks: L-007, L-002
- Setup: A planner posts a receipt with `doInsert` or an equivalent unhooked API. Dual-write does not fire (E-012). OS still shows the old quantity.
- Expected: OS either virtualizes and sees the new receipt on next read, or treats its stored quantity as a stale projection and refuses to promise stock from it.
- Would reject L-007: evidence that unhooked writes are mechanically impossible in the standing systems of issue 72.

## X-003 Ontology edit wins against a later ERP correction

- Attacks: L-004, L-011
- Setup: A user edits promised date on the ontology object. Next day the ERP planner corrects the promise. Palantir default merge keeps the user edit (E-004).
- Expected if L-004 holds: the projection cannot hide the ERP correction. Both records remain. The Action that later ships names which date it used.
- Would reject L-004: a projection that must win forever while the ERP remains SoR.

## X-004 Recency merge hides a fiscal authorization

- Attacks: L-005, L-008
- Setup: SEFAZ authorizes NF-e at 09:00 with a protocol number (E-021). An OS user edits the "invoice" object at 09:05. Recency merge keeps the edit.
- Expected: the protocolled document remains the legal fact. The OS edit is a rival claim or is refused.
- Would reject L-005: a jurisdiction where the later operational edit replaces authorization of use.

## X-005 Marketplace order rewritten in OS

- Attacks: L-010, L-006
- Setup: A customer pays a marketplace. OS copies the order into an editable Sales Order. Sales changes quantity after payment.
- Expected: OS does not own the marketplace agreement. It may own an internal commitment that has to be reconciled with the marketplace remainder.
- Would reject L-010: a retrieved marketplace contract that treats the seller's ERP document as the customer-facing agreement.
- Decision state: `hypothesis`. Marketplace contracts were not retrieved.

## X-006 One Product type for spec, SKU, and listing

- Attacks: L-006, L-010
- Setup: Engineering revises the specification. Merchandising revises the marketplace title. Accounting revises the valuation class. OS has one Product row.
- Expected: three facts, three identities or three correspondences. Composition fails if a single `title` or `price` is forced to one type (E-019, E-022).
- Would reject L-006: a domain where those edits are one field with no audit loss.

## X-007 Dual-write product receipt on one side

- Attacks: L-008, L-011
- Setup: Product receipt posting is canceled in Supply Chain Management after Dataverse already created the receipt (E-011).
- Expected: two records, one Decision, no silent delete. OS must not treat Dataverse as SoR for the receipt.
- Would reject L-008: the cancel always removes both rows in one atomic outcome.

## X-008 CVI Postprocessing Office backlog

- Attacks: L-001, L-011
- Setup: Users create Business Partners. Customer records fail field mapping. PPO orders pile up (E-016). Documents still need a Customer number.
- Expected: the new master has not removed the old replica. The office is the cost of L-001.
- Would reject L-001: BP adoption deletes Customer and Vendor while FI documents keep working with no link table and no PPO.

## X-009 Virtual table indexed into objects, then edited

- Attacks: L-003, L-004
- Setup: Palantir backs objects with a virtual table, reindexes them, then enables user edits (E-002, E-004).
- Expected: this is materialization. L-003 no longer applies. L-002 does.
- Would reject L-003: an indexed, user-editable object that still cannot diverge from the virtual table.

## X-010 Offline laptop during a bank posting

- Attacks: L-003, E-014
- Setup: A salesperson needs yesterday's orders on a plane. Virtual tables have no offline cache (E-007). Dual-write exists for offline (E-014).
- Expected: offline is a reason to project, not a reason to own. The projection is stale-tolerant and not independently authoritative for cash.
- Would reject L-003 if the only working offline design is an independently writable replica that later wins against the bank.

## X-011 GraphQL Event.timestamp Int versus String

- Attacks: L-006
- Setup: Commerce subgraph types `Event.timestamp` as `Int`. Warehouse subgraph types it as `String`. A unified ontology picks `Int`.
- Expected: composition fails (E-019). The two fields were never the same fact.
- Would reject L-006: a silent pick that never misleads a later Action.

## X-012 SPARQL SERVICE as a write SoR

- Attacks: L-003, L-012
- Setup: Someone proposes SPARQL federation as the OS data plane, including writes.
- Expected: E-018 is read-only. Writes still need an owner. Federation is not replacement.
- Would reject L-003: a federated write protocol that keeps one writer and no second store, retrieved as a standard.

## X-013 Two legal persons, one dual-write company

- Attacks: L-010, E-026
- Setup: Intercompany sale. Dual-write maps both into one Dataverse company code or refuses cross-company sharing (E-011).
- Expected: two legal events (issue 31 L3). A sync tenant is not a legal person.
- Would reject the company-as-SoR reading, not L-010 itself.

## X-014 Agent tool writes the overlay, human writes the ERP

- Attacks: L-007, L-012
- Setup: An agent applies an OS Action that edits the materialized object. A human confirms in the ERP with a different quantity. Default merge keeps the agent edit (E-004).
- Expected: two records. The next fulfillment Action cannot treat the overlay as exclusive write.
- Would reject L-012: the only usable agent Action is one that persists a winning overlay.

## X-015 Ontology revision after a mapped write

- Attacks: L-009, open question 19
- Setup: Version 1 mapped ERP `delivery_date` to promised date. An Action committed. Version 2 splits requested and promised. The ERP still has one field.
- Expected: historical explanation pins the mapping revision. The ERP field does not become four facts retroactively. Open question 19 stays open.
- Would reject nothing in this folder. It blocks an invented answer.

## X-016 Replacement of NF-e by an OS invoice type

- Attacks: L-005, L-009, L-011
- Setup: OS issues an Invoice object and treats SEFAZ XML as an export surface.
- Expected: refuse. Authorization of use is not a surface (E-021).
- Would reject L-005: official RFB text that an operational store's invoice identity is the legal document without SEFAZ authorization.
