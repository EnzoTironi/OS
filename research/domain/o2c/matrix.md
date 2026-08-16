# Convergence matrix

**Kind.** domain evidence (comparison). Source encodings are marked as source-system artifact.  
**Decision.** per row.

Legend. ✓ distinction present. ~ present but collapsed into another record. ? not opened this session. ✗ contradicted as a universal requirement.

| Distinction | ERPNext | Odoo 18 docs | Moqui/Mantle | REA/VF | Standard | Notes | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lead / quote / offer vs intent | Quotation to Lead or Customer. Valid Till. E-001 | Quotation state on `sale.order`. E-001 | Order status Proposed. E-001 | Intent, often published in Proposal. E-001 | ? | Converge that offer is one-sided and expirable | `supported` |
| Quote vs accepted order identity | Separate DocTypes | Same record, state change | Same OrderHeader, status change | Intent then Commitment, often new objects | ? | Diverge on identity. Converge on phase | `undetermined` |
| Accepted order vs agreement of commitments | SO is the commitment bundle. E-002 | Confirmed SO is "final agreement". SRC-OD-QT | Placed/Accepted order. Parts can split parties | Agreement stipulates reciprocal Commitments | ? | ERP documents look like Agreement surfaces | `hypothesis` |
| Line identity | Item rows with own dates and remainders. E-003 | Order lines (sibling 33) | OrderItem per OrderPart, hierarchical. E-003 | Each flow is identified | ? | Header status is a projection | `hypothesis` |
| Requested / promised / planned / actual | Date vs Delivery Date vs later DN posting. E-004 | `date_order` vs `commitment_date` vs picking actual (sibling 33) | estimated* vs actual* on shipment. E-004 | Intent/Commitment vs Event | ? | Strongest date split is Mantle + VF | `supported` |
| Reservation ≠ on-hand | SRE document. E-005 | Reservation method + quant reserved qty. E-005 | AssetReservation. E-005 | ? no first-class reserve in fetched VF pages | ? | Encoding diverges. Meaning converges | `supported` |
| Partial fulfillment / leftover demand | percents + extra DN/SI. E-006 | delivered/invoiced qty + backorder. E-006 | quantity vs quantityNotHandled. SRC-MQ-SHP | Event can fulfill part of Commitment | ? | Converge | `supported` |
| Shipment / delivery event | Delivery Note, optional. E-007 | Picking validate, optional for invoice-ordered. E-007 | Shipment. Packed vs Shipped vs Delivered. E-007 | Transfer / transport Event | ? | Required-before-bill is ✗ | `supported` / `rejected` as universal |
| Invoice vs receivable claim | Sales Invoice posts AR. E-008 | Invoice / `account.move`. E-008 | Invoice Finalized posts AR. E-008 | Claim, often implied | ? | Instantiated bill is ERP. Implied claim is VF | `supported` that a claim exists |
| Invoice vs journal identity | SI writes GL. JE is other DocType | Invoice is a journal move (sibling 33 D-03) | Invoice triggers AcctgTrans | Event, not journal | ? | Source artifact | `undetermined` |
| Payment vs settlement allocation | Payment Entry + references. E-009 | Payment then allocate credits. E-009 | Payment + PaymentApplication. E-009 | Event settles Claim | ? | Allocation is a third fact | `supported` |
| Advance before invoice | PE against SO, later reconcile. SRC-EN-PE | Down payments page not fetched | Payment on order early. SRC-MQ-ACC | Commitment to transfer money first | ? | Converge where opened | `hypothesis` |
| Close leftover vs cancel history | Close vs Cancel. E-010 | Cancel state vs reverse transfer | Cancelled / Rejected vs ReturnHeader | Correcting Event, not delete | ? | Converge | `supported` |
| Goods return vs money credit | DN return and/or Credit Note. E-010 | Reverse Transfer and/or Credit Note. E-010 | receivedQuantity vs refund Payment / ReturnItemBilling | Two Events | ? | Converge they can split | `supported` |
| Credit limit | Customer+Company, SO and/or SI. E-011 | ? | BillingAccount.accountLimit. E-011 | ? | ? | Policy overlay vs primitive | `hypothesis` |
| Discounts / taxes as priced facts | Rules + templates. E-012 | Pricelist + tax on quote. E-012 | Child items, shared ItemType. E-012 | Reciprocal flows | ? | Fiscal identity not opened | `hypothesis` |
| Over-delivery cap | Allowance on item/settings (sibling 32) | ? this session | quantityNotHandled implies short, not over | Event qty can exceed Commitment | ? | Policy, not free | `hypothesis` |
| Substitution | Quotation alternatives. E-014 | Optional products page not mined | ? | Different Resource on later Event | ? | Thin | `undetermined` |
| Multi-party / multi-address split | Shipping vs billing address. Inter-company ref | Different delivery and invoice addresses. SRC-OD-QT | OrderPart with customer and vendor. SRC-MQ-ORD | Many agents on Agreement | ? | Mantle is richer | `hypothesis` |
| Customer as role vs kind | Customer master (sibling 32) | Partner flags (sibling 33) | Party + role on OrderPart | Agent | ? | Owned by issue 14 | `undetermined` here |

## Divergence that matters

1. **Identity of the offer.** One record (Odoo, Moqui) versus two documents (ERPNext) versus Intent/Proposal objects (VF). Do not freeze a DocType count.
2. **Must shipment precede the claim?** No. Odoo invoice-ordered, ERPNext Update Stock, services, and VF implied claims all allow a receivable without a delivery document.
3. **Reservation storage.** Document (ERPNext), field on quant (Odoo), asset reservation (Moqui). The law is exclusivity of a quantity slice to a purpose, not the table.
4. **May a posted claim return to draft?** Odoo often yes. ERPNext no. VF no (correcting event). This is a kill-test input for Action versus Event, not an O2C primitive.
5. **Is the invoice the journal?** Odoo collapsed them. ERPNext and Moqui did not. Source artifact until accounting research (issue 21) rules.

## Convergence that should survive synthesis

Offer → reciprocal commitments → optional reservation → goods or service event → claim → allocation of settlement. Partial quantities at every step. Close leftover without erasing history. Return goods and credit money as separable compensating events.
