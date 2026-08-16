# Scenarios

**Kind.** counterexample.  
**Decision.** per card.

A card is useful only if a candidate model must say what remains true. Issue-named cases come first. `scenarios/README.md` S-004 and S-010 are restated with finance IDs so a synthesis agent can query one folder.

## S-FIN-01. Duplicate payment

**Attacks.** L-002, L-014  
**Setup.** Customer is sent one Payment Request. They pay twice, or a webhook is retried and a second Payment Entry is created for one Charge.  
**Must answer.** Are there two Payment Events or one Event with two observations? Does outstanding go negative? Which identifier proves sameness?  
**Source echo.** SRC-EN-REQ overlapping links. SRC-ST-PI idempotency and multiple Charges on one Intent. SRC-EN-BNK duplicate bank identifiers.  
**State.** `supported` as a required distinction

## S-FIN-02. Lost processor response

**Attacks.** L-002, L-010, L-014  
**Setup.** OS confirms a PaymentIntent or gateway capture. The connection times out. The processor may have captured.  
**Must answer.** Can the outcome stay `unknown`? What evidence is required before retry? Which Event, if any, can be asserted before the webhook?  
**Source echo.** SRC-EN-REQ do not mark paid until verified. SRC-ST-PI webhooks. SRC-MQ-ACC PaymentGatewayResponse. `scenarios/README.md` S-004.  
**State.** `supported`

## S-FIN-03. Partial allocation

**Attacks.** L-003, L-008  
**Setup.** Invoice 1,796. Payment 525 recorded with no reference. Later allocate 525.  
**Must answer.** Was the invoice outstanding 1,796 while cash already sat on the party? After allocate, is status Partly Paid without a second bank posting?  
**Source echo.** SRC-EN-PL worked example. SRC-EN-PRC.  
**State.** `supported`

## S-FIN-04. Overpayment

**Attacks.** L-004, L-013  
**Setup.** Invoice 1,000. Customer pays 1,200.  
**Must answer.** Is 200 a new sale, unallocated credit, or an error? Can it apply to a later claim? Can it be refunded without touching the original issued amount?  
**Source echo.** SRC-EN-PE remainder as advance. SRC-MQ-ACC BillingAccount credit.  
**State.** `supported`

## S-FIN-05. Chargeback after settlement

**Attacks.** L-009, L-001  
**Setup.** Invoice issued, payment allocated, bank matched, status Paid. Card network opens a dispute and pulls the funds plus a fee.  
**Must answer.** Does Paid become false? Is the claim reopened, a new claim created, or only a cash Event reversed? Where does the network fee live?  
**Source echo.** SRC-ST-DSP immediate reverse. No ERP Chargeback DocType fetched.  
**State.** `supported` as a required Event. `rejected` as a required ERP type

## S-FIN-06. Bank statement mismatch

**Attacks.** L-005, L-006  
**Setup.** Books show a 1,000 receipt on Monday. Statement shows 995 on Tuesday, or shows nothing, or shows the 1,000 twice.  
**Must answer.** Which side is the observation? Is the 5 a fee (L-007) or a different payment? Do you mint a second voucher?  
**Source echo.** SRC-EN-BNK do not create a payment merely because no match is suggested. SRC-OD-BR remaining debit or credit.  
**State.** `supported`

## S-FIN-07. Multicurrency settlement

**Attacks.** L-012, L-007  
**Setup.** Invoice 1,000 EUR at rate R1. Customer pays 1,000 EUR when the company books USD at R2. Bank posts USD cash.  
**Must answer.** What is outstanding in EUR? What hits the USD bank? Where is R2 minus R1 recorded? Is a leftover cent a claim remainder or FX?  
**Source echo.** SRC-EN-LED, SRC-EN-DED, SRC-OD-FX, SRC-MQ-ACC originalCurrencyAmount.  
**State.** `supported`

## S-FIN-08. Pay link still Initiated after the customer paid

**Attacks.** L-002, L-008  
**Setup.** Payment Request status Initiated. Customer forwards a processor receipt. No Payment Entry yet.  
**Must answer.** Is the claim overdue? May a clerk mark the request paid by hand? What Event is missing?  
**Source echo.** SRC-EN-REQ troubleshooting.  
**State.** `supported`

## S-FIN-09. Payment order submitted, bank rejects the batch

**Attacks.** L-002, L-011  
**Setup.** Payment Order groups ten supplier Payment Entries and is submitted. The bank file is rejected. Some rows may have posted GL.  
**Must answer.** Which instructions are still open? Which book Events exist? Is cancel of the run the same as void of each payment?  
**Source echo.** SRC-EN-ORD submit does not transfer money. Do not create compensating entries until you know what the bank processed.  
**State.** `supported`

## S-FIN-10. Wrong invoice allocation

**Attacks.** L-003  
**Setup.** Money and party are correct. References point at invoice A. The remittance was for invoice B.  
**Must answer.** Is the fix unallocate then allocate, or cancel the Payment Entry? Does the bank move?  
**Source echo.** SRC-EN-PE unreconcile then Payment Reconciliation. Cancel only when payment details themselves are wrong.  
**State.** `supported`

## S-FIN-11. Unallocated cash, invoice still overdue

**Attacks.** L-006, L-008, L-003  
**Setup.** Payment sits unallocated. Aging shows the invoice in 60 days. Collections send a dunning letter.  
**Must answer.** Is Overdue true in the world or only in the projection that ignores unallocated cash?  
**Source echo.** SRC-EN-AR, SRC-OD-FU reconcile before follow-up.  
**State.** `supported`

## S-FIN-12. Bank fee taken from the remittance

**Attacks.** L-007  
**Setup.** Invoice 1,000. Bank credits 985. Remittance says 15 fee.  
**Must answer.** Is outstanding 0, 15, or something else? Which account explains the 15? May the invoice be edited to 985?  
**Source echo.** SRC-EN-DED keep the invoice unchanged.  
**State.** `supported`

## S-FIN-13. Internal transfer mistaken for a customer receipt

**Attacks.** L-011  
**Setup.** Treasury sweeps cash from account A to account B. A clerk books it as Receive from a customer.  
**Must answer.** What claim was invented? How is the false AR reversed without deleting the real cash movement?  
**Source echo.** SRC-EN-PE Internal Transfer has no party balance.  
**State.** `hypothesis`

## S-FIN-14. One bank line, many invoices

**Attacks.** L-003, L-005  
**Setup.** Customer pays three invoices in one transfer. The statement has one deposit.  
**Must answer.** One Payment Event or three? Where does allocation live? How does bank match bind one observation to many references?  
**Source echo.** SRC-EN-PE one party, many invoices. SRC-EN-BNK allocate when one bank line covers several references.  
**State.** `supported`

## S-FIN-15. One bank deposit, many customers

**Attacks.** L-013  
**Setup.** A payment processor settles a daily batch for many customers as one deposit.  
**Must answer.** Is that one Payment Event? Does ERPNext's one-party Payment Entry force a split? Is the processor a party?  
**Source echo.** SRC-EN-PE one party per Payment Entry. SRC-OD-PAY batch payments. SRC-EN-ORD multi-supplier run.  
**State.** `hypothesis`

## S-FIN-16. Advance against an order, invoice later

**Attacks.** L-004, L-001  
**Setup.** Customer pays 30% on the Sales Order. Invoice is issued after delivery.  
**Must answer.** What was outstanding before the invoice? Does the advance settle the claim automatically? Who reviews the allocation?  
**Source echo.** SRC-EN-PE advance before invoice. SRC-EN-SI Allocate Advances Automatically. SRC-OD-PT down payment is not a payment term.  
**State.** `supported`

## S-FIN-17. Refund after allocation

**Attacks.** L-009  
**Setup.** Paid in full. Customer is refunded 200. Goods stay with the customer.  
**Must answer.** Does outstanding return to 200? Is the refund a Payment Event applied to the original payment, to the claim, or to a credit?  
**Source echo.** SRC-MQ-ACC payment-to-payment. Issue 16 return table.  
**State.** `supported`

## S-FIN-18. Credit note, no cash

**Attacks.** L-003, L-009  
**Setup.** Invoice 1,000. Credit note 1,000. No money moves.  
**Must answer.** Is the claim settled? Is that allocation or a second claim that nets? Does bank reconciliation see anything?  
**Source echo.** SRC-EN-PL credit allocated. SRC-OD-PAY outstanding credits. SRC-MQ-ACC invoice-to-invoice.  
**State.** `supported`

## S-FIN-19. Check registered, not deposited

**Attacks.** L-002, L-007  
**Setup.** Clerk registers a customer check. Invoice becomes In payment. The check is never deposited.  
**Must answer.** Is the claim Paid? What does cash in bank show? When does follow-up resume?  
**Source echo.** SRC-OD-PAY checks must be deposited.  
**State.** `supported`

## S-FIN-20. Odoo In payment versus Paid

**Attacks.** L-006, L-008  
**Setup.** Payment registered with outstanding accounts. Invoice In payment. Bank line not yet imported.  
**Must answer.** What do AR, cash, and outstanding-receipts each show? If default no-GL payments are used, what does Amount Due show?  
**Source echo.** SRC-OD-PAY, SRC-OD-JRN.  
**State.** `supported` as a source encoding of L-006

## S-FIN-21. Duplicate bank import

**Attacks.** L-005, L-014  
**Setup.** The same statement file is imported twice. Identifiers match.  
**Must answer.** Two observations or one? If a clerk reconciles both, what cash is invented?  
**Source echo.** SRC-EN-BNK do not reconcile both copies.  
**State.** `supported`

## S-FIN-22. Statement line, no book voucher

**Attacks.** L-005  
**Setup.** Bank shows a withdrawal for a fee or a supplier the books never recorded.  
**Must answer.** When is it legal to create the missing Payment Entry? What must be identified first?  
**Source echo.** SRC-EN-BNK create the voucher only after you identify what the line represents. SRC-OD-BR manual operations.  
**State.** `supported`

## S-FIN-23. Book voucher, no statement line

**Attacks.** L-006, L-007  
**Setup.** Payment Entry submitted Friday. Statement through Friday has no line. It appears the next week.  
**Must answer.** Is cash wrong, or is clearance timing the whole story? Can close wait?  
**Source echo.** SRC-EN-BNK payment can be submitted before it clears. Uncleared checks are a review item.  
**State.** `supported`

## S-FIN-24. Chargeback after partial refund

**Attacks.** L-009, E-018  
**Setup.** Charge 100. Refund 40. Dispute opens on the remainder or on the original.  
**Must answer.** Which Charge is disputed? Can funds be withdrawn and later reinstated? How many compensating Events?  
**Source echo.** SRC-ST-DSP funds reinstated includes partially refunded payments.  
**State.** `hypothesis`

## S-FIN-25. Aging by posting date versus due date

**Attacks.** L-008  
**Setup.** Invoice posted 1 Aug, due 31 Aug. Today is 20 Aug. Another reviewer ages on posting date with 15-day buckets.  
**Must answer.** Is the invoice Current or 15-30? Which query did each reviewer run?  
**Source echo.** SRC-EN-AR ageing based on Due Date or Posting Date.  
**State.** `supported`

## S-FIN-26. Installment schedule, first term only

**Attacks.** L-008, L-003  
**Setup.** Terms 30% due on issue, 70% end of next month. Customer pays the 30%.  
**Must answer.** Which installment is overdue later? Is there one claim or two due slices? Does Odoo's split receivable item become a domain law?  
**Source echo.** SRC-OD-PT two receivable journal items. SRC-EN-PT payment-term view.  
**State.** `hypothesis` for identity of slices. `supported` that the schedule exists

## S-FIN-27. Payment applied to another payment

**Attacks.** L-003, L-009  
**Setup.** Customer overpays. A later refund Payment is applied to the original Payment, not to an invoice.  
**Must answer.** Is that allocation without a claim? What is outstanding on invoices?  
**Source echo.** SRC-MQ-ACC PaymentApplication to another Payment.  
**State.** `hypothesis`

## S-FIN-28. Gateway webhook late after a retry created a second book payment

**Attacks.** L-002, L-014  
**Setup.** Timeout. Clerk records a manual Payment Entry from the bank. Next day the webhook creates another.  
**Must answer.** Which one matches the bank line? How is the duplicate unallocated or voided?  
**Source echo.** SRC-EN-REQ plus SRC-ST-PI plus SRC-EN-BNK.  
**State.** `supported`

## S-FIN-29. Withholding on the payment

**Attacks.** L-007  
**Setup.** Invoice 1,000. Customer remits 850 and a tax certificate for 150.  
**Must answer.** Is the claim settled? Which explanation account holds 150? Is withholding a fee, a tax Event, or a second claim on the state?  
**Source echo.** SRC-EN-DED withholding as a deduction. Fiscal identity is issue 28.  
**State.** `undetermined` for tax identity. `supported` that the invoice is not edited

## S-FIN-30. Unused prepayment, customer wants cash back

**Attacks.** L-004, L-009  
**Setup.** Advance 500. Order cancelled with no invoice. Customer wants 500 returned.  
**Must answer.** What claim, if any, exists? Is the refund settling a credit balance or reversing the original Payment Event?  
**Source echo.** SRC-EN-PE unallocated advance. SRC-MQ-ACC BillingAccount owed to customer.  
**State.** `supported`

## S-FIN-31. Cross-currency bank reconcile

**Attacks.** L-012, L-005  
**Setup.** Invoice and payment in EUR. Company bank account is USD. Statement line is USD.  
**Must answer.** Which amount is matched? What if USD cash disagrees with EUR times today's rate?  
**Source echo.** SRC-OD-FX bank transaction stores both amounts. SRC-OD-PAY exchange entry on reconcile.  
**State.** `supported`

## S-FIN-32. Void after Authorized, before Delivered

**Attacks.** L-010, L-002  
**Setup.** Moqui-style Payment Authorized. Capture never happens. Auth expires or is voided.  
**Must answer.** Did GL post? Is the claim still open? Is there a Payment Event?  
**Source echo.** SRC-MQ-ACC Delivered posts GL. Auth is a hold.  
**State.** `supported`

## S-FIN-33. Write-off remainder versus leave outstanding

**Attacks.** L-007, L-008  
**Setup.** Invoice 100.00. Payment 99.97. Clerk can write off 0.03 or leave Partly Paid.  
**Must answer.** Which Action was taken? Can aging still show 0.03?  
**Source echo.** SRC-EN-DED write-off. SRC-OD-BR fully paid option on partial receipt.  
**State.** `supported`

## S-FIN-34. Supplier on hold, payment run still includes the bill

**Attacks.** L-002  
**Setup.** Purchase Invoice on hold. A Payment Order fetches it anyway, or fails to.  
**Must answer.** Is hold a policy on IssueClaim, on RequestPayment, or on RecordPayment?  
**Source echo.** Issue 17 On Hold prevents payment selection. SRC-EN-ORD missing rows when unpaid or already batched.  
**State.** `hypothesis`

## S-FIN-35. Confirmed Paid versus Delivered

**Attacks.** L-006, L-008  
**Setup.** Moqui Payment Delivered and posted. Bank confirmation arrives later. Status becomes Confirmed Paid.  
**Must answer.** Which status is the Event? Which is a projection on bank match?  
**Source echo.** SRC-MQ-ACC status list.  
**State.** `hypothesis`
