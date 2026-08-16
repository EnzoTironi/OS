# Finance and payments domain notes

**Issue.** [22](https://github.com/EnzoTironi/OS/issues/22). Parent [2](https://github.com/EnzoTironi/OS/issues/2). Track: domain.  
**Status.** Partial Wave A drop. Fetched 2026-08-16.  
**Decision.** none as a package. Per-claim states live on the cards.  
**Contract.** `docs/swarm-result-contract.md` is not on `origin/main`. These notes follow the Agent output contract in `docs/swarm-research-backlog.md` (Question, Sources, Evidence, Source artifacts, Convergence, Divergence, Candidate laws, Counterexamples, Runtime pressure, Open questions, Decision state).

## Question

What real-world distinctions does finance require among receivable or payable as claim, payment instruction, payment event, allocation, cash, bank statement, and settlement, and which of those distinctions survive ERPNext, Odoo, Moqui/Mantle, REA/ValueFlows, and FIBO without collapsing into one source system's documents?

The issue also asks for fees, payment status, due dates and aging, currency conversion, refunds, chargebacks, prepayment, and cash transfer. Adversarial cases named in the issue are duplicate payment, lost processor response, partial allocation, overpayment, chargeback after settlement, bank statement mismatch, and multicurrency settlement.

## How to read

| File | Job |
| --- | --- |
| [`sources.md`](sources.md) | First-party pages fetched this session, plus sibling paths on other branches |
| [`evidence.md`](evidence.md) | Labeled evidence blocks. Kind is always named |
| [`matrix.md`](matrix.md) | Convergence and divergence |
| [`lifecycle.md`](lifecycle.md) | Causal chain, not a schema |
| [`candidate-laws.md`](candidate-laws.md) | Smallest claims plus falsifiers |
| [`scenarios.md`](scenarios.md) | Thirty-five scenario cards |
| [`open-questions.md`](open-questions.md) | Unresolved items. Does not answer `docs/open-questions.md` |

## Verdict this pass

Independent sources agree that a receivable or payable is a claim, not money movement. They agree that asking for payment, grouping a payment run, or authorizing a card is not the same fact as money arriving or leaving. They agree that linking money to a claim is a third fact, and that a bank statement line is an observation of an external ledger, not the book voucher.

They disagree on identity. Odoo can register a payment with no journal entry until bank match. ERPNext posts a Payment Entry and keeps allocation on a Payment Ledger. Moqui posts a Payment at Delivered and applies it later. ValueFlows often leaves the claim implied. FIBO names Payment Obligation, Payment, and Payment Event as different classes.

No target schema is proposed. Copyleft systems were read as documented behavior only. Journal posting and period close stay with issue 21. Offer, commitment, and goods events stay with issues 16 and 17. Float-for-money is not reopened.

## Cross-links (read-only)

Sibling notes exist on other branches. They were read, not written.

- `research/domain/o2c/candidate-laws.md` `L-007` on `origin/cursor/issue-16-domain-cfd8`. Settlement and allocation are independent of the claim.
- `research/domain/p2p/candidate-laws.md` `L7` on `origin/cursor/issue-17-domain-cfd8`. Claim is not receipt and not payment.
- `research/erpnext/atlas.md` on `origin/cursor/issue-32-corpus-cfd8` (not reopened this pass).
- `research/odoo/atlas.md` and `research/odoo/disagreement-erpnext.md` on `origin/cursor/issue-33-corpus-cfd8` (not reopened this pass).
- `research/moqui/` on `origin/cursor/issue-34-corpus-cfd8` (not reopened this pass).
- `research/valueflows-rea/issue-0037-economic-cycle.md` on `origin/cursor/issue-37-corpus-cfd8` (not reopened this pass).
- `scenarios/README.md` on `origin/main`. S-004 unknown external outcome. S-010 cancel after irreversible consequences.

## Decision-state rollup

| Claim | State |
| --- | --- |
| Receivable or payable is a claim, not settlement | `supported` |
| Payment instruction is not a payment event | `supported` |
| Allocation is a third fact | `supported` |
| Unallocated money is a valid state | `supported` |
| Bank statement line is not the book voucher | `supported` |
| Payment-to-claim match is not bank-to-book match | `supported` |
| Fees and FX differences explain a gap. They do not rewrite the claim | `supported` |
| Outstanding, status, and aging are projections | `supported` |
| Refund, credit, and chargeback add events. They do not delete history | `supported` |
| Authorization or hold is not capture | `supported` |
| Internal cash transfer is not party settlement | `supported` |
| Invoice and journal share one identity | `undetermined` |
| ISO 20022 pain versus pacs as a universal law | `undetermined` (official catalogue timed out) |
| Chargeback is a first-class ERP document | `rejected` as a universal requirement |
| Bank import posts cash by itself | `rejected` |
| Payment request posts cash by itself | `rejected` |
| Invoice is payment | `rejected` |
| Float-for-money as a new primitive | `rejected` (already rejected elsewhere. Not reopened) |

## Licensing

OS is MIT. ERPNext and Odoo are copyleft. Notes extract concepts and documented behavior. No implementation was pasted or translated.
