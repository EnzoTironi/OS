---
issue: 19
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Thirty-six adversarial cards for issue 19. Each card names kind, decision state, the layer it attacks, and what would falsify a law. Happy paths are omitted unless they set up a later failure.

These are research scenarios, not executable tests.

## S-M01. Specification revision during an open order

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L1, L13
- Setup: BOM revision A is copied onto an authorized order for 100. Revision B removes a solvent and adds a substitute. The order is half issued.
- Questions: Does B change required qty on the open order? If the floor follows B without a rebase action, which specification does genealogy cite? Can an auditor recover A?
- Falsifies L13 if a first-party system applies B in place and still claims historical explainability.

## S-M02. Material substitution

- Kind: counterexample
- Decision state: `supported` as a real ERPNext path
- Attacks: L15
- Setup: Plastic crystals are unavailable. Plastic beads are an allowed alternative. The Work Order issues beads.
- Questions: Is the as-built consume beads or crystals? Does cost use beads? Does a later recall of crystal lot X include this output?
- Falsifies L15 if the alternate is stored only as the original item id.

## S-M03. Partial completion

- Kind: counterexample
- Decision state: `supported` as ERPNext finish and Job Card pending qty
- Attacks: L8, L16
- Setup: Authorize 10. Complete 6. Four remain.
- Questions: Are the four pending, lost, or still authorized? Can the Job Card submit? What is Work Order status?
- Falsifies L8 if the four become process loss with no way to say pending.

## S-M04. Rework that keeps the serial

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L10
- Setup: Serial S fails inspection after operation 2. It is repaired at the same workstation and passes.
- Questions: Is S still S? Does stage change? Does completed qty on the original job increase, or is there a new job on the same authorization?
- Falsifies L10 if the serial is both destroyed and preserved with no stage.

## S-M05. Rework that mints a new specification

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L10
- Setup: Failed assemblies are ground and used as feedstock for a different SKU.
- Questions: Is this consume and produce? Does the original authorization's completed qty include the failed units?
- Falsifies L10 if the new SKU is recorded as a scrap location of the old SKU and still ships as a different GTIN.

## S-M06. Excess scrap

- Kind: counterexample
- Decision state: `supported` as a named issue test
- Attacks: L8, L5
- Setup: BOM plans 2 scrap. The job produces 15 scrap on an authorization of 100. Output is 80. Pending is 0.
- Questions: Where do the extra 5 live? Does consume follow BOM times 80, BOM times 100, or issued qty? Can the order close?
- Falsifies L8 if scrap above plan is stored only as a comment.

## S-M07. Unavailable production resource

- Kind: counterexample
- Decision state: `supported` as ERPNext slotting and Odoo alternate work center
- Attacks: L4, L14
- Setup: The only certified press is down. The order is authorized. Material is reserved.
- Questions: Does authorization stay? Is there a zero-output job? Can an alternate work center take the job without changing the specification?
- Falsifies L14 if downtime is posted as a manufacture of qty 0.

## S-M08. Outsourced operation in a multi-operation routing

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L11, L2
- Setup: Operations 1 and 3 are internal. Operation 2 is paint at a supplier. The same serial must return.
- Questions: Is operation 2 a subcontract authorization plus transferCustody, or a work center named Supplier? Who consumes paint? Does stage survive the trip?
- Falsifies L11 if the only model is a full subcontracted BoM for the finished good.

## S-M09. Co-products

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L9
- Setup: Distillation yields 60 of product A and 40 of product B, both sold. The order names A.
- Questions: Is B a by-product line, a second authorization, or a second produce on one transformation? How is cost split? Does EPCIS list both outputs?
- Falsifies L9 if B cannot be received unless a second manufacturing order exists.

## S-M10. Backflush correction

- Kind: counterexample
- Decision state: `supported` as a named issue test
- Attacks: L6, L16
- Setup: Complete uses consume-from-BOM. A later count shows 3 extra solvent issued and 1 unused returned. The output lot already shipped.
- Questions: Is the correction a new consume and a return, or an edit of the manufacture entry? What did stock look like as known at complete time?
- Falsifies L6 if correction can only overwrite the original consume in place.

## S-M11. By-product versus scrap disposition

- Kind: counterexample
- Decision state: `supported` as Odoo by-product versus scrap location
- Attacks: L8, L9
- Setup: Sawdust is sold. Offcuts are dumped. Both leave the same cut operation.
- Questions: Are both produce events? Is dump a scrap move with no residual item? Can sawdust have a lot?
- Falsifies L9 if sold sawdust must be the production item of the order.

## S-M12. Phantom grouping

- Kind: counterexample
- Decision state: `supported` as ERPNext phantom BOM
- Attacks: L2, L7
- Setup: A fastener kit is a phantom. The parent BOM explodes nuts and bolts. No kit is stocked.
- Questions: Does the authorization name the kit? Can the kit appear in genealogy? If someone later stocks the kit, did the specification kind change?
- Falsifies L2 if exploding the phantom requires a produce of the kit.

## S-M13. Stocked sub-assembly versus exploded parent

- Kind: counterexample
- Decision state: `supported` as ERPNext multi-level BOM and Do Not Explode
- Attacks: L1, E35
- Setup: Motherboard is made to stock. Laptop BOM includes motherboard and must not explode it. Keyboard should explode.
- Questions: How many authorizations? Which consume is a stocked intermediate?
- Falsifies L1 if exploding or not is stored only as a user checkbox with no effect on what resource is issued.

## S-M14. Skip transfer, consume from source

- Kind: counterexample
- Decision state: `supported` as ERPNext skip material transfer
- Attacks: L5, L7
- Setup: High-volume line consumes from the source warehouse. No WIP warehouse move.
- Questions: Is there WIP? Is reservation enough? Can stop still require a return?
- Falsifies L7 if the plant still values WIP while no quantity sits in a WIP location and no stage is recorded.

## S-M15. Return unused after complete

- Kind: counterexample
- Decision state: `supported` as ERPNext return components
- Attacks: L5
- Setup: Issued 120. Consumed 100. 20 sit in WIP after finish.
- Questions: Is the 20 still reserved? Does stop work before return? Is the return a reverse issue or a negative consume?
- Falsifies L5 if unused can only be written as scrap.

## S-M16. Extra issue after the plan is fully transferred

- Kind: counterexample
- Decision state: `supported` as ERPNext extra transfer percentage
- Attacks: L5, L13
- Setup: Required 100 are already in WIP. Two units are damaged on the floor. The user issues 2 more. Settings allow 5 percent extra.
- Questions: Does the authorization's required qty change? Is the extra issue still pinned to the same specification revision?
- Falsifies L13 if extra issue silently edits the BOM.

## S-M17. Stop while WIP still holds material

- Kind: counterexample
- Decision state: `supported` as ERPNext stop rule
- Attacks: L5, candidate invariant 3
- Setup: User clicks Stop. Transferred qty is 80. Consumed qty is 50.
- Questions: Is refusal correct? What action sequence is required? Does reopen restore the same reservations?
- Falsifies invariant 3 if stop deletes issued qty.

## S-M18. Sequence constraint on jobs

- Kind: counterexample
- Decision state: `supported` as ERPNext Sequence ID
- Attacks: L3
- Setup: Operation 2 Job Card is completed before operation 1.
- Questions: Is this a constraint failure or a valid overlapping route? Can two jobs on the same serial be in process?
- Falsifies L3 if the only way to express sequence is to merge the two operations into one definition.

## S-M19. Two authorizations contend for one slot

- Kind: counterexample
- Decision state: `supported` as ERPNext capacity planning
- Attacks: L14
- Setup: Two Work Orders need the same workstation after the same planned start. The horizon is 30 days.
- Questions: Who gets the slot? Is the loser still authorized? Is a split of the operation a new job or a new authorization?
- Falsifies L14 if losing the slot cancels posted reservations without an action.

## S-M20. Alternate work center

- Kind: counterexample
- Decision state: `supported` as Odoo alternative work centers
- Attacks: L4, L14
- Setup: Press A is full. Press B is listed as alternate. The job moves.
- Questions: Did the operation definition change? Did planned cost change? Is genealogy tied to A or B?
- Falsifies L4 if moving the job changes the warehouse on-hand of the output without a produce event.

## S-M21. Resupply subcontract

- Kind: counterexample
- Decision state: `supported` as Odoo resupply and ERPNext send to supplier
- Attacks: L11
- Setup: Contractor sends housings to the supplier. Supplier returns painted housings.
- Questions: Who has custody during paint? Who has rights? Is consume recorded at send or at receipt?
- Falsifies L11 if send is modeled as a sale of housings and receipt as an unrelated purchase.

## S-M22. Supplier-sourced component on a subcontract BOM

- Kind: counterexample
- Decision state: `supported` as ERPNext zero-value supplier-sourced
- Attacks: L11, L12
- Setup: Nuts are on the BOM at zero value and do not appear in supplied items. The supplier's invoice includes them.
- Questions: Do nuts enter genealogy? Is there a consume at the contractor? Can a nut recall reach the finished good?
- Falsifies L12 if contribution requires the contractor to have issued the lot.

## S-M23. Unbuild after shipment of some units

- Kind: counterexample
- Decision state: `supported` as Odoo unbuild
- Attacks: L12, L10
- Setup: 10 were produced. 4 shipped. 6 are unbuilt to reclaim boards.
- Questions: Does unbuild name the original manufacturing order? Do shipped serials stay transformed? Are reclaimed boards the same lots that were consumed?
- Falsifies L12 if unbuild restores original input serials that were consumed in a mix.

## S-M24. Lot recall through a mix

- Kind: counterexample
- Decision state: `supported` as seed S-008 plus EPCIS transformation
- Attacks: L12
- Setup: Input lot L1 is later found contaminated. It went into a mix that produced output lots O1 and O2. O1 was split to two customers.
- Questions: Must both O1 and O2 be recalled? Can the system name customers? Is contribution certain or possible?
- Falsifies L12 if the system claims O2 is clean without a finer split event.

## S-M25. Long transformation split across events

- Kind: counterexample
- Decision state: `supported` as EPCIS transformationID
- Attacks: L12
- Setup: Day 1 records only inputs. Day 3 records only outputs. They share a transformation id.
- Questions: May any day-1 input have entered any day-3 output? What if a third event adds more inputs on day 2?
- Falsifies L12 if splitting the observation in time creates a weaker contribution rule than one event.

## S-M26. Equipment use versus ingredient consume

- Kind: counterexample
- Decision state: `supported` as ValueFlows use versus consume
- Attacks: L2, E31
- Setup: An oven is used for 40 minutes. Flour is consumed. A recipe PDF is cited.
- Questions: Does the oven quantity decrement? Is the oven unavailable for overlapping jobs? Does the PDF become WIP?
- Falsifies L2 if all three must be BOM item lines with Include Item in Manufacturing ticked.

## S-M27. Stage and state on a workflow resource

- Kind: counterexample
- Decision state: `supported` as ValueFlows workflow pattern
- Attacks: L7, L10
- Setup: A document must be proofread before format. The same file identity moves through stages. Format refuses input unless stage is proofread and state is pass.
- Questions: Is this a BOM tree? Is the file a new specification at each stage?
- Falsifies L7 if each stage must mint a new SKU to be requested as input.

## S-M28. Backflush from BOM while issue was short

- Kind: counterexample
- Decision state: `supported` as ERPNext subcontract and manufacture settings
- Attacks: L6
- Setup: Issued 80. Completed 100. Backflush is BOM-based. Supplier warehouse has extra stock not on this order.
- Questions: Does consume take 100 from the supplier warehouse? Which lots? Is that theft of another order's reservation?
- Falsifies L6 if BOM-based consume can take another authorization's reserved lots without a fact saying so.

## S-M29. Process loss versus pending on the same job

- Kind: counterexample
- Decision state: `supported` as ERPNext Job Card v16
- Attacks: L8
- Setup: Qty to manufacture 10. Completed 6. User sets pending 0. System treats 4 as process loss. Yesterday the same user set pending 4 and no loss was computed.
- Questions: What changed in the world? Can both days be true in history?
- Falsifies L16 if status yesterday cannot be reconstructed after today's pending change.

## S-M30. In-process inspection fail

- Kind: counterexample
- Decision state: `supported` as ERPNext Job Card QI
- Attacks: L10, L8
- Setup: Operation 2 inspection fails 3 of 10. Operation 3 must not start on the failed 3.
- Questions: Is hold a disposition on the same authorization? Do the 3 stay WIP? Is Sequence ID enough?
- Falsifies L3 if inspection can only attach to the finished-good receipt.

## S-M31. Two recipes for one specification

- Kind: counterexample
- Decision state: `supported` as ValueFlows Recipe class and ERPNext Is Default BOM
- Attacks: L2, L13
- Setup: Summer milking and winter milking both produce milk. An open plan used summer. Today the default recipe is winter.
- Questions: Does MRP flip the open plan? Can both recipes stay in knowledge?
- Falsifies L13 if changing default recipe rewrites open commitments.

## S-M32. Effectivity date crosses an open plan

- Kind: counterexample
- Decision state: `supported` as Moqui fromDate and thruDate
- Attacks: L13
- Setup: `PatMfgBom` for part P uses alloy A through Friday. Saturday it uses alloy B. A production run authorized Thursday will finish Monday.
- Questions: Which alloy is required? Can the run split? Is Friday 23:59 a specification fact or a plan fact?
- Falsifies L13 if the association dates edit the run's consume lines each midnight.

## S-M33. Overlapping jobs at one work center

- Kind: counterexample
- Decision state: `supported` as ERPNext production capacity and Odoo capacity
- Attacks: L4
- Setup: Capacity is 2. A third job is started.
- Questions: Is start refused, queued, or allowed as overtime? Does OEE treat the third as lost time or load?
- Falsifies L4 if the third job decrements component stock without an issue, solely because the work center is overloaded.

## S-M34. Late consumption posted with an earlier valid time

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L6, L16, constitution time
- Setup: On the 12th the books show consume of 10 on the 8th was never recorded. Output on the 8th already shipped.
- Questions: What was WIP as known on the 10th? What is WIP now believed on the 10th? Which lots enter the shipped genealogy?
- Falsifies L16 if only one stock number exists and the 10th report cannot be reproduced.

## S-M35. Kit sale versus manufacture

- Kind: counterexample
- Decision state: `hypothesis`
- Attacks: L2, E30
- Setup: A BoM type Kit ships components without a produce of a parent. A later change makes the same parent a manufactured good.
- Questions: Did past shipments become transformations? Are kit contents consume events?
- Falsifies L2 if kit and manufacture cannot be told apart in history after the BoM type changes.

## S-M36. Circular by-product reuse

- Kind: counterexample
- Decision state: `supported` as ValueFlows circular flows and plastic-shavings example
- Attacks: L9, L12
- Setup: Shavings from process 1 are an input to process 1's next batch.
- Questions: Is the shaving a by-product produce plus a later consume? Does transformation identity chain across batches? Can a contaminated shaving lot poison later batches?
- Falsifies L12 if the cycle cannot be walked without inventing a dummy SKU.

## Coverage of the issue's required tests

| Required test | Cards |
| --- | --- |
| Specification revision during an open order | S-M01, S-M31, S-M32 |
| Material substitution | S-M02 |
| Partial completion | S-M03, S-M29 |
| Rework | S-M04, S-M05, S-M30 |
| Excess scrap | S-M06, S-M11 |
| Unavailable production resource | S-M07, S-M19, S-M20 |
| Outsourced operation | S-M08, S-M21, S-M22 |
| Co-products | S-M09, S-M11, S-M36 |
| Backflush correction | S-M10, S-M28, S-M34 |

Seed scenarios S-008 and S-009 in `scenarios/README.md` are cousins of S-M24 and S-M04. This folder does not edit that file.
