---
issue: 21
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Unresolved uncertainty. No invented answers. Nothing here edits `docs/open-questions.md`.

Each item is `undetermined` unless a later note changes the state with new citations.

## Q1. Is the journal the event

**Kind.** Open question. **Decision state.** `undetermined`

Odoo stores invoice, bill, credit note, and manual journal as types of one `account.move`. ERPNext keeps a source document and generated GL Entries. Moqui keeps `AcctgTrans` pointing at invoice, payment, asset, or a manual origin.

RFC-0001 already asks whether Event is a primitive. This folder does not answer that. Independent first-party sources do not agree that the journal individual is the operational event individual.

Falsifier that would promote a law. The three operational corpora describe the same identity rule in first-party docs.

## Q2. How is period close encoded

**Kind.** Open question. **Decision state.** `undetermined`

The jobs converge. A P&L transfer and a posting lock are different. The record shape does not converge.

ERPNext uses a close voucher plus a separate freeze or Accounting Period. Odoo uses lock dates plus an explicit appropriation journal, and Hard Lock is irreversible. Moqui uses `TimePeriod.isClosed` plus typed transactions that may still post.

Do not pick a close table in Wave B.

## Q3. When does a stock movement become a ledger Event

**Kind.** Open question. **Decision state.** `undetermined`

ERPNext perpetual posts on the stock document. Odoo 19 perpetual posts at invoicing and uses closing and accrual entries for the rest. Moqui posts on asset receipt and issuance.

Issue 18 may add valuation-layer evidence. This folder must not rewrite that work.

## Q4. Which correction is the domain Action after close

**Kind.** Open question. **Decision state.** `undetermined`

Candidates observed. Reopen and cancel. Reverse in the open period. Typed close adjustment. IAS 8 retrospective restatement. Force post.

Sources disagree, and the reporting standard disagrees with common ERP practice. See S-ACC-003, S-ACC-021, S-ACC-028.

## Q5. Are finance books or fiscal types a primitive

**Kind.** Open question. **Decision state.** `undetermined`

Moqui `glFiscalTypeEnumId` and ERPNext Finance Book suggest parallel slices. Odoo analytic plans and lock slices are not the same cut. One independent standard was not found this session.

## Q6. Does OS need a durable unposted-with-reason state

**Kind.** Open question. **Decision state.** `undetermined`

Moqui error journal is strong evidence that automatic posting can fail after the operational document is accepted. ERPNext and Odoo more often refuse the Action. Constitution rule 9 wants uncertainty kept. Whether that is an Effect, a failed Action record, or a Journal in state unposted is foundation work.

## Q7. How much of IFRS 15 belongs in the accounting fragment

**Kind.** Open question. **Decision state.** `undetermined`

The five-step model is independent evidence that billing is not recognition. Performance obligation identity may belong to order-to-cash or to a contract object. This folder only claims the time split in L8.

Full IFRS 15 text was not fetched. Clause-level allocation and variable consideration stay unread.

## Q8. How much of IAS 21 belongs in the fragment

**Kind.** Open question. **Decision state.** `undetermined`

Functional, foreign, and presentation currency are supported at about-page level. Translation of foreign operations, hyperinflation, and lack of exchangeability were not read in full.

## Q9. Does FIBO add any journal semantics

**Kind.** Open question. **Decision state.** `undetermined`

Currency Amount is useful. Accounting Equity is deprecated. The REA `LedgerEntry` viewer returned no class text this session. Issue 37 may recover more. Until then, FIBO is not a posting model.

## Q10. Is storno a third correction form

**Kind.** Open question. **Decision state.** `undetermined`

Odoo 18 `account.move` has `is_storno`. First-party 19.0 docs fetched this session do not explain it. Negative-amount reversal versus exchanged debit and credit may be a localization law. Do not add a Storno primitive on one field name.

## Q11. Answers not given to `docs/open-questions.md`

The following repo questions remain the property of that file. This research only supplies citations they may later use.

| Repo question | What this folder may be cited for | What it does not decide |
| --- | --- | --- |
| Q4 Action | Post, Reverse, CloseTransfer, LockPeriod as named attempts | Whether every mutation is an Action |
| Q5 Action versus Event | Draft is not happened. LedgerEntry is happened | Whether Event is a primitive |
| Q6 mutable state | Balances as projections over LedgerEntries | Storage engine |
| Q7 bitemporality | Posting date versus posted date, E-013, E-020 | Native bitemporal primitives |
| Q13 economic reality | Recognition versus billing versus cash | Whether REA replaces journals |
| Q15 ontology versus runtime | Balance and lock must be enforced | No engine branch on Journal Entry |

If a later agent wants to mark any repo question supported, it must cite these files or gather new evidence. It must not treat this paragraph as the answer.
