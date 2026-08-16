---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: supported
---

# Sources

Pages and sibling notes fetched or read this session. A later agent should re-fetch the URL rather than trust a paraphrase.

**Kind.** source-system artifact for vendor docs and papers. Sibling notes are research artifacts, not first-party sources.

## In-repo contract

| ID | Document | Locator |
| --- | --- | --- |
| S-ISSUE-51 | https://github.com/EnzoTironi/OS/issues/51 | body, fetched 2026-08-16 |
| S-ISSUE-50 | https://github.com/EnzoTironi/OS/issues/50 | body, fetched 2026-08-16 |
| S-ISSUE-77 | https://github.com/EnzoTironi/OS/issues/77 | named by sibling induction as messy-data gate |
| S-BACKLOG | `docs/swarm-research-backlog.md` on `origin/main` | Agent output contract |
| S-PROGRAM | `docs/research-program.md` | Semantic fuzzing list and evidence extraction loop |
| S-README | `research/README.md` | Evidence note template and clean-room posture |
| S-THESIS | `docs/thesis.md` | AGI changes the optimization target, item 4 |
| S-CONST | `docs/constitution.md` | Rules 2, 4, 8, 9, 13, 16, 18 |
| S-OQ | `docs/open-questions.md` | Items 3, 4, 5, 7, 10, 19, 20. Not answered here |
| S-RFC | `rfcs/0001-metamodel-hypothesis.md` | Read only. Not edited. Falsification targets 2, 3, 7, 8, 11 |
| S-SCEN | `scenarios/README.md` | Principles and S-001 through S-012 |
| S-LAND | `research/reference-landscape.md` | Ontologiq stale approval. Palantir as operational ontology |

`docs/swarm-result-contract.md` is absent on `origin/main`. The file exists on `origin/cursor/swarm-result-contract-cfd8`. This folder follows the backlog contract named in the brief.

## Method papers

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-QC | Claessen and Hughes. QuickCheck. ICFP 2000. https://doi.org/10.1145/351240.351266 | 2026-08-16 | Properties as executable functions. Random generators. Custom generators. |
| S-HUGHES | Hughes. How to Specify It. TFP 2019. cited via later PBT surveys | 2026-08-16 | Property styles. Not fetched as PDF this session. Cell `undetermined` for page quotes. |
| S-HYPO-INT | MacIver. Integrated vs type based shrinking. https://hypothesis.works/articles/integrated-shrinking/ | 2026-08-16 | Type-based shrink can change the error. Generator must own shrink. |
| S-HYPO-RED | MacIver and Donaldson. Test-Case Reduction via Test-Case Generation. ECOOP 2020. http://www.doc.ic.ac.uk/~afd/papers/2020/ECOOP_Hypothesis.pdf | 2026-08-16 | Internal reduction on the choice sequence. Shortlex. Validity preserved. |
| S-DD | Zeller and Hildebrandt. Simplifying and Isolating Failure-Inducing Input. IEEE TSE 28(2), 2002. https://www.st.cs.uni-saarland.de/publications/files/zeller-tse-2002.pdf | 2026-08-16 | `ddmin` 1-minimal failing input. `dd` isolates the difference from a passing case. |
| S-MT | Chen et al. Metamorphic Testing. ACM Computing Surveys 51(1) article 4, 2018. https://doi.org/10.1145/3143561 | 2026-08-16 | Oracle problem. Metamorphic relations over multiple inputs. |
| S-DIFF | McKeeman. Differential Testing for Software. Digital Technical Journal 10(1), 1998. https://www.cs.swarthmore.edu/~bylvisa1/cs97/f13/Papers/DifferentialTestingForSoftware.pdf | 2026-08-16 | Two or more comparable systems. Difference is a candidate bug. Shrink before humans. Majority is a quality metric, not truth. |
| S-CQ | Gruninger and Fox. Methodology for the Design and Evaluation of Ontologies. IJCAI 1995 workshop. http://stl-fs.mie.utoronto.ca/publications/gruninger-ijcai95.pdf | 2026-08-16 | Motivating scenarios. Informal then formal competency questions. Questions evaluate commitments. They do not generate them. |

## Formal and industry models

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-VF-CORE | https://www.valueflo.ws/introduction/core/ | 2026-08-16 | Knowledge, Plan, Observation layers. Track and trace. |
| S-VF-ACT | https://www.valueflo.ws/concepts/actions/ | 2026-08-16 | `transferAllRights`, `transferCustody`, `move`, `raise`, `lower`, `produce`, `consume` |
| S-VF-PROC | https://www.valueflo.ws/concepts/processes/ | 2026-08-16 | One process instance can carry commitments and events. |
| S-EPCIS | GS1. EPCIS Standard 2.0. https://ref.gs1.org/standards/epcis/ | 2026-08-16 | Object, Aggregation, Transaction, Transformation events. What, when, where, why, how. |
| S-PROV | W3C. PROV-O. Recommendation. https://www.w3.org/TR/prov-o/ | 2026-08-16 | Entity, Activity, Agent. `used`, `wasGeneratedBy`. |

## Operational corpora, documentation only

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-ERPN-IMM | https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext | 2026-08-16 | Cancel keeps original rows and adds reversals. Backdated stock can trigger Repost Item Valuation. Closed periods can block. |
| S-ERPN-LED | https://docs.frappe.io/erpnext/how-transactions-affect-the-ledger | 2026-08-16 | Posting Date is not creation date. Cancel does not remove history. Commitment documents versus ledger documents. |
| S-ERPN-REP | https://docs.frappe.io/erpnext/repost-item-valuation | 2026-08-16 | Repost after backdated stock. Changes later valuation. |
| S-ERPN-ACC | https://docs.frappe.io/erpnext/accounting-of-inventory-stock | 2026-08-16 | Backdated stock or cancel or amend recalculates later SLE and GL. |
| S-ODOO-RET | https://www.odoo.com/documentation/19.0/applications/sales/sales/products_prices/returns.html | 2026-08-16 | After a validated delivery, Return creates a reverse transfer. After invoice, reverse transfer plus credit note. Validated invoices cannot be changed in place. |
| S-ODOO-RES | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods.html | 2026-08-16 | Fetch timed out this session. Cell `undetermined` here. Sibling inventory cites it. |

Odoo 18 and 17 inventory return pages returned 404 this session. Use S-ODOO-RET.

## Sibling research artifacts

Read via `git show`. Cite only. Do not copy.

| ID | Path | Branch |
| --- | --- | --- |
| S-SIB-50 | `research/agi/induction/` | `origin/cursor/issue-50-agi-cfd8` |
| S-SIB-16 | `research/domain/o2c/` | `origin/cursor/issue-16-domain-cfd8` |
| S-SIB-18 | `research/domain/inventory/` | `origin/cursor/issue-18-domain-cfd8` |
| S-SIB-19 | `research/domain/manufacturing/` | `origin/cursor/issue-19-domain-cfd8` |

## Missing this session

| ID | Expected input | Decision |
| --- | --- | --- |
| S-MESSY | Real-company spreadsheets, APIs, documents, messages | `undetermined`. Not in-repo. Issue 77 |
| S-MOQUI-1P | First-party Moqui cancel or backdate page | `undetermined` here. Sibling notes only |
| S-TESTS | ERPNext, Odoo, or Moqui test files cloned into this workspace | `undetermined`. No vendor trees in `/workspace` |
| S-HUGHES-PDF | Hughes 2019 PDF | `undetermined` for quotations |
| S-AFL | Zalewski AFL coverage-guided fuzzing first-party page | `undetermined`. Not fetched. Do not treat statement coverage as the metric. |
