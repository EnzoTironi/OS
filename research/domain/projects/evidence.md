# Evidence for projects and professional services

- Artifact ID: `issue-0029-projects-evidence`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Kind: domain evidence and source-system artifact, mixed per card
- Decision states present: `hypothesis`, `supported`, `undetermined`

Each card states Kind and Decision state. Source-system names stay in the source-specific form. Domain claims stay in the domain distinction.

Citations use source IDs from `sources.md`.

---

### E-001 Project is a hub for work, time, cost, and billing

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: mature ERPs treat a project as a container that gathers tasks, time, expenses, and billing, not as the commercial offer itself
- Citation: S-ERPNext-01; S-Odoo-01; S-Moqui-01
- Observation: ERPNext says projects are a central point for tasks, timesheets, expenses, and billing. Odoo Project schedules tasks, assigns work, and tracks profitability. Moqui uses one WorkEffort model typed as Project, Milestone, or Task.
- Limits: hub language is product architecture. It does not prove project is a single ontological kind.
- Decision state: supported

### E-002 Project can link to a customer and a sales order without being that order

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: execution tracking and commercial commitment can be related and still remain distinct records
- Citation: S-ERPNext-02
- Observation: ERPNext Project may name a Customer and fetch a Sales Order so execution can be tracked against agreed scope. Total Sales Amount comes from the sales order. Total Billed Amount comes from invoices against that order. Total Costing Amount and Total Billable Amount come from timesheets.
- Limits: the link is optional. Internal projects exist.
- Decision state: supported

### E-003 Dynamics names work entities and billing entities as different things

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: work to deliver and the instrument that bills that work are different kinds
- Citation: S-D365-01; S-D365-02
- Observation: "Projects and tasks represent work entities. Contract lines represent billing entities." A contract line holds estimate and billing for components of work on an engagement. A project contract is built on a sales order but must not be used interchangeably with one.
- Limits: "engagement" appears as prose around the contract line, not as a defined type on the page.
- Decision state: supported for the work-versus-billing split. undetermined for engagement as its own identity.

### E-004 Service sale skips stock delivery and still needs a commitment if billing progress matters

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: service fulfillment is not inventory movement
- Citation: S-ERPNext-05
- Observation: For consulting and project businesses that do not deliver stocked goods, the documented flow is Quotation optional, Sales Order optional, Sales Invoice by milestone, time, or quantity, then Payment. A Delivery Note is normally unnecessary for a non-stock service. Skipping the sales order removes a central record of committed quantity and billing progress. Creating an invoice with no linked order does not update order billing progress.
- Limits: one product family's recommended workflow.
- Decision state: supported

### E-005 Invoice records billing, not acceptance

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: posting a customer invoice does not by itself mean the customer accepted the work
- Citation: S-ERPNext-05
- Observation: "A Sales Invoice proves billing, not acceptance of work, unless your process captures approval separately."
- Limits: the page does not define an Acceptance document.
- Decision state: supported as ERPNext's stated distinction. undetermined as a universal first-class type.

### E-006 Milestone billing can be a fraction of a committed service quantity

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: at least one mature system bills milestones by invoicing decimal quantity against one service item whose rate is the full contract value
- Citation: S-ERPNext-05
- Observation: Use one service item with quantity `1.000`. Invoice `0.250`, `0.500`, and `0.250` across three invoices. Keep the rate equal to the full contract value. The decimal quantities track the billed portion of the sales order.
- Limits: this is an ERPNext quantity trick, not a domain type named Milestone.
- Decision state: supported as source artifact

### E-007 Odoo milestone is a sales-order object marked Reached

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: Odoo treats a milestone as a billing and progress object on the sales order, not only as a task flag
- Citation: S-Odoo-06
- Observation: Service products can use invoicing policy Based on Milestones. After confirm, a Milestones page holds name, sales order item, and deadline. Checking Reached fills Delivered on the order line. Create Invoice drafts a customer invoice that shows only the reached milestone.
- Limits: Reached is a user checkbox. The page does not say the customer signed acceptance.
- Decision state: supported as source artifact

### E-008 ERPNext can flag a task as a milestone

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: ERPNext can treat milestone as a property of a task
- Citation: S-ERPNext-03
- Observation: Task has `Is Milestone`. Dependent tasks block completion of a later task. Actual start and end come from timesheets.
- Limits: billing is not defined on the task page.
- Decision state: supported as source artifact

### E-009 Moqui milestone is a typed work effort associated to tasks, not their parent

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: a milestone can be a peer associated to many tasks over time
- Citation: S-Moqui-01; S-Moqui-02
- Observation: WorkEffort types include Project, Milestone, and Task. Hierarchy uses root and parent. Milestones associate to tasks through WorkEffortAssoc type Milestone and are not a parent work effort, because a task may associate with multiple milestones over time for history and forward planning.
- Limits: book examples show create services. Behavior is documented. Implementation is not reused.
- Decision state: supported as source artifact

### E-010 Task is an actionable unit under a project

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: project scope is commonly decomposed into actionable work items
- Citation: S-ERPNext-02; S-ERPNext-03; S-Odoo-01; S-Moqui-01
- Observation: ERPNext says a project has broad scope and is divided into tasks. A task is an actionable unit. Odoo breaks projects into tasks. Moqui tasks are WorkEffort records under a project root, with optional parent for subtasks.
- Limits: naming differs. Group task, subtask, and purpose enumerations are local.
- Decision state: supported

### E-011 Successor work can wait on predecessor completion or cancellation

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: some work is not allowed to start until other work reaches a terminal status
- Citation: S-Odoo-04; S-ERPNext-03; S-Moqui-01
- Observation: Odoo successor tasks get Waiting and cannot move to In Progress until predecessors are Approved, Cancelled, or Done. ERPNext dependent tasks cannot complete before the latter completes. Moqui associations include Depends On.
- Limits: Odoo treats Cancelled as releasing the successor. ERPNext text stresses completion, not cancel-as-release.
- Decision state: supported for the existence of blocking. undetermined for cancel-as-release as a law.

### E-012 Assignment is a party-to-work relationship with status

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: who works a task is not a static field. It has offer, assign, decline, and unassign
- Citation: S-Moqui-01; S-ERPNext-02
- Observation: Moqui WorkEffortParty has status Offered, Assigned, Declined, Unassigned; availability; expectation; and delegation reasons such as Need Support, My Part Finished, Completely Finished. Roles include Manager and Worker. ERPNext allows assignment at task or project level.
- Limits: Odoo 18 project landing page does not specify assignment status. Employee appears on timesheet lines in S-Odoo-05.
- Decision state: supported for Moqui. hypothesis as a required OS relator.

### E-013 Observed hours, billable hours, and billed hours are different quantities

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: time worked, time the customer may be charged, and time already invoiced must not collapse to one number
- Citation: S-ERPNext-04; S-ERPNext-06
- Observation: A timesheet row has hours, a Bill flag, billing hours, billing rate, costing rate, billing amount, and costing amount. After submit, rates lock. After a sales invoice, Total Billed Hours, Total Billed Amount, and % Amount Billed update on the timesheet.
- Limits: how billing hours default from hours is not fully specified on the page.
- Decision state: supported

### E-014 Client rate and vendor rate can both attach to one time entry

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: the price a client pays and the cost paid to a worker can be two rates on the same observed time
- Citation: S-Moqui-01
- Observation: Rate lookup may run twice, once for Client rate and once for Vendor rate. After billing, the time entry references the vendor-to-client invoice item and the worker-to-vendor invoice item. Populated invoice references mean the time entry has been billed.
- Limits: this models a staffing or subcontracting chain. A single-company T&M shop may only need one sales rate plus a cost rate.
- Decision state: supported as a real pattern. undetermined as a required primitive.

### E-015 Timesheet approval is a gate before billing in Moqui

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: a timesheet can have a lifecycle separate from each time entry
- Citation: S-Moqui-01
- Observation: A timesheet covers a date range, a worker party, and a client party. Status is typically In-Process, Completed, or Approved for billing.
- Limits: ERPNext uses submit on the timesheet document. Odoo expense reports have manager approve. Timesheet approval in Odoo 18 was not pinned on a first-party page this session.
- Decision state: supported as source artifact

### E-016 Submitted time locks rates; correction goes through cancel and amend

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: ERPNext treats submitted timesheet rates as locked and uses the generic cancel-then-amend path
- Citation: S-ERPNext-04; S-ERPNext-07
- Observation: After save and submit, billing rate and costing rate cannot be changed. To edit a submitted document, cancel it, then amend, then save and submit. Linked dependents must be cancelled first. Example given is sales order with delivery note and invoice.
- Limits: the amend page is generic. A timesheet-specific correction event is not documented.
- Decision state: supported as source artifact

### E-017 Valueflows treats observed events as immutable and corrections as new events

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: an independent economic model refuses to mutate a reported work event
- Citation: S-VF-01
- Observation: Economic Events describe past flows. They are immutable in accounting practice. A correction is another economic event related by `corrects`, and may carry a negative quantity. Quantity in hours and calendar from-to are different uses of time.
- Limits: Valueflows is a vocabulary, not an ERP. It does not define timesheet UI.
- Decision state: supported as VF law. rejected as "every operational system already does this."

### E-018 T&M couples incurred cost to sales; fixed price does not

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: billing method decides whether more cost creates more customer revenue
- Citation: S-D365-01; S-Odoo-05
- Observation: Dynamics Time and Material is consumption-based. Each incurred cost has corresponding revenue. Not-to-exceed on a T&M contract line caps actual revenue, not estimated revenue. Fixed Price sales values are independent of costs incurred. Odoo says T&M is used when size cannot be estimated or requirements may change, unlike a fixed-price contract where the customer pays a specified total.
- Limits: retainers and hybrids are mentioned in secondary blogs and were not taken as evidence.
- Decision state: supported

### E-019 Confirming a service sales order can create the project and task

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: some products generate work containers from a commercial confirm
- Citation: S-Odoo-05; S-Odoo-06
- Observation: A service product with invoicing policy Based on Timesheets and Create on Order Project & Task creates a project and task when the sales order is confirmed. Hours on the task Timesheets tab appear as Delivered on the order and can be invoiced. Milestone products can create Task, Project, or Project & Task.
- Limits: Create on Order Nothing is allowed. Then a project must be created from the order later.
- Decision state: supported as source artifact

### E-020 Hours on a task can be the delivered quantity of a service line

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: for T&M services, "delivered" is observed work, not a stock move
- Citation: S-Odoo-05; S-Odoo-07
- Observation: Time entered in Hours Spent is reflected as allocated-time percent and as Delivered on the sales order. Invoice what is delivered requires a delivered quantity before invoice. For goods that quantity is a validated delivery. For timesheet services it is recorded hours.
- Limits: Odoo profitability page 404 left margin math undetermined.
- Decision state: supported

### E-021 Expenses and purchases can join the same sales order as time

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: a professional-services order can mix time, expense, and material on one commercial document
- Citation: S-Odoo-05; S-D365-01
- Observation: Odoo can reinvoice an expense by pointing Customer to Reinvoice and Analytic Distribution at the sales order. A purchase can appear on the order when the product is marked Can be Expensed and Re-Invoice Expenses is At cost. Dynamics transaction classes are Time, Expense, Material, and Fee. Fee is revenue-only.
- Limits: product flags are source artifacts. The domain point is mixed economic flows under one deal.
- Decision state: supported

### E-022 ERPNext project cost has several actuals, not one spent field

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: project actual cost is a sum of different event classes
- Citation: S-ERPNext-02
- Observation: Estimated Cost is entered. Total Costing Amount comes from timesheets. Total Expense Claim comes from employee expense claims. Total Purchase Cost comes from purchase invoices against purchase orders for project materials. Total Consumed Material Cost comes from stock entries. Gross margin formulas on the page mix sales, billable, costing, expense, purchase, and consumed material. The printed formula looks internally inconsistent and is treated as a source-system reporting artifact, not a domain law.
- Limits: do not import the printed margin formula.
- Decision state: supported for multiple actual-cost sources. rejected for the printed formula as a candidate law.

### E-023 Valueflows Plan is scheduled work with deliverables, not a claim

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: a body of scheduled work with deliverables is a different kind from a reciprocal claim
- Citation: S-VF-03; S-VF-01
- Observation: Plan is a logical collection of processes that constitute a body of scheduled work with defined deliverable(s). Commitment is a promised future flow. Claim is reciprocity for an event that already occurred, initiated by the receiver. If a commitment already exists, a claim is not needed.
- Limits: VF does not use the word project as a type on these pages.
- Decision state: supported for the plan-versus-claim split. undetermined for whether OS should name Plan or Project.

### E-024 Process is where work happens; work is a flow into that process

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: naming a task "install" does not make install an economic action. The process is install. The flow is work hours in and a service increment out
- Citation: S-VF-02
- Observation: Transformations happen in Processes. Flows say what happens to resources. There would never be a flow action "plant" or "harvest". Planting is a process. Seed quantity decrements. Vegetable quantity increments.
- Limits: ERP task names often are the process. That is a labeling habit, not a counterexample.
- Decision state: hypothesis for professional services. supported inside VF.

### E-025 Every invoiced Dynamics project must associate to a project contract

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: Dynamics requires a contract as the billing authority for an invoiced project
- Citation: S-D365-03
- Observation: Every project that you invoice must be associated with a project contract. Contract settings apply to associated projects and subprojects. Billing rules depend on Time and material or Fixed-price terms. Retention can withhold a percentage until an agreed stage.
- Limits: ERPNext and Odoo can invoice a timesheet or order without a document named Project Contract.
- Decision state: supported as source artifact. This is a main exhibit for the project-versus-contract identity fork.

### E-026 Progress percent of tasks is not billed percent

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: how complete the work is and how much of the order is billed are different projections
- Citation: S-ERPNext-02; S-ERPNext-05; S-Odoo-06
- Observation: ERPNext project percent complete can be Manual, Task Completion, Task Progress, or Task Weight. Billing progress on a service order is invoiced quantity versus ordered quantity. Odoo milestone Reached fills Delivered, which is the billable delivered quantity, not task percent.
- Limits: a company can choose to set them equal by policy.
- Decision state: supported

### E-027 Billable time target is utilization, not a customer price

- Kind: source-system artifact
- Grade: `official-doc`
- Claim supported: "billing rate" is an overloaded phrase
- Citation: S-Odoo-03; S-ERPNext-04
- Observation: Odoo Billing Rate Indicators show logged billable time versus a monthly billable time target, plus total time including internal projects. ERPNext Billing Rate on a timesheet is the customer price per hour.
- Limits: none for the overload. Synthesis must not merge the two senses.
- Decision state: supported

### E-028 Change request is not a first-class type in the pages opened

- Kind: domain evidence
- Grade: `inference`
- Claim supported: none. The absence is the finding.
- Citation: S-ERPNext-02; S-ERPNext-05; S-Odoo-05; S-D365-01
- Observation: Examined first-party pages describe order confirm, project create, time, milestone, and invoice. They do not define a Change Request document that amends scope. Odoo says T&M is used when requirements may change. That is a billing-method comment, not a change-request lifecycle.
- Limits: a DocType or model may exist in source not read this session.
- Decision state: undetermined

### E-029 Engagement is used in Dynamics prose and is not defined as a type on the pages opened

- Kind: domain evidence
- Grade: `official-doc`
- Claim supported: the word engagement appears, but independent sources do not agree it is a third identity beside project and contract
- Citation: S-D365-02
- Observation: Contract lines "hold the estimate and billing agreements for specific components of project work on an engagement." ERPNext and Odoo pages opened this session use Project, Sales Order, and Task. They do not define Engagement.
- Limits: PSA products not examined may treat Engagement as the commercial wrapper.
- Decision state: undetermined
