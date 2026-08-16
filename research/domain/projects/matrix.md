# Convergence matrix for projects and professional services

- Artifact ID: `issue-0029-projects-matrix`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: domain evidence
- Decision state: mixed per row

Marks:

- `Y` independent source makes the distinction
- `P` partial or only as a local document trick
- `N` source examined and the distinction is absent or collapsed
- `?` not determined from pages opened this session
- `fail` fetch failed

This is not a feature comparison. A `Y` means the source is evidence that the distinction exists in the world or in a mature model.

| Distinction | ERPNext | Odoo 18 | Moqui/Mantle | Valueflows | D365 Project Operations | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Work container ≠ commercial commitment | Y E-002 | Y E-019 | Y E-009 | Y E-023 | Y E-003 | Strongest convergence this issue |
| Named project-contract document required to invoice | N E-006 | N E-019 | P E-014 | N E-023 | Y E-025 | Divergence. Do not freeze Project Contract as a primitive |
| Engagement as its own identity | N E-029 | N E-029 | N E-029 | N E-023 | P E-029 | undetermined. See `open-questions.md` |
| Task / work item under a project | Y E-010 | Y E-010 | Y E-010 | P E-024 | Y E-003 | VF uses Process, not Task |
| Work-item dependency | Y E-011 | Y E-011 | Y E-011 | ? | ? | Odoo cancel releases successor. ERPNext text stresses completion |
| Assignment with lifecycle | P E-012 | P E-012 | Y E-012 | ? | ? | Moqui is the rich relator |
| Observed hours ≠ billable hours ≠ billed hours | Y E-013 | P E-020 | Y E-014 | Y E-017 | Y E-018 | Odoo delivered hours stand in for billable until invoice |
| Cost rate ≠ sales rate | Y E-013 | ? | Y E-014 | P E-017 | Y E-018 | Odoo price lists exist. Not pinned on T&M page |
| Dual client and vendor rates on one entry | N | N | Y E-014 | P | ? | Staffing-chain pattern |
| Timesheet approval gate | P E-016 | ? | Y E-015 | N | ? | ERPNext submit. Odoo timesheet approve page not opened |
| Milestone as task flag | Y E-008 | P E-007 | N E-009 | N | ? | |
| Milestone as associated checkpoint | N | P | Y E-009 | P E-023 | ? | VF Plan deliverable is closer to a checkpoint than a task flag |
| Milestone as billing trigger | P E-006 | Y E-007 | P | N E-023 | Y E-025 | ERPNext uses decimal quantity. Odoo and D365 have named billing objects |
| Invoice ≠ acceptance | Y E-005 | P E-007 | ? | Y E-023 | P E-025 | Retention is not acceptance |
| Change request type | ? E-028 | ? E-028 | ? | ? | ? | undetermined |
| T&M versus fixed price | Y E-006 | Y E-018 | P E-014 | Y E-023 | Y E-018 | VF encodes it as whether sales flow tracks work events |
| Not-to-exceed on T&M | ? | ? | ? | ? | Y E-018 | Only D365 among pages opened |
| Service fulfillment ≠ stock delivery | Y E-004 | Y E-020 | ? | Y E-024 | Y E-021 | Cross-link #18 |
| Mixed time + expense + material on one deal | P E-022 | Y E-021 | P | Y E-024 | Y E-021 | |
| Time correction by mutate-after-cancel | Y E-016 | ? | ? | N E-017 | ? | Clash with VF |
| Time correction by compensating event | N E-016 | ? | ? | Y E-017 | ? | Clash with ERPNext amend |
| Progress % ≠ billed % | Y E-026 | Y E-026 | P | Y E-023 | Y E-025 | |
| Capacity / remaining work | P | P E-027 | Y E-009 | P | ? | Cross-link #24. Do not own capacity here |
| Billable-event versus claim identity | P E-013 | P E-020 | P E-014 | Y E-023 | P E-018 | undetermined. Cross-link #16 |
| Project profitability formula | P E-022 | fail | ? | N | ? | Odoo profitability page 404 |

## Convergence that survived

Independent sources agree on these distinctions. Decision state `supported` as research findings, not as OS primitives.

1. A work container is not the commercial commitment. E-002, E-003, E-019, E-023.
2. Work decomposes into actionable units. E-010.
3. Some work is blocked by other work. E-011.
4. Observed effort, billable quantity, and invoiced quantity can differ. E-013, E-017, E-018.
5. Cost of work is not price of work. E-013, E-014, E-018.
6. Fixed-price sales do not rise when more cost is incurred. T&M sales do, unless capped. E-018.
7. Service delivery is not a stock move. E-004, E-020.
8. Billing progress and work progress can diverge. E-026.
9. An invoice is a claim-like record. It is not by itself customer acceptance. E-005, E-023.

## Divergence that must stay open

1. Whether a third identity called engagement sits between party relationship and project. E-029.
2. Whether a document named Project Contract is required, or a sales order plus billing method is enough. E-025 versus E-004.
3. Whether a milestone is a task flag, a peer association, a plan deliverable, or a billing schedule line. E-006, E-007, E-008, E-009.
4. Whether recorded time is corrected by cancel-and-amend or by a compensating event. E-016 versus E-017.
5. Whether a billable time entry is already a claim or only an event that may later settle or create a claim. See `open-questions.md` and issue #16.

## Source-system artifacts. Do not promote

- Kind: source-system artifact
- Decision state: rejected as OS primitives unless later evidence promotes them

ERPNext DocTypes Project, Task, Timesheet, Sales Order, Sales Invoice. Decimal-quantity milestone billing. Printed gross-margin formula. Completion methods Manual, Task Completion, Task Progress, Task Weight.

Odoo Create on Order, Invoicing Policy enumerations, Reached checkbox, analytic distribution as the join key from expense and purchase to the sales order, billing-rate leaderboard.

Moqui WorkEffort type enum, WorkEffortAssoc, WorkEffortParty statuses, RateAmount lookup, EECA that rolls time into task totals.

Dynamics owning company, contracting unit, transfer prices, CDS exchange-rate caveat, Fee as a revenue-only transaction class, invoice schedule copied from quote.

Valueflows class names Intent, Commitment, EconomicEvent, Claim, Plan, Process. These are a competing vocabulary, not an OS schema.
