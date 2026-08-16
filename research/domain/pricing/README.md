---
issue: 23
track: domain
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
swarm_result_contract: absent-on-origin-main
fetched: 2026-08-16
---

# Pricing, offers, channels, marketplaces, promotions, and competitive price intelligence

Query this directory for issue 23. Files follow the Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder does not answer `docs/open-questions.md`. It records evidence a synthesis agent can cite. RFC-0001 is untouched.

Each claim is tagged as one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Decision state is `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Question

What real-world distinctions does commercial pricing require among list price, negotiated price, published offer, and transaction price, and which of those distinctions survive ERPNext, Odoo, Moqui/Mantle, Dynamics Commerce, Amazon Selling Partner APIs, and ValueFlows without collapsing into one source system's price list?

The issue asks these cuts:

1. List price versus negotiated price versus offer versus transaction price.
2. Price validity and effectivity.
3. Channel and listing identity.
4. Marketplace fees.
5. Promotion, discount, and coupon.
6. Minimum margin and policy.
7. Competitor offer as observation.
8. Currency and tax-inclusive price.
9. Repricing as an Action.
10. Approval thresholds.
11. Provenance of observed competitor prices.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | URLs and documents fetched this session |
| `evidence.md` | reference | Labeled evidence blocks E-001 through E-028 |
| `matrix.md` | reference | Convergence, divergence, and source-artifact mapping |
| `lifecycle.md` | explanation | Temporal chain, Actions, and Policies. Not a schema |
| `candidate-laws.md` | explanation | Smallest claims that still fit the evidence |
| `scenarios.md` | explanation | Thirty falsifying scenario cards |
| `open-questions.md` | reference | Residual uncertainty. No invented answers |

## Verdict this pass

Independent sources agree that a catalog or list rate is not the price on a published channel offer, that a published offer is not a commitment, and that a competitor price is an observation with a known time rather than an owned price. They also agree that promotions and coupons are not the same object as a price list, and that fee estimates are not the fee that later posts.

They disagree on whether list and offer share one identity, on whether tax is stored inside the money amount, and on whether a human may always override a computed price. Those three stay `undetermined`.

No target schema is proposed. Copyleft systems were read as documented behavior only. Float-for-money is already a recurring rejection elsewhere. This folder does not reopen it.

## Sibling notes, read only

These paths exist on other branches. This folder cross-links them. It does not write them and does not treat their conclusions as this issue's findings.

- `research/domain/o2c/` on `origin/cursor/issue-16-domain-cfd8`. Issue 16 already supports "offer is not commitment" as L-001. Cite that law. Do not rewrite the O2C folder.
- `research/domain/product/` on `origin/cursor/issue-15-domain-cfd8`. Issue 15 owns Product and SKU identity. A listing or offer points at a product. It is not the product.
- `research/domain/party/` on `origin/cursor/issue-14-domain-cfd8`. Customer and supplier are roles, not kinds.
- Corpus branches for ERPNext, Odoo, Moqui, and ValueFlows may exist. This pass used first-party docs fetched this session and did not wait for those PRs.

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

Start with `lifecycle.md` for the candidate cut. Use `matrix.md` when a later issue asks what source X did with Price List. Use `candidate-laws.md` and `scenarios.md` when a later issue asks what would change the answer.

Do not treat ERPNext Item Price, Odoo `product.pricelist`, Moqui `ProductPrice`, or Amazon `purchasable_offer` as OS vocabulary. They are observations about other systems.

## Licensing

OS is MIT. These notes extract concepts and documented behavior. No copyleft implementation was pasted or translated into the repo. ERPNext and Odoo were read as documentation of behavior. Moqui docs were read the same way. Amazon, Dynamics, and ValueFlows pages were public first-party documentation.
