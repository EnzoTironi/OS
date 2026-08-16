---
issue: 28
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Labeled blocks for issue 28. Each block names its kind. Inference is marked. Source names stay in the source's vocabulary.

## E1. Frappe HR defines Employee as a person under a contract, then stores the file as one master

**Kind.** Domain evidence plus source-system artifact.

Frappe HR defines Employee as an individual who works part-time or full-time under a contract of employment and has recognized rights and duties of the company. The master holds name, birth date, joining date, employment type, department, grade, designation, branch, reports-to, leave policy, holiday list, salary payment mode, contacts, education, prior work, and exit. User creation is optional. Create User Permission, on by default, limits the new User to that Employee record and company.

**Source artifact.** Employee DocType. Employment Type as Intern, Contract, Full-time, Part-time, Probation, or a custom name. History in the Company table.

**Inference.** The product definition already splits person and contract. The stored object collapses them.

**Fetched.** https://docs.frappe.io/hr/employee and https://docs.frappe.io/hr/employment-type

## E2. Left closes later use and does not delete the person file

**Kind.** Domain evidence.

When Employee status is Left, Relieving Date is mandatory. The docs say that master is no longer accessible in further transactions. Exit fields include resignation, exit interview, and leave encashment. The record remains.

**Runtime consequence.** Termination must stop new operational use without erasing historical slips, attendance, and leave. See S-HR-009.

**Fetched.** https://docs.frappe.io/hr/employee

## E3. Promotion mutates Employee properties and keeps a history table

**Kind.** Domain evidence plus source-system artifact.

Promotion is a process that gives a higher share of duties, a higher pay-scale, or both. The document records Promotion Date and a table of Property, Current value, and New value. It can be submitted on or after that date. Submission applies the new values to Employee. Frappe HR also keeps promotions in the Employment History table on Employee.

**Inference.** The product treats promotion as an action on the personnel file, not as a new Employment object. History is a child table, not an independent employment identity.

**Fetched.** https://docs.frappe.io/hr/employee-promotion

## E4. Transfer can either mutate one Employee or relieve one and create another

**Kind.** Domain evidence. Strong.

Transfer is internal mobility to another job, usually at a different location, department, or unit. The document records Transfer Date, optional New Company, and a property-change table. If Create New Employee ID is checked, a new Employee is created with the new properties and the old Employee is marked relieved. Leave allocations for the new Employee must be created manually.

**Counterexample pressure.** One person can receive a second Employee identifier inside the same product when the company changes. That is a source-system identity split, not proof that the person changed. See S-HR-003 and S-HR-008.

**Fetched.** https://docs.frappe.io/hr/employee-transfer

## E5. Separation is a checklist project, not the end of employment meaning

**Kind.** Domain evidence plus source-system artifact.

Employee Separation is the situation when the service agreement ends and the person leaves. The document tracks activities such as collect laptop, clear dues, delete email, collect identity card. Submission creates a Project and Tasks. Status becomes Completed when activities finish. The Employee can be opened from the separation form.

**Inference.** Offboarding work is a process instance. It is not the same object as Employment ending.

**Fetched.** https://docs.frappe.io/hr/employee-separation

## E6. Attendance is a day-status fact, not a check-in event

**Kind.** Domain evidence.

Attendance is a record stating whether an Employee has been present on a particular day. Status is Present, Absent, On Leave, or Half Day. Attendance cannot be marked for future dates. Auto Attendance can derive the day-status from check-in and check-out logs.

**Source artifact.** Attendance doctype. Employee Attendance Tool. Upload Attendance. Shift Type.

**Fetched.** https://docs.frappe.io/hr/attendance

## E7. Leave is allocation plus application plus ledger, and payroll can freeze it

**Kind.** Domain evidence.

Leave Type, Leave Period, Leave Policy, Leave Policy Assignment, and Leave Allocation decide what can be taken. Leave Application is the request. Approvers can sit on Department or on Employee. Employee-level wins when both exist. Application period must sit inside one Leave Allocation period. Application cannot be submitted if salary is already processed for that leave period. Compensatory Leave Request, Leave Encashment, Leave Block List, and Leave Ledger Entry are separate documents.

**Runtime consequence.** Requested leave is not taken leave. A processed payroll period is a freeze for later leave submission. See S-HR-004.

**Fetched.** https://docs.frappe.io/hr/leaves and https://docs.frappe.io/hr/leave-application

## E8. Compensation is structure, assignment, additional item, then slip

**Kind.** Domain evidence.

Salary Component is an earning or deduction with formula, LWP flag, tax flag, payable flag, and optional flexible-benefit rules. Salary Structure groups components and frequency. Docs say only one Salary Structure can be Active for an Employee during any period. Salary Structure Assignment sets the structure, From Date, base, and variable for that person. Additional Salary adds or deducts an ad hoc amount on a Payroll Date, including arrears. Recurring Additional Salary repeats between From Date and To Date.

**Source artifact.** Condition and formula language. Overwrite Salary Structure Amount. Deduct Full Tax on Selected Payroll Date.

**Fetched.** https://docs.frappe.io/hr/payroll-setup, https://docs.frappe.io/hr/salary-structure, https://docs.frappe.io/hr/salary-structure-assignment, https://docs.frappe.io/hr/additional-salary

## E9. Payroll period, payroll entry, salary slip, and bank entry are different objects

**Kind.** Domain evidence.

Payroll Period is the span for which people get paid and the span that holds tax slabs. It is optional if flexible benefits and tax slabs are unused. Payroll Entry selects company and filters, then creates Salary Slips. Submitting slips books a default Payroll Payable accrual. Make Bank Entry builds a Journal Entry that combines salaries so individual pay is not visible on the company books.

**Boundary.** Accrual and journal posting belong to issue 21. The bank payment belongs to issue 22. This folder keeps the HR objects that force those later postings.

**Fetched.** https://docs.frappe.io/hr/payroll-setup and https://docs.frappe.io/hr/payroll-period

## E10. LWP and timesheet change how a slip is computed, not what employment is

**Kind.** Domain evidence.

Leave Without Pay prorates a component by LWP days over working days from the Holiday List, if the component has Apply LWP. Salary Slip based on Timesheet adds a component from hours and hour rate. Flexible benefits can pay pro-rata or on claim. Some benefits have tax impact without a claim.

**Fetched.** https://docs.frappe.io/hr/payroll-setup

## E11. Odoo pays from a running contract, not from the employee file alone

**Kind.** Domain evidence. Strong.

Odoo docs say every employee must have a running contract to be paid. The contract holds start date, optional end date, working schedule, work-entry source, salary structure type, department, job position, contract type, and wage. Work-entry source is Working Schedule, Attendances, or Planning. Contract status groupings are New, Running, Expired, and Cancelled. Wage type is Fixed Wage or Hourly Wage.

**Source artifact.** `hr.contract` as a product object. Salary Configurator and Sign modules for offers.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/payroll/contracts.html and https://www.odoo.com/documentation/18.0/applications/hr/payroll.html

## E12. Odoo work entries are the payroll input, and conflicts must be resolved first

**Kind.** Domain evidence.

A work entry is an individual record of work or time off. Payroll creates them from the contract and from Planning, Attendances, or Time Off. Conflicts, often a time-off request overlapping a generated work day, must be resolved before payslips. Regenerating work entries overwrites the old ones after the source app is fixed. Time off after a validated payslip is deferred to the next period so the slip is not cancelled.

**Source artifact.** Work Entry Type with payroll code. Unpaid-in-structure-types. Rounding.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/payroll/work_entries.html and https://www.odoo.com/documentation/18.0/applications/hr/payroll.html

## E13. Odoo archives the employee and keeps the file

**Kind.** Domain evidence.

Offboarding is an activity plan. Archiving is a later step. Employee Termination records departure reason, contract end date, and which open activities to close. Reasons include Fired, Resigned, Resigned Retired, Became Freelance, and Mutual Agreement. The record becomes Archived and stays searchable under that filter. HR documents can be sent to a private email. Presence on the dashboard is not the same as employment.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/employees/offboarding.html and https://www.odoo.com/documentation/18.0/applications/hr/employees.html

## E14. Odoo presence, working hours, and self-edit are not employment

**Kind.** Source-system artifact plus domain evidence.

Presence can be computed from attendances, login, email volume, or IP. Remote Work paints a location icon on the card. Employee Editing lets people change their own file. These are operational signals and permission flags. They do not create or end a contract.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/employees.html

## E15. W3C ORG splits memberOf, Membership, Role, and Post

**Kind.** Domain evidence. Strong.

The simplest ORG statement is that an Agent is `org:memberOf` an Organization. `org:headOf` is a built-in specialization. For annotated membership, ORG uses `org:Membership`, an n-ary relationship that can carry duration, salary, and a reference to an employment contract. `org:Role` is the abstract function. `org:Post` is a position that may be vacant. A Post can exist without a holder. A Membership does not exist unless there is an Agent. Posts can report to Posts. A Post can be held by more than one person and can be treated as an organization.

**Fetched.** https://www.w3.org/TR/vocab-org/

## E16. UFO and gUFO treat Employment as a relator and Employee as a role

**Kind.** Domain evidence.

UFO 2021 uses Giovanni's employment at the UN as a relator example. Employee is a role of a person in the scope of that relator. gUFO says a Relator connects two or more concrete individuals. The published example is Mary's employment contract at NASA. The pattern introduces Employment as a Relator, Employee as a role of Person, Employer as a role of Organization, and mediation properties with begin and end.

**Boundary.** This is a foundational-ontology claim. It does not by itself make Relator an OS kernel primitive. Issue 3 owns that fork.

**Fetched.** https://nemo.inf.ufes.br/wp-content/uploads/ufo_unified_foundational_ontology_2021.pdf and https://nemo-ufes.github.io/gufo/

## E17. FIBO Employee is a role, Employment is a dated situation, contractors are out

**Kind.** Domain evidence. Strong.

FIBO Formal Organizations RDF defines employee as a person in the service of another under any contract of hire, express or implied, oral or written, where the employer has the right to control and direct that person in the material details of how the work is performed. Employer is a party that provides compensation and has that same control right. Employment is a situation representing the state of being employed, the relationship that holds between an employer and employee for some period of time. The note says this definition does not include workers in contingent arrangements such as independent contractors, leased employees, temporary employees, and on-call workers who do not have a direct contractual relationship with the employer. Employment is evidenced by an implicit or explicit contract. The employer is typically a legal person, usually a formal organization. The employee is typically a legally capable natural person.

**Source artifact.** Properties `employs`, `has employed party`, `has employee`, `has employing party`, `is employed by`, `is employed in`, `is employee of`, `is employing party`.

**Fetched.** https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/Organizations/FormalOrganizations.rdf

## E18. schema.org EmployeeRole is a dated role with salary, not a Person subtype

**Kind.** Domain evidence.

EmployeeRole is a subclass of OrganizationRole. It adds `baseSalary` and `salaryCurrency`. From Role it inherits `startDate`, `endDate`, and `roleName`. The enduring person is not this type.

**Fetched.** https://schema.org/EmployeeRole

## E19. HR-XML says distinguish party attributes from relationship attributes

**Kind.** Domain evidence. Strong.

HR-XML EmploymentBaseType says employment is a contract of hire, express or implied, between a person and another party, where that party has the power or right to control and direct the employee in the material details of how the work is performed. Employment is a type of relationship between two parties. It is important to distinguish the attributes of the parties from the attributes of the party relationship. Relationship attributes include expected hire date, hire date, periods of leave, and termination date. A period of employment generally repeats if the person is rehired after a prior termination, or becomes an employee of a new related employer after acquisition or reorganization.

**Fetched.** https://schemas.liquid-technologies.com/HR-XML/3.0/employmentbasetype.html

## E20. ValueFlows models work as an event by a Person agent, not as an Employee kind

**Kind.** Domain evidence.

ValueFlows Agent is a Person, Organization, or Ecological Agent. The `work` action is labor applied to a process. There is generally no identifiable resource, only the provider agent. The type of work can be a resource specification. The spec says they do not consider the person a resource. Effort quantity does not change inventoried resources. Exchange of work can sit in an agreement with a reciprocal flow.

**Inference.** ValueFlows can record labor without an Employment object. That is a counterexample to "every work event requires an Employment relator," not a proof that employment is unnecessary for payroll and labor law.

**Fetched.** https://www.valueflo.ws/concepts/actions/ and https://www.valueflo.ws/concepts/agents/

## E21. Seed scenario S-006 already demands an employment with lifecycle

**Kind.** Counterexample pressure from the repo.

`scenarios/README.md` S-006 has Person P work for Organization O from January to July, change position in March, change compensation in May, suspend briefly, then leave. The questions are whether `worksFor` is enough, whether Employment needs identity and actions, whether Promote, Suspend, and Terminate target the relationship, and how history is kept without mutating away prior periods.

**Fetched.** `scenarios/README.md` on `origin/main`

## E22. RFC-0001 already uses employment as the relator example and is not edited

**Kind.** Candidate law already on the table, still a hypothesis.

RFC-0001 says a Person employedBy Organization link may be insufficient when employment has start and end dates, compensation, position, suspension, and termination. Person to Employment to Organization may better reflect the domain. Whether Relator is a native category remains an open question in that RFC.

**Fetched.** `rfcs/0001-metamodel-hypothesis.md`. Not modified.

## E23. Party issue 14 already rejects commercial labels as kinds

**Kind.** Sibling hypothesis, not this issue's proof.

Party L1 is `supported` that Customer and Supplier are not kinds. Party L9 is `hypothesis` that Employee is a role even when products store a personnel file. Party L3 is `hypothesis` that a role is founded by a relationship. Party L4 is `supported` for the threshold that a relationship earns identity when it bears terms, actions, or validity, and `undetermined` for a native Relator sort.

**Fetched.** `git show origin/cursor/issue-14-domain-cfd8:research/domain/party/candidate-laws.md`

## E24. Frappe User permission and Odoo Employee Editing are not organizational roles

**Kind.** Source-system artifact.

Frappe can create a User from Employee and restrict that User to the own Employee record. Leave Application can use Employee ID as a match rule so people file their own leave. Odoo Employee Editing lets people edit their own file. These are account grants. They are not the same as holding a Post such as Head of Finance.

**Boundary.** Issue 11 owns Principal and grants. This folder only records that products already split login from the personnel file, and that they also have a weaker "own record" grant.

**Fetched.** https://docs.frappe.io/hr/employee, https://docs.frappe.io/hr/leave-application, https://www.odoo.com/documentation/18.0/applications/hr/employees.html

## E25. Part-time in Odoo fills a full-time calendar with unpaid work entries

**Kind.** Domain evidence plus source-system artifact.

A 20-hour contract against a 40-hour standard calendar generates 20 hours of Attendance and 20 hours of Unpaid. The unpaid fill is a payroll convention so the week still totals the company calendar. It is not a second employment.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/payroll/contracts.html

## E26. Time off types in Odoo create work entries. Leave in Frappe can block slip submission

**Kind.** Domain evidence.

Odoo Time Off types can select a Work Entry Type so approved time off becomes payroll input. Frappe Leave Application cannot be submitted if salary is already processed for the leave period. The two products freeze the opposite end of the same collision. Odoo defers late time off to the next period. Frappe refuses the late application.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/time_off.html and https://docs.frappe.io/hr/leave-application
