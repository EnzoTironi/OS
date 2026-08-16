---
issue: 19
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Sources

First-party pages fetched this session, plus secondary pages used only where the first-party text was missing. Kind is source list. Decision state is `hypothesis` for completeness of coverage, not for any law.

No copyleft source was pasted into the repo. Entity names and documented behavior only.

## ERPNext and Frappe docs

| Id | URL | Fetched | Used for |
| --- | --- | --- | --- |
| S-EN-WO | https://docs.frappe.io/erpnext/work-order | 2026-08-16 | Authorization, warehouses, reservation, finish, stop, return, extra transfer |
| S-EN-JC | https://docs.frappe.io/erpnext/job-card | 2026-08-16 | Operation execution, scrap on job, pending qty versus process loss |
| S-EN-BOM | https://docs.frappe.io/erpnext/bill-of-materials | 2026-08-16 | BOM as spec, operations, scrap, phantom, consume-based-on, submitted immutability |
| S-EN-RT | https://docs.frappe.io/erpnext/routing | 2026-08-16 | Routing as operation template, Sequence ID |
| S-EN-PP | https://docs.frappe.io/erpnext/production-plan | 2026-08-16 | Plan versus work order, sub-assembly manufacturing type |
| S-EN-SC | https://docs.frappe.io/erpnext/subcontracting | 2026-08-16 | Service item, send to supplier, receipt backflush, supplier-sourced |
| S-EN-SCRAP | https://docs.frappe.io/erpnext/scrap-management | 2026-08-16 | Planned scrap on BOM, scrap on manufacture entry |
| S-EN-WS | https://docs.frappe.io/erpnext/workstation | 2026-08-16 | Place of operation, capacity, hours, costing |
| S-EN-OP | https://docs.frappe.io/erpnext/operation | 2026-08-16 | Named operation, default workstation, QI template |
| S-EN-ALT | https://docs.frappe.io/erpnext/item-alternative | 2026-08-16 | Substitution on BOM, work order, subcontract |

## Odoo 18 docs

| Id | URL | Fetched | Used for |
| --- | --- | --- | --- |
| S-OD-MFG | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing.html | 2026-08-16 | Manufacturing app scope. Thin landing page |
| S-OD-BOM | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html | 2026-08-16 | BoM types, operations, flexible consumption, by-products, version |
| S-OD-WC | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/advanced_configuration/using_work_centers.html | 2026-08-16 | Work center, capacity, alternate, OEE, equipment |
| S-OD-SUB | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting.html | 2026-08-16 | Subcontracting BoM type, three component-sourcing routes |
| S-OD-BY | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/byproducts.html | 2026-08-16 | Residual output tracked on complete |
| S-OD-SCRAP | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/scrap_manufacturing.html | 2026-08-16 | Scrap as move to virtual location |
| S-OD-UNB | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/unbuild_orders.html | 2026-08-16 | Reverse manufacture, reclaim components |
| S-OD-SUB-B | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_basic.html | 2026-08-16 | Subcontractor buys own components |
| S-OD-SUB-R | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html | 2026-08-16 | Contractor sends components |

The older path `.../basic_setup/bill_of_materials.html` returned 404. The live page is `bill_configuration.html`.

## Moqui and Mantle

| Id | URL | Fetched | Used for |
| --- | --- | --- | --- |
| S-MQ-PROD | https://raw.githubusercontent.com/moqui/mantle-udm/master/entity/ProductDefinitionEntities.xml | 2026-08-16 | `ProductAssoc`, `PatMfgBom`, `PatEngBom`, `fromDate` and `thruDate` |
| S-MQ-WE | https://raw.githubusercontent.com/moqui/mantle-udm/master/entity/WorkEffortEntities.xml | 2026-08-16 | `WepProductionRun`, `WorkEffortProduct` produce, consume, routing |
| S-MQ-RN | https://github.com/moqui/mantle/blob/master/ReleaseNotes.txt | 2026-08-16 | WIP GL on issuance and receipt, basic production run |
| S-MQ-57 | https://github.com/moqui/mantle-udm/issues/57 | 2026-08-16 | BOM quantity is in the associated Product's unit |
| S-MQ-30 | https://github.com/moqui/HiveMind/issues/30 | 2026-08-16 | Maintainer. Single-level BOM, single-step run, issue and receive services |

Mantle UDM is CC0. Names are cited as evidence of distinctions, not as OS types.

## REA and ValueFlows

| Id | URL | Fetched | Used for |
| --- | --- | --- | --- |
| S-VF-CORE | https://www.valueflo.ws/introduction/core/ | 2026-08-16 | Knowledge, plan, observation layers. IPO plus REA |
| S-VF-REC | https://www.valueflo.ws/concepts/recipes/ | 2026-08-16 | Recipe as BOM plus routing plus suppliers. Stage and state |
| S-VF-PRC | https://www.valueflo.ws/concepts/processes/ | 2026-08-16 | Process spans plan and observation. Co-product and by-product |
| S-VF-FLW | https://www.valueflo.ws/concepts/flows/ | 2026-08-16 | Intent, Commitment, Economic Event. Recipe generates plan |
| S-VF-ACT | https://www.valueflo.ws/concepts/actions/ | 2026-08-16 | produce, consume, use, cite, work, accept, modify |
| S-VF-PLAN | https://www.valueflo.ws/concepts/plan/ | 2026-08-16 | Plan decoupled from recipe after generation |
| S-VF-SPEC | https://www.valueflo.ws/specification/all_vf/ | 2026-08-16 | Class definitions for Recipe, Commitment, Economic Event |
| S-VF-MODEL | https://www.valueflo.ws/specification/model-text/ | 2026-08-16 | Commitment fulfills Intent. Event fulfills Commitment. Event can correct Event |

`https://www.valueflo.ws/concepts/planning/` returned 404. The live page is `/concepts/plan/`.

## GS1 EPCIS

| Id | URL | Fetched | Used for |
| --- | --- | --- | --- |
| S-EPCIS-20 | https://ref.gs1.org/standards/epcis/2.0.0/ | 2026-08-16 | `TransformationEvent`, `transformationID`, input and output lists |
| S-EPCIS-GL | https://ref.gs1.org/guidelines/epcis-cbv/ | 2026-08-16 | Transformation versus aggregation. Inputs no longer exist |

## ISA-95 and IEC 62264

| Id | URL | Fetched | Grade | Used for |
| --- | --- | --- | --- | --- |
| S-ISA-LAND | https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard | 2026-08-16 | official overview | Levels 0 through 4. Parts 1 through 8. L3 and L4 interface |
| S-IEC-WIKI | https://en.wikipedia.org/wiki/IEC_62264 | 2026-08-16 | stub | Part list only. No object definitions |
| S-ISA-WD | working-draft text titled Enterprise-Control System Integration, fetched 2026-08-16 from a public HTML mirror of an ISA-95 Part 4 working draft | 2026-08-16 | secondary draft | Work definition, schedule, performance, capability. Not the paid IEC text |

The official Part 1 models and object attributes are paywalled. Matrix cells that need those attributes are `undetermined`. Secondary MES blogs were read and not used as proof.

## Repo context, read only

| Id | Path | Used for |
| --- | --- | --- |
| S-OS-THESIS | `docs/thesis.md` | BOM versus work order versus job. Action is not event |
| S-OS-CONST | `docs/constitution.md` | Requested is not happened. Clean-room |
| S-OS-OQ | `docs/open-questions.md` question 14 | Manufacturing questions. Not answered here |
| S-OS-RP | `docs/research-program.md` | Manufacturing extract list |
| S-OS-RFC | `rfcs/0001-metamodel-hypothesis.md` | Falsification target 4. Not edited |
| S-OS-SCEN | `scenarios/README.md` | S-008 lot recall. S-009 rework and scrap |
| S-OS-RES | `research/README.md` | Evidence note quality bar |
| S-OS-BACK | `docs/swarm-research-backlog.md` | Agent output contract |
| S-GH-19 | https://github.com/EnzoTironi/OS/issues/19 | Assigned question |

## Not fetched or failed

| Target | Result |
| --- | --- |
| Full IEC 62264-1 PDF | Paywalled. Object attributes `undetermined` |
| Odoo `bill_of_materials.html` old path | 404. Replaced by `bill_configuration.html` |
| ValueFlows `/concepts/planning/` | 404. Replaced by `/concepts/plan/` |
| Moqui HTML data-model book | Not needed after UDM XML and maintainer issues |
| Corpus PRs 32 through 38 | Readable on sibling branches. Not waited on. Not copied |

## Licensing note

ERPNext documentation describes a GPL product. Odoo documentation describes an LGPL and proprietary product. Notes record behavior and concept names only. Mantle UDM is CC0. ValueFlows and GS1 pages are public specifications.
