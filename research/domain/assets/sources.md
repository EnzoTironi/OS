# Sources

**Kind:** source-system artifact and first-party documentation  
**Decision:** `supported` for the fetch list below. Coverage of ISA-95 Part 1 attribute tables is `undetermined`.

Fetched 2026-08-16. Concepts and documented behavior only. OS is MIT. Do not paste or translate implementation from GPL or LGPL corpora.

## ERPNext / Frappe documentation

Official docs, current `docs.frappe.io` pages, fetched this session.

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| EN-ASSET | Asset | https://docs.frappe.io/erpnext/asset | Asset as operating history. Item, location, custody, maintenance flag, depreciation, statuses including In Maintenance, Out of Order, Sold, Scrapped, Capitalized |
| EN-LOC | Asset Location | https://docs.frappe.io/erpnext/asset-location | Location tree. Explicitly not Warehouse |
| EN-MOVE | Asset Movement | https://docs.frappe.io/erpnext/user/manual/en/asset-movement | Transfer, Issue, Receipt. Location change is an event. No ledger effect |
| EN-MAINT | Asset Maintenance | https://docs.frappe.io/erpnext/user/manual/en/asset-maintenance and https://docs.frappe.io/erpnext/asset-maintenance | Recurring plan. Preventive versus repair. Calibration as a task. Certificate flag. Logs created from the plan |
| EN-LOG | Asset Maintenance Log | https://docs.frappe.io/erpnext/asset-maintenance-log | Planned, Completed, Overdue, Cancelled. Operational, not ledger |
| EN-REPAIR | Asset Repair | https://docs.frappe.io/erpnext/asset-repair | Failure date, downtime, cost, stock consumption, capitalize-or-expense |
| EN-CAP | Asset Capitalization | https://docs.frappe.io/erpnext/asset-capitalization | Composite target. Consumed assets, stock, and services become one valued asset |

## ERPNext source as field evidence

Field names and labels only. No logic copied.

| ID | Artifact | Locator | Used for |
| --- | --- | --- | --- |
| EN-REPAIR-JSON | Asset Repair DocType | `frappe/erpnext` path `erpnext/assets/doctype/asset_repair/asset_repair.json`, content SHA `a1081ecb1888c9b2f946ebde48927436cb46cc04` | Fields `failure_date`, `completion_date`, `downtime`, `description` labeled Error Description, `actions_performed`, `capitalize_repair_cost`, `increase_in_asset_life`, stock items, invoices. Status Pending, Completed, Cancelled. Asset filter excludes Work In Progress, Capitalized, Sold, Scrapped, Cancelled |
| EN-TASK-TYPES | Asset Maintenance Task types | Public type hints on `asset_maintenance_task.py` in frappe/erpnext-14, corroborated by EN-MAINT FAQ | Task type literals Preventive Maintenance and Calibration. Periodicity Daily through 3 Yearly. `certificate_required` |

## Odoo 18 documentation

Official `odoo.com/documentation/18.0` pages, fetched this session.

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| OD-MAINT | Maintenance | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/maintenance.html | App index |
| OD-REQ | Maintenance requests | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/maintenance/maintenance_requests.html | Request for Equipment or Work Center. Corrective versus Preventive. Request Date immutable. Scheduled Date and Duration. Block Workcenter. Stages New Request, In Progress, Repaired, Scrap. Optional Manufacturing Order and Work Order link |
| OD-SETUP | Maintenance setup | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/maintenance/maintenance_setup.html | Equipment as warehouse machines and tools. Used By department, employee, or other. Work Center link. MTBF, MTTR, Estimated Next Failure computed from corrective work |
| OD-EQ | Add new equipment | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/maintenance/add_new_equipment.html | Company or third-party owner. Serial Number. Effective Date. Warranty Expiration Date. Used in location as free text. Latest Failure taken from most recent request creation date |
| OD-ACC | Non-current assets and fixed assets | https://www.odoo.com/documentation/18.0/applications/finance/accounting/vendor_bills/assets.html | Accounting Asset is a depreciation board and journal flow. No maintenance request on that page |

## Odoo source as field evidence

Field names only. No logic copied.

| ID | Artifact | Locator | Used for |
| --- | --- | --- | --- |
| OD-REQ-FIELDS | `maintenance.maintenance_request` | `odoo/odoo` path `addons/maintenance/models/maintenance.py`, blob SHA `b49e97b78ff85c9fc76bd6f41db31a4ec8447122` | `maintenance_type` selection corrective, preventive. `schedule_date` help text calls it the date the team plans the work |

## ISA-95 / IEC 62264

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| ISA-EQ | OPC UA ISA-95 companion, role-based equipment | https://reference.opcfoundation.org/ISA-95/v100/docs/8.2 | Equipment is a logical role. Physical device may change. Asset assignment has StartTime and StopTime and must keep history. EquipmentCapabilityTestSpecification and test results. EquipmentLevel. MadeUpOfEquipment |
| ISA-PA | OPC UA ISA-95 companion, physical asset | https://reference.opcfoundation.org/specs/OPC-10030/8.3 | PhysicalAsset has vendor, model, FixedAssetId, serial-like identity, LocatedIn, ImplementationOf Equipment, MadeUpOfPhysicalAsset |
| ISA-LVL | Equipment element levels | https://reference.opcfoundation.org/ISA-95/v100/docs/7.4 | Enterprise, Site, Area, Work Center, Work Unit enumerations |
| IEC-INDEX | IEC 62264 parts list | https://en.wikipedia.org/wiki/IEC_62264 | Confirms Part 1 2013 object models exist. Not a substitute for the text |
| IEC-P1 | IEC 62264-1:2013 preview | https://webstore.iec.ch/preview/info_iec62264-1%7Bed2.0%7Den.pdf | Fetch this session returned the store shell, not the PDF. **Part 1 attribute tables stay `undetermined`.** |

Rhize and LinkedIn pages appeared in search. They are not used as evidence.

## EAM / CMMS first-party pages

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| MX-ROT | IBM Maximo rotating items | https://www.ibm.com/support/pages/rotating-items-rotating-inventory-and-rotating-assetsdizzy-yet UID `ibm11134393` | Rotating item is a class. Rotating asset is a serialized instance. Storeroom balance is those instances. Issue requires item and asset number. Value can rise after repair |
| MX-DASH | IBM Docs Assets and locations | https://www.ibm.com/docs/en/mhmpmh-and-p-u/cd?topic=using-assets-locations | Meters, work orders, failure code, job plan on asset and on location. Product line is Maximo Health. Treat as EAM pattern, not as this repo's healthcare scope |
| SAP-TO | SAP Learning, configuring technical objects | https://learning.sap.com/courses/sap-s-4hana-cloud-public-edition-asset-management-configuration/configuring-technical-objects_e5b3fad5-7f57-4680-b07f-5e35fb1756c5 | Functional location is an install place in a hierarchy. Equipment is the installed object. Usage times are documented. Measuring points and counters. Spare parts are product master, not the technical object |

Maximo JavaDoc `LocHierarchy` and consultant blogs describe parent-child location systems. They are secondary. Use them only as pointers that Maximo stores location parent, system, and site as a relation, not as OS vocabulary.

## Reliability vocabulary

| ID | Page | URL | Used for |
| --- | --- | --- | --- |
| ISO-14224-PRE | ISO 14224:2016 preview | https://cdn.standards.iteh.ai/samples/64076/997b35a640ef4758a4ce8c7dc4ba4a7d/ISO-14224-2016.pdf | Official definitions. Failure mechanism is the process that leads to failure. Failure mode is the manner in which failure occurs |
| ISO-14224-SIST | SIST EN ISO 14224:2016 preview | https://cdn.standards.iteh.ai/samples/40332/4d78660aa6824378a36a60051a396b9b/SIST-EN-ISO-14224-2016.pdf | Detection method is the method or activity by which a failure is discovered. Data categories include equipment, failure, and maintenance. Corrective and preventive named in the scope text |

Full ISO 14224 code tables and IEC 62264-1 attribute tables were not readable this session. Those cells are `undetermined`.

## Not used as primary evidence

- Third-party Odoo tutorials that add consumption-based triggers not present on the official 18.0 pages
- Commercial ISO 14224 blogs
- ISA-95 Part 1 paywalled body
- Sibling research files on #18, #19, #24, #25. Those branches exist on origin. Their `research/domain/*` trees were empty at fetch time. Cite the issues, not copied notes.

## Licensing note

ERPNext is GPL. Odoo Community is LGPL. Notes extract documented behavior and public field names. No source functions, validators, or translations enter this repo.
