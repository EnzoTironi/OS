# Evidence

**Fetched.** 2026-08-16  
**Decision.** per block. Never silently accepted.

Each block names a **kind**: domain-evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Sources use IDs from [sources.md](sources.md).

## Question

What do independent systems actually distinguish when they say Item, Product, SKU, lot, or serial?

## Specification versus instance

### E-01. ValueFlows resource versus specification

**Kind.** domain-evidence  
**Source.** S-VF-RES, S-VF-SPEC  
**Decision.** supported as a ValueFlows distinction

An economic resource is observable. Its specification defines what kind of thing it is. A listing on a shop is a specification. The copy in the box is a resource. A book description with ISBN is a specification. Two library copies are resources.

`ResourceSpecification` "Specifies the kind of economic or environmental resource, even if the resource is not instantiated as an EconomicResource. Could define a material or digital thing, service, medium of exchange or currency, skill or type of work."

`EconomicResource` is "Economic or environmental things (material or digital), media of exchange, which agents agree should be accounted for and which can be inventoried."

`conformsTo` binds a resource to one specification. Flows that are not yet instantiated use `resourceConformsTo`.

**Runtime consequence.** A commitment can name a specification with no instance. An inventoried resource is created and updated only by economic events (S-VF-TXT).

### E-02. Moqui Product versus Asset

**Kind.** domain-evidence  
**Source.** S-MOQ-PRD, S-MOQ-APP  
**Decision.** supported as a Mantle distinction

Marble ERP: "use Product for specifications, descriptions, etc of items and use Asset to keep track of inventory and supplies."

Mantle: a Product is a description of a service, facility use, asset use, or a digital or physical good. An Asset "commonly represents an instance of a Product." Serialized inventory "represents a single physical item and commonly has a serialNumber." Non-serialized inventory (`hasQuantity=Y`) is a homogeneous batch that shares `receivedDate`, `lotId`, `facilityId`, `locationSeqId`, and `ownerPartyId`.

**Source-system artifact.** Asset also means equipment and fixed assets. The same entity is not only inventory law.

**Cross-link.** `research/moqui/domain-atlas.md` on `origin/cursor/issue-34-corpus-cfd8`.

### E-03. ERPNext Item is a collapsed catalog master

**Kind.** source-system artifact  
**Source.** S-ERN-ITEM  
**Decision.** supported as ERPNext behavior. rejected as a domain primitive

"An Item is a product or a service offered by your company." The same master covers raw materials, sub-assemblies, finished goods, variants, and services. `Maintain Stock` decides whether transactions write a stock ledger. Serial and batch flags live on the Item. After the first stock entry, those flags cannot change.

**Interpretation.** ERPNext needed one form operators can complete. The collapse is a UX and schema choice. The later Serial No, Batch, and Item Variant records are the evidence that the collapse fails.

### E-04. Odoo goods, services, and tracking mode

**Kind.** domain-evidence and source-system artifact  
**Source.** S-ODO-TYPE  
**Decision.** supported that services are not stock. undetermined whether they share one type with goods

Odoo sets goods and services up as products. `Product Type` is Goods, Service, or Combo. "Due to their immaterial nature, services are not trackable in Odoo’s Inventory application."

Tracked goods choose By Unique Serial Number, By Lots, or By Quantity. Untracked goods can still appear on purchase orders, transfers, bills of materials, kits, and packages. They have no on-hand quantity, no forecast, no reordering rules, no valuation, and no lot tracking.

**Source-system artifact.** One product form, three tracking modes. The form is not the ontology.

## Template, variant, configuration

### E-05. ERPNext template cannot enter a transaction

**Kind.** domain-evidence  
**Source.** S-ERN-VAR  
**Decision.** supported

A template has `Has Variants`. "You cannot make Transactions against a 'Template'." Only variants such as a blue small t-shirt can be sold or stocked. Updating the template updates variants for fields listed in Item Variant Settings.

Variants can also be based on Manufacturer plus optional manufacturer part number.

### E-06. Odoo template versus variant SKU

**Kind.** domain-evidence  
**Source.** S-ODO-VAR  
**Decision.** supported

"The T-shirt is the product template, and T-shirt: Blue, S is a specific product variant." Each variant has its own inventory count, barcode or SKU, public price, and picture. Template price plus attribute extras make the variant price. Template edits apply to every variant.

`Variant Creation Mode` is Instantly, Dynamically, or Never. Instantly explodes the cartesian product. Dynamically creates a variant when it appears on a sales order. Never treats the attribute as informational and does not create purchasable variants.

**Source-system artifact.** `product.template` and `product.product` are Odoo models. Do not import the names.

**Runtime consequence.** Instant creation can mint SKUs that never sell. Dynamic creation delays identity until a commercial event.

### E-07. Moqui features versus saved configuration

**Kind.** domain-evidence  
**Source.** S-MOQ-PRD  
**Decision.** supported that configuration is not the same as a variant SKU

`ProductFeatureAppl` uses Selectable, Standard, or Distinguishing. Distinguishing describes variants of a virtual product.

Configurable goods use `ProductConfigItem` through `ProductConfigOptionProduct`. A configured choice is stored as `ProductConfigSaved` and referenced from `OrderItem.productConfigSavedId`.

**Candidate law.** A saved configuration can be an order-line fact without being a catalog SKU. See L-03.

## Lot versus serial

### E-08. ERPNext serial is one unit. Batch is a group

**Kind.** domain-evidence  
**Source.** S-ERN-ITEM, S-ERN-SN, S-ERN-BAT  
**Decision.** supported

Serial Number: "a Serial Number (Serial No) record is maintained for each quantity of that Item." Status comes from stock entries. Only status Available can be delivered. Creating a Serial No by hand does not set a warehouse. Inventory changes only through a stock transaction.

Batch: "group multiple units of an Item and assign them a unique value/number/tag called Batch No." Batches carry expiry and can be split or moved. After any transaction, the Item on the batch cannot be set or unset.

From version 15, negative stock is refused for serial and batch items even when Stock Settings allow it.

**Source-system artifact.** Serial and Batch Bundle (S-ERN-SBB) exists because a text field of many serials broke integrity. One bundle per stock transaction. That is an implementation repair, not a domain type.

### E-09. Odoo lot versus serial, one table

**Kind.** domain-evidence and source-system artifact  
**Source.** S-ODO-LOT, S-ODO-SER, S-ODO-MFG  
**Decision.** supported for the quantity rule. rejected that one table proves one type

"Serial numbers are used to assign unique numbers to individual products, while lot numbers are used to assign a single number to multiple units of a specific product."

On unique serials that are not reused, "there should be just one product per serial number." Manufacturing a serial-tracked product splits the manufacturing order to quantity one per serial (S-ODO-MFG). A lot-tracked product can produce many units under one lot.

Creating a lot or serial from the dashboard "reserves it for a product but does not assign it." Identity can exist before the stock move.

**Source-system artifact.** Sibling note `research/odoo/atlas.md` A-IDENTITY on `origin/cursor/issue-33-corpus-cfd8`: one `stock.lot` model, uniqueness of product plus name inside a company.

**Cross-link.** `research/odoo/invariants.md` INV-ID-01, INV-ID-02 on that branch.

### E-10. ValueFlows tracking identifier versus batch record

**Kind.** domain-evidence  
**Source.** S-VF-RES, S-VF-EX  
**Decision.** supported

Three identification kinds:

1. Serialized. Each instance has a unique identifier.
2. Lot-controlled. The lot has a unique identifier. The lot may contain many instances.
3. Count, volume, or stock. Instances are indistinguishable, or exist only at molecular scale.

`trackingIdentifier` is for serialized resources. Batch and lot share one record type, often a batch manufacturing record with production and expiration data. The tractor example uses `trackingIdentifier` 889jcd00s. The carrot example uses lot 3409888 with 650 kilograms.

### E-11. GS1 class, lot class, and instance

**Kind.** domain-evidence  
**Source.** S-GS1-KEYS, S-GS1-GTIN, S-GS1-EPCIS  
**Decision.** supported

GTIN identifies a trade item. "GS1 defines trade items as products or services that are priced, ordered or invoiced at any point in the supply chain."

EPCIS What dimension:

- Class-level. GTIN, or GTIN plus batch or lot (LGTIN).
- Instance-level. GTIN plus serial (SGTIN), SSCC, serialized GRAI, GIAI.

"An object should only be identified at one level." Do not send both GTIN and SGTIN for the same object in one event.

SSCC identifies a logistics unit, "any combination of trade items packaged together for storage and/or transport."

GIAI identifies an individual asset. GRAI identifies a returnable asset. GMN identifies a product model. Those keys are evidence that model, trade item, asset, and logistics unit are different identifiers.

### E-12. ISA-95 class, definition, lot, sublot

**Kind.** domain-evidence  
**Source.** S-ISA-MAT, S-ISA-OBJ  
**Decision.** supported as companion-model evidence. undetermined against the paywalled ISA-95 text

`MaterialClassType` is a kind without a supplier. Example: stainless steel wire with a hardness range.

`MaterialDefinitionType` is a specific material, often from a supplier. Example: Ajax Steel stainless steel wire. "This corresponds to an entry in a corporate Material Master database."

`MaterialLotType` is a specifically identified lot. It has optional `StorageLocation`, `Quantity`, `Status`, and `DefinedByMaterialDefinition`.

`MaterialSublotType` is a specifically identified sublot. Lots assemble from lots or sublots.

**Interpretation.** Location and quantity are attributes of the lot, not the definition of the material.

## Units, packaging, handling units

### E-13. Unit of measure is conversion, not identity

**Kind.** domain-evidence  
**Source.** S-ERN-UOM, S-ERN-ITEM, S-ODO-UOM  
**Decision.** supported

ERPNext stores UoM names in one list and conversion rates in UoM Conversion Factor. An Item has a default UoM plus alternate UoMs. Purchase UoM and sales UoM can differ. Weight UoM can differ from purchase UoM.

Odoo converts only inside a UoM category that has a reference unit. Inventory and sales use one UoM on the product. Purchase can use another. Warehouse documents show the inventory UoM.

**Counterexample.** S-ODO-CFG documents a juice distributor who abused lots to store grams and kilograms of the same juice because Odoo tracks one inventory UoM. That is a source workaround, not a reason to make UoM an identity kind.

### E-14. Odoo packaging type versus package instance

**Kind.** domain-evidence  
**Source.** S-ODO-CFG, S-ODO-PKG  
**Decision.** supported

| Concept | What it is | Identity |
| --- | --- | --- |
| Unit of measure | Conversion | None |
| Packaging | Fixed quantity of one product. 6-pack, case of 36 | Type-level barcode. Not Pallet #1 |
| Package | Physical container. May mix products | Unique barcode. Pallet #12 |

Packaging is product-specific. Scanning a packaging barcode adds the contained quantity. Odoo "tracks only the total quantity, not the number of packagings."

GS1 matches the split. A case-of-12 can have its own GTIN. A specific pallet has an SSCC.

**Source-system artifact.** Odoo also lets a "box of 6" be created as a bigger UoM inside the Unit category (S-ODO-UOM). Same commercial shape, two encodings.

### E-15. ValueFlows containment and Moqui Container

**Kind.** domain-evidence  
**Source.** S-VF-RES, S-MOQ-PRD  
**Decision.** hypothesis that containment is a relation on instances

ValueFlows `containedIn` and `contains` relate economic resources. A toolkit contains tools. Material resources have at most one container. Digital resources may have many.

Moqui Asset can sit in a `Container` instead of a facility location. The container carries the location history.

## Ownership, custody, location

### E-16. Rights and custody are different transfers

**Kind.** domain-evidence  
**Source.** S-VF-XFR, S-VF-RES  
**Decision.** supported

ValueFlows separates transfer of rights (primary accountability) from transfer of custody. `accountingQuantity` is rights. `onhandQuantity` is custody. Vendor-managed inventory is the example. The vendor sees accounting quantity. The store sees onhand quantity. FOB source puts goods on a truck in the receiver's accounting quantity while custody is still in transit.

ERPNext customer-provided items (S-ERN-CPI) receive customer material through Material Receipt, not a purchase cycle, so the customer is not also a supplier.

**Cross-link.** Scenario S-008. `docs/open-questions.md` section 13.

### E-17. Owner can key a stock slice

**Kind.** domain-evidence and counterexample  
**Source.** S-VF-RES. Sibling `research/odoo/atlas.md` A-STOCK on `origin/cursor/issue-33-corpus-cfd8`. S-MOQ-PRD  
**Decision.** supported that slices are keyed. rejected that owner is the identity of a serialized individual

ValueFlows allows a unique identifier for non-serialized stock of "resource model + lot identifier + location + owner." "A transfer of rights means a different resource."

The Odoo sibling note keys a quant by product, location, lot, package, and owner.

Moqui creates a new Asset per received batch that shares lot, facility, location, and `ownerPartyId`.

Serialized GS1 SGTIN and ERPNext Serial No keep the same identifier after sale. The serial record then points at a customer (S-ERN-SN).

**Candidate law.** L-06.

## Lifecycle, substitutes, services

### E-18. Specification effectivity is dates, not a status enum

**Kind.** domain-evidence  
**Source.** S-MOQ-PRD, S-ERN-ITEM  
**Decision.** hypothesis

Moqui Product has `statusId` "mostly there for special cases." Saleability is `salesIntroductionDate`, `salesDiscontinuationDate`, and `supportDiscontinuationDate` against now. Prices have `fromDate` and `thruDate`.

ERPNext has Disabled, End of Life on the Item, and shelf life or expiry on the Batch. Warranty tracking requires a serial.

ISA-95 lots have optional Status. That is lot state, not specification version.

**Open.** Specification revision versus lot identity is `undetermined`. See [open-questions.md](open-questions.md) Q-07.

### E-19. Substitutes are allowed replacements, not the same SKU

**Kind.** domain-evidence  
**Source.** S-ERN-ALT, S-VF-RES, S-MOQ-PRD  
**Decision.** supported that substitution is a relation

ERPNext Item Alternative is "an Item similar to the original one and can be used instead of the original Item in manufacturing." It needs flags on Item, BOM, and Work Order. Two-way replacement is optional. The same feature covers subcontract material transfer.

ValueFlows `substitutable` on a specification. One container of a named resin is substitutable. Each "English-Spanish translation" document is not.

Moqui `ProductAssoc` covers variants, accessories, and BOM breakdowns.

**Counterexample.** A substitute is a different specification. Treating it as the same SKU would break GS1 GTIN uniqueness and ERPNext Item Code identity.

### E-20. Services and non-stock share the specification layer

**Kind.** domain-evidence  
**Source.** S-ERN-ITEM, S-ODO-TYPE, S-MOQ-PRD, S-VF-RES  
**Decision.** supported at specification. undetermined at instance

ERPNext creates an Item per service and leaves `Maintain Stock` off.

Odoo Service type is not trackable in Inventory.

Moqui tracks service products through WorkEffort, Request, or Requirement, not as inventory Assets.

ValueFlows does not instantiate `EconomicResource` when inventory does not apply. Use the specification plus accountable agent or location.

### E-21. Serial identity can precede stock. Delivered serials can return

**Kind.** counterexample  
**Source.** Sibling `research/erpnext/edge-cases.md` EC-ID-01, EC-ID-02 on `origin/cursor/issue-32-corpus-cfd8`. S-ODO-LOT  
**Decision.** supported as operational behavior

ERPNext Work Order can insert Serial No rows with status Inactive before the manufacture Stock Entry. "Identity precedes the manufacture Stock Entry."

Manufacture or Repack may inward a serial whose status is Delivered. That is rework or return-to-stock, not a second birth.

Odoo can create a lot number that is reserved for a product and not yet assigned on a receipt.

**Attacks.** "Serial identity is created by the inward event."
