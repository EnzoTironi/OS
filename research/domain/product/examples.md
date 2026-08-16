# Examples

**Kind.** domain-evidence applied to the required cases  
**Fetched.** 2026-08-16  
**Decision.** `hypothesis` for the mappings. Each row is a test, not a schema.

The seven cases are the issue 15 deliverable. Layers use labels from [hierarchy.md](hierarchy.md).

## Bulk material. Organic carrots, 650 kg, lot 3409888

**Sources.** S-VF-EX, S-VF-RES, S-GS1-EPCIS, S-ERN-BAT, S-ODO-LOT

| Layer | Binding |
| --- | --- |
| Kind | Fresh vegetable, or a farm classification |
| Specification | "Carrots organic", default unit kilogram, substitutable true |
| SKU | A GTIN if the lot is a trade item. Otherwise the specification is enough to commit |
| Lot | 3409888. LGTIN if a GTIN exists |
| Serial | none |
| Handling unit | maybe totes. Each tote can have an SSCC |
| Stock slice | 650 kg at a location under an owner |

**Domain-evidence.** ValueFlows stores quantity on the resource, not as child resources (E-01, E-10).

**Counterexample.** Split the lot across two customers (scenario S-008). Lot identity stays. Stock slices split. Recall still names lot 3409888.

**Runtime consequence.** Traceability queries by lot, not by SKU alone.

## Serialized machine. LifeTrac 6 tractor, serial 889jcd00s

**Sources.** S-VF-EX, S-ERN-SN, S-ODO-SER, S-GS1-KEYS

| Layer | Binding |
| --- | --- |
| Kind | Tractor, or equipment class |
| Specification | Tractor LifeTrac 6 |
| SKU | GTIN of that model as sold. Or GMN for the model plus GTIN for the trade item |
| Lot | none required |
| Serial | 889jcd00s. SGTIN if a GTIN exists. GIAI if treated as an asset |
| Handling unit | the machine is the unit |
| Stock slice | quantity 1. Location and custodian are pointers |

**Domain-evidence.** ERPNext warranty needs a serial (E-08, E-18). Odoo manufacture splits to quantity one (E-09). ValueFlows `trackingIdentifier` (E-10).

**Counterexample.** Sell the tractor. GS1 SGTIN and ERPNext Serial No persist. The serial record points at the customer (E-17). Do not mint a new serial.

**Runtime consequence.** Reservation of a serial is exclusive. Sibling ERPNext INV-ID reservation tests on `origin/cursor/issue-32-corpus-cfd8`.

## Configurable product. Custom bicycle or configured good

**Sources.** S-MOQ-PRD, S-ODO-VAR, S-ERN-VAR

| Layer | Binding |
| --- | --- |
| Kind | Bicycle |
| Specification | Configurable bicycle, or a virtual product |
| SKU | Either exploded variants (frame S red) or no SKU until configured |
| Saved configuration | Moqui `ProductConfigSaved` on the order line. Odoo Dynamic or Never attributes |
| Instance | A serial if the built bike is tracked. A lot if a batch of identical configs is built |

**Domain-evidence.** E-06, E-07. Instant variant creation mints unused SKUs. Saved configuration avoids that.

**Counterexample.** If every legal configuration must have a GTIN before offer, Dynamic creation is illegal in that trade. The hierarchy must allow both policies.

**Runtime consequence.** BOM explosion may depend on the saved configuration, not on a pre-minted variant. Odoo also supports one BOM with `Apply on Variants`. That page was listed, not fully mined.

## Service. Gym membership, repair, translation

**Sources.** S-ERN-ITEM, S-ODO-TYPE, S-MOQ-PRD, S-VF-RES, S-GS1-GTIN

| Layer | Binding |
| --- | --- |
| Kind | Service class |
| Specification | "Annual gym membership" or "English-Spanish translation" |
| SKU | A GTIN is allowed. ERPNext Item with Maintain Stock off. Odoo Service type |
| Instance | Usually none. ValueFlows says do not instantiate EconomicResource |
| Serial | none, unless a regulated service relation needs GSRN |

**Domain-evidence.** E-20. ValueFlows marks translation documents non-substitutable (E-19).

**Counterexample.** A deferred-revenue membership is still one specification sold many times. ERPNext deferred revenue lives on the Item (S-ERN-ITEM). That is accounting, not a second product identity.

**Runtime consequence.** Inventory kernels must not require an instance for a legal sale.

## Raw material. Stainless steel wire, supplier-specific

**Sources.** S-ISA-MAT, S-ISA-OBJ, S-ERN-ALT, S-ERN-CPI, S-VF-RES

| Layer | Binding |
| --- | --- |
| Kind | MaterialClass. Stainless steel wire with a hardness range |
| Specification | MaterialDefinition. Ajax Steel wire with stated carbon content |
| SKU | Item or product used on the BOM and purchase order |
| Lot | Heat or coil lot. Expiry if the process cares |
| Serial | usually none |
| Stock slice | qty at a bin, owner may be the customer in contract manufacturing |

**Domain-evidence.** ISA-95 class versus definition (E-12). ERPNext Item Alternative when the BOM wire is short (E-19). Customer-provided items skip the purchase cycle (E-16).

**Counterexample.** Using "any stainless steel wire" is a class-level commitment. Using Ajax Steel is a definition-level commitment. Collapsing them makes substitution look like the same SKU.

## Packaging. 6-pack of grape soda, and pallet 12

**Sources.** S-ODO-CFG, S-ODO-PKG, S-GS1-KEYS, S-GS1-EPCIS

| Layer | Binding |
| --- | --- |
| Kind | Soft drink |
| Specification | Grape soda |
| SKU, each | GTIN of one can |
| SKU, pack | GTIN or Odoo packaging "6-pack", contained quantity 6 |
| Handling unit | SSCC or Odoo package "Pallet #12" holding mixed or uniform cases |

**Domain-evidence.** E-14. Packaging barcode names a type. Package barcode names an instance.

**Counterexample.** Encoding the 6-pack only as a UoM "Box of 6" (S-ODO-UOM) loses a trade-item identifier and cannot carry a pack-level GTIN.

**Runtime consequence.** Scanning a packaging type adds quantity. Scanning a package moves a container. Those events are different.

## Digital good. Intern orientation document, music album

**Sources.** S-VF-EX, S-GS1-KEYS, S-MOQ-PRD

| Layer | Binding |
| --- | --- |
| Kind | Documentation, or media |
| Specification | "Farm documentation" or album title. GTIN for the album as a trade item. GDTI for a document type |
| SKU | the album GTIN, or a Product sold as a subscription |
| Instance | a URI or file copy. ValueFlows example is non-substitutable |
| Serial | optional license or file hash. Not a warehouse serial |

**Domain-evidence.** E-10, E-11, E-20. Intellectual works are not scarce until legally restricted (S-VF-RES).

**Counterexample.** Two checkouts of the same ISBN are two resources (E-01). Two downloads of the same file may be one specification with many access events. Do not force a warehouse instance.

**Runtime consequence.** Containment may be many-to-many for digital resources (E-15).
