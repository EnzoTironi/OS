---
issue: 31
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Multi-entity, intercompany, consolidation, currency, ownership, and organizational boundaries

Query this directory for issue 31. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched. No target schema is proposed.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

What distinctions survive when one economic group contains several legal persons, each with its own books, currency, tax identity, and authority, while people, products, suppliers, warehouses, and services are shared in the world?

The issue asks these cuts:

1. Legal entity versus business unit, site, branch, and brand.
2. Ownership versus control versus consolidation scope.
3. Intercompany sales and transfers versus ordinary trade.
4. Shared physical warehouses and shared services versus entity-specific ledgers.
5. Transfer pricing as a priced relationship, not a stock movement.
6. Multiple charts and books versus one legal person.
7. Functional, transaction, and reporting currency.
8. Elimination and consolidation as projections, not operating truth.
9. Cross-company permissions versus legal authority.
10. Common master data versus entity-specific terms.
11. Effective-dated corporate structure and historical reorganization.

The deliverable scenarios assume one Brazilian group with several CNPJs. CNPJ and fiscal-document rules belong to issue 30. This folder only uses CNPJ as a jurisdictional identifier on a legal person.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E1 through E32 |
| `matrix.md` | reference | Convergence and divergence plus source-artifact mapping |
| `lifecycle.md` | explanation | Group, intercompany, currency, and reorganization lifecycles |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | explanation | Thirty-four falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Sibling notes, read only

These paths exist on other branches or are reserved by other issues. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/party/` on `cursor/issue-14-domain-cfd8`. Issue 14 owns Person, Organization, LegalPerson, and Customer or Supplier as role versus kind.
- Issue 18 owns inventory location ownership and custody. Cite it. Do not rewrite it.
- Issue 21 owns accounting books and currency mechanics. Cite it. Do not rewrite it.
- Issue 30 owns Brazilian CNPJ and fiscal documents. Cite it. Do not rewrite it.
- `research/erpnext/` on `cursor/issue-32-corpus-cfd8`.
- `research/odoo/` on `cursor/issue-33-corpus-cfd8`.
- `research/moqui/` on `cursor/issue-34-corpus-cfd8`.
- `research/fibo/` on `cursor/issue-37-corpus-cfd8`.

Customer and Supplier as kinds is already a recurring rejection. See issue 14 L1 and `docs/hypothesis-history.md`. This folder does not reopen that fight.

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

Start with `candidate-laws.md` for the smallest surviving cuts. Use `matrix.md` when a later issue asks what source X did with Company versus Branch. Use `scenarios.md` when a later issue asks what would change the answer.

Do not treat ERPNext Company, Odoo `res.company`, or Moqui Internal Organization as OS vocabulary. They are observations about other systems.

Two forks stay `undetermined` unless later independent first-party sources agree:

- whether a legal person and a company record are the same identity
- whether a book and an entity are the same identity

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. Odoo and ERPNext were read as documentation of behavior. Moqui docs were read the same way. FIBO was read for published class names and definitions only. IFRS pages were read as published standard text.
