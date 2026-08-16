# Evidence

**Kind.** domain evidence unless a block says source-system artifact, candidate law, counterexample, or runtime consequence.  
**Decision.** per block.

Each block names the real-world distinction, the source, and what would weaken it. No schema is proposed.

## E-001. Receivable or payable is a claim

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Until finance issues a Sales Invoice, the customer has no formal bill and the seller has no posted receivable or sales income. Submit debits Customer receivable and credits income and tax. Statuses include Unpaid, Overdue, Partly Paid, Paid. A later Payment Entry moves the amount from receivable to bank. It does not record sales income again. SRC-EN-SI, SRC-EN-PE, SRC-EN-LED.

Odoo. A customer invoice or vendor bill is the amount due. A payment reduces that amount. SRC-OD-PAY.

Moqui. An Invoice requests payment and is sent from the party that is owed to the party that owes. Outgoing invoice posts GL when status becomes Finalized. Balancing entry is accounts receivable. Incoming invoice posts when Approved, balancing to accounts payable. SRC-MQ-ACC.

ValueFlows. A Claim resembles a Commitment but is initiated by the receiver. An Economic Event can trigger a reciprocal Claim. Claims can stay implied from event plus agreement. SRC-VF-FL, SRC-VF-EX.

FIBO. A Payment Obligation is a legally enforceable duty to pay a sum of money according to a contract. A Payment is delivery of money in fulfillment of an obligation, such as to satisfy a claim or debt. SRC-FI-PAY.

**Source artifact.** ERPNext Sales Invoice DocType. Odoo `account.move`. Moqui Invoice plus later AcctgTrans. Three encodings of one commercial claim.

**Cross-link.** Issue 16 `L-007` and issue 17 `L7` already split claim from goods and from payment. This folder does not rewrite those cuts.

## E-002. Asking for money is not money moving

**Kind.** domain evidence.  
**State.** `supported`

ERPNext Payment Request records that a specific amount needs to be paid. Creating it does not post to the General Ledger. For a customer, the ledger moves when the gateway completes payment or a Payment Entry is recorded. For a supplier, the ledger moves only when the approved payment is processed. The docs warn not to mark a request paid until actual settlement and the resulting accounting entry are verified. Overlapping active links can let the customer pay the same amount twice. SRC-EN-REQ.

ERPNext Payment Order groups supplier payments into a controlled run. Submitting it does not transfer money through the bank. If built from Payment Requests, accounting entries still need to be created. If built from submitted Payment Entries, the ledger already exists, but the real bank movement must still be completed and reconciled. SRC-EN-ORD.

Odoo can generate SEPA or NACHA outgoing payment files from a bank journal. Those files are instructions to the bank. SRC-OD-JRN.

**Runtime consequence.** `RequestPayment` and `ReleasePaymentRun` must be deniable. Surfaces that send a pay link must not mint a Settlement.

## E-003. Book-side money movement is a later fact

**Kind.** domain evidence.  
**State.** `supported`

ERPNext Payment Entry is the standard document for money received, paid, or transferred. Submit creates General Ledger entries. Receive debits Bank or Cash and credits Customer receivable. Pay debits Supplier payable and credits Bank or Cash. Internal Transfer moves value between company accounts without a customer or supplier balance. SRC-EN-PE, SRC-EN-LED.

Moqui Payment triggers GL posting when status becomes Delivered. Incoming payment balances to AR. Outgoing payment balances to AP. SRC-MQ-ACC.

Odoo default. Registering a payment marks the invoice In payment. No journal entry is created unless outstanding accounts are configured. Paid is reached when the bank transaction is reconciled. SRC-OD-PAY, SRC-OD-JRN.

**Divergence.** Whether the book voucher exists before the bank clears is a source encoding. The domain split is instruction, book recognition, and bank observation.

## E-004. Allocation is independent of cash posting

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Payment allocation is separate from the cash posting. A payment can settle one invoice, split across several, partially settle one, remain unallocated, or sit as an advance against an order. Payment Reconciliation links a submitted payment or credit to outstanding invoices. It does not create another bank movement. It updates how the existing amount is allocated. A $1,796 invoice and a $525 unallocated payment leave the invoice fully outstanding until the Payment Ledger is told they belong together. After reconcile, outstanding becomes $1,271 and status becomes Partly Paid. The bank does not move again. SRC-EN-PE, SRC-EN-PRC, SRC-EN-PL.

Moqui. Payments are applied through PaymentApplication so one payment can apply to many invoices and one invoice can have many payments. A payment can also apply to another Payment. Unapplied amount posts to an unapplied payment account. Later application moves it. SRC-MQ-ACC.

Odoo. A payment can be linked to an invoice or stand alone as outstanding credit or debit. Payments matching and bank reconciliation both deal with leftover balances that must be matched later or written off. SRC-OD-PAY.

ValueFlows. An Economic Event `settles` a Claim fully or partially. The example pays 70 of a 140 claim. SRC-VF-SP, SRC-VF-EX.

**Counterexample that does not kill the split.** ERPNext refuses one Payment Entry across different customers. Allocation is not free-form across parties. That tightens scope. It does not merge allocation into cash.

## E-005. Bank statement line is an observation

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Bank Transaction stores one imported or synchronized statement line. It does not replace the accounting voucher. Importing a Bank Transaction does not by itself post the General Ledger. The Bank Transaction is the statement side. The Payment Entry or Journal Entry is the book side. Reconciliation connects them. Preserve the bank's original identifiers because they support duplicate detection. Do not create a new payment merely because no match is suggested. Search existing vouchers first. SRC-EN-BNK.

Odoo. Bank transactions are posted on the journal's suspense account until reconciliation. Reconciliation replaces suspense with receivable, payable, or outstanding. SRC-OD-BR, SRC-OD-JRN.

Moqui. GlReconciliation records results of reconciliation with external sources such as a bank statement. It tracks opening and reconciled balances against AcctgTransEntry rows. SRC-MQ-ACC.

**Rejected claim.** Bank import posts cash by itself.

## E-006. Two different reconciliations

**Kind.** domain evidence.  
**State.** `supported`

ERPNext states the split in one sentence. Payment Reconciliation matches ERPNext payments and credits with ERPNext invoices. Bank Reconciliation matches ERPNext bank ledger entries with transactions shown by the bank. SRC-EN-PRC, SRC-EN-BNK.

Odoo uses the same English word for both jobs. Register payment, then reconcile the bank line. Follow-up docs say reconcile all bank transactions before sending reminders, or you chase invoices that are already paid. SRC-OD-PAY, SRC-OD-FU.

**Runtime consequence.** One verb `Reconcile` is not enough. The model must say which two records are being bound.

## E-007. In payment is not Paid

**Kind.** domain evidence.  
**State.** `supported`

Odoo. After register payment, invoice status is In payment. Reconciling the bank transaction line finalizes the workflow and marks Paid. A customer check registered in Odoo does not move funds. The check must be deposited. It then appears as a bank transaction and can be reconciled with the registered payment. SRC-OD-PAY.

ERPNext. A payment can be submitted before it clears the bank. Reconciliation is part of regular close, not a required instant. SRC-EN-BNK.

Moqui statuses include Proposed, Promised, Authorized, Delivered, Confirmed Paid, Cancelled, Void, Declined, Refunded. Delivered posts GL. Confirmed Paid is a later status. SRC-MQ-ACC.

**Source artifact.** Odoo In payment / Paid labels. Moqui status enum. The domain fact is that book recognition and bank clearance can disagree.

## E-008. Outstanding accounts are a source encoding of unknown clearance

**Kind.** source-system artifact.  
**State.** `hypothesis` as a required primitive. `supported` as evidence that clearance can be unknown.

Odoo 18 default. Payments do not create journal entries. Stand-alone payments without outstanding accounts do not update Amount Due. Optional outstanding receipts and outstanding payments accounts hold registered payments until they are linked with bank transactions. If the main bank account is used as the outstanding account, register payment sets the invoice Paid immediately. SRC-OD-PAY, SRC-OD-JRN.

This is one product's way to keep "we recorded a payment" from meaning "the bank has the money." It is not a required OS type.

## E-009. Authorization is not capture

**Kind.** domain evidence.  
**State.** `supported`

Moqui FinancialAccount. `actualBalance` is the sum of transactions. `availableBalance` is actualBalance minus authorizations. FinancialAccountAuth reserves an amount in advance of a Withdraw and expires. Payment gateway integration consists of authorize, capture, release, and refund. PaymentGatewayResponse stores the processor reply and is associated with a Payment. SRC-MQ-ACC.

Stripe PaymentIntent is created and later confirmed. Reuse the same PaymentIntent across an interrupted checkout. Provide an idempotency key to prevent duplicate PaymentIntents for the same purchase. A PaymentIntent can have more than one Charge if there were multiple attempts. Monitor webhooks after the client confirms. SRC-ST-PI.

**Runtime consequence.** `unknown` after a lost processor response is a real state. Retry is safe only when the instruction identity is stable. See S-FIN-02.

## E-010. ValueFlows claim can stay implied

**Kind.** domain evidence.  
**State.** `supported` that a claim exists. `undetermined` that it must be a stored object.

ValueFlows. If there is already a Commitment, a Claim is often unnecessary. Claims sometimes do not have to be instantiated. They can be implied from an Economic Event and an agreement. When instantiated, a Claim is `triggeredBy` an Event and later Events `settle` it, including partial amounts. Economic Events are past only. Corrections use another Event with `corrects`, which may be negative. SRC-VF-FL, SRC-VF-SP, SRC-VF-EX.

**Divergence.** ERPs instantiate a bill because tax, numbering, and aging need a document. VF treats that as optional. Issue 16 already recorded this. The finance question is whether aging and dunning can run on an implied claim. See Q-FIN-03.

## E-011. FIBO splits obligation, payment, and payment event

**Kind.** domain evidence.  
**State.** `supported` for the three-class cut in the RDF. `undetermined` for Settlement module details.

Official PaymentsAndSchedules.rdf. Payee is a party who receives a payment in partial or complete fulfillment of an obligation. Payer makes that payment. Payment is delivery of money in fulfillment of an obligation, such as to satisfy a claim or debt. Payment Event is an event that involves delivery of money in fulfillment of an obligation. Payment Obligation is a legally enforceable duty to pay a sum of money according to a contract. Payment Schedule is a schedule for delivery of money. `fulfillsObligation` satisfies a requirement for payment of some claim, debt, or other obligation. SRC-FI-PAY.

FIBO Viewer pages for Settlement and `hasPaymentAmount` did not yield class text this session.

## E-012. Money can arrive before the claim

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Payment Entry is not always last. A customer or supplier advance is created before the invoice and linked or reconciled later. Allocate Advances Automatically on Sales Invoice applies eligible advances. Review every allocation before submit. SRC-EN-PE, SRC-EN-SI.

Moqui. A Payment record may be created very early in an ordering process for an entire order or order part. SRC-MQ-ACC.

Odoo. A payment not linked to an invoice is outstanding credit or debit and later reduces unpaid invoices. Down-payment invoices are a different feature from payment terms. SRC-OD-PAY, SRC-OD-PT.

**Cross-link.** Issue 16 E-009 and issue 17 E12 already have advances. Cited, not rewritten.

## E-013. Overpay leaves remainder, it does not silently enlarge the claim

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Allocate only the invoice balance. The remainder stays as an unallocated advance for that customer. Total allocated cannot exceed the available payment. SRC-EN-PE, SRC-EN-PRC.

Moqui. BillingAccount balance is unpaid invoice total minus associated payment total. Payment total may be larger, in which case there is a positive balance owed to the customer. SRC-MQ-ACC.

Odoo. Remaining debit or credit after match must be reconciled later or written off. SRC-OD-PAY, SRC-OD-BR.

## E-014. Fees explain a gap. They do not rewrite the invoice

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. A payment can differ from an invoice because of bank charges, withholding, exchange differences, or an approved write-off. Record each difference in Deductions or Loss. Do not put a bank fee in Taxes and Charges. Keep a valid submitted invoice unchanged. SRC-EN-DED, SRC-EN-PE.

Bank reconciliation reviews fees, exchange differences, withholding, and other differences separately from the matched amount. SRC-EN-BNK.

Moqui payments may have deductions recorded on the Deduction entity. SRC-MQ-ACC.

Odoo can write off a remaining balance during reconciliation, including a "fully paid" option on a partial receipt that leaves an open-balance line. SRC-OD-BR.

## E-015. Internal cash transfer is not party settlement

**Kind.** domain evidence.  
**State.** `supported`

ERPNext Internal Transfer moves money between company bank or cash accounts without creating a customer or supplier balance. SRC-EN-PE.

Moqui notes that if both from and to parties on a payment are internal organizations with accounting settings, the payment posts for both. That is intercompany, owned by issue 27, not a party receivable. SRC-MQ-ACC.

## E-016. Due date and aging are projections over remainder plus schedule

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. Payment Due Date determines whether the invoice is overdue. Payment Terms Template splits the invoice into due dates and amounts. Accounts Receivable can age by Due Date or Posting Date, and can show a payment-term view instead of one due amount. Unpaid means submitted with outstanding that is not yet overdue. Overdue means the due date has passed and an amount remains. Partly Paid means a payment or credit reduced but did not clear outstanding. Paid means outstanding is zero. Draft invoices are absent from outstanding. SRC-EN-SI, SRC-EN-PT, SRC-EN-AR.

Odoo. Payment terms generate one journal item per computed due date so follow-up and aged receivable see each installment. Follow-up actions fire by overdue days. Reconcile bank first. SRC-OD-PT, SRC-OD-FU.

Moqui Invoice has invoiceDate, dueDate, paidDate, and SettlementTerm. SRC-MQ-ACC.

**Runtime consequence.** `status = Paid` is not a stored business decision. It is a function of issued, allocated, credited, and written off.

## E-017. Multicurrency settlement has two amounts and two rates

**Kind.** domain evidence.  
**State.** `supported` for invoice-rate versus settlement-rate. Revaluation period close belongs to issue 21.

ERPNext. The invoice uses the exchange rate on its posting date. If settlement uses a different rate, the difference is posted as exchange gain or loss. Paid Amount and Received Amount can be in different account currencies. A foreign-currency payment that leaves a small outstanding is an exchange difference, posted through Deductions, not a leftover claim. Exchange Rate Revaluation adjusts open foreign-currency balances for reporting and should be distinguished from realized differences created during payment. SRC-EN-LED, SRC-EN-PE, SRC-EN-DED.

Odoo. If a bank transaction is reconciled in a different currency, a journal entry is created for the exchange gain or loss. Multi-currency docs repeat the one-month-later payment example. Bank import stores company-currency amount plus amount in currency. SRC-OD-PAY, SRC-OD-FX.

Moqui. originalCurrencyAmount and originalCurrencyUomId are kept for bank and other reconciliation when the payment is converted to an internal currency or to the invoice currency. AcctgTrans can carry origCurrencyAmount on entries. SRC-MQ-ACC.

## E-018. Chargeback is a later network event after a charge

**Kind.** domain evidence.  
**State.** `supported` as a processor fact. `rejected` as a required ERP document type.

Stripe. A dispute occurs when a cardholder questions the payment with the issuer. The issuer creates a formal dispute on the card network, which immediately reverses the payment. Money and network fees are pulled from Stripe, then debited from the merchant balance. Evidence can be submitted later. Funds can be withdrawn and later reinstated. SRC-ST-DSP.

ERPNext, Odoo, and Moqui pages fetched this session do not define a Chargeback DocType. They already have refund, void, credit, and compensating payment. A chargeback after the invoice was Paid is therefore a new Event against a settled Claim, not a field edit of the original Payment.

**Runtime consequence.** Settled is not a terminal world state. A later Event can reopen exposure.

## E-019. Lost processor response is not failure

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. If the customer paid but the Payment Request still shows Initiated, verify the provider transaction first. Check gateway account, webhook, site URL, and Error Log. Do not manually mark the request paid until settlement and the accounting entry are verified. If a link failed, check whether the original request or provider transaction succeeded before sending another. SRC-EN-REQ.

Stripe. After the client confirms, the server should monitor webhooks to detect success or failure. Reuse the PaymentIntent. Idempotency keys prevent duplicate intents. Multiple Charges can exist on one Intent from retries. SRC-ST-PI.

Moqui stores PaymentGatewayResponse against the Payment, including codes and results. SRC-MQ-ACC.

**Cross-link.** `docs/open-questions.md` question 5 and `scenarios/README.md` S-004 already name `unknown`. This folder adds payment-shaped evidence. It does not answer that question.

## E-020. Duplicate detection needs a stable external identifier

**Kind.** domain evidence.  
**State.** `hypothesis` as a law. `supported` as operational pressure.

ERPNext. Preserve the bank's original identifiers because they support duplicate detection. If a Bank Transaction was imported twice, do not reconcile both copies. SRC-EN-BNK.

ERPNext Payment Request. Avoid multiple active links that could let the customer pay the same amount twice. SRC-EN-REQ.

Stripe. Idempotency key on PaymentIntent creation. Reuse the same Intent for one cart. SRC-ST-PI.

Moqui paymentRefNum is the reference for subsequent gateway operations. SRC-MQ-ACC.

## E-021. Credit and refund are compensating events

**Kind.** domain evidence.  
**State.** `supported`

ERPNext. A return Sales Invoice (Credit Note) reduces receivable. Payment Entry can later refund cash. Unreconcile plus reconcile fixes a wrong allocation without inventing a new customer receipt. Cancel and amend the Payment Entry only when the payment details themselves are wrong. SRC-EN-SI, SRC-EN-PE, SRC-EN-LED.

Odoo. Credit notes and refunds can be grouped with invoices in one payment. After a credit, outstanding credits are allocated. SRC-OD-PAY.

Moqui. Payment types include Invoice Payment, Disbursement, and Refund. Payment-to-payment application cancels inbound and outbound amounts. Invoice-to-invoice applies a credit memo. Status Refunded exists. SRC-MQ-ACC.

ValueFlows. A later Event with `corrects` and a negative quantity backs out or adjusts the original. SRC-VF-FL.

**Cross-link.** Issue 16 L-009. Goods return and money credit are separable.

## E-022. One bank line can cover many references. One payment cannot cover many parties in ERPNext

**Kind.** domain evidence plus source-system artifact.  
**State.** `supported` for many-to-many amounts inside one party. `hypothesis` for multi-party bank deposits.

ERPNext. One Payment Entry can settle several invoices for the selected party. One invoice can be settled by several payments. A standard Payment Entry has one party. Use separate Payment Entries when money belongs to different parties, even if the bank deposited a single combined amount. Then reconcile the bank transaction to the individual entries. One bank line can be allocated across several references. SRC-EN-PE, SRC-EN-PRC, SRC-EN-BNK.

Odoo batch payments group payments from multiple customers to ease reconciliation and to generate bank files. SRC-OD-PAY.

ERPNext Payment Order can group payments for multiple suppliers and beneficiaries. A standard Payment Entry cannot. SRC-EN-ORD.

## E-023. Follow-up on a paid-but-unreconciled invoice is a false overdue

**Kind.** counterexample to "Overdue is a stored field on the invoice."  
**State.** `supported`

Odoo. Reconcile all bank transactions before starting follow-up to avoid sending reminders for invoices that have already been paid. SRC-OD-FU.

ERPNext. Payment exists but invoice remains open when the payment is unallocated, allocated to another invoice, or posted to a different party account. SRC-EN-AR, SRC-EN-PL.

Aging without allocation and bank match lies.

## E-024. Journal identity of the claim is not settled

**Kind.** source-system artifact.  
**State.** `undetermined`

Odoo invoices live as journal items. Payment terms split one invoice into several receivable journal items with their own due dates. Bank reconciliation mutates the transaction journal entry by replacing the suspense account. SRC-OD-PT, SRC-OD-BR.

ERPNext keeps Sales Invoice, Payment Entry, General Ledger, and Payment Ledger as different records. Payment Ledger does not replace General Ledger. SRC-EN-PL, SRC-EN-LED.

Moqui Invoice or Payment triggers AcctgTrans. They are associated, not identical. SRC-MQ-ACC.

ValueFlows has Event and Claim, not a journal.

Standing order. Claim-versus-journal identity stays `undetermined` unless independent first-party sources agree. They do not.

Period close, posting, and immutable ledger mechanics belong to issue 21.

## E-025. Float-for-money is not a new primitive

**Kind.** candidate law already rejected elsewhere.  
**State.** `rejected`

Money in these sources is a quantity of a currency unit on a claim, a payment, or an account. FIBO Payment has a payment amount. ValueFlows uses resourceQuantity of a currency. ERPNext and Odoo store account-currency and company-currency amounts. No fetched source introduces a float object as the meaning of money. The recurring rejection stands. This pass does not reopen it.
