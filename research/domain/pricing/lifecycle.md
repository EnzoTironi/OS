---
issue: 23
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Temporal semantics, Actions, and Policies

This is a candidate cut of the domain. It is not a schema and not an RFC-0001 edit.

**Kind.** explanation built from domain evidence. Action and Policy names are research labels.

## Canonical distinctions

These names are for this folder. They are not OS primitives.

| Name | What it is | What it is not |
| --- | --- | --- |
| Catalog list rate | Dated selling or buying rate in a list, currency, and UOM | The product. The live channel offer. The order line |
| Negotiated rate | Rate founded by a commercial agreement or a named customer or group | A public list. A one-line override with no agreement |
| Channel offer | Published price a buyer can accept on a channel or marketplace listing | The SKU. A competitor observation. A commitment |
| Transaction price | Rate captured on an accepted commitment or later claim line | The list that suggested it. A later fee |
| Promotion | Conditional adjustment evaluated against a business date and basket | The standing list. The coupon token |
| Coupon token | Code or card that enables a promotion, with its own validity and use cap | A wallet. The discount itself |
| Competitor observation | Retrieved or notified price attributed to another seller or retailer | Our offer. A promise we will match |
| Fee estimate | Marketplace's quoted cost of a proposed price | The fee that later posts on payout |
| Price floor or ceiling | Constraint that can refuse a rate | A list rate. ERPNext "margin" markup |

Product and SKU identity belong to issue 15. Offer versus commitment belongs to issue 16 L-001. This folder uses those results. It does not redefine them.

## Temporal dimensions

Constitution item 10 asks for valid time and known time. Pricing needs both, plus a named business date.

| Question | Typical carrier | Evidence |
| --- | --- | --- |
| When is this rate in force in the world? | Valid From / Valid Upto, `fromDate` / `thruDate`, `start_at` / `end_at` | E-001, E-009, E-011, E-022 |
| When did we learn a competitor or fee number? | Retrieval time, notification time, estimate identifier | E-012, E-013, E-014 |
| Which business date do we test against validity? | Transaction date, order placed date, requested ship, created date | E-017, E-022 |
| When did a listing update become live? | Accepted-for-processing versus later live attributes | E-015 |
| When did a quotation stop being acceptable? | Valid Till, Expired status | E-004 |

A stale competitor observation is a known-time problem. An expired promotion is a valid-time problem. They fail different checks.

## Causal chain

Happy path, then the forks that matter.

```text
Catalog list rate (effectivity)
        |
        +--> optional negotiated rate (agreement, customer, group)
        |
        +--> channel offer published per marketplace, store, audience
        |
        +--> competitor observations and fee estimates arrive (known time)
        |
        +--> Reprice Action may change the channel offer
        |
        +--> buyer-facing proposal (quotation / cart / listing)
        |         promotions and coupons evaluated here
        |
        +--> AcceptOffer (issue 16) captures transaction price
        |
        +--> later claim or payout may show a different fee or tax split
```

Forks.

1. A human or agent overrides the computed rate. That is a different Action from publishing a list.
2. Two Reprice Actions race. Last-accepted-for-processing is not last-live.
3. A promotion's Valid Upto passes between cart and confirm.
4. A competitor observation used in the Reprice is older than a later `ANY_OFFER_CHANGED`.
5. Channel A and channel B carry different offers for the same SKU.
6. A floor refuses a reprice that would otherwise match FOEP.

## Candidate Actions

Names are research labels. Surfaces should share them. Constitution item 15.

| Action | Intent | Failure modes |
| --- | --- | --- |
| `PublishListRate` | Put a catalog or buying rate in force for a list, currency, UOM, and interval | Overlap with another list rate. Missing UOM |
| `PublishChannelOffer` | Put a channel offer in force for a listing identity | Rejected by marketplace. Accepted but not live. Floor or MAP |
| `ObserveCompetitorPrice` | Record an observation with source, marketplace, and known time | Missing provenance. Stale on arrival |
| `EstimateMarketplaceFee` | Record a non-guaranteed fee for a proposed price | Estimate later disagrees with payout |
| `ProposeReprice` | Bind a new offer amount to observations, floors, and ontology revision | Stale observations. Concurrent other proposal |
| `ApproveReprice` | Authorize a proposal when policy requires it | Approval of a world that has moved. See S-003 |
| `CommitReprice` | Re-read, revalidate, submit the channel update | External unknown. See S-004 |
| `ApplyPromotion` | Evaluate promotions against the chosen business date and basket | Expired. Limit reached. Quantity already consumed |
| `RedeemCoupon` | Consume a token if the linked promotion still applies | Max use. Wrong channel. Gift-card mistaken for wallet |
| `OverrideTransactionPrice` | Set a rate that is not the computed one | Missing authority. Floor. Silent mutation |
| `IgnoreComputedRules` | Bypass matching rules for one transaction | ERPNext documents this as approved exception |

`PublishChannelOffer` and `CommitReprice` have external effects. Timeout is not failure (E-015, constitution 9).

## Candidate Policies

| Policy | Refuse when | Evidence |
| --- | --- | --- |
| `MinSellerPrice` | Proposed rate is below the floor (cost, MAP, min seller allowed, or selling-settings minimum) | E-023 |
| `MaxSellerPrice` | Proposed rate is above a ceiling | E-011 |
| `PromotionEffectivity` | Business date is outside Valid From / Valid Upto | E-022 |
| `CouponBudget` | Use count or per-customer limit is exhausted | E-003, E-010 |
| `ObservationFreshness` | Competitor or fee observation older than the allowed age | E-012, S-P-03 |
| `RepriceApproval` | Delta, percent, or absolute amount crosses a threshold and the principal lacks grant | E-024, `undetermined` as universal |
| `ChannelIsolation` | A rate published for channel A is applied on channel B without a rule that says so | E-021 |
| `OverrideAuthority` | `OverrideTransactionPrice` or `IgnoreComputedRules` without a permitted principal | E-002, E-010 |

`RepriceApproval` is a hypothesis. Odoo does not require it for order-line override.

## Resolution when several rates match

Do not merge the rates into one identity. Keep the candidates. Apply a named function.

Documented functions.

- Most specific product beat (Odoo product over category).
- Priority number (ERPNext).
- Sequence plus quantity consumption (Moqui promotions).
- Lowest applicable (Dynamics find-next).
- Attribute rank then lowest (Dynamics Unified Pricing).

**Kind.** runtime consequence.

**Decision state.** `hypothesis`.

The engine should be able to explain which candidates existed and which function won. Constitution 14.

## Money

Float-for-money is already a recurring rejection. This folder does not introduce a new money primitive. Whatever value type issue 13 keeps, a price still needs currency, UOM, and an explicit tax-inclusion flag or a separate tax fact. The encoding of that flag stays `undetermined` (D2).
