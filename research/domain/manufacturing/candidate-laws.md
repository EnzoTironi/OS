---
issue: 19
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate manufacturing laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 15 owns specification versus instance. Issue 18 will own stock movement. Issue 38 owns EPCIS event shapes.

## L1. Specification is not authorization is not execution

**Claim.** A description of how a kind of thing is made, a permission to make a quantity, and a record of a job or transformation are three facts. Editing one must not silently rewrite the others.

**Kind.** candidate law.

**Evidence.** E1, E4, E8, E11, E12, E13, E15, E26.

**Decision state.** `supported`.

**Falsifier.** A mature plant that has one record serving as BOM, release, and as-built, and that can still answer what was specified, what was authorized, and what happened after a mid-order revision. S-M01.

**Runtime consequence.** Actions such as ReviseSpecification, ReleaseProduction, StartJob, and RecordOutput take different inputs and leave different facts. A single form may call several actions. The facts stay distinct.

## L2. Material graph and process graph compose. They are not one concept

**Claim.** What is consumed and what steps are performed can be specified together and still fail independently. A phantom or kit can have materials and no stocked output. A workflow can have stages and no BOM tree.

**Kind.** candidate law.

**Evidence.** E1, E5, E7, E29, E30.

**Decision state.** `supported` for the split. `hypothesis` that both graphs must be first-class in every plant.

**Falsifier.** A domain where every process step is nothing but a material line, or every material line is nothing but a step, including services, equipment use, and cited designs. S-M31, S-M36.

**Runtime consequence.** Explosion and scheduling may walk both graphs. They must not require a material line in order to record a work event, or a routing line in order to consume an ingredient.

## L3. Operation definition is not the job

**Claim.** The named step and its default capability exist before any order. The job is a dated performance of that step at a capable place, with actual time and quantity.

**Kind.** candidate law.

**Evidence.** E7, E8, E13, E28.

**Decision state.** `supported`.

**Falsifier.** A source that cannot define cutting except by creating a job, or that treats Job Card as the only place the operation exists.

**Runtime consequence.** Capacity planning reads definitions and planned occurrences. Labor actuals read jobs. Do not store actual minutes on the definition.

## L4. A work center is a capable place. A warehouse is a stock place

**Claim.** Scheduling and costing use capability, hours, and exclusive use. Inventory uses location, lot, and quantity. One physical room may host both. The facts are still different.

**Kind.** candidate law.

**Evidence.** E9, E10, E31.

**Decision state.** `supported`.

**Falsifier.** A plant that stocks and schedules from one location record with no leftover ambiguity about on-hand versus available capacity. S-M07.

**Runtime consequence.** Unavailable production resource is a capability failure. Stockout is an inventory failure. They can coincide. They are not one constraint.

## L5. Reservation is not issue is not consumption

**Claim.** Holding quantity for an authorization, moving it into the process, and decrementing it as an input are three events or three projections. Required qty, reserved qty, issued qty, and consumed qty can all differ.

**Kind.** candidate law.

**Evidence.** E16, E17, E34.

**Decision state.** `supported`.

**Falsifier.** A source that has one quantity field for all four and still handles extra issue, unused return, and backflush correction. S-M10, S-M15, S-M16.

**Runtime consequence.** Negative available-to-promise and negative on-hand are different alarms. Backflush writes consumption. It does not prove an issue happened.

## L6. Backflush is a policy for writing the consumption observation

**Claim.** Inferring consume from the specification times output, or from issued qty, does not create a new kind of flow. It chooses how the observation is asserted. A later count can still correct it.

**Kind.** candidate law.

**Evidence.** E17, E19.

**Decision state.** `supported`.

**Falsifier.** A plant where BOM-based consume and issue-based consume have incompatible resource effects that cannot be expressed as the same consume fact plus provenance. S-M10, S-M28.

**Runtime consequence.** Provenance on the consumption fact must say inferred-from-specification or inferred-from-issue or counted. Correction is another observation.

## L7. WIP is a phase of resources already identified elsewhere

**Claim.** Work in process is location, valuation, or stage of issued or in-process resources. It is not a product specification and not a second item master.

**Kind.** candidate law.

**Evidence.** E18, E5.

**Decision state.** `hypothesis`.

**Falsifier.** A regulated process that must stock a WIP SKU with its own GTIN, BOM, and ownership, not as a stage of the production item or of the issued lots. S-M18 if sequence identity requires a new SKU.

**Runtime consequence.** Queries for on-hand must say whether they include WIP. Valuation must say whether issued lots are still inventory of the input or of the output.

## L8. Planned qty, completed qty, scrap qty, process loss, and pending qty are not one remainder

**Claim.** Output shortfall can mean still in process, lost in process, scrapped as a disposition, or produced as a residual item. Treating leftover as automatic process loss is a known ERPNext failure mode. v16 pending qty exists to stop that.

**Kind.** candidate law.

**Evidence.** E19, E20.

**Decision state.** `supported`.

**Falsifier.** A process where those five quantities are always derivable from one number without losing cost, genealogy, or quality meaning. S-M03, S-M06, S-M29.

**Runtime consequence.** Completing a job with completed less than authorized must ask which of pending, loss, or scrap is being asserted.

## L9. Joint outputs share a transformation. Primary is a role, not a kind

**Claim.** Co-products, by-products, and the named production item can be outputs of one process. Calling one of them primary is a planning and costing role. ValueFlows and EPCIS do not need the role to record the event.

**Kind.** candidate law.

**Evidence.** E19, E20, E24.

**Decision state.** `hypothesis` for dropping primary from the event. `supported` for multiple outputs on one transformation.

**Falsifier.** A costing or fiscal rule that cannot value a process unless exactly one output is the product and every other output is scrap. Then primary becomes locally mandatory. It still would not make by-products a different occurrence type. S-M09.

**Runtime consequence.** The authorization may name a reason-for-being output. The observation may list several produce facts. Genealogy walks all of them.

## L10. Rework either preserves identity or it does not. The choice is the action

**Claim.** Repair, test, and finish of the same individual use accept and modify, and update stage. Making a different specification from failed units uses consume and produce. Unbuild is a compensating transformation of a finished good, not shop-floor rework.

**Kind.** candidate law.

**Evidence.** E22, E33.

**Decision state.** `supported` as a ValueFlows cut. `hypothesis` that ERPs can be read this way without a Rework document.

**Falsifier.** A rework that must both keep the serial and change the resource specification, with no stage or state to carry the difference. S-M04, S-M05.

**Runtime consequence.** Do not model rework as editing completed qty on the original job without an event. The event says whether the serial survived.

## L11. Subcontracting does not change the transformation. It changes the performing agent and custody path

**Claim.** Outsourced production still consumes inputs and produces outputs. The supplier may source some inputs. Custody of supplied inputs moves without necessarily moving rights. The contractor still authorizes.

**Kind.** candidate law.

**Evidence.** E23.

**Decision state.** `supported`.

**Falsifier.** A subcontract that is only a purchase of a finished good with no production semantics, and that still needs supplied-material genealogy. Or a subcontract that is only an internal job with no other agent. S-M08, S-M21, S-M22.

**Runtime consequence.** The same consume and produce facts can name a supplier as provider. Purchase documents are a surface.

## L12. Transformation contribution is many-to-many unless a finer event splits it

**Claim.** After a mix, any input lot may have entered any output lot. A long process may be several observations sharing one transformation identity. Aggregation and packing are reversible and are not this relation.

**Kind.** candidate law.

**Evidence.** E24, E25. Issue 38 L-004 on the standards branch.

**Decision state.** `supported`.

**Falsifier.** A transformation that can later unpack the original inputs unchanged. That is aggregation or combine and separate, not consume and produce. S-M24, S-M25.

**Runtime consequence.** Recall queries must return every output that shares a transformation identity with a bad input, unless later events record a finer split.

## L13. An open authorization pins the specification it copied or referenced

**Claim.** Revising the living BOM, recipe, or routing does not rewrite an already released order's required materials and operations. A new authorization may use the new revision. An explicit rebase is a new decision.

**Kind.** candidate law.

**Evidence.** E2, E3, E4, E6.

**Decision state.** `hypothesis`. ERPNext freeze and ValueFlows decoupling support it. Odoo PLM version behavior on open MOs was not fetched.

**Falsifier.** A first-party page that updates open orders in place when the BoM version changes, and treats that as correct without a rebase action. S-M01, S-M32.

**Runtime consequence.** Historical explainability needs the specification revision id on the authorization, not only a pointer to latest.

## L14. Capacity failure blocks or reshapes the plan. It does not invent execution

**Claim.** No slot, no certified employee, or a down work center is a reason to refuse start, reassign an alternate, or split the job. It is not a produce event of qty zero.

**Kind.** candidate law.

**Evidence.** E9, E10.

**Decision state.** `supported`.

**Falsifier.** A source that records unavailable capacity as a transformation with zero output and treats that as the ordinary complete path. S-M07.

**Runtime consequence.** Alternate work center is a dispatch decision. Time-off is a capability interval. Both are plan-layer facts.

## L15. Substitution is a recorded deviation, not a silent identity merge

**Claim.** An alternative item satisfies a required specification under policy. The as-built record names what was actually issued. The two specifications remain two specifications.

**Kind.** candidate law.

**Evidence.** E21.

**Decision state.** `supported`.

**Falsifier.** A plant where using the alternate makes the two items the same item for genealogy, costing, and future BOMs. S-M02.

**Runtime consequence.** Genealogy and cost use the issued specification. Availability checks may use the equivalence association.

## L16. Current production progress is a projection of observations plus the open authorization

**Claim.** Status such as pending, in process, or completed should be explainable from authorized qty, job completions, scrap, pending remainder, and corrections. A stored status that cannot be reconstructed is a source smell.

**Kind.** candidate law.

**Evidence.** E8, E12, E15, E19. Constitution article 14. Thesis current state as consequence.

**Decision state.** `hypothesis`.

**Falsifier.** A shop that must keep an authoritative status bit that no combination of events can reconstruct, including after late backflush correction. S-M03, S-M10, S-M34.

**Runtime consequence.** If the claim survives, manufacturing status is a function, not a writable field. Foundation issue 6 owns the general form.

## Candidate actions and events

These are research names, not an API and not a schema.

| Candidate action | May lead to events | Layer |
| --- | --- | --- |
| ReviseSpecification | SpecificationRevisionRecorded | knowledge |
| GeneratePlan | PlanCreated, RequirementExploded | plan |
| ReleaseProduction | ProductionAuthorized, MaterialReserved, CapacitySlotReserved | authorization |
| SubstituteMaterial | SubstitutionRecorded | authorization |
| IssueMaterial | MaterialIssued, CustodyMoved | execution |
| StartJob | JobStarted | execution |
| CompleteJob | JobCompleted, QuantityPendingAsserted | execution |
| RecordConsumption | MaterialConsumed | observation |
| RecordOutput | OutputProduced, ByProductProduced | observation |
| RecordScrap | QuantityScrapped | observation |
| RecordProcessLoss | ProcessLossAsserted | observation |
| InspectInProcess | InspectionObserved, DispositionAsserted | observation |
| ReturnUnused | MaterialReturned | observation |
| CorrectConsumption | ConsumptionCorrected | observation |
| UnbuildOutput | OutputUnbuilt, ComponentReclaimed | observation |
| TransferToSubcontractor | CustodyTransferred | authorization and observation |
| ReceiveFromSubcontractor | OutputReceived, SuppliedMaterialConsumed | observation |

**Kind.** candidate law. **Decision state.** `hypothesis`. The list is a coverage check for [scenarios.md](scenarios.md). It is not a closed vocabulary.

## Candidate invariants

1. Consumed qty of an input lot cannot exceed issued qty of that lot plus a documented supplier-sourced or backflush exception. Decision `hypothesis`.
2. Completed plus pending plus process loss on a job equals authorized qty for that operation, after corrections. Decision `hypothesis`. ERPNext v16 is the evidence.
3. An authorization that still holds issued WIP cannot be stopped or closed. Decision `supported` for ERPNext. `hypothesis` as a law.
4. A TransformationEvent without `transformationID` names at least one input and one output. Decision `supported` as EPCIS. `hypothesis` as an OS invariant.
5. A specification revision does not change posted observations. Decision `hypothesis`.

**Kind.** candidate law.
