---
issue: 28
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Sources

Exact documents fetched or inspected this session. Dates are retrieval dates, not source publication dates.

Kind of this file is reference. Decision state of the folder remains `hypothesis`.

## Repo context, read only

| Document | Path | Note |
| --- | --- | --- |
| Thesis | `docs/thesis.md` | HR is a surface over an executable ontology, not a module to copy |
| Constitution | `docs/constitution.md` | Model the world, not the source schema. Licensing hygiene |
| Open questions | `docs/open-questions.md` | Q12 relationship-entities. Not answered here |
| Research program | `docs/research-program.md` | Domain question first |
| Swarm backlog | `docs/swarm-research-backlog.md` | Agent output contract used because `docs/swarm-result-contract.md` is absent on `origin/main` |
| RFC-0001 | `rfcs/0001-metamodel-hypothesis.md` | Employment example already listed. Not edited |
| Scenarios seed | `scenarios/README.md` | S-006 is the employment lifecycle seed |
| Research notes | `research/README.md` | Evidence template and clean-room posture |
| Issue 28 | https://github.com/EnzoTironi/OS/issues/28 | No comments this session |

## Sibling notes, read only, not copied

| Branch | Path used | Use |
| --- | --- | --- |
| `cursor/issue-14-domain-cfd8` | `research/domain/party/README.md`, `research/domain/party/candidate-laws.md`, start of `evidence.md` | Cite party L1, L3, L4, L9. Do not rewrite |
| `cursor/issue-21-domain-cfd8` | listed on origin, not fetched locally | Journal posting of payroll. Cite only |
| `cursor/issue-22-domain-cfd8` | listed on origin, not fetched locally | Payment and settlement. Cite only |

## Frappe HR and ERPNext docs

| Page | URL | Retrieved |
| --- | --- | --- |
| Human resource setup | https://docs.erpnext.com/docs/user/manual/en/human-resource-setup | 2026-08-16 |
| Employee | https://docs.frappe.io/hr/employee | 2026-08-16 |
| Employment Type | https://docs.frappe.io/hr/employment-type | 2026-08-16 |
| Employee Transfer | https://docs.frappe.io/hr/employee-transfer | 2026-08-16 |
| Employee Promotion | https://docs.frappe.io/hr/employee-promotion | 2026-08-16 |
| Employee Separation | https://docs.frappe.io/hr/employee-separation | 2026-08-16 |
| Attendance | https://docs.frappe.io/hr/attendance | 2026-08-16 |
| Leaves | https://docs.frappe.io/hr/leaves | 2026-08-16 |
| Leave Application | https://docs.frappe.io/hr/leave-application | 2026-08-16 |
| Payroll Setup | https://docs.frappe.io/hr/payroll-setup | 2026-08-16 |
| Salary Structure | https://docs.frappe.io/hr/salary-structure | 2026-08-16 |
| Salary Structure Assignment | https://docs.frappe.io/hr/salary-structure-assignment | 2026-08-16 |
| Additional Salary | https://docs.frappe.io/hr/additional-salary | 2026-08-16 |
| Payroll Period | https://docs.frappe.io/hr/payroll-period | 2026-08-16 |

Linked from those pages and used as source artifacts, not separately fetched as full pages this session: Leave Type, Leave Period, Leave Policy, Leave Allocation, Leave Ledger Entry, Leave Encashment, Holiday List, Shift Type, Auto Attendance, Employee Benefit Application, Employee Benefit Claim, Payroll Entry, Salary Slip, Income Tax Slab.

## Odoo 18 docs

| Page | URL | Retrieved |
| --- | --- | --- |
| Employees | https://www.odoo.com/documentation/18.0/applications/hr/employees.html | 2026-08-16 |
| Offboarding | https://www.odoo.com/documentation/18.0/applications/hr/employees/offboarding.html | 2026-08-16 |
| Time off | https://www.odoo.com/documentation/18.0/applications/hr/time_off.html | 2026-08-16 |
| Payroll | https://www.odoo.com/documentation/18.0/applications/hr/payroll.html | 2026-08-16 |
| Contracts | https://www.odoo.com/documentation/18.0/applications/hr/payroll/contracts.html | 2026-08-16 |
| Work entries | https://www.odoo.com/documentation/18.0/applications/hr/payroll/work_entries.html | 2026-08-16 |

## Formal and industry models

| Page | URL | Retrieved |
| --- | --- | --- |
| W3C Organization Ontology REC | https://www.w3.org/TR/vocab-org/ | 2026-08-16 |
| W3C ORG Post section | https://www.w3.org/TR/vocab-org/#class-post | 2026-08-16 |
| gUFO Relator and Employment example | https://nemo-ufes.github.io/gufo/ | 2026-08-16 |
| UFO 2021 paper | https://nemo.inf.ufes.br/wp-content/uploads/ufo_unified_foundational_ontology_2021.pdf | 2026-08-16 |
| FIBO Formal Organizations RDF | https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/Organizations/FormalOrganizations.rdf | 2026-08-16 |
| schema.org EmployeeRole | https://schema.org/EmployeeRole | 2026-08-16 |
| HR-XML EmploymentBaseType | https://schemas.liquid-technologies.com/HR-XML/3.0/employmentbasetype.html | 2026-08-16 |
| ValueFlows actions | https://www.valueflo.ws/concepts/actions/ | 2026-08-16 |
| ValueFlows agents | https://www.valueflo.ws/concepts/agents/ | 2026-08-16, via search plus actions page |

FIBO Viewer HTML pages at `spec.edmcouncil.org` returned a shell without class text. Definitions below come from the raw RDF, not the viewer.

## Attempted and incomplete

| Target | Outcome |
| --- | --- |
| ISO 30400 HR vocabulary | Not fetched. Matrix cells that need it are `undetermined` |
| ISO 30414 human capital reporting | Not fetched. `undetermined` |
| A payroll interchange standard beyond HR-XML | Not fetched. Payroll payment cells defer to issue 22 |
| Moqui or Mantle HR | Not fetched this session. Matrix marked `?` |
| Odoo new-employee how-to | Linked from Employees. Not fetched as a standalone page |
| Frappe Leave Ledger Entry full page | Linked from Leaves. Behavior inferred only where the parent page states it |

## Licensing note

Odoo documentation describes LGPL or proprietary product behavior. Frappe HR documentation describes GPL product behavior. Notes record concepts and documented behavior only. FIBO RDF is MIT-licensed and was read for names and definitions. HR-XML definitions were read from published documentation, not copied as schema.
