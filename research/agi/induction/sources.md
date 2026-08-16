---
issue: 50
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
| S-ISSUE-50 | https://github.com/EnzoTironi/OS/issues/50 | body, fetched 2026-08-16 |
| S-ISSUE-77 | https://github.com/EnzoTironi/OS/issues/77 | body, fetched 2026-08-16 |
| S-BACKLOG | `docs/swarm-research-backlog.md` on `origin/main` | Agent output contract |
| S-PROGRAM | `docs/research-program.md` | Evidence extraction loop and research agents |
| S-README | `research/README.md` | Evidence note template and clean-room posture |
| S-THESIS | `docs/thesis.md` | AGI changes the optimization target |
| S-CONST | `docs/constitution.md` | Rules 2, 3, 4, 16, 18 |
| S-OQ | `docs/open-questions.md` | Items 10, 12, 14, 20. Not answered here |
| S-RFC | `rfcs/0001-metamodel-hypothesis.md` | Read only. Not edited |
| S-SCEN | `scenarios/README.md` | S-005, S-011, and scenario principles |
| S-LAND | `research/reference-landscape.md` | Palantir, REA, ERPNext as evidence |

`docs/swarm-result-contract.md` is absent on `origin/main`.

## Method papers

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-OL-CAKE | Buitelaar, Cimiano, Magnini. Ontology Learning from Text. An Overview. 2005. https://noah.nrw/ubbihs/download/pdf/5124773 | 2026-08-16 | Layer cake. Terms, synonyms, concepts, hierarchies, relations, rules |
| S-OL-SURVEY | Gómez-Pérez and Manzano-Macho via CEUR. A Survey of Ontology Learning Procedures. https://ceur-ws.org/Vol-427/paper2.pdf | 2026-08-16 | Text2Onto. Human engineer still in the loop |
| S-CODEONT | Atzeni and Atzori. CodeOntology. ISWC 2017. https://dl.acm.org/doi/10.1007/978-3-319-68204-4_2 | 2026-08-16 | RDF-izes programming constructs. Not domain laws |
| S-SABOU | Sabou. From Software APIs to Web Service Ontologies. ISWC 2004. https://link.springer.com/chapter/10.1007/978-3-540-30475-3_29 | 2026-08-16 | Semi-automatic extraction from software docs. Quality checked against a hand-built ontology |
| S-DEBATE | Du, Li, Torralba, Tenenbaum, Mordatch. Improving Factuality and Reasoning in Language Models through Multiagent Debate. arXiv:2305.14325. https://arxiv.org/abs/2305.14325 | 2026-08-16 | Multi-round critique. Can start wrong and later become right. Also can converge |
| S-REFLEX | Shinn et al. Reflexion. arXiv:2303.11366. https://arxiv.org/abs/2303.11366 | 2026-08-16 | Verbal reflection stored in episodic memory. Uses task feedback |
| S-REFINE | Madaan et al. Self-Refine. arXiv:2303.17651. https://arxiv.org/abs/2303.17651 | 2026-08-16 | Same model as generator, critic, and refiner |
| S-HUANG | Huang et al. Large Language Models Cannot Self-Correct Reasoning Yet. ICLR 2024. https://arxiv.org/html/2310.01798v2 | 2026-08-16 | Intrinsic self-correction without external feedback can degrade reasoning. Debate no better than self-consistency at equal cost in their setup |

## Formal and economic models

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-UFO | Guizzardi et al. UFO. Unified Foundational Ontology. https://www.inf.ufes.br/~gguizzardi/Applied_Ontology__UFO__Unified_Foundational_Ontology.pdf | 2026-08-16 | Kind, Role, Phase, Relator |
| S-ONTOUML | Guizzardi et al. Endurant Types in Ontology-Driven Conceptual Modeling. 2018. https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf | 2026-08-16 | Kind versus Role on endurants |
| S-VF-AGENT | https://www.valueflo.ws/concepts/agents/ | 2026-08-16 | Person, Organization. Roles are not Agent subclasses |
| S-VF-EX | https://www.valueflo.ws/examples/ex-agent/ | 2026-08-16 | `is supplier of` / `is customer of` as `AgentRelationshipRole` |
| S-VF-PROC | https://www.valueflo.ws/concepts/processes/ | 2026-08-16 | One process instance can carry commitments and events |
| S-VF-SPEC | https://www.valueflo.ws/specification/all_vf.html | 2026-08-16 | Agent, Commitment, Intent, provider, receiver |
| S-ISA95 | OPC Foundation. ISA-95 Job Order. https://reference.opcfoundation.org/ISA95JOBCONTROL/v100/docs/4.2 | 2026-08-16 | Job Order is a request. Job Response is a report |

## Operational corpora, documentation only

| ID | Source | Fetched | Notes |
| --- | --- | --- | --- |
| S-ERPN-RES | https://docs.frappe.io/erpnext/stock-reservation | 2026-08-16 | Stock Reservation Entry. Purpose-tagged claim |
| S-ERPN-WO-RES | https://docs.frappe.io/erpnext/stock-reservation-for-work-order | 2026-08-16 | Reserve raw materials on Work Order submit |
| S-ERPN-WO | https://docs.frappe.io/erpnext/work-order | 2026-08-16 | Work Order is a shop-floor signal to manufacture a quantity |
| S-ERPN-JC | https://docs.frappe.io/erpnext/job-card | 2026-08-16 | Job Card stores actual operation at a workstation |
| S-ERPN-CUST | https://docs.frappe.io/erpnext/customer | 2026-08-16 | Customer master. Separate billed party. Contacts and Addresses linked |
| S-ODOO-RES | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods.html | 2026-08-16 | Reservation method on operation type |
| S-ODOO-CONF | https://www.odoo.com/documentation/17.0/th/applications/inventory_and_mrp/inventory/shipping_receiving/reservation_methods/at_confirmation.html | 2026-08-16 | At confirmation. Reserved can be zero when stock is short |
| S-ODOO-WO | https://www.odoo.com/documentation/16.0/applications/inventory_and_mrp/manufacturing/management/using_work_centers.html | 2026-08-16 | Manufacturing Order creates Work Orders from BoM operations |
| S-ODOO-MO13 | https://www.odoo.com/documentation/13.0/applications/inventory_and_mrp/manufacturing/management/manufacturing_order.html | 2026-08-16 | Older page. MO without routings versus MO plus Work Orders |
| S-PAL | https://palantir.com/docs/foundry/ontology/overview/ | 2026-08-16 | Operational ontology maps datasources. Not used as OS kernel |
| S-PAL-IF | https://palantir.com/docs/foundry/interfaces/interface-overview/ | 2026-08-16 | Interface describes shape and capabilities |

Odoo 19.0 manufacturing-order page returned 404 this session. That cell is `undetermined`. Use S-ODOO-WO and S-ODOO-MO13.

## Sibling research artifacts

Read via `git show`. Cite only. Do not copy.

| ID | Path | Branch |
| --- | --- | --- |
| S-SIB-14 | `research/domain/party/` | `origin/cursor/issue-14-domain-cfd8` |
| S-SIB-18 | `research/domain/inventory/` | `origin/cursor/issue-18-domain-cfd8` |
| S-SIB-19 | `research/domain/manufacturing/` | `origin/cursor/issue-19-domain-cfd8` |
| S-SIB-03 | `research/identity-kinds-roles/` | `origin/cursor/issue-3-foundation-cfd8` |
| S-SIB-37 | `research/ontouml-ufo/`, `research/valueflows-rea/` | `origin/cursor/issue-37-corpus-cfd8` |

## Missing this session

| ID | Expected input | Decision |
| --- | --- | --- |
| S-MESSY | Real-company spreadsheets, APIs, documents, messages | `undetermined`. Not in-repo. Issue 77 |
| S-MOQUI-1P | First-party Moqui reservation or party page | `undetermined` here. Sibling notes only |
| S-TESTS | ERPNext, Odoo, or Moqui test files cloned into this workspace | `undetermined`. No vendor trees in `/workspace` |
