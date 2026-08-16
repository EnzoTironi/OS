# Open questions

Unresolved uncertainty after the 2026-08-16 fetch. Decision state is `undetermined` unless a card says otherwise.

Do not treat this file as answers to `docs/open-questions.md`. That document stays untouched. Where a repo-wide question is touched, the row cites a quality artifact or stays undetermined.

## Q-001 Are specification and measurement the same identity under two roles?

- Kind: candidate law
- Decision state: undetermined
- Why it is open: L-001 is supported for meaning. Standing order 24 forbids closing identity. ERPNext puts limits and readings on one row. ISO 9000 and ISA-95 use two terms. RFC-0001 Property versus Fact is still a hypothesis.
- Cite: `candidate-laws.md` L-001, L-020. `scenarios.md` S-035. `evidence.md` E-001, E-003.
- What would close it: Independent first-party sources plus a foundation note from issues #3 or #6 that agree on one identity or two.
- Must not do: Design a target schema that picks a side.

## Q-002 Is override an Action or a Policy?

- Kind: candidate law
- Decision state: undetermined
- Why it is open: ERPNext Manual Inspection is a user-set status. ISO concession is permission to use a nonconforming product. 21 CFR 211.165(f) rejects failing drug product. Those three do not agree on form.
- Cite: `candidate-laws.md` L-019, L-005. `scenarios.md` S-003. `evidence.md` E-006.
- What would close it: Two independent first-party sources that treat override the same way, including a regulated source if the claim is universal.
- Must not do: Implement `status = Accepted` as the model.

## Q-003 Does a sample-level fail split lot identity?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Odoo splits quantity across locations and keeps the product lot unless the user splits it. ISO 2859 accepts or rejects the lot. Genealogy identity is owned by #20.
- Cite: `scenarios.md` S-001, S-026. `matrix.md` partial quantity row.
- What would close it: A #20 artifact that states when quality state forces a new lot or serial identity.

## Q-004 Which sampling word does OS keep?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: L-007 is supported as a collision. The project has not chosen names.
- Cite: `candidate-laws.md` L-007. `evidence.md` E-007, E-014.
- What would close it: A later naming decision after #38 reads CBV in full. Not a schema.

## Q-005 Must every quantity measurement carry uncertainty?

- Kind: candidate law
- Decision state: undetermined
- Why it is open: L-010 is only a hypothesis. Operating ERPs omit uncertainty. GUM requires it for a complete measurement result.
- Cite: `candidate-laws.md` L-010. `scenarios.md` S-005. `evidence.md` E-003.
- What would close it: A domain that cannot judge near-limit lots without a decision rule, documented from a first-party metrology or regulatory source used in that industry.

## Q-006 What is the ISA-95 Part 1 quality attribute list?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: Part 1 is paywalled. Public OPC mapping gives Test Specification Version and Test Result Date, Result, unit, Expiration only.
- Cite: `evidence.md` E-013. `sources.md` S-ISA95-P1.
- What would close it: A licensed read of IEC 62264-1, recorded as concepts only.

## Q-007 Is Quality Alert a nonconformance record?

- Kind: source-system artifact
- Decision state: undetermined
- Why it is open: Odoo Alert is a notification with CAPA tabs. ISO 8.7.2 wants description, actions, concessions, and authority. ERPNext splits inspection from Quality Action.
- Cite: `evidence.md` E-005, E-012. `scenarios.md` S-029, S-030.
- What would close it: Cross-domain comparison that treats Alert as a surface of NCR, or as a separate notification type.

## Q-008 How does 21 CFR 211.192 constrain retest?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: The 211.192 fetch timed out. Secondary pages were not used as evidence.
- Cite: `sources.md` S-CFR211. `scenarios.md` S-004.
- What would close it: A first-party read of 211.192 and any current FDA OOS guidance.

## Q-009 Does ERPNext fetch copy criteria onto submitted inspections?

- Kind: source-system artifact
- Decision state: undetermined
- Why it is open: Docs say fetched. Code was not copied. Licensing forbids translating implementation.
- Cite: `scenarios.md` S-013. `sources.md` S-ERP-PATH.
- What would close it: Corpus issue #32 describing the behavior in words, without pasting code.

## Q-010 When may skip-lot omit an instance?

- Kind: domain evidence
- Decision state: undetermined
- Why it is open: ISO 2859-1:2026 tables are paywalled. Public page confirms skip-lot exists.
- Cite: `scenarios.md` S-022, S-023. `sources.md` S-ISO2859.
- What would close it: A licensed read of the switching tables, recorded as rules, not copied tables.

## Q-011 Is in-process quality the same Action family as incoming and outgoing?

- Kind: candidate law
- Decision state: undetermined
- Why it is open: ERPNext uses one Quality Inspection DocType with a type field. Odoo uses one check bound to different operations. Downstream rights differ. WIP versus finished goods versus customer release.
- Cite: `scenarios.md` S-007, S-008, S-009. `lifecycle.md` lot states.
- What would close it: Manufacturing #19 plus inventory #18 saying whether one Action with a stage parameter preserves enforcement.

## Q-012 Repo-wide questions touched, not answered

These rows exist so a synthesis agent does not think this folder closed `docs/open-questions.md`.

| Repo question | Quality stance |
| --- | --- |
| 3. Truth when sources disagree | S-021 records two measurements. No winner is chosen. Undetermined |
| 4. What is an Action | Override form is Q-002. Undetermined |
| 5. Action vs Event vs Effect | Inspection request vs recorded reading vs stock move. Supported as a needed split. No primitive vote |
| 6. Is status a stored decision or a projection | Lifecycle hypothesis. Undetermined |
| 7. Bitemporality | ISA-95 Date vs record timestamp supports the question. Not a foundation decision |
| 8. Provenance | E-011 and L-013. Supported as required for release and concession. Vocabulary not chosen |
| 9. Function, Constraint, Policy | Acceptance formula is a Function. Override may be Policy. Q-002 open |
| 14. Manufacturing quality or release | This folder. Execution of scrap and rework remains #19 |

## Q-013 Should a new GitHub issue be opened?

- Kind: domain evidence
- Decision state: rejected for this wave
- Why: The identity and override forks are already in issue #25 and the standing orders. The sampling-word collision is recorded as L-007. No new semantic question appeared that lacks a home.
- Follow-up that is not a new issue: licensed reads of ISA-95 Part 1, ISO 2859 tables, and 21 CFR 211.192.
