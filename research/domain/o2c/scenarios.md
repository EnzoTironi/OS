# Scenario cards

**Kind.** counterexample (each card tries to break a candidate law) plus domain evidence (when a source already runs the case).  
**Decision.** per card. These are research tests, not executable suite code.

Seed overlap. S-001, S-002, S-010 in `scenarios/README.md` are restated here with O2C IDs so a synthesis agent can query one folder.

A card is useful only if a candidate model must say what remains true.

## S-O2C-01. Four times on one line

**Attacks.** L-003  
**Setup.** Customer requests 18 Aug. Seller promises 20 Aug. Planning puts pick on 21 Aug. Carrier delivers 22 Aug.  
**Must answer.** Can the system report each date after the fact? Which one is late?  
**Source echo.** ERPNext header versus row Delivery Date. Odoo `commitment_date` versus picking. Moqui estimated versus actual.  
**State.** `supported` as a required distinction

## S-O2C-02. Partial ship, leftover demand

**Attacks.** L-005  
**Setup.** Order 10. Ship 4. Produce 4. Buy 2. After first ship, customer asks to accelerate the rest.  
**Must answer.** Same Commitment identity? New plan versus mutated history? Reservation versus possession?  
**Source echo.** ERPNext multiple Delivery Notes. Odoo backorder. `scenarios/README.md` S-002.  
**State.** `supported`

## S-O2C-03. Split shipments to two addresses

**Attacks.** L-005, line identity  
**Setup.** One accepted order. 6 units to warehouse A date D1. 4 units to warehouse B date D2. Two packages, two carriers.  
**Must answer.** Is the split a property of the Agreement, of Commitments, or of Fulfillment Events?  
**Source echo.** ERPNext row-level dates and warehouses. Moqui OrderPart by address and method. Odoo different delivery and invoice addresses.  
**State.** `hypothesis`

## S-O2C-04. Over-delivery

**Attacks.** L-005, overflow policy  
**Setup.** Promise 10. Warehouse ships 12.  
**Must answer.** Is 2 a new sale, a policy-capped Event, or an error? Does billing follow 10 or 12?  
**Source echo.** Sibling issue 32 over-delivery allowance. Not opened in Odoo docs this session.  
**State.** `hypothesis`

## S-O2C-05. Substitution at pick

**Attacks.** L-004, resource identity  
**Setup.** Commitment is item P. Picker ships approved alternative Q. Customer later returns Q.  
**Must answer.** Does the Commitment change resource, or does the Event cite a different resource against the same demand? How does return attribute?  
**Source echo.** ERPNext quotation alternatives. Issue 32 alternative-on-return tests.  
**State.** `undetermined` as a law

## S-O2C-06. Price changed after acceptance

**Attacks.** L-011  
**Setup.** Accept at 100. Pricelist next day is 90. Finance wants the invoice at 90. Warehouse already reserved at 100.  
**Must answer.** Who is owed 100? Is the change amend, new Agreement, or rate-adjustment Claim?  
**Source echo.** ERPNext Update Items after submit, else cancel and amend.  
**State.** `hypothesis`

## S-O2C-07. Cancel after shipment

**Attacks.** L-008, L-009  
**Setup.** Delivery Note or picking is done. Customer cancels.  
**Must answer.** Is cancel refused? Must a return Event be created? Does a claim already exist?  
**Source echo.** ERPNext cancel blocked by linked docs. Odoo done stock move cannot cancel. Create a return. VF correcting Event.  
**State.** `supported`

## S-O2C-08. Return after payment

**Attacks.** L-007, L-009  
**Setup.** Delivered, invoiced, paid. Customer returns goods.  
**Must answer.** Goods Event, credit Claim, refund Settlement or credit left unallocated. Which combination is recorded?  
**Source echo.** ERPNext return table. Odoo reverse transfer plus credit note plus allocate banner. Moqui refund Payment on ReturnItem.  
**State.** `supported`

## S-O2C-09. Requested date versus feasible date

**Attacks.** L-003, L-002  
**Setup.** Customer requires Friday. ATP says Tuesday. Sales accepts Friday anyway.  
**Must answer.** Does accept store a lie, a risk, or two dates? Can later planning show the conflict?  
**Source echo.** ERPNext allows a promised date while stock dot is red. No hard ATP block fetched.  
**State.** `undetermined` for refusal policy. `supported` that both dates must exist

## S-O2C-10. Invoice what is ordered, nothing shipped

**Attacks.** L-006  
**Setup.** Confirm order. Create invoice. Stock still in warehouse.  
**Must answer.** Is the Claim legal? What leftover demand remains for goods?  
**Source echo.** Odoo invoice-what-is-ordered. ERPNext invoice from Sales Order.  
**State.** `supported` as a permitted path

## S-O2C-11. Ship first, bill later, then partial bill

**Attacks.** L-006, L-005  
**Setup.** Ship 10. Invoice 6. Later invoice 4.  
**Must answer.** Two Claims against one Fulfillment. Delivered percent 100. Billed percent 60 then 100.  
**Source echo.** ERPNext To Bill after delivery. Odoo invoice-what-is-delivered.  
**State.** `supported`

## S-O2C-12. Advance then invoice

**Attacks.** L-007  
**Setup.** Customer pays 30% on accept. Invoice later for 100%. Allocate 30, request 70.  
**Must answer.** Settlement exists before Claim. Unallocated remainder is not income twice.  
**Source echo.** ERPNext Payment Entry against Sales Order, later reconciliation. Moqui Payment on order part.  
**State.** `supported`

## S-O2C-13. Credit limit at order versus invoice

**Attacks.** L-010  
**Setup.** Limit 50. Open orders 45. New order 10. Bypass-at-SO is on. Invoice later for 55 outstanding.  
**Must answer.** Order accepted. Invoice blocked unless Credit Manager overrides.  
**Source echo.** SRC-EN-CL.  
**State.** `supported` inside ERPNext. `undetermined` as universal

## S-O2C-14. Close remaining after partial ship

**Attacks.** L-008  
**Setup.** Order 20. Ship and bill 15. Customer will not take 5.  
**Must answer.** Close leaves history. Cancel of the order is the wrong verb.  
**Source echo.** ERPNext Close Sales Order. Delivery Note Closed short-close example.  
**State.** `supported`

## S-O2C-15. Reserved stock stolen by another order

**Attacks.** L-004  
**Setup.** Order A reserves serial S. Order B tries to deliver S.  
**Must answer.** Refuse, or require unreserve then reserve.  
**Source echo.** Issue 32 `test_reserved_stock_cannot_be_delivered_against_a_different_sales_order`.  
**State.** `supported` in ERPNext. `hypothesis` as domain law

## S-O2C-16. Expired quote then late accept

**Attacks.** L-001, L-011  
**Setup.** Quotation Valid Till Monday. Customer accepts Wednesday. Prices moved Tuesday.  
**Must answer.** Is accept refused, or is a new Offer required? Which price binds?  
**Source echo.** ERPNext Expired status. Odoo quotation deadlines.  
**State.** `hypothesis`

## S-O2C-17. Goods return, no credit yet

**Attacks.** L-009  
**Setup.** Return Delivery Note receives stock. Finance has not issued a credit note.  
**Must answer.** On-hand up. Receivable unchanged. Later Claim must not move stock again.  
**Source echo.** ERPNext official return table.  
**State.** `supported`

## S-O2C-18. Price credit, no goods

**Attacks.** L-009, L-011  
**Setup.** Customer keeps goods. Seller issues credit for a pricing error.  
**Must answer.** No stock Event. Claim reduces receivable. If already paid, unallocated credit or refund.  
**Source echo.** ERPNext return invoice without Update Stock. Odoo credit note path.  
**State.** `supported`

## S-O2C-19. Payment allocated to the wrong invoice

**Attacks.** L-007  
**Setup.** One customer, two open Claims. Cash applied to the later one.  
**Must answer.** Unallocate and reallocate without inventing a second bank Event.  
**Source echo.** ERPNext Unreconcile Payments plus Payment Reconciliation.  
**State.** `supported`

## S-O2C-20. Overpay, unallocated cash

**Attacks.** L-007  
**Setup.** Invoice 100. Payment 120.  
**Must answer.** 20 remains unapplied. Later Claim or refund consumes it. Exposure and credit limit must see the 20.  
**Source echo.** ERPNext FAQ on overpay. Moqui BillingAccount positive customer balance.  
**State.** `supported`

## S-O2C-21. Direct invoice, no order

**Attacks.** L-002, L-005  
**Setup.** Counter sale. Sales Invoice with Update Stock. No Sales Order.  
**Must answer.** Claim and goods Event exist. Leftover-demand percent on an order does not. Official docs warn the short path loses that control.  
**Source echo.** SRC-EN-SI.  
**State.** `supported` as an allowed loss of control, not the default model

## S-O2C-22. Multi-party order part

**Attacks.** agreement identity  
**Setup.** One commercial deal. Vendor org V sells to customer C, ship from facility F2, bill-to parent P.  
**Must answer.** Are customer and vendor roles on the Agreement, on a part, or on each Commitment?  
**Source echo.** Moqui OrderPart `customerPartyId` and `vendorPartyId`. ERPNext one Customer plus Company.  
**State.** `hypothesis`. Cross-link issue 14 party notes when they exist

## S-O2C-23. Unreserve then cancel before ship

**Attacks.** L-004, L-008  
**Setup.** Accepted, reserved, not shipped. Customer cancels.  
**Must answer.** Unreserve restores availability. Cancel of the Commitment is now legal if no other dependents.  
**Source echo.** ERPNext unreserve cancels SRE. Cancel SO still blocked by draft invoices if any.  
**State.** `hypothesis`

## S-O2C-24. Return, redeliver, remaining billable

**Attacks.** L-005, L-009  
**Setup.** Order 10. Ship 10. Return 3. Ship 3 again. Invoice once at the end.  
**Must answer.** Billable is not "original 10" and not "a new order." It is a function of ordered, delivered, returned, billed.  
**Source echo.** Issue 32 `test_make_sales_invoice_after_return_and_redelivery`.  
**State.** `supported` in ERPNext. `hypothesis` as domain law

## S-O2C-25. Tax and discount as children of a line

**Attacks.** line identity, E-012  
**Setup.** Product line 100. Child discount -10. Child tax 9. Return the product only.  
**Must answer.** Do tax and discount reverse with the parent, or need their own ReturnItems?  
**Source echo.** Moqui hierarchical items and ReturnItem for tax, shipping, discount.  
**State.** `hypothesis`

## Coverage versus issue 16 ask

| Asked topic | Cards |
| --- | --- |
| Lead/quote/offer vs intent | 01, 16 |
| Accepted order vs agreement/commitments | 02, 21, 22 |
| Line identity | 03, 25 |
| Requested/promised/planned/actual | 01, 09 |
| Reservation/allocation | 15, 23 |
| Partial fulfillment/backorder | 02, 03, 11, 14 |
| Shipment/delivery | 07, 10, 11 |
| Invoice vs receivable claim | 10, 11, 21 |
| Returns/refunds/cancellation | 07, 08, 14, 17, 18, 24 |
| Credit limits | 13, 20 |
| Discounts/taxes | 18, 25 |
| Settlement | 08, 12, 19, 20 |
| Split / over-delivery / substitution / price-after-accept / cancel-after-ship / return-after-pay / request-vs-feasible | 03, 04, 05, 06, 07, 08, 09 |
