---
issue: 31
kind: source-system artifact index
fetched: 2026-08-16
decision_state: n/a
---

# Sources

Only first-party pages, published standards, and ontology files retrieved this session, plus in-repo documents already on `origin/main`. Secondary vendor blogs were not used as evidence. The ERPNext Consolidated Financial Statement page and the drop-ship-between-subsidiaries page returned 404 this session. Those cells stay `undetermined`.

## In-repo, already on origin/main

| Path | Use |
| --- | --- |
| `docs/thesis.md` | Mature ERPs are evidence, not foundations |
| `docs/constitution.md` | Model the world, not the source schema. Licensing hygiene |
| `docs/open-questions.md` §12, §13 | Relationship-entities and economic reality. Not answered here |
| `docs/research-program.md` | Convergence matrix. Supplier as role or kind |
| `docs/swarm-research-backlog.md` | Agent output contract |
| `rfcs/0001-metamodel-hypothesis.md` | Relator threshold. Untouched |
| `docs/hypothesis-history.md` | Customer and Supplier may be roles |
| `scenarios/README.md` | S-005 supplier is also customer. Multi-company listed as future family |
| `research/README.md` | Evidence note template and clean-room posture |
| `research/reference-landscape.md` | Landscape snapshot. Secondary to first-party fetches |

## ERPNext and Frappe, fetched this session

| URL | What was taken | Retrieved |
| --- | --- | --- |
| https://docs.frappe.io/erpnext/company-setup | Company is a legal entity with books. Group parent does not post. Branch is not a Company unless it keeps separate books. Default currency versus reporting currency | 2026-08-16 |
| https://docs.frappe.io/erpnext/concepts-and-terms | Multiple Company records share Customer, Supplier, and Item. Accounting differs per Company | 2026-08-16 |
| https://docs.frappe.io/erpnext/inter-company-invoices | Represents Company on internal Customer and Supplier. Two submitted invoices. Does not consolidate. Stock still needs Delivery Note or Purchase Receipt | 2026-08-16 |
| https://docs.frappe.io/erpnext/inter-company-journal-entry | Two linked Journal Entries. Each company balances alone. Shared-cost example. Counterpart accounts are not copied | 2026-08-16 |
| https://docs.frappe.io/erpnext/multi-currency-accounting | Company, account, and transaction currencies. Realized versus unrealized exchange difference. Account currency cannot change after postings | 2026-08-16 |
| https://docs.frappe.io/erpnext/finance-book | Alternate reporting basis for one Company. Not for departments. Blank book means common entries | 2026-08-16 |
| https://docs.frappe.io/erpnext/accounting-reports | Company filter is one legal entity. Consolidated Financial Statements named for group view. Presentation currency changes display only | 2026-08-16 |
| https://docs.frappe.io/erpnext/warehouse | Warehouse saved with Company abbreviation. Perpetual inventory requires each Warehouse to belong to one company | 2026-08-16 |
| https://github.com/frappe/erpnext/issues/46286 | Shared warehouse request. Collaborator: physical warehouse may be one, books show it separately. Stock across companies uses commercial documents | 2026-08-16 |
| https://docs.frappe.io/erpnext/consolidated-financial-statement | 404 this session | 2026-08-16 |
| https://docs.frappe.io/erpnext/drop-ship-between-subsidiary-companies | 404 this session | 2026-08-16 |

ERPNext is GPL. Notes record documented behavior only.

## Odoo 18 and 19, fetched this session

| URL | What was taken | Retrieved |
| --- | --- | --- |
| https://www.odoo.com/documentation/18.0/applications/general/companies.html | Company has legal identity and books. Branch is a subdivision. Independent subsidiaries must be companies. Parent cannot later become a branch | 2026-08-16 |
| https://www.odoo.com/documentation/18.0/applications/general/companies/multi_company.html | Shared records when Company field is blank. Inter-company counterpart documents. Products must be shared. Branch versus new company for a product line | 2026-08-16 |
| https://www.odoo.com/documentation/18.0/applications/finance/accounting.html | Each company has its own chart. Accounts can be shared. Users view many companies and work one company's accounting at a time. Branches share parent chart, currency, and taxes | 2026-08-16 |
| https://www.odoo.com/documentation/18.0/applications/finance/accounting/get_started/consolidation.html | Legal entities consolidate. Branches do not consolidate the same way. Account mapping. Multi-ledgers. Elimination journals excluded from regular ledgers. CTA rates | 2026-08-16 |
| https://www.odoo.com/documentation/19.0/applications/general/companies/multi_company.html | Shared product with company-specific Cost. Synchronize Stock Moves. Warehouses for extra companies are created manually | 2026-08-16 |

Odoo Community is LGPL. Notes record documented behavior only.

## Moqui Mantle, fetched this session

| URL | What was taken | Retrieved |
| --- | --- | --- |
| https://moqui.org/m/docs/apps/Marble+ERP+User+Guide/Configuration/Company+Setup | Internal Organization is a Party with role Internal. Accounting preferences per internal org. Base Currency. Chart copied from a Source Party | 2026-08-16 |
| https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party | Party, Person, Organization share `partyId`. RoleType. PartyRelationship with fromDate and thruDate. PartyIdentification. Party-specific TimePeriod | 2026-08-16 |
| https://www.moqui.org/m/docs/framework/Security | Entity filters use `activeOrgId` and `filterOrgIds`. Organization membership, not a second database, isolates records | 2026-08-16 |

Moqui is CC0 or Apache depending on component. Notes record documented behavior only.

## IFRS Foundation, fetched this session

| URL | What was taken | Retrieved |
| --- | --- | --- |
| https://www.ifrs.org/issued-standards/list-of-standards/ifrs-10-consolidated-financial-statements/ | Control is the basis for consolidation. Consolidated statements present parent and subsidiaries as one economic entity | 2026-08-16 |
| https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ifrs-10-consolidated-financial-statements.pdf | IFRS 10 paragraphs 5–25 and B86. Three-element control. Uniform policies. Full intragroup elimination. NCI in equity. Control start and stop dates | 2026-08-16 |
| https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/ | Functional currency is the primary economic environment. Presentation currency may be any currency | 2026-08-16 |
| https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2025/issued/ias21.html | IAS 21 paragraphs 8–22, 34, 38. Functional versus presentation. Transaction date rate. Books may be kept in a third currency | 2026-08-16 |
| https://www.ifrs.org/issued-standards/list-of-standards/ias-27-separate-financial-statements/ | Separate financial statements are in addition to consolidated statements. Cost, IFRS 9, or equity method | 2026-08-16 |
| https://www.ifrs.org/issued-standards/list-of-standards/ias-28-investments-in-associates-and-joint-ventures/ | Significant influence is not control. 20 percent voting presumption. Equity method | 2026-08-16 |
| https://www.ifrs.org/issued-standards/list-of-standards/ifrs-3-business-combinations/ | Acquisition-date fair value allocation and goodwill. Definition of a business | 2026-08-16 |

iasplus.com IFRS 10 page timed out. Consolidation cells that needed that page stay on the IFRS Foundation PDF and About pages.

## FIBO and GLEIF, fetched this session

| URL | What was taken | Retrieved |
| --- | --- | --- |
| https://github.com/edmcouncil/fibo/blob/master/ONTOLOGY_GUIDE.md | LegalEntity is a LegalPerson that is a partnership, corporation, or other organization with capacity to contract and assume debts, organized under a jurisdiction | 2026-08-16 |
| https://github.com/edmcouncil/fibo/releases/tag/master_2025Q1 | LegalPerson and LegalEntity moved to OMG Commons Organizations in 2025Q1. FIBO still publishes the historical URI | 2026-08-16 |
| https://spec.edmcouncil.org/fibo/ontology/BE/LegalEntities/LegalPersons/LegalEntity?version=master%2F2025Q2 | Viewer shell only. Class body not rendered. Definition taken from ONTOLOGY_GUIDE.md | 2026-08-16 |
| https://www.gleif.org/en/lei-data/gleif-concatenated-file/download-the-concatenated-file/ | Level 1 is who is who. Level 2 is who owns whom. Direct and ultimate accounting consolidating parents. Reporting exceptions | 2026-08-16 |
| https://www.gleif.org/media/pages/lei-data/gleif-data-quality-management/xml-schema/e21406c845-1747295091/2021-03-04_rr-cdf-v2-1.xsd | StartNode child is fully consolidated by EndNode parent. Direct versus ultimate consolidating parent | 2026-08-16 |

FIBO OwnershipAndControl viewer pages did not render class text this session. Ownership versus control in FIBO stays `undetermined` beyond the LegalEntity definition and GLEIF consolidating-parent records.

## Not fetched, therefore not used as proof

| Topic | Why it is open |
| --- | --- |
| OECD Transfer Pricing Guidelines | No official OECD page was retrieved this session |
| CPC or Receita Federal grupo econômico rules | Issue 30 owns Brazilian fiscal identity. This folder does not invent them |
| ERPNext Consolidated Financial Statement report internals | Doc page 404. Accounting-reports only names the report |
| IFRS 11 Joint Arrangements full text | Only named from IFRS 10 and IAS 28 About pages |

## Sibling research, read only, not copied

| Branch | Path | Use |
| --- | --- | --- |
| `cursor/issue-14-domain-cfd8` | `research/domain/party/` | Format sample. LegalPerson versus OperatingUnit versus Brand. Customer and Supplier as roles |
| `cursor/issue-18-domain-cfd8` | none on origin at fetch time | Inventory location ownership reserved |
| `cursor/issue-21-domain-cfd8` | none on origin at fetch time | Books and currency reserved |
| `cursor/issue-30-domain-cfd8` | none on origin at fetch time | CNPJ and fiscal documents reserved |
