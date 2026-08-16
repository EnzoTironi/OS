---
issue: 28
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this session. No answers are invented. Each item is `undetermined` unless a research artifact is cited.

This file does not edit `docs/open-questions.md`.

## Q1. Is Employee a Role in the engine, or only in the domain story?

Formal sources agree Employee is a role of Person. Products store a personnel file. L2 leaves OS encoding `undetermined`. Issue 3 owns Role as a category. Party L9 is a sibling hypothesis, not a close.

**Cite.** `candidate-laws.md` L2. `evidence.md` E1, E16, E17.

## Q2. Is Employment a native Relator?

UFO says yes. W3C ORG uses Membership. FIBO uses a situation. Odoo uses Contract. L4 stays `undetermined`. RFC-0001 already asks this and is not edited.

**Cite.** `candidate-laws.md` L4. `evidence.md` E22.

## Q3. When does a company change end Employment?

Frappe can mint a new Employee ID. HR-XML treats acquisition as a new period with a related employer. Same-company transfer looks like a new Assignment. No first-party page fetched this session states a general rule.

**Cite.** `scenarios.md` S-HR-002, S-HR-003, S-HR-016, S-HR-035. `lifecycle.md` Transfer.

## Q4. Is confirmation a phase of Employment?

Frappe has Confirmation Date. Odoo pages read do not. `undetermined`.

**Cite.** `lifecycle.md` Confirm. `evidence.md` E1.

## Q5. How is suspension represented?

Seed S-006 asks for brief suspension. No Frappe or Odoo suspend-employment page was fetched. Leave without pay is not a legal suspension.

**Cite.** `lifecycle.md` Suspend. `scenarios.md` S-HR-023 is acting, not suspension.

## Q6. May one Employee file have two running contracts?

Odoo docs fetched this session do not say. `undetermined`.

**Cite.** `scenarios.md` S-HR-021. `evidence.md` E11.

## Q7. Which hire date is seniority?

HR-XML names HireDate, OriginalHireDate, AdjustedHireDate, and DutyEntryDate. Frappe exposes Date of Joining and Offer Date. Which date binds leave seniority and benefits is `undetermined`.

**Cite.** `evidence.md` E19, E1. `scenarios.md` S-HR-010.

## Q8. Do unused leave days transfer across legal persons?

Frappe says leave allocations on a new Employee ID after transfer are manual. The domain rule is `undetermined`.

**Cite.** `evidence.md` E4. `scenarios.md` S-HR-016.

## Q9. What is the identity of a vacation that crosses allocation periods?

Frappe forces two Leave Applications. Whether that is domain law or a source artifact is `undetermined`.

**Cite.** `evidence.md` E7. `scenarios.md` S-HR-026.

## Q10. How should a deferred sick day be stored?

Odoo applies a late sick day to the next period so a validated slip is not cancelled. Whether the next period contains a false valid-time or a named correction is `undetermined`.

**Cite.** `evidence.md` E12. `scenarios.md` S-HR-034.

## Q11. Is contractor a separate agreement type?

FIBO excludes contingent workers from Employment. Frappe can label Contractor on Employee. L12 is `hypothesis`. A full contractor agreement belongs with commercial relationships in issue 14 and issue 16. This folder does not invent that type.

**Cite.** `candidate-laws.md` L12. `evidence.md` E17.

## Q12. How do Post grants and Employment grants compose?

L13 is `hypothesis`. Product pages show own-record User grants and department leave approvers. They do not show a complete authorization model. Issue 11 owns Principal.

**Cite.** `candidate-laws.md` L13. `evidence.md` E24.

## Q13. What does ISO 30400 or ISO 30414 add?

Those pages were not fetched. Matrix cells stay `undetermined`. A later worker can fill them without rewriting L1 through L13.

**Cite.** `sources.md` Attempted and incomplete. `matrix.md` Payroll-standard cells.

## Q14. What does Moqui or Mantle HR do with employment?

Not fetched this session. `undetermined`.

**Cite.** `matrix.md` `?` cells.

## Q15. How does a payroll result become a payment and a journal?

Frappe Bank Entry and Odoo SEPA or check are observed. Semantics of settlement belong to issue 22. Semantics of posting belong to issue 21. This folder does not answer them.

**Cite.** `candidate-laws.md` L9. `evidence.md` E9.

## Q16. Is acting assignment a first-class object?

No first-party page fetched this session. `undetermined`.

**Cite.** `scenarios.md` S-HR-023.

## Q17. Does ValueFlows `work` replace Employment for payroll?

It records labor without an Employee kind. It does not compute statutory slips. Whether a future OS payroll can sit only on work events is `undetermined`.

**Cite.** `evidence.md` E20. `candidate-laws.md` L7, L12.

## Cross-links into `docs/open-questions.md`

These repo questions remain open. This folder only supplies citations.

| Repo question | What this folder adds |
| --- | --- |
| Q2 roles and relators | L2 and L4 stay `undetermined` for the engine |
| Q7 bitemporality | `lifecycle.md` two clocks. S-HR-004, S-HR-005, S-HR-024, S-HR-034 |
| Q12 relationship-entities | L3 `supported` for identifiable employment. L4 `undetermined` for Relator |
| Q11 actors and principals | L13 and S-HR-012. Issue 11 owns the model |
