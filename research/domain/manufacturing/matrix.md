---
issue: 19
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence matrix

Reference table for issue 19. A check means the source makes the distinction in pages fetched this session. A dash means the source was silent in those pages. `schema` means the product implements a nearby idea that is not the same distinction. `undetermined` means the first-party page was missing or paywalled.

This is not a feature comparison. It is evidence of semantic convergence or divergence.

## Distinctions

| Distinction | ERPNext | Odoo 18 | Moqui Mantle | REA and ValueFlows | GS1 EPCIS 2.0 | ISA-95 public pages |
| --- | --- | --- | --- | --- | --- | --- |
| Specification versus instance | schema. Item plus BOM. Serial and batch elsewhere | schema. Product plus BoM | yes. Product versus Asset | yes. ResourceSpecification versus EconomicResource | yes. class quantity versus instance EPC | undetermined in paid Part 1. Draft names material definition versus lot |
| BOM or recipe as material graph | yes. BOM items, exploded, phantom | yes. Components tab | yes. `PatMfgBom` on `ProductAssoc` | yes. RecipeFlow consume and produce | dash. No BOM | undetermined. Draft names product definition |
| Engineering BOM versus manufacturing BOM | dash | dash | yes. `PatEngBom` versus `PatMfgBom` | dash | dash | undetermined |
| Process specification or routing | yes. Routing plus BOM operations | schema. Operations live on one BoM | thin. `WeptRouting`. Maintainer says no routes in the simple run | yes. RecipeProcess and ProcessSpecification | dash | undetermined. Draft process segment |
| Operation definition versus execution | yes. Operation versus Job Card | yes. BoM operation versus work order | schema. WorkEffort is both plan and run | yes. RecipeProcess versus Process plus events | dash | hypothesis. Draft work definition versus work performance |
| Work center as capability place, not warehouse | yes. Explicit note | yes. Work center versus locations | dash in pages read | use action on equipment | dash | undetermined. Equipment class |
| Effectivity or revision on spec | schema. Cancel and duplicate submitted BOM | schema. Version with PLM | yes. `fromDate` and `thruDate` on `ProductAssoc` | recipe decoupled from generated plan | dash | undetermined |
| Intent versus plan versus authorization | yes. Sales or material request, Production Plan, Work Order | partial. MPS not fetched. Manufacturing order is the release | partial. ProductionEstimate plus production run | yes. Intent, Plan, Commitment | no. Observation only | hypothesis. Draft production schedule versus request |
| Plan versus execution | yes. Planned versus actual time and cost | yes. Default duration versus real duration | yes. Estimate versus issuance and receipt | yes. Commitment versus Economic Event | yes. Event is what was asserted | hypothesis. Draft schedule versus performance |
| Reservation distinct from issue | yes. Reserve on submit. Transfer on start | partial. Readiness and pick. Full reservation page not fetched | dash | dash in pages read | dash | undetermined |
| Issue or transfer distinct from consume | yes. Transferred qty versus consumed qty | yes. Manual consumption and flexible consumption | yes. Asset issuance then produce | yes. Move or transferCustody versus consume | partial. Inputs are consumed in the transformation | undetermined |
| WIP as in-process stock or stage | yes. WIP warehouse | schema. Pre-production location | yes. WIP GL on issue and receipt | yes. Stage on resource | dash | undetermined |
| Primary output versus by-product versus co-product | schema. Scrap table, secondary items in v16, process loss | yes. By-products setting. No co-product name | dash | yes. Primary on recipe. Co-product and by-product in the graph | yes. Many outputs, no primary | undetermined |
| Planned scrap versus disposition scrap versus process loss | yes. Three mechanisms | yes. By-product versus scrap location | dash | no good or bad class | dash | undetermined |
| Rework keeps identity or mints new | schema. Job Card QI. No Rework doctype in pages | schema. Unbuild is reverse manufacture | dash | yes. accept and modify versus consume and produce | transformation versus object observe | undetermined |
| Subcontract as other-agent production | yes. Service PO plus supplied materials | yes. Subcontracting BoM type, three routes | dash | yes. transferCustody plus deliverService | dash | undetermined |
| Capacity constrains schedule | yes. Slot reservation on submit | yes. Work center hours, alternate, OEE | dash | use plus calendar note | dash | hypothesis. Draft work capability |
| Genealogy as input-output contribution | schema. Lots and serials, not a transformation event | schema. Lots and serials, unbuild link to MO | dash | yes. Track and trace on IPO | yes. TransformationEvent and transformationID | undetermined. Landing page mentions integration, not genealogy |
| Correction of a prior observation | schema. Return, extra issue, cancel and reverse stock | yes. Unbuild. Scrap after done | schema. AcctgTrans reverse-of in release notes | yes. Event corrects or reverses event | yes. Error declaration in the standard family | undetermined |
| Kit or phantom is not a stocked intermediate | yes. Phantom BOM | partial. Kit mentioned | schema. Pick assembly product type | omit the intermediate | dash | undetermined |

## Source artifacts mapped to domain concepts

Left column is a source artifact. Right column is a domain concept, not a target table.

| Source artifact | Domain concept | Must not import |
| --- | --- | --- |
| ERPNext BOM DocType | Material graph plus optional operation list, frozen on submit | DocType, naming series, Update Cost button |
| ERPNext Routing | Reusable operation template | Sequence ID as the only sequencing law |
| ERPNext Work Order | Production authorization plus copied plan plus warehouse assignment | The name Work Order |
| ERPNext Job Card | Operation execution record | Auto-create-on-submit as a metamodel rule |
| ERPNext Production Plan | Demand-exploded plan that can spawn authorizations | Get Items buttons |
| ERPNext Subcontracting Order | Authorization to a supplier plus reserved supplied materials | Purchase Order as the only host document |
| Odoo BoM Type Manufacture, Kit, Subcontracting | Specification role. Make, pack, or outsource | BoM Type enum as OS vocabulary |
| Odoo Manufacturing Order | Production authorization | Produce All as the only complete action |
| Odoo Work Order | Operation execution at a work center | The name Work Order |
| Odoo Virtual Locations/Scrap | Disposition of unusable quantity | Virtual location as a domain kind |
| Odoo Unbuild Order | Compensating transformation | Unbuild as a required document type |
| Moqui `ProductAssoc` `PatMfgBom` | Effectivity-bounded material link | Association-row physical design |
| Moqui `WepProductionRun` | Production authorization hosted on a general work record | WorkEffort as a required host type |
| Moqui `WorkEffortProduct` produce and consume | Planned or actual input and output lines | Enum ids |
| ValueFlows Recipe | Knowledge-level material and process graph | Recipe class optionality as a law |
| ValueFlows Process | One process instance across plan and observation | Storing both direct and fulfill links |
| ValueFlows Economic Event | Observed flow | Action verb list as a closed OS enum |
| EPCIS TransformationEvent | Observed many-to-many transformation | EPC URI syntax, CBV codes |
| ISA-95 Level 3 versus Level 4 | Operations management versus enterprise planning | Purdue levels as software tiers |
| ISA-95 draft work request and work response | Authorization versus execution report | B2MML element names |

## Convergence that survived this pass

Independent sources agree on these cuts.

1. How to make a kind of thing is not the act of making a quantity of it. ERPNext BOM versus Work Order. Odoo BoM versus manufacturing order. ValueFlows Recipe versus Plan and Process. EPCIS has no recipe and still records transformation as an event.
2. Planned flow is not observed flow. ERPNext planned versus actual operation time. Odoo default duration versus real duration. ValueFlows Commitment versus Economic Event. ISA-95 draft schedule versus performance.
3. Operation definition is not the job. ERPNext Operation versus Job Card. Odoo BoM operation versus work order.
4. Work center is not the warehouse. ERPNext says so in words. Odoo splits work center from inventory locations.
5. Inputs may become several outputs, and contribution can be many-to-many. ValueFlows co-product and by-product. EPCIS TransformationEvent. ERPNext and Odoo residual outputs.
6. Sending work to another agent is still production. ERPNext and Odoo both model supplied materials plus a service. ValueFlows transferCustody.
7. Consumption can be recorded from the specification or from what was issued. ERPNext backflush settings. Odoo flexible consumption.

## Divergence that remains live

1. **Where operations live.** ERPNext Routing can be reused across BOMs. Odoo operations are exclusive to one BoM. ValueFlows RecipeProcess can be included in several Recipes. Moqui's public manufacturing path often skips routes.
2. **How revision is represented.** ERPNext freezes a submitted BOM. Moqui dates the association. Odoo versions through PLM. ValueFlows decouples the generated plan from the recipe.
3. **WIP.** Warehouse move, GL class, resource stage, or interim stocked item. All four appear. None of the six sources collapses them to one fact.
4. **Primary output.** ERPs need one production item for the order. ValueFlows and EPCIS allow several outputs without a privileged one.
5. **Word collision.** Work Order means authorization in ERPNext and execution in Odoo.
6. **How much process nesting is in one authorization.** ERPNext multi-level BOM and Job Cards. Moqui single-step run plus interim stock. ValueFlows nested processes inside one Plan.

## ISA-95 and GS1 coverage note

GS1 TransformationEvent cells are first-party. ISA-95 level cells are first-party from S-ISA-LAND. ISA-95 object-model cells stay `undetermined` or `hypothesis` until Part 1 text is readable. That is a coverage gap, not a disagreement with the ERPs.
