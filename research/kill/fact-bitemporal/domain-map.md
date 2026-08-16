# Domain-by-domain requirement map

**Kind:** domain evidence, source-system artifact, candidate law  
**Decision state:** per cell. The map as a whole is `hypothesis` until issues 32, 33, and 35 confirm manuals against code.  
**Issue:** https://github.com/EnzoTironi/OS/issues/59

Placement words are defined in [`criteria.md`](criteria.md). They apply to the type or property named in the row, not to the whole engine.

| Domain | Fact placement | Dual-time placement | What operators actually ask | Evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| Accounting journal and GL | **Rejected** as the write unit. The voucher is the identity. Lines are not independently committable facts. | **Optional** knowledge time on the posting. **Rejected** valid-time portion rewrite of a posted row. | What was posted. How it was reversed. What the closed period still shows. | ERPNext original plus reversal. ValueFlows `corrects`. Odoo Lock Everything. | `supported` |
| Inventory on-hand | **Compositional.** Quantity is a projection over movements. A Fact for "the quantity" hides book versus count. | **Native** distinction between posting or occurrence time and record time when backdating exists. **Optional** full rectangles. | What do we believe we have now. What did we believe on Tuesday. What was later shown to have left on Monday. | ERPNext FIFO and moving-average repost. Odoo and ERPNext post an adjustment rather than overwrite. S-007. | `supported` for the two questions. `hypothesis` for native engine operators |
| Inventory lot and serial identity | **Rejected** decomposition of identity into quantity facts. Lot identity and quantity are different concerns. | **Compositional** occurrence time on transformation events. | Which lot was consumed. Which customers received outputs. | S-008. EPCIS transformation events. | `hypothesis` pending issues 32, 38 |
| Order-to-cash dates | **Rejected** generic Fact for "the delivery date." | **Compositional** dated properties on Intent, Commitment, Plan, and Event. Dual time only if a promise is later corrected. | What was requested, promised, planned, and delivered. | S-001. ValueFlows layers. | `supported` as a layering rule |
| Order and order line identity | **Rejected** as independent facts. Partial fulfillment attaches to the commitment identity. | **Optional** knowledge time on amendments. | What remains open on this order. | S-002. Palantir object identity plus Actions. | `hypothesis` |
| Procure-to-pay match | **Rejected** collapsing receipt, invoice, and payment into rival facts about one amount. | **Compositional** occurrence or posting dates per document. | Do the three documents match. | ERPNext buying manuals as cited by issue 4. Not re-traced here. | `undetermined` in this pass |
| Pricing | **Compositional** price as a dated assignment. | **Compositional** Valid From and Valid Upto. **Rejected** mandatory system-time rectangles on every list row. | What price applied on the quote date. Rarely what the list looked like before a typo fix. | ERPNext Item Price validity fields. | `supported` |
| Published quote or contract price | **Rejected** recomputing the quote from a later list. The quote is a decision. | **Optional** knowledge time if the list is later corrected and audit asks what the quoter saw. | What did we commit to. | S-001 promise versus later actual. | `hypothesis` |
| Manufacturing plan versus execution | **Rejected** one Fact for "the start time." | **Compositional** planned start, actual start, recorded-at. | Variance and late scrap. | S-009. ValueFlows Process versus EconomicEvent. | `supported` as a distinction. `hypothesis` as types |
| Manufacturing as-built | **Compositional** event plus frozen instance data. | **Rejected** replaying current product master over a past event as if it were the as-built. | What was true of this lot at event time. | EPCIS ILMD is embedded and permanent as of event time. | `supported` for the freeze. `hypothesis` for OS types |
| Logistics visibility | **Rejected** Fact as the unit. The unit is a typed visibility event. | **Native** Event Time versus Record Time as two fields, not four interval columns. Record Time is optional. | When did the step happen. Which events arrived since the last query. | GS1 guideline. EPCIS 2.0 XSD. SHACL `eventTime` minCount 1, `recordTime` optional. | `supported` |
| Employment exclusive assignment | **Rejected** independent role facts without a spanning exclusivity constraint. | **Compositional** validity interval. **Optional** `WITHOUT OVERLAPS`. **Rejected** the same constraint on dual contracts. | Who held the seat on that day. | SQL:2011 Emp example. S-006. | `supported` for exclusivity being earned |
| Employment compensation history | **Compositional** dated versions. | **Optional** dual time when a raise is recorded in March, effective January, after payroll ran. | What should have been paid. What was paid. What we knew when we paid. | Kulkarni user-owned application time. Odoo lock moves late recognition. | `hypothesis` |
| Insurance or future-dated policy | **Compositional** policy as an object with an effective interval. | **Native** valid time that may sit in the future. System-time-only tables cannot represent the insert-before-effective case. | What is in force on the effective date. What did we record today. | Kulkarni insurance insert. XTDB address change next month. | `supported` |
| Fiscal close and tax | **Rejected** mutating closed-period facts. | **Native** period lock as policy over valid-time writes. Knowledge time still advances. | Can this period still change. | Odoo Lock Everything and Hard Lock. ERPNext freeze and Accounting Period. | `supported` |
| CRM ticket or operational object | **Rejected** Fact as the stored unit. The object index is the working picture. | **Optional** edit history. Palantir can drop all edits. That is a product hatch, not a semantic guarantee. | What is the ticket now. Sometimes who changed it. | Palantir user-edits-win and most-recent-timestamp merge. Losing values leave the object. | `supported` as a warning |
| Master data display name, color, sort | **Rejected** Fact atoms. | **Rejected** dual time. | What is the current label. | No source asks `known then` for a color. Datomic `:db/noHistory` is the nearby hatch. | `supported` |
| Sensor, IoT, high-churn series | **Rejected** bitemporal Fact rectangles per reading. | **Compositional** occurrence instant. Record time optional for late ingest. | What did the sensor report at T. | EPCIS sensor elements sit on events, not on enduring master rows. SQL Server blob-in-temporal cost. | `supported` |
| Planning and MRP | **Rejected** treating a plan as an observed Fact. | **Compositional** planned interval. Dual time only if a published plan must be explained later. | What did we plan. What did we do. | Thesis plan versus execution. ValueFlows Intent versus Event. | `hypothesis` |
| Payments and settlement | **Rejected** editing a settled payment into a new Fact. | **Optional** knowledge time. Correction is a later payment or reversal. | What settled. What was reversed. | ERPNext Payment Entry follows the immutable-ledger rule. | `hypothesis` |
| Quality disposition | **Compositional** inspection event. | **Compositional** occurrence time. | When was it rejected. What lot. | S-009. | `undetermined` |
| Ontology and policy revision | **Rejected** treating a definition change as a valid-time Fact about instances. | **Rejected** using either clock as the meaning pin. | Why was this Action legal then. | Datomic `as-of` does not restore the past schema. S-012. Issue 9 owns the pin. | `supported` as a third pin, not a clock |
| UI, form, and view metadata | **Rejected** | **Rejected** | How should this screen look. | Constitution §6. Surfaces are not domain meaning. | `supported` |

## How to read a cell

**Rejected** means do not put this concern in the kernel as a default for that domain.

**Native** means the engine must refuse a silent wrong write or a silent wrong read.

**Optional** means the type may declare the capability.

**Compositional** means ordinary properties, events, and constraints already carry the meaning.

A row can mix placements. Inventory on-hand rejects a quantity Fact, requires the two time questions when backdating exists, and still does not require four columns on every stock field.

## Gaps

Procure-to-pay three-way match, quality, and payments are thinner than accounting, inventory, pricing, employment, and logistics. Issue 17, 21, and 26 should consume this map rather than inherit these cells as law.
