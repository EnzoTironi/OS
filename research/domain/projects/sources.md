# Sources for projects and professional services

- Artifact ID: `issue-0029-projects-sources`
- Issue: https://github.com/EnzoTironi/OS/issues/29
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Kind: source inventory
- Decision state: supported for locators fetched this session; undetermined for material not opened
- Access date: 2026-08-16

## Question

Which first-party documents can a later synthesis agent cite for project, engagement, contract, scope, work, assignment, time, milestone, and billing distinctions?

## Source scope

Examined official documentation and one first-party book PDF. Did not pin ERPNext, Odoo, or Moqui application source at a commit SHA. Did not wait for corpus PRs on issues #32 to #34. Did not copy sibling domain folders.

Sibling tracks cited by issue number only. Offer, commitment, claim, and settlement belong to #16. Inventory fulfillment belongs to #18. Time entry as employment belongs to #28. Planning and capacity belong to #24.

## Operational systems

### S-ERPNext-01 Project overview

- Publisher: Frappe / ERPNext
- Title: Project Overview
- Version or date: page `updated` 2026-02-26
- Section: Overview, Key Features
- URL: https://docs.frappe.io/erpnext/projects-introduction
- Grade: `official-doc`
- Used for: project as hub for tasks, timesheets, expenses, and billing

### S-ERPNext-02 Project

- Publisher: Frappe / ERPNext
- Title: Project
- Version or date: page `updated` 2026-02-28
- Section: create, customer and sales order, timeline, costing and billing, margin
- URL: https://docs.frappe.io/erpnext/project
- Grade: `official-doc`
- Used for: project linked to customer and sales order; actual dates from timesheets; estimated cost versus billed and costing amounts

### S-ERPNext-03 Task

- Publisher: Frappe / ERPNext
- Title: Tasks
- Version or date: page `updated` 2026-03-02
- Section: create, timeline, dependencies, costing, milestone flag
- URL: https://docs.frappe.io/erpnext/tasks
- Grade: `official-doc`
- Used for: task as actionable unit; parent and dependent tasks; `Is Milestone`; actual dates from timesheets

### S-ERPNext-04 Timesheet

- Publisher: Frappe / ERPNext
- Title: Timesheet
- Version or date: page `updated` 2026-02-26
- Section: create, timer, billing details, lock after submit
- URL: https://docs.frappe.io/erpnext/timesheets
- Grade: `official-doc`
- Used for: hours versus billing hours; billable flag; costing rate versus billing rate; lock after submit; invoice and salary slip from timesheet

### S-ERPNext-05 Service workflow

- Publisher: Frappe / ERPNext
- Title: Accounting Workflows by Business Type
- Version or date: page `updated` 2026-08-15
- Section: Choose your required milestones; Service or project-based sale
- URL: https://docs.frappe.io/erpnext/accounting-workflows-by-business-type
- Grade: `official-doc`
- Used for: quotation, order, delivery, invoice, and payment as different milestones; service sale without delivery note; milestone billing as decimal quantity; invoice is not acceptance

### S-ERPNext-06 Invoice from timesheet

- Publisher: Frappe / ERPNext
- Title: Sales Invoice from Timesheet
- Version or date: page `updated` 2026-02-26
- URL: https://docs.frappe.io/erpnext/sales-invoice-from-timesheet
- Grade: `official-doc`
- Used for: invoice created from submitted timesheet; billed hours and percent billed written back

### S-ERPNext-07 Amend submitted document

- Publisher: Frappe / ERPNext
- Title: Edit Submitted Document
- Version or date: page `updated` 2026-03-04
- URL: https://docs.frappe.io/erpnext/edit-submitted-document
- Grade: `official-doc`
- Used for: cancel then amend; dependents must be cancelled first

### S-Odoo-01 Project

- Publisher: Odoo
- Title: Project
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/services/project.html
- Grade: `official-doc`
- Used for: project as schedule, assignment, and profitability container
- Limits: landing page is thin; detail lives on child pages

### S-Odoo-02 Timesheets

- Publisher: Odoo
- Title: Timesheets
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/services/timesheets.html
- Grade: `official-doc`
- Used for: timesheet app index; billing-rate child page

### S-Odoo-03 Billing rate targets

- Publisher: Odoo
- Title: Timesheet billing rates and leaderboard
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/services/timesheets/billing_rates.html
- Grade: `official-doc`
- Used for: employee billable-time targets; billable time versus total time
- Note: here "billing rate" means utilization target, not the price charged to a customer

### S-Odoo-04 Task dependencies

- Publisher: Odoo
- Title: Task dependencies
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/services/project/tasks/task_dependencies.html
- Grade: `official-doc`
- Used for: successor Waiting until predecessor Approved, Cancelled, or Done

### S-Odoo-05 Time and materials

- Publisher: Odoo
- Title: Invoicing based on time and materials
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/sales/sales/invoicing/time_materials.html
- Grade: `official-doc`
- Used for: T&M versus fixed-price; service product invoicing policy Based on Timesheets; Create on Order Project & Task; expenses and purchases reinvoiced on the sales order

### S-Odoo-06 Milestone invoice

- Publisher: Odoo
- Title: Invoice project milestones
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/sales/sales/invoicing/milestone.html
- Grade: `official-doc`
- Used for: milestone as sales-order billing object; Reached checkbox fills Delivered; invoice line is the reached milestone

### S-Odoo-07 Invoicing policy

- Publisher: Odoo
- Title: Invoicing policies
- Version: Odoo 18.0 documentation
- URL: https://www.odoo.com/documentation/18.0/applications/sales/sales/invoicing/invoicing_policy.html
- Grade: `official-doc`
- Used for: invoice ordered quantity versus delivered quantity; delivered quantity can be stock or service progress

### S-Moqui-01 Work effort

- Publisher: Moqui / Mantle
- Title: Work Effort
- Version: Mantle Structure and UDM wiki page, fetched 2026-08-16
- URL: https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Work+Effort
- Grade: `official-doc`
- Used for: WorkEffort types Project, Milestone, Task; hierarchy; association types; party assignment lifecycle; dual client and vendor rates; timesheet approval; billed when invoice item is referenced

### S-Moqui-02 Making Apps with Moqui

- Publisher: Moqui
- Title: Making Apps with Moqui
- Version: 1.0 PDF
- Section: Project and Milestone; Tasks and Time Entries
- URL: https://www.moqui.org/MakingAppsWithMoqui-1.0.pdf
- Grade: `official-doc`
- Used for: create project with CustomerBillTo and VendorBillFrom; milestone as type plus association, not parent; remaining work time after time entry
- Licensing: extracted behavior only. No XML, service names, or implementation copied into OS.

### S-Moqui-03 TimeEntry EECA

- Publisher: Moqui
- Title: Entity ECA Rules
- Version: framework wiki, fetched 2026-08-16
- URL: https://www.moqui.org/m/docs/framework/Data+and+Resources/Entity+ECA+Rules
- Grade: `official-doc`
- Used for: TimeEntry create, update, or delete updates task totals
- Licensing: described the trigger, not the rule XML

### S-D365-01 Project contract concepts

- Publisher: Microsoft
- Title: Concepts unique to Project-based Contracts
- Version: page `ms.date` 2026-02-25, `updated_at` 2026-07-14
- URL: https://learn.microsoft.com/en-us/dynamics365/project-operations/sales/contracts-key-concepts
- Grade: `official-doc`
- Used for: work entities versus billing entities; Time and Material versus Fixed Price; not-to-exceed; transaction classes Time, Expense, Material, Fee; contract is not interchangeable with a sales order

### S-D365-02 Contract lines

- Publisher: Microsoft
- Title: Project contract lines overview
- Version: fetched 2026-08-16
- URL: https://learn.microsoft.com/en-us/dynamics365/project-operations/pro/sales/manage-contract-values-project-based-sales
- Grade: `official-doc`
- Used for: contract line holds estimate and billing for components of work on an engagement; contracted amount is agreed invoice value on fixed price and estimate on T&M

### S-D365-03 Project contracts

- Publisher: Microsoft
- Title: Project contracts
- Version: fetched 2026-08-16
- URL: https://learn.microsoft.com/en-us/dynamics365/project-operations/prod-pma/project-contracts
- Grade: `official-doc`
- Used for: every invoiced project must associate to a project contract; billing rules; retention

## Formal and economic models

### S-VF-01 Flows

- Publisher: Valueflows
- Title: Flows
- Version: site fetched 2026-08-16
- URL: https://www.valueflo.ws/concepts/flows/
- Grade: `official-doc`
- Used for: Intent, Commitment, Economic Event, Claim; work quantity versus calendar interval; events immutable and corrected by another event

### S-VF-02 Processes

- Publisher: Valueflows
- Title: Processes
- Version: site fetched 2026-08-16
- URL: https://www.valueflo.ws/concepts/processes/
- Grade: `official-doc`
- Used for: process transforms inputs to outputs; work is an input flow, not the process name

### S-VF-03 Spec

- Publisher: Valueflows
- Title: vfspec
- Version: site fetched 2026-08-16
- Sections: Claim, Commitment, Plan, Process
- URL: https://www.valueflo.ws/specification/vfspec/
- Grade: `official-doc`
- Used for: Plan as scheduled work with defined deliverable(s); Claim as reciprocity for an event that already occurred

## Failed or skipped fetches

### S-FAIL-01 Odoo project profitability

- URL attempted: https://www.odoo.com/documentation/18.0/applications/services/project/profitability.html
- Result: HTTP 404
- Consequence: profitability-matrix cells that need that page are `undetermined`

### S-FAIL-02 Valueflows core introduction

- URL attempted: https://www.valueflo.ws/introduction/core/
- Result: fetch timeout
- Consequence: used Flows, Processes, and vfspec instead

## Material not examined

- ERPNext, Odoo, and Moqui application source at a commit SHA
- Odoo 19 pages
- SAP Project System in first-party depth
- Kantata, FinancialForce, and other PSA products
- Forum posts as evidence of product law. One ERPNext forum thread was seen and not used as a citation.
- Sibling research files on other issue branches. Those folders were not copied here.

## Licensing

OS is MIT. This note extracts concepts and published behavior. It does not paste or translate copyleft implementation.
