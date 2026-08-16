---
issue: 28
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Employment lifecycle

This is an explanation of the phases the sources force, not a target schema. Names below are research labels. They are not OS types.

Kind of each phase note is marked. Decision state is never `accepted`.

## Two clocks

Constitution rule 10 and open question 7 ask for valid time and known time. HR sources already split them in practice.

**Valid time.** When the person was employed, assigned, on leave, or paid in the modeled world. Hire date, transfer date, promotion date, contract start, relieving date, payroll start and end.

**Known time.** When the system recorded or approved the fact. Leave posting date. Payslip validation date. Deferred time off after a validated slip. Additional Salary created after the period it corrects.

A backdated promotion submitted after the promotion date is one action with two clocks. See S-HR-024.

**Kind.** Domain evidence. **Decision state.** `supported` that both clocks appear. `undetermined` whether they become native primitives. Issue 7 owns that fork.

## Phase cards

### Hire

A Person becomes employed by an Organization for a period. FIBO and HR-XML require a contract of hire, express or implied, and a control test. Frappe writes Date of Joining on Employee and optional Offer Date. Odoo requires a Contract in Running before pay.

**Kind.** Domain evidence.

**Source artifact.** Frappe Employee. Odoo Contract status New then Running.

**Runtime consequence.** Hire is an action. It does not prove the first attendance day happened.

### Confirm or start of regular terms

Frappe has Confirmation Date as a field on Employee. Odoo has no separate confirmation object in the pages read.

**Kind.** Source-system artifact. **Decision state.** `undetermined` whether confirmation is a phase of Employment or a new assignment.

### Assign to unit, post, and manager

Frappe writes Department, Designation, Grade, Branch, and Reports to on Employee. Promotion and Transfer later overwrite those fields and keep a history table. W3C ORG would assign a Person to a Post or record a Membership with a Role. A Post can stay vacant.

**Kind.** Domain evidence for the need. Source-system artifact for storing it on the person.

**Runtime consequence.** Queries of the form "who holds Head of Sales" must survive a vacant post. Person-to-person Reports to cannot.

### Bind compensation

Frappe assigns a Salary Structure with a From Date and a base. Only one structure is Active per person per period. Odoo puts wage and structure type on the Contract. Changing pay without a new assignment or contract would hide valid time.

**Kind.** Domain evidence.

### Attend and enter time

Check-in is an event. Attendance day-status is a fact derived from check-ins, shifts, holidays, and leave. Odoo work entries are the payroll atom and can come from schedule, attendance, or planning. ValueFlows `work` is an economic event with effort quantity.

**Kind.** Domain evidence.

**Runtime consequence.** Do not store "hours worked" only as a mutable field on Employee.

### Request, allocate, and take leave

Policy and allocation create a balance. Application is a request. Approval is a decision. Taken leave becomes day-status or a work entry. Encashment converts unused leave to a pay component. Frappe freezes new applications after salary is processed for that period. Odoo defers late approved time off to the next period.

**Kind.** Domain evidence.

### Run a payroll period

A period is a window. A batch selects who is in scope. A result, Salary Slip or payslip, is computed from the active compensation binding plus time facts plus additional items. Accrual posting is issue 21. Payment is issue 22.

**Kind.** Domain evidence.

### Correct after the fact

Frappe Additional Salary can carry arrears on a later Payroll Date. Recurring additional items have their own From Date and To Date. Odoo deferred time off is a correction that lands in the next period rather than rewriting a validated slip.

**Kind.** Domain evidence.

**Runtime consequence.** A correction is a new fact with its own known time. It is not a silent edit of the old result unless a named reversal exists. See S-HR-005.

### Promote

Frappe Promotion is a dated property-change document that then mutates Employee and appends Employment History. Compensation change needs a new Salary Structure Assignment. Formal sources would end or version an assignment to a Post and maybe keep the same Employment.

**Kind.** Domain evidence plus source-system artifact.

**Decision state.** `hypothesis` that Promote targets assignment, not Person.

### Transfer

Same-company transfer changes unit or site on one employment. Cross-company transfer may be a new employment with a related employer. Frappe can mint a new Employee ID and mark the old one relieved. HR-XML treats rehire and acquisition as a new employment period.

**Kind.** Domain evidence.

**Decision state.** `supported` that these are different actions. `undetermined` how many Employment objects a legal-entity change requires.

### Suspend

S-006 asks for brief suspension. No first-party Frappe or Odoo page fetched this session names a Suspend Employment document. Leave without pay can look like suspension in payroll and is not the same legal act.

**Kind.** Gap. **Decision state.** `undetermined`.

### Terminate

Frappe sets Left and Relieving Date, then blocks later transactions. Separation is a parallel offboarding project. Odoo launches an offboarding plan, then archives with a departure reason and contract end date. FIBO and HR-XML keep the ended period.

**Kind.** Domain evidence.

**Runtime consequence.** Terminate Employment must not destroy Person, historical results, or the ended relationship. See S-HR-009.

### Rehire

HR-XML says a period of employment generally repeats after a prior termination. Frappe would create a new Employee or reopen a file. The pages read do not specify which. Odoo would need a new running contract.

**Kind.** Domain evidence from HR-XML. Product behavior `undetermined`.

## What the current projection is

At any known time the system can answer:

- Is this Person employed by this Organization now?
- Which Post, unit, and manager apply now?
- Which compensation binding is Active now?
- What leave balance remains in the current allocation period?
- Which payroll results exist for which periods?
- Is the personnel file open for new transactions?

Those answers are projections over dated facts. Frappe and Odoo often store the current projection on Employee. Formal sources keep the facts on Membership, Post, or Employment.

**Kind.** Candidate implication. **Decision state.** `hypothesis`.

## Contractor path

FIBO says Employment does not include independent contractors and other contingent arrangements without a direct hire contract and control. ValueFlows can still record `work` and a reciprocal payment. A vendor relationship is a commercial role and belongs to issue 14 and issue 16, not to this folder's Employment object.

**Kind.** Domain evidence. **Decision state.** `supported` that the control test exists. `hypothesis` that OS must keep a separate contractor agreement type.
