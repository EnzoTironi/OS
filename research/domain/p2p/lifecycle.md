---
issue: 17
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Semantic lifecycle

A candidate stage machine for procure-to-pay. This is not a target schema and not an RFC-0001 edit. Names below are research labels. They are not OS types.

**Kind.** Explanation over domain evidence E1 through E32.

## Stages

```text
Need
  -> optional Sourcing (RFQ, offers, selection)
  -> Agreement? (standing terms, quantity envelope)
  -> Commitment (release or one-off promise)
  -> Fulfillment observations
        physical custody change
        rights or risk change
        inspection or quarantine
        put-away or available stock
  -> Claim (implied, supplier-authored, or both)
  -> Match (payability)
  -> Valuation adjustment (landed cost, late charges)
  -> Settlement (prepay, pay, allocate)
  -> Compensation (return, debit note, correcting event)
```

Need can be satisfied without sourcing when a default supplier and price already exist. Commitment can exist without a prior Need when a buyer places a spot order. Claim can precede remaining fulfillment under ordered-quantity billing. Settlement can precede Claim as a prepayment. Those skips are policy. They do not merge the stages.

UN/CEFACT Buy-Ship-Pay is the same cut at a coarser grain. Buy covers Need through Commitment. Ship covers Fulfillment. Pay covers Claim through Settlement.

## Candidate actions

An Action is an attempted intervention. It can fail, be denied, go stale, or leave an external outcome unknown. Constitution section 8. Thesis "Action is not event."

| Action label | What the actor attempts | Typical later events |
| --- | --- | --- |
| RecordNeed | State a required specification, quantity, reason, and required-by time | NeedRecorded |
| PublishRFQ | Ask one or more suppliers for offers | RFQPublished, OfferInvited |
| RecordOffer | Capture a supplier's priced proposal and validity | OfferRecorded |
| SelectOffer | Choose an offer or a supplier under an agreement | OfferSelected |
| AgreeTerms | Bind standing price, quantity envelope, and validity | AgreementOpened |
| CommitPurchase | Promise to buy a quantity under terms | PurchaseCommitted |
| AmendCommitment | Change open quantity, date, or price before or after partial fulfillment | CommitmentAmended |
| CancelCommitment | Withdraw remaining promise | CommitmentCancelled |
| RecordDispatch | Assert the supplier or carrier has shipped | DispatchObserved. Often external. |
| RecordReceipt | Assert quantity arrived into custody | CustodyReceived, QuantityRejected |
| TransferRights | Assert ownership or stewardship changed | RightsTransferred |
| Inspect | Accept, reject, or hold quantity | InspectionPassed, InspectionFailed, Quarantined |
| ReleaseToStock | Make quantity available for use | StockAvailable |
| RecordClaim | Assert amount payable, from supplier bill or self-bill | ClaimRecorded |
| MatchClaim | Compare commitment, receipt, and claim | ClaimMatched, ClaimException |
| HoldPayment | Block settlement | PaymentHeld |
| RecordLandedCost | Allocate later charges to received quantity | ValuationAdjusted |
| RecordPayment | Move money, optionally allocate | PaymentRecorded, PaymentAllocated |
| RecordReturn | Send quantity back or claim credit | ReturnShipped, ReturnReceived, ClaimCredited |

These labels are hypotheses for research. They are not an API.

**Runtime consequence.** Humans, APIs, and agents should invoke the same Action. A timeout after RecordDispatch or RecordPayment must be able to stay `unknown`. Scenario S-004 in `scenarios/README.md`.

## Candidate events

An Event is an occurrence. ValueFlows forbids using an Economic Event for a future plan. E22, E25.

| Event label | Establishes | Must not be used for |
| --- | --- | --- |
| NeedRecorded | A demand existed at a time | A supplier promise |
| OfferRecorded | A supplier proposed terms | Acceptance |
| PurchaseCommitted | Both sides are bound to a quantity and terms | Arrival of goods |
| CustodyReceived | Quantity is in a party's possession | Title or risk, unless a separate event says so |
| RightsTransferred or RiskTransferred | Legal or Incoterms position changed | Warehouse put-away |
| QuantityRejected | Quantity failed acceptance | Deletion of CustodyReceived |
| InspectionPassed or Failed | Quality decision | Automatic title change |
| ClaimRecorded | Someone asserted an amount due | Payment |
| ClaimMatched or ClaimException | Comparison result | Silent rewrite of the three quantities |
| ValuationAdjusted | Cost basis changed after knowledge arrived | Pretending freight was known at receipt |
| PaymentRecorded | Money moved | Income or expense recognition already done by the claim |
| ReturnReceived | Quantity left available stock toward the supplier | Erasure of the original receipt |

**Kind.** Candidate law material. See L2, L4, L5 in `candidate-laws.md`.

## Invariants

I1. A Commitment names a specification, a quantity, a supplier role, and terms. It does not by itself change stock or cash.

I2. Sum of accepted receipt events against a commitment line can be less than committed quantity. Partial fulfillment is normal. E7, E15, E19.

I3. Rejected quantity is not available stock. It may still be in custody. E7, E17.

I4. CustodyReceived does not entail RightsTransferred. E24, E26, E27.

I5. ClaimRecorded does not entail CustodyReceived. Ordered-quantity billing and service invoices are allowed by policy. E9, E14.

I6. The same stock movement must not be capitalized twice. ERPNext says do not Update Stock on an invoice when a receipt already posted. E9, E30.

I7. A supplier bill identifier plus supplier plus company is a uniqueness key for claims in ERPNext. Duplicate entry is a domain failure, not a user preference. E9.

I8. Correction adds events. It does not rewrite the original occurrence as if it never happened. E11, E25.

I9. Landed cost may change valuation after goods are issued. Downstream cost of goods sold may need recomputation. Historical decisions stay explainable under what was known then. E10. Scenario S-007 in `scenarios/README.md`.

I10. Payment allocated to a claim cannot exceed the open amount of that claim plus explicit write-off. Remainder is unallocated advance. E12.

I11. Cancel of remaining commitment is blocked or must compensate once irreversible fulfillment or claims exist. Seed scenario S-010.

I12. Supplier is a role of a party in a supply relationship. Destroying the role must not destroy the organization. E32. Seed scenario S-005.

## Status fields are usually projections

ERPNext Material Request Partially Ordered, Purchase Order percent received and billed, Purchase Receipt To Bill, Purchase Invoice Unpaid, Odoo Billing Status, Moqui item status inferred from quantities.

**Kind.** Domain evidence.

**Decision state.** `hypothesis` that operational "status" in P2P is a function of events and open quantities, not an independent mutable fact.

**Falsifier.** A mature system where status is the only record of whether goods arrived, and quantities cannot reconstruct it.

## Mapping to RFC-0001, without editing it

RFC-0001 already hypothesizes Action != Event, and Fact with valid time and provenance. P2P pressure:

- RecordNeed, CommitPurchase, RecordReceipt, RecordClaim, RecordPayment are Actions if the metamodel keeps Action.
- CustodyReceived, ClaimRecorded, PaymentRecorded are Event-nature.
- Ordered quantity, received quantity, billed quantity, and paid quantity are projections.
- Incoterms risk time and warehouse receipt time are different valid times.
- Landed cost is a late fact with a later knowledge time.

Issue 37's ValueFlows note supports the stage distinctions and rejects importing VF class names as kernel primitives. This folder agrees. Decision state `supported` for the stages. Decision state `rejected` for copying PurchaseOrder into the metamodel.
