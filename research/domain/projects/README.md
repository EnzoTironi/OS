# Projects and professional services notes

- Artifact ID: `issue-0029-projects`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: domain distinctions for scope, work, assignment, time, milestone, and billing, mined from first-party ERPNext, Odoo, Moqui, Valueflows, and Dynamics Project Operations pages
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`
- Date: 2026-08-16
- Contract: Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.

## Question

Which real-world distinctions in professional-services delivery survive independent sources, and which popular names collapse several kinds?

The issue asked about project versus engagement versus contract; scope and deliverable; task; dependency; assignment; time and expense; milestone; capacity; budget; change request; acceptance; billable event; fixed price versus time and materials; service fulfillment versus inventory fulfillment.

## How to read this folder

| File | Contents |
| --- | --- |
| `sources.md` | Versioned locators, failed fetches, material not examined |
| `evidence.md` | E-001 onward. Domain evidence and source-system artifacts |
| `matrix.md` | Convergence and divergence across sources |
| `lifecycle.md` | Commercial, work, assignment, time, milestone, and billing stages |
| `candidate-laws.md` | L-001 onward, with counterexample cards X-001 onward |
| `scenarios.md` | S-001 onward, including the issue's required families |
| `open-questions.md` | Forks left `undetermined`. No answers written into `docs/open-questions.md` |

Every card states Kind and Decision state.

Kinds used: domain evidence, source-system artifact, candidate law, counterexample, runtime consequence.

## Verdict for a later synthesis agent

Supported distinctions, not primitives:

- A work container is not the commercial commitment. Either can exist without the other. L-001.
- Work decomposes into actionable units. L-004.
- Some work is blocked by other work. L-005.
- Observed effort, billable quantity, and invoiced quantity are different facts. L-007.
- Cost of work is not price of work. L-008.
- Billing method decides whether more cost creates more customer revenue. L-009.
- Service fulfillment is not a stock movement. L-010.
- An invoice is not customer acceptance. L-011.
- Work progress and billing progress are different projections. L-015.
- Milestone is an overloaded word and is not one kind. L-012.

Kept `undetermined` on purpose:

- Project versus engagement identity. Q-001, L-002, E-029.
- Billable event versus claim. Q-002, L-013. Issue #16 owns claim and settlement.
- Whether a document named Project Contract is required. Q-003.
- Time correction by cancel-and-amend versus compensating event. Q-005, L-014.
- Change Request as a type. Q-008.
- Acceptance as a type. Q-007.

Rejected as laws:

- ERPNext printed gross-margin formula. L-R-01.
- Moqui's single WorkEffort type enum as an OS primitive. L-R-02.

No target schema is proposed. RFC-0001 was not edited.

## Sibling tracks

Cite, do not rewrite:

- Issue #16. Offer, commitment, claim, settlement. Consume S-016, S-035, S-036, L-013.
- Issue #18. Inventory fulfillment. Consume S-020, S-022, L-010.
- Issue #24. Planning and capacity. Consume S-034, Q-015.
- Issue #28. Time entry and employment. Consume S-032, S-033, Q-016.

## Licensing

OS is MIT. Notes extract concepts and published behavior. No copyleft implementation was pasted or translated.

## What was not done

- No application source at a commit SHA.
- No Odoo profitability page. HTTP 404.
- No SAP Project System depth.
- No PSA-product corpus.
- No PR and no issue comment. Coordinator opens the Graphite PR.
