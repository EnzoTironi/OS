# Open questions

**Kind.** open question  
**Fetched.** 2026-08-16  
**Decision.** `undetermined` unless a row says otherwise

This file records uncertainty from issue 79. It does not answer `docs/open-questions.md`. When a numbered thesis question is touched, the row says so and stays `undetermined`.

## Q-CI-01. Is there one standing-container pattern?

EpisodeOfCare, Case, Subscription, Coverage, Lease, and Project all organize later events. They may be ordinary Types. They may share a shape such as "interval responsibility."

**Touches.** `docs/open-questions.md` question 2, smallest semantic core.  
**State.** `undetermined`  
**Would decide it.** A third independent formal model that either requires or forbids a shared container nature.

## Q-CI-02. Does Coverage or Lease force a native Relator?

SIB-56 rejected Relator as an engine sort. This pass shows standing relations with periods, actions, and more than two parties. That is pressure. It is not convergence from two new corpora on a storage sort.

**Touches.** `docs/open-questions.md` question 12.  
**State.** `undetermined`

## Q-CI-03. Is a billable observation already a Claim?

Stripe emits invoices from meters. FHIR Claim is a request for adjudication. Valueflows Claim is receiver-initiated. Sibling issue 29 left the identity fork open.

**Touches.** `docs/open-questions.md` question 13.  
**State.** `undetermined`

## Q-CI-04. How should a financial position be identified?

Instrument definition versus holding versus beneficial owner versus control. FIBO splits ownership and control. This pass did not fetch position-level first-party pages deep enough to pick an identity grain.

**State.** `undetermined`

## Q-CI-05. What sort is an energy imbalance?

Schedule, meter, position, and settlement amount could be Event, Claim, or both. IEC 62325-451-4 refuses to define the formula.

**State.** `undetermined`

## Q-CI-06. Is entitlement a resource, a right, or a projection?

Licensed seats, credits, and coverage limits behave like quantities. They are not on-hand stock. Whether OS needs an Entitlement type is open.

**State.** `undetermined`  
**Do not invent a primitive named Entitlement from this sentence.**

## Q-CI-07. Which clocks does a claims-made policy require?

Occurrence time, discovery time, notice time, claim-filing time, and instrument interval can all matter. That pressures `docs/open-questions.md` questions 3 and 7. It does not choose bitemporality as a kernel law.

**State.** `undetermined`

## Q-CI-08. Does unknown-after-dispatch change in care and insurance?

A lost Claim submission and a lost Stripe charge are both unknown. Statutory notice rules may treat silence differently. This pass did not fetch jurisdiction rules.

**Touches.** `docs/open-questions.md` question 5.  
**State.** `undetermined`

## Q-CI-09. Is progress a Function, a Fact, or an Event?

Percent complete can be recomputed from costs or surveys. It can also be an asserted checkpoint. Sibling issue 29 split work progress from billed progress. The encoding is open.

**State.** `undetermined`

## Q-CI-10. Did this pass miss a domain that would kill Action?

Public-sector silence, automatic energy dispatch, and some market clearings look event-heavy. If a domain has no lawful attempted intervention, L-01 narrows. It does not automatically die.

**State.** `undetermined`

## Thesis questions this folder must not pretend to close

| `docs/open-questions.md` | This folder |
| --- | --- |
| 1. Primary artifact | Untouched. `undetermined` |
| 2. Smallest core | Pressured by L-09 and Q-CI-01. Not answered |
| 3. Truth when sources disagree | E-07 supplies a date-collapse warning. Not answered |
| 4. What is an Action | L-01 supports the cut. Stages not answered |
| 5. Action versus Event versus Effect | Unknown collection noted. Not answered |
| 7. Bitemporality | L-12 pressures three times. Not answered |
| 12. Relators | Q-CI-02. Not answered |
| 13. Economic reality | L-02 and L-04 pressure Order and fulfillment words. Not answered |
| 14. Manufacturing | L-10 limits scope. Does not answer Work Order identity |
| 23. Thesis falsifiers | No killer found that forces a second semantic authority. Search is incomplete |

## Follow-ups that would raise confidence

1. First-party ACORD data standards beyond form instructions.
2. FIBO position and derivative exercise pages.
3. IEC 62325 settlement examples with numbers.
4. A second field-service corpus besides Salesforce.
5. NIEM 5 or a court CMS, not only `nc:CaseType`.
6. A public-sector benefits case, not only justice.
