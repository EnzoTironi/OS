---
issue: 17
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate procure-to-pay laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 37 already rejects importing ValueFlows class names as kernel primitives. This folder does the same for Purchase Order and vendor bill.

## L1. Need is not commitment

**Claim.** A demand or requisition can exist with no supplier, no price, and no promise. Fulfilling it may use purchase, transfer, manufacture, or customer-provided material.

**Kind.** Candidate law.

**Evidence.** E2, E22, E23. P2P-01.

**Decision state.** `supported`.

**Falsifier.** A mature operational corpus where every material need is already a purchase commitment to a named supplier.

**Runtime consequence.** RecordNeed must not post stock, payable, or reservation of a supplier's capacity unless a later Action says so.

## L2. Offer is not commitment

**Claim.** A supplier quotation is a unilateral proposal with validity. A purchase commitment exists only after acceptance by the buyer, and often after the supplier's order response.

**Kind.** Candidate law.

**Evidence.** E3, E4, E5, E22, E23, E28. P2P-02. Divergence D1.

**Source artifact that looks like a counterexample.** Odoo confirm transforms RFQ into PO. Moqui Proposed status on the same OrderHeader.

**Decision state.** `supported` for the semantic split. `undetermined` for one identity versus two.

**Falsifier.** A legal and operational practice where sending an RFQ already binds the buyer to buy.

## L3. Agreement is not a release

**Claim.** A standing agreement carries terms and a quantity or price envelope over a validity interval. Each release is a separate commitment that cites the agreement. The agreement does not receive, bill, or pay.

**Kind.** Candidate law.

**Evidence.** E6, E16, E23. P2P-03.

**Decision state.** `supported`.

**Falsifier.** A corpus where goods are received and paid against the blanket record with no release identity, and where partial releases cannot be explained.

**Runtime consequence.** Ordered quantity on the agreement is a projection of release commitments, not a stock movement.

## L4. Requested is not happened

**Claim.** CommitPurchase can fail, be refused, or become stale. CustodyReceived, RightsTransferred, and ClaimRecorded are occurrences. An Action invocation never proves its intended real-world result.

**Kind.** Candidate law.

**Evidence.** E22, E25. Constitution section 8. Thesis Action versus Event. P2P-14, P2P-22. Seed S-003, S-004, S-010.

**Decision state.** `supported` for P2P. This restates a thesis claim with domain evidence. It does not promote the thesis to accepted.

**Falsifier.** A P2P implementation where posting a purchase order is treated as proof that goods and title moved, and where that collapse causes no matching, legal, or inventory failures.

## L5. Custody, rights, and risk are different facts

**Claim.** Physical possession, legal title or stewardship, and Incoterms risk of loss can change at different times and places. Warehouse receipt is not ownership.

**Kind.** Candidate law.

**Evidence.** E24, E26, E27. P2P-09, P2P-10.

**Source artifact that looks like a counterexample.** ERP stock value usually increases at receipt.

**Decision state.** `supported`.

**Falsifier.** A trade regime where title, risk, and custody are defined to be the same instant for all goods movements, including FOB origin, consignment, and 3PL.

**Runtime consequence.** Inventory availability, inventory valuation, and payable recognition cannot share one timestamp by default.

## L6. Accepted quantity is not received quantity

**Claim.** Arrived quantity, accepted quantity, rejected quantity, and available-for-use quantity can all differ. Inspection can hold goods that are already in custody.

**Kind.** Candidate law.

**Evidence.** E7, E8, E17, E19. P2P-07, P2P-08.

**Decision state.** `supported`.

**Falsifier.** A quality-regulated inbound flow that never needs a hold state and never records rejected quantity separately from stock.

**Runtime consequence.** Matching and MRP must say which quantity they use. Available-to-promise must not count quarantine as stock.

## L7. Claim is not receipt and not payment

**Claim.** A payable is a receiver-side or supplier-side assertion of amount due. It can be implied from a receipt, authored from a supplier invoice, or both. Payment settles a claim or sits as an advance. Stock movement is a different event.

**Kind.** Candidate law.

**Evidence.** E9, E12, E14, E15, E19, E22, E28, E30, E31. P2P-05, P2P-18, P2P-21. Divergence D2, D4.

**Decision state.** `supported`.

**Falsifier.** A corpus where the only payable is the receipt row, and where services, prepayments, freight-only bills, and duplicate supplier invoices have no remaining ambiguity.

**Runtime consequence.** Three quantities stay observable. Ordered, received, billed. A match exception is a fact, not a blocked UI only.

## L8. Matching is a comparison, not a merge

**Claim.** Three-way match compares commitment, fulfillment, and claim. A mismatch is a first-class exception. It is not resolved by overwriting one of the three quantities.

**Kind.** Candidate law.

**Evidence.** E15, E19. P2P-05, P2P-12, P2P-21.

**Decision state.** `hypothesis`. Odoo Exception is weak enforcement. Moqui expects a clerk to make totals match by editing the generated invoice.

**Falsifier.** A control environment that treats silent overwrite of billed quantity to received quantity as the match.

**Runtime consequence.** Policy decides whether Exception can still be paid. The three quantities remain reconstructable.

## L9. Late cost is a new fact

**Claim.** Charges discovered after receipt adjust valuation through a later event. They do not rewrite the original receipt as if the charge had been known.

**Kind.** Candidate law.

**Evidence.** E10, E25. P2P-15. Seed S-007.

**Decision state.** `supported` for the need. `hypothesis` for the exact allocation rule when part of the lot is already issued.

**Falsifier.** A valuation model that never changes after receipt and still reports correct landed cost for imports.

**Runtime consequence.** Valid cost and knowledge time differ. Downstream COGS may recompute. Past decisions stay explainable under prior knowledge.

## L10. Compensation adds events

**Claim.** Returns, debit notes, cancellations after dispatch, and quantity corrections add compensating events. They do not delete the original receipt, claim, or payment.

**Kind.** Candidate law.

**Evidence.** E11, E21, E25. P2P-14, P2P-16. Seed S-010.

**Decision state.** `supported`.

**Falsifier.** A legal audit that requires the original receipt to vanish so that stock and payables look as if the purchase never occurred.

**Runtime consequence.** Cancel after irreversible fulfillment is a new Action that may be refused, or that must emit compensating Events.

## L11. Supplier is a role

**Claim.** Supplier does not supply identity. The same Person or Organization can be supplier and customer. Payment terms live on the commercial relationship, not on a second party master.

**Kind.** Candidate law.

**Evidence.** E32, E18. P2P-23. Seed S-005. Party issue 14 L1.

**Decision state.** `supported` as a cross-link. This issue does not re-litigate party identity.

**Falsifier.** See party issue 14.

## L12. Specification precedes instance

**Claim.** Need, offer, and commitment name a specification. Lot, serial, and handling unit appear when goods are observed. Substitution at receipt is a specification change, not a silent SKU edit.

**Kind.** Candidate law.

**Evidence.** E32. P2P-17. Product issue 15.

**Decision state.** `supported` as a cross-link.

## Rejected claims

**R1.** "Purchase Order is an OS primitive." **Decision state.** `rejected`. E1, E13, E18, E28 show it is a surface over commitment plus optional other stages.

**R2.** "Warehouse receipt transfers title." **Decision state.** `rejected`. E26, E27, E24.

**R3.** "One billing trigger is the domain law." **Decision state.** `rejected`. Divergence D2.

## Laws left undetermined

Supplier performance as an object. P2P-24.

Whether implied claim and supplier claim need two identities. Divergence D4.

Whether RFQ and commitment share identity. Divergence D1.

Exact surplus law for over-receipt. Divergence D3.

Dropship, subcontract supply of raw materials, and intercompany P2P were only touched. They need inventory, manufacturing, and multi-entity issues.
