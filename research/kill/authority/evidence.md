# Evidence

**Kind.** reference  
**Fetched.** 2026-08-16  
**Decision.** per record

Each record is one observation. Interpretation lives in [`catalog.md`](catalog.md) and [`candidate-laws.md`](candidate-laws.md).

### E-001 ValueFlows layers

- Grade: `official-doc`
- Claim supported: Intent, Commitment, Economic Event, and Claim are different flow kinds.
- Citation: Valueflows, Flows, accessed 2026-08-16, https://www.valueflo.ws/concepts/flows/
- Observation: Intents are potential future events not yet agreed. Commitments are agreed future events. Economic Events are past observed flows. Claim is a receiver-initiated economic object, not an epistemic rumor.
- Limits: Vocabulary, not an ERP implementation.

### E-002 ValueFlows corrections

- Grade: `official-doc`
- Claim supported: A recorded economic event is not edited in place. A later event with `corrects` adjusts it.
- Citation: Valueflows, Accounting, Making Corrections, accessed 2026-08-16, https://www.valueflo.ws/concepts/accounting/
- Observation: Reports may already have used the original. The correction event carries the date of correction. Events also store computer-generated `created` time so late entry stays separable from event time.
- Limits: Customary practice described by the vocabulary authors.

### E-003 Palantir identity versus observation

- Grade: `official-doc`
- Claim supported: A measurement or event row is not the measured entity.
- Citation: Palantir, Ontology design: Best practices, Domain-driven design, accessed 2026-08-16, https://palantir.com/docs/foundry/ontology/ontology-best-practices/
- Observation: "Separate identity from observation." A CSV of order, customer, and product is at least three entities. Canonical object type is a DRY rule for one concept, not a winner among rival observations.
- Limits: Product modeling guidance.

### E-004 Palantir forbids property multiplicity

- Grade: `official-doc`
- Claim supported: Foundry will not map two datasources onto one non-key property.
- Citation: Palantir, Multi-datasource object types, FAQ "Is property multiplicity supported?", accessed 2026-08-16, https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/
- Observation: Column-wise MDOs require each property from exactly one datasource. Row-wise union of two full objects is unavailable. Missing keys yield null properties.
- Limits: Object Storage v2 product constraint.

### E-005 Palantir hides losing values

- Grade: `official-doc`
- Claim supported: When a user edit and a datasource both write one object, Foundry elects one property value in the index.
- Citation: Palantir, How user edits are applied, Resolve conflicting user edits and datasource updates, accessed 2026-08-16, https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- Observation: Default strategy is "user edits always win" for edited properties. Alternate strategy compares action time to a UTC timestamp column on the input datasource. Deletions are not edits. The losing value leaves the object.
- Limits: Index merge. Not a domain law.

### E-006 ERPNext promised date is not shipment

- Grade: `official-doc`
- Claim supported: Sales Order Delivery Date is a promise. Delivery Note posting is the shipment record.
- Citation: Frappe, Sales Order, updated 2026-07-25, https://docs.frappe.io/erpnext/sales-order . Frappe, Delivery Note, https://docs.frappe.io/erpnext/delivery-note
- Observation: The Sales Order "records a customer's confirmed request" and "Delivery Date" is "the default promised date." Submission "does not deliver stock or recognize an invoice." A Delivery Note "updates the inventory" when submitted.
- Limits: Manual, not tests.

### E-007 Odoo promised date is not expected date

- Grade: `official-doc`
- Claim supported: Customer delivery date and computed expected date are different fields.
- Citation: Odoo 17.0, Create quotations, Delivery section, accessed 2026-08-16, https://www.odoo.com/documentation/17.0/applications/sales/sales/send_quotations/create_quotations.html
- Observation: Delivery Date is a selected customer delivery date. Expected date sits beside it when no custom date is required. Shipping Policy changes which lead time schedules the delivery order.
- Limits: UI manual. Field names in code were not used as evidence.

### E-008 ERPNext stock reconciliation posts a new balance

- Grade: `official-doc`
- Claim supported: Book quantity and counted quantity are two inputs. Submit writes a dated reconciliation, not an overwrite of history.
- Citation: Frappe, Stock Reconciliation, updated 2026-03-06, https://docs.frappe.io/erpnext/stock-reconciliation
- Observation: Purpose can be Opening Stock or Stock Reconciliation. Current quantity is fetched. The user changes quantity as of a posting date and time. Difference Account defaults to Stock Adjustment.
- Limits: Manual.

### E-009 Odoo count is not on-hand until apply

- Grade: `official-doc`
- Claim supported: Counted Quantity and On Hand Quantity stay distinct until Apply creates a stock move.
- Citation: Odoo 17.0, Inventory adjustments, accessed 2026-08-16, https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html
- Observation: Count is recorded but not applied. If stock moved between count and apply, Odoo asks for confirmation. Apply creates a stock move line in Moves History.
- Limits: Manual.

### E-010 GS1 ownership is not possession

- Grade: `official-doc`
- Claim supported: Owning party and possessing party are different source or destination types.
- Citation: GS1, Core Business Vocabulary, Release 2.0, ratified Jun 2022, section 7.4.3, https://ref.gs1.org/standards/cbv/
- Observation: `owning_party` denotes who owns or is intended to own the objects. `possessing_party` denotes who has or is intended to have physical possession. `location` is a third type.
- Limits: Visibility vocabulary, not a stock ledger.

### E-011 GS1 sensor readings are event How, not object identity

- Grade: `official-doc`
- Claim supported: Sensor data rides on an event. It does not replace the object.
- Citation: GS1, EPCIS Standard, Release 2.0, ratified Jun 2022, release notes for SensorElement and How dimension, https://ref.gs1.org/standards/epcis/2.0.0/
- Observation: EPCIS 2.0 adds SensorElement for sensor data and a How event dimension. CBV says the How dimension holds SensorElementList with sensorReport observations and optional sensorMetadata.
- Limits: Interchange standard. No election of a winning sensor.

### E-012 GUM two readings can both be estimates

- Grade: `official-doc`
- Claim supported: A measurement result is incomplete without uncertainty. Two readings of one measurand can both be valid estimates.
- Citation: JCGM 100:2008, clause 3.1.2, https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf
- Observation: "The result of a measurement is only an approximation or estimate of the value of the measurand and thus is complete only when accompanied by a statement of the uncertainty of that estimate."
- Limits: Metrology guide. Does not name an ERP disposition Action.

### E-013 ERPNext quality can accept a failed reading

- Grade: `official-doc`
- Claim supported: Automatic reject from a range can be overridden by a manual status. The whole inspection status is then a user decision.
- Citation: Frappe, Quality Inspection, section 3.3 Manual Inspection, updated 2026-02-27, https://docs.frappe.io/erpnext/quality-inspection
- Observation: Numeric checks auto-reject out-of-range readings. Manual Inspection leaves row status to the user. The example accepts a reading outside range because it is close. "The status for the entire Quality Inspection can then be decided by the user."
- Limits: Manual. Tolerance policy is not formalized.

### E-014 IAS 8 estimate is not error

- Grade: `official-doc`
- Claim supported: New information that changes an estimate is not a correction of a prior error.
- Citation: IFRS Foundation, IAS 8, 2026 issued HTML, paragraphs 34, 41, 42, https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias8.html
- Observation: Paragraph 34. A change in estimate "does not relate to prior periods and is not the correction of an error." Paragraph 41. Material prior-period errors are corrected later. Paragraph 42. Material prior-period errors are corrected retrospectively in the first statements after discovery, subject to impracticability.
- Limits: Financial reporting, not operational stock.

### E-015 SAP parallel ledgers keep two books

- Grade: `official-doc`
- Claim supported: IFRS and local GAAP can both be posted without merging into one profit number.
- Citation: SAP Help, Customizing for Parallel Accounting, Parallel Accounting with Ledgers, https://help.sap.com/doc/cef748510c276239e10000000a423f68/700_SFIN3E%20006/en-US/8e4fefe119e7449d968cd3f6b5f9a438.html . SAP, Universal Parallel Accounting, 2023.0_UPA, opening paragraphs, https://help.sap.com/doc/d078f3c7e8724bb283e30298f5ae422f/2023.0_UPA/en-US/88d56705fac34577992614b5509e7e91.pdf
- Observation: New G/L can depict parallel accounting with accounts or ledgers. UPA "allows you to perform valuation runs and other closing tasks for your company using different accounting standards independently per ledger."
- Limits: Product customizing. Leading-ledger choice is a reporting default, not proof that one book is ontologically true.

### E-016 ERPNext Party Link does not merge masters

- Grade: `official-doc`
- Claim supported: One legal party can remain two masters. The link is an accounting workflow.
- Citation: Frappe, Common Party Accounting, updated 2026-08-03, https://docs.frappe.io/erpnext/common-party-accounting
- Observation: "Does Party Link merge the Customer and Supplier? No." Customer and Supplier stay separate because sales, purchase, tax, credit, and portal behavior differ. The link automates a journal when policy permits offset.
- Limits: One product's party model.

### E-017 Microsoft virtual tables keep data in the ERP

- Grade: `official-doc`
- Claim supported: An imported ERP view can remain a proxy. Copying creates a second store.
- Citation: Microsoft Learn, Virtual entities overview, 2026-01-21, commit `f3620b9f4e646da05b8104ef906fc7bff4811316`, https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/power-platform/virtual-entities-overview . Microsoft Learn, Dual-write versus virtual tables, accessed 2026-08-16, https://learn.microsoft.com/en-us/training/modules/get-started-with-powerapps-common-data-service/2b-dual-write-vs-virtual-table
- Observation: Virtual entity data "doesn't reside in Dataverse. Instead, it continues to reside in the app where it belongs." Dual-write is the complementary copy path for near-real-time sync.
- Limits: Integration architecture. Conflict policy after dual-write drift was not read in a named dual-write conflict page this pass.

### E-018 PROV records alternates and revisions, not winners

- Grade: `official-doc`
- Claim supported: Provenance can say two entities are alternates or that one revises another. It does not elect a business value.
- Citation: W3C, PROV-O, 2013-04-30, expanded properties `prov:alternateOf`, `prov:wasRevisionOf`, `prov:wasInvalidatedBy`, `prov:hadPrimarySource`, https://www.w3.org/TR/2013/REC-prov-o-20130430/
- Observation: `alternateOf` links entities that present aspects of the same thing, not necessarily the same aspects or the same time. `wasRevisionOf` marks substantial derived content. `hadPrimarySource` cites a firsthand record such as a sensor reading. Invalidation bounds lifetime.
- Limits: Provenance interchange. Trust assessment sits outside the core triples.

### E-019 ERPNext sales status is a projection

- Grade: `official-doc`
- Claim supported: "To Deliver and Bill" is derived from delivery and billing progress, not a second source's opinion of the same promise.
- Citation: Frappe, Sales Order, Status, updated 2026-07-25, https://docs.frappe.io/erpnext/sales-order
- Observation: Statuses include Draft, To Deliver and Bill, To Deliver, To Bill, Completed, On Hold, Closed, Cancelled. Delivery Status and Billing Status are separate filters. An imported ERP "status" string that collapses those is a source artifact.
- Limits: One product's status machine.
