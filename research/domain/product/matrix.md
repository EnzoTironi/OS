# Source convergence matrix

**Kind.** convergence and divergence  
**Fetched.** 2026-08-16  
**Decision.** per row.

Marks: C = converges on the distinction. D = diverges. A = source artifact only. ? = not evidenced this pass. Cells cite [evidence.md](evidence.md) or [sources.md](sources.md).

This is not a feature checklist. A C means independent sources make the same real-world cut.

## Specification, SKU, instance

| Distinction | ERPNext | Odoo | Moqui | ValueFlows | GS1 | ISA-95 companion | Notes | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Specification versus inventoried instance | D. Item is both. Serial and Batch grow later. E-03, E-08 | D. Product is both. Lot grows later. E-04, E-09 | C. Product versus Asset. E-02 | C. ResourceSpecification versus EconomicResource. E-01 | C. GTIN versus SGTIN or LGTIN. E-11 | C. MaterialDefinition versus MaterialLot. E-12 | ERPs collapse, then split under pressure | `supported` that the split is domain-level |
| Template versus sellable SKU | C. Template cannot transact. E-05 | C. Template versus variant. E-06 | C. Virtual product plus Distinguishing features. E-07 | ? No first-class template | C. GMN model versus GTIN trade item. E-11 | ? | SKU is the orderable leaf | `supported` |
| Saved configuration versus SKU | ? | C. Dynamic or Never variant modes. E-06 | C. ProductConfigSaved on the order line. E-07 | ? | ? | ? | Two sources. Need a third | `hypothesis` |
| Classification versus specification | A. Item Group | A. product category | C. ProductCategory many-to-many | C. many classifications, one specification. E-01 | A. UNSPSC mentioned on Odoo UoM | C. MaterialClass versus MaterialDefinition. E-12 | Class is for finding and planning | `supported` |
| Services on the same specification layer | C. Item, no stock. E-20 | C. Service type. E-20 | C. Product type, WorkEffort. E-20 | C. spec without EconomicResource. E-20 | C. GTIN can identify a service. E-11 | ? | Instance layer does not apply | `supported` at spec. `undetermined` at instance |
| Digital good as specification plus locator | A. non-stock Item | A. untracked or service | C. digital Product, Subscription. E-02 | C. URI resource, substitutable false. E-10, S-VF-EX | C. GDTI for documents. E-11 | ? | See [examples.md](examples.md) | `hypothesis` |

## Lot, serial, quantity

| Distinction | ERPNext | Odoo | Moqui | ValueFlows | GS1 | ISA-95 companion | Notes | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Serial versus lot | C. Two doctypes. E-08 | C in docs. A in one `stock.lot` table. E-09 | C. serialNumber versus lotId. E-02 | C. trackingIdentifier versus batch record. E-10 | C. SGTIN versus LGTIN. E-11 | ? Lot and sublot. Serial not named | Quantity one versus many | `supported` |
| Homogeneous qty without lot | C. Maintain Stock, no flags | C. By Quantity | C. hasQuantity Asset | C. stock resources. E-10 | C. GTIN plus quantity | C. lot still identified | Interchangeable units | `supported` |
| Identity before the stock event | C. inactive serials. E-21 | C. reserve lot, do not assign. E-09 | ? | C. resourceConformsTo on plans. E-01 | ? | ? | Attacks "created by inward" | `supported` as behavior |
| One object, one identification grain | A. flags on Item | A. tracking mode on product | A. asset type | C. one specification per resource | C. do not send GTIN and SGTIN together. E-11 | C. lot defined by one MaterialDefinition | | `hypothesis` for OS |
| Negative stock for identity-bearing items | C. refused from v15. E-08 | ? allow_negative in sibling code notes | ? | C. events change quantity. No negative discussed | ? | ? | Sibling Odoo notes allow some negatives | `undetermined` as a law |

## Units, packages, location, rights

| Distinction | ERPNext | Odoo | Moqui | ValueFlows | GS1 | ISA-95 companion | Notes | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UoM is conversion, not identity | C. E-13 | C. E-13. Counterexample lot-as-UoM. E-13 | C. amountUomId, ProductDimension | C. defaultUnitOfResource | A. UNSPSC on UoM category | Quantity on the lot | | `supported` |
| Packaging type versus handling-unit instance | A. Packing Slip named, not read | C. packaging versus package. E-14 | C. Container versus Asset. E-15 | C. contains. E-15 | C. GTIN versus SSCC. E-11 | C. lot versus storage location. E-12 | | `supported` |
| Ownership versus custody | C. customer-provided path. E-16 | C. owner on quant. E-17 | C. ownerPartyId on Asset. E-17 | C. accounting versus onhand. E-16 | C. GTIN stays, GLN is party or place. E-11 | A. StorageLocation on lot | | `supported` |
| Owner as part of fungible identity | ? | C. quant key includes owner. E-17 | C. new Asset per owner batch. E-17 | C. transfer of rights is a new resource. E-17 | D. SGTIN persists across sale | ? | Serial persists. Fungible slice does not | `supported` as a split. See L-06 |
| Location is not the specification | C. Warehouse on movements | C. location on quant | C. facility and location on Asset | C. currentLocation | C. GLN | C. StorageLocation attribute. E-12 | | `supported` |

## Substitution and effectivity

| Distinction | ERPNext | Odoo | Moqui | ValueFlows | GS1 | ISA-95 companion | Notes | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Substitute is a different specification | C. Item Alternative. E-19 | ? not fetched | C. ProductAssoc. E-19 | C. substitutable flag. E-19 | C. different GTIN | ? | | `supported` |
| Spec effectivity as dates | C. Disabled, End of Life. E-18 | A. archive, not fetched in depth | C. sales date fields. E-18 | ? stage and state on the resource. E-10 | A. GTIN Management listed, not read | A. lot Status | Version of a spec is open | `undetermined` |
| Stage as part of identity | ? | ? | ? | C. stage and state, or new spec. E-10 | ? | ? | One source family | `hypothesis` |

## Divergence worth keeping

**D-01. Catalog collapse.** ERPNext Item and Odoo Product start as one master. Moqui, ValueFlows, GS1, and ISA-95 start split. The ERPs still grow instance records. Collapse is a source artifact.

**D-02. One table for lot and serial.** Odoo `stock.lot`. ERPNext two doctypes. Docs in both systems still force quantity one on serials. Table shape is not the law.

**D-03. Owner in the identifier.** ValueFlows and Odoo quants key fungible stock by owner. GS1 serials do not. Do not pick one encoding for both grains.

**D-04. Box-of-N as UoM or packaging.** Odoo documents both. GS1 would issue a GTIN for the pack. Pick the packaging-type layer, not a bigger UoM, if the pack is a trade item.

**D-05. Stage in the identifier.** ValueFlows allows stage on one resource or a new specification per stage. No second independent source this pass.
