# Moqui and Mantle Entity, Service, and universal business artifacts

- Artifact ID: `issue-0034-moqui-mantle-archaeology`
- Issue: `https://github.com/EnzoTironi/OS/issues/34`
- Parent: `https://github.com/EnzoTironi/OS/issues/2`
- Research angle: Entity versus Service separation, verb plus noun services, transaction and ECA composition, and Mantle Party, Product, Asset, Order, Shipment, Invoice, Payment models
- Decision states present: `hypothesis`, `supported`, `undetermined`

Lookup files for this note live under `research/moqui/`.

## 1. Question

Which Moqui Service patterns are equivalent to a first-class Action, which Mantle distinctions are domain law rather than framework habit, and where ERPNext or Odoo collapse those distinctions?

A Service is Action-equivalent only if it names a business verb, carries authority and validation, owns a transaction boundary, and can fail without rewriting history as if the attempt never existed.

## 2. Source scope

Examined on 2026-08-15.

- Moqui Framework `master` at `2f1de53ee33055b17e71f83629305610da8a7250`. License CC0 1.0 with a separate patent grant. `https://github.com/moqui/moqui-framework`
- Mantle UDM `master` at `f53aba96a14fc97c6b42918300ee880fa0eb03a1`. License CC0 1.0 with a separate patent grant. `https://github.com/moqui/mantle-udm`
- Mantle USL `master` at `6b6ce35e7a000b5e476d51f91413bc98d7f75f89`. License CC0 1.0 with a separate patent grant. `https://github.com/moqui/mantle-usl`
- Official Moqui Framework docs, accessed 2026-08-15. Service Definition, Calling Services, Tool and Configuration Overview, Entity ECA Rules.
- Official Mantle Structure and UDM docs, accessed 2026-08-15. Overview, Party, Product, Order, Shipment, Accounting.
- ERPNext Customer and Sales Order docs on `docs.frappe.io`, accessed 2026-08-15.
- Odoo 18.0 Sales quotations and Contacts docs, accessed 2026-08-15.

Not examined.

- Making Apps with Moqui PDF.
- Live Moqui demo or running tests.
- Apache OFBiz source, even though Mantle inherits some vocabulary from that lineage.
- ERPNext and Odoo source trees in this pass. Matrix cells that need source are `undetermined`.
- Palantir, ValueFlows, and UFO except as already stated in `research/reference-landscape.md`.

## 3. Evidence

### E-001 Service is the main unit of logic

- Grade: `official-doc`
- Claim supported: Moqui treats a Service as the unit of logic, not an Entity write.
- Citation: `https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition`, accessed 2026-08-15
- Observation: The page says the main unit of logic is the service. Services are transactional, authenticated, authorized, validated, and callable sync, async, or on a schedule. They can trigger other services through SECA rules.
- Limits: Documentation, not a production trace.

### E-002 Verb plus noun service names

- Grade: `official-doc`
- Claim supported: A service name is path, verb, and optional noun, written `${path}.${verb}#${noun}`.
- Citation: `https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition`, accessed 2026-08-15. Same claim in `https://www.moqui.org/docs/framework/Tool+and+Config+Overview`.
- Observation: The docs give `mantle.party.PartyServices.create#Person` as the example. Verb is required. Noun is recommended and must be an entity name for entity-auto services.
- Limits: Naming convention can be used for CRUD verbs as well as business verbs.

### E-003 Implicit entity CRUD services exist

- Grade: `official-doc`
- Claim supported: The Service Facade invents create, update, and delete services from an entity definition.
- Citation: `https://www.moqui.org/docs/framework/Tool+and+Config+Overview`, Service Naming section, accessed 2026-08-15
- Observation: A caller can run `update#UserAccount` with no path. The noun is the entity name. Defined entity-auto services also require the noun to be the entity name.
- Limits: This is a first-class mutation path that is not a named business verb.

### E-004 create#Person composes Party, Person, and optional role

- Grade: `official-doc`
- Claim supported: A defined business service can compose several entity writes under one verb.
- Citation: `https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition`, accessed 2026-08-15
- Observation: The documented `create#Person` service auto-parameters Party and Person, requires first and last name, creates Party with `partyTypeEnumId` `PtyPerson`, creates Person, and creates PartyRole when `roleTypeId` is present.
- Limits: Example is documentation XML. Behavior should be rechecked against `PartyServices.xml` at the USL SHA.

### E-005 Service transaction modes

- Grade: `official-doc`
- Claim supported: The service definition owns transaction policy.
- Citation: `https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition`, transaction attributes, accessed 2026-08-15
- Observation: Options are ignore, use-or-begin as default, force-new, cache, and force-cache. Timeout applies only when the service begins the transaction. A caller can also `requireNewTransaction` on `ServiceCallSync`.
- Limits: JTA, Bitronix, and transaction cache are framework mechanics.

### E-006 Commit and rollback callbacks

- Grade: `official-doc`
- Claim supported: A service can be registered to run on commit or rollback of the current transaction.
- Citation: `https://www.moqui.org/m/docs/framework/Logic+and+Services/Calling+Services`, accessed 2026-08-15. `ServiceFacade.special()` in Moqui 3.0.0 javadoc.
- Observation: `special()` has `registerOnCommit` and `registerOnRollback`. It has no `call()` method.
- Limits: Useful for effects that must not run unless the business transaction lands. Not itself a domain Action.

### E-007 Artifact authorization covers services and entities

- Grade: `official-doc`
- Claim supported: Screens, transitions, services, and entities are authorized artifacts.
- Citation: `https://www.moqui.org/docs/framework/Tool+and+Config+Overview`, Artifact Authorization, accessed 2026-08-15
- Observation: Authorization can be inheritable, so authorizing a screen can authorize the services and entities it uses.
- Limits: Inheritance is a convenience that can hide the real authority boundary.

### E-008 EECA is for derived data, not business process

- Grade: `official-doc`
- Claim supported: Official docs tell authors not to trigger business processes from Entity ECA.
- Citation: `https://www.moqui.org/m/docs/framework/Data+and+Resources/Entity+ECA+Rules`, accessed 2026-08-15
- Observation: EECA fires on create, update, delete, and find. The page says EECA is useful for derived fields and external sync. Service ECA is the better tool for processes. The example updates task time totals when TimeEntry changes.
- Limits: USL still has EECA rules that call `handle#OrderItemChange`. See D-003.

### E-009 SECA composes cross-domain behavior after named updates

- Grade: `implemented-code`
- Claim supported: Mantle USL attaches invoice, reservation, payment, and email effects to named service updates, not to raw SQL.
- Citation: `https://github.com/moqui/mantle-usl/blob/6b6ce35e7a000b5e476d51f91413bc98d7f75f89/service/AccountingInvoice.secas.xml`. Also `ProductAsset.secas.xml`, `AccountingPayment.secas.xml`, `OrderReturn.secas.xml`, `Shipment.secas.xml`.
- Observation: `update#mantle.shipment.Shipment` at `post-service` calls `create#SalesShipmentInvoices` and `create#PurchaseShipmentInvoices`. `update#mantle.order.OrderHeader` at `post-service` calls `reserve#AssetsForOrder` and `authorize#OrderPayments`. Some shipment and order emails run at `tx-commit`.
- Limits: Conditions inside each SECA rule were not quoted. Official Shipment docs say Packed is the billing trigger. That pairing is `inference` until the SECA condition is read.

### E-010 EECA maintains derived totals from detail records

- Grade: `implemented-code`
- Claim supported: Creating an AssetDetail updates Asset totals. Changing InvoiceItem updates invoice totals.
- Citation: `https://github.com/moqui/mantle-usl/blob/6b6ce35e7a000b5e476d51f91413bc98d7f75f89/entity/ProductAsset.eecas.xml`. Also `entity/Accounting.eecas.xml` and `entity/Order.eecas.xml`.
- Observation: `AssetDetail` on-create calls `update#AssetFromDetail`. `InvoiceItem` and `PaymentApplication` on create, update, and delete call `update#InvoiceTotals`. `OrderItem` on create, update, and delete calls `handle#OrderItemChange`.
- Limits: `handle#OrderItemChange` may do more than a total. Not opened in this pass.

### E-011 Mantle splits UDM, USL, and UBPL

- Grade: `official-doc`
- Claim supported: Mantle separates data model, service library, and process stories.
- Citation: `https://www.moqui.org/m/docs/mantle`, accessed 2026-08-15
- Observation: UDM, USL, and UBPL are named as the three parts. Applications share one customer structure across ecommerce, fulfillment, and accounting when they use the model as intended.
- Limits: UBPL stories were not read.

### E-012 UDM follows Silverston, then changes it

- Grade: `official-doc`
- Claim supported: UDM is a loose implementation of Silverston volumes 1 and 2, and it consolidates quote and order.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM`, accessed 2026-08-15
- Observation: The page says UDM adds entities beyond the books and consolidates some, "like quote and order".
- Limits: This is a design claim about lineage, not proof that consolidation is domain-correct.

### E-013 Party is a person or organization. Roles are separate.

- Grade: `official-doc`
- Claim supported: Customer, vendor, carrier, and employee are roles of a Party, not kinds.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party`, accessed 2026-08-15
- Observation: Party has Person and Organization detail entities that share `partyId`. RoleType examples include carrier, bill-to customer, ship-from vendor, employee, affiliate, and spouse. PartyRole is optional. Other entities foreign-key to Party and RoleType, not to PartyRole.
- Limits: Optional PartyRole means "this party may act as X" is not always materialized.

### E-014 ContactMech records are immutable

- Grade: `official-doc`
- Claim supported: A contact mechanism is never updated in place.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party`, Contact Mechanism section, accessed 2026-08-15
- Observation: PartyContactMech has from and thru dates. An update creates a new ContactMech, points the party at it, and expires the old PartyContactMech. PaymentMethod uses the same expire-and-create pattern.
- Limits: Short-lived joins such as OrderContactMech do update `contactMechId` in place.

### E-015 Product is a description. Asset is an instance.

- Grade: `official-doc`
- Claim supported: Product describes a good or service. Physical instances and inventory quantities live on Asset and AssetDetail.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Product`, accessed 2026-08-15
- Observation: Product types include physical good, digital good, service, facility use, and asset use. Physical goods are tracked as Asset. `quantityOnHandTotal` and `availableToPromiseTotal` are derived from AssetDetail diffs. Details record reservation, issuance, receipt, physical variance, and work-effort production or consumption.
- Limits: Asset also covers equipment and fixed assets. That stretch may mix inventory law with asset-management law.

### E-016 OrderHeader plus OrderPart supports multi-party orders

- Grade: `official-doc`
- Claim supported: One order can have several customer and vendor pairs.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Order`, accessed 2026-08-15
- Observation: Each OrderPart has `customerPartyId` and `vendorPartyId`. Parts also split ship-to, ship-from, method, and delivery date. OrderItem belongs to one part. Item status is inferred from quantities, not stored on the item.
- Limits: Whether real deployments use multi-party parts is untested here.

### E-017 Order status collapses cart, quote, and placed order

- Grade: `official-doc`
- Claim supported: The same OrderHeader can be a cart, a vendor proposal, or a placed order.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Order`, accessed 2026-08-15
- Observation: Statuses include Open or Tentative for a cart, Proposed by Vendor for a quote, and Accepted by Customer for a placed order. Later statuses include Completed, Cancelled, Rejected, Held, and Being Changed.
- Limits: This is the consolidation named in E-012. ERPNext and Odoo keep a quotation document. See D-002.

### E-018 Shared item types and OrderItemBilling as a join

- Grade: `official-doc`
- Claim supported: Order, invoice, and return items share one item-type set. Billing is a join to invoice, shipment, and inventory issuance or receipt.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Order`, accessed 2026-08-15
- Observation: OrderItemBilling points at InvoiceItem, optional shipment, AssetIssuance for outbound, and AssetReceipt for inbound. Shared types live in `ItemTypeData.xml`.
- Limits: File contents of `ItemTypeData.xml` were not listed in this pass.

### E-019 Packed shipment is the usual billing event

- Grade: `official-doc`
- Claim supported: Packed, not Shipped or Delivered, is the documented fulfillment point that creates invoices.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Shipment`, accessed 2026-08-15
- Observation: Shipment statuses are Input, Scheduled, Picked, Packed, Shipped, Delivered, and Cancelled. Status is audit-logged. Packed triggers invoice creation and optional payment processing. ShipmentItemSource links shipment quantity to order, return, and invoice items and tracks `quantityNotHandled`.
- Limits: Matches the SECA names in E-009. The Packed condition itself was not read from XML.

### E-020 Invoice and Payment are directed party-to-party records

- Grade: `official-doc`
- Claim supported: Sales versus purchase is party direction, not a separate invoice kind. Payment is applied to invoices through PaymentApplication.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Accounting`, accessed 2026-08-15
- Observation: Invoice goes from invoicer `fromPartyId` to debtor `toPartyId`. Incoming and outgoing invoices use different status sets. Outgoing posts at Finalized. Incoming posts at Approved. Payment posts at Delivered. One payment can apply to many invoices. Unapplied amount posts to an unapplied account, then a later transaction moves it when applied.
- Limits: GL account mapping is configuration, not domain law.

### E-021 AcctgTrans points at the operational trigger

- Grade: `official-doc`
- Claim supported: A ledger transaction records what operational record caused it.
- Citation: `https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Accounting`, Ledger Transaction section, accessed 2026-08-15
- Observation: AcctgTrans may reference asset issuance, asset receipt, physical inventory, invoice, payment, payment application, financial-account transaction, shipment, or work effort. Manual transactions are also allowed.
- Limits: This is a provenance hook, not a full bitemporal model.

### E-022 Named USL verbs for order, shipment, payment, and inventory

- Grade: `implemented-code`
- Claim supported: USL publishes business verbs beyond CRUD.
- Citation: service XML at USL SHA `6b6ce35e7a000b5e476d51f91413bc98d7f75f89`, files `service/mantle/order/OrderServices.xml`, `shipment/ShipmentServices.xml`, `account/PaymentServices.xml`, `product/AssetServices.xml`
- Observation: Order verbs include `propose#Order`, `place#Order`, `approve#Order`, `complete#Order`, `cancel#Order`, `reject#Order`, and `clone#Order`. Shipment verbs include `pack#Shipment`, `ship#Shipment`, `deliver#Shipment`, `receive#EntireShipment`, and `cancel#Shipment`. Payment verbs include `authorize#Payment`, `capture#Payment`, `release#Payment`, `refund#Payment`, and `void#Payment`. Asset verbs include `reserve#AssetsForOrder`, `issue#Asset`, `receive#Asset`, and `record#PhysicalInventoryQuantity`.
- Limits: Service bodies were not read. Names are evidence of intended verbs, not of invariants inside the bodies.

### E-023 ERPNext Customer is a buying-party master

- Grade: `official-doc`
- Claim supported: ERPNext models the buying party as a Customer DocType, not as a role on a shared party.
- Citation: `https://docs.frappe.io/erpnext/customer`, updated 2026-07-23, accessed 2026-08-15
- Observation: A Customer is the consistent party reference for quotations, orders, invoices, payments, projects, and support. Addresses and Contacts are linked records. The same Customer can be used across companies.
- Limits: Supplier docs were not opened. Whether a company can be both Customer and Supplier on one identity is `undetermined`.

### E-024 ERPNext splits quotation, order, delivery, invoice, and payment

- Grade: `official-doc`
- Claim supported: ERPNext keeps those five as separate documents in the standard goods flow.
- Citation: `https://docs.frappe.io/erpnext/sales-order`, updated 2026-07-25. `https://docs.frappe.io/erpnext/delivery-note`, updated 2026-02-26. Both accessed 2026-08-15.
- Observation: Standard flow is Quotation, Sales Order, Delivery Note, Sales Invoice, Payment Entry. Sales Order is the confirmed customer request. Delivery Note updates inventory through Stock Ledger Entry. Delivery Note is optional. A Sales Invoice can be created from a Sales Order.
- Limits: Source tests for partial delivery and cancellation were not read.

### E-025 Odoo quotation becomes a sales order

- Grade: `official-doc`
- Claim supported: Odoo starts with a quotation document and converts it to a sales order on acceptance.
- Citation: `https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations.html`, accessed 2026-08-15
- Observation: Flow is quotation, sales order, delivery, invoice, payment. The quotation number is assigned under the standard naming convention once confirmed.
- Limits: Whether confirmed quotations and sales orders share one table is source-level and `undetermined` here.

### E-026 Odoo Contact is a shared party record

- Grade: `official-doc`
- Claim supported: Odoo stores customers and related addresses on one Contacts record with Individual or Company type.
- Citation: `https://www.odoo.com/documentation/18.0/applications/essentials/contacts.html`, accessed 2026-08-15
- Observation: One contact form holds sales and purchase payment terms, invoice and delivery addresses, and smart buttons into sales, purchases, invoices, and vendor bills.
- Limits: The page does not use the word role. Supplier versus customer flags in source were not opened.

### E-027 Framework facades are not domain types

- Grade: `official-doc`
- Claim supported: Entity, Service, Screen, Transaction, and Artifact Execution are framework tools.
- Citation: `https://www.moqui.org/docs/framework/Tool+and+Config+Overview`, accessed 2026-08-15
- Observation: Entity maps to a table and EntityValue. Service abstracts implementation and location from the caller. Screen is UI. Transaction Facade is JTA. Artifact Execution tracks the call stack for authz and hit stats.
- Limits: A domain Action can be implemented as a Service. That does not make Service a domain primitive.

## 4. Domain evidence

Party versus role. A legal person can be customer on one order and vendor on another. Mantle stores that as Party plus RoleType. ERPNext starts from Customer as a master. Odoo starts from one Contact used on both sales and purchase tabs. The real-world distinction is "who the person is" versus "how they participate in this deal".

Description versus instance. A catalog product can exist with zero stock. A received lot at a location with an owner is a different thing. Mantle Product versus Asset plus AssetDetail is that split. AssetDetail is closer to an inventory event than to a mutable balance field.

Commitment versus movement versus claim versus settlement. Order is a commercial commitment. Shipment is a logistics movement. Invoice is a claim for payment. Payment is a settlement instrument. PaymentApplication and OrderItemBilling are relationship records with their own meaning. ERPNext names the same split with five documents. Mantle names it with four masters plus joins.

Attempted status change versus derived quantity. Order item status is inferred from quantities. Shipment and invoice statuses are stored and audit-logged. Packed is treated as the operational fact that billing may proceed, even if the carrier has not yet accepted the handoff.

Requested, promised, planned, and actual time. Shipment keeps estimated ready, ship, and arrival dates plus actual start and arrival on the route segment. WorkEffort can hold calendar facts for ship and arrival. Scenario S-001 is expressible without overloading one `delivery_date`.

## 5. Source-system artifacts

These names are Moqui or Mantle mechanics. They are not OS primitives.

- Entity, EntityValue, EntityFind, view-entity, sequenced IDs
- ServiceFacade, entity-auto, implicit `create#EntityName`
- Screen, transition, XML Actions
- SECA `post-service` and `tx-commit`, EECA `on-create` and friends
- ArtifactAuthz inheritance and tarpit
- JTA, Bitronix, TransactionCache
- REST XML wrappers such as `mantle.rest.xml`
- Enumeration records used as extensible type catalogs
- `enable-audit-log` on status fields
- Component directory layout `entity/`, `service/`, `*.eecas.xml`, `*.secas.xml`

Silverston-shaped table names and OFBiz-like packages are also source vocabulary.

## 6. Concepts

### C-001 Named business operation

- Source term: Service with a business verb and noun
- Domain distinction: An attempted intervention with parameters, authority, and a result
- Evidence: E-001, E-002, E-004, E-022
- Source-specific form: `${path}.${verb}#${noun}`, XML `in-parameters`, ServiceFacade
- Alternative interpretations: A Service is only a procedure. The Action-like ones are a subset.
- Decision state: `supported` inside Moqui. Equivalence to OS Action stays `hypothesis`.

### C-002 Entity record

- Source term: Entity, EntityValue
- Domain distinction: A stored description of a thing or a join
- Evidence: E-003, E-027
- Source-specific form: XML entity definition mapped to a table
- Alternative interpretations: Some entities are relators or event logs, not enduring things
- Decision state: `supported` as a source artifact. Not a candidate OS primitive.

### C-003 Party

- Source term: Party, Person, Organization
- Domain distinction: An identifiable person or group that can hold roles
- Evidence: E-013
- Source-specific form: Shared primary key across Party, Person, Organization
- Alternative interpretations: Organization as a kind versus a role of a group
- Decision state: `supported` as Mantle domain evidence

### C-004 Role in a relationship

- Source term: RoleType, PartyRole
- Domain distinction: How a party participates in a deal, agreement, or work
- Evidence: E-013
- Source-specific form: Optional PartyRole. FKs to Party and RoleType
- Alternative interpretations: Customer as a kind, as in ERPNext
- Decision state: `hypothesis` for OS. Strong Mantle evidence, contested by ERPNext.

### C-005 Product description versus asset instance

- Source term: Product, Asset, AssetDetail
- Domain distinction: Catalog description versus a countable or serialized instance whose quantity is a sum of changes
- Evidence: E-015, E-010
- Source-specific form: `quantityOnHandTotal` derived from AssetDetail diffs
- Alternative interpretations: Stock balance as a mutable field. Serial and batch as the only instance types.
- Decision state: `supported` inside Mantle

### C-006 Commercial commitment

- Source term: OrderHeader, OrderPart, OrderItem
- Domain distinction: A customer and vendor commitment that can be split by fulfillment slice
- Evidence: E-016, E-017, E-022
- Source-specific form: OrderPart with customer and vendor. Status used for cart and quote.
- Alternative interpretations: Separate quote, cart, and order types
- Decision state: `supported` that orders have parts and items. Quote collapse is `hypothesis`.

### C-007 Logistics movement

- Source term: Shipment, ShipmentItem, ShipmentItemSource, ShipmentPackage, ShipmentRouteSegment
- Domain distinction: A directed movement of goods, possibly many-to-many with orders and invoices
- Evidence: E-019
- Source-specific form: Packed as billing trigger
- Alternative interpretations: Delivery Note as the only shipment document
- Decision state: `supported`

### C-008 Claim for payment

- Source term: Invoice, InvoiceItem
- Domain distinction: A directed request for payment, posted when it becomes financially effective
- Evidence: E-020, E-018
- Source-specific form: Direction by from and to parties. Status sets differ by inbound versus outbound.
- Alternative interpretations: Separate Sales Invoice and Purchase Invoice types
- Decision state: `supported`

### C-009 Settlement

- Source term: Payment, PaymentApplication
- Domain distinction: Money or instrument movement, applied to claims, possibly unapplied for a time
- Evidence: E-020, E-022
- Source-specific form: PaymentApplication. Unapplied GL account
- Alternative interpretations: Payment as a child line of an invoice
- Decision state: `supported`

### C-010 Billing relator

- Source term: OrderItemBilling, ShipmentItemSource, ReturnItemBilling
- Domain distinction: A relationship with quantity and provenance between commitment, movement, and claim
- Evidence: E-018, E-019
- Source-specific form: Join entities with extra IDs for issuance and receipt
- Alternative interpretations: Copy fields onto the invoice line and drop the join
- Decision state: `hypothesis` that OS needs a relator form. The distinction is real.

### C-011 Work effort

- Source term: WorkEffort
- Domain distinction: Planned or actual work used for projects, tasks, manufacturing routes, picklists, and shipment calendar events
- Evidence: Product, Shipment, and Work Effort docs cited above
- Source-specific form: One entity reused across domains
- Alternative interpretations: Separate Project, Task, Manufacturing Order, and Meeting types
- Decision state: `hypothesis`

## 7. Invariants

See `research/moqui/invariants.md` for the lookup list. The surviving claims are restated here.

### I-001 Service default transaction

- Statement: A defined service joins the active transaction or begins one.
- Scope: Moqui Service Facade default `use-or-begin`
- Evidence: E-005
- Failure case: Partial entity writes commit while a later step fails
- Falsifier: A widely used business service with `transaction=ignore` that still claims atomicity
- Decision state: `supported` as framework default

### I-002 Contact mechanism immutability

- Statement: A ContactMech used as history must not change in place.
- Scope: Party and Facility contact updates through Mantle contact services
- Evidence: E-014
- Failure case: Changing a postal record rewrites history on old orders that pointed at it
- Falsifier: A Mantle service that updates PostalAddress fields in place for a shared contactMechId
- Decision state: `supported` as documented law

### I-003 Asset totals come from details

- Statement: Quantity on hand and ATP are sums of AssetDetail diffs, not independent truths.
- Scope: Non-serialized inventory assets
- Evidence: E-015, E-010
- Failure case: Totals diverge from details and nothing can explain the balance
- Falsifier: A supported path that writes `quantityOnHandTotal` without an AssetDetail
- Decision state: `supported` as documented. Code path `update#AssetFromDetail` matches.

### I-004 Invoice direction is party order

- Statement: The same invoice type can be sales or purchase by swapping from and to parties.
- Scope: Mantle Invoice
- Evidence: E-020
- Failure case: A purchase bill cannot be represented without a second invoice kind
- Falsifier: USL services that require a distinct purchase invoice type enum
- Decision state: `hypothesis`. Docs say this. Service names still say SalesShipmentInvoices and PurchaseShipmentInvoices.

### I-005 Packed precedes automated billing for goods

- Statement: Goods billing from a shipment starts when the shipment is Packed.
- Scope: Sales and purchase shipments in Mantle docs and SECA names
- Evidence: E-019, E-009
- Failure case: Invoices appear at Input, or never appear after Packed
- Falsifier: A default USL path that invoices at Shipped or at order place without a shipment
- Decision state: `hypothesis` until SECA conditions are read. `create#EntireOrderPartInvoice` exists and may bill without packing.

### I-006 Payment application is many-to-many

- Statement: A payment need not equal one invoice.
- Scope: Mantle PaymentApplication
- Evidence: E-020
- Failure case: Overpayment or split payment cannot be represented
- Falsifier: A constraint that `paymentId` is unique per invoice
- Decision state: `supported` as documented

## 8. Candidate laws

### L-001 Named operations carry business verbs. Entity CRUD does not.

- Statement: A mutation that changes commercial, inventory, or financial meaning should be a named operation with validation, authority, and a transaction policy. Raw record create, update, and delete are not enough.
- Evidence: E-001, E-002, E-004, E-007, E-022
- Independent convergence: Palantir Actions and ObjectStack actions in `research/reference-landscape.md`. ERPNext submit on Sales Order. Not verified against Odoo methods in this pass.
- Known limits: Moqui still offers implicit entity CRUD. See X-001.
- Counterexamples: X-001
- Decision state: `hypothesis`

### L-002 Kind and role are different

- Statement: The enduring party is not the same concept as the role that party plays in a deal.
- Evidence: E-013, E-023, E-026
- Independent convergence: Odoo one Contact used on sales and purchase. Divergence: ERPNext Customer master. See D-001.
- Known limits: Some roles may harden into kinds in a given company.
- Counterexamples: X-004
- Decision state: `hypothesis`

### L-003 Description, instance, and quantity-change are different

- Statement: A catalog description, a stocked or serialized instance, and a quantity-changing event are three concepts.
- Evidence: E-015, E-010
- Independent convergence: ERPNext Item versus Stock Ledger Entry is suggestive and still `undetermined` at source. ValueFlows EconomicResource versus EconomicEvent is named in `research/reference-landscape.md` only.
- Known limits: Asset also models equipment. That may be a fourth concept.
- Counterexamples: none run
- Decision state: `hypothesis`

### L-004 Commitment, movement, claim, and settlement stay separate

- Statement: Order, shipment, invoice, and payment must remain distinct records with explicit joins.
- Evidence: E-016, E-018, E-019, E-020, E-024, E-025
- Independent convergence: ERPNext five-document flow. Odoo quotation, order, delivery, invoice, payment.
- Known limits: Service-only sales may skip shipment. Direct invoices exist in ERPNext.
- Counterexamples: X-005
- Decision state: `supported` as a cross-source distinction. The exact join shape is `hypothesis`.

### L-005 Cross-domain effects attach to named operations

- Statement: When packing a shipment must create invoices, or placing an order must reserve stock, the trigger belongs on the named operation, not on every entity write.
- Evidence: E-008, E-009, E-010
- Independent convergence: none independent of Moqui in this pass
- Known limits: USL still uses EECA for some order-item changes. See D-003.
- Counterexamples: X-003
- Decision state: `hypothesis`

### L-006 Requested, promised, planned, and actual time are different facts

- Statement: A shipment or order that stores one delivery date is collapsing distinct statements.
- Evidence: E-019, scenario S-001 in `scenarios/README.md`
- Independent convergence: `research/reference-landscape.md` REA and ValueFlows note
- Known limits: Mantle still stores several estimates on one Shipment row. That is better than one field, not a full fact model.
- Counterexamples: none run
- Decision state: `hypothesis`

## 9. Counterexamples

### X-001 Implicit entity CRUD

- Targets: L-001, C-001
- Setup: A caller invokes `update#SomeEntity` with no defined business service.
- Falsifying result: Meaningful business state changes with no named verb, no dedicated validation, and only generic artifact authz
- Observed result: Official docs describe this path. E-003.
- Consequence: Narrow L-001. CRUD exists. Action-equivalence applies only to defined business services.
- Decision state: `supported` as a limit on L-001

### X-002 Quote collapsed into Order status

- Targets: C-006, L-004
- Setup: A vendor proposal and a customer-accepted order are both OrderHeader rows.
- Falsifying result: Users cannot ask "what did we quote?" without filtering status and risking fulfillment services on a proposal
- Observed result: Documented in E-012 and E-017. Not runtime-tested.
- Consequence: Leave quote-versus-order `undetermined` as domain law
- Decision state: `hypothesis`

### X-003 EECA on OrderItem

- Targets: L-005, E-008
- Setup: An OrderItem row is created or updated through any path, including implicit CRUD.
- Falsifying result: `handle#OrderItemChange` performs reservation, billing, or other process work
- Observed result: EECA name is visible. Service body not read. not run
- Consequence: If the handler is only totals and revision, L-005 stands. If it reserves or bills, official EECA guidance is violated in USL.
- Decision state: `undetermined`

### X-004 ERPNext Customer kind

- Targets: L-002
- Setup: A supplier later buys, or a customer later supplies.
- Falsifying result: The organization must create a second master instead of adding a role
- Observed result: Customer docs present Customer as the buying-party master. E-023. Supplier path not opened.
- Consequence: L-002 remains contested
- Decision state: `undetermined`

### X-005 Bill without packing

- Targets: I-005, L-004
- Setup: A service order or a store that invoices the whole OrderPart
- Falsifying result: `create#EntireOrderPartInvoice` bills with no Packed shipment
- Observed result: The service name exists in InvoiceServices.xml. E-022 family. Body not read.
- Consequence: Packed-as-bill is a goods-fulfillment default, not a universal law
- Decision state: `hypothesis`

## 10. Disagreements

### D-001 Party plus role versus Customer master

- Claim A: `issue-0034-moqui-mantle-archaeology#L-002`
- Claim B: ERPNext Customer as buying-party master, E-023
- Conflict: Different observation of how commercial systems identify a buyer
- Evidence for A: E-013, E-026
- Evidence for B: E-023
- Possible explanation: ERPNext optimizes selling screens. Mantle and Odoo optimize a shared party used in many roles.
- Resolution test: Trace a party that is both customer and supplier in ERPNext, Odoo, and Mantle, including accounting postings
- Status: `open`
- Resolution: unresolved

### D-002 Quote as status versus quote as document

- Claim A: Mantle Order status includes vendor proposal. E-017
- Claim B: ERPNext Quotation and Odoo quotation documents. E-024, E-025
- Conflict: Same commercial step, different identity
- Evidence for A: E-012, E-017
- Evidence for B: E-024, E-025
- Possible explanation: Mantle followed Silverston then merged quote into order to reduce artifacts. ERPNext and Odoo kept a sales document people send.
- Resolution test: Cancellation, pricing change, and audit of "what was offered" versus "what was accepted"
- Status: `open`
- Resolution: unresolved

### D-003 Official EECA guidance versus USL OrderItem EECA

- Claim A: EECA should not trigger business processes. E-008
- Claim B: OrderItem EECA calls `handle#OrderItemChange`. E-010
- Conflict: Possible scope or interpretation conflict inside one lineage
- Evidence for A: Entity ECA Rules page
- Evidence for B: `entity/Order.eecas.xml` at the USL SHA
- Possible explanation: The handler only maintains derived totals and revision, which fits E-008
- Resolution test: Read `handle#OrderItemChange` and list the writes it performs
- Status: `open`
- Resolution: unresolved

## 11. Runtime consequences

### R-001 Named operations need a boundary

- If claim survives: L-001, C-001
- Required property: A runtime must authenticate, authorize, validate, and demarcate a transaction for a named operation. Surfaces should call that operation.
- Evidence: E-001, E-005, E-007
- Non-requirement: XML services, JTA, or REST XML
- Decision state: `hypothesis`

### R-002 Derived balances must be explainable

- If claim survives: I-003, L-003
- Required property: A quantity or total that users treat as truth must be reconstructable from the change records that produced it
- Evidence: E-015, E-010, E-021
- Non-requirement: Event sourcing as the storage model
- Decision state: `hypothesis`

### R-003 Cross-domain triggers must be observable

- If claim survives: L-005
- Required property: If packing bills, or placing reserves, the trigger and the resulting records must be visible as consequences of the operation
- Evidence: E-009, E-019
- Non-requirement: SECA XML or status-field watchers
- Decision state: `hypothesis`

### R-004 Replace, do not mutate, shared reference data that other records point at

- If claim survives: I-002
- Required property: Contact and payment-method history stay stable when current details change
- Evidence: E-014
- Non-requirement: Immutable rows for every entity
- Decision state: `hypothesis`

Wave B runtime and toolchain choices wait for more Wave A pressure. These rows state properties only.

## 12. Dependent research

Consumed.

- `research/reference-landscape.md` Moqui, ERPNext, Odoo, and REA notes
- `docs/thesis.md` Action versus Event
- `docs/constitution.md` requested is not happened, model the world
- `scenarios/README.md` S-001
- `rfcs/0001-metamodel-hypothesis.md` read only. Not edited.

Related issues that can consume these records.

- #7 Action
- #8 Event
- #14 party
- #15 product and resource
- #16 to #18 order-to-cash
- #32 ERPNext corpus
- #33 Odoo corpus
- #37 formal ontologies
- #69 licensing

No `research/notes/` files existed on this branch to link.

## 13. Open questions

These stay `undetermined`. They do not answer `docs/open-questions.md`.

- OQ-4, what exactly is an Action. Which USL services are Actions, and which are CRUD or derived-field updaters.
- Whether OrderItemBilling is a Relator in the RFC-0001 sense.
- Whether Asset should split inventory lot, serialized item, and fixed equipment.
- Whether quote and order are one type with phases or two types.
- Whether EECA `handle#OrderItemChange` is process or derivation. D-003.
- Whether ERPNext can represent one legal entity as both Customer and Supplier without duplicate masters. D-001.
- UBPL process stories as an independent source of verbs.

## 14. Licensing

Moqui Framework, Mantle UDM, and Mantle USL are CC0 1.0 with a patent grant adapted from Apache 2.0. ERPNext and Odoo were read as official docs only.

This work extracted concepts, names, documented behavior, and file-level trigger maps. No source implementation was pasted or translated into OS. No implementation reuse was considered.
