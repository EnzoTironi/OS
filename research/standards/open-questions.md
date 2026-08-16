# Open questions

Questions left after this Wave A pass. None of these are written into `docs/open-questions.md`. A synthesis agent should treat each row as `undetermined` until more corpora or the unpaid full texts arrive.

## Questions this folder can already constrain

### Q-38-01 Is Event a primitive or an interface?

- Points at: RFC-0001 Event or Event-nature. Open question 5.
- What this corpus adds: EPCISEvent is a base type with five subclasses that differ by the shape of "what." ObjectEvent can assert a non-occurrence. ErrorDeclaration is the same type with inverted semantics.
- Decision state: `undetermined`
- Will not invent: a non-event Observation kernel form. Evidence is not enough.

### Q-38-02 Does RFC-0001 Action cover EPCIS Action?

- Points at: RFC-0001 Action. Open question 4.
- What this corpus adds: a direct name collision. See D-001, X-002.
- Decision state: `rejected` that they are the same. `supported` that OS Action stays the intervention.

### Q-38-03 Must every Fact carry valid time and knowledge time?

- Points at: open question 7.
- What this corpus adds: eventTime versus recordTime is real. recordTime is specified as repository bookkeeping for standing queries, not as a full knowledge-time theory. Sensor clocks are a third series.
- Decision state: `undetermined` for "every Fact." `supported` that occurrence time and record time must not be one field on visibility events.

### Q-38-04 Is accepted operational state a primitive?

- Points at: open question 3.
- What this corpus adds: EPCIS events are capturing-application assertions. Two partners can emit contradictory shipping and receiving events. The standard tells them to add events, not to elect a winner.
- Decision state: `undetermined`
- Related scenario: S-011

### Q-38-05 Is Work Order a commitment, an authorization, a plan, or a process instance?

- Points at: open question 14.
- What this corpus adds: ISA-95 names definition, schedule, job list, and performance as different exchange nouns. ISA-88 names general, site, master, and control recipes, then a production record.
- Decision state: `undetermined` for the ERP document. `supported` that those faces are not one noun in the standards.

### Q-38-06 Does transformation require exact genealogy?

- Points at: scenario S-008. Open question 14 transformation.
- What this corpus adds: EPCIS says no. Plant-floor batch records might say yes. Those records were not read.
- Decision state: `undetermined` for OS. `supported` that visibility interchange is lossy.

### Q-38-07 Is Relator required for aggregation and association?

- Points at: RFC-0001 Relationship or Relator. Open question 12.
- What this corpus adds: Aggregation and Association have identity-bearing parents, membership change via ADD and DELETE, and optional unknown parents. That looks relator-like. It could also be ordinary objects plus events.
- Decision state: `undetermined`

### Q-38-08 Are possession and ownership first-class?

- Points at: inventory and logistics domains.
- What this corpus adds: CBV consigning mentions change of possession or ownership. sourceList and destinationList give transfer endpoints. There is no ownership object in the retrieved EPCIS core.
- Decision state: `undetermined`

### Q-38-09 Should role-based equipment and physical asset be two types?

- Points at: open question 14 work center versus machine.
- What this corpus adds: Part 5 names both models. Full definitions were not retrieved.
- Decision state: `hypothesis` that they differ. `undetermined` until Part 2 is read.

### Q-38-10 Does Ossie pressure any OS form?

- Points at: open question 15, ontology versus runtime, and surfaces.
- What this corpus adds: a warning. Portable metric definitions are Functions over projections. They are not ObjectTypes.
- Decision state: `rejected` as metamodel input. `supported` as a surface-family example for later analytics work.

## Questions this session did not open as new GitHub issues

Standing order 13. No new issue. These are not new semantic questions. They are unfinished reading.

- Read ANSI/ISA-95.00.01-2025 and current IEC 62264-1 body for the Physical Asset definition.
- Read ISA-95 Part 3 activity models against open question 14.
- Read ISA-88.00.01-2010 for procedure versus phase, and Part 4 for batch records versus L-005.
- Read ISA-95 Part 7 alias services against identity reconciliation.
- Read GS1 Digital Link and the EPCIS Implementation Guideline for identifier and error-query practice.
- Compare this folder to issue 37 formal-ontology notes once both are on a synthesis branch.
- Compare Work Order behavior in ERPNext, Odoo, and Moqui corpora to L-008.

## Decision-state table

| ID | Claim | State |
| --- | --- | --- |
| L-001 | Interchange occurrence is assertion, not intervention | `supported` |
| L-002 | Current state is uncontradicted prospective claims | `hypothesis` |
| L-003 | Instance identity ≠ class-plus-quantity | `supported` |
| L-004 | Containment, composition, transformation are three relations | `supported` |
| L-005 | Transformation participation may be lossy | `supported` in EPCIS. `undetermined` as OS-only form |
| L-006 | Occurrence, record, and sensor clocks differ | `supported` for two clocks. `hypothesis` for the third |
| L-007 | Identifier commissioning ≠ object creation | `hypothesis` |
| L-008 | Capability, definition, schedule, performance are distinct | `supported` as domain split. `undetermined` as kernel forms |
| L-009 | Equipment role ≠ physical asset | `hypothesis` |
| L-010 | History is append-only | `supported` |
| X-002 | Import EPCIS Action as OS Action | `rejected` |
| X-005 | Purdue levels as kinds | `rejected` |
| X-009 | Ossie semantic_model as OS ontology | `rejected` |
| Q-38-01 | Event primitive versus interface | `undetermined` |
| RFC-0001 edit | Promote any form from this corpus alone | `undetermined`. Independent sources have not been synthesized. |

## What would change RFC-0001

Independent convergence with issue 37 (endurant versus perdurant, attempt versus observation) and with ERP corpora on plan versus execution would be enough to keep Action != Event and to keep Event-nature able to represent non-occurrence and correction.

This corpus alone is not that convergence. Do not edit the RFC from these notes.
