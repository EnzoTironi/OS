# Sources

**Kind.** reference  
**Fetched.** 2026-08-16  
**Decision.** none

## Question

Which independent public sources were read for issue 60, and what was left unread?

## Examined

| Source | What was read | Grade if used as evidence | Locator |
| --- | --- | --- | --- |
| ValueFlows | Flows. Accounting and corrections. | official-doc | https://www.valueflo.ws/concepts/flows/ and https://www.valueflo.ws/concepts/accounting/ accessed 2026-08-16 |
| W3C PROV-O | Recommendation. `alternateOf`, `wasRevisionOf`, `wasInvalidatedBy`, `hadPrimarySource`. | official-doc | W3C, PROV-O, 2013-04-30, https://www.w3.org/TR/2013/REC-prov-o-20130430/ |
| GS1 EPCIS 2.0 | Release notes and How dimension. SensorElement. | official-doc | GS1, EPCIS Standard, Release 2.0, ratified Jun 2022, https://ref.gs1.org/standards/epcis/2.0.0/ |
| GS1 CBV 2.0 | `owning_party`, `possessing_party`, location. | official-doc | GS1, Core Business Vocabulary, Release 2.0, ratified Jun 2022, section 7.4.3, https://ref.gs1.org/standards/cbv/ |
| JCGM GUM | Measurement result is an estimate plus uncertainty. | official-doc | JCGM 100:2008, clause 3.1.2, https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf |
| IAS 8 | Estimate change versus prior-period error. | official-doc | IFRS Foundation, IAS 8, 2026 issued HTML, paragraphs 34, 41, 42, https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ias8.html |
| Palantir Foundry | Multi-datasource objects. How user edits are applied. Ontology best practices. | official-doc | https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/ , https://palantir.com/docs/foundry/object-edits/how-edits-applied/ , https://palantir.com/docs/foundry/ontology/ontology-best-practices/ accessed 2026-08-16 |
| ERPNext manuals | Sales Order. Stock Reconciliation. Quality Inspection. Common Party Accounting. | official-doc | pages dated 2026-02-27 to 2026-08-03 on https://docs.frappe.io/erpnext/ |
| Odoo 17 manuals | Create quotations. Inventory adjustments. | official-doc | https://www.odoo.com/documentation/17.0/applications/sales/sales/send_quotations/create_quotations.html and https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html accessed 2026-08-16 |
| SAP | Parallel accounting with ledgers. Universal Parallel Accounting extract. | official-doc | SAP Help, Customizing for Parallel Accounting, https://help.sap.com/doc/cef748510c276239e10000000a423f68/700_SFIN3E%20006/en-US/8e4fefe119e7449d968cd3f6b5f9a438.html . SAP, Universal Parallel Accounting, 2023.0_UPA, https://help.sap.com/doc/d078f3c7e8724bb283e30298f5ae422f/2023.0_UPA/en-US/88d56705fac34577992614b5509e7e91.pdf |
| Microsoft Learn | Virtual entities for finance and operations apps. Dual-write versus virtual tables training. | official-doc | https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/power-platform/virtual-entities-overview dated 2026-01-21, git commit `f3620b9f4e646da05b8104ef906fc7bff4811316`. https://learn.microsoft.com/en-us/training/modules/get-started-with-powerapps-common-data-service/2b-dual-write-vs-virtual-table accessed 2026-08-16 |
| This repo | Thesis, constitution, open questions, research program, backlog, RFC-0001, scenarios S-001 and S-011, `research/reference-landscape.md`. Read only. | design-claim | files on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c` |

## Sibling notes read by `git show` only

These are pointers. Their prose is not copied into this folder and is not treated as primary evidence.

| Branch | SHA | Path used as a pointer |
| --- | --- | --- |
| `cursor/issue-4-foundation-cfd8` | `905baa0c99f09fd445b9f1bb0eee5435fa814be3` | `research/foundation/facts/` |
| `cursor/issue-5-foundation-cfd8` | `a967d4de3164b41098055625d08cc492a7ee3a24` | `research/foundation/temporal/` |
| `cursor/issue-6-foundation-cfd8` | `ad79e365c0133886cdb7957e18dcedc833bbcaf2` | `research/foundation/provenance/` |
| `cursor/issue-12-foundation-cfd8` | `db8d2840647f0e01e49759edb3625895bb6f240a` | `research/foundation/state/` |
| `cursor/issue-14-domain-cfd8` | `c64346995f62c6ac3d768c4c010f6b8bcb718fb8` | `research/domain/party/` |
| `cursor/issue-16-domain-cfd8` | `9d82f27e9cea2a8d2d71ed77de9eaa553121e6b5` | `research/domain/o2c/` |
| `cursor/issue-18-domain-cfd8` | `de2bbe3ff71dcabb9ead699854a1b934496affbc` | `research/domain/inventory/` |
| `cursor/issue-21-domain-cfd8` | `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc` | `research/domain/accounting/` |
| `cursor/issue-25-domain-cfd8` | `cdcd763d9b98378366f9d3999fafb854fe2c6961` | `research/domain/quality/` |
| `cursor/swarm-result-contract-cfd8` | `f076b311bc911e7f68027cc46c25c6cf5cf683c9` | `docs/swarm-result-contract.md` |

## Not examined

- ERPNext, Odoo, Moqui, or SAP source trees. No product clone.
- Ontologiq source beyond `research/reference-landscape.md` on `main`.
- ISO 8000 master-data quality text. Paywalled. Identity conclusions stay `hypothesis`.
- ISA-95 quality clauses in the IEC 62264 PDFs. Not fetched this pass.
- Bank-statement matching manuals. The cash-book versus bank-book case is inferred from IAS 8 plus ordinary reconciliation practice and stays `hypothesis` until a named bank-rec manual is cited.
- Issue 74 contract schema validation. The schema is not on `origin/main`, and this exclusive tree cannot write `research/index/`.
