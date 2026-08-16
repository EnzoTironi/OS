# Convergence matrix

**Kind.** domain evidence (comparison). Source encodings are marked as source-system artifact.  
**Decision.** per row.

Legend. ✓ distinction present. ~ present but collapsed into another record. ? not opened this session. ✗ contradicted as a universal requirement.

| Distinction | ERPNext | Odoo 18 docs | Moqui/Mantle | REA/VF | FIBO / processor | Notes | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Receivable or payable as claim | Sales / Purchase Invoice posts AR or AP. E-001 | Invoice or bill. E-001 | Invoice Finalized or Approved. E-001 | Claim, often implied. E-010 | Payment Obligation. E-011 | Converge that a duty exists | `supported` |
| Claim vs journal identity | SI plus GL plus Payment Ledger. E-024 | Invoice is journal items. E-024 | Invoice triggers AcctgTrans. E-024 | No journal | ? Settlement HTML failed | Source artifact | `undetermined` |
| Instruction vs event | Payment Request and Payment Order do not move money. E-002 | Register payment, then bank file or deposit. E-002, E-007 | Proposed / Promised / Authorized vs Delivered. E-007, E-009 | Intent or Commitment vs Event | Payment vs Payment Event. Stripe PaymentIntent vs Charge | Independent agreement | `supported` |
| Allocation as third fact | Payment Reconciliation and Payment Ledger. E-004 | Matching and outstanding credit. E-004 | PaymentApplication. E-004 | Event `settles` Claim. E-004 | `fulfillsObligation`. E-011 | Converge | `supported` |
| Unallocated / advance | PE before invoice. Remainder stays. E-012, E-013 | Outstanding credit. E-012 | Early Payment on order. Unapplied account. E-012 | Money Event before Claim possible | Obligation can be fulfilled in parts | Converge | `supported` |
| Partial settlement | Allocate less than outstanding. E-004 | Partial payment. E-004 | Partial PaymentApplication. E-004 | Partial `settles`. E-010 | Partial fulfillment in payee definition | Converge | `supported` |
| Overpay remainder | Unallocated advance. E-013 | Remaining balance or write-off. E-013 | BillingAccount credit. E-013 | Event qty can exceed Claim | ? | Converge remainder exists | `supported` |
| Bank statement ≠ book voucher | Bank Transaction does not post GL. E-005 | Suspense until reconcile. E-005 | GlReconciliation vs AcctgTrans. E-005 | n/a | camt-style statements not fetched | Converge | `supported` |
| Two reconciliations | Named as different tools. E-006 | Same word, two steps. E-006 | PaymentApplication vs GlReconciliation | Event settles Claim. No bank tool fetched | ? | Converge in meaning | `supported` |
| In payment vs cleared | Submit PE before bank clears. E-007 | In payment then Paid. E-007 | Delivered vs Confirmed Paid. E-007 | Event is observed | Charge vs dispute later | Converge | `supported` |
| Fees as explanations | Deductions or Loss. E-014 | Write-off line. E-014 | Deduction entity. E-014 | Separate Event | Dispute fee on Stripe. E-018 | Converge | `supported` |
| Internal transfer | Payment Type Internal Transfer. E-015 | Cash or bank journal transfer implied | Internal org payment posts both sides | Transfer between agents | n/a | Converge not a party claim | `supported` |
| Due date / aging | Due Date, terms, AR report. E-016 | Terms split journal items. Follow-up. E-016 | dueDate, SettlementTerm. E-016 | Time on Claim or Event | Payment Schedule. E-011 | Converge as projection | `supported` |
| Status as projection | Unpaid / Overdue / Partly Paid / Paid. E-016 | In payment / Paid / Overdue | Invoice and Payment status enums | Remainder of Claim | PaymentIntent status | Encoding diverges | `supported` |
| Multicurrency two rates | Invoice rate vs payment rate. E-017 | Auto exchange-difference. E-017 | originalCurrencyAmount. E-017 | Quantity in one unit | Stripe exchange_rate on balance tx | Converge | `supported` |
| Refund / credit compensating | Credit Note plus optional PE. E-021 | Credit note, refund, allocate | Refund type, payment-to-payment | `corrects` | Stripe refund vs dispute | Converge | `supported` |
| Chargeback after settlement | No DocType fetched | No DocType fetched | Void / Declined / Refunded only | Later Event | Stripe dispute reverses charge. E-018 | Processor yes. ERP document no | `rejected` as universal ERP type |
| Auth ≠ capture | Gateway mentioned, thin | ? this session | FinancialAccountAuth, gateway auth. E-009 | n/a | PaymentIntent confirm, Charge | Converge where opened | `supported` |
| Duplicate / idempotency | Bank identifiers, overlapping links. E-020 | ? | paymentRefNum | ? | PaymentIntent idempotency. E-020 | Pressure, not one mechanism | `hypothesis` |
| Party-scoped allocation | One PE, one party. E-022 | Batch across customers | PaymentApplication party match (forum, not re-fetched) | Agent on Event and Claim | Payer / Payee | ERPNext is strict | `hypothesis` |
| Invoice required before receivable | Direct SI allowed. Issue 16 | Invoice-ordered allowed | Invoice can be generated from receipt | Claim often implied | Obligation from contract | Required-before-money is ✗ | `rejected` as universal |
| Bank import posts cash | ✗ E-005 | Suspense, not final cash | ? | n/a | n/a | Rejected | `rejected` |
| Payment request posts cash | ✗ E-002 | n/a | Proposed Payment does not post | Intent does not | PaymentIntent unpaid | Rejected | `rejected` |
| ISO 20022 pain vs pacs | ? | SEPA file named only | ? | ? | Official catalogue timed out | Leave open | `undetermined` |
| Float-for-money primitive | Amounts on documents | Amounts on moves | amount + UoM | resourceQuantity | MonetaryAmount | Already rejected | `rejected` |

## Divergence that matters

1. **When the book voucher exists.** Odoo 18 can have a payment record and no journal entry until bank match. ERPNext posts Payment Entry on submit. Moqui posts Payment at Delivered. Do not freeze "payment creates GL" as a law.
2. **Must a claim be stored?** ValueFlows allows implied claims. ERPs instantiate bills for tax, numbering, and aging. See Q-FIN-03.
3. **Is the invoice the journal?** Odoo yes. ERPNext and Moqui no. Stays `undetermined`. Issue 21 owns posting.
4. **May one instrument cover many parties?** ERPNext Payment Entry no. Odoo batch payments and ERPNext Payment Order yes, as a run, not as one party voucher.
5. **May a posted bank line mutate?** Odoo reconciliation replaces the suspense account on the same journal entry. ERPNext matches two records. That is a source correction story, not a finance primitive.

## Convergence that should survive synthesis

Claim → optional instruction → book-side money movement → allocation to claim → bank observation → bank-to-book match. Partial amounts at every step. Remainder after overpay is unallocated credit, not a silent invoice edit. Fees and FX are explanations. Refunds and chargebacks are later events. Status and aging are queries. Instruction failure is not the same as money failure.
