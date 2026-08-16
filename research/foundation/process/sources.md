# Sources

**Kind:** source-system artifact index  
**Fetched:** 2026-08-15  
**Method:** first-party pages retrieved this session. No secondary blogs used as evidence.

Licensing note. OS is MIT. ERPNext documentation describes a GPL product. Odoo documentation describes an LGPL or proprietary mix depending on edition. This folder records documented behavior and public vocabulary only.

## Project documents read this session

| Document | Path | Use |
| --- | --- | --- |
| Thesis | `docs/thesis.md` | Action is not Event. Surfaces share operations. |
| Constitution | `docs/constitution.md` | No primitive by aesthetics. Requested is not happened. |
| Open questions | `docs/open-questions.md` | Q13 economic model, Q14 manufacturing, Q15 ontology versus runtime. Not answered here. |
| Research program | `docs/research-program.md` | Evidence loop and manufacturing distinctions. |
| Swarm backlog | `docs/swarm-research-backlog.md` | Agent output contract used because `docs/swarm-result-contract.md` is not on `origin/main`. |
| RFC-0001 | `rfcs/0001-metamodel-hypothesis.md` | `Workflow` already excluded from the candidate list. Not edited. |
| Scenarios | `scenarios/README.md` | S-001, S-002, S-003, S-004, S-009, S-010. |
| Research notes | `research/README.md` | Evidence template and clean-room posture. |
| Reference landscape | `research/reference-landscape.md` | Prior Palantir, VF, ERPNext lessons. Treated as prior note, not as a first-party source. |
| Issue 10 | https://github.com/EnzoTironi/OS/issues/10 | Question and compare list. State OPEN. |

## ValueFlows and REA lineage

| Page | URL | What was taken |
| --- | --- | --- |
| Processes | https://www.valueflo.ws/concepts/processes/ | Process spans Plan and Observation. Same instance in both diagrams. No steps inside a Process. |
| Flows | https://www.valueflo.ws/concepts/flows/ | RecipeFlow, Intent, Commitment, EconomicEvent, Claim. Events are past only. Corrections are new events. |
| Diagram explanations | https://www.valueflo.ws/specification/model-text/ | ProcessSpecification, Plan, Agreement, Commitment, EconomicEvent definitions. |
| Formatted specification | https://www.valueflo.ws/specification/all_vf/ | `vf:Process`, `vf:ProcessSpecification`, `vf:Commitment`, `vf:Agreement`, `vf:Plan` IRIs and descriptions. |
| Operational planning | https://www.valueflo.ws/concepts/plan/ | Plan as scheduled processes with deliverables. Recipe generates Plan. Plan is decoupled from Recipe. |

REA itself was not fetched as a separate McCarthy paper this session. ValueFlows is the operational vocabulary used here. Treat REA as the parent tradition named by VF, not as a page-level cite.

## Temporal

| Page | URL | What was taken |
| --- | --- | --- |
| Workflows | https://docs.temporal.io/workflows | Definition, Type, Execution. Replay from Event History. Determinism rules. |
| Workflow Execution | https://docs.temporal.io/workflow-execution | Durable function execution. Open versus Closed statuses. Signals, Activities, Timers as awaitables. Continue-As-New. |
| Activities | https://docs.temporal.io/activities | Side-effecting units. Idempotency recommended. Standalone Activity without a Workflow. |
| Message passing | https://docs.temporal.io/encyclopedia/workflow-message-passing | Signals, Queries, Updates. External wait is a message into running code. |
| Detecting failures | https://docs.temporal.io/encyclopedia/detecting-workflow-failures | Execution timeout default is infinite. Prefer Timer over Workflow Timeout. |
| TypeScript failure detection | https://docs.temporal.io/develop/typescript/failure-detection#workflow-timeouts | Activity Failure does not fail a Workflow. Saga sample is application code. Cancellation is `CancelledFailure`. |

## BPMN

| Page | URL | What was taken |
| --- | --- | --- |
| BPMN 2.0.2 PDF | https://www.omg.org/spec/BPMN/2.0.2/PDF/ | Token is theoretical and not required to implement. Escalation is a business situation a Process might react to. Event is restricted to things that affect sequence or timing. Compensation Association is outside normal flow. Process Modeling Conformance includes Loop, Multi-Instance, Transaction, Compensation markers. |
| About BPMN 2.0 | https://www.omg.org/spec/BPMN/2.0/About-BPMN/ | Formal version 2.0, December 2010. Normative PDF `formal/11-01-03`. |

The 2.0.2 PDF text extraction did not include the body of clause 10.9. Claims about process instances therefore rest on the TOC entry, the token discussion in the introductory execution text, and the Event and Escalation clauses that were readable.

## ERPNext documentation

Documented behavior only. No source code copied.

| Page | URL | What was taken |
| --- | --- | --- |
| Purchase Order | https://docs.frappe.io/erpnext/user/manual/en/buying/purchase-order | Binding contract. Submit then receipt, invoice, payment. Hold or Close. Update Items cannot delete received lines. Per-item Required By. |
| Amend PO after submit | https://docs.frappe.io/erpnext/amending-purchase-order-after-submit | Qty update blocked after completed receipt. Rate update blocked after submitted invoice. |
| Work Order | https://docs.frappe.io/erpnext/user/manual/en/manufacturing/work-order | Signal to manufacture a quantity. BOM explosion. Job Cards. Partial finish. Stop blocked until WIP returned. |
| Job Card | https://docs.frappe.io/erpnext/job-card | Actual operation at a workstation. Pending Qty for partial completion. Process Loss only when Pending Qty is zero. |
| Sales Order | https://docs.frappe.io/erpnext/user/manual/en/selling/sales-order | Submit confirms commitment and does not move stock. Status table. Close versus Cancel. Partial deliver and bill. |

## Odoo documentation

Documented behavior only. No source code copied.

| Page | URL | What was taken |
| --- | --- | --- |
| Bill control policies | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html | Ordered versus received quantities. 3-way matching. `Should Be Paid` Yes, No, Exception. |
| Manufacturing landing | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing.html | Manufacturing orders, work center panel, work orders. |
| Shop Floor overview | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/shop_floor/shop_floor_overview.html | MO versus work order. Ready when confirmed and components available. Preceding work orders gate the next. Close Production with Undo. |
| Two-step manufacturing | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/basic_setup/two_step_manufacturing.html | Warehouse step policy. Pick transfer then manufacture. BoM fills Components and Work Orders. Produce All registers output. |

A first-party Odoo BoM page returned 404 this session (`.../basic_setup/bill_of_materials.html`). BoM claims therefore rest on the two-step page, which states that selecting a product fills the BoM and that the BoM fills component and work-order tabs.

## Palantir Foundry

| Page | URL | What was taken |
| --- | --- | --- |
| Ontology overview | https://palantir.com/docs/foundry/ontology/overview/ | Semantic elements are objects, properties, links. Kinetic elements are actions, functions, dynamic security. Workflow is not in that list. |
| Action types overview | https://www.palantir.com/docs/foundry/action-types/overview/ | An action is one transaction of object edits plus side effects. Same action logic across applications. |
| Automate overview | https://palantir.com/docs/foundry/automate/overview/ | Conditions then effects. Effects include submit actions, run functions, notify. |
| Automate effect settings | https://www.palantir.com/docs/foundry/automate/effect-settings/ | At-least-once effects. Sequential failure stops later effects. Independent automations race. |
| Workflow Lineage | https://palantir.com/docs/foundry/workflow-lineage/overview/ | Former Workflow Builder. Management graph of objects, actions, functions, applications. Not an ontology type. |

## Not fetched this session

| Wanted | Why missing | Effect on claims |
| --- | --- | --- |
| McCarthy REA 1982 paper | Timebox. VF used as the operational REA descendant. | Do not cite REA page numbers. |
| ISA-95 / IEC 62264 | Timebox. Named in the research program, not opened. | Manufacturing Process versus ProcessSpecification stays VF and ERP based. |
| Moqui / Mantle process or workflow | Out of this issue's exclusive folder and timebox. | No Moqui row in the matrix. |
| Temporal saga sample source | Only the docs sentence that points at the sample was used. | Compensation-as-application-code is documented intent, not a traced implementation. |
| BPMN 2.0.2 clause 10.9 body | PDF extract skipped that clause body. | Process-instance claims use token text plus TOC, marked weaker. |
