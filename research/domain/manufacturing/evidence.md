---
issue: 19
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Each block names its kind, a first-party citation, what was observed, limits, and a decision state. Kind is one of domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence.

## Specification

### E1. A BOM is a list of materials and may also name operations

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-BOM. S-OD-BOM. S-VF-REC.
- Observation: ERPNext calls a BOM a list of items and sub-assemblies with quantities required to manufacture an item, and says it may also contain manufacturing operations. Odoo says a BoM documents components and quantities needed to produce or repair a product, and often includes production operations. ValueFlows says a recipe is, in ERP terms, a combination of bills of material and routings and suppliers.
- Limits: Combining materials and operations in one document is a source convenience. The two graphs can still be different facts.

### E2. A submitted ERPNext BOM cannot be edited

- Kind: source-system artifact
- Decision state: `supported` as ERPNext behavior. `hypothesis` as a domain law of specification identity.
- Citation: S-EN-BOM.
- Observation: Once a BOM is submitted it cannot be edited. The user cancels, duplicates, and submits another. The page warns that a BOM is linked in many places, so changes are tedious.
- Limits: This is document immutability, not a published effectivity interval. Moqui puts `fromDate` and `thruDate` on `ProductAssoc` instead. See E6.

### E3. Odoo BoM version appears when PLM is installed

- Kind: source-system artifact
- Decision state: `supported` as an Odoo feature flag. `undetermined` as a general revision model.
- Citation: S-OD-BOM Miscellaneous tab.
- Observation: The Version field displays the current BoM version and is visible with the Odoo PLM app installed for managing BoM changes.
- Limits: The manufacturing BoM page does not define what happens to open manufacturing orders when Version changes.

### E4. ValueFlows recipe is knowledge. Plan is a later scaled copy

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-PLAN. S-VF-FLW. S-VF-REC.
- Observation: A plan can be generated from recipes or entered directly. Generation scales the recipe to demanded or supplied quantity. After generation the plan is decoupled from the recipe and keeps only references to resource and process specifications. Recipes are usually the smallest reasonable batch. Different recipes can create the same resource specification in different ways.
- Limits: Decoupling is a ValueFlows design choice. ERPNext copies BOM lines onto the Work Order and still points at a BOM id.

### E5. Manufacturing pattern versus workflow pattern

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-REC.
- Observation: The manufacturing pattern assembles or transforms inputs into different output resources and builds a tree. The workflow pattern changes the same resource through stages. Connecting processes by resource specification is enough for the tree. The workflow pattern also needs stage, and optionally state, on the input flow. Example. A process wants a component only after the test process and state pass.
- Limits: ERPNext and Odoo encode workflow mainly as operation sequence on one production item, not as stage on a resource.

### E6. Moqui BOM is a dated product association, and engineering BOM is not manufacturing BOM

- Kind: domain evidence
- Decision state: `supported` that effectivity and engineering versus manufacturing are real cuts. `hypothesis` that two BOM kinds are enough.
- Citation: S-MQ-PROD `ProductAssoc`. `PatMfgBom`. `PatEngBom`. `fromDate` is a primary key. `thruDate` is present. `PatEquivalent`. `PatRevision`. `PatUsedToProduce`.
- Observation: Mantle models a BOM as `ProductAssoc` rows, not as a standalone BOM document. Manufacturing BOM and engineering BOM are different association types under `PatComponent`. Date bounds sit on the association. A comment says to replenish a stocked asset through production runs using BOM associations.
- Limits: Entity names are source artifacts. The date bounds are domain evidence of effectivity.

## Routing, operation, work center

### E7. Routing is a reusable operation template

- Kind: source-system artifact
- Decision state: `supported` as ERPNext's split. `hypothesis` that a named Routing object is required.
- Citation: S-EN-RT. S-EN-BOM.
- Observation: ERPNext says Routing is a template of BOM operations. It stores operation, workstation, hourly rate, operation time, and batch size. Selecting a Routing on a BOM fetches those operations. Sequence ID forces Job Cards to complete in order.
- Limits: Odoo says each operation is exclusively linked to one BoM, with a button to copy existing operations. ValueFlows has RecipeProcess, not a separate routing master.

### E8. Operation definition is not the job that ran

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-OP. S-EN-JC. S-OD-BOM. S-OD-WC.
- Observation: ERPNext Operation stores a name, default workstation, and optional quality template. Job Card stores actual production information about a particular operation performed on a particular workstation, including time logs, completed quantity, scrap, and pending quantity. Odoo defines operations on the BoM. Confirming a manufacturing order creates work orders that track real duration at a work center.
- Limits: Naming collision. Odoo Work Order is the job. ERPNext Work Order is the authorization. See E12 and E13.

### E9. A work center is a capable place, not a stock warehouse

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WS. S-EN-BOM. S-OD-WC.
- Observation: ERPNext says workstations are defined only for product costing and Work Order operations scheduling, not tracking inventory. Inventory is tracked in warehouses on the BOM items table. An operation can take place at multiple workstations. Production capacity is how many jobs can run at once. Odoo work centers track costs, schedules, capacity, equipment, and efficiency. Alternative work centers cover unavailability. Allowed employees can restrict who may work there.
- Limits: ISA-95 equipment class versus equipment instance attributes were not read from the paid Part 1 text.

### E10. Capacity is used to schedule authorization, not to rewrite history

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WO section 3.9. S-OD-WC planning and performance.
- Observation: On ERPNext Work Order submit, the system reserves a slot for each operation after the planned start date from workstation timings, holiday list, and other scheduled operations. If the operation needs more time than an available slot, the system asks the user to break the operations. Odoo planning by work center shows scheduled minutes. Performance reports compare real duration to expected duration after the fact.
- Limits: Neither page treats a missed slot as an automatic cancellation of the authorization.

## Intent, plan, order, authorization

### E11. Production plan is not a work order

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-PP. S-VF-PLAN.
- Observation: ERPNext Production Plan plans manufacture against sales orders or material requests, then after submit offers Work Orders and Material Requests. Closing a plan stops new Work Orders against it. Sub-assembly rows choose in-house Work Order, subcontract purchase order, or material request. ValueFlows says a plan is a schedule of related operational processes with defined deliverables. A plan can be generated from a recipe and later tweaked. Nested processes can produce and consume intermediates that never leave the plan.
- Limits: Odoo Master Production Schedule page was listed in the workflows index and not fetched this session. That cell is thinner.

### E12. ERPNext Work Order is a shop-floor signal to make a quantity

- Kind: source-system artifact
- Decision state: `supported` as ERPNext's authorization document.
- Citation: S-EN-WO.
- Observation: A Work Order is a document given to the manufacturing shop floor by the production planner as a signal to manufacture a certain quantity of a certain item. It copies BOM materials and operations. Submit reserves raw materials in source warehouses. Start transfers to WIP. Finish creates the manufacture stock entry. Partial finish is allowed. Stop is blocked while transferred materials have not been returned. Extra transfer above BOM qty needs a manufacturing setting percentage.
- Limits: The document mixes authorization, reservation, warehouse assignment, and progress fields. Those are different facts.

### E13. Odoo manufacturing order creates work orders for operations

- Kind: source-system artifact
- Decision state: `supported` as Odoo naming.
- Citation: S-OD-MFG. S-OD-BOM. S-OD-WC. S-OD-BY.
- Observation: The manufacturing app schedules, plans, and processes manufacturing orders. Enabling Work Orders makes work centers appear. Operations on the BoM become work orders when the manufacturing order is confirmed. Produce All on a confirmed manufacturing order updates finished goods and by-products.
- Limits: First-party pages fetched this session do not spell a full manufacturing-order state machine. Shop-floor start and stop live on work orders.

### E14. Moqui production run is a WorkEffort purpose with produce and consume lines

- Kind: source-system artifact
- Decision state: `supported` as Mantle's cut. `hypothesis` that WorkEffort is the right enduring type.
- Citation: S-MQ-WE `WepProductionRun`. `WorkEffortProduct` types `WeptProduce`, `WeptConsume`, `WeptRouting`. S-MQ-30. S-MQ-RN.
- Observation: A production run is a WorkEffort purpose under manufacturing. Products on the run are typed produce, consume, or routing. Asset issuance links to those lines. Release notes describe GL posting for WIP inventory on issuance and receipt. David Jones writes that mantle-usl supports large-scale but simple manufacturing, single-level BOM and single-step production, no routes. Multi-step shops do separate runs with interim inventory.
- Limits: Absence of a rich routing UI is a product-scope fact, not proof that routing is not domain-level. ERPNext and Odoo have it.

### E15. ValueFlows Intent, Commitment, and Economic Event are the same flow shape at different firmness

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-FLW. S-VF-MODEL. S-VF-SPEC. S-VF-CORE.
- Observation: Recipes generate plans including processes and commitments or intents. A commitment is a planned or scheduled flow promised by one agent to another. An economic event is a real flow that actually happened. Events fulfill commitments. Commitments or events satisfy intents. An event can correct a previous event or reverse it completely. Knowledge, plan, and observation are three layers over the same IPO pattern.
- Limits: Whether OS should adopt these three names is issue 13 and RFC-0001 work, not this folder's decision.

## Material, WIP, output

### E16. Reservation, transfer to WIP, and consumption are three quantities

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WO required items table. S-EN-BOM consume components.
- Observation: ERPNext tracks required quantity from the BOM, transferred quantity into the WIP warehouse, and consumed quantity when the finished product is manufactured. Consume-on-complete can follow BOM quantities times finished qty, or only materials physically transferred. Skip material transfer treats raw material as consumed from the source warehouse. Return components creates a reverse transfer after completion.
- Limits: Odoo flexible consumption is Allowed, Allowed with warning, or Blocked against BoM qty. It does not use the same three-column table.

### E17. Backflush is a recording rule, not a different kind of consumption

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-BOM consume components. S-EN-SCRAP. S-EN-SC backflush. S-OD-BOM flexible consumption.
- Observation: ERPNext can consume automatically from BOM or from material transferred. Scrap from the BOM works only if the manufacture entry is created based on BOM, not based on material transfer. Subcontracting backflush can consume even when nothing was transferred, if stock exists at the supplier warehouse, or can consume only what was transferred. Odoo can force operators to enter consumed qty or block deviation from the BoM.
- Limits: The word backflush is ERP jargon. The domain fact is that observed consumption may be inferred from a specification or from a prior issue.

### E18. WIP is a warehouse or in-process quantity, not a product kind

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WO warehouses. S-MQ-RN. S-VF-REC stage.
- Observation: ERPNext assigns source, WIP, target, and scrap warehouses on the Work Order. Materials move source to WIP on start, WIP to target on finish. Mantle posts WIP inventory on issuance and receipt. ValueFlows keeps the same resource through workflow stages. Jones says multi-step Mantle users store interim inventory between runs.
- Limits: Whether WIP is a location, a stage on a resource, a valuation class, or all three is still open. See Q4 in `open-questions.md`.

### E19. Planned scrap, process loss, pending remainder, and scrap-as-disposition are different

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-BOM scrap and process loss. S-EN-JC pending qty. S-EN-SCRAP. S-OD-SCRAP. S-OD-BY.
- Observation: ERPNext BOM scrap can name a by-product with rate, or the same item as the production item, which becomes process loss subtracted from manufactured qty. Job Card v16 pending qty stops the remainder from being treated as process loss. Odoo scrap moves damaged items to a virtual scrap location. Odoo by-products are residual outputs added on Produce All. ERPNext Job Card also has a scrap items table for defective materials during an operation.
- Limits: Co-product as equal-value joint output is named by ValueFlows and not by the Odoo by-product page.

### E20. ValueFlows does not classify outputs as good or bad

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-PRC. S-VF-REC.
- Observation: Usually processes have one output, but not always. Co-products have somewhat equal value. By-products are secondary. Some are useful. Some are harmful. ValueFlows does not distinguish good and bad resources. A recipe knows its primary reason for being and does not directly know by-products and co-products. Those are found by reading the input-process-output graph.
- Limits: ERP and costing systems often need a primary output for valuation. That pressure is real and may force a primary-output mark without making other outputs a different ontological kind.

### E21. Substitution is an allowed deviation from the specification, recorded on the order or issue

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-ALT. S-EN-WO allow alternative item. S-MQ-PROD `PatEquivalent`.
- Observation: ERPNext Item Alternative names a similar item that can replace the BOM item. Allow Alternative Item can be set on item, BOM, Work Order, or a required-item row. The alternate is selected on the Work Order or stock entry. The same feature applies when transferring subcontract materials. Moqui has `PatEquivalent` as an association type.
- Limits: Two-way replacement is a policy. It does not make the two specifications the same specification.

## Rework, unbuild, subcontract, genealogy

### E22. Rework can keep the same resource or mint a new one

- Kind: domain evidence
- Decision state: `supported` as a ValueFlows cut. `hypothesis` that ERPNext and Odoo always pick one.
- Citation: S-VF-ACT accept and modify versus consume and produce. S-OS-SCEN S-009.
- Observation: ValueFlows `accept` and `modify` keep the same identified resource. Stage becomes the process specification of the process. Use this when identity must survive repair, testing, or a series of creating processes. Use consume and produce when input and output need different resource specifications. ERPNext Job Card quality inspection tracks in-process goods against the production item. Odoo unbuild dismantles a finished product back into components, optionally linked to the original manufacturing order.
- Limits: Neither ERPNext nor Odoo page fetched this session defines a first-class Rework document. Unbuild is the reverse of manufacture, not shop-floor rework of a failed unit.

### E23. Subcontracting is production by another agent, with three component-custody patterns

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-SC. S-OD-SUB. S-OD-SUB-B. S-OD-SUB-R. S-VF-ACT transferCustody.
- Observation: ERPNext models subcontracting as a purchase of a service item plus a BOM of supplied materials, a supplier warehouse, send-to-subcontractor, and a subcontracting receipt that backflushes consumption and can receive scrap. Supplier-sourced nuts and bolts sit on the BOM at zero value and do not appear in supplied items. Odoo uses a Subcontracting BoM type. Basic, resupply, and dropship differ by who obtains components. Finished goods may return to the contractor or go to the customer. ValueFlows `transferCustody` covers sending a resource to another agent for a service without transferring rights.
- Limits: ERPNext still uses purchase documents. Odoo still uses a purchase order to trigger the flow. Those documents are source artifacts around a shared domain cut.

### E24. Transformation contribution is many-to-many and may span events

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EPCIS-20 section 7.4.5. S-EPCIS-GL.
- Observation: A TransformationEvent records that input objects are fully or partially consumed and output objects are produced, such that any of the inputs may have contributed to each of the outputs. Unlike aggregation, inputs no longer exist and cannot be separated later. A long process may be several events sharing `transformationID`. Then any input to any of those events may have contributed to any output of those events. If `transformationID` is omitted, one event must list at least one input and one output.
- Limits: EPCIS does not model BOM, routing, capacity, or authorization. It is an observation interchange.

### E25. ValueFlows track and trace walk the same IPO graph as recipes and plans

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-CORE. S-VF-REC. S-VF-ACT.
- Observation: Recipes, plans, and tracking or tracing economic events connect the same way. An input of one process matches an output of another when the resource specification matches, or when specification plus stage and state match. Forward is tracking. Backward is tracing or provenance. Circular flows are allowed.
- Limits: Walking a graph is an algorithm over events. It is not a stored genealogy table, though a runtime may index it.

## ISA-95 public evidence

### E26. ISA-95 splits enterprise planning from manufacturing operations

- Kind: domain evidence
- Decision state: `supported` for the level cut. `undetermined` for object attributes.
- Citation: S-ISA-LAND.
- Observation: ISA-95, also IEC 62264, integrates logistics and manufacturing control. Level 0 is physical process. Level 1 is sense and actuate. Level 2 is supervisory control. Level 3 is manufacturing operations management. Level 4 is business planning and logistics. The standard primarily deals with the interface between levels 3 and 4. Parts 1 through 8 cover models, objects, activity models, MOM objects, business-to-manufacturing transactions, messaging, aliases, and exchange profiles. The framework is activity-based, not technology-based.
- Limits: The landing page does not define Product Definition, Production Schedule, or Production Performance. Those names appear in secondary material.

### E27. A working draft distinguishes work definition, schedule, performance, and capability

- Kind: domain evidence
- Decision state: `hypothesis`. Not `supported`. The text is a public HTML mirror of a Part 4 working draft, not the paid IEC publication.
- Citation: S-ISA-WD.
- Observation: The draft says work definition specifies resources required to perform a unit of work, and that the actual definition of how to perform the work is not included in the object model. Work schedule is a detailed schedule that may define production, maintenance, inventory, or quality activities. Work performance is a report on execution. Work capability reports capabilities. A work request may have one or more work responses if the facility splits the request. Product definition, production capability, production schedule, and production performance are named as the enterprise-control information categories.
- Limits: Until a first-party IEC or ISA Part 1 page is readable, treat object names as hypotheses. Do not design a schema from them.

## Cross-cutting source artifacts

### E28. Same English words, different layers

- Kind: source-system artifact
- Decision state: `supported`
- Citation: S-EN-WO. S-EN-JC. S-OD-WC. S-VF-PRC.
- Observation: ERPNext Work Order is authorization. ERPNext Job Card is execution. Odoo Manufacturing Order is authorization. Odoo Work Order is execution. ValueFlows Process is one instance that can hold intents, commitments, and events. Moqui WorkEffort is a general work record whose purpose may be a production run.
- Limits: Importing any of these type names into OS would hide the layer cut.

### E29. Phantom BOM explodes always and produces no stocked item

- Kind: source-system artifact
- Decision state: `supported` as ERPNext behavior. `hypothesis` as a domain kind.
- Citation: S-EN-BOM Is Phantom BOM.
- Observation: A phantom BOM does not produce an item. It is a logical grouping of raw materials. The production item is non-stock. When that non-stock item appears as a raw material in another BOM, it explodes automatically even if multi-level explosion is off.
- Limits: This may be a planning convenience over a process that has no inventoried intermediate. ValueFlows would just omit the intermediate resource.

### E30. Kit BoM is not manufacture

- Kind: source-system artifact
- Decision state: `hypothesis`
- Citation: S-OD-BOM opening. S-OD-SUB BoM Type field.
- Observation: Odoo BoMs serve as blueprints for manufactured goods and kits. Subcontracting is a BoM type. Manufacture this Product is the manufacturing type.
- Limits: Kit semantics were not fetched on a dedicated page this session. Do not treat kit as proven manufacture.

### E31. Consume, use, cite, and work are different input actions

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-VF-ACT.
- Observation: Consume decrements a transformed or used-up input. Use occupies equipment that still exists afterward. Cite names knowledge that remains available. Work is labor, usually without an inventoried resource, typed by a resource specification. Pickup and dropoff keep the same resource through transport. Combine and separate pack and unpack.
- Limits: ERPNext and Odoo collapse most of this into material issue plus time on a work center. The finer actions still explain equipment versus ingredient versus instruction.

### E32. Quality inspection can attach to an operation, not only to finished goods

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-JC tracking quality inspection. S-EN-OP. S-EN-BOM inspection required.
- Observation: ERPNext v13 Job Card can create a quality inspection for the production item against the operation. In-process tests differ from incoming and outgoing tests. Operation can carry a default quality template. BOM can make quality inspection mandatory for raw materials and finished goods.
- Limits: Release-to-stock as a separate authorization was not fetched as its own first-party page.

### E33. Unbuild is a compensating transformation, not deletion

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-OD-UNB.
- Observation: Odoo unbuild dismantles manufactured products into components so inventory counts stay accurate. The order can point at the original manufacturing order and at lot or serial identity. Completing it decreases finished goods and increases components. Unusable recovered parts need a separate scrap order. Unbuilding with zero on-hand is possible and warned against.
- Limits: This is the inverse of a manufacture observation. It does not erase the original manufacturing order.

### E34. Extra issue and unused return are first-class after the BOM copy

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WO transfer additional materials. Return non consumed materials.
- Observation: After all required materials are transferred, extra transfer appears only if Manufacturing Settings allow a percentage of extra raw materials. Return components after completion creates a material-transfer-for-manufacture stock entry back to stores. Stop is refused while WIP still holds transferred material.
- Limits: The percentage cap is an application policy. The need to issue more than planned, and to return unused, is domain-level.

### E35. Sub-assembly can be made, bought, or subcontracted under one plan

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-PP fetching sub assembly items. S-EN-WO use multi-level BOM.
- Observation: Production Plan sub-assembly rows choose in-house, subcontract purchase order, or material request. Combining rows with the same item, warehouse, BOM, and manufacturing type yields one bulk Work Order. Use Multi-Level BOM on a Work Order explodes nested materials. Disabling it treats the sub-assembly as an issued stock item.
- Limits: The choice is a planning decision about whether an intermediate is a stocked resource.

### E36. Costed plan and actual operating cost are different numbers

- Kind: domain evidence
- Decision state: `supported`
- Citation: S-EN-WO operation cost. S-EN-BOM costing. S-OD-WC cost per hour. S-MQ-PROD `CostComponentType` estimated standard versus actual.
- Observation: ERPNext Work Order shows planned operating cost from the BOM, actual operating cost from Job Cards, additional operating cost, and total as actual plus additional. BOM costing can be updated after submit when rates change. Odoo work center has cost per hour and time efficiency. Mantle enumerates estimated standard and actual material, route, labor, general, and indirect cost components.
- Limits: Costing methods are accounting. The split between planned and actual effort is manufacturing.
