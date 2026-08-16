# Evidence

**Kind.** domain evidence unless a block says otherwise.  
**Fetched.** 2026-08-16.  
**Decision.** none as a file. Each block has its own state.

Block labels use `E-` plus a topic. Every block names its kind, source, observed behavior, and decision state.

## E-001. Quotation is an offer with a validity window

**Kind.** domain evidence  
**Source.** SRC-EN-QT, SRC-OD-QT, SRC-MQ-ORD, SRC-VF-FLW, SRC-VF-PRP  
**Decision.** `supported`

ERPNext. A Quotation records products, quantities, prices, taxes, validity, delivery expectations, and terms offered to a Lead or Customer. `Valid Till` is the last date the offer is valid. Submission freezes the offered version. Statuses include Draft, Open, Ordered, Lost, Expired, Cancelled. A Print Heading such as Proposal or Proforma Invoice changes the printed title only. It does not change the DocType.

Odoo. A quotation outlines estimated costs and terms. Acceptance converts it into a sales order, called the final agreement before delivery and invoicing. Deadlines exist to expire the offer.

Moqui. The same `OrderHeader` can be a shopping cart (`Open`/`Tentative`), a quote (`Proposed` by vendor), or a placed order (`Accepted` by customer).

ValueFlows. An Intent is a potential future event not yet agreed by the other agent. Offers and requests are published Intents inside a Proposal. Matching can produce an Agreement.

**Source artifact.** ERPNext DocType split, Odoo one-record state machine, Moqui status-on-order, VF Proposal-plus-Intent.

**Candidate implication.** Lead or quote is Intent or published offer. It is not a commitment and not a claim.

## E-002. Accepted order records commitments, not stock or income

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-EN-PE, SRC-OD-QT, SRC-VF-FLW, SRC-VF-SPEC  
**Decision.** `supported`

ERPNext. A Sales Order records a customer's confirmed request. Submit confirms the commitment and opens picking, delivery, invoicing, purchasing, or manufacturing. Official FAQ. Submitting a Sales Order does not change stock or create accounting entries. Stock and accounting happen on later documents. Payment Entry docs say the order records the commitment, delivery records goods, invoice records the amount due, payment records money.

Odoo. Confirming a quotation creates the sales order automatically. Delivery and invoice follow.

ValueFlows. A Commitment is a planned economic flow scheduled or promised by one agent to another. Economic Events fulfill Commitments. Events are past only.

**Counterexample.** ERPNext allows a Sales Invoice with Update Stock and no Sales Order. The commitment document can be skipped. SRC-EN-SI says this is common for services and counter sales. Missing the commitment is an explicit short path, not the default model.

**Runtime consequence.** Current order status is a projection over remaining committed, reserved, delivered, billed, returned, and closed quantities. It is not a primitive field that invents those facts.

## E-003. Line identity outlives header status

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-MQ-ORD, SRC-VF-SPEC  
**Decision.** `hypothesis`

ERPNext. Each item row has its own delivery date, warehouse, reserve flag, and remaining delivered/billed quantity. After submit, `Update Items` can change allowed values unless they conflict with quantities already picked, delivered, billed, or assigned to production. Header status (`To Deliver and Bill`, `To Deliver`, `To Bill`, `Completed`, `Closed`) is derived from those row remainders.

Moqui. `OrderItem` has no `statusId`. Item status is determined from quantities on the item versus quantities fulfilled. Each item belongs to one `OrderPart`. Items are hierarchical so tax and discount can hang off a parent item.

ValueFlows. The flow (Intent, Commitment, Event, Claim) is the identified unit. An Agreement stipulates many Commitments.

**Source artifact.** ERPNext `Update Items` after submit. Sibling issue 32 `EC-SELL-01` records that submit does not freeze every line field.

**Counterexample.** Treating "the order" as one quantity hides split dates, split warehouses, and child tax lines.

## E-004. Requested, promised, planned, and actual times are different facts

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-OD-QT, SRC-MQ-SHP, SRC-VF-FLW, `docs/open-questions.md` Q3 caution  
**Decision.** `supported`

ERPNext. The Sales Order has a transaction Date and a promised Delivery Date. An item row can use a different date for split schedules. The FAQ confirms one order can have multiple delivery dates.

Odoo. Official quotation page lists issue and expiration dates. Sibling issue 33 atlas. `date_order` is creation time while draft or sent, and confirmation time after confirm. Promised delivery is `commitment_date`. Those are not one field.

Moqui. Shipment planning uses `estimatedReadyDate`, `estimatedShipDate`, `estimatedArrivalDate`, `latestCancelDate`. Route segments add `estimatedStartDate`, `estimatedArrivalDate`, `actualStartDate`, `actualArrivalDate`.

ValueFlows. Intents and Commitments are future. Economic Events are observed past. Times on plans are not times on observations.

**Candidate law.** See L-003.

## E-005. Reservation claims quantity for a purpose without moving stock

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-EN-RES, SRC-OD-RES, SRC-MQ-SHP, SRC-MQ-ACC  
**Decision.** `supported`

ERPNext. Sales Order field `Reserve Stock` "allocates available stock to the order when stock reservation is configured; it does not create a stock-ledger movement." Reservation is a later Stock Reservation Entry against the order or pick list. Unreserve cancels those entries. Auto-reserve on purchase receipt can attach newly received stock to an existing Sales Order.

Odoo. Reservation methods on an operation type are At Confirmation, Manually, and Before scheduled date. They control when products on a delivery order are reserved for the correct orders. Receipt operation types do not offer reservation methods.

Moqui. `ShipmentItemSource` looks up `AssetReservation` records for quantity to pick. `FinancialAccountAuth` reserves money on a store-credit style account before a withdraw. Those are two reservation families.

**Source artifact.** ERPNext submitted reservation document versus Odoo `reserved_quantity` on a quant. Sibling issue 33 `D-04` already named this encoding split.

**Runtime consequence.** Available-to-promise is a query over on-hand minus reservations plus inbound promises. It is not a field on the product.

## E-006. Partial fulfillment is first-class. Backorder is leftover demand

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-EN-DN, SRC-EN-SI, SRC-OD-POL  
**Decision.** `supported`

ERPNext. An order can be partially delivered or billed across multiple documents. The order stores delivery and billing percentages. Delivery Note quantities can be reduced. Two notes in two weeks for one order of ten is the documented example. Close short-closes remaining quantity without claiming it was never ordered.

Odoo. Invoice-what-is-delivered tracks delivered and invoiced quantities. Partial and complete deliveries are tracked. Backorders complete the remainder later. Official produce example. 50 ordered, 40 available, invoice 40, later deliver and invoice 10.

**Source artifact.** Odoo backorder picking as a leftover transfer. ERPNext remaining percent on the original order. Same leftover demand, different object.

## E-007. Shipment or delivery is a goods event. It is optional for billing

**Kind.** domain evidence  
**Source.** SRC-EN-DN, SRC-EN-SI, SRC-OD-POL, SRC-MQ-SHP, SRC-VF-CORE  
**Decision.** `supported` that goods movement is distinct. `rejected` that shipment is required before a claim.

ERPNext. A Delivery Note is made when a shipment leaves the warehouse. Submit writes a Stock Ledger Entry per item and updates pending Sales Order quantity. The note is optional. A Sales Invoice can be created from the order, and Update Stock can post the movement on the invoice. Official warning. Do not enable Update Stock when a Delivery Note already moved the same goods.

Odoo. Delivery is a step "if applicable." Invoice-what-is-ordered can bill after confirm with no delivery. Invoice-what-is-delivered refuses invoice creation until delivered quantity is validated.

Moqui. Shipment statuses include Input, Scheduled, Picked, Packed, Shipped, Delivered, Cancelled. Packed is "generally considered fulfilled for billing purposes" and triggers invoice creation. Shipped and Delivered remain later statuses. Estimated versus actual dates live on the route segment.

ValueFlows. Transfer and transport are Economic Events. They are not invoices.

**Counterexample to "delivery creates the receivable."** Services, maintenance orders with Skip Delivery Note, and invoice-what-is-ordered.

## E-008. Invoice is a receivable claim. It is not settlement

**Kind.** domain evidence  
**Source.** SRC-EN-SI, SRC-EN-PE, SRC-OD-POL, SRC-MQ-ACC, SRC-VF-FLW, SRC-VF-SPEC  
**Decision.** `supported`

ERPNext. Until finance issues a Sales Invoice, the customer has no formal bill and the seller has no posted receivable or sales income. Submit usually debits Customer receivable and credits income and tax. Statuses include Unpaid, Overdue, Partly Paid, Paid. Payment Entry later moves the amount from receivable to bank. It does not record sales income again.

Odoo. Invoice is the final bill based on the sales order or delivered products. Payment settles the invoice.

Moqui. An Invoice requests payment and is sent from the party that is owed to the party that owes. Outgoing invoice posts GL when status becomes Finalized. Balancing entry is accounts receivable. A Payment posts when status becomes Delivered. `PaymentApplication` links payment to invoice. Unapplied cash posts to an unapplied payment account, then a later application moves it.

ValueFlows. A Claim is a future economic event in reciprocity for an event that already occurred, for example payment for goods received. Claims resemble Commitments but are initiated by the receiver. If a Commitment already exists, a Claim is often unnecessary. Events settle Claims.

**Source artifact.** Odoo `account.move` with `move_type` `out_invoice` (sibling issue 33). ERPNext Sales Invoice writes GL Entry rows. Moqui Invoice plus later AcctgTrans. Three encodings of one commercial claim.

**Divergence.** VF says a claim is often implied by an event plus agreement. ERPs instantiate a bill as a first-class document because tax, numbering, and aging require it.

## E-009. Settlement is money movement plus allocation

**Kind.** domain evidence  
**Source.** SRC-EN-PE, SRC-MQ-ACC, SRC-OD-RET  
**Decision.** `supported`

ERPNext. One Payment Entry can settle several invoices for one party. Allocation cannot exceed the payment. Overpay leaves an unallocated advance. Payment can exist before the invoice (advance against an order) and be reconciled later. Wrong allocation is fixed by unreconcile plus reconcile, not by inventing a new customer receipt. A standard Payment Entry has one party.

Moqui. Payment can be created early on an order or order part. Application is a separate entity. A payment can apply to another payment when inbound and outbound cancel. Statuses include Proposed, Promised, Authorized, Delivered, Confirmed Paid, Void, Declined, Refunded. Auth then capture is explicit.

Odoo. After a credit note, a banner says outstanding credits can be allocated to mark the invoice paid. Allocation is a later act.

**Runtime consequence.** Bank receipt, party liability reduction, and invoice outstanding are three facts. Collapsing them into "paid" on the order hides advances, splits, and mis-allocation.

## E-010. Close remaining is not cancel. Return is not cancel

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-EN-DN, SRC-EN-RET, SRC-OD-RET, SRC-MQ-ORD, SRC-VF-FLW  
**Decision.** `supported`

ERPNext. Close when the submitted order remains historically valid but outstanding quantity will not be fulfilled. Cancel when the submitted transaction itself should be reversed, and only when linked-document state permits. Hold pauses fulfillment. Amend after cancel creates a new draft linked to the cancelled order. Delivery Note Closed manages short-close (ordered 20, closed at 15). Sales Return uses a return Delivery Note, a return Sales Invoice (Credit Note), or both. Official table separates stock effect from accounting effect. Do not return the same stock through both documents.

Odoo. Reverse Transfer returns goods. If an invoice is validated or sent, reverse transfer alone is insufficient. A Credit Note is required. Official note. Validated or sent invoices cannot be changed. After return, Delivered quantity on the sales order decreases.

Moqui. After Placed, an order is Completed, Cancelled by the customer, or Rejected by the vendor. ReturnHeader is a separate request with `returnQuantity` versus `receivedQuantity`, reason, and response (refund, store credit, replacement). Return statuses include Created, Requested, Approved, Shipped, Received, Completed, Cancelled.

ValueFlows. Economic events are immutable. Correction is another event related by `corrects`, possibly with a negative quantity.

**Sibling counterexample.** Odoo often returns a posted `account.move` to draft (`button_draft`). ERPNext refuses submitted-to-draft. See `research/odoo/disagreement-erpnext.md` `D-01` on the issue 33 branch. That is a source-system correction story, not a domain law that posted claims never existed.

## E-011. Credit limit is exposure policy at commitment and/or claim time

**Kind.** domain evidence  
**Source.** SRC-EN-CL, SRC-MQ-ACC  
**Decision.** `hypothesis` as a domain primitive. `supported` as a recurring control.

ERPNext. Limit is the maximum credit exposure for a Customer and Company. Precedence. Customer row, then Customer Group, then Company. Zero at a level is not "no credit." It means fall through. Check runs on Sales Order submit (open order value can consume credit) and Sales Invoice submit (outstanding receivables). Bypass at sales order leaves the invoice check in place. Credit Manager role may override. Payments and credit notes restore availability after ledgers update.

Moqui. `BillingAccount.accountLimit` groups invoices and payments for a bill-to / bill-from pair. Balance is unpaid invoice total minus associated payment total. Overpay creates a balance owed to the customer.

**Open.** Odoo credit-limit page was not fetched this session. Cell stays `undetermined`.

## E-012. Discounts and taxes are priced facts on the offer and the claim

**Kind.** domain evidence  
**Source.** SRC-EN-QT, SRC-EN-SO, SRC-EN-SI, SRC-MQ-ORD, SRC-MQ-ACC, SRC-OD-QT  
**Decision.** `hypothesis`

ERPNext. Item-level margin or discount, plus additional discount on Net Total or Grand Total. Pricing Rules can change rates unless ignored. Tax templates and Incoterms ride the quotation and the order. Invoice tax rows post to account heads.

Moqui. Tax and discount are often child `OrderItem` / `InvoiceItem` rows under a parent product item. Shared `ItemType` across order, invoice, and return.

Odoo. Quotations carry payment terms, pricelists, special pricing, and tax in the total.

**Not opened.** Jurisdiction, fiscal document identity, and Brazilian NFC-e/NF-e. Those belong to issue 28, not this folder.

## E-013. Price after acceptance is a new fact or a constrained amendment

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-EN-SI, SRC-VF-FLW  
**Decision.** `hypothesis`

ERPNext. After submit, item values change only through `Update Items` and only when they do not conflict with picked, delivered, billed, or production-assigned quantities. Broader change requires cancel and amend when state allows. Rate adjustment Debit Note exists for changing rate while retaining quantity on an existing invoice.

ValueFlows. Changing a promised flow after agreement is a new Commitment or a correction Event, not silent mutation of the original promise.

**Counterexample needed.** Marketplace repricing after accept. Not fetched.

## E-014. Substitution is a different resource against the same demand

**Kind.** domain evidence  
**Source.** SRC-EN-QT, sibling issue 32 `EC-ID-03`  
**Decision.** `hypothesis`

ERPNext quotation. Alternative items sit after the primary row, are excluded from totals, and are chosen when creating the Sales Order.

Sibling issue 32. Return attribution when an item doubles as an alternative. Naive "return the same item_code that was issued" fails.

**Not opened in first-party Odoo or Moqui docs this session.** Cell `undetermined` for those sources.

## E-015. Customer request can conflict with a feasible date

**Kind.** domain evidence  
**Source.** SRC-EN-SO, SRC-MQ-SHP, SRC-VF-FLW, scenarios S-001  
**Decision.** `supported` that the conflict is real. `undetermined` how each product refuses or promises anyway.

ERPNext stores a promised date even when the stock indicator is red. Promise is not availability.

Moqui stores estimated dates separately from actuals and has `latestCancelDate`.

ValueFlows treats firmness of plan as the Intent versus Commitment criterion, not agent signatures alone.

No first-party page fetched this session states a hard ATP block on order accept. Whether OS should refuse, promise with risk, or split the line is open.

## Cross-source sibling evidence used, not re-proven

**Kind.** source-system artifact (tests named on other branches)

- ERPNext `test_reserved_stock_cannot_be_delivered_against_a_different_sales_order` (issue 32). Reservation is exclusive to a commitment.
- ERPNext `test_make_sales_invoice_after_return_and_redelivery` (issue 32). Remaining billable is a function of ordered, delivered, returned, and already billed.
- ERPNext `status_updater.py` over-delivery allowance (issue 32). Overflow is policy-capped, not free.
- Odoo stock move. Done moves cannot cancel. Create a return (issue 33 `INV-STOCK-01`).
- Moqui corpus matrix cells for offer versus accepted order and packed-triggers-invoice (issue 34).
