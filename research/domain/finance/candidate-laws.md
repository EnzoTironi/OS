# Candidate laws

**Kind.** candidate law. Each card names counterexample and runtime consequence.  
**Decision.** per card. Never `accepted`.

These are the smallest claims that explain the evidence. They are not OS primitives. RFC-0001 was not edited.

## L-001. Receivable or payable is a claim, not settlement

**Claim.** An amount due is a duty asserted by or against a party. Recording it does not move cash and does not prove the other party has paid.

**Evidence.** E-001, E-010, E-011. Issue 16 `L-007`. Issue 17 `L7`.

**Counterexample that would reject it.** A mature domain where the only receivable is the payment row, and invoices, implied claims, advances, and unpaid bills have no remaining ambiguity.

**Runtime consequence.** `IssueClaim` and `RecordPayment` are different Actions. Surfaces that print a proforma must not mint settlement.

**State.** `supported`

## L-002. Payment instruction is not a payment event

**Claim.** Asking a customer to pay, grouping a supplier run, creating a gateway intent, or authorizing a card can fail, time out, or stay unknown. None of those facts is money observed.

**Evidence.** E-002, E-007, E-009, E-019. FIBO Payment versus Payment Event. Stripe PaymentIntent versus Charge.

**Counterexample.** A source that posts bank and clears the claim solely because a pay link or payment file was created, with no later event and no way to leave the outcome unknown.

**Runtime consequence.** Lost processor response stays `unknown`. Retry is keyed to the instruction, not a new anonymous intent. Constitution rule 8 and 9.

**State.** `supported`

Independent first-party sources agree. This is the instruction-versus-event fork named in the standing orders.

## L-003. Allocation is a third fact

**Claim.** Binding some quantity of money or credit to some quantity of a claim is not the cash posting and not the claim. It can happen later, in parts, across many claims, and can be reversed without reversing the bank.

**Evidence.** E-004, E-006, E-023. ERPNext Payment Ledger. Moqui PaymentApplication. ValueFlows `settles`.

**Counterexample.** A source where changing allocation always posts a second bank movement, or where unallocated cash cannot exist.

**Runtime consequence.** `AllocateSettlement` must not debit Bank again. Outstanding is a projection over allocations.

**State.** `supported`

## L-004. Unallocated money is a valid state

**Claim.** Money can exist as an advance, an unapplied receipt, or an overpay remainder with no claim, or with leftover after claims are filled. That remainder is owed back or waiting, not silently added to an invoice total.

**Evidence.** E-012, E-013.

**Counterexample.** A legal book that forbids customer credit and always forces leftover cash onto a new or existing invoice at the moment of receipt.

**Runtime consequence.** `MoneyReceived` without `MoneyAllocated` is legal. Overpay must not mutate issued amount.

**State.** `supported`

## L-005. A bank statement line is not the book voucher

**Claim.** The bank's observation of a movement is a different fact from the organization's payment record. Importing the observation does not post cash. Matching the two must not mint a duplicate payment when a voucher already exists.

**Evidence.** E-005, E-020.

**Counterexample.** A source where the statement line is the only payment object and there is no unmatched book-side remainder.

**Runtime consequence.** `ObserveBankLine` is an Event from outside. Duplicate bank identifiers are first-class.

**State.** `supported`

## L-006. Payment-to-claim match is not bank-to-book match

**Claim.** Those are two bindings. Collapsing them into one "reconcile" hides paid-but-unallocated invoices and allocated-but-uncleared checks.

**Evidence.** E-006, E-007, E-023.

**Counterexample.** A domain where those two bindings cannot diverge and aging never lies.

**Runtime consequence.** Two verbs. Follow-up queries must say which binding they assume.

**State.** `supported`

## L-007. Fees and FX gaps explain a difference. They do not rewrite the claim

**Claim.** Bank charges, withholding, write-offs, and realized exchange differences are additional facts that make cash unequal to allocated claim. The original issued amount stays.

**Evidence.** E-014, E-017.

**Counterexample.** A required practice that edits the submitted invoice grand total whenever the bank fee or FX gap appears.

**Runtime consequence.** Settlement can be cash C, allocated A, and fee F, with C + F related to A by an explicit explanation. Issue 21 owns how that hits the journal.

**State.** `supported`

## L-008. Outstanding, payment status, and aging are projections

**Claim.** Paid, Partly Paid, Overdue, and age buckets are functions of issued, allocated, credited, written off, due schedule, and as-of time. They are not independent mutable kinds.

**Evidence.** E-016, E-023, E-024.

**Counterexample.** A source where status can be set by hand with no remaining outstanding math, and auditors accept that as the receivable.

Odoo lets a user mark Should Be Paid by hand on bills (issue 17). That is a weak counterexample for payable matching, not proof that AR aging is a stored enum.

**Runtime consequence.** Reports must be replayable from the facts. A stored status field is a cache.

**State.** `supported`

## L-009. Compensating money events do not delete history

**Claim.** Refund, credit note, void after capture, and chargeback add Events. They can reopen outstanding. They do not make the original claim or payment never have existed.

**Evidence.** E-018, E-021. ValueFlows `corrects`. Issue 16 L-009.

**Counterexample.** A legal audit that requires the original receipt to vanish so that cash and receivables look as if the payment never occurred.

**Runtime consequence.** After settlement, the model still accepts later Events. `Paid` is not a terminal world state.

**State.** `supported`

## L-010. Authorization is not capture

**Claim.** A hold reduces availability on a method or financial account. Capture, release, expiry, and failure are later facts.

**Evidence.** E-009.

**Counterexample.** A card or stored-value regime that has no hold state and treats every auth as a completed payment.

**Runtime consequence.** Available cash and actual cash are different queries. Same shape as inventory reservation in issue 16 L-004, different resource.

**State.** `supported`

## L-011. Internal cash transfer is not party settlement

**Claim.** Moving money between an organization's own cash or bank accounts does not create or settle a customer or supplier claim.

**Evidence.** E-015.

**Counterexample.** A book that posts AR or AP on every internal sweep.

**Runtime consequence.** `TransferCash` shares money-movement mechanics and must not call `AllocateSettlement`.

**State.** `supported`

## L-012. Multicurrency settlement carries two amounts

**Claim.** Claim currency amount and settlement currency amount are both stored. The rate at claim time and the rate at payment time can differ. The gap is a realized difference, not a second claim, unless policy says otherwise.

**Evidence.** E-017.

**Counterexample.** A single-currency-only world, or a book that overwrites the invoice rate when payment arrives and pretends the claim was always at the new rate.

**Runtime consequence.** Allocation math runs in the claim's currency. Cash posts in the account currency. Issue 21 owns revaluation of open balances.

**State.** `supported`

## L-013. Allocation is scoped to party and control account

**Claim.** A payment for party A does not allocate to party B's claim. Sources that allow a combined bank deposit still split it into per-party vouchers before allocation.

**Evidence.** E-022, E-004.

**Counterexample.** A first-party rule that one payment object allocates across customers without intermediate split, as a supported happy path.

Odoo batch payments group many customers for bank match. That is bank-to-book convenience, not proof that one party voucher settles another party's claim.

**Runtime consequence.** Party is part of the allocation key. Multi-party deposits are many book Events plus one bank observation.

**State.** `hypothesis`

## L-014. Duplicate settlement needs a stable external identifier

**Claim.** Retry, double import, and overlapping pay links produce two observations of one external movement unless the instruction or bank identifier is reused.

**Evidence.** E-019, E-020.

**Counterexample.** A processor and bank that guarantee exactly-once delivery with no identifier and no duplicate statements.

**Runtime consequence.** Idempotency is a property of RecordPayment and ObserveBankLine, not a later optimization. Wave B runtime design waits.

**State.** `hypothesis`

## L-015. Invoice and journal need not be one identity

**Claim.** Whether the claim document is the journal entry is a source-system artifact. The domain law is that a claim exists and that posting is explainable. The identity fork stays open.

**Evidence.** E-024.

**Counterexample that would support collapse.** Independent non-Odoo sources that treat the legal invoice as identical to the journal row with no remaining operational loss.

**Runtime consequence.** Do not put `if objectType == "SalesInvoice"` in a generic engine. Issue 21 owns posting.

**State.** `undetermined`

## Rejected claims

| Rejected claim | Why | State |
| --- | --- | --- |
| Invoice is payment | E-001, E-003 | `rejected` |
| Payment request posts cash | E-002 | `rejected` |
| Bank import posts cash | E-005 | `rejected` |
| Chargeback is a required ERP document type | E-018 | `rejected` |
| Shipment is required before a receivable | Issue 16. Not reopened | `rejected` |
| Float-for-money is a new primitive | E-025 | `rejected` |
| One Reconcile verb covers allocation and bank match | E-006 | `rejected` |

## Runtime pressure if the supported laws survive

- Named Actions at instruction, capture, allocate, unallocate, and bank match. Not generic field writes on outstanding or status.
- Explicit `unknown` after external effects.
- Projections for outstanding, aging, and Paid.
- No domain-name branches in a generic engine.
- Journal mechanics stay out of this folder.
