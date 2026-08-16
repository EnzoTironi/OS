# Sources

**Kind.** source-system artifact (catalogue).  
**Fetched.** 2026-08-16.  
**Decision.** none.

First-party pages and official RDF opened this session. Secondary blogs were not used as evidence. ISO 20022's official catalogue timed out. That row stays `undetermined`.

## ERPNext / Frappe docs

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-EN-PE | https://docs.frappe.io/erpnext/payment-entry | Receive, Pay, Internal Transfer. Allocation. Advance. One party. Deductions. |
| SRC-EN-PRC | https://docs.frappe.io/erpnext/payment-reconciliation | Allocation without a second bank movement. Partial allocate. Not bank reconcile. |
| SRC-EN-BNK | https://docs.frappe.io/erpnext/banking-in-erpnext | Bank, Bank Account, Bank Transaction, Payment Entry, Journal Entry, Bank Reconciliation. Import does not post GL. |
| SRC-EN-LED | https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger | Commitment versus ledger documents. Payment allocation separate from cash posting. FX on settlement. |
| SRC-EN-REQ | https://docs.frappe.io/erpnext/payment-request | Instruction. No GL. Gateway or offline. Do not mark paid until settlement is verified. Overlapping links can double-pay. |
| SRC-EN-ORD | https://docs.frappe.io/erpnext/payment-order | Payment run. Submit does not transfer money. Groups many suppliers. |
| SRC-EN-DED | https://docs.frappe.io/erpnext/handing-deductions-in-payment-entry | Fees, withholding, write-off, FX. Do not edit the invoice. |
| SRC-EN-SI | https://docs.frappe.io/erpnext/sales-invoice | Receivable created on submit. Statuses Unpaid, Overdue, Partly Paid, Paid. Due date for aging. |
| SRC-EN-PL | https://docs.frappe.io/erpnext/payment_ledger | Allocation ledger. Unallocated payment leaves invoice outstanding. Reconcile does not move bank again. |
| SRC-EN-AR | https://docs.frappe.io/erpnext/accounts-receivable-and-payable | Aging by Due Date or Posting Date. Payment-term view. Unapplied credits. |
| SRC-EN-PT | https://docs.frappe.io/erpnext/payment-terms | Schedule of due amounts. Drives overdue and allocation. |

Related ERPNext URLs named by those pages and not fetched as standalone pages this session include Bank Reconciliation, Bank Transaction, Bank Account, Unreconcile Payments (404 on the documented slug), Journal Entry, Exchange Rate Revaluation, Dunning, and Payment Gateway Account.

## Odoo 18 docs

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-OD-PAY | https://www.odoo.com/documentation/18.0/applications/finance/accounting/payments.html | Linked versus stand-alone payment. In payment versus Paid. Partial. Group and batch. Default no journal entry. |
| SRC-OD-BR | https://www.odoo.com/documentation/18.0/applications/finance/accounting/bank/reconciliation.html | Bank transaction versus counterpart. Suspense until match. Partial received can still mark fully paid. |
| SRC-OD-JRN | https://www.odoo.com/documentation/18.0/applications/finance/accounting/get_started/journals.html | Outstanding receipts and payments. Suspense. SEPA or NACHA file is an outgoing instruction. |
| SRC-OD-PT | https://www.odoo.com/documentation/18.0/applications/finance/accounting/customer_invoices/payment_terms.html | Installments as separate receivable items with own due dates. Not the same as down-payment invoices. |
| SRC-OD-FU | https://www.odoo.com/documentation/18.0/applications/finance/accounting/payments/follow_up.html | Aging-driven reminders. Reconcile bank first or you chase already-paid invoices. |
| SRC-OD-FX | https://www.odoo.com/documentation/18.0/applications/finance/accounting/get_started/multi_currency.html | Invoice rate versus later payment rate. Automatic exchange-difference entry. |

## Moqui / Mantle

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-MQ-ACC | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Accounting | Invoice, Payment, PaymentApplication, FinancialAccount, FinancialAccountAuth, PaymentGatewayResponse, GlReconciliation. Statuses. Unapplied cash. |

Behavioral echo from Mantle USL test text already public at https://github.com/moqui/mantle-usl/blob/master/src/test/groovy/OrderToCashBasicFlow.groovy. Used only to confirm PaymentApplication to invoice, invoice-to-invoice credit, and payment-to-payment refund. No implementation was copied.

## REA / ValueFlows

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-VF-FL | https://www.valueflo.ws/concepts/flows/ | Claim resembles Commitment but is receiver-initiated. Claim may stay implied. Events are past only. `corrects` for later events. |
| SRC-VF-SP | https://www.valueflo.ws/specification/all_vf/ | `settles` from EconomicEvent to Claim. `triggeredBy` from Claim to EconomicEvent. |
| SRC-VF-EX | https://www.valueflo.ws/examples/ex-exchange/ | Work event triggers Claim. Later transfer Event partially settles it. |

## FIBO

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-FI-PAY | https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/ProductsAndServices/PaymentsAndSchedules.rdf | Official MIT RDF. Payment, Payment Event, Payment Obligation, Payer, Payee, Payment Schedule, `fulfillsObligation`. |

FIBO Viewer HTML for Settlement and `hasPaymentAmount` loaded a shell page only. Those cells stay `undetermined` beyond the RDF above.

## Processor specs

| ID | URL | What it supplied |
| --- | --- | --- |
| SRC-ST-DSP | https://docs.stripe.com/disputes | Chargeback reverses the payment immediately. Network fee. Later evidence. |
| SRC-ST-PI | https://docs.stripe.com/payments/payment-intents | PaymentIntent lifecycle. Reuse one intent. Idempotency key. Webhooks after confirm. Multiple Charges on one Intent. |

## Failed or unused this session

| Target | Result |
| --- | --- |
| https://www.iso20022.org/iso-20022-message-definitions | Timed out. Pain versus pacs stays `undetermined`. |
| https://docs.frappe.io/erpnext/unreconcile-payments | 404. Behavior cited only from Payment Entry and Payment Reconciliation pages. |
| FIBO Viewer Settlement HTML | Viewer chrome, no class text. |
| Secondary ERPNext or Odoo blogs | Not used. |

## Sibling research, read only

These paths were listed or sampled. Their files were not copied into this folder.

- `research/domain/o2c/` on `cursor/issue-16-domain-cfd8`
- `research/domain/p2p/` on `cursor/issue-17-domain-cfd8`
- Corpus branches `cursor/issue-32-corpus-cfd8`, `cursor/issue-33-corpus-cfd8`, `cursor/issue-34-corpus-cfd8`, `cursor/issue-37-corpus-cfd8`

## Repo context read this session

`docs/thesis.md`, `docs/constitution.md`, `docs/open-questions.md`, `docs/research-program.md`, `docs/swarm-research-backlog.md`, `docs/hypothesis-history.md`, `rfcs/0001-metamodel-hypothesis.md`, `scenarios/README.md`, `research/README.md`, `research/reference-landscape.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.
