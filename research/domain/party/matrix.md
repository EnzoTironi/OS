---
issue: 14
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Convergence matrix

Reference table for issue 14. A check means the source makes the distinction in pages fetched this session. A dash means the source was silent in those pages. "schema" means the product implements a nearby idea that is not the same distinction.

This is not a feature comparison. It is evidence of semantic convergence or divergence.

## Distinctions

| Distinction | ERPNext / Frappe HR | Odoo 18 | Moqui Mantle | REA 1982 / ValueFlows | FIBO | OntoUML 2018 |
| --- | --- | --- | --- | --- | --- | --- |
| Enduring party behind commercial labels | schema. Party Link plus two masters | yes. one `res.partner` | yes. Party | yes. Agent | yes. IndependentParty | yes. Kind Person or Organization |
| Person versus Organization | Customer Type on the Customer master. Employee is a person | Individual versus Company on the partner | Person and Organization share `partyId` | Person and Organization subclasses of Agent | Person and Organization subclasses of IndependentParty | Kind examples. Person is rigid |
| Legal personhood as liability capacity | Company is the books entity. Customer Type is not liability | Company has legal identity. Tax ID and LEI on contact | dash | dash in pages read | yes. LegalPerson can accrue liability | Legal Entity is a Category, not a Kind |
| Operating unit versus legal entity | Branch, cost center, warehouse stay inside one Company | Branch under parent. Subsidiary must be another Company | Organization hierarchy via PartyRelationship | Organization may be informal if it has agency | Business entity, SPV, statutory body | Employment and enrollment are relators, not units |
| Customer as role, not kind | no. Customer is a master. Link admits the same party | partial. one partner, sales defaults on the same row | yes. bill-to customer RoleType | yes. role label on AgentRelationship | yes. party in role plus role identifier | yes. Role is anti-rigid and relational |
| Supplier as role, not kind | no. Supplier is a master | partial. purchase defaults on the same partner | yes. ship-from vendor RoleType | yes. inverse of customer-style role | yes. PartyInRole pattern | yes |
| Employee as role founded by employment | schema. Employee master holds dates and exit | schema. Employee file plus Contracts app | yes. employee RoleType plus PartyRelationship | dash | power of attorney and employment mentioned in LegalPersons history | yes. Employment relator with phases |
| Carrier, competitor, affiliate | Transporter flag on Supplier | dash | carrier, affiliate, spouse RoleTypes | AgentRelationshipRole is open | party role identifier is generic | Role is generic |
| Contact person as its own object | yes. Contact DocType, many links | schema. child partner typed Contact | CommunicationEventParty and contact roles | dash | dash | RoleMixin Customer can span kinds |
| Address as citeable location | yes. Address DocType. GSTIN on Address | schema. child partner is the address | yes. immutable ContactMech plus PostalAddress | SpatialThing. primary location | mailing address on IndependentParty | quality versus substantial left open |
| Tax registration as jurisdictional identity | Tax ID on Supplier. GSTIN on Address | Tax ID, VIES, LEI, Company ID | PartyIdentification | dash | TaxIdentifier plus TaxIdentificationScheme | dash |
| Relationship with lifecycle | Party Link. Supplier hold. Employee status | Archive. Contracts. Merge | PartyRelationship from and thru. Agreement addendum | AgentRelationship is ongoing | commencement notes in ontology history | Relator has identity, phases, roles |
| Merge of duplicate records | suffix on duplicate names. Party Link is not merge | irreversible merge to a destination | PartyIdentification for correlation | dash | role identifier versus tax identifier | Kind change ends the individual |
| Login or user is not the party | Contact Invite as User. Employee Create User | `res.users` versus `res.partner` | UserAccount.partyId | dash | dash | dash |
| Software or AI as economic party | dash | dash | dash | EcologicalAgent only. Software not in spec pages | Autonomous agent versus independent party | dash |

## Source artifacts mapped to domain concepts

This table is the required mapping. Left column is a source artifact. Right column is a domain concept, not a target table.

| Source artifact | Domain concept | Must not import |
| --- | --- | --- |
| ERPNext Customer DocType | A customer relationship plus billing defaults, stored as if it were the party | DocType, naming series, Customer Group |
| ERPNext Supplier DocType | A supply relationship plus payable and hold defaults | Scorecard, Is Frozen, Creditors account name |
| ERPNext Party Link | Recognition that two role records name one party, used only to offset books | Automatic Journal Entry switch |
| ERPNext Contact | A person in a communication role, citeable from many parties | Dynamic Link child table |
| ERPNext Address | A location that can carry a jurisdictional registration | Address Template, Is Your Company Address |
| ERPNext Company | A legal entity that keeps books | Abbreviation baked into warehouses |
| ERPNext Internal Customer or Supplier | Intercompany counterparty role of a legal entity you also operate | Inter-company invoice pairing |
| Frappe HR Employee | A person plus one employment in one company, collapsed | Create User Automatically |
| Odoo `res.partner` | Enduring party, and also a child address row | `is_company`, ranks, commercial fields |
| Odoo `res.users` | Login principal | Portal versus internal |
| Odoo child address types | Role of a location or person relative to a parent party | Invoice, Delivery, Follow-up enums |
| Odoo merge | Duplicate-record collapse | Destination equals oldest |
| Odoo Company versus Branch | Legal entity versus operating subdivision | Multi-company selector |
| Odoo Tax ID and VIES | Jurisdictional identifier plus an observation of validity | Intra-Community Valid checkbox |
| Odoo `hr.employee` | Personnel file. Not the commercial partner | Presence-by-email setting |
| Moqui Party, Person, Organization | Enduring party with exactly one of two natures | Shared `partyId` trick |
| Moqui RoleType, PartyRole | Classification of how a party relates. PartyRole is optional | FK-to-RoleType-not-PartyRole |
| Moqui PartyRelationship | Identifiable relationship with validity and status | Enumeration `PartyRelationshipType` |
| Moqui ContactMech | Immutable contact means. Validity on the association | TrustLevel enums |
| Moqui Agreement | Dated two-party instrument with items and addenda | AgreementItem types |
| Moqui PartyIdentification | Typed external identifier with expiry | `partyIdTypeEnumId` |
| VF Agent | Party that can commit or perform | EcologicalAgent unless a later issue needs it |
| VF AgentRelationship and Role | Commercial or social role founded by a relationship | JSON-LD examples, hREA |
| REA Agent | Participant in economic events | 1982 E-R diagram layout |
| FIBO IndependentParty | Enduring party that can be a person or organization | Commons IRIs |
| FIBO LegalPerson | Liability capacity in a jurisdiction | LEI eligibility list in comments |
| FIBO Party role identifier | Identifier of a party-in-role, not of the party | Identification scheme classes |
| FIBO TaxIdentifier | Jurisdictional taxpayer identity | CRS commentary |
| OntoUML Kind | Rigid identity principle | `«kind»` stereotype |
| OntoUML Role | Anti-rigid relational classification | RoleMixin machinery |
| OntoUML Relator | Relationship individual with its own career | `«relatorKind»` |
| OntoUML Category Legal Entity | Shared properties across different kinds | Non-sortal plugin rules |

## Convergence

Independent sources agree on these cuts.

1. An enduring party continues when a commercial label starts or stops. Moqui, ValueFlows, FIBO, OntoUML, and Odoo's single partner. ERPNext admits the same fact with Party Link. E3, E8, E13, E15, E16, E18, E20.
2. Person and Organization are different natures of that party. All six families. E1, E8, E13, E15, E18, E20.
3. Legal books and operating sites are not the same cut. ERPNext Company versus branch. Odoo Company versus Branch versus subsidiary. E6, E10.
4. Customer and supplier behavior can attach to one party at once. S-005, Party Link, Odoo one partner, VF inverse roles, Moqui many RoleTypes. E3, E8, E13, E16, E21.
5. A contact person is not the billed party. ERPNext Contact. Odoo child Contact. Moqui communication parties. E4, E8, E13.
6. A location can carry tax identity that the party-as-a-whole does not uniquely determine. ERPNext GSTIN on Address. Odoo VAT on a contact that may be a child. FIBO tax identifier in a scheme. E5, E11, E18.
7. Login is not the party. ERPNext User invitation. Odoo `res.users`. Moqui UserAccount.partyId. E4, E7, E8, E12, E13.
8. Employment has a lifecycle that outlives a boolean worksFor. Frappe HR exit. Odoo Contracts. Moqui PartyRelationship dates. OntoUML Employment relator. E7, E12, E13, E20.

## Divergence

| Topic | Disagreement | Why it might exist |
| --- | --- | --- |
| Is Customer a stored kind | ERPNext yes. Everyone else no or only as a role | Module defaults and credit control were cheaper on a dedicated master |
| Is an address a partner | Odoo yes. ERPNext and Moqui no | Odoo reuses one model for company, person, and site |
| May a contact mechanism change in place | ERPNext yes for minor edits. Moqui never | History versus user convenience |
| Where tax id lives | Supplier field, Address GSTIN, partner VAT, FIBO scheme | Jurisdiction rules differ. India is location-bound. EU VAT is often party-bound |
| Is Employee the person or the employment | Frappe HR and Odoo file collapse them. Moqui and OntoUML separate role and relator | HR screens want one form |
| What Legal Entity classifies | FIBO liability capacity of person or org. OntoUML Category that can include contracts and legislation | Finance ontology versus foundational ontology |
| Informal groups as parties | ValueFlows yes if the group has agency. FIBO legal person needs liability. ERPNext Company needs books | Economic agency versus legal capacity |
| Ecological or non-human agents | ValueFlows yes. Others silent or legal-person only | Climate accounting versus commercial ERP |
| Merge operator | Odoo irreversible collapse. ERPNext refuses to merge Customer and Supplier. UFO Kind change ends the individual | Dedup UX versus legal identity |

## Notes on cells that look like agreement and are not

**ERPNext Customer Type.** Company, Individual, and Partnership look like Kinds. They sit on the Customer master, which this research treats as a role record. The legal party is not stored once.

**Odoo partner as address.** Official docs say a partner can be a contact address. That is a source artifact. It does not make a warehouse dock a LegalPerson.

**Moqui PartyRole optional.** Documents that point at Party and RoleType can name a role that was never registered on the party. "Is a supplier" in Moqui is not always a stored membership row.

**FIBO Legal Entity versus OntoUML Legal Entity.** Same English words. FIBO means liability capacity. OntoUML's example Category also lists contracts and legislation. Do not collapse them.

**ValueFlows Organization.** Informal groups with agency count. That is broader than ERPNext Company and broader than FIBO LegalPerson.
