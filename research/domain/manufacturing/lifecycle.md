---
issue: 19
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Plan versus execution

This note is the plan-versus-execution cut for issue 19. It is not a state machine to implement and not a target schema.

Kind tags below are domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence.

## The layering that keeps surviving

**Kind.** domain evidence. **Decision state.** `supported` for the four-way split. `hypothesis` for the names.

```text
specification  ->  plan  ->  authorization  ->  execution and observation
```

Specification answers how this kind of thing is made while a revision is in effect. Plan answers what we intend to make in a window, with scaled quantities. Authorization answers what the floor or a supplier is allowed to start. Execution is the job. Observation is the asserted consume, produce, scrap, or correction.

ValueFlows names knowledge, plan, and observation, and lets one Process hold intents, commitments, and events. ERPNext splits the same cut across BOM, Production Plan, Work Order, and Job Card plus stock entries. Odoo splits it across BoM, manufacturing order, and work order. EPCIS records only observation. ISA-95 public text puts enterprise planning at level 4 and operations management at level 3.

A later synthesis that collapses specification into the order, or authorization into the job, will fight every source in [matrix.md](matrix.md).

## What each layer may change

| Layer | May change without rewriting lower layers | Must not pretend to be |
| --- | --- | --- |
| Specification revision | Future plans. New authorizations | The BOM that an open order already copied or pinned |
| Plan | Quantities, dates, make-or-buy of a sub-assembly | Stock on hand. Completed qty |
| Authorization | Warehouse, alternate item, extra issue, stop, reopen | The Job Card times. The TransformationEvent |
| Execution | Start, stop, completed qty, pending qty, scrap on the job | The independent demand that justified the order |
| Observation | Consume, produce, correction, unbuild | The attempt that timed out or was denied |

**Kind.** candidate law. **Decision state.** `hypothesis`. Falsifier. A mature plant that edits the live specification and thereby changes already posted consumption without a correction event. See S-M01 and S-M10.

## Authorization is not execution

ERPNext submit of a Work Order reserves material and can schedule workstation slots. That is still not a Job Card time log. Odoo confirm of a manufacturing order creates work orders. Those work orders are the jobs. ValueFlows Commitment is a promise. Economic Event is what happened. The ISA-95 draft says a work request may have several work responses if the facility splits the work.

**Kind.** domain evidence. **Decision state.** `supported`.

Runtime consequence. An agent tool named StartProduction cannot both release the order and assert the output lot in one uninterpreted write. Release and observe are different actions. They may run in one user gesture. They still produce different facts.

## Material lifecycle on one authorization

Happy path, ERPNext words, domain facts in parentheses.

1. Required qty is copied from the specification. Plan.
2. Submit reserves qty at the source warehouse. Allocation.
3. Start issues or transfers qty into WIP. Custody move.
4. Job runs. Operation execution.
5. Consume qty leaves inventory. Transformation input.
6. Finish produces qty at the target warehouse. Transformation output.
7. Scrap or process loss or pending remainder explains why output is not input. Disposition or incomplete work.
8. Return unused. Reverse of issue.
9. Extra issue. Issue above the copied plan.

Odoo and Moqui use different documents and still keep issue and produce as separate stock or asset events. ValueFlows would record consume and produce on the same Process. EPCIS would record one or more TransformationEvents, optionally linked by `transformationID`.

**Kind.** domain evidence. **Decision state.** `supported` that these steps are not one field. **Counterexample.** S-M17, S-M28, S-M34.

## Operation lifecycle

Definition. A named operation with a default capable place.

Planned occurrence. The operation row on a BOM, routing, or manufacturing order, with planned time and workstation.

Dispatched occurrence. A job assigned to a work center and, in ERPNext, an employee.

Actual occurrence. Time logs, completed qty, scrap, pending qty, quality inspection.

ERPNext Sequence ID blocks completing a later Job Card first. That is a constraint on execution order, not a rewrite of the definition.

**Kind.** domain evidence. **Decision state.** `supported`.

## WIP as a phase, not a kind

Three readings appear in the sources. They can be true together.

- Location reading. Quantity sits in a WIP warehouse or pre-production location.
- Valuation reading. Issued quantity is WIP inventory on the books until receipt of output.
- Stage reading. The same identified resource is at a process-specification stage.

None of these is a new product specification. Calling WIP an Item is a source smell.

**Kind.** candidate law. **Decision state.** `hypothesis`. See Q4.

## Subcontract lifecycle

The transformation is the same. The performing agent is not the authorizing organization.

1. Specification says which materials are supplied and which the supplier sources.
2. Authorization is a service purchase plus a subcontract order or a subcontracting BoM on a purchase order.
3. Custody of supplied materials moves to the supplier warehouse or the subcontractor location.
4. Observation is receipt of finished goods, consumption backflush, optional scrap, and service cost.

Odoo basic, resupply, and dropship change only how components reach the supplier. They do not change the fact that the output is produced by another agent.

**Kind.** domain evidence. **Decision state.** `supported`.

## Correction lifecycle

Observed consumption and output can be wrong. Sources do not delete the original authorization.

- ERPNext return and extra issue add stock entries.
- Odoo unbuild creates a reverse transformation. Scrap after Done moves finished goods to a virtual location.
- ValueFlows lets an Economic Event correct or reverse a previous one.
- EPCIS has error declaration in the standard family. Issue 38 owns that mechanism.

**Kind.** domain evidence. **Decision state.** `supported` that correction is additive. `undetermined` for the exact correction primitive. That question sits with foundation issue 5.

## What this does not decide

It does not decide whether Event is a primitive. It does not decide whether Fact is the storage unit. It does not decide whether Relator is required for reservation. Those are RFC-0001 and foundation issues.

It does decide, as a research claim, that manufacturing is a bad place to treat requested, planned, authorized, and happened as one status field.
