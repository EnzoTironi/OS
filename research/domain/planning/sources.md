# Sources

**Kind:** source-artifact  
**Decision:** none  
**Fetched:** 2026-08-16

Only sources opened this session. Sibling research folders were not copied. ISA-95 Part 1 object attributes were not read. Those cells stay `undetermined`.

## OS context

| Artifact | Path | Use |
| --- | --- | --- |
| Thesis | `docs/thesis.md` | Deterministic logic may live as Functions inside one ontology. MRP is named as an example. |
| Constitution | `docs/constitution.md` | Requested is not happened. Concurrent state can invalidate an approved plan. |
| Open questions | `docs/open-questions.md` | Items 4, 6, 9, 10, 14. Not answered here. |
| Research program | `docs/research-program.md` | Domain questions and evidence loop. |
| Backlog contract | `docs/swarm-research-backlog.md` | Agent output contract. `docs/swarm-result-contract.md` is absent on `origin/main`. |
| RFC-0001 | `rfcs/0001-metamodel-hypothesis.md` | Attack target. Not edited. Function may or may not cover optimization. |
| Seed scenarios | `scenarios/README.md` | S-001 requested/promised/planned/actual. S-003 stale approval. |
| Research hygiene | `research/README.md` | Concepts and behavior only from copyleft corpora. |
| Issue | https://github.com/EnzoTironi/OS/issues/24 | Assignment text. |

## ERPNext / Frappe

License reminder: GPL-3.0. Concepts and documented behavior only.

| Artifact | Locator | What was used |
| --- | --- | --- |
| Production Plan manual | https://docs.frappe.io/erpnext/user/manual/en/manufacturing/production-plan (page also at `/erpnext/production-plan`, updated 2026-02-27) | Plan against Sales Order or Material Request. Sub-assembly explosion. Skip available using projected qty. Submit then create Work Orders and Material Requests. Close and re-open. |
| Projected Quantity | https://docs.frappe.io/erpnext/projected-quantity (updated 2026-03-02) | Published formula for projected qty. Reserved qty for production plan. |
| MRP manual | https://docs.frappe.io/erpnext/material-requirements-planning-mrp (updated 2026-04-29) | MPS captures finished-item demand from orders, material requests, forecasts, delivery schedules. MRP report plus Item Lead Time. |
| Forecasting report | https://docs.frappe.io/erpnext/demand-driven-forecasting (updated 2026-03-02) | Exponential smoothing over Sales Order, Delivery Note, or Quotation history. Smoothing constant in `[0, 1]`, default 0.3. |
| Production Plan DocType | `frappe/erpnext` `erpnext/manufacturing/doctype/production_plan/production_plan.json` SHA `c780ba2f3be48aa8b1f80aa97e3827e2c5e7d373` | Fields: `get_items_from`, `include_safety_stock`, `reserve_stock`, `status`, `no_of_shifts`, date filters. |
| Production Plan module | `frappe/erpnext` `erpnext/manufacturing/doctype/production_plan/production_plan.py` SHA `64c1f81447bee2b613a9ea82d2eee64a3a8ff115` | Submit, cancel, close, reserve, spawn work orders and material requests. Status from produced and requested qty. |
| MRP report | `frappe/erpnext` `erpnext/manufacturing/report/material_requirements_planning_report/material_requirements_planning_report.py` SHA `c3e45e755ac8d4e34d8d555664ccb2c1ac1bc289` | Demand = max(planned, forecast) plus ad-hoc sales orders. BOM walk. Lead-time offset. Safety stock add-on. Bucket view. `make_order` creates PO or WO. |
| Master Production Schedule DocType | `frappe/erpnext` `erpnext/manufacturing/doctype/master_production_schedule/master_production_schedule.json` SHA `39e4bbb16adc5fc31ebab6196293837070df822a` | Horizon `from_date`/`to_date`. Link to `Sales Forecast`. Buttons for actual demand, sales orders, material requests. |

Not fetched this session: Item Lead Time DocType JSON, Sales Forecast DocType JSON, workstation capacity planner UI. Those cells are partial.

## Odoo

License reminder: LGPL-3.0. Concepts and documented behavior only.

| Artifact | Locator | What was used |
| --- | --- | --- |
| Master production schedule | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/use_mps.html | Forecasted demand, indirect demand, replenishment, forecasted stock. Safety stock target. Min/max replenish. Manual, automatic, or never trigger. MPS must not run beside reordering rules. |
| Replenishment | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment.html | Three strategies: reordering rules, MTO, MPS. MTO links the sales order to the PO or MO. |
| Work centers | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/advanced_configuration/using_work_centers.html | Capacity as parallel units. Alternative work centers. Working hours. Planning by work center. Load and OEE as performance numbers. |
| Work center time off | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/work_center_time_off.html | Time off routes work to an alternative. Plan button. |

`class MrpMps` and `mrp.production.schedule` were not found in public `odoo/odoo` via GitHub code search this session. Community tree may omit the MPS addon. Code-level Odoo MPS behavior is `undetermined`.

Third-party blogs that claim Odoo is infinite-capacity were not treated as first-party.

## Moqui / Mantle

Mantle UDM is CC0. Still extract concepts, not a schema to copy.

| Artifact | Locator | What was used |
| --- | --- | --- |
| Request and Requirement docs | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Request | Requirement types Customer, Internal, Product, Inventory, Work. Statuses Proposed, Created, Approved, Ordered, Rejected. ATP or QOH methods. |
| Work Effort docs | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Work+Effort | WorkEffort as project, task, manufacturing routing, availability. Asset needed versus asset assigned. |
| Marble ERP guide | https://www.moqui.org/m/docs/apps/Marble+ERP+User+Guide | Production run is a Work Effort purpose. |
| Entity definitions | `moqui/mantle-udm` `entity/RequestEntities.xml` SHA `0c5a91a21f08930527176825563f60f02a012f9e` | `Requirement`, `RequirementOrderItem`, `WorkRequirementFulfillment`. `Request.priority`. |

No dedicated MPS or MRP explosion service was found under the name ProductRequirement. Mantle planning is requirement plus work effort, not a named MRP engine. That absence is evidence, not a defect claim.

## ValueFlows / REA

| Artifact | Locator | What was used |
| --- | --- | --- |
| Ontology classes | https://www.valueflo.ws/specification/all_vf.html | `Plan`, `Intent`, `Commitment`, `hasIndependentDemand`, `planIncludes`. |
| Spec index | https://www.valueflo.ws/specification/vfspec/ | Plan is scheduled work with defined deliverables. |
| Processes | https://www.valueflo.ws/concepts/processes/ | Same process instance can carry intents, commitments, and events. |
| Flows | https://www.valueflo.ws/concepts/flows/ | Recipes create plans. Intent before agreement. Commitment after agreement. |

`https://www.valueflo.ws/concepts/plans/` and `/concepts/planning/` returned 404 this session. Operational planning narrative is therefore partial.

## ISA-95 / IEC 62264

| Artifact | Locator | What was used |
| --- | --- | --- |
| ISA-95 series page | https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard | Levels 0–4. Part 1 Models and Terminology is an IEC adoption and sold separately. Member-only Pub Hub. |
| Part 5 preview | https://www.isa.org/getmedia/bbc0eb3e-d047-440d-88fc-642b14bd8d40/ISA-95-00-05-2018-preview.pdf | Public list of models: Operations Schedule, Operations Performance, Operations Capability, Work Schedule, Work Performance, Job List. |

Part 1 and Part 2 attribute tables were not readable this session. Attribute-level ISA-95 cells are `undetermined`.

Secondary vendor pages that paraphrase Production Schedule versus Production Performance were not used as primary evidence.

## Operations research and APS vocabulary

No solver product is a source of truth.

| Artifact | Locator | What was used |
| --- | --- | --- |
| Material requirements planning | https://en.wikipedia.org/wiki/Material_requirements_planning | Orlicky 1975 MRP. Wight MRP II adds master scheduling, RCCP, CRP, S&OP. |
| Advanced planning and scheduling | https://en.wikipedia.org/wiki/Advanced_planning_and_scheduling | APS allocates material and capacity together. Classical MRP often plans them separately and can emit infeasible plans. |
| Stadtler and Kilger 2000 | cited from the APS page, not opened | Named only. Not used for claims. |

Independent-demand Wikipedia redirected to the MRP page this session. The Orlicky independent versus dependent split is therefore cited from MRP history plus ValueFlows `hasIndependentDemand`, not from a standalone encyclopedia article.

## Not used as primary evidence

- Cybrosys, Braincuber, dooPartners, Gambit, and similar implementer blogs
- LinkedIn ISA-95 explainers
- Any APS vendor page that names a product as the recommended engine

Those may be follow-up reading. They do not decide a card.
