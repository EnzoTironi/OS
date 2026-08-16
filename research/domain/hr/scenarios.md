---
issue: 28
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Scenario cards

Adversarial cases for issue 28. Happy paths are omitted unless they set up a later break. Each card names kind and decision state. These are not executable tests yet.

Related seed. `scenarios/README.md` S-006 is the employment lifecycle seed. Cards below specialize it.

## S-HR-001. Promotion with a later pay binding

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Person P holds Post Junior Analyst from 1 March. On 1 June a promotion to Senior Analyst is approved. The new Salary Structure Assignment starts 1 July.

Questions. Does Promote change Employment, Assignment, or Person? Can the system answer the title in June and the pay in June as two facts? If the assignment is late, is June paid at the old rate on purpose?

Falsifies L3 and L8 if title and pay must be one field. Evidence E3, E8.

## S-HR-002. Transfer inside one legal person

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P moves from Department Sales in Site A to Department Support in Site B on 15 April. Employment with LegalPerson L does not end. Leave balances stay.

Questions. Is this a new Employment or a new Assignment? Does Reports to change because the Post changed? Do historical attendance rows keep the old department?

Falsifies L5 if the old department disappears from history. Evidence E4.

## S-HR-003. Transfer that mints a second personnel identifier

**Kind.** Counterexample. **Decision state.** `supported` as a product behavior, `hypothesis` for OS.

Frappe Create New Employee ID marks the old Employee relieved and creates a new one. Leave allocations are manual.

Questions. Did Person change? Are the two Employee IDs two employments or one identity split? Can a later query join both histories without a hidden Party Link?

Falsifies L1 if the new ID is treated as a new Person. Falsifies L11 if the product is copied as the ontology. Evidence E4.

## S-HR-004. Leave requested after payroll is processed

**Kind.** Counterexample. **Decision state.** `supported` that products already collide.

P takes a sick day on 31 March. The March slip was validated on 30 March. Frappe refuses a Leave Application that covers a processed salary period. Odoo defers the time off to the next period.

Questions. Is the sick day valid in March and known in April? Does March attendance stay Present? Which result is wrong if both clocks collapse?

Falsifies L7 if one hours field can explain both products. Evidence E7, E12, E26.

## S-HR-005. Retroactive compensation correction

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A January slip used base 10,000. In March HR discovers the January assignment should have been 11,000 from 1 January. Frappe Additional Salary can post arrears on a March payroll date.

Questions. Is the January result edited, reversed, or left with a March adjustment? What was believed in February about January? Does tax for the year see 1,000 in January or in March?

Falsifies L8 if the January slip is silently rewritten and audit still claims original known time. Evidence E8.

## S-HR-006. Contractor versus employee

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Person C invoices LegalPerson L monthly, sets their own hours, and uses their own tools. Person E is directed daily and paid through payroll. Frappe can label C as Employment Type Contractor on an Employee master. FIBO says C is not in Employment.

Questions. Does C get leave allocation, LWP, and a relieving date? If C later becomes E, is that a role change or a Kind change? Can ValueFlows `work` record C's labor without Employment?

Falsifies L12 if Contractor on Employee is copied as Employment. Evidence E17, E20, E1.

## S-HR-007. Two concurrent employments in one group

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P works 20 hours for Company A and 20 hours for Company B. Both companies are under one group. Each has its own books.

Questions. One Person or two Employee files? Two Employments? Two compensation bindings? Two slips in the same calendar period? Does a leave day consume both allocations?

Falsifies L11 if a single Employee identifier is required. Evidence E4, E9, E17.

## S-HR-008. One person, two unrelated employers

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P is employed by Organization X by day and Organization Y by night. X and Y do not share books.

Questions. Can OS hold both employments without making X and Y the same party? Do permissions at X leak to Y? Is "the" manager well-defined?

Falsifies L1 if Employee is a Kind with one employer slot. Evidence E15, E17.

## S-HR-009. Terminated worker keeps historical records

**Kind.** Counterexample. **Decision state.** `supported` as a required outcome.

P left on 30 June. In September an auditor asks for the May slip, May attendance, and the promotion in March. Frappe Left blocks new transactions. Odoo Archive hides the card from the default dashboard.

Questions. Can May facts be read without reopening employment? Can someone file a July leave? Does sending HR documents to a private email mutate the employment?

Falsifies L10 if history requires status Active. Evidence E2, E13.

## S-HR-010. Rehire after termination

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P left in 2024 and is hired again in 2026 for a different Post. HR-XML says a new employment period.

Questions. New Employment or reopen the old one? Do 2024 leave balances return? Does seniority use original hire date, adjusted hire date, or duty-entry date? HR-XML names those three hire dates.

Falsifies L10 if rehire is undelete. Evidence E19.

## S-HR-011. Manager relation when the seat is empty

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Post Head of Sales reports to Post COO. The Head of Sales seat is vacant for six weeks. Frappe Reports to points at a person.

Questions. Who do salespeople report to during the vacancy? Does the org chart break? Is an acting manager a new Assignment?

Falsifies L5 if only person-to-person Reports to exists. Evidence E15, E1.

## S-HR-012. Permissions from Post versus from Employment

**Kind.** Counterexample. **Decision state.** `undetermined`.

P is employed and holds Post Payroll Clerk, which may approve slips. P also has a User that can edit P's own Employee file. P then loses the clerk Post but stays employed.

Questions. Can P still approve slips? Can P still open their own leave? If an agent acts as P, which grant moves?

Falsifies L13 if one employment flag drives both. Evidence E24, E15. Issue 11 owns the Principal model.

## S-HR-013. Attendance versus approved leave on the same day

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A check-in log says Present. An approved Leave Application says On Leave. Frappe Attendance status includes both Present and On Leave. Odoo calls this a work-entry conflict.

Questions. Which fact is authoritative for payroll? Can both remain as claims with provenance? Constitution question 3.

Falsifies L7 if the day can have only one stored number with no provenance. Evidence E6, E12.

## S-HR-014. Half-day leave plus half-day work

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P works the morning and takes sick leave the afternoon. Frappe has Half Day on both Attendance and Leave Application.

Questions. Is Half Day a status, two intervals, or a derived projection? How does LWP proration count the day?

Falsifies L7 if Half Day is a third kind rather than a composition. Evidence E6, E7, E10.

## S-HR-015. Left employee used on a new slip

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A payroll batch includes P after Relieving Date. Frappe says the Left master is not accessible in further transactions.

Questions. Is the batch invalid, or is a final slip allowed through the relieving date? What if the batch is backdated to a period before exit?

Falsifies L10 if Left is only a label and pay still runs. Evidence E2, E9.

## S-HR-016. Intercompany transfer and leave balances

**Kind.** Counterexample. **Decision state.** `undetermined`.

P moves from LegalPerson A to LegalPerson B. Frappe may create a new Employee ID. Leave allocations on the new file are manual.

Questions. Do unused days transfer, cash out, or reset? Which LegalPerson owes encashment? Is this one Employment or two?

Falsifies L3 if leave balance lives only on Person. Evidence E4, E7.

## S-HR-017. Timesheet pay and salaried pay in one month

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P has a salaried structure and also a timesheet-based component for on-call hours. Frappe supports Salary Slip based on Timesheet as a structure flag.

Questions. Are there two bindings or one structure with two inputs? If the timesheet is late, is that S-HR-005 again?

Falsifies L8 if structure and time input are the same object. Evidence E10.

## S-HR-018. Flexible benefit claimed after pro-rata pay

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A flexible component was paid monthly. P later files a claim that should have been annual and tax-exempt. Frappe can deduct tax for unclaimed benefits on a later Payroll Entry.

Questions. Was the monthly amount an employment fact or a payroll estimate? Does the claim reverse prior slips or add a tax adjustment?

Falsifies L8 and L9 if benefit claim is a silent field edit. Evidence E8, E9.

## S-HR-019. Part-time unpaid fill

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A 20-hour contract against a 40-hour calendar generates 20 unpaid work entries. Those unpaid hours are not leave.

Questions. Are unpaid fill hours a time fact or a payroll convention? Do they reduce leave balance? Do they appear as absence?

Falsifies L7 if unpaid fill is stored as Absent. Evidence E25.

## S-HR-020. Contract expires, person still in the building

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Odoo Contract End Date passes. Status becomes Expired. P still checks in.

Questions. Is P employed? Can a slip generate? Is this a new implicit contract, a contractor period, or a policy breach?

Falsifies L6 if Contract and Employment cannot diverge. Evidence E11, E13.

## S-HR-021. Two running contracts for one employee file

**Kind.** Counterexample. **Decision state.** `undetermined`.

The Odoo pages read require a running contract to pay. They do not say whether two running contracts on one employee are legal.

Questions. Overlap for a raise, or two jobs? If overlap is forbidden, is that a constraint on Employment or on the product file?

Falsifies L11 if the product forbids overlap and that rule is copied as a domain law. Evidence E11. Product rule not fetched.

## S-HR-022. Vacant post with a budgeted wage

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Post Night Nurse is unfilled. The wage range lives on the post. No Person is employed in it.

Questions. Can compensation exist without Employment? Is this a budget fact, a template, or an invalid binding?

Falsifies L5 and L8 if every wage requires an Employee master. Evidence E15, E8.

## S-HR-023. Acting manager for a month

**Kind.** Counterexample. **Decision state.** `undetermined`.

P is assigned acting Head of Sales from 1 May to 31 May. Permanent Post is Analyst. No Frappe or Odoo page fetched this session names acting assignment.

Questions. Second Assignment, temporary Post, or a permission grant? Do approvals in May cite the acting Post?

Falsifies L5 and L13 if acting cannot be dated. Gap in sources.

## S-HR-024. Backdated promotion submitted late

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Promotion Date is 1 March. The document is submitted 20 March. Frappe allows submit on or after Promotion Date. March payroll already ran on 5 March.

Questions. Valid time 1 March, known time 20 March? Does March pay stay old until an arrears item? Constitution rule 10.

Falsifies the single-clock model. Evidence E3, E8. See S-HR-005.

## S-HR-025. Backdated transfer across a holiday list

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Transfer Date is 1 February. Submit is 10 February. Site B has a different Holiday List. February attendance was already marked on Site A's list.

Questions. Which holidays apply on 3 February? Are attendance rows rewritten or supplemented?

Falsifies L7 if holiday list is only a field on Employee. Evidence E4, E6.

## S-HR-026. Leave that crosses allocation periods

**Kind.** Counterexample. **Decision state.** `supported` as a product rule.

Frappe requires a Leave Application to sit inside one Leave Allocation period. A 28 December to 3 January vacation needs two applications.

Questions. Is that a domain law or a source artifact? What is the identity of the vacation?

Falsifies a single Leave Request object that ignores allocation windows if copied from desire rather than evidence. Evidence E7.

## S-HR-027. Work-entry conflict, regenerate, then the source app is still wrong

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Odoo says to fix Planning or Attendances first. Regenerating while the source is wrong recreates the conflict.

Questions. Which system is authoritative? Can payroll assert a work entry that contradicts Planning? Requested versus happened.

Falsifies L7 if regenerate is treated as truth. Evidence E12.

## S-HR-028. Second salary structure in the same period

**Kind.** Counterexample. **Decision state.** `supported` as a product invariant.

Frappe says only one Salary Structure can be Active for an Employee during any period.

Questions. Is Active a projection of dated assignments, or a stored mutex? What if a backdated assignment overlaps?

Falsifies L8 if two bindings can be Active and slips still pick one without a rule. Evidence E8.

## S-HR-029. Became freelance after employment

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Odoo departure reason Became Freelance. The same Person now invoices the same Organization.

Questions. Did Employment end and a contractor agreement start? Does the Archived employee file block the vendor role? Party L1 says the commercial label is not a Kind.

Falsifies L1 and L12 if freelance requires a new Person. Evidence E13, E17, E23.

## S-HR-030. Multiple positions, one employment

**Kind.** Counterexample. **Decision state.** `hypothesis`.

P is employed once and holds Post Teacher and Post Coach. W3C ORG allows a Post to be held by several people and a person to have several memberships.

Questions. One Employment with two Assignments, or two Employments? Which Post pays? Which Post reports where?

Falsifies L5 if Designation is a single field on Employee. Evidence E15, E1.

## S-HR-031. Employment without a signed PDF

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A person starts work on a handshake. FIBO and HR-XML allow an implied contract. Odoo still wants a running contract to pay.

Questions. Can Employment exist before the document? Is the PDF evidence or the relationship?

Falsifies L6 if the file is the employment. Evidence E17, E19, E11.

## S-HR-032. User, Person, and Employee diverge

**Kind.** Counterexample. **Decision state.** `hypothesis`.

A User is created from Employee and later the email is reused for a different Person. Frappe Create User Permission scoped the first User to the first Employee.

Questions. Does login identity follow the Person, the Employment, or the email? Issue 11 and issue 14.

Falsifies L13 if User is stored as Employee. Evidence E1, E24.

## S-HR-033. Encashment at exit

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Unused leave converts to a pay component using Leave Encashment Amount Per Day on the Salary Structure. Relieving Date is 15 June, mid period.

Questions. Is encashment a final payroll result, an additional item, or a benefit claim? Which structure is Active on the last day?

Falsifies L8 and L10 if encashment requires an Active employee for a later period. Evidence E2, E8.

## S-HR-034. Deferred sick day after a validated slip

**Kind.** Counterexample. **Decision state.** `hypothesis`.

Odoo example. Paid through the 31st. Sick on the 31st after validation. The sick day is applied on the 1st of the next month.

Questions. Valid time 31st, application time next period? Is that a lie in the next period's time facts, or a named correction?

Falsifies L7 and the two-clock split if the next period shows a sick day that did not happen then. Evidence E12.

## S-HR-035. Acquisition, new related employer

**Kind.** Counterexample. **Decision state.** `hypothesis`.

HR-XML says a period repeats when the person becomes an employee of a new related employer after acquisition. Person stays. LegalPerson changes.

Questions. Terminate and hire, or transfer Employment to a new employer party? Do slips before the deal stay with the old LegalPerson?

Falsifies L3 if Employment cannot change employer and history still cites the correct books. Evidence E19. Issue 14 owns LegalPerson.
