---
issue: 3
decision_state: hypothesis
kind: reference
---

# Concept matrix

Reference table for issue 3. A check means the source makes the distinction. A dash means the source was silent in the documents read. "schema" means the product implements a nearby idea that is not the same distinction.

| Distinction | UFO and OntoUML | Palantir | ERPNext | Odoo | ValueFlows and REA | FIBO |
| --- | --- | --- | --- | --- | --- | --- |
| Identity principle supplied by a Kind | yes. Kind is rigid and unique per individual | schema. primary key is unique per object type, not a modal Kind | schema. DocType name is the identity of the record | schema. `res.partner` id is the record key | yes for Agent. Person, Organization, Ecological Agent | yes for LegalEntity. `hasIdentity exactly 1` on some role classes |
| Role distinct from Kind | yes. anti-rigid, relational, in scope of a relator | no native Role. Interface is shared shape | no. Customer and Supplier are separate masters | partial. one partner, ranks as search weights | yes. AgentRelationshipRole on AgentRelationship | yes. ContractParty and AgentInRole versus IndependentParty |
| Phase distinct from Role | yes. anti-rigid, intrinsic | no | schema. Disabled, On Hold, docstatus | schema. `active`, document `state` | no Phase type. Knowledge, Plan, Observation are layers | Situation and period patterns appear in discussions |
| Relator, or a relationship with identity | yes. existentially dependent truthmaker | yes. object-backed link, example Flight Manifest | partial. Party Link, plus attributes piled on Supplier | partial. contract and membership apps. partner merge treats records as identities | yes. AgentRelationship and Agreement have `@id` | yes. Contract has parties, duration, jurisdiction |
| Link without its own lifecycle | formal relation versus material relation | foreign-key link and join-table link | Dynamic Link from Address and Contact to a party | Many2one without a through model | relationship property only, still reified as AgentRelationship | ordinary object properties |
| Interface, or shared shape | Category, Mixin, RoleMixin | yes. Interface constrains properties, links, actions. no shared primary key | not as a type system. Party Type is an accounting register | mixin models in code, not a business category | classification property on Agent | multiple classification used in some party-in-role cases |
| Event or perdurant, distinct from object | yes. UFO-B. events do not change | Action is kinetic. Event is not a first-class ontology sort in the pages read | document submit creates ledger rows. cancellation is a later document | account.move is a posted artifact | yes. EconomicEvent is observed past flow | Occurrence ontologies exist. not mined in depth here |
| Value versus identifiable object | quality versus substantial or relator | property versus object type | Address and Contact are DocTypes. currency is a field | partner fields and child contacts. money on moves | EconomicResource is identifiable. quantities sit on flows | quantities and monetary amounts as values |
| Same party, many commercial roles | Role plus Relator | modeler choice. overlapping interface keys are a known hazard | two masters plus Party Link | one `res.partner`, both ranks can be positive | one Agent, many AgentRelationships | IndependentParty playing many ContractParty roles |
| Merge, split, or re-identify | Kind change ends the individual. constitution is a different relation | primary key change drops edits. keys must be deterministic | Party Link is not a merge. duplicate names get a suffix | irreversible contact merge to a destination record | not specified in the pages read | LEI and legal succession are in scope. not mined here |

## Notes on cells that look like agreement and are not

**Palantir primary key versus UFO Kind.** Palantir requires a unique, deterministic property per object type. Edits bind to that value. That is a storage and write-back rule. UFO Kind says what changes an individual can survive. A Palantir `Employee` keyed by employee ID can be implemented while the real Kind is still Person. The matrix marks this as schema, not yes.

**ERPNext Customer Type.** Company, Individual, and Partnership look like Kinds. They sit on the Customer master, which this research treats as a role record. The real Kind, if any, is the legal party that ERPNext never stores once.

**Odoo ranks.** `customer_rank` and `supplier_rank` increment with account moves and seed to 1 when the create context is `customer` or `supplier`. They are not role objects and not validity intervals. Forum posts treat rank greater than 0 as "is a customer" for search domains. That is a source artifact.

**ValueFlows AgentRelationship.** Every role pair in the published example is already a reified relationship with an `@id`. ValueFlows does not offer a thin link type in the pages read. The matrix still marks "link without lifecycle" as relationship-only because the role is a property of that reified object, not a second identity for the Agent.
