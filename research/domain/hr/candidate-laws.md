---
issue: 28
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate employment laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 3 owns whether Role and Relator become engine categories. Issue 14 owns Person and Organization. Issue 21 owns payroll journals. Issue 22 owns payment.

## L1. Employee is not a Kind of Person

**Claim.** The enduring individual stays a Person when employment starts and when it ends. Employee is a classification that can start and stop. Treating Employee as a Kind would block the same person from later being a customer, a contractor, or an employee of another organization.

**Kind.** Candidate law.

**Evidence.** E1, E15, E16, E17, E18, E19, E20, E23. Frappe's own words start from an individual under a contract. FIBO, HR-XML, W3C ORG, UFO, and schema.org keep Person. Party L1 already rejects Customer and Supplier as kinds. This folder does not reopen that rejection.

**Source artifact that looks like a counterexample.** Frappe Employee master. Odoo `hr.employee`.

**Decision state.** `rejected` for Person-as-Employee-kind. `supported` for "not a Kind."

**Falsifier.** A labor-law corpus where the Employee record remains the identity of the person after all employments end, and a later customer relationship cannot reuse that person.

**Runtime consequence.** Status Left or Archived closes employment use. It must not destroy Person. See S-HR-009, S-HR-015.

## L2. Person versus Employee-role encoding stays open for the engine

**Claim.** Formal sources independently agree that Employee is a role of Person in the scope of an employment relationship. Operational products collapse the current role into a personnel file. That is enough to reject Kind. It is not enough to freeze Role as a kernel primitive or to freeze a single Employee object type.

**Kind.** Candidate law about the engine, not about the world.

**Evidence.** E1, E11, E15, E16, E17, E22, E23. Party L9 is a sibling hypothesis with the same split.

**Decision state.** `undetermined` for OS encoding. Domain lean is role.

**Falsifier.** Independent first-party operational systems that keep a first-class Employee role object without a personnel-file projection, or a formal ontology that treats Employee as a rigid Kind and still handles rehire and dual roles.

**Runtime consequence.** Wave B must not add an Employee opcode. It can enforce "no Kind change on hire" with ordinary objects and constraints.

## L3. Employment is an identifiable relationship with a period

**Claim.** Hire date, end date, control, compensation, position, suspension, and termination do not belong as the only properties of Person or of Organization. They belong on a relationship that can be named, ended, and cited by later actions.

**Kind.** Candidate law.

**Evidence.** E8, E11, E15, E16, E17, E19, E21, E22. HR-XML says distinguish party attributes from relationship attributes. FIBO calls Employment a situation for a period. W3C ORG Membership carries duration, salary, and contract. Odoo will not pay without a running contract. RFC-0001 already uses this example.

**Decision state.** `supported` for an identifiable dated relationship. `undetermined` for calling it a native Relator.

**Falsifier.** A domain where those attributes stay correct when stored only on Person, including after the employer is replaced, merged, or split. S-HR-003, S-HR-008, S-HR-016.

**Runtime consequence.** Promote, Transfer, Suspend, and Terminate target the relationship or its assignment, not the Person identity key.

## L4. Relator as a kernel primitive is not earned by this domain alone

**Claim.** UFO names Relator. W3C ORG names Membership. FIBO names Employment as a situation. schema.org names EmployeeRole. Odoo names Contract. Composition from an ordinary object plus two constrained links may still preserve meaning. Constitution rule 1 prefers composition when enforcement survives.

**Kind.** Candidate law about the engine.

**Evidence.** E15, E16, E17, E18, E22. Issue 3 owns the primitive.

**Decision state.** `undetermined`.

**Falsifier.** A case where ordinary objects plus constraints cannot refuse two Kinds, keep Role out of the identity key, and target relationship-objects with actions without hidden conventions.

**Runtime consequence.** Do not edit RFC-0001 from this folder.

## L5. Post is not Membership

**Claim.** A position can exist while vacant. A membership or employment does not exist without the person. Organization charts and delegated duties need the vacant post. Headcount and payroll need the membership.

**Kind.** Candidate law.

**Evidence.** E15. W3C ORG states the contrast in those words. Frappe Designation on Employee cannot represent a vacant post. E3 and E4 overwrite designation on the person.

**Decision state.** `supported` for the distinction. `hypothesis` for the names Post and Assignment.

**Falsifier.** A mature org-chart and payroll corpus that stores only person-to-person reports-to and still answers who holds a vacant seat and who the seat reports to.

**Runtime consequence.** Manager of a vacant post is a fact about posts. Acting manager is a temporary assignment. See S-HR-011, S-HR-023.

## L6. Contract is evidence of employment, not a synonym for it

**Claim.** FIBO and HR-XML allow an implicit or explicit contract of hire. Odoo requires a running contract document to pay. Frappe stores contract end on Employee and still pays from Salary Structure Assignment. The legal instrument, the employment situation, and the compensation binding can come apart.

**Kind.** Candidate law.

**Evidence.** E1, E8, E11, E17, E19.

**Decision state.** `hypothesis`.

**Falsifier.** A jurisdiction where there is no employment without a signed instrument, and a product corpus where every implicit hire still creates a contract object with the same identity as Employment.

**Runtime consequence.** Paying without a contract is a policy decision. It is not proof that Employment is the Contract document.

## L7. Day-status, time event, and leave request are different facts

**Claim.** Check-in is an event. Attendance for a date is a day-status. Leave application is a request that may be denied. Work entry is a payroll atom derived from those facts. Collapsing them into one "hours" field loses requested-versus-happened.

**Kind.** Candidate law.

**Evidence.** E6, E7, E12, E20, E26. Constitution rule 8. ValueFlows `work` is an event. Frappe forbids future attendance. Frappe forbids leave submit after processed salary. Odoo defers late time off.

**Decision state.** `supported`.

**Falsifier.** A payroll corpus that stores only one hours number per day and still explains denied leave, half-day, holiday, and a deferred sick day after payslip validation.

**Runtime consequence.** Payroll reads derived time facts. It must not be the only store of those facts. See S-HR-004, S-HR-013, S-HR-027.

## L8. Compensation template, binding, adjustment, and result are different objects

**Claim.** A structure or rule set can be shared. A dated assignment binds it to one employment with a base. An additional item, including arrears, is a later adjustment. A slip is the computed result for a period. Editing the template must not rewrite submitted results.

**Kind.** Candidate law.

**Evidence.** E8, E9, E10, E11, E12. Frappe one Active structure per person per period. Additional Salary names arrears.

**Decision state.** `supported`.

**Falsifier.** A corpus where changing the shared structure rewrites historical slips and still answers what was paid then.

**Runtime consequence.** Retroactive correction writes a new adjustment or a reversal. It does not silently mutate the old result. See S-HR-005.

## L9. Period, result, payment, and journal are different

**Claim.** A payroll period is a window. A result is the computed amount and components for an employment in that window. Payment settles the net. Journal recognizes expense and liability. Products already split these steps.

**Kind.** Candidate law.

**Evidence.** E9, E12. Frappe Payroll Period, Salary Slip, Bank Entry. Odoo payslips then wire or check. Batch account move lines anonymize journals.

**Decision state.** `supported` for the split. Payment details `undetermined` here. Journal details `undetermined` here.

**Falsifier.** A statutory payroll where one object is legally the period, the result, the payment, and the journal, and splitting it loses meaning.

**Runtime consequence.** Issue 22 owns payment. Issue 21 owns journal. This folder owns the HR objects that authorize those later facts.

## L10. Termination ends use and keeps history

**Claim.** After termination the person still exists, the ended employment still exists, and historical attendance, leave, and results remain citable. New operational actions that require a current employment must fail.

**Kind.** Candidate law.

**Evidence.** E2, E5, E13, E19. Frappe Left blocks further transactions. Odoo Archive keeps the file. HR-XML rehire is a new period.

**Decision state.** `supported`.

**Falsifier.** A corpus that deletes the personnel file on exit and still produces an audit of past slips, or that leaves the file fully writable and still prevents new leave and pay.

**Runtime consequence.** Terminate is not delete. Rehire is not undelete. See S-HR-009, S-HR-010.

## L11. One person can have several employments

**Claim.** Concurrent employments with one legal person, sequential employments after rehire, and employments with several employers are all live cases. A single Employee identifier per person is a product convenience.

**Kind.** Candidate law.

**Evidence.** E4, E15, E16, E17, E19. Frappe transfer can create a second Employee ID. HR-XML repeats periods after rehire or acquisition. ORG and UFO allow many memberships.

**Decision state.** `supported` for multiplicity. `hypothesis` for which combinations one LegalPerson may forbid.

**Falsifier.** A jurisdiction and a mature ERP where a person can have at most one employment record ever, including after rehire and dual-company groups, without workarounds.

**Runtime consequence.** Identity of Person must not be the employment number. See S-HR-007, S-HR-008, S-HR-016.

## L12. Contractor is not smuggled in as Employment Type

**Claim.** FIBO excludes contingent workers who fail the control and direct-contract test. A label Contractor on an Employee master is a source-system convenience. A genuine contractor agreement is a commercial relationship. Work events can still be recorded.

**Kind.** Candidate law.

**Evidence.** E1, E17, E20. Frappe Employment Type can be Contractor. ValueFlows `work` does not require Employment.

**Decision state.** `hypothesis`.

**Falsifier.** A labor-law corpus where contractors are employees for every payroll, leave, and termination rule, or where the control test never changes the object type.

**Runtime consequence.** Contractor pay must not require a running Employment if the domain says there is none. Do not reuse Customer or Supplier as a kind. See S-HR-006.

## L13. Organizational role and employment grant are different authorities

**Claim.** Holding a Post can publish responsibilities and a reporting line. Being employed can grant "own record" access and leave eligibility. A User login is a third thing. Approver lists on Department are a fourth.

**Kind.** Candidate law.

**Evidence.** E7, E14, E15, E24. Issue 11 owns Principal. This law only forbids collapsing the four.

**Decision state.** `hypothesis`. Product pages do not show a full authorization model.

**Falsifier.** A corpus where every permission is a function of Employment status alone, including after the person stops holding the Post but remains employed, and the reverse.

**Runtime consequence.** Policy checks must be able to name Post, Employment, Principal, and own-record scope separately. See S-HR-012.

## Rejected claims

**R1. Person-as-Employee-kind.** See L1. **Decision state.** `rejected`.

**R2. Attendance is just a field on Employee.** Day-status has its own submit rules and cannot be future-dated. **Decision state.** `rejected`.

**R3. Salary Structure is the employment.** Structures are shared templates. **Decision state.** `rejected`.

**R4. Offboarding checklist is the termination.** Separation and offboarding plans are process instances. **Decision state.** `rejected` as a synonym for Employment end.

## Composition recommendation

**Claim.** The HR fragment can be composed from Person, Organization, LegalPerson, OperatingUnit, a dated employment relationship, Post, assignment, time events, day-status, leave request, compensation binding, payroll period, and payroll result. It does not by itself earn new RFC primitives.

**Kind.** Candidate law about the engine.

**Decision state.** `hypothesis`.

**Falsifier.** Those objects plus constraints cannot keep history after Left, pay two concurrent employments, correct arrears without rewriting slips, or keep a vacant post.

**Runtime consequence.** Wave B implements enforcement points, not an HR module opcode.
