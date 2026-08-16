# Causal lifecycle

**Kind.** domain evidence (causal chain) plus candidate law (the arrows).  
**Decision.** `hypothesis` as an OS lifecycle. `supported` as the chain the four sources already separate.

This is not a schema. Names in `code` are research labels, not types to implement.

## Happy path

```text
Intent / request
    -> published Offer (quote, proposal, proposed order)
    -> acceptance
    -> Agreement (reciprocal Commitments. goods or service out, money in)
    -> optional Reservation (quantity or identity claimed for a Commitment)
    -> Fulfillment Event (shipment, delivery, service performance)
    -> Claim (invoice / receivable. sometimes implied, usually instantiated)
    -> Settlement Event (money received)
    -> Allocation (which Claim the money reduces)
```

Each arrow is an Action or an external observation. The box on the right of the arrow is an Event or a still-open Commitment. Requested is not happened.

## Quantity and date overlays

Every Commitment carries at least four quantity-like remainders and four time-like facts. They are not one field.

```text
qty_requested     date_requested      (customer Intent)
qty_promised      date_promised       (seller Commitment)
qty_planned       date_planned        (internal plan, pick, production, purchase)
qty_actual        date_actual         (Economic Event)
qty_reserved                          (temporary claim on stock or funds)
qty_claimed                           (invoiced)
qty_settled                           (allocated money)
qty_returned                          (compensating goods Event)
qty_closed                            (leftover demand released without Event)
```

Invariant shape, not arithmetic law yet.

```text
qty_actual + qty_closed <= qty_promised + over_delivery_allowance
qty_claimed is a function of policy (ordered vs delivered) and of returns
qty_settled <= qty_claimed + unallocated_advances_applied
```

Over-delivery allowance is policy. See sibling issue 32 `INV` overflow cards.

## Causal rules the sources already enforce

1. Publishing an offer does not reserve stock and does not post receivable. E-001, E-002.
2. Accepting an order creates or firms Commitments. It still does not move stock or recognize income on the default path. E-002.
3. Reservation may follow accept. It reduces availability. It does not reduce on-hand. E-005.
4. A Fulfillment Event may consume a reservation and reduce leftover promised qty. E-005, E-006, E-007.
5. A Claim may be created from ordered qty, delivered qty, packed shipment, timesheet, or a direct counter sale. E-007, E-008.
6. Settlement without Allocation leaves unapplied cash. Allocation without Settlement is a bookkeeping lie. E-009.
7. Close leftover demand stops future fulfillment. It does not delete the Agreement. E-010.
8. Cancel of a Commitment is refused while later submitted Events still depend on it, unless those Events are reversed first. Sibling issue 32 `INV-DOC` cancel-link cards. E-010.
9. Goods return and money credit are independent compensating Events. Either, both, or neither (price-only credit). E-010.
10. Credit-limit checks fire at Commitment time, Claim time, or both. Bypass at one time does not imply bypass at the other. E-011.

## Source-system projections of the same chain

**Kind.** source-system artifact

| Phase | ERPNext | Odoo | Moqui | ValueFlows |
| --- | --- | --- | --- | --- |
| Intent | Opportunity / Lead request | CRM opportunity | Tentative / wish list order | Intent |
| Offer | Quotation | `sale.order` draft/sent | Proposed order | Proposal publishes Intent |
| Agreement | Sales Order | `sale.order` confirmed | Accepted / Placed order | Agreement of Commitments |
| Reservation | Stock Reservation Entry | move-line reserved qty | AssetReservation | (not in fetched pages) |
| Fulfillment | Delivery Note or SI Update Stock | validated picking | Shipment Packed/Shipped/Delivered | Economic Event |
| Claim | Sales Invoice | `account.move` out_invoice | Invoice Finalized | Claim (or implied) |
| Settlement | Payment Entry | payment + reconcile | Payment Delivered | Economic Event |
| Allocation | PE references / Payment Reconciliation | partial reconcile | PaymentApplication | settles |

Do not import these names into the metamodel.

## Adversarial branches

```text
split shipment     -> many Fulfillment Events, one Commitment
over-delivery      -> Event qty > promised qty, policy must speak
substitution       -> Event resource != promised resource, demand identity persists
price after accept -> new priced Commitment or constrained amend, not silent rewrite
cancel after ship  -> refuse, or compensating return + credit
return after pay   -> goods Event + credit Claim + refund Settlement or reallocation
request vs ATP     -> date_requested != date_promised. both remain
direct invoice     -> Claim without Agreement. leftover-demand tracking is lost
advance            -> Settlement before Claim. Allocation waits
hold               -> Actions blocked. history remains
```

## Candidate Actions and Events

**Kind.** candidate law (names only). **Decision.** `hypothesis`

Actions (attempted). `PublishOffer`, `AcceptOffer`, `AmendCommitment`, `HoldAgreement`, `ResumeAgreement`, `CloseRemaining`, `CancelCommitment`, `ReserveQuantity`, `UnreserveQuantity`, `RecordShipment`, `RecordDelivery`, `IssueClaim`, `AllocateSettlement`, `RecordReturn`, `IssueCredit`, `OverrideCreditLimit`.

Events (occurred). `OfferPublished`, `OfferExpired`, `OfferAccepted`, `QuantityReserved`, `GoodsIssued`, `GoodsDelivered`, `ServicePerformed`, `ClaimIssued`, `MoneyReceived`, `MoneyAllocated`, `GoodsReturned`, `CreditIssued`, `RemainingClosed`.

One Action can produce many Events. An external carrier scan can produce `GoodsDelivered` with no OS Action. Timeout after `RecordShipment` must be allowed to stay unknown. See `docs/open-questions.md` Q5. This note does not answer that question.

## What this lifecycle refuses

- One `delivery_date` field shared by request, promise, plan, and actual.
- Treating `status = paid` on the order as a stored truth rather than a projection.
- Deleting a shipped Commitment because the customer cancelled.
- Using reservation as proof of delivery.
- Using invoice as proof of payment.
- Emitting a target class diagram from this file.
