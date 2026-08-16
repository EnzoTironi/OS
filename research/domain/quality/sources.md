# Sources

**Kind:** source-system artifact  
**Decision state:** supported for the fetch list. Completeness of any one standard remains undetermined.

Fetched 2026-08-16. Prefer these URLs over later summaries.

## Operational systems

| ID | Source | What was read | URL |
| --- | --- | --- | --- |
| S-ERP-QI | ERPNext docs, Quality Inspection | Template fetch, incoming or outgoing or in-process types, sample size, numeric or non-numeric or formula criteria, manual inspection override, stock-document gate | https://docs.frappe.io/erpnext/quality-inspection |
| S-ERP-QM | ERPNext docs, Quality management intro | Marketing-level list. Inspection templates, nonconformance, batch tracking. Thin on lifecycle | https://docs.frappe.io/erpnext/quality-management |
| S-ERP-QA | ERPNext docs, Quality Action | Corrective or preventive action against a Quality Review or Quality Feedback. Not against a Quality Inspection | https://docs.frappe.io/erpnext/quality_action |
| S-ERP-QP | ERPNext docs, Quality Procedure | SOP with steps or child procedures. Linked from Quality Goal | https://docs.frappe.io/erpnext/quality_procedure |
| S-ERP-QG | ERPNext docs, Quality Goal | Objectives, numeric or yes-no targets, review frequency | https://docs.frappe.io/erpnext/quality_goal |
| S-ERP-QR | ERPNext docs, Quality Review | Periodic performance against a goal. Can spawn a Quality Action | https://docs.frappe.io/erpnext/quality_review |
| S-ERP-PR | frappe/erpnext PR 23916 | Formula-based readings. Template formula fetched onto the inspection. Header accept remains a user decision after row status | https://github.com/frappe/erpnext/pull/23916 |
| S-ERP-PATH | frappe/erpnext path only | `erpnext/stock/doctype/quality_inspection/quality_inspection.py` exists. Behavior was not copied. Use S-ERP-QI and S-ERP-PR | GitHub code search, 2026-08-16 |
| S-ODOO-QCP | Odoo 19 docs, Quality control points | QCP creates checks. Control per operation, product, or quantity. Frequency all, random, periodic, or on-demand. Types include Pass-Fail, Measure with norm and tolerance and optional device, worksheet, spreadsheet | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/quality_control_points.html |
| S-ODOO-CHK | Odoo 19 docs, Quality checks | Check is a manual inspection instance. Can bind lot or serial. Pass or Fail buttons. Shop Floor checkbox can mark Passed without the pop-up | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/quality_checks.html |
| S-ODOO-AL | Odoo 19 docs, Quality alerts | Alert notifies a team. Description, corrective actions, preventive actions, root cause, stages. Not itself a disposition of stock | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/quality_alerts.html |
| S-ODOO-FL | Odoo 19 docs, Failure locations | On Control per Quantity, failed quantity can move to a failure location. Passed quantity follows the normal destination | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/failure_locations.html |

## Standards and regulations

| ID | Source | What was read | URL |
| --- | --- | --- | --- |
| S-ISO9000 | ISO/TC 176 terms listing, 2022-09-29 | Official alphabetical extract of ISO 9000:2015 terms. Characteristic, quality characteristic, specification, requirement, inspection, measurement process, concession, deviation permit, correction, rework, repair, release, traceability, verification, objective evidence | https://committee.iso.org/files/live/sites/tc176sc1/files/Terms%20in%20TC%20176%20Standards%20Alphabetical%20Listing%20V1%202022%2009%2029.pdf |
| S-ISO9001 | ISO 9001:2015 clauses 7.1.5.2, 8.5.2, 8.6, 8.7, 10.2 | Release, nonconforming outputs, measurement traceability, identification and traceability, corrective action. Read from a third-party hosted copy of the published text. Clause numbers match the standard | https://www.accredixglobal.com/assets/pdf/ISO-9001-2015-Fifth-Edition.pdf |
| S-ISO2859 | ISO 2859-1:2026 public page | AQL-indexed lot-by-lot attribute sampling. Switching among normal, tightened, reduced, and skip-lot. Sampling tables themselves are paywalled | https://www.iso.org/standard/85464.html |
| S-ISA95-TR | OPC UA ISA-95 companion, ISA95TestResultDataType | Test result is the result of executing a test identified in a Test Specification. Fields include Id, Date that may differ from record timestamp, Result, unit, Expiration | https://reference.opcfoundation.org/ISA-95/v100/docs/7.4.3 |
| S-ISA95-TS | OPC UA ISA-95 companion, ISA95TestSpecificationType | Abstract test specification with a Version attribute. Details left to subtypes | https://reference.opcfoundation.org/ISA-95/v100/docs/7.6.4 |
| S-ISA95-P1 | ISA-95, also published as IEC 62264, Part 1 | Not fetched. Paywalled. Part 1 quality attributes stay undetermined | not fetched |
| S-GS1-CBV | GS1 CBV 2.0 | Business steps `inspecting` and `sampling`. Dispositions `conformant`, `non_conformant`, `recalled`, `holding`. Transaction types `cert`, `testprd`, `testres`. Persistent disposition. User must not mint `urn:epcglobal:cbv:disp:quarantined` | https://ref.gs1.org/standards/cbv/2.0.0/ |
| S-GS1-EPCIS | GS1 EPCIS 2.0 | Events are not deleted. Correction is a later event. `certificationInfo` on the event. SensorElement exists | https://ref.gs1.org/standards/epcis/2.0.0/ |
| S-GS1-GL | GS1 EPCIS and CBV Implementation Guideline | Disposition is the condition after the event. Business step `inspecting` can end as `in_progress` or `recalled`. Later shipping of a recalled object keeps disposition `recalled` | https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd |
| S-CFR211 | 21 CFR 211.165 | Each batch needs laboratory determination of conformance to final specifications before release. Written sampling plans. Failed product is rejected. Reprocessed material must meet specifications before use. Short-lived radiopharmaceuticals may release before sterility completes | https://www.law.cornell.edu/cfr/text/21/211.165 |
| S-GUM | JCGM 100:2008 | Uncertainty is a parameter associated with a measurement result that characterizes the dispersion of values that could reasonably be attributed to the measurand. A result reflects lack of exact knowledge of the value | https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf |

## Not used as first-party evidence

Partner blogs, Cybrosys books, and ERPNext reseller pages were seen in search. They are not cited as evidence.

21 CFR 211.192 (OOS investigation) was requested and timed out. Retest-investigation rules stay undetermined beyond 211.165.

ISO 2859 sampling tables and ISA-95 Part 1 attribute lists stay undetermined.

## Licensing note

ERPNext and Odoo are copyleft. Notes record documented behavior and public field names only.

ISO and JCGM texts are copyrighted. Notes quote short definitional phrases needed to name distinctions, not tables or procedures to implement.

GS1 CBV and EPCIS are public standards. Concepts are extracted. No GS1 XML or JSON examples are copied into the repo.
