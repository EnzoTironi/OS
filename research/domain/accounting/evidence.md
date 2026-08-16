---
issue: 21
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence for issue 21

Cited observations. Interpretation lives in `candidate-laws.md` and `lifecycle.md`. Each block names its kind and decision state.

## E-001 Draft journal has no ledger effect

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Saving a journal draft does not change the general ledger. Posting or submission does.
- Citation: Frappe, Journal Entry, updated 2026-08-14, FAQ "Does saving a draft affect the General Ledger?", S-EN-01.
- Observation: ERPNext states that the general ledger is posted when the Journal Entry is submitted. Total debit must equal total credit before submission. A row takes a debit or a credit, never both.
- Limits: One product's submit verb. Compare E-014 and E-020.

## E-002 Cancel keeps history. Reverse creates a new voucher

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: After posting, correction is compensating history, not silent rewrite of the original rows.
- Citation: Frappe, Journal Entry, updated 2026-08-14, "Correct or reverse a Journal Entry" and FAQ "What is the difference between reversing and cancelling?", S-EN-01. Frappe, Immutable Ledger, updated 2026-08-14, S-EN-04.
- Observation: Cancellation changes document status to Cancelled, retains original debit and credit, and adds opposite rows for the same voucher. Reverse Journal Entry creates a separate draft with exchanged sides, linked to the original on current develop versions. Drafts may be edited or deleted. Submitted documents may not be edited in place.
- Limits: Exact cancellation row shape is ERPNext-specific. See E-007 and E-019.

## E-003 Group accounts cannot receive postings

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Chart hierarchy separates organizing nodes from postable ledgers. Root types are Asset, Liability, Equity, Income, and Expense.
- Citation: Frappe, Chart of Accounts, updated 2026-08-14, S-EN-02.
- Observation: Group accounts organize the tree and cannot receive general ledger entries. Ledger accounts are the final nodes used in transactions. Accounts must be non-group and belong to the selected company. Account Type filters transaction behavior. Party-wise balances live inside control accounts rather than one ledger per customer or supplier.
- Limits: Tree UI and Account Type enum are source artifacts. The group-versus-leaf cut recurs in E-025.

## E-004 Dimensions are not accounts

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Management segments tag the same economic account. They do not multiply the chart.
- Citation: Frappe, Accounting Dimensions, updated 2026-08-14, S-EN-05.
- Observation: The account says what happened. Dimensions say which product, region, or department it belonged to. Cost Center and Project already act as dimensions. A new dimension references a DocType. Mandatory rules can apply to Profit and Loss accounts, Balance Sheet accounts, or both. New dimensions do not tag old transactions. Automatic balancing by dimension is optional and must be validated by accountants.
- Limits: Field generation on DocTypes is a source artifact. Compare E-016.

## E-005 Period closing transfers P&L. It does not lock the period

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported` for the split. `undetermined` for how OS should encode close.
- Claim supported: Closing the books has at least two jobs. One moves income and expense to equity. Another stops later posting into the period.
- Citation: Frappe, Period Closing Voucher, updated 2026-08-14, S-EN-03.
- Observation: The voucher transfers net income or loss to a closing equity account and zeroes income and expense for the period. It does not erase history. It does not stop backdated entries. Use Accounting Period or Accounts Frozen Upto to protect the period. A later voucher for the same fiscal year transfers only remaining P&L. Opening entries are for migration, not annual carry-forward.
- Limits: ERPNext voucher name is a source artifact. Compare E-015 and E-022.

## E-006 Freeze is a cut-off, not a reversal

- Grade: `official-doc`
- Kind: source-system artifact with domain pressure
- Decision state: `supported` for "lock does not delete"
- Claim supported: A frozen date prevents ordinary create or change on or before that date. Existing ledger rows stay.
- Citation: Frappe, Freeze Accounting Entries, updated 2026-08-14, S-EN-08.
- Observation: Accounts Frozen Till Date is a company-wide cut-off. An exception role may edit frozen entries. The role does not override every other validation. Moving the date forward after month-end is documented practice.
- Limits: Role name and Company field layout are source artifacts.

## E-007 Immutable ledger is application history, not a chain

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Posted accounting and stock rows stay visible. Cancellation adds opposite rows. Direct deletion of ledger rows is refused.
- Citation: Frappe, Immutable Ledger, updated 2026-08-14, S-EN-04. Code locator S-EN-11.
- Observation: The design exists because backdated change can rewrite later FIFO or moving-average values, tax reports, and later decisions. Cancelled rows are hidden from normal balances unless Show Cancelled Entries is on. A cancelled source document cannot normally be deleted because it owns the original and reversal rows. The page states this is not a blockchain.
- Limits: Repost Accounting Ledger and Repost Item Valuation are source-system repair tools. They are not candidate OS primitives.

## E-008 Three currencies and two exchange differences

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Company currency, account currency, and transaction currency are different facts. Realized difference arises at settlement. Unrealized difference arises while a foreign balance remains open.
- Citation: Frappe, Multi Currency Accounting, updated 2026-08-14, S-EN-06.
- Observation: Financial statements use company currency. An account has one fixed currency after postings exist. Transaction currency converts at the document exchange rate. Payment at a later rate can post realized gain or loss. Exchange Rate Revaluation changes company-currency carrying value and does not change the foreign amount. Bank fees are not exchange differences.
- Limits: ERPNext account-currency immutability is a product rule. IAS 21 supplies the independent standard cut in E-030.

## E-009 Perpetual stock posts the warehouse account on movement

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported` for ERPNext. See E-018 for Odoo divergence.
- Claim supported: Under perpetual inventory, a stock movement has a general ledger effect on a warehouse-linked asset account.
- Citation: Frappe, Perpetual Inventory, updated 2026-02-27, S-EN-09. Frappe, How Transactions Affect the Ledger, updated 2026-07-30, S-EN-07.
- Observation: Purchase Receipt debits the warehouse account and credits Stock Received But Not Billed. Purchase Invoice later clears that liability. Delivery Note credits stock and debits Cost of Goods Sold at valuation cost, not selling price. A stock-updating Sales Invoice can do both billing and COGS. Stock Reconciliation posts the difference to a stock adjustment account. Transfers move value between warehouse accounts.
- Limits: Account names and warehouse-to-account linking are source artifacts. Issue 18 owns stock identity. This note owns the coupling.

## E-010 Billing, cash, and recognition can diverge

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: An invoice can create a receivable while crediting a deferred liability. Later recognition moves the liability to income. Payment clears the receivable and does not decide when income is earned.
- Citation: Frappe, Deferred Revenue, updated 2026-08-14, S-EN-10. Frappe, How Transactions Affect the Ledger, deferred section, S-EN-07.
- Observation: Service start and end dates control recognition. One invoice can mix deferred and immediate rows. Customer advance is money before allocation to an invoice. Deferred revenue is an invoiced amount not yet earned. Recognition Journal Entries may stay Draft until submitted.
- Limits: Days-versus-months allocation is a source setting. IFRS 15 supplies the independent recognition cut in E-031.

## E-011 Commitment documents are not ledger documents

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: A submitted commercial commitment can have no general ledger effect.
- Citation: Frappe, How Transactions Affect the Ledger, "Commitment documents versus ledger documents", S-EN-07.
- Observation: Quotation, Sales Order, and Purchase Order usually post nothing. Delivery Note and Purchase Receipt post stock and cost or receipt accrual when perpetual inventory is on. Invoice posts income or expense, tax, and party balances. Payment Entry posts bank or cash and the party account. Orders can still reserve stock and carry advances recorded separately.
- Limits: ERPNext DocType list is a source artifact. The commitment-versus-recognition cut is the domain claim.

## E-012 Cash posting is not allocation

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `hypothesis` for identity. `supported` for the split.
- Claim supported: Recording money and applying that money to invoices are different facts.
- Citation: Frappe, How Transactions Affect the Ledger, Payment Entry, S-EN-07. Frappe, Journal Entry, FAQ on settling invoices, S-EN-01.
- Observation: A payment can settle one invoice, split across several, partially settle, remain unallocated, or sit as an advance. Payment Reconciliation connects existing payments or credits to invoices without recording the money again. Journal Entry can change outstanding when linked, but Payment Entry is the documented routine path. Payment Ledger tracks outstanding separately from General Ledger.
- Limits: Receivable and payable identity belong to issues 16 and 17. This note records the accounting-only split.

## E-013 Posting date is the accounting period, not create time

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Valid time of the posting can differ from when the system recorded the document.
- Citation: Frappe, How Transactions Affect the Ledger, "When a transaction affects the books", S-EN-07.
- Observation: Posting Date determines the accounting period. Creation date and submission time may differ. Stock Posting Time can change valuation sequence. Backdated correction can be blocked by freeze, Accounting Period, permissions, or the requested date.
- Limits: Bitemporal encoding stays with foundation issue 6. This is operational pressure, not a storage choice.

## E-014 Odoo unifies invoice and journal as one move

- Grade: `implemented-code` plus `official-doc`
- Kind: source-system artifact with domain pressure
- Decision state: `undetermined` for whether the journal is the event
- Claim supported: One operational product stores customer invoice, vendor bill, credit note, and manual journal as types of one posted move.
- Citation: Odoo 18.0 `account.move` fields `state` and `move_type`, S-OD-06. Odoo 19.0 Accounting and Invoicing, multi-currency paragraph, S-OD-01.
- Observation: States are draft, posted, and cancel. Types include `entry`, `out_invoice`, `out_refund`, `in_invoice`, `in_refund`, and receipts. Posted moves affect the ledger. Draft moves can be edited. Official 19.0 docs store company currency and transaction currency together and generate currency gains and losses after reconciling journal items.
- Limits: Unification may be a product convenience. ERPNext and Moqui keep a source document and a generated ledger transaction. See Q1 in `open-questions.md`.

## E-015 Odoo lock dates are not the same as earnings appropriation

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported` for the split. `undetermined` for encoding.
- Claim supported: Preventing later edits and booking the year's result are different actions.
- Citation: Odoo, Year-end closing, 19.0, S-OD-02.
- Observation: Lock Everything prevents create or modify of journal entries with an accounting date on or before the lock date. New entries are pushed to the day after the lock. Administrators can log a timed exception. Hard Lock is irreversible on the documented product path. Current year earnings in Odoo 19 require an explicit journal entry to replace the dynamic Result Brought Forward line. Profit and loss accounts reset. Balance sheet accounts carry forward. Appropriation accounts reset annually and do not affect net profit calculation.
- Limits: Hard Lock irreversibility is a product and localization rule. Compare E-005 and E-022.

## E-016 Analytic plans are a second chart

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Analytic distribution can split one journal line across management accounts without changing the financial account.
- Citation: Odoo, Analytic accounting, 19.0, S-OD-03.
- Observation: Plans group analytic accounts. Applicability can be optional, mandatory, or unavailable, and can vary by domain, account prefix, product category, and company. Distribution is a percentage split. Models can auto-apply. Mass edit of analytic distribution on posted items is documented.
- Limits: Percentage split and plan UI are source artifacts. The second-axis cut matches E-004.

## E-017 Odoo records both currencies and books FX at reconciliation

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: A foreign transaction stores company-currency value and transaction-currency value. Exchange difference is recognized when items are reconciled.
- Citation: Odoo, Accounting and Invoicing, 19.0, Multi-currency environment, S-OD-01.
- Observation: Every transaction is recorded in the company default currency. Another currency stores both values. Odoo generates currency gains and losses after reconciling the journal items. Reports include unrealized currency gains and losses.
- Limits: Timing at reconciliation may differ from ERPNext's payment-time realized difference. Both still separate realized from unrealized.

## E-018 Odoo 19 posts inventory value at invoice or closing, not on every move

- Grade: `official-doc`
- Kind: divergence / source-system artifact
- Decision state: `supported` as a real split. `undetermined` for a single OS coupling law.
- Claim supported: Physical stock valuation and accounting inventory valuation can update on different clocks.
- Citation: Odoo, Inventory valuation, 19.0, S-OD-04. Valuation cheat sheet comparison table, S-OD-05.
- Observation: The Inventory app keeps real-time stock valuation. Accounting updates when requested, most often at closing or, under perpetual, when vendor bills or customer invoices are posted. Periodic posts vendor bills as expenses and updates stock at closing. Perpetual posts bills as assets and expenses COGS at customer invoice. Combined with stock closing, perpetual can still accrue unbilled receipts and undelivered invoices. Odoo 19 removed stock input and output interim accounts used in earlier versions. Accrual entries exist for Bill To Receive, Invoices To Be Issued, Billed Not Received, and Invoiced Not Delivered.
- Limits: This is a version break inside one product. ERPNext perpetual posts on the stock document. Moqui posts on asset receipt and issuance. Do not collapse these into one posting trigger.

## E-019 Odoo reversal is a new move with a chosen date

- Grade: `design-claim` plus `implemented-code`
- Kind: domain evidence
- Decision state: `supported` for "new compensating move"
- Claim supported: Reversal of a posted move creates another move rather than deleting the original.
- Citation: Odoo reversal wizard description in public 18.0 tree, `account.move.reversal`, search hit this session. Official 19.0 year-end and accounting pages describe reverse as an offsetting entry. S-OD-02, S-OD-06.
- Observation: The wizard takes a reversal date and reason. Future-dated reversals can auto-post at date. Credit notes use refund move types rather than a negative invoice type.
- Limits: Wizard class names are source artifacts. Date choice is the domain pressure.

## E-020 Moqui splits transaction date from posted date

- Grade: `official-doc` plus `implemented-code`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: When the economic transaction happened and when it was posted are different fields.
- Citation: Moqui Mantle Accounting, Ledger - Transaction, S-MQ-01. Entity fields in S-MQ-04.
- Observation: `AcctgTrans` has `transactionDate`, `isPosted`, and `postedDate`. Entries use `debitCreditFlag` of D or C, an amount, and optional `origCurrencyAmount`. Posting requires a GL account. Transactions may be created from operational records or manually.
- Limits: Field names are source artifacts. The two timestamps are domain pressure for issue 6.

## E-021 Failed automatic posting goes to an error journal unposted

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: An attempted posting can remain explicitly unposted when configuration or balance fails.
- Citation: Moqui Mantle Accounting, Ledger - Config, `errorGlJournalId`, S-MQ-01. Period Closing, S-MQ-02.
- Observation: Missing GL account mapping or unmatched debits and credits send the transaction to the organization's error journal, left unposted. Period close refuses while unposted transactions exist in the period. This is a real `unknown` or `failed-to-post` state, not a silent skip.
- Limits: Error journal is a source artifact. The unposted-with-reason state is the domain claim.

## E-022 Moqui close blocks ordinary posting and still allows close-typed transactions

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported` for the exception types. `undetermined` for encoding.
- Claim supported: Closed is not a single boolean with one meaning. Ordinary posting stops. Period Closing Adjustment and Net Income Period Closing may still post. Force post is a separate permission.
- Citation: Marble Period Closing, S-MQ-02. Mantle Party Time Period `isClosed`, S-MQ-03.
- Observation: Periods are owned by an internal organization and nest year, quarter, and month. Close requires prior and child periods closed. Net income closing transactions can post after close and do not change the Income Statement report. They do change the Balance Sheet by clearing Unbooked Net Income. Automatic close creates one transaction per income-statement account class.
- Limits: Report exceptions for net-income types are source artifacts. The typed-exception cut is the domain claim.

## E-023 Operational status change posts the ledger

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `hypothesis` for Action-to-Event mapping
- Claim supported: Invoice and payment status changes are the documented triggers that create `AcctgTrans`.
- Citation: Moqui Mantle Accounting, Invoice and Payment sections, S-MQ-01.
- Observation: Outgoing invoice posts when status becomes Finalized. Incoming invoice posts when Approved. Payment posts when Delivered. If both parties are internal organizations, the same invoice or payment posts for both. Payment application is a separate record and can trigger another accounting transaction when unapplied cash is later applied.
- Limits: Status enum values are source artifacts. Dual-org posting is intercompany pressure for issue 30.

## E-024 Reverse-of is a first-class link

- Grade: `implemented-code` plus `design-claim`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: A reversing transaction names the transaction it reverses.
- Citation: S-MQ-04 fields `reversedByAcctgTransId` and `reverseOfAcctgTransId`. S-MQ-05 release note.
- Observation: Mantle stores both directions. Release notes also mention revert of invoice cancel and payment void through service rules.
- Limits: Service-rule mechanism is a source artifact.

## E-025 Shared chart, per-org assignment, per-period balances

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `hypothesis` for the three-layer cut
- Claim supported: Account definition, books membership, and period totals are different records.
- Citation: Moqui Mantle Accounting, Ledger - Account, S-MQ-01.
- Observation: `GlAccount` is a shared chart. `GlAccountOrganization` assigns a subset to an internal organization and holds `postedBalance`. `GlAccountOrgTimePeriod` holds posted debits, posted credits, beginning balance, and ending balance for one account, organization, and time period. Class decides debit or credit nature and report side. Type drives automated posting maps. Categories and groups are extra reporting structures. A group membership is at most one per group type to avoid double counting on a tax form.
- Limits: Entity split is a source artifact. The definition-versus-books-versus-period-total cut is the domain claim.

## E-026 FinancialAccount is single-entry and is not the general ledger

- Grade: `official-doc`
- Kind: source-system artifact
- Decision state: `supported` as a warning, not a primitive
- Claim supported: A stored-value or bank-like balance account can exist beside double-entry without being a GL account.
- Citation: Moqui Mantle Accounting, Account - Financial, S-MQ-01.
- Observation: `FinancialAccount` is described as a single-entry balance account. `actualBalance` is the sum of transactions. `availableBalance` subtracts authorizations. GL posting of deposits and withdrawals is configured separately.
- Limits: Do not promote FinancialAccount into the OS ledger fragment. It is a product of stored-value and payment-method design. Issue 17 and issue 22 may reuse the observation.

## E-027 FIBO money is a decimal amount plus a currency

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: A monetary amount is a measure with exactly one currency and a decimal amount. An exchange rate names two currencies and a rate value.
- Citation: FIBO Currency Amount ontology, versionIRI 20260701, classes `MonetaryAmount`, `AmountOfMoney`, `Currency`, `ExchangeRate`, `UnitOfAccount`, S-FB-03.
- Observation: `MonetaryAmount` is a scalar quantity value with `hasCurrency` cardinality 1 and `hasAmount` as `xsd:decimal`. `AmountOfMoney` is actual cash, not the measure. `UnitOfAccount` is a nominal monetary unit used to represent value of goods, services, assets, liabilities, income, and expenses. `ExchangeRate` requires base currency, dealt currency, and rate value.
- Limits: FIBO does not define journal posting, period close, or debit-credit balance in this ontology. Float-for-money stays `rejected`. See L16.

## E-028 FIBO Accounting Equity is deprecated and is not a journal model

- Grade: `official-doc`
- Kind: source-system artifact
- Decision state: `supported` as a limit on FIBO
- Claim supported: Current FIBO does not supply an operational journal, posting, or period-close model in the Accounting Equity module.
- Citation: FIBO Accounting Equity ontology, versionIRI 20260701, change note FND-409, S-FB-02. Viewer `LedgerEntry` path returned no class text, S-FB-04.
- Observation: Asset, Income, OwnersEquity, RetainedEarnings, and related classes are marked deprecated and equivalent to ownership-ontology classes. The ontology is scheduled for elimination in the Q2 2027 release. The abstract still says the concepts rest on basic accounting principles for equity, debt, assets, and liabilities.
- Limits: Later corpus work on issue 37 may recover REA transaction classes. Until then, FIBO journal cells stay `undetermined`.

## E-029 IAS 8 corrects prior-period error by restatement, not by current profit

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: A material prior-period error is excluded from current profit or loss. Comparative amounts or opening equity are restated.
- Citation: IFRS Foundation, IAS 8 issued HTML 2026, paragraphs 41, 42, 43, and 46, S-IF-01.
- Observation: Current-period errors found before authorization are corrected before issue. Material errors found later are prior-period errors. Correction is retrospective restatement of comparatives, or of opening balances if the error is older than the earliest period presented. Impracticability limits apply. The correction is excluded from profit or loss of the discovery period.
- Limits: IAS 8 is a reporting standard. Operational ERPs often post a current-period reversal instead. That gap is a counterexample family, not a reason to ignore the standard. See S-ACC-028.

## E-030 IAS 21 splits functional, foreign, and presentation currency

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Functional currency is the primary economic environment. Any other currency is foreign. Presentation currency may differ from functional currency.
- Citation: IFRS Foundation, IAS 21 about page, S-IF-03.
- Observation: The standard covers foreign-currency transactions, translation of a foreign operation into functional currency, and translation into a presentation currency. The principal issues are which rates to use and how to report effects of rate changes. Lack of Exchangeability amendments date to August 2023.
- Limits: Full clause text was not fetched. Rate-selection details stay `undetermined` at paragraph level.

## E-031 IFRS 15 recognizes revenue when control transfers, not when billed

- Grade: `official-doc`
- Kind: domain evidence
- Decision state: `supported`
- Claim supported: Revenue follows satisfaction of a performance obligation. Billing and cash are not the recognition test.
- Citation: IFRS Foundation, IFRS 15 about page, five steps, S-IF-04.
- Observation: An entity identifies the contract, identifies performance obligations, determines transaction price, allocates price, and recognizes revenue when the customer obtains control. Satisfaction may be at a point in time or over time.
- Limits: About-page summary, not the full standard. ERPNext deferred revenue is one operational approximation. It is not IFRS 15.

## E-032 Odoo 19 made year-end earnings an explicit entry

- Grade: `official-doc`
- Kind: source-system artifact with domain pressure
- Decision state: `supported` as a product change that reveals the cut
- Claim supported: Implicit P&L reset without a journal item is not enough once reports must show an appropriated result.
- Citation: Odoo, Year-end closing, 19.0, Current year earnings, S-OD-02.
- Observation: Before Odoo 19, current year earnings were handled implicitly. Upgrading users must book prior results explicitly and in chronological order. The trial balance stays balanced through a dynamic Result Brought Forward line until an appropriation entry replaces it.
- Limits: Upgrade advice is product-specific. The demand for an explainable appropriation entry is the domain pressure.
