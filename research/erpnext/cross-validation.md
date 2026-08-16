# Cross-system validation list

**Status.** Prioritized research queue for domain agents and other corpus issues.  
**Decision.** none. Nothing here is accepted.

Priority is information gain for the metamodel, not ERPNext completeness. Each item names the ERPNext evidence, the OS question it pressures, independent sources to mine, and a falsifier.

Do not treat a single-source rhyme as convergence.

## How to use

Domain issues (#14–#31, #67) should consume these cards instead of re-summarizing ERPNext. Corpus issues #33 (Odoo), #34 (Moqui), #37 (UFO/REA/PROV), #38 (GS1/ISA-95) should answer the "Ask" line.

## P0. Would change the metamodel if they fail

### XV-01. Commitment versus posted economic fact

**Priority.** P0  
**ERPNext.** Official commitment-versus-ledger table. INV-LEDGER-04. Atlas A-LEDGER, A-SELL, A-BUY.  
**OS pressure.** constitution §8. open-questions §5, §13. RFC-0001 Action vs Event.  
**Ask Odoo / Moqui / REA-ValueFlows.** Is a sales order a commitment (no stock/GL) and a delivery/invoice an event? Or do those systems post stock or accounting from the order?  
**Falsifier.** A mature system that must post GL or stock on order confirm to remain correct, with no recoverable "advance only" exception.  
**State.** hypothesis

### XV-02. Cancel is compensating facts, not erase

**Priority.** P0  
**ERPNext.** INV-LEDGER-01, INV-LEDGER-02. EC-LEDGER-01, EC-LEDGER-02. Docs + #18740.  
**OS pressure.** Scenario S-010. open-questions §6, §7.  
**Ask.** Odoo stock/account move cancel. Moqui/Mantle acctg trans. REA reversal. Formal audit standards.  
**Falsifier.** A system that deletes original ledger rows on cancel and still claims auditability, or a system that truly never reverses and only amends in place.  
**Also ask.** Do they have one cancel encoding, or several (flag, reverse, delete, delink) like ERPNext's GL vs Payment vs Leave?  
**State.** hypothesis

### XV-03. Specification / authorization / execution / transformation

**Priority.** P0  
**ERPNext.** Atlas A-MFG. INV-MFG-01 to INV-MFG-03. EC-MFG-04. BOM ≠ Work Order ≠ Job Card ≠ Stock Entry.  
**OS pressure.** open-questions §14. research-program manufacturing questions.  
**Ask.** Odoo (BOM, Manufacturing Order, Work Order). Moqui manufacturing. ISA-95 (Personnel/Equipment/Material, Process Segment vs Production Request vs Performance). ValueFlows (Recipe, Plan, Process, EconomicEvent).  
**Falsifier.** A system that uses one object for plan and actuals without losing validation that ERPNext needs (cannot cancel auth after transformation; cannot finish job without remaining qty).  
**State.** hypothesis

### XV-04. Quantity on hand is a projection over ordered movements

**Priority.** P0  
**ERPNext.** INV-STOCK-01, INV-STOCK-02. Invariant-check report. Repost jobs.  
**OS pressure.** Thesis "current state should be explainable". open-questions §6, §7. Scenario S-007.  
**Ask.** Odoo stock quant vs move. Moqui inventory. GS1 EPCIS event vs why-balance.  
**Falsifier.** A mature inventory kernel that treats on-hand as a primitive mutable qty with no movement history and still handles backdates, lots, and valuation.  
**State.** hypothesis

### XV-05. Reservation is a claim with identity, not a boolean

**Priority.** P0  
**ERPNext.** Atlas A-RESERVE. INV-RES-01, INV-RES-02. EC-RES-*.  
**OS pressure.** open-questions §12. Scenario S-002.  
**Ask.** Odoo stock reservation / planned move. Moqui allocation. ValueFlows Allocation/Reservation.  
**Falsifier.** A system that implements ATP correctly with only a reserved_qty field and no identity-bearing claim object, including serial exclusivity. Or the reverse: reservation is always just a planned stock move.  
**Note.** ERPNext itself has two reservation subsystems. Divergence inside one product weakens any "must be a DocType" claim.  
**State.** hypothesis

## P1. High leverage, slightly narrower

### XV-06. Return as signed qty versus new event

**Priority.** P1  
**ERPNext.** INV-PARTIAL-02. EC-PARTIAL-01. `is_return` + negative qty.  
**OS pressure.** Scenario S-010. open-questions §13.  
**Ask.** REA/ValueFlows return as EconomicEvent. Odoo credit note / stock return. GS1 EPCIS.  
**Falsifier.** Independent models that cannot express return as negative qty on the same type without losing meaning (or the reverse).  
**State.** undetermined

### XV-07. Partial fulfillment mutates remaining open qty on the same commitment

**Priority.** P1  
**ERPNext.** INV-PARTIAL-01. EC-PARTIAL-01. status_updater allowances.  
**OS pressure.** Scenario S-002. research-program O2C/P2P partials.  
**Ask.** Odoo `qty_delivered` / invoice status. Moqui order item.  
**Falsifier.** A system that must split the order into new identities on every partial, or that forbids partials in real deployments.  
**State.** hypothesis

### XV-08. Party as kind versus role

**Priority.** P1  
**ERPNext.** Customer and Supplier DocTypes. `Party Link` and common-party accounting. Lead-to-Customer conversion. PO `customer` field for drop ship.  
**OS pressure.** Scenario S-005. open-questions §12, §13.  
**Ask.** UFO/OntoUML role vs kind. ValueFlows Agent + role. Odoo `res.partner`. Moqui Party/Role.  
**Falsifier.** If every independent source uses one Party with roles, ERPNext's two kinds are a source artifact. If several independent ERPs need two enduring kinds, the OS role hypothesis is weaker.  
**State.** undetermined

### XV-09. Lot/serial identity and pre-creation

**Priority.** P1  
**ERPNext.** Atlas A-IDENTITY. INV-ID-*. EC-ID-01 (serial before stock), EC-ID-02 (rework reuse).  
**OS pressure.** Scenario S-008. open-questions §14. GS1.  
**Ask.** GS1 EPCIS/LGTIN/SGTIN. Odoo lot/serial. Moqui.  
**Falsifier.** Identity that is only a qty attribute, or identity that cannot exist before the first event.  
**State.** hypothesis

### XV-10. Backdate changes later valuation (valid time vs known time)

**Priority.** P1  
**ERPNext.** EC-STOCK-01. Immutable-ledger docs. `posting_date` vs `creation`. Immutable reverse re-dated to today.  
**OS pressure.** open-questions §7. Scenario S-007.  
**Ask.** Bitemporal literature. Odoo inventory valuation. Formal accounting close.  
**Falsifier.** A system that can answer both "stock as known on T" and "stock now believed on T" without two time dimensions, or proof that one dimension always suffices.  
**State.** undetermined

### XV-11. Close / stop versus cancel versus amend versus return

**Priority.** P1  
**ERPNext.** INV-DOC-02, INV-DOC-03. EC-SELL-02.  
**OS pressure.** open-questions §4. Scenario S-010.  
**Ask.** What terminal acts exist in Odoo and Moqui, and which write compensating facts.  
**Falsifier.** A single "void" that covers all four without losing audit or remaining-qty semantics.  
**State.** hypothesis

## P2. Needed, but after P0/P1

### XV-12. Quality gate versus quality system

**Priority.** P2  
**ERPNext.** Atlas A-QUAL. EC-QUAL-01 (warn vs stop).  
**Ask.** ISA-95 quality. ISO records vs MES hold. Odoo quality.  
**State.** hypothesis

### XV-13. Asset register versus inventory

**Priority.** P2  
**ERPNext.** Atlas A-ASSET. INV-ASSET-01. Item flags `is_fixed_asset` vs `is_stock_item`.  
**Ask.** REA resource classification. IFRS/local GAAP. Odoo account_asset.  
**State.** hypothesis

### XV-14. Employment as relator, leave as interval ledger

**Priority.** P2  
**ERPNext.** Atlas A-HR. EC-HR-01 (delete), EC-HR-02 (repo split).  
**OS pressure.** Scenario S-006. open-questions §12.  
**Ask.** UFO relator. Other HRMS leave ledgers.  
**State.** undetermined

### XV-15. Payment allocation is not the cash event

**Priority.** P2  
**ERPNext.** Payment Entry vs Payment Ledger vs Payment Reconciliation. Official docs.  
**Ask.** REA Claim/Settlement. Odoo reconciliation. Moqui invoice/payment appl.  
**State.** hypothesis

### XV-16. Co-products, by-products, process loss, rework

**Priority.** P2  
**ERPNext.** INV-MFG-04. EC-MFG-03. Secondary items. Corrective Job Card.  
**OS pressure.** Scenario S-009.  
**Ask.** ISA-95. ValueFlows. Odoo unbuild/byproduct.  
**State.** hypothesis

### XV-17. Subcontracting as a distinct flow

**Priority.** P2  
**ERPNext.** `erpnext/subcontracting` module. WO `subcontracting_inward_order_item`. SO `is_subcontracted` skips normal reservation.  
**Ask.** Odoo subcontracting. ISA-95.  
**State.** undetermined (thin pass)

### XV-18. Multi-entity: pair of documents versus one event, two views

**Priority.** P2  
**ERPNext.** Inter-company order/invoice references. EC-XCUT-02.  
**Ask.** Moqui multi-org. Formal intercompany.  
**State.** undetermined

### XV-19. Update-after-submit on commitments

**Priority.** P2  
**ERPNext.** EC-SELL-01. Framework hook `on_update_after_submit`.  
**OS pressure.** open-questions §4, §6.  
**Ask.** Whether other systems freeze the order and force amend, or also allow line edits.  
**Falsifier.** If every mature system allows silent line edits, Action-as-only-mutation is harder. If none do, ERPNext's hook is a source artifact.  
**State.** undetermined

### XV-20. Unknown external outcome

**Priority.** P2  
**ERPNext.** Almost absent. Submit is synchronous. Repost jobs are the closest "later" object.  
**OS pressure.** open-questions §5. Scenario S-004.  
**Ask.** This is a gap, not a finding. Do not invent ERPNext support. Look at other corpora.  
**State.** undetermined

## Suggested consumption order for other issues

| Issue | First cards |
| --- | --- |
| #15 product/resource identity | XV-09, XV-13 |
| #16 order-to-cash | XV-01, XV-06, XV-07, XV-11, XV-15 |
| #17 procure-to-pay | XV-01, XV-07, XV-15, XV-17 |
| #18 inventory | XV-04, XV-05, XV-09, XV-10 |
| #19 manufacturing | XV-03, XV-16, XV-17 |
| #21 accounting | XV-01, XV-02, XV-15 |
| #24 quality | XV-12 |
| #25 assets | XV-13 |
| #27 HR | XV-14 |
| #28 projects | thinner ERPNext pass; do not wait |
| #29 CRM | XV-08, EC-CRM-01 |
| #33 Odoo | XV-01 to XV-11 |
| #34 Moqui | XV-01 to XV-08, XV-15, XV-18 |
| #37 REA/UFO/PROV | XV-01, XV-02, XV-08, XV-14 |
| #38 GS1 / ISA-95 | XV-03, XV-04, XV-09, XV-12, XV-16 |

## Explicit non-claims

ERPNext is not proposed as the OS foundation.  
A DocType is not an ObjectType.  
RFC-0001 is still `hypothesis`.  
`docs/open-questions.md` is unanswered.
