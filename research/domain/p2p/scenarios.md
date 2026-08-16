---
issue: 17
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenarios

Falsifying cards for issue 17. Happy paths are omitted unless they isolate a split. Each card names the kind of pressure it applies.

Seed suite cross-links: `scenarios/README.md` S-003, S-005, S-010 on `origin/main`.

## P2P-01. Demand is not a purchase

A production plan needs 100 kg of resin by 20 August. No supplier is chosen. Projected stock is 15 kg.

**Questions.** Is the need a Commitment? Can it be satisfied by transfer or manufacture instead of purchase? If a Purchase Order later covers 80 kg, what remains of the need?

**Evidence.** E2, E22.

**Kind.** Counterexample to "Material Request is just a draft PO."

## P2P-02. RFQ to three suppliers, one selected

Buying publishes one RFQ to suppliers A, B, and C. A and B quote. C never answers. B is selected.

**Questions.** Do the unselected offers remain facts? Can an auditor see that A was given a chance to quote? Does selection mutate the RFQ into an order, or create a commitment that cites the offer?

**Evidence.** E3, E4, E13, E23, E28. Divergence D1.

**Kind.** Counterexample to collapsing offer and commitment.

## P2P-03. Blanket agreement, many releases

A blanket for 10,000 units over 12 months at 2.10. January releases 800. March releases 1,200. July price on the agreement is edited to 2.00.

**Questions.** Do already released commitments keep 2.10? Is the agreement quantity an envelope? Does editing the agreement rewrite history?

**Evidence.** E6, E16.

**Kind.** Counterexample to "the blanket is the order."

## P2P-04. Partial receipt, two shipments

Commitment is 10. First receipt accepts 4. Second receipt accepts 6.

**Questions.** What is the identity of the original commitment? How do the two custody events relate to it? When does billed quantity become allowed under received-quantity policy?

**Evidence.** E7, E15, E19, E22. Seed S-002 is the sales-side twin.

**Kind.** Domain evidence. Partial fulfillment is normal.

## P2P-05. Partial invoice before full receipt

Commitment is 10. Receipt accepted 4. Supplier bills 10. Policy is received-quantity matching.

**Questions.** Is the claim 10, 4, or 4 plus an exception of 6? Can the extra 6 stay as a claim that is not payable? If policy is ordered-quantity, is paying 10 before the rest arrives a domain error or a permitted prepayment against goods?

**Evidence.** E9, E14, E15, E19. Divergence D2.

**Kind.** Counterexample named in issue 17.

## P2P-06. Over-receipt

Commitment is 10. Dock counts 12. The extra 2 are the correct item.

**Questions.** Does the commitment become 12? Is surplus a second event with no commitment? Who has authority to keep the extra 2?

**Evidence.** E20, E7, E15. Divergence D3.

**Kind.** Counterexample named in issue 17.

## P2P-07. Rejected material at the dock

Commitment is 10. Dock counts 10. Inspection rejects 3. Rejected warehouse or quality location holds the 3.

**Questions.** What is received quantity for matching? What is available stock? Does the supplier still have a claim for 10, 7, or 3 pending return? Are the 3 still in company custody?

**Evidence.** E7, E8, E17, E19.

**Kind.** Counterexample named in issue 17.

## P2P-08. Quarantine then release

Goods arrive at Input on Monday. Quality Control holds them Tuesday. Stock is available Wednesday. Accounting wants Monday as receipt date. Production wants Wednesday as available date.

**Questions.** How many events? Which date is "received"? Can a claim be matched on Monday?

**Evidence.** E17, E8, E26.

**Kind.** Counterexample to one received timestamp.

## P2P-09. Ownership and risk split from physical receipt

FOB origin. Risk passes when the supplier loads the carrier on 1 August. Goods arrive 12 August. The sales contract says title passes on payment, which happens 20 August.

**Questions.** What does the buyer own on 5 August? What is in custody on 5 August? Which date values inventory? Which date starts risk of loss?

**Evidence.** E24, E26, E27.

**Kind.** Counterexample named in issue 17. Ownership versus physical receipt.

## P2P-10. Consignment or 3PL custody

A 3PL receives 50 units that the buyer already owns. Later 20 units move to the buyer's plant. The supplier is not a party to the second move.

**Questions.** Is the 3PL receipt a purchase receipt? Does it create a payable? Which party is possessing_party versus owning_party?

**Evidence.** E24, E27. Product sibling stock-slice note.

**Kind.** Counterexample to "receipt always creates a goods-received-not-invoiced clearing."

## P2P-11. Supplier substitution after commit

PO is placed with supplier A. A cannot ship. Buyer accepts supplier B for the same specification at a different price. A's truck is already on the road with 4 of 10.

**Questions.** Does the original commitment close? Are A's 4 a fulfillment of a cancelled promise? Does B's offer replace A's or sit beside it?

**Evidence.** E5, E20, E22.

**Kind.** Counterexample named in issue 17.

## P2P-12. Late price change

PO rate is 5.00. After full receipt, the supplier sends a bill at 5.40 citing a surcharge clause. Goods are already issued to production.

**Questions.** Does the commitment mutate? Is the surcharge a new claim line? Does inventory value change, and if so through landed cost or through a debit to expense?

**Evidence.** E5, E9, E10, E15.

**Kind.** Counterexample named in issue 17.

## P2P-13. Duplicated supplier invoice

Supplier sends bill INV-88 twice, once with the goods and once by email. Two clerks start entry.

**Questions.** What identity prevents the second payable? If the second bill is a genuine extra charge with the same number, how is that represented without bypassing the duplicate check?

**Evidence.** E9.

**Kind.** Counterexample named in issue 17.

## P2P-14. Order cancelled after dispatch

Buyer cancels the remaining PO after the supplier has dispatched 10 and before dock receipt. The truck arrives.

**Questions.** Is cancel allowed? If the goods are refused, which events exist? If the goods are accepted, which commitment do they fulfill? What happens to a prepayment?

**Evidence.** E5, E11, E12, E21. Seed S-010.

**Kind.** Counterexample named in issue 17.

## P2P-15. Landed cost one month late

Receipt posts at 100. Customs duty invoice arrives 30 days later for 18. Half the lot has been sold.

**Questions.** Does the remaining stock become 109 per remaining unit, or is 18 spread over original quantity? Are past cost of goods sold entries recomputed? Can the system answer what it believed the cost was on the sale date?

**Evidence.** E10. Seed S-007.

**Kind.** Runtime consequence. Bitemporal pressure.

## P2P-16. Return after consumption

10 accepted. 6 consumed in manufacture. 4 unused are returned. Supplier already billed and was paid for 10.

**Questions.** Is the return a negative receipt, a new outbound transfer, or both? How does the debit note relate to the original claim and payment? Does consumed quantity block the return of 4?

**Evidence.** E11, E21, E25.

**Kind.** Counterexample to delete-the-receipt.

## P2P-17. Substitution of specification at receipt

PO is resin grade A. Supplier ships grade B, which engineering accepts as fit. Grade B has a different SKU.

**Questions.** Did the original commitment get fulfilled? Is this a new commitment? How does matching treat billed grade A versus received grade B?

**Evidence.** E20, E32 product sibling.

**Kind.** Counterexample named in issue 17 as substitutions.

## P2P-18. Prepayment then short shipment

Buyer pays 100 percent against the PO. Supplier ships 70 percent and cancels the rest.

**Questions.** What claim exists for the 70? What happens to the 30 percent cash? Is the 30 a receivable from the supplier, a credit, or an unallocated payment?

**Evidence.** E12, E9, E22.

**Kind.** Counterexample to payment-always-last.

## P2P-19. Service line on a goods order

PO has 10 parts and one calibration service. Parts are received. The service has no warehouse movement. Supplier bills both lines.

**Questions.** What does received-quantity matching mean for the service? Does Update Stock or a receipt apply? Which account is debited?

**Evidence.** E9 services FAQ. E14 product-level bill control.

**Kind.** Counterexample to receipt-required-for-every-line.

## P2P-20. Two receipts, one supplier bill

Receipt R1 is 4. Receipt R2 is 6. Supplier bill is 10 on one invoice number.

**Questions.** Can one claim settle two custody events? What happens if R2 is later returned?

**Evidence.** E9 Get Items From several receipts. E19 Moqui invoice tied to shipment and order.

**Kind.** Domain evidence. Many-to-many among commitment, receipt, and claim.

## P2P-21. Implied claim versus supplier claim

Warehouse marks delivered 9 of 10. The system generates a payable for 9. The supplier bill says 10 plus freight 25.

**Questions.** Are there two claims or one claim being edited? If the clerk overwrites 9 with 10, what happens to the missing unit? Is freight a landed-cost event or a payable line?

**Evidence.** E19, E10. Divergence D4.

**Kind.** Counterexample to single-authoritative-invoice.

## P2P-22. Stale purchase approval

At 10:01 an agent proposes buying 1,000 because stock is 20 and demand is 980. A human approves at 10:07. At 10:06 a receipt of 800 posted.

**Questions.** What was approved? Must commit re-read stock and open requisitions? Is the proposal still a valid Need?

**Evidence.** Seed S-003. E2 automatic reorder. Constitution section 8.

**Kind.** Counterexample to approve-then-blind-commit.

## P2P-23. Supplier is also customer

Organization B sells resin to A and buys finished goods from A. B's bill and A's receivable are open at the same time.

**Questions.** Is B two parties or one party with two roles? Can settlement net? Where do payment terms live?

**Evidence.** E32. Seed S-005. Party issue 14 L1.

**Kind.** Counterexample to Supplier-as-Kind.

## P2P-24. Supplier performance without a new primitive

Over six months, supplier A is late on 4 of 10 commitments, rejects run at 8 percent, and quotes 12 percent above the selected offer on 3 RFQs.

**Questions.** Are these projections over Commitment and Event history? Is a scorecard a source artifact? Does performance change future SelectOffer policy?

**Evidence.** ERPNext scorecards are named in the sibling atlas and not fetched as a first-party page this pass.

**Kind.** Open question. Decision state `undetermined` for a first-class performance object.

## Coverage check

Issue 17 named adversarial cases. Mapping:

| Named case | Card |
| --- | --- |
| Partial invoice before full receipt | P2P-05 |
| Over-receipt | P2P-06 |
| Rejected material | P2P-07 |
| Supplier substitution | P2P-11, P2P-17 |
| Late price change | P2P-12 |
| Duplicated supplier invoice | P2P-13 |
| Order cancelled after dispatch | P2P-14 |

Twenty-four cards are present. That meets the issue minimum of 20.
