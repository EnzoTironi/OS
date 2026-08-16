---
issue: 21
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Accounting, journal, posting, ledger, dimensions, accrual, reversal, close

Query this directory for issue 21. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

Which accounting distinctions survive when ERPNext Journal Entry and GL Entry, Odoo `account.move`, Moqui `AcctgTrans`, FIBO monetary and equity classes, and IFRS recognition rules are treated as observations rather than tables to copy?

The issue asks these cuts:

1. Journal entry and line identity.
2. Debit-credit invariant.
3. Account and chart hierarchy.
4. Posting versus draft.
5. Fiscal and management dimensions.
6. Accrual and deferral.
7. Period close.
8. Reversal and correction.
9. Inventory-accounting coupling.
10. Revenue and expense recognition.
11. Exchange differences.
12. Immutable ledger history and audit trail.

Required scenario families are backdating, reversal after period close, multicurrency, partial settlement, and stock valuation adjustment.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs, versions, and commits fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E-001 through E-032 |
| `matrix.md` | reference | Convergence, divergence, and source-artifact mapping |
| `lifecycle.md` | explanation | Canonical fragment, posting lifecycle, Action versus Event |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | reference | Thirty falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches or issues. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- Payments, receivable identity, and payable identity belong to issue 16 and issue 17 unless an accounting-only cut appears.
- Stock valuation coupling may cite issue 18. This folder does not rewrite inventory research.
- Float-for-money is already a recurring rejection elsewhere. It is recorded as `rejected` here and is not reopened as a new primitive.
- Journal-versus-event identity and period-close encoding stay `undetermined` unless independent first-party sources agree. They do not.

## Output contract

1. **Question.** This README.
2. **Sources.** `sources.md`.
3. **Evidence.** `evidence.md`.
4. **Source artifacts.** Marked in `evidence.md` and `matrix.md`.
5. **Convergence.** `matrix.md`.
6. **Divergence.** `matrix.md`.
7. **Candidate laws.** `candidate-laws.md`.
8. **Counterexamples.** `scenarios.md`.
9. **Runtime pressure.** `candidate-laws.md` and `lifecycle.md`.
10. **Open questions.** `open-questions.md`.
11. **Decision state.** Each law and this folder. Default is `hypothesis`. Never `accepted`.

## How to read this

Start with `lifecycle.md` for the candidate fragment. Use `matrix.md` when a later issue asks what source X did with posting or close. Use `candidate-laws.md` and `scenarios.md` when a later issue asks what would change the answer.

Do not treat ERPNext Journal Entry, Odoo `account.move`, or Moqui `AcctgTrans` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior plus public GitHub locators. Moqui docs and entity field names were read the same way. FIBO RDF was read for published class names and definitions only.
