---
issue: 28
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence and divergence

The goal is evidence of semantic agreement or disagreement, not a feature comparison. Cells use first-party pages from `sources.md`. `?` means not fetched this session. `undetermined` means a payroll-standard or product page failed or was skipped.

Legend for the first table:

- Y means the distinction is present in the source's own words or published classes
- N means the source collapses or omits it
- P means partial, usually a field on another object
- ? means not inspected this session

## Concept matrix

| Distinction | Frappe HR | Odoo 18 | W3C ORG | UFO or gUFO | FIBO | schema.org | HR-XML | ValueFlows | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Person is not Employee-kind | P | P | Y | Y | Y | Y | Y | Y | Products store a personnel file. Formal sources keep Person |
| Employee as role | P | P | Y | Y | Y | Y | Y | N | ValueFlows has no Employee type. Work is an action |
| Employment as identifiable relationship | N | P | Y | Y | Y | Y | Y | N | Odoo Contract is the closest operational stand-in |
| Native Relator category | N | N | N | Y | N | N | N | N | Membership, Role, situation, or contract instead |
| Organization versus unit | Y | Y | Y | ? | Y | P | ? | Y | Frappe Company, Department, Branch. ORG Organization and OrganizationalUnit |
| Position or Post independent of holder | P | P | Y | ? | ? | P | ? | N | Frappe Designation and Job-like fields sit on Employee. ORG Post can be vacant |
| Manager as person-to-person | Y | P | P | ? | ? | ? | ? | N | Frappe Reports to. ORG prefers Post reportsTo Post |
| Manager as post-to-post | N | N | Y | ? | ? | ? | ? | N | ORG reporting charts without incumbents |
| Assignment of person to post | P | P | Y | Y | P | Y | P | N | Held-by versus membership |
| Contract as legal instrument | P | Y | P | P | Y | N | Y | P | Odoo requires a running contract to pay. FIBO says implicit or explicit |
| Attendance day-status | Y | P | N | N | N | N | P | N | Frappe Attendance. Odoo derives work entries from check-in |
| Check-in or time event | P | Y | N | N | N | N | ? | Y | Auto Attendance. Odoo Attendances. VF work |
| Leave type, allocation, application | Y | Y | N | N | N | N | P | N | HR-XML names periods of leave on the relationship |
| Compensation structure versus assignment | Y | Y | P | N | N | P | ? | N | ORG remuneration on Membership. schema.org baseSalary on Role |
| Additional or retro pay item | Y | P | N | N | N | N | ? | N | Frappe Additional Salary names arrears. Odoo salary attachments are different |
| Payroll period | Y | Y | N | N | N | N | ? | N | Odoo schedule pay. Frappe Payroll Period optional |
| Payroll result | Y | Y | N | N | N | N | ? | N | Salary Slip. Payslip |
| Payroll payment | P | P | N | N | N | N | ? | P | Defer to issue 22 |
| Payroll journal | P | P | N | N | N | N | ? | N | Defer to issue 21 |
| Benefits | Y | P | N | N | P | N | Y | N | Frappe flexible benefits. FIBO employer may provide benefits |
| Termination keeps history | Y | Y | Y | Y | Y | Y | Y | Y | Products archive or mark Left. Standards keep periods |
| Multiple concurrent employments | P | P | Y | Y | Y | Y | Y | Y | Frappe transfer can mint a second Employee ID |
| Contractor excluded from Employment | P | P | N | N | Y | N | P | Y | FIBO explicit. Frappe Employment Type can be Contractor as a label |
| Permissions from Post versus employment | P | P | Y | ? | ? | N | N | N | Product own-record grants. ORG Role for responsibilities. Issue 11 |

## Source-artifact map

These names are observations. They are not OS types.

| Source artifact | Source | Maps toward | Kind |
| --- | --- | --- | --- |
| Employee master | Frappe HR | Person plus current employment projection | source-system artifact |
| Employment Type | Frappe HR | Classification of an employment, not a kind of person | source-system artifact |
| Employee Promotion | Frappe HR | Action that changes assignment and maybe compensation | source-system artifact |
| Employee Transfer | Frappe HR | Action on assignment. Optional new personnel identifier | source-system artifact |
| Employee Separation | Frappe HR | Offboarding process instance | source-system artifact |
| Attendance | Frappe HR | Day-status fact | domain evidence |
| Leave Application | Frappe HR | Requested leave | domain evidence |
| Salary Structure | Frappe HR | Compensation template | domain evidence |
| Salary Structure Assignment | Frappe HR | Dated compensation binding | domain evidence |
| Additional Salary | Frappe HR | One-period or recurring adjustment, including arrears | domain evidence |
| Payroll Period | Frappe HR | Pay and tax window | domain evidence |
| Payroll Entry | Frappe HR | Batch that creates results | source-system artifact |
| Salary Slip | Frappe HR | Payroll result | domain evidence |
| `hr.employee` | Odoo | Personnel file | source-system artifact |
| Contract | Odoo | Dated terms required to pay | domain evidence |
| Work entry | Odoo | Payroll time atom | domain evidence |
| Payslip | Odoo | Payroll result | domain evidence |
| Offboarding plan | Odoo | Process instance | source-system artifact |
| Archived employee | Odoo | Historical personnel file | domain evidence |
| `org:Membership` | W3C ORG | Annotated person-organization relationship | domain evidence |
| `org:Post` | W3C ORG | Position that can be vacant | domain evidence |
| `org:Role` | W3C ORG | Abstract function | domain evidence |
| `gufo:Relator` Employment | gUFO | Mediating individual | domain evidence |
| `fibo:Employee` | FIBO | Role played by a person | domain evidence |
| `fibo:Employment` | FIBO | Dated situation | domain evidence |
| `schema:EmployeeRole` | schema.org | Dated role with salary | domain evidence |
| EmploymentBaseType | HR-XML | Relationship, not party | domain evidence |
| `vf:work` | ValueFlows | Labor event | domain evidence |

## Convergence

Independent first-party sources agree on these cuts. Decision state for the cuts is in `candidate-laws.md`.

1. The enduring individual is a Person, not an Employee kind. FIBO, HR-XML, W3C ORG, UFO, schema.org, and ValueFlows. Frappe's own definition starts from an individual under a contract.
2. Employment, or an equivalent membership or contract, carries hire, end, and terms that do not belong on the person. HR-XML states this in those words. FIBO and W3C ORG agree.
3. A vacant position is different from a person holding a role. W3C ORG Post versus Membership.
4. Requested leave is different from a day-status or a work entry. Frappe and Odoo.
5. A compensation template is different from a dated assignment to a person. Frappe. Odoo contract wage versus structure type.
6. A payroll result is different from the period and from the later payment and journal. Frappe and Odoo. Payment is issue 22. Journal is issue 21.
7. Ending employment must keep historical records. Frappe Left, Odoo Archive, HR-XML rehire as a new period.

## Divergence

1. **Where employment lives.** Frappe puts dates and reports-to on Employee. Odoo requires a Contract to pay. Formal sources reify Membership, Relator, or Employment.
2. **Whether Relator is a category.** Only UFO or gUFO names Relator. Others use Membership, situation, Role, or contract.
3. **Contractor.** FIBO excludes contingent workers from Employment. Frappe lets Employment Type be Contractor on the same Employee master. Odoo Contract Type includes Intern, Student, and similar labels. ValueFlows can pay work without Employment.
4. **Identity across company change.** Frappe can mint a new Employee ID on transfer. Formal sources keep one Person and add a period. HR-XML treats acquisition as a new employment period with a related employer.
5. **Manager edge.** Frappe stores Reports to as a person. ORG models Post reports to Post so the chart survives vacancy.
6. **Late leave versus processed pay.** Frappe refuses the leave application. Odoo defers the time off to the next period.
7. **Work without employment.** ValueFlows records `work` from a Person. Payroll products will not pay without Employee plus, in Odoo, a running contract.

## Payroll-standard cells

ISO 30400 and ISO 30414 were not fetched. Those matrix cells stay `undetermined`. HR-XML EmploymentBaseType is the interchange definition retrieved this session. A later worker can fill ISO cells without rewriting this folder's laws.
