# Asset and maintenance

**Issue:** [#26](https://github.com/EnzoTironi/OS/issues/26)  
**Track:** domain  
**Fetched:** 2026-08-16  
**Contract:** Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is absent on `origin/main`.  
**Decision:** none. Nothing here is accepted.

## Question

What real-world distinctions must an executable ontology keep when a company owns, locates, uses, maintains, and replaces equipment?

The issue names the forks that change later architecture.

- financial asset versus operational equipment versus production resource
- location versus hierarchy versus custody
- capability versus condition versus meter
- preventive, corrective, and predictive work
- maintenance plan versus order versus execution
- downtime, spare parts, warranty, calibration
- failure observation versus diagnosis

Required scenario families are equipment relocation, overlapping maintenance, an unavailable resource that changes a production plan, component replacement, condition-based maintenance, and historical capability change.

## How to read these notes

Each card states a **kind** and a **decision state**.

Kinds used here.

- **domain evidence.** A real-world distinction forced by operations, accounting, or reliability practice.
- **source-system artifact.** A table, DocType, app, or field that one product invented.
- **candidate law.** The smallest claim that would explain several sources.
- **counterexample.** A scenario that would kill that claim.
- **runtime consequence.** What a later engine would have to enforce if the claim survives.

Decision states are `hypothesis`, `supported`, `rejected`, or `undetermined`. Never `accepted`.

Two forks stay **undetermined** even where sources rhyme.

1. Asset-versus-equipment identity. Independent sources agree that finance, role, and serial hardware can come apart. They do not agree that those are one object, two objects, or three.
2. Plan-versus-execution identity. Independent sources agree that a schedule is not a completion. They do not agree whether plan and execution are separate kinds or phases of one work object.

Do not promote either fork into RFC-0001 from this folder.

## Files

| File | Mode | Contents |
| --- | --- | --- |
| [sources.md](sources.md) | reference | First-party pages, SHAs, and licensing bounds |
| [evidence.md](evidence.md) | explanation | Domain evidence and source artifacts |
| [matrix.md](matrix.md) | reference | Convergence and divergence by distinction |
| [lifecycle.md](lifecycle.md) | explanation | Status, assignment, and work lifecycles |
| [candidate-laws.md](candidate-laws.md) | explanation | Falsifiable claims |
| [scenarios.md](scenarios.md) | explanation | Thirty-two adversarial cards |
| [open-questions.md](open-questions.md) | reference | Unresolved questions. No invented answers |

## Candidate concepts, not a schema

These names are research labels. They are not OS types.

| Label | Working meaning | Decision |
| --- | --- | --- |
| Financial capitalization | A valued enduring thing on a balance sheet, with acquisition, depreciation, and disposal | `supported` as a distinct concern |
| Operational equipment | A maintainable thing used in work | `supported` as a distinct concern |
| Role equipment | A logical place in a process that can outlive the serial device installed there | `supported` in ISA-95, SAP, and Maximo. `undetermined` as a required OS kind |
| Serial physical asset | A vendor-identified device that can move between roles and stores | `supported` where those products exist. `undetermined` as identity of ERPNext Asset |
| Location | A place in a facility tree. Not a warehouse stock bin | `supported` as distinct from inventory location |
| Custody | Assignment of a thing to a person or department | `supported` as distinct from location in ERPNext movement purposes |
| Capability | What a role or device can do, possibly tested | `hypothesis`. Manufacturing work-center capability belongs to #19 |
| Condition | Restricted operating state such as out of order | `supported` as operationally distinct from financial status |
| Meter reading | A dated measurement or counter on a thing or a place | `supported` in SAP and Maximo. Absent as a first-class ERPNext Asset concept |
| Maintenance plan | Recurring intended work | `supported` as distinct from a failure record |
| Maintenance occurrence | One planned instance that can complete, go overdue, or cancel | `supported` in ERPNext logs |
| Failure observation | What was seen, and when | `supported` as distinct from repair action |
| Diagnosis | Mode, mechanism, or cause after investigation | `supported` in ISO 14224 vocabulary. Weak in ERPNext and Odoo forms |
| Downtime | Interval while the thing cannot do its job | `supported` as a derived or recorded interval, not as identity |
| Spare consumption | Inventory leaving stock because work used it | `supported` as an inventory event. Owned by #18 |
| Warranty interval | A time-bounded commercial cover | `supported` as a fact on the thing, not as work |
| Calibration task | Planned work whose evidence is a certificate of accuracy | `supported` as a task type in ERPNext. Quality method belongs to #25 |

## Sibling issues

Cite these folders when they land. Do not copy them here.

- #18 inventory owns spare-part stock, warehouses, and consumption
- #19 manufacturing owns work-center capability and execution
- #24 planning owns capacity and the production plan
- #25 quality owns calibration method and inspection semantics

This folder owns the maintainable thing, its place, its condition, and the maintenance work about it.

## What this folder does not do

It does not edit RFC-0001.  
It does not answer `docs/open-questions.md`.  
It does not propose tables, DocTypes, or a target schema.  
It does not paste ERPNext or Odoo implementation.
