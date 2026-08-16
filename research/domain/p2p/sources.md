---
issue: 17
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Sources

Pages and sibling notes fetched or read this session. Prefer these URLs over memory. Copyleft systems were read for documented behavior only.

## Repo context on origin/main

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md` question 13
- `docs/research-program.md` procure-to-pay section
- `docs/swarm-research-backlog.md` Agent output contract
- `rfcs/0001-metamodel-hypothesis.md` not edited
- `scenarios/README.md` S-003, S-005, S-010
- `research/README.md`
- `research/reference-landscape.md`
- GitHub issue 17, fetched with `gh issue view 17 --repo EnzoTironi/OS`

`docs/swarm-result-contract.md` is not on `origin/main`.

## ERPNext first-party docs

Fetched 2026-08-16 from `docs.frappe.io`.

| ID | Page | URL |
| --- | --- | --- |
| S-ERN-CYCLE | Procurement Cycle Overview | https://docs.frappe.io/erpnext/procurement-cycle-overview |
| S-ERN-MR | Material Request | https://docs.frappe.io/erpnext/material-request |
| S-ERN-RFQ | Request for Quotation | https://docs.frappe.io/erpnext/request-for-quotation |
| S-ERN-SQ | Supplier Quotation | https://docs.frappe.io/erpnext/supplier-quotation |
| S-ERN-PO | Purchase Order | https://docs.frappe.io/erpnext/purchase-order |
| S-ERN-PR | Purchase Receipt | https://docs.frappe.io/erpnext/purchase-receipt |
| S-ERN-PI | Purchase Invoice | https://docs.frappe.io/erpnext/purchase-invoice |
| S-ERN-LCV | Landed Cost Voucher | https://docs.frappe.io/erpnext/stock-transactions-landed-cost-voucher |
| S-ERN-RET | Purchase Return | https://docs.frappe.io/erpnext/purchase-return |
| S-ERN-QI | Quality Inspection | https://docs.frappe.io/erpnext/quality-inspection |
| S-ERN-PE | Payment Entry | https://docs.frappe.io/erpnext/payment-entry |
| S-ERN-BO | Blanket Order | https://docs.frappe.io/erpnext/blanket-order |

## Odoo first-party docs

Fetched 2026-08-16 from `www.odoo.com/documentation/18.0`.

| ID | Page | URL |
| --- | --- | --- |
| S-ODO-PUR | Purchase | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase.html |
| S-ODO-RFQ | Requests for quotation | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html |
| S-ODO-BO | Blanket orders | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html |
| S-ODO-BILL | Manage vendor bills | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/manage.html |
| S-ODO-CTRL | Bill control policies | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html |
| S-ODO-3STEP | Three-step receipt | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/receipts_three_steps.html |
| S-ODO-INB | Inbound and outbound flows | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations.html |
| S-ODO-QC | Quality checks | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/quality/quality_management/quality_checks.html |

## Moqui and Mantle first-party docs

Fetched 2026-08-16 from `www.moqui.org`.

| ID | Page | URL |
| --- | --- | --- |
| S-MOQ-ORD | Order | https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Order |
| S-MOQ-P2P | Marble ERP Procure to Pay | https://www.moqui.org/m/docs/apps/Marble+ERP+User+Guide/Procure+to+Pay |
| S-MOQ-RCV | Shipment Receiver Receives Shipment | https://www.moqui.org/m/docs/mantle/Business+Process+Library/Shipment+Receiver+Receives+Shipment |

The Mantle USL test `OrderProcureToPayBasicFlow.groovy` was listed by search. This pass did not treat that test file as a source to quote. Behavior below comes from the three pages above.

## REA and ValueFlows

Fetched 2026-08-16 from `www.valueflo.ws`.

| ID | Page | URL |
| --- | --- | --- |
| S-VF-CORE | Core Concepts | https://www.valueflo.ws/introduction/core/ |
| S-VF-FLOW | Flows | https://www.valueflo.ws/concepts/flows/ |
| S-VF-PROP | Offers and Requests | https://www.valueflo.ws/concepts/proposals/ |
| S-VF-XFER | Transfers | https://www.valueflo.ws/concepts/transfers/ |
| S-VF-SPEC | Formatted Specification | https://www.valueflo.ws/specification/all_vf/ |

The Actions page timed out this session. Transfer and flow pages already name transfer, transfer-all-rights, and transfer-custody.

## Procurement and trade standards

Fetched 2026-08-16.

| ID | Page | URL |
| --- | --- | --- |
| S-ICC-INCO | ICC Incoterms 2020 introduction, ICC Digital Library | https://library.iccwbo.org/content/tfb/BOOKS/BK_0049/BK_0049_03_Introduction.htm?AGENT=ICC_ACA |
| S-ICC-PDF | Incoterms 2020 introduction PDF mirrored by ICC Switzerland | https://www.icc-switzerland.ch/images/723e_inco2020_eng_intro.pdf |
| S-ICC-RISK | ICC Academy, place of delivery and risk transfer | https://academy.iccwbo.org/incoterms/article/place-of-delivery-risk-transfer-global-trade-contracts/ |
| S-UNECE-BSP | UN/CEFACT Buy-Ship-Pay BRS listing | https://www.digitalizetrade.org/implementation-instrument/business-requirement-specifications-brs-buy-ship-pay-reference-data-model |
| S-GS1-CBV | GS1 EPCIS and CBV Implementation Guideline | https://ref.gs1.org/guidelines/epcis-cbv/ |
| S-UBL | OASIS UBL 2.4 | https://docs.oasis-open.org/ubl/os-UBL-2.4/UBL-2.4.html |

## Sibling research, read only

Read 2026-08-16 from other branches. Not written.

| Path | Branch |
| --- | --- |
| `research/domain/party/README.md` | `origin/cursor/issue-14-domain-cfd8` |
| `research/domain/product/README.md` | `origin/cursor/issue-15-domain-cfd8` |
| `research/erpnext/atlas.md` A-BUY | `origin/cursor/issue-32-corpus-cfd8` |
| `research/odoo/atlas.md` purchase rows | `origin/cursor/issue-33-corpus-cfd8` |
| `research/moqui/domain-atlas.md` Order, Shipment, Invoice | `origin/cursor/issue-34-corpus-cfd8` |
| `research/valueflows-rea/issue-0037-economic-cycle.md` | `origin/cursor/issue-37-corpus-cfd8` |
| `research/standards/` listing only | `origin/cursor/issue-38-corpus-cfd8` |

Issue 16 order-to-cash had no `cursor/issue-16*` branch at fetch time.

## Licensing note

ERPNext is GPL. Odoo is LGPL. Notes record concepts, documented behavior, and public page URLs. No implementation was copied or translated into this MIT repo.
