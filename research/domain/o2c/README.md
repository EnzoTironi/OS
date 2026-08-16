# Order-to-cash domain notes

**Issue.** [16](https://github.com/EnzoTironi/OS/issues/16). Parent [2](https://github.com/EnzoTironi/OS/issues/2). Track: domain.  
**Status.** Partial Wave A drop. Fetched 2026-08-16.  
**Decision.** none as a package. Per-claim states live on the cards.  
**Contract.** `docs/swarm-result-contract.md` is not on `origin/main`. These notes follow the Agent output contract in `docs/swarm-research-backlog.md` (Question, Sources, Evidence, Source artifacts, Convergence, Divergence, Candidate laws, Counterexamples, Runtime pressure, Open questions, Decision state).

## Question

What real-world distinctions does order-to-cash require among intent, offer, agreement, commitment, fulfillment, claim, and settlement, and which of those distinctions survive ERPNext, Odoo, Moqui/Mantle, and REA/ValueFlows without collapsing into one source system's documents?

## How to read

| File | Job |
| --- | --- |
| [`sources.md`](sources.md) | First-party pages fetched this session, plus sibling corpus paths on other branches |
| [`evidence.md`](evidence.md) | Labeled evidence blocks. Kind is always named |
| [`matrix.md`](matrix.md) | Convergence and divergence |
| [`lifecycle.md`](lifecycle.md) | Causal chain, not a schema |
| [`candidate-laws.md`](candidate-laws.md) | Smallest claims plus falsifiers |
| [`scenarios.md`](scenarios.md) | Twenty-five scenario cards |
| [`open-questions.md`](open-questions.md) | Unresolved items. Does not answer `docs/open-questions.md` |

## Verdict this pass

Independent sources agree that an offer is not a commitment, a commitment is not a goods event, a goods event is not a receivable claim, and a claim is not settlement. They disagree on identity (one record versus many documents), on whether shipment is required before billing, and on how reservation is stored.

No target schema is proposed. Copyleft systems were read as documented behavior only.

## Cross-links (read-only)

Sibling notes exist on other branches. They were read, not written.

- `research/erpnext/atlas.md` `A-SELL`, `A-RESERVE` on `origin/cursor/issue-32-corpus-cfd8`
- `research/odoo/atlas.md` `A-SELL`, `A-RESERVE` and `research/odoo/disagreement-erpnext.md` on `origin/cursor/issue-33-corpus-cfd8`
- `research/moqui/erpnext-odoo-moqui-convergence-matrix.md` on `origin/cursor/issue-34-corpus-cfd8`
- `research/valueflows-rea/issue-0037-economic-cycle.md` on `origin/cursor/issue-37-corpus-cfd8`

## Decision-state rollup

| Claim | State |
| --- | --- |
| Offer is not fulfillment | `supported` |
| Accepted order is a bundle of commitments, not a stock or GL event | `supported` |
| Requested, promised, planned, and actual times are different facts | `supported` |
| Reservation is not on-hand and not delivery | `supported` |
| Invoice is a claim, payment is settlement, allocation is a third fact | `supported` |
| Return of goods and credit of money are separable | `supported` |
| Close remaining demand is not cancel of the posted commitment | `supported` |
| Quote and order must be different identities | `undetermined` (sources split) |
| Shipment is required before a receivable | `rejected` as a universal law |
| One document may legally be the invoice and the journal | `undetermined` |
| Credit limit is a domain law rather than a policy overlay | `hypothesis` |

## Licensing

OS is MIT. ERPNext and Odoo are copyleft. Notes extract concepts and documented behavior. No implementation was pasted or translated.
