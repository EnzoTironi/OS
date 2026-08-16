# Open questions

**Kind.** open question.  
**Decision.** `undetermined` unless a row says otherwise.  
**Rule.** This file does not answer `docs/open-questions.md`. It cites a research artifact or leaves the item open.

## Q-FIN-01. Instruction versus event

**Repo question.** `docs/open-questions.md` item 5. Action versus Event versus Effect. Unknown after a lost response.

**This folder.** L-002 is `supported` for payments. E-019 and S-FIN-02 are the payment-shaped evidence. They do not decide whether OS needs a primitive named Effect.

**State.** `undetermined` at the metamodel. `supported` as a domain distinction.

## Q-FIN-02. Claim versus journal identity

**Repo question.** `docs/open-questions.md` item 13. How accounting recognition relates to economic events.

**This folder.** E-024. Odoo collapses invoice into journal items. ERPNext and Moqui do not. Standing orders keep the fork open.

**State.** `undetermined`. Issue 21 owns posting.

## Q-FIN-03. Must a claim be stored?

**Artifact.** E-010. ValueFlows allows implied claims. ERPs instantiate bills.

**What would decide it.** A dunning, tax, or legal-numbering case that cannot run on event-plus-agreement without a stored claim, or the reverse.

**State.** `undetermined`

## Q-FIN-04. One claim or many due slices?

**Artifact.** S-FIN-26. Odoo splits receivable journal items per installment. ERPNext can report by payment term on one invoice.

**State.** `undetermined`

## Q-FIN-05. Multi-party processor deposits

**Artifact.** S-FIN-15, L-013. ERPNext one-party Payment Entry versus Odoo batch versus a card acquirer's daily settlement.

**State.** `undetermined`

## Q-FIN-06. Chargeback identity

**Artifact.** E-018, S-FIN-05, S-FIN-24. Processor dispute is real. No ERP DocType fetched. Is it a refund Payment, a credit Claim, a new Event type, or all three?

**State.** `undetermined`

## Q-FIN-07. Withholding and bank fees versus fiscal facts

**Artifact.** S-FIN-29, L-007. Deduction explains the cash gap. Brazilian and other fiscal identity is issue 28.

**State.** `undetermined` here

## Q-FIN-08. ISO 20022 pain versus pacs

**Artifact.** Official catalogue timed out. Odoo names SEPA and NACHA files as outgoing instructions. That is not enough to adopt ISO vocabulary.

**State.** `undetermined`

## Q-FIN-09. Payment-to-payment application

**Artifact.** S-FIN-27. Moqui can apply a refund Payment to another Payment. Is that allocation without a claim, or an implicit credit claim?

**State.** `undetermined`

## Q-FIN-10. Hold, credit limit, and payment run

**Artifact.** S-FIN-34. Issue 16 L-010 already treats credit limit as policy. This folder did not reopen it.

**State.** `hypothesis` in issue 16. Not decided here.

## Q-FIN-11. Mutable bank journal lines

**Artifact.** E-024. Odoo replaces the suspense account on the same journal entry at reconcile. ERPNext matches two records.

**Repo question.** `docs/open-questions.md` item 6. What is mutable state?

**State.** `undetermined`. Do not treat Odoo's mutation as a domain law.

## Q-FIN-12. Confirmed Paid versus Delivered

**Artifact.** S-FIN-35. Extra status after GL post.

**State.** `undetermined`

## Explicitly not answered here

| `docs/open-questions.md` item | Why this folder stays silent |
| --- | --- |
| 1 primary artifact | No evidence about the whole OS thesis |
| 2 smallest semantic core | No primitive promotion |
| 7 bitemporality | Payment dates were recorded. Valid versus known time was not proven |
| 18 physical data model | Forbidden. Wave B waits |
| 21 build versus reuse | No runtime recommendation |

Float-for-money remains `rejected` (E-025). It is not a new question.
