---
issue: 23
kind: counterexample
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Adversarial cases. Happy paths are not evidence. Each card names kind and decision state.

Cross-links to `scenarios/README.md` use their numbers when the seed already covers the shape.

## S-P-01. Concurrent repricing

**Kind.** counterexample.

**Setup.** Two agents submit `CommitReprice` for the same Amazon-style listing. Agent A uses FOEP 19.99 from 10:01. Agent B uses a later `ANY_OFFER_CHANGED` at 10:02 that shows a competitor at 18.50. Both submissions are accepted for processing.

**Questions.** Which offer is live at 10:03? Can both stay `unknown`? Does last-accepted win, or last-live? Can the system explain the rejected or overwritten proposal?

**Attacks.** L-011, L-003, L-010.

**Decision state.** `hypothesis`.

**If the model fails.** It stores one mutable price field and cannot reconstruct either submission.

## S-P-02. Expired promotion at confirm

**Kind.** counterexample.

**Setup.** Cart applies a coupon-based rule Valid Upto 23:59. The shopper waits. Confirm is 00:01. The coupon token is still unused.

**Questions.** Does `ApplyPromotion` re-read validity against the confirm business date? Is the token consumed if the rule no longer applies? What does the shopper see?

**Attacks.** L-006, L-007, L-004.

**Decision state.** `hypothesis`.

**If the model fails.** It freezes the discounted cart total as if it were a commitment.

## S-P-03. Stale competitor observation

**Kind.** counterexample.

**Setup.** `ProposeReprice` binds competitor 24.00 observed at 09:00. Approval arrives at 09:40. A 09:10 notification had already moved the competitor to 21.00. Freshness Policy is 15 minutes.

**Questions.** Must commit re-read observations? Is the approval bound to the 09:00 fact set? See seed S-003.

**Attacks.** L-003, L-004, L-011.

**Decision state.** `hypothesis`.

**If the model fails.** It treats the approved number as live truth with no observation id.

## S-P-04. Channel-specific price leak

**Kind.** counterexample.

**Setup.** SKU X is 40.00 on marketplace NA and 55.00 on marketplace EU. A reprice job writes 39.00 without a marketplace selector.

**Questions.** Which offers change? Is a missing channel a refuse? Can EU still explain 55.00?

**Attacks.** L-005.

**Decision state.** `hypothesis`.

**If the model fails.** One product field holds every channel's price.

## S-P-05. Margin constraint versus FOEP

**Kind.** counterexample.

**Setup.** FOEP is 12.00. Min seller allowed or cost-based floor is 14.00. An agent proposes 12.00 to win featured offer.

**Questions.** Does `MinSellerPrice` refuse? Is featured-offer loss a valid outcome? Can the refusal cite both the observation and the floor?

**Attacks.** L-009. E-026.

**Decision state.** `hypothesis`.

**If the model fails.** It always matches FOEP and then cannot explain a later loss-making order.

## S-P-06. List change after accepted order

**Kind.** counterexample.

**Setup.** Sales order captures 100.00 from Standard Selling. Next day the Item Price becomes 90.00. Invoice is created from the order.

**Questions.** Does the invoice keep 100.00? If Selling Settings warn on rate change, is that a Policy or a silent rewrite?

**Attacks.** L-001. E-005 downstream note.

**Decision state.** `hypothesis`.

**If the model fails.** Historical commitments move when the list moves.

## S-P-07. Coupon after max use

**Kind.** counterexample.

**Setup.** Coupon Maximum Use is 100. The 100th Sales Order is submitted. A 101st cart still holds the code.

**Questions.** Does `RedeemCoupon` fail while `ApplyPromotion` would still match the rule without a code? Is Used decremented if the 100th order is cancelled?

**Attacks.** L-007. E-003.

**Decision state.** `hypothesis`.

**If the model fails.** Used is a mutable counter with no order provenance.

## S-P-08. Gift-card coupon treated as wallet

**Kind.** counterexample.

**Setup.** A user issues an ERPNext Gift Card coupon type and later tries to refund unused "balance" as cash.

**Questions.** Is there a financial instrument? Or only a generated code pointing at a Pricing Rule?

**Attacks.** L-007.

**Decision state.** `supported` as a documented non-wallet (E-003).

**If the model fails.** Coupon becomes a payment allocation.

## S-P-09. Tax-included 10.00 versus tax-excluded 8.26

**Kind.** counterexample.

**Setup.** B2C channel must show 10.00 included. B2B contract is 8.26 excluded. VAT 21%. Quantity 100.

**Questions.** Which amount is stored? Can both quotes be reconstructed? See E-008. 100 × 10.00 included is not 100 × 8.26 excluded.

**Attacks.** L-012.

**Decision state.** `undetermined` for encoding. `supported` that the amounts diverge.

**If the model fails.** One float named `price` and a display toggle.

## S-P-10. Buying rate used as selling offer

**Kind.** counterexample.

**Setup.** Standard Buying Item Price is 7.00. A website publish job picks the only rate it finds and lists 7.00 to customers.

**Questions.** Are selling and buying different facts? Does `PublishChannelOffer` require a selling purpose?

**Attacks.** L-001, E-019.

**Decision state.** `hypothesis`.

**If the model fails.** A single price field with a sign.

## S-P-11. UOM break ignored

**Kind.** counterexample.

**Setup.** Rice is 1.00 per kg and 18.00 per 20 kg bag. Cart UOM is bag. The kg rate is applied.

**Questions.** Is a price without UOM eligible? Does Price Not UOM Dependent scale, or must a bag rate exist?

**Attacks.** E-020.

**Decision state.** `hypothesis`.

**If the model fails.** Rate is a scalar on the item.

## S-P-12. Quantity break at the boundary

**Kind.** counterexample.

**Setup.** Rule min qty 10, max 0. Cart has 9, then the shopper adds 1. A second line of 1 is added instead of raising the first line to 10.

**Questions.** Does mixed-conditions or line identity change eligibility? Is the break evaluated per line or per item across lines?

**Attacks.** E-002, E-025.

**Decision state.** `hypothesis`.

## S-P-13. Overlapping rules, stacking on

**Kind.** counterexample.

**Setup.** 10% item-group rule and 5% customer rule both match. Apply Multiple and discount-on-discounted-rate are on.

**Questions.** Is the result 14.5% or 15%? Can the invoice explain both rules?

**Attacks.** L-010.

**Decision state.** `hypothesis`.

## S-P-14. Overlapping rules, stacking off

**Kind.** counterexample.

**Setup.** Same two rules. Only priority wins.

**Questions.** Does the loser remain visible as a candidate? If priority ties, what happens?

**Attacks.** L-010.

**Decision state.** `hypothesis`.

## S-P-15. Ignore Pricing Rule without authority

**Kind.** counterexample.

**Setup.** A junior user enables Ignore Pricing Rule to beat a floor.

**Questions.** Is this `IgnoreComputedRules` with a Policy, or a boolean on the document? ERPNext calls it an approved exception.

**Attacks.** E-024, L-009.

**Decision state.** `undetermined` as universal approval. `hypothesis` that silent ignore is wrong.

## S-P-16. Quotation expired, then accepted

**Kind.** counterexample.

**Setup.** Quotation Valid Till was yesterday. Status Expired. Customer sends acceptance today. List rates have moved.

**Questions.** Can `AcceptOffer` use the expired quotation rates? Must a new offer be published? Issue 16 L-001.

**Attacks.** L-002, L-001.

**Decision state.** `hypothesis`.

## S-P-17. Print heading Proforma Invoice

**Kind.** counterexample.

**Setup.** User prints a Quotation with Print Heading Proforma Invoice and the finance team books a receivable.

**Questions.** Did a Claim get minted from a heading? E-004 says the DocType did not change.

**Attacks.** L-002. Issue 16 L-006.

**Decision state.** `hypothesis`.

## S-P-18. Agreement price versus public list

**Kind.** counterexample.

**Setup.** Distributor agreement points a Moqui-style ProductPrice at an AgreementItem for 12.00. Public list is 20.00. A web order for that party uses 20.00.

**Questions.** Does negotiated rate outrank list? What if the agreement `thruDate` has passed?

**Attacks.** E-009, E-017, L-001.

**Decision state.** `hypothesis`.

## S-P-19. Fee estimate then different payout

**Kind.** counterexample.

**Setup.** Reprice uses a 15% fee estimate. Payout later posts 18% plus a storage fee.

**Questions.** Was the estimate an observation with an id? Is historical margin still explainable? Does the order rewrite?

**Attacks.** L-008.

**Decision state.** `hypothesis`.

## S-P-20. Competitive external price, withheld retailer

**Kind.** counterexample.

**Setup.** Threshold is 22.00 from an unnamed external retailer. An auditor asks who. Amazon does not disclose the name (E-013). Equivalence may be a different pack size.

**Questions.** Can provenance be "marketplace-threshold, retailer withheld"? Is that enough to authorize a reprice?

**Attacks.** L-003, L-004.

**Decision state.** `hypothesis`.

## S-P-21. PRICING_HEALTH without competitor move

**Kind.** counterexample.

**Setup.** Our price did not change. No competitor moved. `PRICING_HEALTH` says the offer is ineligible because total price exceeds recent prices or the external threshold.

**Questions.** Is this an observation about eligibility, not about a competitor offer? Can a reprice fire from eligibility alone?

**Attacks.** E-012, L-003.

**Decision state.** `hypothesis`.

## S-P-22. Discounted_price schedule overlaps our_price

**Kind.** counterexample.

**Setup.** Amazon-style `our_price` is 30.00. `discounted_price` is 25.00 from June 1 to June 7. On June 8 a shopper still sees 25.00 in a cached storefront.

**Questions.** Which amount is the live offer? Is the cache an observation with its own known time?

**Attacks.** L-004, L-011, E-011.

**Decision state.** `hypothesis`.

## S-P-23. B2B audience versus ALL

**Kind.** counterexample.

**Setup.** `purchasable_offer` has ALL at 40.00 and B2B at 32.00 with a quantity_discount_plan. A consumer checkout receives 32.00.

**Questions.** Is audience part of listing identity? Did the wrong offer instance apply?

**Attacks.** L-005, E-011.

**Decision state.** `hypothesis`.

## S-P-24. Promotion re-run removes a free item

**Kind.** counterexample.

**Setup.** Moqui-style promotions re-run on every basket change. A free item is added, then the shopper edits a different line. The free item disappears because quantity no longer qualifies.

**Questions.** Was the free item a durable line or a projection? ERPNext Don't Enforce Free Item Qty is the opposite knob.

**Attacks.** L-006, E-010.

**Decision state.** `hypothesis`.

## S-P-25. Two stores, one SKU, promotions on only one

**Kind.** counterexample.

**Setup.** Moqui promotions are store-scoped. Order has no Store. Price lookup still runs. A campaign owner expects the weekend discount.

**Questions.** Is missing Store a refuse for `ApplyPromotion` or a silent skip? E-010 says no store means no promotions.

**Attacks.** L-005, L-006.

**Decision state.** `hypothesis`.

## S-P-26. Dynamics date type is requested ship, not today

**Kind.** counterexample.

**Setup.** Trade agreement valid in September. Order created August 16 with requested ship September 2. Date type is requested ship date.

**Questions.** Which rate applies? If date type later changes to created date, do historical orders stay explainable?

**Attacks.** L-004, D5, E-017.

**Decision state.** `undetermined` for the default date. `hypothesis` that the date must be named.

## S-P-27. Backdated Valid From on a list rate

**Kind.** counterexample.

**Setup.** On August 16 someone sets Valid From to August 1 on a cheaper list rate. Open quotations from August 10 still show the old rate.

**Questions.** Does effectivity rewrite open offers? Seed S-007 is stock. Same valid-versus-known shape.

**Attacks.** L-001, L-004.

**Decision state.** `hypothesis`.

## S-P-28. MAP delete while ads still show MAP

**Kind.** counterexample.

**Setup.** Seller deletes `map_price` via merge-to-null. Advertising still quotes the old MAP. A reprice goes below it.

**Questions.** Is MAP an offer constraint or a marketing observation? Which known time wins?

**Attacks.** E-011, L-009.

**Decision state.** `hypothesis`.

## S-P-29. Ontology revision after a lawful discount

**Kind.** counterexample.

**Setup.** Seed S-012. Version 1 allows a 30% coupon. The coupon is redeemed. Version 2 forbids discounts above 10%. An auditor asks why 30% stood.

**Questions.** Are `ApplyPromotion` and the rule revision pinned? Can we explain without replaying under today's Policy?

**Attacks.** Constitution 14. Not a new primitive.

**Decision state.** `hypothesis`.

## S-P-30. Same amount, three provenances

**Kind.** counterexample.

**Setup.** 19.99 appears as our list, as a competitor observation, and as a typed-in override. An agent later "matches 19.99" without saying which.

**Questions.** Are they the same fact? Seed S-011. Does Policy treat them differently?

**Attacks.** L-001, L-003, E-024.

**Decision state.** `hypothesis`.

**If the model fails.** One amount column with no source.

## Coverage map

| Required family | Cards |
| --- | --- |
| Concurrent repricing | S-P-01 |
| Expired promotion | S-P-02, S-P-07, S-P-24 |
| Stale competitor observation | S-P-03, S-P-20, S-P-21 |
| Channel-specific price | S-P-04, S-P-23, S-P-25 |
| Margin constraint | S-P-05, S-P-15, S-P-28 |
| List versus transaction | S-P-06, S-P-16, S-P-27 |
| Coupon and token | S-P-07, S-P-08 |
| Tax inclusion | S-P-09 |
| Fees | S-P-19 |
| Agreement versus list | S-P-18 |
| Resolution | S-P-12, S-P-13, S-P-14 |
| External unknown | S-P-01, S-P-22 |
| Provenance | S-P-20, S-P-30 |
