# Sources

**Kind:** source-system artifact (this file is the citation index)  
**Decision:** supported for fetch provenance, not for the claims  
**Fetched:** 2026-08-16  
**Method:** first-party pages retrieved this session. No sibling research files were copied.

Claims in other files cite a source id from the table below. A cell marked undetermined in [matrix.md](matrix.md) means this session did not get a first-party page that settles the cell.

## Operational systems

| Id | System | Document | URL | Used for |
| --- | --- | --- | --- | --- |
| S-ERP-DN | ERPNext | Delivery Note | https://docs.frappe.io/erpnext/delivery-note | stock-exit document, partial delivery, transporter, statuses, skip-to-invoice |
| S-ERP-PS | ERPNext | Packing Slip | https://docs.frappe.io/erpnext/packing-slip | package split from a draft Delivery Note, net versus gross weight |
| S-ERP-SH | ERPNext | Shipment | https://docs.frappe.io/erpnext/shipment | carrier, AWB, service, parcel, Incoterm, independent of Delivery Note |
| S-ERP-DT | ERPNext | Delivery Trip | https://docs.frappe.io/erpnext/delivery-trip | multi-stop vehicle route over submitted Delivery Notes |
| S-ERP-SR | ERPNext | Sales Return | https://docs.frappe.io/erpnext/sales-return | return Delivery Note versus Credit Note, stock versus accounting |
| S-ERP-PF | ERPNext | Partial fulfilment of sales order | https://docs.frappe.io/erpnext/partial-fulfilment-of-sales-order | several Delivery Notes, return reopens outstanding qty, close |
| S-ERP-RULE | ERPNext | Shipping Rule | https://docs.frappe.io/erpnext/shipping-rule | billed shipping charge from net total, weight, or quantity |
| S-ODO-1S | Odoo 18 | One-step receipt and delivery | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/receipts_delivery_one_step.html | validate delivery moves stock to customer location |
| S-ODO-3S | Odoo 18 | Three-step delivery | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/delivery_three_steps.html | pick, pack, ship as warehouse transfers, not carrier legs |
| S-ODO-PKG | Odoo 18 | Packages | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/configure/package.html | disposable versus reusable package, package type, Put in Pack |
| S-ODO-LBL | Odoo 18 | Print shipping labels | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/labels.html | carrier on delivery order, one label per package, tracking number on validate |
| S-ODO-DM | Odoo 18 | Add a new delivery method | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/new_delivery_method.html | delivery method as priced service, route selection, tracking link |
| S-ODO-RET | Odoo 18 | Returns and refunds | https://www.odoo.com/documentation/18.0/applications/sales/sales/products_prices/returns.html | reverse transfer versus credit note |
| S-ODO-BAT | Odoo 18 | Batch picking | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/picking_methods/batch.html | backorder on short pick |
| S-ODO-DS | Odoo 18 | Dropshipping | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/dropshipping.html | logistics-only note, inventory object left to #18 |
| S-ODO-GS1 | Odoo 18 | GS1 barcode usage | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode/operations/gs1_usage.html | Odoo does not create GS1 identifiers |
| S-MOQ-SH | Moqui Mantle | Shipment | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Shipment | shipment types, statuses, package, route segment, carrier, billing at Packed |

## Standards and formal models

| Id | Family | Document | URL | Used for |
| --- | --- | --- | --- | --- |
| S-GS1-EPCIS | GS1 | EPCIS 2.0.0 | https://ref.gs1.org/standards/epcis/2.0.0/ | ObjectEvent, AggregationEvent, event dimensions |
| S-GS1-CBV | GS1 | CBV 2.0.0 | https://ref.gs1.org/standards/cbv/2.0.0/ | bizStep and disposition vocabulary |
| S-GS1-GL | GS1 | EPCIS and CBV Implementation Guideline | https://ref.gs1.org/guidelines/epcis-cbv/ | shipping plus `in_transit`, SSCC on logistics units, business transactions |
| S-GS1-SSCC | GS1 | Serial Shipping Container Code | https://www.gs1.org/standards/id-keys/sscc | logistics-unit identity |
| S-ICC-INCO | ICC | Incoterms 2020 | https://iccwbo.org/resources-for-business/incoterms-rules/incoterms-2020/ | cost, risk, and obligation allocation, DAP versus DPU |
| S-VF-TR | ValueFlows | Transfers | https://www.valueflo.ws/concepts/transfers/ | transfer custody versus transfer rights |
| S-VF-EX | ValueFlows | Exchanges and Transfers | https://www.valueflo.ws/examples/ex-exchange/ | transport service plus `transferCustody` |

## Pages attempted or thin this session

| Topic | Result | Consequence |
| --- | --- | --- |
| Carrier scan-event dictionaries (UPS, FedEx, IATA status codes) | not fetched | tracking-code semantics stay `undetermined` beyond EPCIS and the three ERPs |
| UN/CEFACT DESADV or IFTMIN text | not fetched | ASN as a document kind stays `undetermined` except as CBV `desadv` business-transaction type |
| First-party ERPNext, Odoo, or Moqui cross-dock page | not found this session | cross-dock cells in the matrix are `undetermined` |
| CBV 2.0 dedicated `returning` bizStep | not found in the 2.0 text searched this session | reverse logistics in GS1 uses `receiving`, `inspecting`, `entering_exiting` (older CBV), and disposition `returned` (CBV 1.x). Treat dedicated return bizStep as `undetermined` for CBV 2.0 |

## Licensing note

ERPNext and Odoo are copyleft in implementation. Moqui docs are public conceptual text. GS1 and ICC pages are standards. Notes record behavior and distinctions only.
