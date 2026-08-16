---
issue: 21
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Sources for issue 21

Exact locators used this session. Prefer these over memory. Material not examined is listed at the end.

## ERPNext / Frappe official docs

Fetched 2026-08-16. Pages carry `updated: 2026-08-14` unless noted.

| ID | Document | URL |
| --- | --- | --- |
| S-EN-01 | Journal Entry | https://docs.frappe.io/erpnext/journal-entry |
| S-EN-02 | Chart of Accounts | https://docs.frappe.io/erpnext/chart-of-accounts |
| S-EN-03 | Period Closing Voucher | https://docs.frappe.io/erpnext/period-closing-voucher |
| S-EN-04 | Immutable Ledger | https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext |
| S-EN-05 | Accounting Dimensions | https://docs.frappe.io/erpnext/accounting-dimensions |
| S-EN-06 | Multi Currency Accounting | https://docs.frappe.io/erpnext/multi-currency-accounting |
| S-EN-07 | How Transactions Affect the Ledger | https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger |
| S-EN-08 | Freeze Accounting Entries | https://docs.frappe.io/erpnext/freeze-accounting-entries |
| S-EN-09 | Perpetual Inventory | https://docs.frappe.io/erpnext/perpetual-inventory |
| S-EN-10 | Deferred Revenue | https://docs.frappe.io/erpnext/deferred-revenue |

S-EN-07 page date is 2026-07-30. S-EN-09 page date is 2026-02-27.

## ERPNext code locators

Used only as evidence of named behavior. No implementation was copied.

| ID | Locator |
| --- | --- |
| S-EN-11 | https://github.com/frappe/erpnext/blob/1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4/erpnext/accounts/general_ledger.py. Symbols `is_cancelled` and `is_immutable_ledger_enabled`. |
| S-EN-12 | https://github.com/frappe/erpnext/blob/1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4/erpnext/accounts/doctype/period_closing_voucher/period_closing_voucher.py. Cancellation posting date under immutable ledger. |

## Odoo official docs

Fetched 2026-08-16. Version 19.0 unless noted.

| ID | Document | URL |
| --- | --- | --- |
| S-OD-01 | Accounting and Invoicing | https://www.odoo.com/documentation/19.0/applications/finance/accounting.html |
| S-OD-02 | Year-end closing | https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/year_end.html |
| S-OD-03 | Analytic accounting | https://www.odoo.com/documentation/19.0/applications/finance/accounting/reporting/analytic_accounting.html |
| S-OD-04 | Inventory valuation | https://www.odoo.com/documentation/19.0/applications/finance/accounting/get_started/inventory_valuation.html |
| S-OD-05 | Valuation cheat sheet | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/inventory_valuation/cheat_sheet.html |

S-OD-05 was cited from official year-end and valuation pages. The cheat sheet body was only partially retrieved via search snippets this session.

## Odoo code locators

Used only as evidence of named fields and states. No implementation was copied.

| ID | Locator |
| --- | --- |
| S-OD-06 | https://github.com/odoo/odoo/blob/18.0/addons/account/models/account_move.py. Fields `state` draft/posted/cancel, `move_type`, `is_storno`. |
| S-OD-07 | https://github.com/odoo/odoo/blob/fecc29dd806ccba558d5e3155323a4cac5466853/addons/account/models/account_move_line.py. Debit and credit fields on lines. |

Odoo 18.0 `account.move` field names were inspected as a public branch locator. Behavioral claims about lock dates and year-end use the 19.0 official docs, not the 18.0 Python file.

## Moqui / Mantle official docs

Fetched 2026-08-16.

| ID | Document | URL |
| --- | --- | --- |
| S-MQ-01 | Mantle Structure and UDM, Accounting | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Accounting |
| S-MQ-02 | Marble ERP User Guide, Period Closing | https://moqui.org/m/docs/apps/Marble+ERP+User+Guide/Accounting/Period+Closing |
| S-MQ-03 | Mantle Party, Time Period | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party |

## Moqui code locators

Used only as evidence of published field names. No implementation was copied.

| ID | Locator |
| --- | --- |
| S-MQ-04 | https://github.com/moqui/mantle-udm/blob/f53aba96a14fc97c6b42918300ee880fa0eb03a1/entity/AccountingLedgerEntities.xml. Fields `AcctgTrans.isPosted`, `postedDate`, `transactionDate`, `glFiscalTypeEnumId`, `reversedByAcctgTransId`, `reverseOfAcctgTransId`, `AcctgTransEntry.debitCreditFlag`. |
| S-MQ-05 | https://github.com/moqui/mantle/blob/master/ReleaseNotes.txt. Reverse-of fields and period closing recalculation. Branch tip, not a pinned SHA this session. Grade as `design-claim` unless a later corpus note pins a commit. |

## FIBO

Fetched 2026-08-16.

| ID | Document | Locator |
| --- | --- | --- |
| S-FB-01 | FIBO home | https://spec.edmcouncil.org/fibo/ |
| S-FB-02 | Accounting Equity ontology, versionIRI `FND/20260701/Accounting/AccountingEquity/` | https://github.com/edmcouncil/fibo/blob/85c2ca077946d14dda74c52338a7523a1b44c1e3/FND/Accounting/AccountingEquity.rdf |
| S-FB-03 | Currency Amount ontology, versionIRI `FND/20260701/Accounting/CurrencyAmount/` | https://github.com/edmcouncil/fibo/blob/119fa8c091aa4beece7d22aefa6fe138021a4355/FND/Accounting/CurrencyAmount.rdf |
| S-FB-04 | Viewer path `FND/TransactionsExt/REATransactions/LedgerEntry` | https://spec.edmcouncil.org/fibo/ontology/FND/TransactionsExt/REATransactions/LedgerEntry |

S-FB-04 viewer page did not return class text this session. Treat `LedgerEntry` as `undetermined` until a later fetch returns the OWL definition.

## Accounting standards

Fetched 2026-08-16.

| ID | Document | URL |
| --- | --- | --- |
| S-IF-01 | IAS 8 Accounting Policies, Changes in Accounting Estimates and Errors, issued HTML 2026 | https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias8.html |
| S-IF-02 | IAS 8 2021 issued PDF, Part A | https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors.pdf |
| S-IF-03 | IAS 21 The Effects of Changes in Foreign Exchange Rates, about page | https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/ |
| S-IF-04 | IFRS 15 Revenue from Contracts with Customers, about page | https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/ |
| S-IF-05 | Guide to Selecting and Applying Accounting Policies, IAS 8, November 2019 | https://www.ifrs.org/content/dam/ifrs/news/2019/november/guide-to-selecting-and-applying-accounting-policies-ias-8.pdf |

The IAS 21 and IFRS 15 full normative texts were not retrieved beyond the official about pages. Clause-level claims stay on those about pages plus IAS 8 paragraphs that were read.

## Repository context, not evidence

Read before collection. Not used as domain proof.

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/hypothesis-history.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `docs/swarm-research-backlog.md`
- `rfcs/0001-metamodel-hypothesis.md`
- `scenarios/README.md`
- `research/README.md`
- `research/reference-landscape.md`
- https://github.com/EnzoTironi/OS/issues/21
- https://github.com/EnzoTironi/OS/issues/2

Issue 21 had no comments this session.

## Not examined

- SAP and Dynamics official accounting manuals.
- Full IFRS Conceptual Framework text.
- Full IAS 2 Inventories text.
- Full IAS 21 and IFRS 15 normative PDFs.
- Brazilian CPC / SPED accounting rules. Those belong with issue 29 unless an accounting-only cut appears.
- ERPNext, Odoo, and Moqui test suites beyond the public locators above.
- Corpus PRs for issues 32, 33, 34, and 37. This note did not wait for them.
- Sibling domain folders on other branches. They were not copied into this directory.
