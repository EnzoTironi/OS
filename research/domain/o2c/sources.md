# Sources

**Kind.** source-system artifact (this file is a catalog).  
**Fetched.** 2026-08-16.  
**Decision.** none.

## Question

Which first-party pages and sibling research notes ground the issue 16 notes?

## First-party pages fetched this session

### ERPNext / Frappe docs

| ID | Page | URL | Updated on page |
| --- | --- | --- | --- |
| SRC-EN-SO | Sales Order | https://docs.frappe.io/erpnext/user/manual/en/selling/sales-order | 2026-07-25 |
| SRC-EN-QT | Quotation | https://docs.frappe.io/erpnext/user/manual/en/selling/quotation | 2026-07-24 |
| SRC-EN-DN | Delivery Note | https://docs.frappe.io/erpnext/user/manual/en/stock/delivery-note | 2026-02-26 |
| SRC-EN-SI | Sales Invoice | https://docs.frappe.io/erpnext/user/manual/en/accounts/sales-invoice | 2026-08-14 |
| SRC-EN-PE | Payment Entry | https://docs.frappe.io/erpnext/user/manual/en/accounts/payment-entry | 2026-08-02 |
| SRC-EN-RES | Stock Reservation | https://docs.frappe.io/erpnext/stock-reservation | 2026-03-02 |
| SRC-EN-RET | Sales Return | https://docs.frappe.io/erpnext/sales-return | (page fetched; search snippet plus official table) |
| SRC-EN-CL | Credit Limit | https://docs.frappe.io/erpnext/credit-limit | 2026-07-23 |
| SRC-EN-SS | Selling Settings | https://docs.frappe.io/erpnext/selling-settings | (search snippet only) |

Missed this session. `https://docs.frappe.io/erpnext/user/manual/en/selling/articles/partial-fulfilment-of-sales-order` returned 404. Partial fulfillment is cited from SRC-EN-SO and SRC-EN-SI instead.

### Odoo 18.0 docs

| ID | Page | URL |
| --- | --- | --- |
| SRC-OD-QT | Sales quotations | https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations.html |
| SRC-OD-INV | Invoicing Method index | https://www.odoo.com/documentation/18.0/applications/sales/sales/invoicing.html |
| SRC-OD-POL | Invoicing policies | https://www.odoo.com/documentation/18.0/applications/sales/sales/invoicing/invoicing_policy.html |
| SRC-OD-RET | Returns and refunds | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/returns.html |
| SRC-OD-RES | Reservation methods | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods.html |

### Moqui / Mantle docs

| ID | Page | URL |
| --- | --- | --- |
| SRC-MQ-ORD | Order | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Order |
| SRC-MQ-SHP | Shipment | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Shipment |
| SRC-MQ-ACC | Accounting | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Accounting |
| SRC-MQ-BPL | Accountant Sends Invoice and Receives Payment | https://www.moqui.org/m/docs/mantle/Business+Process+Library/Accountant+Sends+Invoice+and+Receives+Payment |
| SRC-MQ-UDM | Mantle Structure and UDM | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM |

### REA / ValueFlows

| ID | Page | URL |
| --- | --- | --- |
| SRC-VF-CORE | Core concepts | https://www.valueflo.ws/introduction/core/ |
| SRC-VF-FLW | Flows | https://www.valueflo.ws/concepts/flows/ |
| SRC-VF-PRP | Offers and Requests | https://www.valueflo.ws/concepts/proposals/ |
| SRC-VF-SPEC | Vfspec (class text) | https://www.valueflo.ws/specification/vfspec/ |

Missed this session. `https://www.valueflo.ws/introduction/flows/` and `https://www.valueflo.ws/introduction/exchanges/` timed out or 404. Flows were read at SRC-VF-FLW instead. The 1982 REA PDF was not fetched. Claims about McCarthy 1982 stay `undetermined` here and defer to `research/valueflows-rea/issue-0037-economic-cycle.md` on the issue 37 branch.

### Standards

No GS1 EPCIS, UN/CEFACT, or ISO 9735 page was fetched in this pass. Standard cells in the matrix are `undetermined`.

## Sibling corpus notes (read, not written)

These paths are on other branches. They are not on `origin/main`.

| Path | Branch | Used for |
| --- | --- | --- |
| `research/erpnext/atlas.md`, `invariants.md`, `edge-cases.md` | `origin/cursor/issue-32-corpus-cfd8` | Reservation exclusivity tests, close versus cancel, over-delivery allowance |
| `research/odoo/atlas.md`, `invariants.md`, `disagreement-erpnext.md` | `origin/cursor/issue-33-corpus-cfd8` | Quote/order identity collapse, invoice-as-journal, quant reservation |
| `research/moqui/erpnext-odoo-moqui-convergence-matrix.md` | `origin/cursor/issue-34-corpus-cfd8` | Three-way O2C cells already opened by corpus |
| `research/valueflows-rea/issue-0037-economic-cycle.md` | `origin/cursor/issue-37-corpus-cfd8` | Intent / Commitment / Event / Claim cycle |

## Licensing note

ERPNext and Odoo documentation describe GPL/LGPL products. Extraction is behavioral. No source files were copied into this folder.
