---
issue: 23
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty from this pass. These do not answer `docs/open-questions.md`. When a docs question is touched, the state is `undetermined` unless a research artifact already exists.

## Q-PR-01. List-versus-offer identity

**Question.** Must a catalog list rate, a channel listing, and a customer quotation be different identities?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** ERPNext separates Item Price, Quotation, and Sales Order. Odoo can keep one `sale.order` from quote to order and treats pricelist as suggestion. Amazon `purchasable_offer` is a listing, not a quote. Issue 16 Q-O2C-02 already records the quote-versus-order split as `undetermined`. Standing order. Do not close this fork here.

**Cite.** `matrix.md` D1. `evidence.md` E-004, E-006, E-011. `research/domain/o2c/open-questions.md` on `origin/cursor/issue-16-domain-cfd8`.

## Q-PR-02. Tax-inclusive encoding

**Question.** Is the amount stored tax-included, tax-excluded, or as a pair with an explicit flag?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** Odoo shows included and excluded are not inverses and recommends one reference (E-008). Moqui has `taxInPrice` (E-009). Amazon examples use `value_with_tax` (E-016). Independent first-party sources do not agree on one encoding. Standing order forbids closing the fork.

**Cite.** `matrix.md` D2. `candidate-laws.md` L-012.

## Q-PR-03. Which business date is "now"

**Question.** When testing Valid From / Valid Upto, is the clock transaction date, order placed date, requested ship, requested receipt, or created date?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** Dynamics documents all of those as a parameter (E-017). Moqui promotions use placed-or-current (E-010). ERPNext uses transaction date in the pages fetched. No convergence.

**Cite.** `matrix.md` D5. Scenario S-P-26.

## Q-PR-04. Approval threshold as a domain law

**Question.** Must a reprice or override above a delta require a second principal?

**Kind.** candidate law.

**Decision state.** `undetermined`.

**Why it stays open.** Odoo documents always-override (E-006). ERPNext documents approved exception (E-002). Moqui checks whether the user is allowed (E-010). Landscape Ontologiq is not this issue's proof. `RepriceApproval` stays a Policy some organizations add. It is not a universal law. See the rejected table in `candidate-laws.md`.

**Cite.** `evidence.md` E-024. `docs/open-questions.md` question 4 on Action approval. No invented answer.

## Q-PR-05. Canonical listing identity

**Question.** Is a listing `marketplace + seller SKU`, `marketplace + ASIN + seller`, or something else?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** Amazon selectors are marketplace, currency, audience on `purchasable_offer` (E-011). eBay official Inventory docs 403 this session. Mercado Libre pages did not yield a usable body. Product/SKU identity is issue 15.

**Cite.** `sources.md` S-FAIL-03, S-FAIL-04. `matrix.md` listing row.

## Q-PR-06. Per-customer coupon cap

**Question.** Is one redemption per customer a domain law or a store setting?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** ERPNext Maximum Use is global. The FAQ tells the reader to confirm customer-specific limits (E-003). Moqui has Limit Per Customer on some promotions (E-010). Not enough independent agreement.

**Cite.** `evidence.md` E-003, E-010.

## Q-PR-07. Cost basis for a margin floor

**Question.** If a floor is cost-based, is the cost last purchase, average, agreement buy rate, or a planned cost?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** ERPNext item margin is explicitly not valuation (E-005). Amazon floors are seller-allowed amounts, not cost. Moqui has CostComponent, but this pass did not trace it into a selling-price Policy. Inventory and costing are other issues.

**Cite.** `evidence.md` E-005, E-023. `candidate-laws.md` L-009.

## Q-PR-08. eBay and Mercado Libre behavior

**Question.** Do those marketplaces treat create-offer versus publish-offer, and fee estimates versus actual fees, the same way Amazon does?

**Kind.** domain evidence.

**Decision state.** `undetermined`.

**Why it stays open.** First-party pages failed (S-FAIL-03, S-FAIL-04). Secondary SDK pages were not used as proof.

**Cite.** `sources.md` failed table. `matrix.md` failed marketplace cells.

## Q-PR-09. In-house list save versus marketplace unknown

**Question.** Is `PublishListRate` immediately live in an ERP, while only marketplace `CommitReprice` can be `unknown`?

**Kind.** candidate law.

**Decision state.** `hypothesis`.

**Why it stays open.** L-011 is `supported` for Amazon-style listings and only `hypothesis` for in-house lists. ERPNext and Odoo docs fetched here describe save-and-apply, not an accept-then-process gap.

**Cite.** `candidate-laws.md` L-011. `evidence.md` E-015.

## Touches on `docs/open-questions.md`

| Docs question | This folder | State |
| --- | --- | --- |
| Q3. Truth when sources disagree | Competitor observations and withheld retailers | `undetermined`. Cite E-013, S-P-20, S-P-30 |
| Q4. What is an Action | Reprice, override, redeem | `undetermined` beyond the candidate Action list |
| Q5. Action versus Event versus Effect | Listing submit accepted ≠ live | Cite L-011. No new primitive |
| Q7. Bitemporality | Valid versus known time | Cite L-004. Which business date is Q-PR-03 |
| Q8. Provenance | Competitor and fee observations | Cite L-003, L-008 |
| Q13. Economic reality | Offer versus commitment | Cite issue 16. Do not rewrite O2C |

No cell above is an answer to the docs file. Each is a pointer or an explicit `undetermined`.
