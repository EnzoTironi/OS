# Candidate laws for projects and professional services

- Artifact ID: `issue-0029-projects-laws`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: candidate law
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

A candidate law is the smallest claim that explains the evidence. It is not an architecture decision and not a schema. Counterexamples sit on the same card.

---

### L-001 Work container is not the commercial commitment

- Kind: candidate law
- Statement: The thing that organizes delivery work is not the same thing as the promise a customer can be billed against. They may point at each other. Either may exist without the other.
- Evidence: E-002, E-003, E-004, E-019, E-023, E-025
- Independent convergence: ERPNext Project versus Sales Order. Odoo Project and Task created from a confirmed order. Dynamics work entities versus billing entities. Valueflows Plan versus Commitment.
- Known limits: Dynamics requires a project contract to invoice a project. That is a product rule, not proof that every work container needs a contract type.
- Counterexamples: X-001, X-002
- Decision state: supported
- Runtime consequence: a mutation that changes promised price must not silently rewrite observed work, and a mutation that reassigns a task must not silently rewrite the committed amount.

### L-002 Engagement is not yet a third identity

- Kind: candidate law
- Statement: "Engagement" as a distinct enduring identity beside project and contract is not established by the first-party pages opened this session.
- Evidence: E-029
- Independent convergence: none. Only Dynamics prose uses the word.
- Known limits: PSA products were not examined.
- Counterexamples: X-003
- Decision state: undetermined
- Do not accept this as a primitive. Do not reject the word. Leave the fork open.

### L-003 Scope is a set of commitments, not a text field on a project

- Kind: candidate law
- Statement: What was sold is the set of promised flows and their quantities, prices, and billing methods. A project description is not that set.
- Evidence: E-002, E-004, E-006, E-023
- Independent convergence: ERPNext sales order holds committed quantity and billing progress. Valueflows Commitment and Plan deliverable(s).
- Known limits: many UIs still store a scope paragraph on the project.
- Counterexamples: X-004
- Decision state: hypothesis
- Runtime consequence: scope change is an amendment or a new commitment, not an edit of historical promise.

### L-004 Work decomposes into actionable units

- Kind: candidate law
- Statement: A body of delivery work is divided into units that can be assigned, blocked, timed, and completed without completing the whole body.
- Evidence: E-010
- Independent convergence: ERPNext Task, Odoo Task, Moqui Task-type WorkEffort, Dynamics tasks as work entities.
- Known limits: Valueflows prefers Process over Task. A task name is often the process.
- Counterexamples: X-005
- Decision state: supported

### L-005 Some work is blocked until other work is terminal

- Kind: candidate law
- Statement: A dependency means the successor is not allowed to enter progress until each predecessor is complete or otherwise terminal.
- Evidence: E-011
- Independent convergence: Odoo Waiting, ERPNext dependent tasks, Moqui Depends On.
- Known limits: sources disagree whether Cancelled is terminal for the successor. Odoo yes. ERPNext text stresses completion.
- Counterexamples: X-006
- Decision state: supported for blocking. undetermined for cancel-as-release.

### L-006 Assignment is a time-bounded party-to-work relationship

- Kind: candidate law
- Statement: Who is expected to do the work is a relationship with its own status and interval. It is not a stored owner field that erases prior holders.
- Evidence: E-012, E-014
- Independent convergence: Moqui WorkEffortParty. Weaker in ERPNext and Odoo docs opened.
- Known limits: may collapse to a link if a domain never reassigns or never audits who was offered the work.
- Counterexamples: X-007
- Decision state: hypothesis as a required relator. supported as a real pattern.

### L-007 Observed effort is not billable quantity is not invoiced quantity

- Kind: candidate law
- Statement: Hours or expense that happened, the subset a contract allows to charge, and the subset already placed on an invoice are three facts.
- Evidence: E-013, E-014, E-016, E-020
- Independent convergence: ERPNext hours, billing hours, billed hours. Moqui billed when invoice item is referenced. Odoo hours become Delivered, then Invoiced.
- Known limits: a shop can set policy that all three stay equal.
- Counterexamples: X-008
- Decision state: supported

### L-008 Cost of work is not price of work

- Kind: candidate law
- Statement: What it costs the provider and what the customer is charged are different rates on the same observation.
- Evidence: E-013, E-014, E-018, E-027
- Independent convergence: ERPNext costing rate versus billing rate. Moqui vendor rate versus client rate. Dynamics cost currency versus sales currency.
- Known limits: "billing rate" in Odoo timesheet settings means utilization target. Do not merge that sense. E-027.
- Counterexamples: X-009
- Decision state: supported

### L-009 Billing method decides whether incurred cost creates customer revenue

- Kind: candidate law
- Statement: Under time and materials, an additional billable observation increases what may be invoiced, subject to any cap. Under fixed price, additional cost does not increase the committed sales value.
- Evidence: E-018, E-006, E-007
- Independent convergence: Dynamics T&M versus Fixed Price. Odoo T&M versus fixed-price contract. ERPNext timesheet invoice versus fractional service quantity.
- Known limits: retainers, hybrids, and not-to-exceed were only partly documented. NTE is clear in Dynamics. E-018.
- Counterexamples: X-010
- Decision state: supported

### L-010 Service fulfillment is not inventory fulfillment

- Kind: candidate law
- Statement: Completing a service line is observed work, a reached checkpoint, or an accepted deliverable. It is not a stock movement out of a warehouse.
- Evidence: E-004, E-020, E-024
- Independent convergence: ERPNext service workflow without Delivery Note. Odoo delivered hours or reached milestone. Valueflows work as a flow into a process.
- Known limits: mixed orders still have stock lines. Those lines belong to issue #18.
- Counterexamples: X-011
- Decision state: supported

### L-011 An invoice is not customer acceptance

- Kind: candidate law
- Statement: Recording a receivable proves a billing act. It does not prove the customer accepted the deliverable unless a separate acceptance fact exists.
- Evidence: E-005, E-007, E-023
- Independent convergence: ERPNext explicit sentence. Valueflows Claim versus Economic Event. Odoo Reached is an internal checkbox.
- Known limits: no Acceptance type was found. The law asserts a gap, not a new primitive.
- Counterexamples: X-012
- Decision state: supported as a distinction. undetermined as a required Acceptance type.

### L-012 Milestone is overloaded and must be split before it can be a law

- Kind: candidate law
- Statement: The word milestone covers a task flag, a peer checkpoint associated to work, and a billing trigger. Those three are not one kind.
- Evidence: E-006, E-007, E-008, E-009, E-025
- Independent convergence: the overload itself is the finding.
- Known limits: a company may use one object for all three by policy.
- Counterexamples: X-013
- Decision state: supported as a diagnosis. rejected as a single primitive named Milestone.

### L-013 Billable observation is not automatically a claim

- Kind: candidate law
- Statement: A billable time or expense event is not the same as a claim for payment. Valueflows creates a claim only when reciprocity is not already covered by a commitment. ERPs often invoice from the event or from delivered quantity without naming Claim.
- Evidence: E-013, E-014, E-020, E-023
- Independent convergence: none on identity. Sources agree something is billed after work. They disagree what that something is.
- Known limits: issue #16 owns claim and settlement.
- Counterexamples: X-014
- Decision state: undetermined
- Standing order: keep this fork open.

### L-014 Correction of billed time cannot be a silent field edit

- Kind: candidate law
- Statement: After a time observation has been referenced by an invoice, changing its hours or rates requires either cancelling dependents then replacing the record, or recording a compensating event. The two strategies are not equivalent, but both refuse silent edit.
- Evidence: E-016, E-017
- Independent convergence: ERPNext cancel dependents first. Valueflows immutable event plus `corrects`.
- Known limits: the winning strategy is open. The ban on silent edit is the shared part.
- Counterexamples: X-015
- Decision state: hypothesis for the shared ban. undetermined for mutate-after-cancel versus compensating event.

### L-015 Work progress and billing progress are different projections

- Kind: candidate law
- Statement: Percent of tasks complete and percent of committed value invoiced can move independently and must remain independently queryable.
- Evidence: E-026, E-022
- Independent convergence: ERPNext completion methods versus order billed quantity. Odoo task hours versus milestone Delivered.
- Known limits: a policy can force them equal.
- Counterexamples: X-016
- Decision state: supported

### L-016 Change of scope is a new or amended commitment

- Kind: candidate law
- Statement: Adding work the customer will pay for, or dropping promised work, changes the commercial commitment. Historical observations stay. A first-class Change Request type was not found.
- Evidence: E-028, E-003, E-004
- Independent convergence: none on a Change Request type. Convergence on commitment as the place promised quantity lives.
- Known limits: absence of a page is not proof the type does not exist in source.
- Counterexamples: X-004
- Decision state: hypothesis for amendment-as-commitment. undetermined for Change Request as a type.

---

## Rejected as laws

### L-R-01 ERPNext printed gross-margin formula

- Kind: candidate law
- Statement: none. The formula on S-ERPNext-02 mixes terms in a way that cannot be a domain invariant.
- Evidence: E-022
- Decision state: rejected

### L-R-02 One WorkEffort type hierarchy is the domain

- Kind: candidate law
- Statement: Moqui's Project, Milestone, Task, Event, Available, Time Off as one typed hierarchy is a powerful source artifact. It is not a law that OS must use one type with an enum.
- Evidence: E-009, S-Moqui-01
- Decision state: rejected as a primitive. retained as evidence that work, time off, and meetings were given a common handle in one system.

---

## Counterexample cards

### X-001 Internal project with no customer and no order

- Kind: counterexample
- Targets: L-001
- Setup: A company runs an internal tooling project. No sales order. Time is costing only.
- Falsifying result: if a work container cannot exist without a commercial commitment, this setup is unrepresentable.
- Observed result: ERPNext allows Project without Customer. E-002.
- Consequence: narrows L-001. Commitment is optional on the work side.
- Decision state: supported as a narrowing case

### X-002 Invoice from timesheet with no project

- Kind: counterexample
- Targets: L-001
- Setup: Employee submits a timesheet tagged to a customer. User creates a sales invoice from the timesheet. No project record.
- Falsifying result: if billing always requires a project, this flow is illegal.
- Observed result: ERPNext documents invoice from timesheet and asks for customer and item. Project is not required on that page. E-006 path via S-ERPNext-06.
- Consequence: billing can attach to observed time and a customer without a project. Strengthens L-001.
- Decision state: supported

### X-003 Multi-funder public project

- Kind: counterexample
- Targets: L-002
- Setup: A school district and a city fund one construction effort and split invoices.
- Falsifying result: if project plus contract lines already express this, engagement is unnecessary. If users still name a third object, engagement may be real.
- Observed result: Dynamics multicustomer deals invoice several customers on one contract. E-003, S-D365-01. No Engagement type on the page.
- Consequence: leave L-002 undetermined.
- Decision state: undetermined

### X-004 Scope paragraph edited after work started

- Kind: counterexample
- Targets: L-003, L-016
- Setup: After 40 hours are posted, a manager edits the project description to add a module and does not amend the sales order.
- Falsifying result: if later invoices and profitability still match the original order, the description was never scope. If they silently follow the new paragraph, L-003 is false in that system.
- Observed result: not run. ERPNext billing progress follows the sales order, not the project notes. E-002, E-004.
- Consequence: hypothesis stands until a source bills from the notes field.
- Decision state: hypothesis

### X-005 Single-task engagement

- Kind: counterexample
- Targets: L-004
- Setup: A one-hour advisory call is sold and delivered with no task list.
- Falsifying result: if every commercial service requires a work-item tree, this is unnatural.
- Observed result: ERPNext can invoice a timesheet without a task. S-ERPNext-04 allows project optional on a row.
- Consequence: decomposition is common, not mandatory.
- Decision state: supported as a narrowing case

### X-006 Cancel predecessor

- Kind: counterexample
- Targets: L-005
- Setup: Task B waits on Task A. Task A is cancelled.
- Falsifying result: if B stays blocked, cancel is not terminal. If B becomes startable, cancel releases.
- Observed result: Odoo releases on Cancelled. E-011. ERPNext text not explicit.
- Consequence: L-005 stays undetermined on cancel-as-release.
- Decision state: undetermined

### X-007 Reassign after time posted

- Kind: counterexample
- Targets: L-006
- Setup: Worker A posts 6 hours. Manager assigns Worker B. A's time remains.
- Falsifying result: if historical time changes owner, assignment was a mutable field, not a relationship.
- Observed result: Moqui TimeEntry keeps partyId. E-014.
- Consequence: supports L-006.
- Decision state: supported as a directional test. not run on ERPNext or Odoo this session.

### X-008 Write-off of billable hours

- Kind: counterexample
- Targets: L-007
- Setup: 10 hours observed, 10 marked billable, manager writes off 3 before invoice.
- Falsifying result: if the system has only one hours field, write-off destroys the observation.
- Observed result: ERPNext billing hours can differ from hours. E-013.
- Consequence: supports L-007.
- Decision state: supported

### X-009 Zero billing rate, nonzero costing rate

- Kind: counterexample
- Targets: L-008
- Setup: Training on a customer site is non-billable and still costs salary.
- Falsifying result: if one rate field exists, either cost or price is lost.
- Observed result: ERPNext Bill flag and separate rates. E-013. Odoo billable versus total time. E-027.
- Consequence: supports L-008.
- Decision state: supported

### X-010 Fixed-price overrun

- Kind: counterexample
- Targets: L-009
- Setup: Fixed-price 50,000. Actual costing 70,000.
- Falsifying result: if sales amount rises to 70,000 without a new commitment, L-009 is false.
- Observed result: Dynamics says fixed-price sales do not change as costs are incurred. E-018.
- Consequence: supports L-009. Profitability suffers. Revenue does not automatically follow cost.
- Decision state: supported

### X-011 Mixed goods and installation

- Kind: counterexample
- Targets: L-010
- Setup: One sales order has 10 stocked devices and one installation service.
- Falsifying result: if both lines require a delivery note, L-010 is false. If both forbid a delivery note, inventory fulfillment is lost.
- Observed result: ERPNext says a company can run a goods flow and a service flow. Installation can invoice without a delivery note. E-004. Odoo T&M can add purchases to the same order. E-021.
- Consequence: supports L-010. Mixed orders compose two fulfillment kinds. Cross-link #18.
- Decision state: supported

### X-012 Invoice before sign-off

- Kind: counterexample
- Targets: L-011
- Setup: Provider invoices 25% on kickoff before the customer accepts a deliverable.
- Falsifying result: if the system treats that invoice as acceptance, L-011 is false.
- Observed result: ERPNext milestone decimal billing and the sentence that invoice is not acceptance. E-005, E-006.
- Consequence: supports L-011.
- Decision state: supported

### X-013 One task, two milestones over time

- Kind: counterexample
- Targets: L-012
- Setup: A hardening task is associated to the beta milestone, then later to the launch milestone.
- Falsifying result: if milestone is only a boolean on the task, history of associations is lost.
- Observed result: Moqui documents this as the reason milestone is an association, not a parent. E-009.
- Consequence: supports L-012 as a split.
- Decision state: supported

### X-014 T&M invoice from delivered hours

- Kind: counterexample
- Targets: L-013
- Setup: Hours post to a task. Delivered updates. User creates a regular invoice.
- Falsifying result: if that invoice is identical to a VF Claim, L-013 collapses. If a commitment already covered payment for those hours, VF would not need a claim.
- Observed result: Odoo invoices delivered hours from the sales order. E-020. VF says a claim is unneeded when a commitment exists. E-023.
- Consequence: keep L-013 undetermined. Cross-link #16.
- Decision state: undetermined

### X-015 Retroactive hours after invoice

- Kind: counterexample
- Targets: L-014
- Setup: Invoice posted for 8 hours. Worker then says it was 6.
- Falsifying result: if hours become 6 on the old row and the invoice still says 8 with no reversal, history is unexplained. If the system blocks edit until the invoice is cancelled, or requires a correcting event, L-014 holds.
- Observed result: ERPNext requires cancel of dependents before amend. E-016. VF requires a correcting event. E-017. Not run live.
- Consequence: both strategies satisfy the ban on silent edit. Strategy choice stays open.
- Decision state: hypothesis

### X-016 Tasks 90% complete, billed 25%

- Kind: counterexample
- Targets: L-015
- Setup: Weighted tasks nearly done. Only the first milestone invoice posted.
- Falsifying result: if the system has one progress field used for both management and billing, L-015 is false.
- Observed result: ERPNext stores completion method on the project and billed quantity on the order. E-026.
- Consequence: supports L-015.
- Decision state: supported
