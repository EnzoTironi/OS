# Sources

**Kind.** source artifacts and first-party pages  
**Fetched.** 2026-08-16  
**Decision.** n/a. This file lists what was read. It does not decide laws.

## Question

Which independent texts were used to separate specification, SKU, instance, lot, serial, unit, package, owner, and location?

## First-party pages fetched this session

### ERPNext and Frappe docs

GPL corpus. Concepts and documented behavior only. No implementation in this folder.

| ID | Page | URL | Updated on page |
| --- | --- | --- | --- |
| S-ERN-ITEM | Item | https://docs.frappe.io/erpnext/item | 2026-03-12 |
| S-ERN-VAR | Item Variants | https://docs.frappe.io/erpnext/item-variants | 2026-03-12 |
| S-ERN-SN | Serial Number | https://docs.frappe.io/erpnext/serial-no | 2026-03-06 |
| S-ERN-BAT | Batch | https://docs.frappe.io/erpnext/batch | 2026-03-06 |
| S-ERN-SBB | Serial and Batch Bundle | https://docs.frappe.io/erpnext/serial-and-batch-bundle | 2026-02-26 |
| S-ERN-ALT | Item Alternative | https://docs.frappe.io/erpnext/item-alternative | 2026-02-27 |
| S-ERN-UOM | Unit of Measure | https://docs.frappe.io/erpnext/uom | 2026-03-06 |
| S-ERN-CPI | Customer Provided Items | https://docs.frappe.io/erpnext/customer-provided-items | 2026-03-02 |

Attempted and 404 this session: `https://docs.frappe.io/erpnext/user/manual/en/stock/serial-and-batch`. The live index is https://docs.frappe.io/erpnext/serial-and-batch.

### Odoo 18.0 docs

LGPL corpus. Concepts and documented behavior only.

| ID | Page | URL |
| --- | --- | --- |
| S-ODO-TYPE | Product type | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/type.html |
| S-ODO-VAR | Product variants | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/products/variants.html |
| S-ODO-LOT | Lot numbers | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html |
| S-ODO-SER | Serial numbers | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/serial_numbers.html |
| S-ODO-MFG | Manufacture with lots and serial numbers | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/workflows/manufacture_lots_serials.html |
| S-ODO-UOM | Units of measure | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html |
| S-ODO-PKG | Packaging | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/packaging.html |
| S-ODO-CFG | Configure product | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure.html |

Attempted and 404 this session:

- `.../inventory/product_management/configure/variants.html`
- `.../inventory/product_management/product_tracking/lots_serial_numbers.html`

The live variant page is under Sales, not Inventory.

### Moqui and Mantle

| ID | Page | URL |
| --- | --- | --- |
| S-MOQ-PRD | Mantle Product | https://moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Product |
| S-MOQ-APP | Marble ERP Products | https://moqui.org/m/docs/apps/Marble+ERP+User+Guide/Configuration/Products |

Entity XML filenames are named only as source artifacts. No XML was copied.

### ValueFlows and REA

| ID | Page | URL |
| --- | --- | --- |
| S-VF-RES | Economic Resources | https://www.valueflo.ws/concepts/resources/ |
| S-VF-SPEC | Formatted specification | https://www.valueflo.ws/specification/all_vf/ |
| S-VF-XFR | Transfers | https://www.valueflo.ws/concepts/transfers/ |
| S-VF-EX | Resource examples | https://www.valueflo.ws/examples/ex-resource/ |
| S-VF-TXT | Diagram explanations | https://www.valueflo.ws/specification/model-text/ |

### GS1

| ID | Page | URL |
| --- | --- | --- |
| S-GS1-KEYS | GS1 identification keys | https://www.gs1.org/standards/id-keys |
| S-GS1-GTIN | Global Trade Item Number | https://www.gs1.org/standards/id-keys/gtin |
| S-GS1-EPCIS | EPCIS and CBV Implementation Guideline | https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd |

The EPCIS guideline fetch landed on a page whose URL ends `current-standardd`. Treat the text as the current public guideline body fetched 2026-08-16. Confirm the canonical URL before citing in a later wave.

### ISA-95 companion

The ISA-95 Part 2 text is paywalled. This pass used the OPC Foundation ISA-95 companion model, which restates the material objects.

| ID | Page | URL |
| --- | --- | --- |
| S-ISA-MAT | Material information | https://reference.opcfoundation.org/ISA-95/v100/docs/8.4 |
| S-ISA-OBJ | Material objects | https://reference.opcfoundation.org/ISA-95/v100/docs/8.4.3 |
| S-ISA-HOME | ISA-95 standard index | https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard |

**Kind.** source artifact. OPC UA types are an encoding of ISA-95, not ISA-95 itself.

## In-repo documents read this session

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md` sections 13 and 14
- `docs/research-program.md`
- `docs/swarm-research-backlog.md` Agent output contract
- `rfcs/0001-metamodel-hypothesis.md` Identity and falsification target 3
- `scenarios/README.md` S-008
- `research/README.md`
- `research/reference-landscape.md`

## Sibling notes read, not written

| Path | Branch |
| --- | --- |
| `research/erpnext/atlas.md` A-IDENTITY, `invariants.md` INV-ID-*, `edge-cases.md` EC-ID-* | `origin/cursor/issue-32-corpus-cfd8` |
| `research/odoo/atlas.md` A-IDENTITY, `invariants.md` INV-ID-*, `edge-cases.md` EC-ID-* | `origin/cursor/issue-33-corpus-cfd8` |
| `research/moqui/domain-atlas.md` Product and asset | `origin/cursor/issue-34-corpus-cfd8` |
| `research/valueflows-rea/issue-0037-economic-cycle.md` | `origin/cursor/issue-37-corpus-cfd8` |
| `research/comparative/issue-0037-formal-ontology-synthesis.md` | `origin/cursor/issue-37-corpus-cfd8` |

`research/gs1-epcis/` and `research/isa95/` were not on `origin/main`. Issue 38 had no remote branch in this clone.

## Licensing

OS is MIT. ERPNext and Odoo notes extract documented behavior. They do not paste or translate implementation. ValueFlows, GS1, and ISA-95 companion pages are public specifications and docs.
