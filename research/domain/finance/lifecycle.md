# Lifecycle

**Kind.** domain evidence (causal chain).  
**Decision.** `hypothesis` as an OS process. `supported` as the stage cut the sources force.

This is not a schema and not a workflow engine. It is the order of facts a later model must keep separable. Offer, commitment, and goods events are owned by issues 16 and 17. Journal posting and period close are owned by issue 21.

## Stages

```text
commercial duty
    -> claim (receivable or payable)
        -> payment instruction (request, pay link, payment run, gateway intent)
            -> authorization or hold (optional)
                -> payment event (book-side money movement)
                    -> allocation (which claim, how much)
                        -> bank observation (statement line)
                            -> bank-to-book match
```

Any stage can be skipped by policy. Skipping is not identity collapse.

A customer can pay before a claim exists. That is an advance. A claim can exist with no instruction. A book payment can exist with no bank line yet. A bank line can exist with no book voucher yet. Allocation can wait.

## What each stage is

**Commercial duty.** A contract, order, or statute says someone will pay. FIBO Payment Obligation. ValueFlows reciprocal Commitment. ERP order payment schedule. Not yet a receivable.

**Claim.** The receiver-side or issuer-side assertion of amount due. ERPNext Sales or Purchase Invoice. Odoo invoice or bill. Moqui Invoice. ValueFlows Claim. Outstanding starts here.

**Payment instruction.** An attempt to collect or disburse. ERPNext Payment Request or Payment Order. Odoo payment file or registered check not yet deposited. Stripe PaymentIntent. Moqui Proposed or Promised Payment. No cash fact yet.

**Authorization or hold.** A reservation against a payment method or financial account. Moqui FinancialAccountAuth and gateway authorize. Reduces availability. Does not complete settlement.

**Payment event.** Observed or book-recognized movement of money between accounts or agents. ERPNext submitted Payment Entry. Moqui Payment Delivered. Stripe Charge. ValueFlows transfer Event. FIBO Payment Event.

**Allocation.** Binding of some quantity of a payment event (or a credit) to some quantity of a claim. ERPNext Payment Ledger reference. Moqui PaymentApplication. ValueFlows `settles`. Can be partial, many-to-many inside a party, later than the cash fact, and reversible without reversing cash.

**Bank observation.** What the external bank says happened. ERPNext Bank Transaction. Odoo bank transaction on suspense. Not the book voucher.

**Bank-to-book match.** The two ledgers are talking about the same external movement. ERPNext Bank Reconciliation. Odoo bank reconcile. Moqui GlReconciliation.

## Candidate actions and events

These names are research labels. They are not OS primitives.

| Label | Nature | Typical outcome |
| --- | --- | --- |
| IssueClaim | Action | Claim exists. Outstanding = issued |
| RequestPayment | Action | Instruction exists. Ledger unchanged |
| ReleasePaymentRun | Action | Many instructions grouped. Bank not yet moved |
| AuthorizePayment | Action | Hold. Availability down. Cash not moved |
| RecordPayment | Action that should produce an Event | Book-side money movement. May stay unallocated |
| AllocateSettlement | Action | Outstanding projection changes. Bank unchanged |
| UnallocateSettlement | Action | Restores outstanding. Bank unchanged |
| ObserveBankLine | Event from outside | Statement fact. GL unchanged in ERPNext |
| MatchBankToBook | Action | Clearance known. Odoo may then mark Paid |
| RecordFeeOrFxGap | Action or Event | Explains instruction amount versus cash amount |
| RefundOrCredit | Action producing Events | Compensates. Does not delete the original claim or payment |
| RecordChargeback | Event from the network | Reopens exposure after settlement |

An Action can fail, time out, or stay `unknown`. An Event is what was observed. Constitution rule 8.

## Invariants that hold across the chain

1. Issued minus allocated minus credited minus written-off is outstanding. Paid is that quantity reaching zero.
2. Instruction identity must survive retry. Otherwise duplicate payment events appear.
3. Allocation cannot exceed available unallocated payment or remaining outstanding, inside the same party and control account, in the sources that state a rule.
4. Bank match must not mint a second cash Event for a line that already has a voucher.
5. A later compensating Event can make a previously zero outstanding non-zero.

## Status words the sources use

These are projections, not kinds.

| Word | Usual meaning |
| --- | --- |
| Draft | Claim or instruction not yet in force |
| Unpaid | Outstanding > 0 and not yet due |
| Overdue | Outstanding > 0 and due time has passed |
| Partly Paid | Some allocation, outstanding > 0 |
| In payment | Instruction or book payment exists. Bank not matched (Odoo) |
| Paid | Outstanding = 0. In Odoo, also bank matched |
| Authorized | Hold in place (Moqui, card) |
| Delivered | Moqui Payment posted |
| Confirmed Paid | Later confirmation (Moqui) |
| Refunded / Void / Declined | Compensating or failed processor outcomes |

Do not store one status enum as the meaning of the chain.

## Where sibling domains stop

```text
issue 16 O2C     offer -> commitment -> goods or service event -> claim
issue 17 P2P     need -> offer -> commitment -> receipt -> claim
issue 22 finance                              claim -> instruction -> payment -> allocation -> bank
issue 21 accounting                           journal, posting, period close, revaluation
```

This folder starts at the claim and the money. It cites 16 and 17. It does not redo them.
