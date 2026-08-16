---
issue: 14
kind: source-system artifact index
fetched: 2026-08-16
decision_state: n/a
---

# Sources

Only first-party pages, published papers, and ontology files retrieved this session, plus in-repo documents already on `origin/main`. Secondary vendor blogs were not used as evidence.

## In-repo, already on origin/main

| Path | Use |
| --- | --- |
| `docs/thesis.md` | Mature ERPs are evidence, not foundations |
| `docs/constitution.md` | Model the world, not the source schema. Licensing hygiene |
| `docs/open-questions.md` §11, §12 | Actors and relationship-entities. Not answered here |
| `docs/research-program.md` | Supplier as role or kind. Convergence matrix |
| `docs/swarm-research-backlog.md` | Agent output contract |
| `rfcs/0001-metamodel-hypothesis.md` | Relator threshold. Untouched |
| `docs/hypothesis-history.md` | Customer and Supplier may be roles |
| `scenarios/README.md` | S-005 supplier is also customer. S-006 employment lifecycle |
| `research/README.md` | Evidence note template and clean-room posture |
| `research/reference-landscape.md` | Landscape snapshot. Secondary to first-party fetches |

## ERPNext and Frappe HR, fetched this session

| URL | What was taken |
| --- | --- |
| https://docs.frappe.io/erpnext/customer | Customer as billed party. Type Company, Individual, Partnership. Contacts and Addresses as linked records. Disabled versus delete. Internal Customer. Credit limit per company |
| https://docs.frappe.io/erpnext/supplier | Separate Supplier master. Tax ID. Transporter. Internal Supplier. Hold types. Frozen. Multiple addresses |
| https://docs.frappe.io/erpnext/common-party-accounting | Party Link does not merge masters. Automatic journal for offset. Separate receivable and payable |
| https://docs.frappe.io/erpnext/contact | Contact is a person. One Contact links many parties. User invitation is separate |
| https://docs.frappe.io/erpnext/address | Address is a location. GSTIN on Address. Preferred billing and shipping. Disable obsolete locations |
| https://docs.frappe.io/erpnext/company-setup | Company is a legal entity with books. Branch is not a Company unless it keeps separate books |
| https://docs.frappe.io/erpnext/gst-for-multiple-branches | GSTIN differs by branch Address. Tax follows selected company and party addresses |
| https://docs.frappe.io/hr/employee | Employee is a person under a contract of employment. User is optional. Status Left blocks later transactions |

`https://docs.frappe.io/erpnext/employee` returned 404. Employee evidence is from Frappe HR docs, not the ERPNext path named in the issue.

## Odoo 18, fetched this session

| URL | What was taken |
| --- | --- |
| https://www.odoo.com/documentation/18.0/applications/essentials/contacts.html | Individual versus Company. Child contacts as address types. Tax ID and LEI on the contact. Archive, not delete |
| https://www.odoo.com/documentation/18.0/developer/tutorials/server_framework_101/07_relations.html | Official wording. `res.partner` is a physical or legal entity, or even a contact address. `res.users` is login |
| https://www.odoo.com/documentation/18.0/applications/essentials/contacts/merge.html | Merge is irreversible. Destination contact defaults to the oldest record. Dedup keys include Email, Name, Is Company, VAT, Parent Company |
| https://www.odoo.com/documentation/18.0/applications/general/companies.html | Company has legal identity and books. Branch is a subdivision. Independent subsidiaries must be companies. Parent cannot later become a branch |
| https://www.odoo.com/documentation/18.0/applications/finance/accounting/taxes/vat_verification.html | VAT format check. Optional VIES. Intra-Community Valid can be overridden with a chatter log |
| https://www.odoo.com/documentation/18.0/applications/hr/employees.html | Employee file, contracts, departments. Presence is a setting, not identity |
| https://www.odoo.com/documentation/18.0/applications/hr/employees/new_employee.html | Employee record is a personnel file. Work Address points at a company address. Related contact exists as work contact information |

Odoo Community is LGPL. Notes record documented behavior only.

## Moqui Mantle, fetched this session

| URL | What was taken |
| --- | --- |
| https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party | Party, Person, Organization share `partyId`. RoleType and optional PartyRole. PartyRelationship with from and thru dates. PartyIdentification. Immutable ContactMech. Agreement as a dated two-party record |

Moqui is CC0 for docs in the pages read. Entity names are source artifacts.

## ValueFlows and REA, fetched this session

| URL | What was taken |
| --- | --- |
| https://www.valueflo.ws/specification/all_vf/ | Agent, Person, Organization, EcologicalAgent. Provider and receiver on flows |
| https://www.valueflo.ws/specification/vfspec/ | AgentRelationship is an ongoing voluntary association. AgentRelationshipRole has role label and inverse |
| https://doi.org/10.2308/tar-4487748 | McCarthy 1982 abstract. Resources, events, agents, and relationships among those sets |

`https://www.valueflo.ws/concepts/agents/` and `https://www.valueflo.ws/examples/ex-agent/` timed out. Agent examples are cited only from the normative spec pages that did load. The Utah PDF of McCarthy 1982 also timed out. Commitments are not claimed as 1982 content.

## FIBO, fetched this session

| URL | What was taken |
| --- | --- |
| https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/Parties/Parties.rdf | Independent party. Party role identifier. Tax identifier and tax identification scheme. Mailing address on an independent party. History note that person and organization are direct subclasses of independent party |
| https://raw.githubusercontent.com/edmcouncil/fibo/master/BE/LegalEntities/LegalPersons.rdf | Legal person is any natural person or organization capable of accruing liability. Legal person is a subclass of independent party. Business entity, SPV, statutory body, legally competent natural person, power of attorney |

The FIBO Viewer HTML pages rendered no class text. RDF files are the first-party definitions used here. OWL was not imported.

## OntoUML and UFO, fetched this session

| URL | What was taken |
| --- | --- |
| https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf | Kind, Role, Phase, Relator, Category, RoleMixin. Person versus Student or Husband. Employment as a relator that can itself have phases and roles. Legal Entity as a Category that spans people, organizations, contracts, and legislation |

Search snippets from related NEMO PDFs were used only to confirm the same Kind, Role, Phase, Relator cut. The 2018 paper is the cited source.

## Not fetched, on purpose

SAP and Dynamics party docs, ISO 17442 LEI text beyond FIBO's mention, Odoo `res_partner.py` source, and ERPNext Python were not used as evidence. A GitHub `res_partner.py` hit appeared in search. It is LGPL source. This folder does not quote it.

## Licensing note

Conceptual and behavioral extraction only. No source implementation was copied into OS.
