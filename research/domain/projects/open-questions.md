# Open questions for projects and professional services

- Artifact ID: `issue-0029-projects-open-questions`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: domain evidence
- Decision state: undetermined for every question below

Do not treat this file as answers to `docs/open-questions.md`. That document stays unresolved. When a repo-level question is touched, the line says so and stops.

---

### Q-001 Is engagement a third identity?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Dynamics prose says "work on an engagement" while defining contract lines and projects. ERPNext and Odoo pages opened this session never define Engagement. Valueflows has Plan, Agreement, and Commitment, not Engagement. E-029, L-002.
- What would settle it: a first-party type, with lifecycle and actions, that is neither the work container nor the billing instrument, independently documented in two corpora.
- Must not do: invent an Engagement object into a schema or into `docs/open-questions.md`.

### Q-002 Is a billable time entry already a claim?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: ERPs invoice from timesheets or delivered hours. Valueflows says a Claim is receiver-initiated reciprocity and is unneeded when a Commitment already covers the flow. E-013, E-020, E-023, L-013.
- Owner if it leaves this domain: issue #16.
- What would settle it: independent sources that agree whether the billable observation, the unbilled receivable, and the invoice are one kind or three.
- Standing order: keep the fork open unless those sources agree.

### Q-003 Must every invoiced project have a contract document?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Dynamics yes. E-025. ERPNext and Odoo invoice from sales order or timesheet. E-004, E-019.
- What would settle it: a domain failure that appears when billing authority is only an order line, or a demonstration that the Dynamics rule is localization of L-001 rather than a new kind.

### Q-004 What is a milestone?

- Kind: domain evidence
- Decision state: undetermined as one kind
- Why it is open: task flag, peer association, and billing trigger all use the same word. L-012, E-006, E-007, E-008, E-009.
- What would settle it: scenarios S-017, S-018, S-019 run against a candidate model that uses one object for all three and fails, or a model that splits them and still covers the sources.

### Q-005 How is recorded time corrected after it has been billed?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: ERPNext cancel dependents then amend. Valueflows compensating event. E-016, E-017, L-014.
- Related repo question: `docs/open-questions.md` item 7 on late and backdated corrections. This folder does not answer that item. It only supplies S-011, S-012, S-013 as pressure.

### Q-006 Is cancel a terminal status for a blocker?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Odoo releases the successor when the predecessor is Cancelled. ERPNext dependency text stresses completion. E-011, S-024.

### Q-007 Does professional services need a first-class Acceptance fact?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: ERPNext states the gap twice. Invoice is not acceptance. Purchase of a service has no receipt. E-005, S-023. No Acceptance type was found.
- Must not do: invent the type to close the gap.

### Q-008 Does professional services need a first-class Change Request type?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: no first-party Change Request page was opened. Scope still lives on the commercial commitment. E-028, L-016, S-001.

### Q-009 Is Task a kind, or is it a Process with a work input?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: ERPs use Task. Valueflows says the process is the activity and work is a flow. E-010, E-024.
- Related repo question: `docs/open-questions.md` item 14 asks whether a Work Order is a commitment, authorization, plan, process instance, or combination. This folder does not answer that item. It notes the same fork appears for service tasks.

### Q-010 When is assignment a relator rather than a link?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Moqui assignment has status, availability, expectation, and delegation reason. ERPNext and Odoo docs opened this session are thinner. E-012.
- Related repo question: `docs/open-questions.md` item 12. This folder does not answer it. It offers assignment as a candidate relator to test.

### Q-011 Are remaining hours a fact or a projection?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Moqui remainingWorkTime is updated when time is added. Odoo remaining hours display from allocated minus spent. S-Moqui-02, S-Odoo-05.
- Related repo question: `docs/open-questions.md` item 6. This folder does not answer it.

### Q-012 Does not-to-exceed belong to the commitment or to policy?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: only Dynamics among pages opened defines NTE on a T&M contract line. E-018, S-006.

### Q-013 What does "delivered" mean for a service?

- Kind: domain evidence
- Decision state: hypothesis, not closed
- Why it is open: Odoo uses Delivered for hours and for reached milestone percent. ERPNext service flow has no delivery note. E-004, E-020.
- Risk: reusing the inventory word delivered for observed work hides L-010.

### Q-014 Failed source fetches

- Kind: source-system artifact
- Decision state: undetermined
- Odoo project profitability page returned 404. S-FAIL-01. Margin and utilization claims that need that page stay open.
- Valueflows core introduction timed out. S-FAIL-02. Flows, Processes, and vfspec were used instead.

### Q-015 Capacity of assigned people

- Kind: domain evidence
- Decision state: undetermined in this folder
- Why it is open: issue #24 owns planning and capacity. S-034 is recorded so this track does not invent an answer.

### Q-016 Time entry as employment versus as project observation

- Kind: domain evidence
- Decision state: undetermined in this folder
- Why it is open: issue #28 owns time entry and employment. The same hours can be payroll input and project costing input. This folder treats only the project and billing side. E-013, S-032, S-033.

---

## Repo-level questions explicitly not answered

From `docs/open-questions.md`, these items were touched by evidence and are still `undetermined` at repo level:

- Item 6. What is mutable state? Remaining hours and percent complete look derived. Not decided.
- Item 7. Bitemporality. S-013 supplies pressure only.
- Item 12. Relationship-entities. Assignment may be a relator. Not decided.
- Item 13. Economic reality. Billable event versus claim is the live fork. Not decided.
- Item 14. Manufacturing work order identity. Service task has an analogous fork. Not decided.

No edit was made to `docs/open-questions.md`.
