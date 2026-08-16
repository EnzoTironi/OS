---
issue: 3
parent: 2
decision_state: hypothesis
contract: docs/swarm-research-backlog.md Agent output contract
---

# Issue 3 result

**Question.** What ontological categories should OS use for entities that persist, for roles, for phases, for relationship-entities, for events, and for values that should not have object identity?

**Decision state.** `hypothesis`. Independent sources converge on a few distinctions. They do not converge on native engine categories for Role, Relator, or Phase. RFC-0001 is left unchanged.

## Sources

Fetched 2026-08-15. No source implementation was copied.

1. Guizzardi, Almeida, Guarino, and Carvalho, "UFO: Unified Foundational Ontology," *Applied Ontology* 17 (2022). PDF at [nemo.inf.ufes.br](https://nemo.inf.ufes.br/wp-content/uploads/ufo_unified_foundational_ontology_2021.pdf). DOI [10.3233/ao-210256](https://doi.org/10.3233/ao-210256).
2. Guizzardi, Fonseca, Almeida, Sales, Benevides, and Porello, "Endurant Types in Ontology-Driven Conceptual Modeling: Towards OntoUML 2.0," 2018. [PDF](https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/endurant_types_in_ontology_driven_conceptual_modeling__towards_ontouml_2_0_2018.pdf).
3. Palantir, [Ontology overview](https://palantir.com/docs/foundry/ontology/overview/), [Create an object type](https://palantir.com/docs/foundry/object-link-types/create-object-type/), [Create a link type](https://palantir.com/docs/foundry/object-link-types/create-link-type/), [Edit an interface definition](https://palantir.com/docs/foundry/interfaces/edit-interface-definition/). Palantir Developer Community thread [Modeling Recipes: How to use Interfaces](https://community.palantir.com/t/modeling-recipes-how-to-use-interfaces-to-abstract-material-types/2484).
4. ERPNext docs, [Customer](https://docs.frappe.io/erpnext/customer) (updated 2026-07-23), [Supplier](https://docs.frappe.io/erpnext/supplier) (updated 2026-07-02), [Common Party Accounting](https://docs.frappe.io/erpnext/common_party_accounting) (updated 2026-08-03). ERPNext [PR 27039](https://github.com/frappe/erpnext/pull/27039) (Party Link). ERPNext [PR 49079](https://github.com/frappe/erpnext/pull/49079) (Employee as receivable and payable).
5. Odoo 18 `addons/account/models/partner.py` (`customer_rank`, `supplier_rank`). Odoo `addons/hr/models/hr_employee.py` (`work_contact_id`). Odoo [Merge contacts](https://www.odoo.com/documentation/master/applications/essentials/contacts/merge.html). Odoo forum [How to Separate Customers and Vendors](https://www.odoo.com/forum/help-1/how-to-separate-customers-and-vendors-contacts-in-odoo-16-3-231521). Odoo commit [ea96e51](https://github.com/odoo/odoo/commit/ea96e51e9ee08dc880aba6691fa7537a2ade49e8).
6. ValueFlows, [Core concepts](https://www.valueflo.ws/introduction/core/), [Agents](https://www.valueflo.ws/concepts/agents/), [Flows](https://www.valueflo.ws/concepts/flows/), [vfspec](https://www.valueflo.ws/specification/vfspec/), [Agent examples](https://www.valueflo.ws/examples/ex-agent/).
7. FIBO, [FIBOFTF-30](https://issues.omg.org/issues/FIBOFTF-30) (IndependentParty versus ContractuallyCapableEntity). FIBO [Contracts ontology](https://spec.edmcouncil.org/fibo/ontology/FND/Agreements/Contracts/) via archived LODE. FIBO discussion [Party in role vs Functional Entity](https://github.com/edmcouncil/fibo/discussions/1825). FIBO [LEI Entities](https://spec.edmcouncil.org/fibo/ontology/BE/LegalEntities/LEIEntities/) (`hasIdentity exactly 1 LegalEntity` on ContractuallyCapableEntity).
8. OS docs in this worktree. `docs/thesis.md`, `docs/constitution.md`, `docs/open-questions.md` questions 2 and 12, `docs/research-program.md`, `rfcs/0001-metamodel-hypothesis.md`, `scenarios/README.md` S-005 and S-006, `research/reference-landscape.md`.

## Required investigations

### Is Supplier a kind, a role, an interface, or relation-dependent state?

**Domain evidence.** One legal organization can buy, sell, carry, own shares, and compete at the same time. Scenario S-005 already names this. The organization does not become a different thing when a purchase order is opened.

**Source artifact.** ERPNext stores Customer and Supplier as separate masters because "sales, purchase, pricing, tax, credit, and portal behavior differs." The same real party then needs a Party Link so accounting can offset the two ledgers. The docs say the link does not merge the masters. Odoo stores one `res.partner` and uses `customer_rank` and `supplier_rank` as integers that start at 0 and rise when accounting moves appear. Those ranks live in the account module, not in the base partner model. ValueFlows treats "is supplier of" as an `AgentRelationshipRole` on an `AgentRelationship` that already has its own `@id`. UFO classifies Employee and similar types as roles "in the scope of" a relator. FIBO splits IndependentParty from ContractParty. ContractParty is a party in a role.

**Candidate law.** Supplier is a role of a Person or Organization, founded by a commercial relationship that itself may need identity. See L1 and L2 in `candidate-laws.md`.

**Decision state.** `supported` for "not a Kind." `hypothesis` for "Role founded by a Relator-like object, not a Palantir Interface."

### When does a relationship deserve identity and a lifecycle?

**Domain evidence.** Employment can be promoted, suspended, and terminated while the person and the organization stay the same. Scenario S-006. A supply relationship can carry contracts, credit limits, validity periods, holds, and scorecards. ERPNext Supplier already has hold type, release date, payment terms, and scorecard hooks on the Supplier master. Those properties describe the relationship more than the legal person.

**Source artifact.** Palantir adds object-backed links when the connection needs its own properties. The documented example is a Flight Manifest between Aircraft and Flight, with Pilot and First Mate on the manifest. UFO calls the truthmaker a relator and gives examples that include marriages, enrollments, employments, and contracts. ValueFlows gives both `AgentRelationship` and `Agreement` their own identifiers. `Agreement` stipulates `Commitment`s. Odoo merge docs treat contact merge as irreversible, which is what you do when two records were pretending to be two identities.

**Candidate law.** A typed link is enough when the relation has no attributes, no actions, and no independent validity. Once the relation is the target of actions or the bearer of limits, it needs identity. See L3.

**Decision state.** `supported` for the threshold. `undetermined` for whether the engine must name that object a Relator.

### Can Interface subsume Role without losing semantics?

**Source artifact.** Palantir says an interface "describes the shape of an object type and its capabilities." It can constrain properties, link types, and action types. It does not give implementers one identity principle. A community modeling note states the point directly. Interfaces do not prescribe a primary key. A Car may key on a VIN. A Boat may key on a registration string. The same string can be the primary key of a Contractor and of a Customer.

**Domain evidence.** UFO Role is anti-rigid and relational. John can stop being a Student and remain John. A Palantir Interface is a shared shape. Implementing `Priceable` does not mean the object is only contingently priceable, and it does not say which other object founds that classification.

**Candidate law.** Interface can share capabilities. It cannot carry Role without losing anti-rigidity, relational dependence, and a single identity principle. See L4.

**Decision state.** `supported` for "Interface is not Role." `hypothesis` for how OS should compose Role from smaller pieces.

### Are phases types, states, or derived predicates?

**Domain evidence.** UFO Phase is anti-rigid and intrinsic. Child and Adult are phases of Person. Tenured employment is a phase of Employment. The individual keeps its identity while the phase changes.

**Source artifact.** ERPNext Customer uses Enabled, Disabled, and Internal Customer as availability flags on a master. Supplier uses On Hold with a hold type and an optional release date. Document workflows use Draft, Submitted, and Cancelled. Those are document control states, not intrinsic phases of a Person. Palantir has no Phase category. Odoo uses `state` fields on documents and `active` on partners.

**Candidate law.** Keep three different things apart. A UFO Phase is a contingent intrinsic classification of an endurant. A document status is often a stored decision or a projection of events. A hold or suspension of a relationship is often a phase of the relator, not of the person. See L5.

**Decision state.** `hypothesis`. The split is clear. The storage form is not.

### What are value objects versus identifiable objects?

**Domain evidence.** UFO qualities are particularized properties that project into a quality space. Two people can have the same height value. The height-as-value is not an object with a lifecycle. Endurants can change. Perdurants cannot.

**Source artifact.** Palantir properties are not objects. Every object type needs a primary key. ERPNext Address and Contact are independent records with their own identity, linked to Customer or Supplier. That is convenient for reuse. It also means an address change can surprise every document that fetched the primary address. The Customer doc warns users to review primary flags for that reason.

**Candidate law.** Give object identity only when the thing can change while remaining the same, or when other things must point at it across time. Money amounts, quantities with units, and date intervals are values. A shared mailing location that many parties reuse may still earn identity. See L6.

**Decision state.** `hypothesis`. Address is the live disagreement.

### Merge, split, and re-identification

**Source artifact.** Palantir attaches edits to the primary key. Change the key and the product prompts you to delete existing edits. Non-deterministic keys lose edits and drop links. Duplicate keys fail Object Storage v2 builds. Odoo merge is irreversible and picks a destination contact, defaulting to the oldest record. Dedup can search on email, name, VAT, and parent company. ERPNext Party Link refuses to merge Customer and Supplier. Two customers with the same name get a suffix when naming-by-name is on. UFO says a Kind supplies the identity principle. An individual has exactly one Kind. Changing Kind is ceasing to exist.

**Domain evidence.** Legal merger, spin-off, and mistaken duplicate records are different operations. Collapsing them into one "merge records" button loses the reason.

**Candidate law.** Record merge, legal succession, and identifier correction are three actions. See L7.

**Decision state.** `hypothesis`.

## Convergence

Independent sources agree on these distinctions.

1. The legal or economic agent is not the same category as the commercial role. ValueFlows Agent versus AgentRelationshipRole. FIBO IndependentParty versus ContractParty. UFO Kind versus Role. Odoo one partner with ranks. ERPNext is the outlier that splits masters, then adds Party Link to recover the missed identity.
2. Some relationships need their own identity. UFO Relator. Palantir object-backed link. ValueFlows AgentRelationship and Agreement. ERPNext Party Link, Employment-like HR records, and Supplier holds. RFC-0001 already suspected this.
3. Attempted or promised flow is not observed flow. ValueFlows Intent, Commitment, EconomicEvent. OS thesis Action versus Event. UFO endurant versus perdurant.
4. Shared shape is not shared identity. Palantir Interface. UFO Category or Mixin. OS RFC Interface.

## Divergence

1. ERPNext makes Customer and Supplier kinds-in-the-schema. Odoo and ValueFlows do not. The ERPNext docs explain the split as differing module behavior, not as a claim that two legal persons exist. That is a source artifact.
2. Palantir identity is a per-type primary key over a backing dataset. UFO identity is a modal principle supplied by a Kind. Those can be implemented together. They are not the same idea. A Palantir Employee object keyed by employee ID is closer to a role record than to a Person Kind.
3. Palantir one-to-one cardinality "is not enforced." UFO cardinality and existential dependence are meant to be real. Constitution rule 1 says a category must earn enforcement.
4. Address is a value in many conceptual models and an identifiable DocType in ERPNext.
5. FIBO uses both party-in-role and functional-entity classification on the same individual. UFO forbids an individual from having two Kinds. FIBO's double classification is a research question, not a license to copy it.

## Recommendation

Role, Relator, and Phase should not become native engine categories in Wave A.

Compose them from smaller pieces that RFC-0001 already names.

- ObjectType with one identity principle and a rigidity flag covers Kind and Subkind.
- Interface covers shared shape and shared actions. It does not cover Role.
- A Role is an anti-rigid classification of an existing object, founded by a mediating object, with a validity interval.
- A Relator is an ordinary identifiable object that mediates two or more participants, carries the attributes and actions of the relationship, and makes the material relation true only while it exists. The engine needs mediation and dependence constraints. It does not yet need a separate storage sort.
- A Phase is either a derived predicate over intrinsic facts or an exclusive partition on one object. Document Draft and Submitted are not Phases of a Person.
- Event stays distinct from Action. That claim is already in the thesis. This issue did not weaken it.
- Value types are properties with equality by value. Promote one to an object only when reuse or change-over-time forces identity.

What would promote Role, Relator, or Phase to a native category is simple. Find a domain where composition cannot enforce the constraint without a hidden convention, and where that failure shows up in more than one corpus. Palantir's unenforced one-to-one cardinality is a warning, not yet that proof.

## Runtime pressure

If the composed model survives, the runtime must still do four things.

1. Refuse two Kinds for one individual.
2. Keep Role membership out of the object's identity key.
3. Address a relationship-object as the target of actions such as Suspend and Terminate.
4. Treat merge, legal succession, and identifier correction as different actions, each with provenance.

If those four cannot be enforced by constraints on ordinary objects, revisit native Relator or native Role.

## Open questions

These stay open. This issue does not invent answers for `docs/open-questions.md`.

- Open question 2. Smallest semantic core. Role and Phase as patterns versus native categories. `hypothesis` above. Not accepted.
- Open question 12. Relator as engine category versus modeling convention. `undetermined` for the engine. `supported` for "some relationships need identity."
- Whether Address is a value or an object. `undetermined`.
- How cross-source identity keys relate to UFO identity principles. `undetermined`. Belongs with issues that own ingestion and entity resolution.
- Whether Event is a base type or `Type implements Event`. Out of scope beyond the endurant and perdurant split. `undetermined`.

## Cross-links

- `docs/open-questions.md` questions 2 and 12
- `rfcs/0001-metamodel-hypothesis.md` Type, Interface, Relationship, Identity
- `scenarios/README.md` S-005, S-006
- `research/reference-landscape.md` Palantir, ERPNext, Odoo, ValueFlows, OntoUML
- Issue 11 (query, object sets, interfaces) and issue 13 (value types) should consume L4 and L6 rather than re-derive them
- Issue 37 (formal ontology corpus) and issue 35 (Palantir corpus) own deeper archaeology. This file used public docs only and did not wait for those PRs.
