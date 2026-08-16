# Lifecycle ownership

**Kind.** explanation. Domain evidence for the splits. Source-system artifact for the product names. Candidate law for the arrows.
**Fetched.** 2026-08-16
**Decision.** `hypothesis` as an OS lifecycle. `supported` for the ownership tests the sources already force.

Names in `code` are research labels, not types to implement.

## Where a Product is created

There is no single create site. Issue 15 already split specification, SKU, lot, and serial. Dual-write still sells "unified product mastering" as a table map (E-009, E-022). Apollo lets two subgraphs contribute fields to `Product` and says neither owns it.

A useful create test.

| Grain | Who may mint identity | Who may edit commercial terms | Who may edit stockable identity |
| --- | --- | --- | --- |
| Resource specification | Engineering or a standards body | no | no |
| Sellable SKU | The catalog owner for that legal person | pricing relationship, not the SKU | packaging and GTIN rules |
| Marketplace listing | The marketplace | the marketplace, often | the seller's SKU, mapped |
| Lot or serial | The plant or the receiving dock | no | no |
| Valuation class | Accounting policy | no | no |

OS should create a Product only when it is the catalog owner for that grain and no other writer will mint the same identity. Otherwise OS virtualizes the source identity and records a dated correspondence. It does not mint a second SKU that "means the same item".

Sibling issue 31 L7 already says a product can be one individual across a group while prices and tax templates differ per legal person. A materialized global Product that carries one price is a collapsed grain.

**Decision state.** `supported` that create is per grain. `undetermined` for the exact minting Action names.

## Who owns a Sales Order

Issue 16's chain is the domain evidence.

```text
Intent -> Offer -> acceptance -> Agreement of Commitments
    -> optional Reservation
    -> Fulfillment Event
    -> Claim
    -> Settlement Event
    -> Allocation
```

"Sales Order" in an ERP is usually the Agreement plus leftover demand. A marketplace order is often the customer's Offer or the marketplace's own Agreement. A CRM opportunity is Intent. An invoice is a Claim. Dual-write maps "prospect-to-cash" as if those documents can be one synchronized pair (E-009). They cannot share one SoR unless one system is the only writer for that step.

Ownership test for a commitment.

1. Who may accept, hold, or close leftover demand?
2. Who may promise a date the company can be sued on?
3. Who runs reservation and fulfillment?
4. Who issues the fiscal document that covers the same quantity?

If the answers are four systems, OS does not own "the Sales Order". It may own the company's commitment if the order desk lives in OS and the marketplace is only an intake surface. It may virtualize the marketplace order and own only the internal commitment. It must refuse to copy the marketplace order into an editable OS object that sales can rewrite after the customer already paid the marketplace.

**Decision state.** `supported` that the document name is not ownership. `undetermined` for marketplace contracts, which were not retrieved.

## When OS becomes system of record

OS becomes SoR for a grain when all of the following hold.

1. OS is the only writer. The source API for that grain is closed, read-only, or a projection of OS.
2. Bypass is a defect. `doInsert`-class paths are off or reconciled as incidents, not as supported shortcuts (E-012).
3. Legal capacity exists if the grain is a legal act. OS cannot become SoR for an NF-e by storing the XML (E-021).
4. Invariants for that grain are enforced at OS commit, and foreign systems consume the result rather than re-deciding it.

Until then OS may virtualize, may project, and must not claim current-state authority.

A cutover can be staged per grain. Catalog SKUs first, then internal commitments, never SEFAZ authorization. Dual-write's 1:1 environment limit and 250-entity live-sync cap (E-011, E-013) are evidence that even a vendor-owned pair of apps cannot treat "the company" as one SoR switch.

**Decision state.** `supported` for the four conditions. `hypothesis` for the staging order.

## What happens when source users bypass OS

They write the system of record. OS did not hear it.

Documented forms.

- X++ `doInsert` / `doUpdate` / `doDelete` skip dual-write (E-012).
- Palantir pipeline refresh after a user edit is ignored on edited properties (E-004). The bypass is in the other direction. The source told the truth and the ontology kept the overlay.
- SAP transaction BP can create a Postprocessing Office order instead of a consistent Customer (E-016).
- SEFAZ contingency emission authorizes a document while the emitter's line is down. The ERP learns later.
- Spreadsheets and machine historians write facts that never pass an Action form.

If bypass is the default operating mode, a materialized OS object is a cache with opinions. The runtime consequence is not a smarter merge. It is to treat the bypassed write as a new observation with provenance, or to refuse current-state queries until reconciliation. Issue 60's reconciliation Decision is the pointer. This folder does not invent a new truth layer.

**Decision state.** `supported` that bypass leaves a replica stale. `undetermined` for the exact reconciliation Action, which is issue 60 and open question 3.

## How write conflicts are reconciled

There is no 2PC across OS and a foreign SoR (E-003, E-011). Any design that needs one is already false.

Observed strategies, all source-system artifacts.

| Strategy | Who wins | What is lost | Where seen |
| --- | --- | --- | --- |
| User edits always win | ontology overlay | later source updates to edited properties | Palantir default (E-004) |
| Most recent timestamp | whichever clock is later | legal valid time, late authorization | Palantir strategy 2 (E-004) |
| Abort both sides on timeout | neither | the in-flight business act may have happened | dual-write two-minute window (E-013) |
| Accept one side | the side that committed | the other store | dual-write product receipt (E-011), Palantir writeback (E-003) |
| Postprocessing order | neither until a human | operational time | SAP PPO (E-016) |
| Composition failure | neither schema | the unified type | Apollo (E-019) |
| Source logic wins | the SoR | the overlay's convenience | F&O virtual entities (E-008) |

The last row is the only strategy that does not create a second fact. Virtualized writes run the source. Materialized writes must keep both records and name the Decision that later Actions used. They must not drop the loser.

A fiscal or bank conflict is not a timestamp contest. SEFAZ authorization at a protocol number beats an OS edit with a later clock (E-021). A bank statement line beats a cash-book guess. The bank-statement case stays `hypothesis` until a named manual is cited. The shape matches NF-e.

**Decision state.** `supported` that 2PC is unavailable and that dropping the loser is unsafe. `hypothesis` for bank-statement priority.
