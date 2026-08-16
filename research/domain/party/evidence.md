---
issue: 14
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Evidence

Labeled blocks for issue 14. Each block names its kind. Inference is marked. Source names stay in the source's vocabulary.

## E1. ERPNext Customer is a billed-party master

**Kind.** Domain evidence plus source-system artifact.

ERPNext docs say a Customer is a person, business, or other organization that buys goods or services. Create a separate Customer for each independently billed party. Store people and locations as linked Contacts and Addresses. Customer Type distinguishes Company, Individual, and Partnership. Disabled keeps history and blocks new use. Internal Customer represents one of your companies. Credit limits and receivable accounts are per company on the same Customer. Changing defaults does not rewrite submitted documents.

**Source artifact.** Customer DocType, Customer Group, Territory, naming series, Dynamic Link.

**Fetched.** https://docs.frappe.io/erpnext/customer

## E2. ERPNext Supplier is a second master for the same real party

**Kind.** Domain evidence plus source-system artifact.

Supplier docs treat suppliers as companies or individuals who provide products or services. Tax ID, Tax Category, Tax Withholding Category, GST Category, PAN, transporter flag, Internal Supplier, hold types, freeze, and company-wise payable accounts live on this master. Hold can block invoices, payments, or both, with an optional release date. Contacts and Addresses are stored separately so one Supplier can have many of each.

**Source artifact.** Supplier DocType, scorecard holds, Is Frozen, default Creditors account.

**Fetched.** https://docs.frappe.io/erpnext/supplier

## E3. Party Link does not merge Customer and Supplier

**Kind.** Domain evidence. Strong.

Common Party Accounting exists because the same real-world organization can be both Customer and Supplier. ERPNext keeps the two masters because sales, purchase, pricing, tax, credit, and portal behavior differ. A Party Link tells accounting that the two records represent the same business party for offset. The FAQ states Party Link does not merge the masters. The site-wide setting automates a Journal Entry. It is not a general identity operator.

**Counterexample pressure.** Scenario S-005. Two masters plus a link is a product workaround, not a proof that Customer is a Kind.

**Fetched.** https://docs.frappe.io/erpnext/common-party-accounting

## E4. ERPNext Contact is a person that can represent many parties

**Kind.** Domain evidence.

A Contact represents a person you communicate with. The same person can be linked to more than one Customer, Supplier, Lead, shareholder, Sales Partner, or user. Docs say keep the person as one Contact and use links for business relationships. Invite as User is a separate security action. Changing the primary Contact does not rewrite submitted documents. A Contact can exist with no party yet.

**Source artifact.** Dynamic Link child table. Contact status Passive, Open, Replied.

**Fetched.** https://docs.frappe.io/erpnext/contact

## E5. ERPNext Address is a location, and GSTIN can sit on it

**Kind.** Domain evidence.

An Address stores a physical or mailing location and can be linked to Customer, Supplier, Lead, Warehouse, or Company. One party can have several billing, shipping, office, and branch addresses. Docs warn not to create duplicate Customers or Suppliers for each site. For India GST, store GSTIN and GST State on the Address, not only on the Customer or Supplier, because one party can have registrations in several states. Do not link unrelated Customers merely because they share a building. For a material location change, create a new Address and disable the old one. Submitted documents keep the address text they used.

**Source artifact.** Address Template. Is Your Company Address. Dynamic Link.

**Fetched.** https://docs.frappe.io/erpnext/address and https://docs.frappe.io/erpnext/gst-for-multiple-branches

## E6. ERPNext Company is a books-keeping legal entity

**Kind.** Domain evidence.

A Company represents a legal entity whose transactions, accounts, taxes, stock valuation, and financial statements must be kept together. Create separate Companies when entities maintain separate books or statutory registrations. Use branches, cost centers, accounting dimensions, or warehouses when the operation belongs to the same legal entity. Is Group marks an organizational parent that does not post normal transactions. Inter-company sales still record in each legal entity.

**Source artifact.** Company abbreviation baked into accounts, cost centers, and warehouses.

**Fetched.** https://docs.frappe.io/erpnext/company-setup

## E7. Frappe HR Employee is a person-under-contract master

**Kind.** Domain evidence plus source-system artifact.

Frappe HR defines Employee as an individual who works part-time or full-time under a contract of employment and has recognized rights and duties of your company. The master holds joining, confirmation, contract end, department, grade, designation, branch, reports-to, contact details, and exit. When status is Left, Relieving Date is mandatory and the master is no longer available in later transactions. User creation is optional and permission-scoped.

**Inference.** Employment dates and exit live on the person-as-employee record, not on a first-class Employment relator in the pages read.

**Fetched.** https://docs.frappe.io/hr/employee

## E8. Odoo partner is one physical or legal entity, and also an address row

**Kind.** Domain evidence plus source-system artifact.

Official Odoo 18 tutorial wording. A `res.partner` is a physical or legal entity. It can be a company, an individual, or even a contact address. `res.users` are internal or portal logins. Contacts docs add Individual versus Company, a parent Company Name on individuals, and child rows typed Contact, Invoice Address, Delivery Address, Follow-up Address, or Other Address. Tax ID, Citizen Identification, LEI, and a Company restriction for multi-company sit on the same form. Archive hides the contact from the main list.

**Source artifact.** Child partner rows as addresses. Sales and Purchase tabs on the same record. Ranks are not in these official pages. Treat customer_rank from sibling corpus notes as unread here.

**Fetched.** https://www.odoo.com/documentation/18.0/developer/tutorials/server_framework_101/07_relations.html and https://www.odoo.com/documentation/18.0/applications/essentials/contacts.html

## E9. Odoo merge is irreversible record collapse

**Kind.** Domain evidence about identity operations.

Merge is documented as irreversible. The destination defaults to the contact created first. Dedup search keys are Email, Name, Is Company, VAT, and Parent Company. Exclusion keys include a user on the contact and journal items. The stated purpose is to stop two salespeople contacting the same party.

**This is not legal succession.** The page does not describe split, novation, or a surviving legal entity after merger.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/essentials/contacts/merge.html

## E10. Odoo company is legal. Branch is operating. Subsidiary is another company

**Kind.** Domain evidence.

A company is an individual business entity that operates independently, with its own legal identity, financial records, and settings. Branches represent subdivisions such as regional offices or departments under a common parent. Independent subsidiaries should be created as additional companies, not branches. A company defined as a parent cannot be converted into a branch later. Shared records such as products or contacts can be restricted by a Company field. Accounting settings inherit from the parent. Other configuration is per branch.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/general/companies.html

## E11. Odoo VAT is a checked identifier, not the partner

**Kind.** Domain evidence.

Odoo always checks VAT format against the country. Optional VIES sets Intra-Community Valid when the contact country differs from the company country. Manual override is allowed and logged, because a new company may be missing from VIES. Fiscal positions that require VAT then require an intra-community valid number.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/finance/accounting/taxes/vat_verification.html

## E12. Odoo Employee is a personnel file, not the login and not the commercial partner

**Kind.** Domain evidence plus source-system artifact.

Employees docs say the app centralizes personnel files, employment contracts, and departmental hierarchies. New-employee docs say the record stores general information, job history, work information, personal details, and payroll-related information. Company, Department, Job Position, Manager, and Coach are required or strongly used. Work Address defaults to the current company. Contracts are a separate feature. Offboarding is a separate guide. Presence can be derived from attendance, login, email volume, or IP.

**Inference.** The enduring person, the employment contract, the login, and the commercial partner are four records in this product. The pages do not say they share one identity key.

**Fetched.** https://www.odoo.com/documentation/18.0/applications/hr/employees.html and https://www.odoo.com/documentation/18.0/applications/hr/employees/new_employee.html

## E13. Moqui Party is Person or Organization. Roles are how the party relates

**Kind.** Domain evidence.

Mantle docs. Party has the legal sense of a party to a lawsuit. Person and Organization share `partyId` with Party. Each party may have zero to many roles that define how it relates to orders, work efforts, agreements, and other parties. Examples include carrier, bill-to customer, ship-from vendor, employee, affiliate, and spouse. PartyRole is optional. Other entities point at Party and RoleType, not at PartyRole. PartyRelationship records membership, employment, hierarchy, contacts, and friends, with fromDate, thruDate, and status history. PartyIdentification holds driver license, employee number, and external ids. Agreement is typically between two parties in roles, with date range, items, terms, and addenda.

**Source artifact.** RoleType catalog. Enumeration `PartyRelationshipType`. Optional PartyRole.

**Fetched.** https://www.moqui.org/m/docs/mantle/Mantle+Structure+and+UDM/Party

## E14. Moqui ContactMech is immutable. Validity lives on the association

**Kind.** Domain evidence.

ContactMech is a means of contacting a party. PostalAddress and TelecomNumber share the key. Email uses `infoString`. PartyContactMech carries purpose and fromDate or thruDate. ContactMech records are immutable so a change does not rewrite other references. Update creates a new ContactMech, associates it, and expires the old PartyContactMech. Order, invoice, return, shipment, and work-effort contact joins do not have those dates. They just point at a ContactMech. Facility uses the same pattern.

**Source artifact.** `update#PartyContactOther` service. Trust levels New, Valid, Verified, Greylisted, Blacklisted.

**Fetched.** Same Moqui Party page, Contact Mechanism section.

## E15. ValueFlows Agent is Person, Organization, or EcologicalAgent

**Kind.** Domain evidence.

Normative spec. Agent is an identifiable entity that can commit to and perform economic or ecological activity under its own power or authority. Subclasses are Person, Organization, and EcologicalAgent. Organization is a functional structure, formal or informal, that has its own agency. A group is an Organization only if it has agency as the group. Person is a human being. All persons are agents. Provider and receiver on Intent, Commitment, EconomicEvent, and Claim are Agents.

**Source artifact.** EcologicalAgent. OM2 units. Recipe classes.

**Fetched.** https://www.valueflo.ws/specification/all_vf/

## E16. ValueFlows commercial role sits on AgentRelationship

**Kind.** Domain evidence.

`vf:AgentRelationship` is an ongoing voluntary association between two agents. `vf:AgentRelationshipRole` defines the kind of association and has a role label and an inverse role label. The relationship object has subject, relationship, and object.

**Inference.** Supplier and customer are role labels on a relationship, not Agent subclasses, in the pages that loaded.

**Fetched.** https://www.valueflo.ws/specification/vfspec/

## E17. REA 1982 agents are participants, not customer kinds

**Kind.** Domain evidence. Abstract only.

McCarthy 1982 abstract. The REA accounting model consists of sets representing economic resources, economic events, and economic agents plus relationships among those sets. The model is for a shared data environment used by accountants and non-accountants.

**Gap.** The full PDF timed out. Duality, commitments, and later ISO 15944-4 are not claimed from 1982.

**Fetched.** https://doi.org/10.2308/tar-4487748

## E18. FIBO independent party versus party in role

**Kind.** Domain evidence.

Parties ontology comment. The ontology extends Commons Parties and Situations with identifiers for party roles and very general tax identifiers. History notes make independent party a direct subclass of autonomous agent, and make person and organization direct subclasses of independent party. Party role identifier uniquely identifies a party based on a specific role in some context. Tax identifier is assigned to a taxpayer in a tax identification scheme. Has mailing address identifies a physical address where an independent party can receive communications.

**Source artifact.** FIBO IRIs. Commons Parties alignment. Property chains.

**Fetched.** https://raw.githubusercontent.com/edmcouncil/fibo/master/FND/Parties/Parties.rdf

## E19. FIBO legal person is liability capacity

**Kind.** Domain evidence.

Legal Persons ontology. A legal person is any natural person or organization which is capable of accruing liability on its own part. A later revision made legal person a subclass of independent party rather than autonomous agent. Business entity is formed and administered as per commercial law. Special purpose vehicle is a legal entity created for narrow, often temporary, objectives. Statutory body is established by a government. Legally competent natural person is competence under a jurisdiction. Power of attorney authorizes an agent to act for a principal.

**Inference.** Legal personhood is not the same cut as Organization. An organization can exist without being the liable legal person. A natural person can be a legal person.

**Fetched.** https://raw.githubusercontent.com/edmcouncil/fibo/master/BE/LegalEntities/LegalPersons.rdf

## E20. OntoUML Kind, Role, Phase, Relator, Category

**Kind.** Domain evidence.

Guizzardi et al. 2018. A rigid type classifies its instances necessarily. Anti-rigid types let instances move in and out without losing identity. Person versus Student or Husband is the running example. Kinds supply the identity principle. Roles are relationally dependent. Phases are intrinsically contingent. Relators are existentially dependent individuals that connect entities, typically composed of commitments and claims. Enrollment connects a Student role to an Educational Institution. The paper's motivating case is Employment as a Kind of relationship that can be in a Tenured Phase and can play the Role of Legal Grounds for a visa. Legal Entity is given as a Category, a rigid non-sortal that aggregates people, organizations, contracts, and legislation.

**Source artifact.** OntoUML stereotypes. TPTP axioms. Menthor models.

**Fetched.** NEMO PDF `endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf`

## E21. Scenario S-005 and S-006 already name the cuts

**Kind.** Domain evidence from this repo.

S-005 asks whether organization B is simultaneously a Supplier object and a Customer object, or an Organization with contextual roles, and where payment terms live. S-006 asks whether employment needs identity, lifecycle, and actions such as Promote, Suspend, and Terminate.

**Fetched.** `scenarios/README.md` on `origin/main`

## E22. Open questions 11 and 12 stay unanswered here

**Kind.** Runtime consequence for research hygiene.

Question 11 asks what actors and principals are. Question 12 asks when a relationship becomes an entity. This folder must not write answers into `docs/open-questions.md`. Cite this folder or mark those items `undetermined`.

**Fetched.** `docs/open-questions.md`

## E23. Sibling issue 3 owns Kind versus Role identity

**Kind.** Cross-link. Not this issue's finding.

`research/identity-kinds-roles/` on `cursor/issue-3-foundation-cfd8` already compares UFO, Palantir, ERPNext, Odoo, ValueFlows, and FIBO on identity. This folder must not copy those conclusions. Use that path when a later agent needs the metamodel cut.

## E24. Sibling issue 11 owns Party versus SoftwareAgent

**Kind.** Cross-link. Not this issue's finding.

`research/foundation/principals/` on `cursor/issue-11-foundation-cfd8` treats Party as the enduring economic or legal subject and refuses to make a SoftwareAgent a Party by default. This folder does not adopt that as proved. It only notes the path.

## E25. ERPNext Internal Customer and Internal Supplier are intercompany roles

**Kind.** Domain evidence.

Customer docs. Is Internal Customer identifies a Customer representing one of your companies. Supplier docs. Internal Supplier is a sister or parent or child company. Company docs still require inter-company invoices in each legal entity.

**Inference.** The operating group and the legal counterparty are different. Pointing a Customer at a Company is a product encoding of that split.

## E26. Odoo shared contacts versus company-restricted contacts

**Kind.** Domain evidence.

Companies docs. Some records, such as products or contacts, are shared by default across parent and branches. They can be restricted by setting Company. Quotations and invoices take the active company or branch.

**Runtime consequence.** A contact shared across books is not automatically a single legal party in every jurisdiction.

## E27. Moqui bill-to customer and ship-from vendor are role types, not kinds

**Kind.** Domain evidence.

The Party page lists bill-to customer and ship-from vendor among RoleType examples. That splits commercial function from the enduring Party and also splits bill-to from ship-from.

**Candidate implication.** Customer is not one role. Billing and receiving can be different parties in different roles.

## E28. Address edit versus new Address is already a documented fork

**Kind.** Domain evidence.

ERPNext Address FAQ. For a minor correction, edit. For a materially different location, create a new Address and disable the obsolete one. Moqui forbids in-place ContactMech edit. Odoo child address rows are themselves partners, so merge and archive apply to them.

**Decision state.** `undetermined` whether Address is a value, an object, or a contact mechanism. The sources disagree on mutation.
