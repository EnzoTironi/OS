---
issue: 17
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The goal is evidence of semantic agreement or disagreement. This is not a feature checklist.

Legend: Y = the distinction is documented. P = partial or collapsed into another record. N = not found in pages fetched this session. ? = undetermined.

## Convergence matrix

| Distinction | ERPNext | Odoo | Moqui | REA/VF | Standard | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Need versus commercial commitment | Y | P | P | Y | Y | E2, E22, E28. Odoo starts at RFQ. Moqui starts at PO in the Marble guide. UBL has RFQ before Order. |
| Internal requisition versus supplier RFQ | Y | N | N | Y | Y | E2, E3, E23, E28. Odoo RFQ is supplier-facing. VF Intent can be unpublished planning. |
| Offer versus accepted commitment | Y | P | P | Y | Y | E4, E5, E13, E18, E22, E28. Odoo confirm transforms RFQ into PO. Moqui quote is Proposed status on the same OrderHeader. |
| Standing agreement versus release order | Y | Y | ? | Y | P | E6, E16, E23. Moqui mentions auto-reorder status. UBL has forecast and order, not a named blanket type in the rows read. |
| Commitment versus physical receipt | Y | Y | Y | Y | Y | E5, E7, E13, E19, E22, E28. UBL Order versus ReceiptAdvice or PurchaseReceipt. |
| Partial receipt | Y | Y | Y | Y | Y | E7, E15, E19, E22. Events can fulfill part of a commitment. |
| Accepted versus rejected quantity | Y | P | Y | P | P | E7, E19, E21. Odoo quality fail is location or check, not a rejected-qty field on the pages read. VF uses state or a later event. |
| Custody versus rights or risk | P | P | P | Y | Y | E24, E26, E27. ERPs usually post stock at warehouse receipt. Incoterms and GS1 keep the split. |
| Inspection or quarantine versus available stock | Y | Y | P | P | P | E8, E17. Moqui story has a checklist then put-away. VF resource state is available but not fetched in full this pass. |
| Receipt versus payable claim | Y | Y | Y | Y | Y | E9, E14, E19, E22, E28, E30, E31. |
| Ordered-quantity billing versus received-quantity billing | Y | Y | P | Y | Y | E1, E9, E14. Moqui generates from received quantity. VF claim can follow event or stay implied. UBL has Invoice and SelfBilledInvoice. |
| Three-way match of order, receipt, claim | P | Y | Y | P | P | E15, E19. ERPNext tracks billed and received percentages. VF has fulfill and settle links, not a named match control. |
| Duplicate supplier invoice identity | Y | ? | P | N | P | E9 Supplier Invoice No. Moqui clerk copies supplier numbers onto the generated invoice. UBL Invoice has seller-assigned ID. |
| Landed cost after receipt | Y | ? | P | P | P | E10. Moqui clerk adds shipping charges on the payable. UBL FreightInvoice exists. Odoo landed cost was not fetched this pass. |
| Return as compensating event | Y | ? | Y | Y | Y | E11, E21, E25. UBL CreditNote. Odoo return pages were not fetched. |
| Prepayment before invoice | Y | ? | P | Y | P | E12. Payment against PO. VF claim and settlement can be sequenced either way. Moqui payment is after approved invoice in the guide. |
| Event correction without rewrite | P | P | P | Y | P | E25. ERPNext cancel and amend, LCV repost, debit note. Odoo credit note. Moqui new invoice items. |
| Supplier as role, not Kind | P | Y | Y | Y | ? | E32. Cross-link party issue 14. |
| Specification before instance | Y | Y | Y | Y | Y | E32. Cross-link product issue 15. Lot and serial enter at receipt. |

## Divergence that matters

### D1. Is RFQ a document or a state?

**Odoo.** RFQ and purchase order share one record. Confirm changes meaning from request to commitment.

**ERPNext and UBL.** RFQ and order are different documents. A supplier quotation sits between them.

**Moqui.** Quote is Proposed status on OrderHeader.

**Decision state.** `supported` that request and commitment differ. `undetermined` whether they need two identities or one identity with a phase.

**Kind.** Divergence.

### D2. When may a payable be recognized?

**Odoo ordered quantities.** Draft bill at PO confirm, before receipt.

**Odoo received quantities and three-way match.** Bill after at least partial receipt.

**ERPNext.** Invoice from order, from receipt, or direct. Buying Settings can skip receipt.

**Moqui Marble.** Invoice generated from delivered quantity, then edited to match the supplier bill.

**ValueFlows.** Claim is receiver-initiated and often follows an Economic Event. It can stay implied.

**Decision state.** `supported` that policy chooses the trigger. `rejected` that one trigger is the domain law.

### D3. Does over-receipt change the commitment?

**Moqui receiver story.** Higher received quantity automatically adjusts the PO.

**ERPNext.** Extra quantity can be received. Close is the tool for short-close, not for surplus. Over-receipt policy was not fully specified on the pages fetched.

**Odoo.** Draft bills can be edited. Should Be Paid becomes Exception.

**ValueFlows.** A surplus event can satisfy no commitment, or a new commitment is needed.

**Decision state.** `undetermined` for a single surplus law. Record surplus as an event in any case.

### D4. Who authors the first payable?

**Moqui.** The system authors a payable from receipt. The supplier bill is reconciled into that record.

**ERPNext and Odoo.** The supplier bill is the usual payable. Receipt creates stock and a clearing account, not the supplier's claim.

**UBL.** Invoice and SelfBilledInvoice are both first-class.

**Decision state.** `supported` that implied claim and supplier claim can both exist. `hypothesis` for which one is operationally authoritative.

### D5. Does warehouse receipt transfer ownership?

**ERP stock ledgers.** Receipt usually increases company stock value.

**Incoterms.** Delivery transfers risk, not title.

**GS1.** Owning party and possessing party are different.

**ValueFlows.** Rights transfer and custody transfer are different actions.

**Decision state.** `supported` that they are different facts. ERP default posting is a source convention.

## Source artifacts, do not import as OS types

| Artifact | Source | Why it is an artifact |
| --- | --- | --- |
| Seven buying DocTypes | ERPNext | Stages can be skipped. Names are product history. |
| `purchase.order` draft through purchase | Odoo | Request and commitment share a row. |
| `account.move` vendor bill | Odoo | Accounting document family, not a P2P primitive. |
| `stock.picking` receipt | Odoo | Warehouse operation, not the only receipt meaning. |
| OrderHeader cart, quote, and order | Moqui | One entity, many economic stages. |
| OrderItemBilling | Moqui | Join table for order, invoice, shipment, asset receipt. |
| Update Stock on Purchase Invoice | ERPNext | Collapses receipt into the claim when set. |
| Should Be Paid | Odoo | UI field for match exception. |
| Landed Cost Voucher | ERPNext | Tool that posts a valuation correction. |
| UBL XML document types | OASIS | Interchange envelopes. Useful as evidence of splits, not as kernel types. |
| CBV URI `owning_party` | GS1 | Identifier in an event payload. The distinction matters. The URI does not. |

## Cross-links

- Party role versus Kind. `research/domain/party/candidate-laws.md` L1 on `cursor/issue-14-domain-cfd8`.
- Product specification versus instance. `research/domain/product/hierarchy.md` on `cursor/issue-15-domain-cfd8`.
- Formal economic cycle. `research/valueflows-rea/issue-0037-economic-cycle.md` on `cursor/issue-37-corpus-cfd8`. That note rejects VF class names as RFC-0001 primitives and still supports the stage distinctions.
