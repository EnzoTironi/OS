---
issue: 17
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Labeled blocks for issue 17. Each block names its kind. Inference is marked. Source names stay in the source's vocabulary.

## E1. ERPNext names seven buying stages and allows skips

**Kind.** Domain evidence plus source-system artifact.

The Procurement Cycle Overview lists Material Request, Request For Quotation, Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice, and Payment Entry. After a Purchase Order, "an Invoice can be generated or a Purchase Receipt depending upon the flow of process in the organisation." The stages are recommended, not a single mandatory chain.

**Source artifact.** Seven DocTypes and a beginner flowchart.

**Fetched.** S-ERN-CYCLE.

## E2. Material Request is a need, not a supplier promise

**Kind.** Domain evidence.

A Material Request "identifies a requirement of a set of Items for a particular reason." Purposes include Purchase, Material Transfer, Material Issue, Manufacture, Subcontracting, and Customer Provided. Statuses include Pending, Partially Ordered, Ordered, Issued, Transferred, and Received. The page says Material Request is not mandatory. It is useful when buying is centralized. It can be created from a Sales Order, a Production Plan, or an automatic reorder when projected quantity falls.

**Inference.** Demand can exist without a supplier, a price, or a commercial commitment.

**Source artifact.** Purpose enum on one DocType. Stopped and Canceled statuses.

**Fetched.** S-ERN-MR.

## E3. RFQ asks many suppliers for a quote

**Kind.** Domain evidence.

A Request for Quotation is sent to one or more suppliers asking for a quotation. Items can come from a Material Request, an Opportunity, or a Possible Supplier. Suppliers can be fetched by tag or by group. After submit, emails and portal access let a supplier enter rates. ERPNext then creates a Supplier Quotation in draft for review. Quote status on the supplier row becomes Received when that supplier has quoted all items.

**Source artifact.** Supplier child table, portal user creation, email template variables.

**Fetched.** S-ERN-RFQ.

## E4. Supplier Quotation is an offer that can become a contract if accepted

**Kind.** Domain evidence.

A Supplier Quotation specifies cost of goods or services within a period. It may contain terms of sale, payment, and warranties. "Acceptance of quotation by the buyer can be considered as an agreement binding on both parties." Recording quotes is recommended for high-value items so prices can be compared later and so an auditor can see that suppliers were given a chance to quote. After submit, a Purchase Order or a customer Quotation can be created.

**Inference.** Offer and acceptance are different acts. The quotation document is not yet the purchase commitment unless accepted.

**Fetched.** S-ERN-SQ.

## E5. Purchase Order is documented as a binding contract

**Kind.** Domain evidence.

"A Purchase Order is a binding contract with your Supplier that you promise to buy a set of items under given conditions." It can be created from a Material Request or a Supplier Quotation. After submit, the user can create Purchase Receipt, Purchase Invoice, Payment Entry, or Journal Entry. Items already received cannot be deleted through Update Items. A Required By date on each item supports part delivery. Payment Terms can split payment before shipment and after receipt.

**Source artifact.** Submitted document with Update Items, Hold, and Close.

**Fetched.** S-ERN-PO.

## E6. Blanket Order is a long-term commitment that does not receive or pay

**Kind.** Domain evidence.

A Blanket Order records a long-term commitment to buy or sell specified items in an agreed period at negotiated rates. "It does not deliver, receive, bill, or pay for goods by itself." Ordered Quantity tracks quantity already referenced by submitted downstream orders. A Purchasing Blanket Order creates Purchase Orders. The page says it does not reserve stock. ERPNext may not automatically close the agreement when the period ends or quantity is fully ordered.

**Inference.** Agreement and release-commitment are different objects. Quantity on the agreement is an envelope, not a shipment.

**Fetched.** S-ERN-BO.

## E7. Purchase Receipt splits received, accepted, and rejected quantity

**Kind.** Domain evidence.

Purchase Receipts are made when items are accepted from a supplier, usually against a Purchase Order. Receipt without an order is allowed if Buying Settings say Purchase Order Required is No. Each line has received, accepted, and rejected quantity. Accepted Warehouse and Rejected Warehouse can differ. Submit creates a stock ledger entry for accepted quantity and a separate entry for rejection. Pending quantity updates on the Purchase Order. Closed is short-close. Example given is order 20, close at 15, remaining 5 not to be received or billed.

**Source artifact.** Immutable ledger from version 13. Is Return checkbox. Supplier Delivery Note field. Edit Posting Date and Time.

**Fetched.** S-ERN-PR.

## E8. Quality Inspection can block receipt submit

**Kind.** Domain evidence.

If Inspection Criteria is enabled on the Item for Purchase, Purchase Receipt submit is allowed only after a Quality Inspection is recorded against it. Inspection type can be Incoming, Outgoing, or In Process. Checks can be numeric range, value match, formula, or manual override when a reading is outside range but still accepted. Sample size is recorded. Status of the whole inspection is decided by the user after row statuses are set.

**Inference.** Physical arrival and quality release are different facts. Manual override is an explicit exception, not silent mutation of the reading.

**Fetched.** S-ERN-QI, S-ERN-PR section 3.4.

## E9. Purchase Invoice records the supplier bill and creates the payable

**Kind.** Domain evidence.

A Purchase Invoice records the supplier's bill, creates the payable, and posts expense, asset value, and taxes. It can be created from a Purchase Order, a Purchase Receipt, or directly. From a receipt it "normally clears the Stock Received But Not Billed value created by the receipt." Update Stock on the invoice posts receipt through the invoice. The troubleshooting section says do not enable Update Stock when a Purchase Receipt already posted the same movement. Supplier Invoice No helps prevent duplicate entry. Duplicate supplier invoice number is rejected. Partial billing of an order is allowed. Services should not use Update Stock. One invoice can cover several receipts through Get Items From. On Hold prevents payment selection. Is Return creates a Debit Note.

**Source artifact.** Update Stock flag. Auto Repeat. Subscription. Credit To payable account.

**Fetched.** S-ERN-PI.

## E10. Landed cost is a later valuation fact

**Kind.** Domain evidence.

Landed cost is the total cost for a product to reach the buyer. Freight, duty, insurance, and similar charges may be unknown at receipt. Charges known at receipt can sit on the Purchase Receipt tax table as Valuation or Total and Valuation. Charges known later use Landed Cost Voucher against a Purchase Receipt or a stock-updating Purchase Invoice. Submit recalculates valuation rate, posts warehouse versus expense corrections under perpetual inventory, and reposts future outgoing entries if goods were already delivered. Version 16 also allows LCV against Manufacture stock entries and Subcontracting Receipts.

**Runtime consequence.** Valuation is a projection that late charges can revise. The original receipt event remains. Knowledge time and valid cost differ.

**Fetched.** S-ERN-LCV, S-ERN-PR "Changing the value of Items post Purchase Receipt."

## E11. Purchase Return is a compensating receipt, not a delete

**Kind.** Domain evidence.

Create Return from the original Purchase Receipt opens a new receipt with Is Return checked and negative quantities. Submit decreases warehouse quantity and adjusts stock value at the original purchase rate. Returned Quantity updates on the original receipt and any linked Purchase Order. Status becomes Return Issued if 100 percent returned. Accounting credits Stock In Hand and debits Stock Received but Not Billed when perpetual inventory is on.

**Fetched.** S-ERN-RET.

## E12. Payment Entry settles a claim or records an advance

**Kind.** Domain evidence.

Payment Entry records money paid to a supplier, received from a customer, or transferred between company accounts. It can link to Purchase Invoice or Purchase Order. An advance can be created before the invoice and reconciled later. The buying-cycle diagram is Purchase Order, Purchase Receipt, Purchase Invoice, then Payment Entry. The page says Payment Entry is not always last. One payment can settle several invoices for one party. Remainder above allocated invoices stays unallocated. A Journal Entry is the wrong tool for routine supplier payment because it will not track the purchase cycle.

**Fetched.** S-ERN-PE.

## E13. Odoo RFQ and purchase order are one record with two meanings

**Kind.** Domain evidence plus source-system artifact.

Odoo RFQs "standardize ordering products from multiple vendors." Send by Email moves the record to RFQ Sent. Confirm Order "directly transforms the RFQ into an active PO." Order Deadline becomes Confirmation Date. After confirm, Receive Products records reception. A receipt document is created automatically if Inventory is installed. Vendor Reference is the supplier's sales or delivery number used later to match the delivery.

**Source artifact.** One `purchase.order` row. States draft, sent, to approve, purchase, done, cancel. Sibling atlas on `origin/cursor/issue-33-corpus-cfd8`.

**Fetched.** S-ODO-RFQ.

## E14. Odoo bill control is ordered quantity or received quantity

**Kind.** Domain evidence.

Bill Control in Purchase settings is Ordered quantities or Received quantities. Ordered quantities creates a vendor bill as soon as the purchase order is confirmed, using ordered products and quantities. Received quantities creates a bill only after part of the order has been received, using received quantities. Creating a bill before any receipt under received-quantity policy raises Invalid Operation. A product can override the company default on its Purchase tab.

**Inference.** Policy chooses when a claim may be drafted. It does not collapse claim and receipt into one fact.

**Fetched.** S-ODO-CTRL, S-ODO-BILL.

## E15. Odoo three-way matching is a payability check, not a hard block on draft edits

**Kind.** Domain evidence.

Three-way matching "ensures vendor bills are only paid once some (or all) of the products included in the PO have been received." It works only with Received quantities. A new bill shows Should Be Paid as Yes. Editing billed quantity, price, or adding products sets Should Be Paid to Exception. Odoo "does not block the changes or display an error message, since there might be a valid reason." After payment, Should Be Paid becomes No. The status can be changed by hand. Billing Status on the order is Nothing to Bill, Waiting Bills, or Fully Billed. Fully Billed on received-quantity policy can mean a draft bill exists, not that goods and bill quantities are equal.

**Counterexample pressure.** Exception is an explicit mismatch state. Silent overwrite of ordered, received, and billed quantities would be a different model.

**Fetched.** S-ODO-CTRL, S-ODO-BILL.

## E16. Odoo blanket order is an agreement that releases RFQs

**Kind.** Domain evidence.

Blanket orders are "long-term purchase agreements between a company and a vendor to deliver products on a recurring basis with predetermined pricing." Confirm moves Draft to Confirmed. New Quotation creates a pre-populated RFQ. Ordered on the agreement updates from linked RFQs. Prices on the agreement are entered by hand and default to 0 if left unset. After confirm, products, quantities, and prices can still be edited. A vendor line is added on included products for replenishment.

**Source artifact.** Purchase Agreements setting also enables alternative RFQs.

**Fetched.** S-ODO-BO.

## E17. Odoo three-step receipt separates dock, quarantine, and stock

**Kind.** Domain evidence.

Three-step receipt moves goods to Input, then Quality Control, then Stock. "The products are not available for further processing until they are transferred out of the quality area and into stock." Confirming the purchase order creates receipt `WH/IN`. Validate on the receipt only reaches Input. Two later internal transfers complete inspection and put-away. Quality checks can also be attached to a one-step receipt through Quality Control Points without extra locations.

**Inference.** Custody at the dock, quality hold, and available stock are different location or state facts.

**Fetched.** S-ODO-3STEP, S-ODO-INB, S-ODO-QC.

## E18. Moqui uses one Order for purchase and sales, split by parties on OrderPart

**Kind.** Domain evidence plus source-system artifact.

"An order can be a purchase or sales order, and in fact with the OrderPart structure supports multi-party orders since each order part has a customerPartyId and a vendorPartyId." Statuses include Open or Tentative cart, Proposed by Vendor quote, and Accepted by Customer placed order. After Placed, an order is Completed, Cancelled by the customer, or Rejected by the vendor. Order items have no statusId. Item status is inferred from quantities fulfilled. Billing links OrderItem to InvoiceItem through OrderItemBilling, often with shipmentId and assetReceiptId for incoming goods.

**Source artifact.** Shared OrderHeader for cart, quote, and placed order. Shared item types across order, invoice, and return.

**Fetched.** S-MOQ-ORD.

## E19. Moqui generates a payable from received quantity, then reconciles the supplier bill

**Kind.** Domain evidence.

Marble P2P says the receiver looks up the PO, creates a shipment, records received versus rejected quantities, and marks the shipment Delivered. The system then "automatically generates an invoice for the product actually received and connected to the PO and incoming shipment." Later the supplier sends a bill. The AP clerk updates the generated invoice with the supplier's date and numbers, compares items, adds shipping or other charges until totals match, marks Received, then Approved. Approval generates the AP GL transaction. Reasons given for generated invoices include less data entry, comparison of "your record of what was received" to "their record of what they are billing," correct GL accounts, and automatic association with order and shipment.

**Inference.** Observed receipt can imply a claim. The supplier's invoice is a second claim or a correction of the implied claim. They can disagree.

**Fetched.** S-MOQ-P2P.

## E20. Moqui over-receipt adjusts the purchase order

**Kind.** Domain evidence.

The Shipment Receiver story says if recorded received quantity is higher than ordered, "system automatically adjusts the PO being received against." If quantity or product is clearly wrong, the receiver contacts the supplier before signing. If no resolution, the receiver does not sign and the shipment returns to the supplier. Unknown receipts go to the Buyer. Color-only difference can create a new Product ID. A different product that is not just color goes to the Buyer after receipt.

**Counterexample pressure.** Automatic PO increase on over-receipt is a source policy. A stricter model would keep the commitment unchanged and record surplus as a separate event.

**Fetched.** S-MOQ-RCV.

## E21. Moqui return is a first-class header with requested and received quantity

**Kind.** Domain evidence.

ReturnHeader tracks returns from fromPartyId to toPartyId. Either party may be an internal organization, so the return may be incoming from a customer or outgoing to a supplier. ReturnItem points at OrderItem, has returnQuantity and receivedQuantity, a reason, and a response such as refund or replacement. Statuses include Created, Requested, Approved, Shipped, Received, Completed, Manual Response Required, and Cancelled. Refunds create an invoice from the return.

**Fetched.** S-MOQ-ORD Return section.

## E22. ValueFlows splits Intent, Commitment, Economic Event, and Claim

**Kind.** Domain evidence.

Intents are potential future events not agreed by other agents, such as offers and requests. Commitments are potential future events the involved agents have agreed to pursue, "contractual promises from one agent to another." Economic Events "describe past flows, something observed, never some potential future event." They can fulfill Commitments or satisfy Intents. Claims "resemble Commitments, but are initiated by the receiver, not the provider." An Economic Event can trigger a reciprocal Claim based on an agreement. Claims can stay implied from event plus agreement.

Knowledge, Plan, and Observation are different layers. Recipe and Proposal live above operational commitments.

**Fetched.** S-VF-CORE, S-VF-FLOW, S-VF-SPEC.

## E23. ValueFlows proposals publish offers and requests

**Kind.** Domain evidence.

A Proposal publishes one or more primary Intents and optional reciprocal Intents. An intent can appear in more than one proposal, for example wholesale and retail price lists. Matching offer and request can lead to an Agreement. Agreements can also be entered without proposals. ValueFlows does not define the conversation pattern that sits between proposal and agreement.

**Fetched.** S-VF-PROP.

## E24. ValueFlows splits transfer of rights from transfer of custody

**Kind.** Domain evidence.

One transfer concept "re-assigns rights for an economic resource from one agent to another." A second "operationally changes physical custody or possession... without affecting rights." Explicit actions are transfer all rights, transfer custody, and transfer as shorthand for both. Consume, produce, and deliverService can imply full transfer of rights and custody when provider and receiver differ. Pickup, dropoff, accept, and modify can imply custody only. The page avoids "ownership" as the only rights word and uses stewardship and accountability.

**Fetched.** S-VF-XFER.

## E25. ValueFlows economic events are corrected by new events

**Kind.** Domain evidence.

"Economic events are immutable in accounting practice, since at any time they could have been reported formally." A correcting event relates to the first with `corrects`. It can carry a negative number and can back out or adjust the original.

**Runtime consequence.** Receipt, claim, and valuation corrections are new facts. They are not field edits of the original event.

**Fetched.** S-VF-FLOW Correcting Events.

## E26. Incoterms 2020 move risk, not title

**Kind.** Domain evidence.

ICC text says "the Incoterms® rules do NOT deal with the transfer of property/title/ownership of the goods sold." Parties must provide for title in the contract of sale. Incoterms are not themselves a contract of sale. ICC Academy says the place of risk transfer is when risk of loss or damage passes from seller to buyer, and that in the eleven Incoterms 2020 rules this coincides with "delivery." Ordinary speech uses delivery for arrival at destination. C-family terms can split risk transfer from destination.

**Inference.** Warehouse receipt, Incoterms delivery, and title passage can be three different times.

**Fetched.** S-ICC-INCO, S-ICC-PDF, S-ICC-RISK.

## E27. GS1 EPCIS receiving names owning party and possessing party

**Kind.** Domain evidence.

Source List and Destination List add context when an EPCIS event is part of a transfer of ownership, responsibility, or custody. CBV source and destination types include `owning_party`, `possessing_party`, and `location`. A receiving example can name manufacturer as source owning party, retailer as destination owning party, and still attach purchase order and invoice as business transactions. Disposition `in_progress` means the product is moving normally through the forward chain.

**Fetched.** S-GS1-CBV.

## E28. UBL keeps separate document types for the buy-ship-pay chain

**Kind.** Domain evidence plus source-system artifact.

UBL 2.4 publishes `RequestForQuotation`, `Quotation`, `Order`, `OrderResponse`, `OrderResponseSimple`, `OrderChange`, `OrderCancellation`, `DespatchAdvice`, `ReceiptAdvice`, `PurchaseReceipt`, `Invoice`, `CreditNote`, `FreightInvoice`, `SelfBilledInvoice`, and `RemittanceAdvice`. The overview says schemas for Order, Despatch Advice, and Invoice are for generic procurement and transportation. LineItem is the line structure, not the Item. Seller prices are set in sourcing and not repeated in full during ordering.

**Source artifact.** XML document types. Not OS types.

**Fetched.** S-UBL.

## E29. UN/CEFACT Buy-Ship-Pay treats commercial, transport, and payment as different areas

**Kind.** Domain evidence.

The Buy-Ship-Pay Reference Data Model generalizes Multi-Modal Transport and Supply Chain reference models. It covers cross-border supply-chain trade transactions and the transport processes that move goods, while remaining a reference data model rather than an ERP schema.

**Inference.** Buy, ship, and pay are independently motivated process areas. A single purchase document that does all three is a surface.

**Fetched.** S-UNECE-BSP.

## E30. ERPNext sibling atlas already treats receipt, payable, and valuation as different facts

**Kind.** Domain evidence. Cross-link, not independent proof.

`research/erpnext/atlas.md` A-BUY on `origin/cursor/issue-32-corpus-cfd8` says RFQ, Supplier Quotation, and Purchase Order are the offer-to-commitment chain. Purchase Receipt is the goods event. Purchase Invoice is the payable. A PI against a PR should clear Stock Received But Not Billed rather than capitalize stock twice. Landed Cost Voucher is a later valuation fact that rewrites incoming rates and triggers ledger repost. Candidate law there: "Receipt of goods, recognition of a payable, and valuation adjustments are different facts even when they share an item line."

**Fetched.** Sibling read, 2026-08-16.

## E31. Odoo sibling atlas stores RFQ and order together and still splits receipt and bill

**Kind.** Domain evidence plus source-system artifact. Cross-link.

`research/odoo/atlas.md` on `origin/cursor/issue-33-corpus-cfd8` says RFQ and purchase order are the same record. Receipts are stock pickings, not purchase documents. Vendor bills are `account.move` with `in_invoice` or `in_refund`. Candidate law there: "Supplier commitment, receipt of goods, and recognition of a payable are different facts." That pass left match-widget semantics `undetermined`. This pass fills matching from S-ODO-CTRL.

**Fetched.** Sibling read, 2026-08-16.

## E32. Party and product siblings constrain supplier and item identity

**Kind.** Domain evidence. Cross-link.

`research/domain/party/` on `origin/cursor/issue-14-domain-cfd8` treats Supplier as a role founded by a relationship, not a Kind. Scenario S-005 is the same organization as supplier and customer. `research/domain/product/` on `origin/cursor/issue-15-domain-cfd8` splits specification, SKU, lot, serial, and stock slice. A P2P flow must name a specification before an instance exists, then attach lot or serial on receipt.

**Fetched.** Sibling read, 2026-08-16.
