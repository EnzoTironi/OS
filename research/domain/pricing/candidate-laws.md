---
issue: 23
kind: candidate law
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate pricing laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 16 already owns offer-versus-commitment. Issue 15 owns product identity. Issue 13 owns value types.

## L-001. List rate is not the transaction price

**Claim.** A catalog or list rate can exist, expire, or be replaced without changing a rate already captured on an accepted commitment.

**Kind.** candidate law.

**Evidence.** E-001, E-002, E-006, E-017, E-027. ERPNext FAQ. Pricing Rule does not change Item Price. Odoo override. Dynamics base versus active.

**Source artifact that looks like a counterexample.** Editing the only price field on a product and seeing carts change. That updates future applications. It does not rewrite a posted order line unless a later Action says so.

**Decision state.** `supported`.

**Falsifier.** A mature operational system where changing MSRP silently rewrites accepted order lines and posted invoices with no compensating Action.

**Runtime consequence.** `PublishListRate` and `OverrideTransactionPrice` are different Actions. Projections must be able to show "list then" and "paid then" as different queries.

## L-002. Published offer is not commitment

**Claim.** A channel listing or customer quotation can expire, be lost, or be revised without leftover demand, stock movement, or a receivable.

**Kind.** candidate law.

**Evidence.** E-004, E-018, E-028. Issue 16 L-001. Amazon listing is a purchasable offer, not an order.

**Decision state.** `supported`.

**Falsifier.** A source that posts AR or reserves identity-bearing stock solely because a list or listing was published, with no accept step.

**Runtime consequence.** `PublishChannelOffer` must be deniable and expirable. Do not mint a Claim from a Print Heading that says Proforma Invoice (E-004).

## L-003. Competitor price is an observation

**Claim.** Another party's offer is a dated observation with provenance. It is not our list, not our channel offer, and not a commitment that we will match it.

**Kind.** candidate law.

**Evidence.** E-012, E-013, E-026. Amazon FOEP is not a guarantee. Competitive external price withholds retailer names.

**Source artifact that looks like a counterexample.** Moqui `priceTypeEnumId` competitive (E-009). That is a stored typed rate, not a live observation.

**Decision state.** `supported`.

**Falsifier.** A corpus where a competitor amount is operationally indistinguishable from our own `our_price` and can authorize shipment.

**Runtime consequence.** `ObserveCompetitorPrice` writes an observation. `CommitReprice` may read it. Matching is a Policy, not identity.

## L-004. Known time and valid time both matter

**Claim.** When a rate was in force and when the system learned a number are different questions. Stale intelligence and expired promotions fail different predicates.

**Kind.** candidate law.

**Evidence.** E-012, E-013, E-015, E-022. Constitution 10. Amazon notifications versus listing effectivity.

**Decision state.** `supported` for the two questions. `undetermined` for which business date is "now" (D5).

**Falsifier.** A domain where late-arriving competitor data and an expired coupon are correctly handled by one timestamp.

**Runtime consequence.** Observation freshness Policy uses known time. Promotion Policy uses the named business date against valid time.

## L-005. Channel offer has its own identity

**Claim.** The same product can have several live offers that differ by marketplace, store, country, audience, or currency. The offer is not the SKU.

**Kind.** candidate law.

**Evidence.** E-011, E-021, E-017. Amazon selectors. Dynamics price groups. Odoo country groups and websites.

**Decision state.** `supported` for "not the SKU." `undetermined` for a single listing identity law (Q-PR-01). eBay first-party docs missing.

**Falsifier.** A marketplace or ERP where one price object is necessarily shared across all channels and changing it on one store changes every store with no other record.

**Runtime consequence.** `PublishChannelOffer` names a channel. Product identity stays on issue 15.

## L-006. Promotion is not a price list

**Claim.** A time-boxed, basket-conditional, optionally code-gated adjustment is a different object from a standing list of item rates.

**Kind.** candidate law.

**Evidence.** E-002, E-007, E-010. Odoo "more varied, public, and time-sensitive than pricelists." Moqui promotions after price lookup, store-scoped.

**Decision state.** `supported`.

**Falsifier.** A mature system that implements coupons, buy-X-get-Y, and loyalty solely by editing list rates, with no second evaluation stage, and still preserves audit of why a basket changed.

**Runtime consequence.** `ApplyPromotion` runs against a basket and a business date. It does not update `PublishListRate` history.

## L-007. Coupon is a token, not money and not the rule

**Claim.** A coupon or discount code authorizes a promotion. It does not hold stored value unless a separate financial instrument exists. One token points at one rule in the sources that document it.

**Kind.** candidate law.

**Evidence.** E-003, E-010. ERPNext FAQ. Gift Card type is not a wallet. Moqui Require Code plus Limit Per Code.

**Decision state.** `supported` for token-versus-rule. `undetermined` for per-customer one-use as a universal cap.

**Falsifier.** A first-party coupon object that is also the company's cash wallet and the discount calculation.

**Runtime consequence.** `RedeemCoupon` can fail while the promotion still exists. Do not treat coupon Used as a payment allocation.

## L-008. Fee estimate is not the posted fee

**Claim.** A marketplace fee used to decide a price is an estimate observation. The fee that later hits payout can differ.

**Kind.** candidate law.

**Evidence.** E-014. Amazon official warning.

**Decision state.** `supported` for Amazon. `undetermined` for eBay and Mercado Libre.

**Falsifier.** A marketplace whose fee API is contractually the settlement amount and never varies.

**Runtime consequence.** Margin Policy that subtracts fees must record the estimate id and remain explainable when actual fees differ.

## L-009. A floor can refuse a legal-looking reprice

**Claim.** MAP, min seller allowed, min selling price, or a cost-based margin constraint can refuse `CommitReprice` or `OverrideTransactionPrice` even when a competitor observation or FOEP recommends a lower number.

**Kind.** candidate law.

**Evidence.** E-005, E-023, E-011. Amazon min/max seller allowed. ERPNext margin is not that floor.

**Decision state.** `supported` that floors exist. `hypothesis` that they share one Policy form.

**Falsifier.** A production marketplace or ERP that always lets FOEP or a competitor observation win over every internal floor.

**Runtime consequence.** Reprice Actions re-read floors at commit. Winning featured offer is not an invariant.

## L-010. Concurrent matching rates need an explicit resolution function

**Claim.** Several rates or promotions can be eligible at once. The winner is a named function over the candidates, not a hidden last-write.

**Kind.** candidate law.

**Evidence.** E-025. ERPNext priority and stacking. Odoo product over category. Moqui sequence. Dynamics find-next or rank.

**Decision state.** `supported`.

**Falsifier.** A source where two eligible prices cannot exist because the model forbids overlap, and where real campaigns never need overlap.

**Runtime consequence.** Explainable current price lists the candidates and the function. Constitution 14.

## L-011. Requested reprice is not live offer

**Claim.** Submitting a listing price update can be accepted, delayed, partially applied, or later rejected. Live offer state is a later observation.

**Kind.** candidate law.

**Evidence.** E-015, E-011. Listings Items accepted-for-processing. Attributes versus live fulfillment.

**Decision state.** `supported` for marketplaces that expose this. `hypothesis` for in-house price lists, where save may be immediately live.

**Falsifier.** A marketplace whose accept response is defined as the live shopper-visible price with no later processing.

**Runtime consequence.** Action outcome can remain `unknown`. Retry needs idempotency. See scenarios S-004 and S-P-01.

## L-012. Tax inclusion is a fact about the amount, not a display option

**Claim.** Included and excluded figures are not recoverable from each other without rounding loss. A price amount must say which it is, or tax must be a separate fact.

**Kind.** candidate law.

**Evidence.** E-008, E-009, E-016.

**Decision state.** `supported` for the asymmetry. `undetermined` for the storage encoding (D2). Standing order forbids closing the encoding fork here.

**Falsifier.** A jurisdiction and a mature ERP where included and excluded are exact inverses at every quantity with no second reference.

**Runtime consequence.** Do not add a bare decimal "price" without currency and inclusion or a linked tax fact. Do not invent a new money primitive. Float-for-money stays rejected.

## Rejected as universal laws

| Claim | State | Why |
| --- | --- | --- |
| Every price change needs human approval | `rejected` as universal | Odoo documents always-override (E-006). Approval remains a Policy some organizations add (E-024) |
| Featured-offer target is the price we must charge | `rejected` | E-026, E-015. Seller is retailer of record |
| ERPNext margin field is a cost-floor Policy | `rejected` | E-005 |
| One product has one price | `rejected` | E-019, E-021, E-027 |
| Competitive type on a price table is live intelligence | `rejected` | E-009 versus E-012 |

## Laws this folder will not steal

- Issue 16 L-001 and L-002 stay in `research/domain/o2c/`.
- Product and SKU identity stay in issue 15.
- Float-for-money stays rejected wherever issue 13 recorded it.
