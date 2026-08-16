---
issue: 21
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Adversarial cases. Each card names kind, the law it attacks, and a decision state for what the sources already imply. These are not executable tests.

## S-ACC-001 Backdated journal into an open period

**Kind.** Counterexample. **Attacks.** L2, L13, issue 6 time. **Decision state.** `hypothesis`

On 16 August the books show July complete. An approved invoice proves an expense was incurred on 12 July. The period is still open.

Questions. Is Posting Date the valid time. Is submission time the known time. Does the July trial balance change. Can the system still say what it believed on 15 August.

Sources. E-013, E-006.

## S-ACC-002 Backdated journal into a frozen period

**Kind.** Counterexample. **Attacks.** L7. **Decision state.** `supported` that ordinary users are blocked

Same facts as S-ACC-001. Accounts Frozen Upto or Lock Everything is 31 July.

Questions. Does the Action refuse. Does a privileged exception log a reason. Does the product silently shift the accounting date to 1 August, as Odoo lock dates can. Those three outcomes are not the same Event.

Sources. E-006, E-015.

## S-ACC-003 Reverse after period close

**Kind.** Counterexample. **Attacks.** L3, L4, L7, L14. **Decision state.** `undetermined` for the legal treatment

A posted July journal is wrong. July is closed. August is open.

Questions. Is the required Action a reverse dated 31 July, a reverse dated today, a reopen plus cancel, or an IAS 8 restatement. ERPNext says the close voucher does not lock, so a separate freeze may still block. Moqui allows Period Closing Adjustment after close. Odoo Hard Lock cannot be undone on the documented path.

Sources. E-002, E-005, E-015, E-022, E-029.

## S-ACC-004 Cancel versus reverse on the same voucher

**Kind.** Counterexample. **Attacks.** L4. **Decision state.** `hypothesis`

Two clerks correct the same submitted journal. One cancels. One uses Reverse.

Questions. Do both produce compensating LedgerEntries. Does the original header stay. Can a later auditor tell which Action ran. If both run, is the books effect zero twice.

Sources. E-002, E-019, E-024.

## S-ACC-005 Unbalanced draft submit

**Kind.** Counterexample. **Attacks.** L1. **Decision state.** `supported` as a refused Action

A five-line journal is one cent short on the credit side.

Questions. Is Posting refused. Is a suspense line invented. Is the draft left unposted in an error journal. The last is Moqui. The first is ERPNext and Odoo. Inventing a plug is a falsifier of L1.

Sources. E-001, E-021.

## S-ACC-006 Multicurrency invoice then payment at a new rate

**Kind.** Counterexample. **Attacks.** L9, L10. **Decision state.** `supported` for the two amounts

Invoice EUR 1,200 at 1.15 on 1 June. Payment EUR 1,200 at 1.18 on 20 June.

Questions. Does the receivable foreign amount stay 1,200. Where does the functional difference post. Is that difference realized. Can the payment also carry a bank fee without mixing it into FX.

Sources. E-008, E-017.

## S-ACC-007 Unrealized revaluation then later settlement

**Kind.** Counterexample. **Attacks.** L10. **Decision state.** `supported`

Open EUR receivable is revalued at 30 June. It is paid on 10 July at a third rate.

Questions. Does June revaluation reverse in July or sit as a permanent entry. Can reports separate the June unrealized amount from the July realized amount. Does revaluation change the foreign invoice total. ERPNext says no.

Sources. E-008, E-017.

## S-ACC-008 Partial settlement of one invoice

**Kind.** Counterexample. **Attacks.** L8, L12. **Decision state.** `supported` for the split

Invoice 1,000. Payment 400 allocated to it. 600 remains open.

Questions. Is the receivable still one claim. Are there two LedgerEntries or one entry plus an allocation fact. Does ageing use the residual. Identity of the claim belongs to issue 16. The accounting-only question is whether cash posting and allocation are different facts.

Sources. E-012, E-023.

## S-ACC-009 Overpayment leaves a credit

**Kind.** Counterexample. **Attacks.** L8. **Decision state.** `hypothesis`

Payment 1,200 against invoice 1,000.

Questions. Is the extra 200 unallocated cash, a customer credit, or a new negative receivable. Moqui BillingAccount can show a balance owed to the customer. Do not invent an OS type here. Record that overpayment is not a second invoice.

Sources. E-012, S-MQ-01 BillingAccount.

## S-ACC-010 Stock valuation adjustment after close

**Kind.** Counterexample. **Attacks.** L7, L11. **Decision state.** `undetermined`

A cycle count in August proves July on-hand was overstated. July is locked.

Questions. Does the adjustment post in July, in August, or as an IAS 8 restatement. Does FIFO rewrite later COGS. ERPNext warns that backdated stock can change later layers and may start Repost Item Valuation. Odoo 19 may wait for a stock closing entry.

Sources. E-007, E-009, E-018. Issue 18 owns the quantity. This card owns the GL effect.

## S-ACC-011 Backdated stock movement under FIFO

**Kind.** Counterexample. **Attacks.** L11, issue 6. **Decision state.** `hypothesis`

A receipt dated 8 August is entered on 12 August after later issues have consumed layers.

Questions. Are later valuation rates recomputed. Do already posted COGS LedgerEntries change in place, get reversed, or stay wrong until a repost tool runs. Immutable-ledger pressure and valuation pressure collide here.

Sources. E-007, E-009.

## S-ACC-012 Receipt then invoice, goods received not billed

**Kind.** Counterexample. **Attacks.** L8, L11. **Decision state.** `supported` as a needed cut

Warehouse receives 10 units on 3 March. Supplier invoice arrives 18 March.

Questions. What liability exists on 3 March. ERPNext credits Stock Received But Not Billed. Odoo 19 uses Variation and Bill To Receive through closing or accrual entries. If the invoice never arrives, can the accrual remain.

Sources. E-009, E-018.

## S-ACC-013 Invoice then receipt

**Kind.** Counterexample. **Attacks.** L8, L11. **Decision state.** `hypothesis`

Supplier bills on 1 March. Goods arrive 10 March.

Questions. Does 1 March debit expense, asset, or a billed-not-received account. Continental periodic Odoo debits expense on the bill. Anglo-Saxon perpetual waits for other triggers. One coupling law cannot cover both.

Sources. E-018.

## S-ACC-014 Prepaid service billed and paid on day one

**Kind.** Counterexample. **Attacks.** L8, L15. **Decision state.** `supported`

Customer pays 1,200 on 1 January for a twelve-month service. Invoice is issued the same day.

Questions. Is January income 1,200 or 100. Does the payment Event recognize revenue. ERPNext says no. IFRS 15 says recognition follows control over time. Can the receivable be zero while deferred liability is still 1,100.

Sources. E-010, E-031.

## S-ACC-015 Month-end accrual reversed next period

**Kind.** Counterexample. **Attacks.** L4, L8. **Decision state.** `hypothesis`

On 31 July the books accrue 800 of unbilled contractor cost. On 5 August the real invoice arrives for 850.

Questions. Does August reverse the 800 and post 850, or post 50. If July is now locked, which date carries the reverse. Is the accrual a Journal with a scheduled reverse, or a RecognitionSchedule.

Sources. E-001, E-010, E-015.

## S-ACC-016 Mandatory dimension missing on a P&L line

**Kind.** Counterexample. **Attacks.** L6. **Decision state.** `supported` as a refused Posting

Income account requires Department. The clerk posts a journal with a blank department.

Questions. Is Posting refused. Can a header default fill the line. After go-live of the dimension, do old rows appear in a Department filter. ERPNext says no.

Sources. E-004, E-016.

## S-ACC-017 One journal, two departments

**Kind.** Counterexample. **Attacks.** L6, L12. **Decision state.** `supported`

A 1,000 expense is 600 Sales and 400 Operations against the same Account.

Questions. Are there two lines or one line with a split distribution. Odoo analytic distribution uses percents. ERPNext uses row-level dimension values. Both keep one economic Account.

Sources. E-004, E-016.

## S-ACC-018 Intercompany mirrored journals

**Kind.** Counterexample. **Attacks.** L13. **Decision state.** `hypothesis`

Company A sells to Company B inside the group.

Questions. Are there two BooksEntity postings from one operational Event. Moqui posts both sides when both parties are internal organizations. ERPNext has a dedicated Inter Company Journal Entry type. Issue 30 owns the full cut. This card only forbids collapsing both books into one Journal.

Sources. S-EN-01, E-023.

## S-ACC-019 Opening entry versus year carry-forward

**Kind.** Counterexample. **Attacks.** L7, L14. **Decision state.** `supported` as a warning

A new fiscal year starts. A user creates Opening Entry for every balance-sheet account.

Questions. ERPNext says do not do that. Prior balances carry through the ledger. Odoo 19 requires an explicit appropriation entry to replace Result Brought Forward. Those are different missing-entry problems.

Sources. E-005, E-032.

## S-ACC-020 Second close after a late P&L posting

**Kind.** Counterexample. **Attacks.** L7, L14. **Decision state.** `hypothesis`

A close voucher already transferred July P&L. An approved July accrual is then posted.

Questions. Does the first close rewrite itself. ERPNext says no. A later voucher transfers only the remaining P&L. Can two close Journals for one period both be history.

Sources. E-005.

## S-ACC-021 Soft lock versus hard lock

**Kind.** Counterexample. **Attacks.** L7, L14. **Decision state.** `undetermined`

An auditor sets Hard Lock on 31 December. A material error is found in February.

Questions. Can any Action reopen December. Odoo says Hard Lock is irreversible on the product path. IAS 8 still requires restatement of comparatives. The operational lock and the reporting restatement can disagree.

Sources. E-015, E-029.

## S-ACC-022 Force post into a closed period

**Kind.** Counterexample. **Attacks.** L7, L18. **Decision state.** `hypothesis`

A controller uses Moqui Force Post to put a transaction into a closed month.

Questions. Is this a distinct Action with its own authority. Does it leave provenance that ordinary Posting lacks. If OS has no force path, how does a typed Period Closing Adjustment get expressed.

Sources. E-022.

## S-ACC-023 Automatic posting lands in the error journal

**Kind.** Counterexample. **Attacks.** L1, L18. **Decision state.** `hypothesis`

An invoice is Approved. The item type has no GL account map. Debits and credits would not match.

Questions. Is the invoice operationally approved while the ledger is unposted. Can period close proceed. Moqui says no. This is the accounting form of constitution rule 9.

Sources. E-021, E-023.

## S-ACC-024 Tax lock after a filed return

**Kind.** Counterexample. **Attacks.** L7. **Decision state.** `hypothesis`

A VAT return is filed. Odoo Tax Return lock is set. A sales invoice in that period needs a tax code correction.

Questions. Does Lock Sales, Lock Tax Return, and Lock Everything refuse different Actions. Is a credit note in the open period the only remaining path.

Sources. E-015.

## S-ACC-025 Credit note after partial payment

**Kind.** Counterexample. **Attacks.** L4, L8. **Decision state.** `hypothesis`

Invoice 1,000. Payment 400. Credit note 1,000 for a full return.

Questions. Does the credit reverse income, tax, receivable, and stock. What happens to the 400 cash. Is allocation undone or is a payable to the customer created. Issue 16 owns the commercial return. This card owns the ledger compensation.

Sources. E-002, E-012, S-EN-07 Credit Note.

## S-ACC-026 Stock ledger and general ledger disagree

**Kind.** Counterexample. **Attacks.** L11. **Decision state.** `supported` as a real failure mode

Quantity and warehouse value in the stock ledger do not match the warehouse Account.

Questions. Which is authoritative for the balance sheet. ERPNext points at backdated stock, cancelled vouchers, and a comparison report. Odoo 19 treats inventory app value and accounting value as different clocks and uses a closing entry to sync. A model that assumes they are one fact is already false.

Sources. E-007, E-009, E-018.

## S-ACC-027 Functional currency differs from presentation currency

**Kind.** Counterexample. **Attacks.** L9, E-030. **Decision state.** `undetermined` at clause level

A Brazilian entity's functional currency is BRL. The group presents in USD.

Questions. Are translation differences equity, not income. Do operational ERPs store presentation currency at posting time or only at report time. IAS 21 about page states the split. Full clauses were not fetched. Brazilian fiscal books belong to issue 29.

Sources. E-030.

## S-ACC-028 Prior-period error versus current reversing journal

**Kind.** Counterexample. **Attacks.** L15. **Decision state.** `undetermined`

A 2025 depreciation amount was wrong. The error is found in 2026 after 2025 statements were issued.

Questions. IAS 8 paragraph 46 excludes the correction from 2026 profit. ERPNext and Odoo will happily post a 2026 reverse if the period is open. Can OS produce both the operational compensating Event and the restated comparative view. If not, L15 is incomplete.

Sources. E-029, E-002, E-015.

## S-ACC-029 Mixed deferred and immediate lines on one invoice

**Kind.** Counterexample. **Attacks.** L8, L12. **Decision state.** `supported`

One Sales Invoice has a hardware line recognized now and a warranty line deferred twelve months.

Questions. Does one Journal header carry two recognition lives. ERPNext configures deferred settings per item row. Tax may not defer with the warranty line. Payment can clear the whole receivable on day one.

Sources. E-010.

## S-ACC-030 Movement-time posting versus invoice-time posting

**Kind.** Counterexample. **Attacks.** L11, L13. **Decision state.** `supported` as divergence

The same goods receipt is posted in ERPNext perpetual, Odoo 19 perpetual at invoicing, and Moqui asset receipt.

Questions. How many LedgerEntries exist before the supplier bill. Which Account is credited. If OS picks one trigger, which of the three corpora becomes a permanent special case. This is why L11 stays split.

Sources. E-009, E-018, E-023.
