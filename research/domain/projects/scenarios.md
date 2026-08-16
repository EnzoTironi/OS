# Scenarios for projects and professional services

- Artifact ID: `issue-0029-projects-scenarios`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: counterexample
- Decision state: hypothesis unless a cited observation already ran

These cards are for a later synthesis and for issue #71's acceptance suite. They are not executable tests. Happy paths are omitted unless they isolate a distinction.

Each card names Kind, the law it attacks, and Decision state.

Cross-links. Commercial claim and settlement details belong to #16. Stock movement belongs to #18. Employment of the worker belongs to #28. Finite capacity belongs to #24.

---

### S-001 Scope added after work started

- Kind: counterexample
- Targets: L-003, L-016
- Decision state: hypothesis
- Setup: Sales order commits "website redesign" at 40,000 fixed price. Twenty hours are posted. Customer asks for a mobile app. Provider agrees.
- Attack: If the project notes change and the order does not, what is the promised scope? If a new order line is added, do the original 20 hours remain under the old commitment?
- Expected distinction: historical observations stay. Promised work gains a new or amended commitment.
- Related evidence: E-002, E-028

### S-002 Scope removed after partial delivery

- Kind: counterexample
- Targets: L-003, L-016
- Decision state: hypothesis
- Setup: Three milestone products on one order. First milestone invoiced and paid. Customer drops the third.
- Attack: Does billed history reverse? Does remaining committed quantity shrink? Do open tasks cancel or stay as internal work?
- Expected distinction: billed claims stay until reversed. Unbilled commitment can be cancelled. Work items may continue as non-billable.
- Related evidence: E-007, E-005

### S-003 Partial acceptance of a deliverable

- Kind: counterexample
- Targets: L-011, L-012
- Decision state: undetermined
- Setup: Provider submits a report. Customer accepts sections 1-3 and rejects section 4.
- Attack: Is acceptance a property of the project, the milestone, the task, or a separate fact? Can 75% be billed under fixed price without calling the project complete?
- Expected distinction: acceptance is not invoice and not task complete. No first-party Acceptance type was found. E-005, E-028.

### S-004 Kickoff invoice before any work

- Kind: counterexample
- Targets: L-011, L-009
- Decision state: supported as representable
- Setup: Fixed-price 100,000. Contract says 25% on signature. No timesheet exists.
- Attack: If billing required observed work, kickoff invoices would be illegal.
- Observed: ERPNext decimal quantity and Odoo down-payment options on the invoice wizard. E-006, S-Odoo-06.
- Consequence: billing trigger can be a commercial schedule, not work progress.

### S-005 T&M effort overrun

- Kind: counterexample
- Targets: L-007, L-009
- Decision state: hypothesis
- Setup: Estimate 80 hours. Actual 120. All hours billable. No cap.
- Attack: Does the commercial commitment's estimated hours change, or only actuals? Can the customer refuse hours above the estimate without a cap?
- Expected distinction: estimate is not a cap unless recorded as not-to-exceed. E-018.

### S-006 T&M overrun against not-to-exceed

- Kind: counterexample
- Targets: L-009
- Decision state: hypothesis
- Setup: T&M line with NTE 50,000. Costing and billable time reach 60,000 at list rates.
- Attack: Are extra hours still observed? Are they billable? Are they invoiced?
- Observed: Dynamics NTE caps actual revenue, not estimated revenue. E-018. Not pinned in ERPNext or Odoo this session.
- Decision note: representability of NTE outside Dynamics is undetermined.

### S-007 Fixed-price cost overrun

- Kind: counterexample
- Targets: L-008, L-009
- Decision state: supported as a law test
- Setup: Fixed-price 50,000. Timesheet costing 70,000.
- Attack: If sales amount follows costing, L-009 is false.
- Observed: Dynamics fixed-price sales stay independent of cost. E-018. X-010.

### S-008 Reassignment mid-task

- Kind: counterexample
- Targets: L-006
- Decision state: hypothesis
- Setup: Worker A assigned. A posts 6 hours. Manager assigns B. B posts 4 hours. Task completes.
- Attack: Who is the assignee now? Who did the 6 hours? Does profitability use both costing rates?
- Expected distinction: current assignment and historical work party both remain. E-012, E-014.

### S-009 Delegate because part finished

- Kind: counterexample
- Targets: L-006
- Decision state: hypothesis
- Setup: A marks assignment delegated with reason My Part Finished. B is offered, then assigned.
- Attack: Is this a new relationship or an overwrite? Can A still post time?
- Observed: Moqui has the reason enum. S-Moqui-01. Not seen in ERPNext or Odoo pages.

### S-010 Concurrent two-worker assignment

- Kind: counterexample
- Targets: L-006
- Decision state: hypothesis
- Setup: Pair programming. A and B both Assigned on one task for the same week.
- Attack: If assignment is a single owner field, one worker is lost.
- Expected distinction: cardinality of assignment is many.

### S-011 Retroactive time correction before invoice

- Kind: counterexample
- Targets: L-014, L-007
- Decision state: hypothesis
- Setup: Draft or submitted timesheet says 8 hours. Worker corrects to 6 before any invoice.
- Attack: Is this an edit, a cancel-and-amend, or a correcting event? Do project actual start and costing amounts move?
- Observed: ERPNext locks rates on submit but cancel-and-amend exists. E-016. VF would still prefer a correcting event once the observation is a past fact. E-017.

### S-012 Retroactive time correction after invoice

- Kind: counterexample
- Targets: L-014, L-013
- Decision state: hypothesis
- Setup: Invoice posted for 8 hours at 200. Worker then says 6. Customer already paid.
- Attack: Silent edit of the timesheet leaves the receivable unexplained. Cancel invoice then amend timesheet is one path. Credit note plus correcting time event is another.
- Related: S-010 in `scenarios/README.md` on cancellation after irreversible consequences.

### S-013 Backdated time after month close

- Kind: counterexample
- Targets: L-014
- Decision state: hypothesis
- Setup: March books closed. In April a worker posts time valid on March 28.
- Attack: Valid time versus knowledge time. Utilization for March as known in March versus as known in April.
- Related: issue #28 and `scenarios/README.md` S-007. Do not solve bitemporality here.

### S-014 Billing hours differ from hours worked

- Kind: counterexample
- Targets: L-007
- Decision state: supported as representable
- Setup: 10 hours on site. Contract bills 8 after a courtesy write-off.
- Observed: ERPNext Billing Hours is a separate field. E-013. X-008.

### S-015 Non-billable time on a customer project

- Kind: counterexample
- Targets: L-008, L-007
- Decision state: supported as representable
- Setup: Internal rework on a customer project. Bill flag off. Costing rate on.
- Observed: ERPNext Bill checkbox. Odoo billable versus total time. E-013, E-027.

### S-016 Dual rate staffing chain

- Kind: counterexample
- Targets: L-008, L-013
- Decision state: hypothesis
- Setup: Vendor pays worker 80. Client pays vendor 160 for the same hour. Both invoices reference one time entry.
- Observed: Moqui client and vendor invoice item fields. E-014.
- Attack: Is this two claims from one event? Issue #16 should consume this card.

### S-017 Milestone reached without customer sign-off

- Kind: counterexample
- Targets: L-011, L-012
- Decision state: supported as a risk
- Setup: Project manager checks Odoo Reached. Invoice drafts. Customer has not signed.
- Observed: Reached is a checkbox. E-007. ERPNext says invoice is not acceptance. E-005.

### S-018 Milestone billing by decimal quantity

- Kind: source-system artifact
- Targets: L-012
- Decision state: supported as source behavior
- Setup: One service item qty 1 rate 100,000. Invoices 0.250, 0.500, 0.250.
- Observed: S-ERPNext-05. E-006.
- Attack: The domain milestone is simulated by quantity. A synthesis that copies the trick inherits a source artifact.

### S-019 Task associated to two milestones over time

- Kind: counterexample
- Targets: L-012
- Decision state: supported as Moqui's stated reason
- Setup: Hardening task linked to beta, later also to launch.
- Observed: E-009. X-013.

### S-020 Mixed product and service order

- Kind: counterexample
- Targets: L-010
- Decision state: supported as representable
- Setup: 10 stocked devices plus installation service on one sales order. Devices ship in two deliveries. Installation timesheets post after the second delivery.
- Attack: Delivery notes apply to devices. They must not be required for installation. One invoice may still include both.
- Observed: E-004, E-021. X-011. Inventory side is #18.

### S-021 Expense reinvoice on a T&M order

- Kind: counterexample
- Targets: L-009, L-010
- Decision state: supported as Odoo behavior
- Setup: Hotel 400 posted as expense. Customer to Reinvoice points at the sales order. Manager approves. Order gains an expense line.
- Observed: S-Odoo-05. E-021.
- Attack: Is the expense an observed cost, a billable quantity, or already a claim? Same fork as L-013.

### S-022 Material consumed on a project

- Kind: counterexample
- Targets: L-010
- Decision state: hypothesis
- Setup: Project consumes stocked cable via stock entry. Customer is on T&M and should pay cost plus markup.
- Observed: ERPNext Total Consumed Material Cost. E-022. Odoo purchase reinvoice at cost. E-021.
- Attack: Consumption is inventory fulfillment. Reinvoicing is a commercial flow. Do not merge them. Cross-link #18.

### S-023 Service purchase accepted before vendor invoice

- Kind: counterexample
- Targets: L-011
- Decision state: undetermined
- Setup: Subcontractor finishes a work package. No purchase receipt exists because the item is non-stock. Vendor invoice arrives.
- Observed: ERPNext purchase-led service workflow says there is no goods-received confirmation and the team needs another way to verify acceptance. S-ERPNext-05.
- Attack: missing acceptance control. Do not invent the document.

### S-024 Predecessor cancelled, successor waiting

- Kind: counterexample
- Targets: L-005
- Decision state: undetermined
- Setup: B blocked by A. A cancelled.
- Observed: Odoo allows B to proceed. E-011. ERPNext not explicit.

### S-025 Circular or conflicting dependencies

- Kind: counterexample
- Targets: L-005
- Decision state: hypothesis
- Setup: A depends on B. B depends on A.
- Attack: If the model allows it, no task can start. Constraint needed. No source page opened states the cycle rule.

### S-026 Project percent complete disagrees with billed percent

- Kind: counterexample
- Targets: L-015
- Decision state: supported as representable
- Setup: Task-weight completion 90%. Order billed 25% after first milestone.
- Observed: E-026. X-016.

### S-027 Internal project never billed

- Kind: counterexample
- Targets: L-001
- Decision state: supported as representable
- Setup: R&D project. No customer. Time and expense post. No invoice.
- Observed: X-001. E-002.

### S-028 Invoice from timesheet, no project

- Kind: counterexample
- Targets: L-001, L-013
- Decision state: supported as ERPNext path
- Setup: Ad-hoc advisory hours. Timesheet to customer. Create Sales Invoice.
- Observed: S-ERPNext-06. X-002.

### S-029 Sales order with no project, service billed by quantity

- Kind: counterexample
- Targets: L-001
- Decision state: supported as representable
- Setup: Training package sold as qty 1 service item. Invoice full qty. No project, no timesheet.
- Observed: E-004 says sales order is optional and invoice can be created directly, at the cost of billing-progress tracking.

### S-030 Dynamics project without a project contract

- Kind: counterexample
- Targets: L-001, L-002
- Decision state: supported as a product rule
- Setup: User tries to invoice a Dynamics project that has no project contract.
- Observed: Every invoiced project must associate to a project contract. E-025.
- Attack: This is a source-system requirement. ERPNext and Odoo do not share it. Do not promote it to a law.

### S-031 Late timesheet after milestone already billed

- Kind: counterexample
- Targets: L-009, L-015, L-014
- Decision state: hypothesis
- Setup: Fixed-price milestone 50% invoiced. A worker then posts 12 hours into the already billed phase.
- Attack: Under fixed price those hours change cost, not sales. Under T&M they would change billable quantity. The same observation has different commercial effects by billing method.

### S-032 Overlapping time intervals for one worker

- Kind: counterexample
- Targets: L-007
- Decision state: hypothesis
- Setup: Worker posts 09:00-12:00 on Task A and 11:00-14:00 on Task B.
- Attack: Effort totals 6 if summed, calendar overlap is 1 hour. Utilization and payroll disagree.
- Related: issue #28. Moqui says hours plus break should match from-to on one entry. It does not, on the opened page, forbid overlap across entries.

### S-033 Stale assignment after worker leaves

- Kind: counterexample
- Targets: L-006
- Decision state: hypothesis
- Setup: Assignment still Assigned. Employment ended yesterday. Worker posts time today.
- Attack: Assignment validity versus employment validity. Cross-link #28. Do not solve employment here.

### S-034 Capacity ignored, three projects assigned at 100%

- Kind: counterexample
- Targets: none in this folder
- Decision state: undetermined
- Setup: One person assigned full time to three in-progress projects next week.
- Attack: This is a planning and capacity question. Issue #24 owns it. Recorded here so project research does not invent a capacity primitive.

### S-035 Fee-only billing with no time

- Kind: counterexample
- Targets: L-009
- Decision state: hypothesis
- Setup: Dynamics Fee transaction class. Revenue with no cost observation.
- Observed: Fee is revenue-only. S-D365-01.
- Attack: Not every billable amount is a work event. Strengthens the billable-event-versus-claim fork.

### S-036 Multicustomer split invoice

- Kind: counterexample
- Targets: L-002, L-013
- Decision state: undetermined
- Setup: City 60% and school district 40% on one project contract.
- Observed: Dynamics multicustomer deals. S-D365-01.
- Attack: One body of work. Two claims. Engagement still not required as a type.

---

## Coverage of the issue deliverable list

| Requested scenario family | Cards |
| --- | --- |
| Scope change | S-001, S-002 |
| Partial acceptance | S-003, S-017, S-023 |
| Overrun | S-005, S-006, S-007, S-031 |
| Reassignment | S-008, S-009, S-010, S-033 |
| Retroactive time correction | S-011, S-012, S-013 |
| Milestone billing | S-004, S-017, S-018, S-019, S-026, S-031 |
| Mixed product and service | S-020, S-021, S-022 |
