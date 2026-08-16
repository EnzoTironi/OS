# Open questions

Answers stay undetermined unless a card cites evidence. This file does not edit `docs/open-questions.md`.

## From this watch

### WQ-001. Can RFC-0001 Event plus Link encode an OCEL 2.0 log without a case id?

- Kind: counterexample
- Decision state: undetermined
- Evidence: EV-001, EV-002, LAW-001
- Owner if later assigned: #5, with a corpus assist from #38 only for visibility-event contrast

A yes answer kills LAW-001 and keeps OCEL as a scenario format. A no answer is metamodel pressure. This watch did not run the encoding.

### WQ-002. Is AuthZEN the right PEP and PDP cut for OS Policy?

- Kind: candidate law
- Decision state: undetermined
- Evidence: EV-003, LAW-002, LAW-003
- Owner if later assigned: #8

The Final spec exists. Whether OS Policy meaning fits Subject, Action, Resource, Context, and boolean Decision is untested. Duty and stale-world revalidation are the cheap attacks.

### WQ-003. Does Workday ASOR force Agent to be a Kind?

- Kind: candidate law
- Decision state: undetermined
- Evidence: EV-005, LAW-005
- Owner if later assigned: #11

`docs/open-questions.md` Q11 stays unanswered. This watch only adds a production adversary.

### WQ-004. Does an unasserted proposition need a native term?

- Kind: candidate law
- Decision state: undetermined
- Evidence: EV-006, LAW-006
- Owner if later assigned: #4 and #10

`docs/open-questions.md` Q3 and Q8 stay unanswered. RDF 1.2 shows one standard way to name a claim without accepting it. That is not an OS decision.

### WQ-005. Is SAP Knowledge Graph a do-not-build for companies already on SAP?

- Kind: candidate law
- Decision state: undetermined for product strategy. supported that the architecture is grounding-over-ERP, not write-authority ontology
- Evidence: EV-004, LAW-004
- Owner if later assigned: #21 via #61 and #68

`docs/open-questions.md` Q21 stays unanswered. Greenfield OS and incumbent integration can differ. This watch does not collapse them.

### WQ-006. Do IOF plan-specification Allen constraints survive as Functions on ordinary objects?

- Kind: candidate law
- Decision state: undetermined
- Evidence: EV-007, DISC-002
- Owner if later assigned: #14 and #37, after someone opens the IOF text rather than the release notes

This watch read the README and the 202602 notes. It did not open the OWL.

## Explicitly not answered

These questions from `docs/open-questions.md` were in scope as pressure targets. They remain undetermined. No invented answer is recorded.

- Q1 primary artifact
- Q3 truth when sources disagree
- Q5 Action versus Event versus Effect
- Q6 mutable state
- Q7 bitemporality
- Q8 provenance
- Q9 Function, Constraint, Policy
- Q11 actors and principals
- Q14 manufacturing reality
- Q15 ontology versus runtime
- Q21 build versus reuse
- Q22 derived surfaces

## Watch process questions

### WQ-007. How often should this folder be re-run?

- Kind: source artifact
- Decision state: undetermined

#78 says "periodically." This snapshot does not pick a cadence.

### WQ-008. Should a later watch open Salesforce, ServiceNow, and Microsoft agent write models?

- Kind: source artifact
- Decision state: hypothesis that they are the next production targets if they publish mutation semantics
- Evidence: `discarded.md`

They failed this timebox because no first-party write protocol was fetched.
