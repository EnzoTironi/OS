---
issue: 21
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

Marks are evidence of a distinction, not feature scores.

- `Y` means the source makes the distinction in first-party material fetched this session.
- `P` means a partial or differently named cut.
- `N` means the source was examined and does not make the cut.
- `?` means undetermined this session.

## Concept matrix

| Distinction | ERPNext | Odoo 19 | Moqui | FIBO | IFRS / IAS | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Draft versus posted ledger effect | Y | Y | Y | N | N | E-001, E-014, E-020. Standards talk about recognition, not draft UI. |
| Debit total equals credit total at post | Y | Y | Y | N | P | Operational invariant in all three ERPs. Standards assume balanced statements. FIBO has no journal. |
| Line is debit or credit, not both | Y | P | Y | ? | ? | ERPNext and Moqui use one side. Odoo stores debit and credit fields on the line. |
| Header identity plus line identity | Y | Y | Y | ? | N | Universal in the three ERPs. FIBO `LedgerEntry` viewer failed. |
| Group account versus postable leaf | Y | Y | Y | N | N | E-003, E-025. Odoo account hierarchy is documented through prefixes and types, not fetched as a dedicated CoA page. |
| Root types Asset, Liability, Equity, Income, Expense | Y | Y | Y | P | Y | FIBO equity classes exist but are deprecated. IFRS elements match the five. |
| Dimensions or analytics off the chart | Y | Y | P | N | N | Moqui uses `GlAccountCategory` and cost-center style groups. Not the same as ERPNext or Odoo dimensions. |
| Commitment document without GL | Y | P | P | N | Y | E-011. Odoo and Moqui still separate order from invoice, not fully fetched this session. IFRS 15 separates contract from recognition. |
| Cash posting versus allocation | Y | Y | Y | N | N | E-012, E-017, E-023. Identity of the claim belongs to issues 16 and 17. |
| Billing time versus recognition time | Y | Y | P | N | Y | E-010, E-018, E-031. Moqui invoice post is closer to billing than to IFRS 15. |
| Period P&L transfer versus period lock | Y | Y | Y | N | P | E-005, E-015, E-022. Encoding diverges. IAS 8 cares about restatement, not lock dates. |
| Close does not delete history | Y | Y | Y | N | Y | All operational sources keep posted rows. |
| Cancel or reverse as compensating rows | Y | Y | Y | ? | P | IAS 8 wants restatement of comparatives, which is not the same as a current reversing journal. |
| Posted rows not user-deleted | Y | Y | P | N | N | ERPNext immutable ledger is explicit. Odoo posted is locked. Moqui audit-logs amount updates. |
| Transaction time versus posted time | P | P | Y | N | P | Moqui fields are explicit. ERPNext posting date versus creation time. IAS 8 discovery versus error period. |
| Company, account, and transaction currency | Y | Y | P | Y | Y | E-008, E-017, E-027, E-030. Moqui has orig currency on the entry. |
| Realized versus unrealized FX | Y | Y | ? | P | Y | Moqui FX revaluation not fetched. FIBO has `ExchangeRate` only. |
| Perpetual stock posts on movement | Y | N | Y | N | ? | Odoo 19 perpetual posts at invoicing plus closing. IAS 2 not fetched. |
| Stock received not billed / GRNI | Y | Y | P | N | ? | E-009, E-018. Moqui asset receipt posting exists. Exact GRNI account not fetched. |
| Finance book or fiscal type | P | P | Y | N | N | Moqui `glFiscalTypeEnumId`. ERPNext Finance Book. Odoo analytic and lock slices. Parallel books stay `hypothesis`. |
| Error or unknown posting state | P | P | Y | N | N | Moqui error journal. Odoo draft and lock-shifted date. ERPNext validation failure blocks submit. |
| Monetary amount is decimal plus currency | Y | Y | Y | Y | Y | Reinforces rejected float-for-money. E-027. |

## Source-system artifacts

These names should not become OS vocabulary by default.

| Artifact | Source | Why it looks like a concept | Why it may be local |
| --- | --- | --- | --- |
| Journal Entry DocType versus Payment Entry | ERPNext | Strong warning not to replace specialized documents | Document suite, not a domain kind |
| GL Entry, Payment Ledger Entry, Stock Ledger Entry | ERPNext | Three ledgers from one submit | Physical projection split |
| Immutable ledger setting | ERPNext | Sounds like a primitive | Application-level history rule |
| Repost Accounting Ledger, Repost Item Valuation | ERPNext | Repair after stale generated rows | Implementation repair |
| `account.move` with `move_type` | Odoo | Invoice is a journal | Product unification. See Q1 |
| Hard Lock date | Odoo | Irreversible close | Localization and compliance feature |
| Result Brought Forward dynamic line | Odoo | Implicit earnings | Replaced in 19 by explicit entry |
| Analytic distribution percent | Odoo | Split one line | Allocation mechanic |
| Stock input/output accounts removed in 19 | Odoo | Interim stock accounts | Version-local |
| `AcctgTrans` / `AcctgTransEntry` | Moqui | Clean header and line | Entity names |
| `errorGlJournalId` | Moqui | Failed post destination | Journal-as-bucket |
| `GlAccountOrgTimePeriod` | Moqui | Materialized period totals | Projection |
| `FinancialAccount` single-entry | Moqui | Looks like a ledger | Stored-value account |
| FIBO `AccountingEquity` classes | FIBO | Asset, equity, income | Deprecated, moved to ownership |
| Period Closing Voucher | ERPNext | Named close document | One way to book the transfer |

## Convergence worth keeping

Independent sources agree on these cuts. They are still not silently accepted.

1. Draft or unposted work does not change the books. Posted work does.
2. A posted journal is balanced.
3. Only leaf accounts take postings.
4. Management segments are not multiplied into the chart.
5. Posted history is compensated, not erased.
6. Locking a period is not the same as transferring P&L to equity.
7. Billing, cash, and recognition can happen on different dates.
8. Foreign amount and functional amount are both stored.
9. Realized FX and unrealized FX are different events.
10. Money is a decimal amount in a currency.

## Divergence that must not be averaged away

1. **What is the journal.** ERPNext and Moqui generate ledger rows from a source document. Odoo stores the invoice as the move. Journal-versus-event identity stays `undetermined`.
2. **What close means.** ERPNext close voucher does not lock. Odoo lock does not by itself appropriate earnings. Moqui close locks ordinary posting and still allows close-typed transactions. Encoding stays `undetermined`.
3. **When stock hits the books.** ERPNext perpetual posts on the stock document. Odoo 19 perpetual posts at invoicing and uses a closing entry for the rest. Moqui posts on asset receipt and issuance. Coupling law stays `undetermined`.
4. **How a line carries sides.** One-sided amount plus flag versus debit and credit columns.
5. **How error is represented.** Block submit, shift the date past the lock, or leave an unposted error-journal transaction.
6. **How prior-period error is corrected.** Operational reverse-in-current-period versus IAS 8 retrospective restatement.
7. **Whether FIBO helps.** Currency and unit-of-account help. Journal, close, and posting do not, on the files fetched.

## Cross-issue ownership

| Cut | Owner | This folder |
| --- | --- | --- |
| Customer, supplier, invoice, payment identity | Issues 16 and 17 | Accounting effect and allocation-versus-cash only |
| Stock quantity, lot, location, valuation layer | Issue 18 | Coupling and valuation adjustment scenarios |
| Legal person versus operating unit | Issue 14 | Books attach to a legal person. Not re-proved here |
| Valid time versus known time | Issue 6 | Posting date versus posted date as pressure |
| Action versus Event primitive | Issues 7 and RFC-0001 | Accounting lifecycle only. No RFC edit |
| Multi-entity intercompany | Issue 30 | Dual-org posting noted, not modeled |
| Brazilian fiscal books | Issue 29 | Not examined |
