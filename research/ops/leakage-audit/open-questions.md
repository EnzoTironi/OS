# Open questions left by pass 1

**Kind.** reference  
**Fetched.** 2026-08-16  
**Decision.** all `undetermined` unless a row says `rejected` as a move

This file records residual uncertainty. It does not write answers into `docs/open-questions.md`.

## Questions owned elsewhere

| Question | Owner | What this pass did | State |
| --- | --- | --- | --- |
| 1. Primary artifact | thesis, issue 55 | Recorded D-001. Did not pick one ontology versus context modules | `undetermined` |
| 3. Truth when sources disagree | issue 4 | Used only the `delivery_date` caution as a leakage example | `undetermined` |
| 5. Action versus Event versus Effect | issue 7 | Used unknown Effect as a hiding test. Did not define Effect | `undetermined` |
| 7. Bitemporality | issue 5 | Allowed time as a facility class. Did not choose dimensions | `undetermined` |
| 8. Provenance | issue 6 | Allowed provenance as a facility class. No vocabulary pick | `undetermined` |
| 9. Function, Constraint, Policy | issue 8 | Recorded D-002. Reviewers must not collapse the three in a leakage comment | `undetermined` |
| 15. Ontology versus runtime | issue 83, this folder | Supplied heuristics and findings. Did not close the cut | `undetermined` |
| 16. Packs and Brazil composition | issue 30, RFC-0001 | Rejected Pack as an engine sort. Did not design composition | `undetermined` |
| 21. Build or reuse | issue 61 | Cited the sibling verdict. Did not pick a product | `undetermined` |

An invented answer to any row above would be a standing violation. Cite a research artifact or leave the question `undetermined`.

## Questions this pass added

### OQ-LA-01. What does HF mean in issue 83?

- Kind. open question
- Decision. `undetermined`
- The issue lists `HF` next to `PurchaseOrder` and `Brazil`. A reviewer needs to know whether it is a company token, a product token, or a leftover.
- Close it with a definition in a later note or an issue edit. Do not guess.

### OQ-LA-02. Which evaluators must the first runtime ship?

- Kind. open question
- Decision. `undetermined`
- L-002 allows a class of physical evaluators. Shipping one is Wave B.
- Close it with semantic pressure from a vertical, not a shopping list.

### OQ-LA-03. When is a duty jurisdictional rather than generic?

- Kind. open question
- Decision. `undetermined`
- L-003 says a second domain creates hiding. Some encodings never leave one jurisdiction.
- CFOP tables can stay in a Brazil definition. CFOP dispatch cannot stay in the engine. The general test is still thin.
- Close it when two independent domains need the same token, or when a first-party rule shows the token has no generic fact behind it.

### OQ-LA-04. Does a later runtime pass need its own issue?

- Kind. open question
- Decision. `undetermined`
- Issue 83 is continuous audit. Pass 1 has no engine. Pass 2 will.
- The coordinator can decide. This folder can take another findings file without a new issue if the question stays the same.

## Moves rejected here

| Move | Why | State |
| --- | --- | --- |
| Answer question 15 from this pass | Heuristics are not a closed boundary | `rejected` as a move |
| Edit RFC-0001 | Independent sources converge on the cut, not on a new primitive list | `rejected` as a move |
| Treat missing runtime as a clean engine | E-015 | `rejected` |
| Expand HF | No source | `rejected` as a move |
