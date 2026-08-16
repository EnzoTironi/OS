# Candidate laws

**Kind.** candidate law. Each card names counterexample and runtime consequence.  
**Decision.** per card. Never `accepted`.

These are the smallest claims that explain the evidence. They are not OS primitives. RFC-0001 was not edited.

## L-001. Offer is not commitment

**Claim.** A published priced proposal can expire, be lost, or be revised without creating stock, receivable, or a binding leftover-demand remainder.

**Evidence.** E-001. ERPNext Quotation statuses Open/Lost/Expired. Odoo quotation before confirm. Moqui Proposed versus Accepted. VF Intent versus Commitment.

**Counterexample that would reject it.** A source that posts AR or reserves identity-bearing stock solely because a quote was sent, with no separate accept step and no way to expire the quote.

**Runtime consequence.** `PublishOffer` must be deniable and expirable. Surfaces that print "Proforma Invoice" must not mint a Claim.

**State.** `supported`

## L-002. Commitment is not occurrence

**Claim.** Accepting an order creates leftover demand (promised quantity and date). It does not by itself move inventory or recognize income.

**Evidence.** E-002. ERPNext FAQ. Payment Entry cycle diagram. VF Economic Events are past only.

**Counterexample.** ERPNext Sales Invoice with Update Stock and no Sales Order. That skips the commitment document. It does not merge commitment with occurrence. It omits leftover-demand control. Official docs treat that as a short path.

**Runtime consequence.** Action `AcceptOffer` may fail credit-limit or policy checks. Success still leaves fulfillment and claim as later Actions.

**State.** `supported`

## L-003. Requested, promised, planned, and actual are four facts

**Claim.** Customer-requested time/qty, seller-promised time/qty, internal plan time/qty, and observed time/qty must remain independently queryable.

**Evidence.** E-004. `docs/open-questions.md` Q3 already warns against one `delivery_date`. S-001 in `scenarios/README.md`.

**Counterexample that would reject it.** A mature domain where those four always collapse with no audit loss. Not found this session.

**Runtime consequence.** Projections may show "late versus promise" and "late versus request" as different queries.

**State.** `supported`

## L-004. Reservation is a temporary exclusive claim on a slice

**Claim.** Reservation reduces what others may consume. It does not change on-hand possession. It is tied to a purpose (a sales commitment, a pick, a receipt-to-order link). Identity-bearing slices cannot be delivered against a different purpose without first releasing the claim.

**Evidence.** E-005. Sibling issue 32 reservation exclusivity tests. Odoo reservation methods. Moqui AssetReservation and FinancialAccountAuth.

**Counterexample.** Shared unreserved remainder of a batch can be delivered (issue 32). Exclusivity is of the reserved quantity, not of the batch identity as a whole. Odoo incoming receipts do not use reservation methods.

**Runtime consequence.** A single reserved-qty integer on Item is not enough. Purpose and identity must be addressable.

**State.** `supported`

## L-005. Leftover demand survives partial events

**Claim.** A Commitment remains open for the unfulfilled remainder until Events cover it, policy closes it, or it is cancelled (when no irreversible dependents exist).

**Evidence.** E-006. ERPNext percentages. Odoo backorders. Moqui `quantityNotHandled`.

**Counterexample.** Close at 15 of 20. The remainder is not an Event. It is a CloseRemaining Action. That is L-008, not a failure of L-005.

**Runtime consequence.** Partial fulfillment must not rewrite the original promised qty. It adds Events and updates remainders.

**State.** `supported`

## L-006. Goods event and receivable claim are independent

**Claim.** Delivery can exist without a claim. A claim can exist without a delivery document. Doing both for the same quantity twice is a duplication error.

**Evidence.** E-007, E-008. ERPNext "do not Update Stock when DN already moved the goods." Odoo invoice-ordered versus invoice-delivered. Moqui Packed as a common billing trigger, not a logical necessity.

**Counterexample that would force a tighter law.** A jurisdiction where a fiscal invoice is legally the delivery. Not opened. Brazilian fiscal is issue 28.

**Runtime consequence.** Engine must not contain `if objectType == "SalesInvoice" then moveStock`. Policy on the Action chooses whether this Claim also records a goods Event.

**State.** `supported`

## L-007. Settlement and allocation are independent of the claim

**Claim.** Money can arrive before, against, or after a Claim, and can apply to many Claims. Outstanding on a Claim is a projection of issued minus allocated minus credited.

**Evidence.** E-009. Advances. Multi-invoice payment. Unapplied cash account in Mantle. Odoo credit allocation banner.

**Counterexample.** A Payment Entry with no party split across customers is refused in ERPNext. Allocation is not free-form across parties.

**Runtime consequence.** `MoneyReceived` without `MoneyAllocated` is a valid state. Retry and bank reconciliation depend on it.

**State.** `supported`

## L-008. Close leftover is not cancel history

**Claim.** "We will not fulfill the rest" and "this posted commitment should not have existed" are different Actions. The first leaves the Agreement submitted. The second is refused while dependents exist, and is otherwise a reversal story.

**Evidence.** E-010. ERPNext Close versus Cancel. Hold versus Resume. Moqui Cancelled versus Rejected versus Return.

**Counterexample.** Odoo `button_draft` on invoices. That challenges immutability of posted claims, not the close-versus-cancel split on leftover demand.

**Runtime consequence.** Two verbs. Two audit trails.

**State.** `supported`

## L-009. Goods return and money credit are separable compensating events

**Claim.** Physical return, receivable reduction, and cash refund can occur in any combination. Each is a new Event. None deletes the original fulfillment or claim.

**Evidence.** E-010. ERPNext return table. Odoo reverse transfer versus credit note. Moqui `receivedQuantity` versus `refundPaymentId`. VF `corrects`.

**Counterexample.** Price-only credit with no goods. Delivery-note return with no credit yet. Both are documented.

**Runtime consequence.** Remaining billable and remaining returnable are functions of ordered, delivered, returned, billed, and credited. See issue 32 `EC-PARTIAL-01`.

**State.** `supported`

## L-010. Credit exposure is checked against open commitments and/or open claims

**Claim.** A policy may refuse `AcceptOffer` or `IssueClaim` when projected exposure exceeds a party-and-entity limit. Bypass at one step does not bypass the other. Override is an authorized Action, not silent mutation.

**Evidence.** E-011.

**Counterexample.** Limit 0 meaning "fall through" in ERPNext. A naive `limit == 0 => refuse all credit` would be wrong.

**Runtime consequence.** Exposure is a query over open promised value, open receivables, unapplied payments, and pending credits. Role-gated override must pin who approved the exception.

**State.** `hypothesis` (opened in two sources, not Odoo, not VF)

## L-011. Price on the claim defaults from the accepted commitment

**Claim.** After acceptance, unit price is part of the Commitment. Changing it is amend, rate-adjustment, or a new agreement. It is not an automatic refresh from today's pricelist.

**Evidence.** E-013. ERPNext Update Items constraints. VF new Commitment or correcting Event.

**Counterexample needed.** Catalog that legally reprices after accept (some utilities, some marketplaces). Not fetched.

**State.** `hypothesis`

## L-012. Quote/order record identity is not a domain law

**Claim.** Whether offer and agreement share one identity is a source-system artifact. The domain law is the phase change, not the primary key.

**Evidence.** Matrix row "Quote vs accepted order identity."

**Counterexample that would promote identity to a law.** Legal systems that require the accepted contract to be a new instrument with a new number in every jurisdiction. Not fetched.

**State.** `undetermined` as a requirement. `supported` as "do not copy Odoo's one-record trick into the metamodel by default."

## Rejected as universal laws

| Rejected claim | Why | State |
| --- | --- | --- |
| Shipment is required before a receivable | E-007 | `rejected` |
| Reservation is a stock movement | E-005 | `rejected` |
| Invoice is payment | E-008, E-009 | `rejected` |
| Cancel deletes shipped history | E-010 | `rejected` |
| One delivery_date field is enough | E-004 | `rejected` |

## Runtime pressure if the supported laws survive

**Kind.** runtime consequence

- Named Actions at phase changes, not generic field writes on promised qty or invoice outstanding.
- Remainders as projections.
- Unknown external outcomes after ship/capture (Q5 in `docs/open-questions.md`). This drop does not answer Q5.
- No `if objectType == "SalesOrder"` in a generic engine. Domain definitions carry the constraints.
- Wave B storage and workflow recommendations wait. These laws are semantic pressure only.
