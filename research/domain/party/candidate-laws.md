---
issue: 14
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate party laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`.

These are domain laws. They are not RFC-0001 edits. Issue 3 owns whether Role and Relator become engine categories.

## L1. A commercial label is not a Kind

**Claim.** Customer, Supplier, Carrier, Competitor, Affiliate, BillTo, ShipTo, Payer, and Payee do not supply identity. The same Person or Organization can enter and leave those classifications without becoming a different individual.

**Kind.** Candidate law.

**Evidence.** E3, E8, E13, E16, E18, E20, E21, E27. OntoUML Role versus Kind. ValueFlows role labels on AgentRelationship. FIBO independent party versus party in role. Moqui RoleType. Odoo one partner. Scenario S-005.

**Source artifact that looks like a counterexample.** ERPNext Customer and Supplier DocTypes. E1, E2. Party Link "does not merge the masters."

**Decision state.** `supported` for "not a Kind."

**Falsifier.** A corpus where Supplier identity is independent of any Person or Organization, and where destroying the organization leaves a Supplier that still refers to the same legal party.

**Runtime consequence.** The identity key of an organization must not be the Supplier code. Role membership must be able to start and stop. See EC01, EC10, EC15.

## L2. Legal person, operating unit, and brand are different cuts

**Claim.** Books, tax liability, and statutory registration attach to a LegalPerson. Day-to-day sites attach to an OperatingUnit. A public name can be a Brand. None of these three is interchangeable with Person or Organization.

**Kind.** Candidate law.

**Evidence.** E6, E10, E19, E25. ERPNext Company versus branch. Odoo Company versus Branch versus subsidiary. FIBO LegalPerson as liability capacity. FIBO SPV.

**Decision state.** `supported` for the three-way split. `hypothesis` for the names.

**Falsifier.** A jurisdiction or a mature ERP where a branch, a legal entity, and a brand share one identity without breaking tax, intercompany posting, or authority. EC06, EC07, EC09.

**Runtime consequence.** Intercompany actions name two LegalPersons. Inventory at a site names an OperatingUnit. Invoices name the LegalPerson that is liable.

## L3. A role is founded by a relationship

**Claim.** Instantiating Supplier is true because a commercial relationship exists, not because the object implements a shared shape. Employee is true because an Employment exists.

**Kind.** Candidate law.

**Evidence.** E13, E16, E20. UFO roles instantiate in the scope of a relator. ValueFlows AgentRelationshipRole sits on AgentRelationship. Moqui roles define how a party relates to orders, agreements, and other parties.

**Decision state.** `hypothesis`.

**Falsifier.** A mature operational system where Supplier behavior is complete with only an interface or mixin, and where no mediating contract, account, or relationship record exists.

**Runtime consequence.** Queries of the form "who is a supplier" must be able to name the founding relationship and its validity. An Interface query of the form "who is Priceable" is a different question. Cross-link issue 3 L2. Do not copy it as this issue's proof.

## L4. A relationship earns identity when it bears terms, actions, or validity

**Claim.** Use a typed link when the relation is only "A points at B." Use an identifiable relationship when the relation has limits, terms, suspension, parties beyond two, or actions aimed at the relation itself.

**Kind.** Candidate law.

**Evidence.** E2 hold and payment terms. E3 Party Link. E7 employment dates and exit. E12 Odoo Contracts. E13 PartyRelationship and Agreement. E16 AgentRelationship. E20 Employment relator. E21 S-006. RFC-0001 already states the same threshold and is not edited here.

**Decision state.** `supported` for the threshold. `undetermined` for a native Relator sort.

**Falsifier.** A domain where those attributes stay correct when stored only as properties of one endpoint, including after the other endpoint is replaced, merged, or split. EC02.

**Runtime consequence.** HoldSupplier, SuspendEmployment, and TerminateEmployment target the relationship. Credit limits attach there, optionally scoped by the books LegalPerson. E1, E22.

## L5. Record merge, legal succession, and identifier correction are different actions

**Claim.** Combining two records that always named one party is not the same as one legal entity succeeding another, and not the same as changing a surrogate or tax key.

**Kind.** Candidate law.

**Evidence.** E9 Odoo merge is irreversible and picks a destination. E3 Party Link is not a merge. E20 Kind change ends the individual. E11 VAT can be overridden as an observation. E18 tax identifier versus party role identifier.

**Decision state.** `hypothesis`.

**Falsifier.** A system that uses one merge operator for all three and still answers "what did we believe then" and "who is liable now" without extra out-of-band notes. EC12, EC13, EC14.

**Runtime consequence.** Three named actions, each writing different provenance. Entity-resolution work should consume this law rather than invent a fourth operator.

## L6. A contact person is not the billed party

**Claim.** The human you email is a Person in a communication role. The billed party is a Party in a customer or supplier relationship. One ContactPerson can represent many parties. A User login is a third thing.

**Kind.** Candidate law.

**Evidence.** E4, E8, E12, E13. ERPNext Contact links. Odoo `res.users` versus `res.partner`. Moqui UserAccount.partyId. Invite as User is documented as security-sensitive.

**Decision state.** `supported`.

**Falsifier.** A corpus where deleting the only contact must delete the customer, or where portal login identity is the customer identity, and where that collapse still preserves audit after the person changes employer. EC03, EC15, EC17, EC20.

**Runtime consequence.** Documents fetch a ContactPerson. Authority checks a Principal. Books name a Party. Issue 11 owns the Principal layer.

## L7. Jurisdictional identity can attach to a site

**Claim.** A tax registration is an identifier in a scheme. It may attach to a LegalPerson, to a Site, or to both. It is not the party's identity key.

**Kind.** Candidate law.

**Evidence.** E5 GSTIN on Address. E11 VAT on contact plus VIES observation. E18 FIBO TaxIdentifier and TaxIdentificationScheme. E6 and E10 books stay on the legal entity.

**Decision state.** `supported` that tax id is not party id. `hypothesis` that Site-attached registration is required in the core fragment rather than only in a localization pack.

**Falsifier.** A multi-jurisdiction corpus where one party-level tax field, with no site, still computes the correct levy and still explains historical invoices after a move. EC04, EC05, EC16.

**Runtime consequence.** Submitted documents must keep the registration they used. A later Address edit must not rewrite that fact.

## L8. Contact means are citeable. Their validity often lives on the association

**Claim.** Other objects must be able to cite the same location or number. Whether the means itself is immutable is still open. The association to a party has a period and a purpose.

**Kind.** Candidate law.

**Evidence.** E5, E14, E28. Moqui immutable ContactMech plus dated PartyContactMech. ERPNext Address with preferred billing or shipping and disable. Odoo child rows that are themselves partners.

**Decision state.** `hypothesis`. Address remains contested.

**Falsifier.** A domain where a shared Address never needs to be cited independently, or where in-place mutation of one means never corrupts another document. EC16.

**Runtime consequence.** If Address is an object, an address edit is an Action with provenance. If it is a value, a new value replaces the old one on the party. If it is an immutable means, update is expire-and-create.

## L9. Employee is a role, even when products store a personnel file

**Claim.** The enduring individual is a Person. Employment is the relationship. The HR file is a projection that products collapse for screen convenience.

**Kind.** Candidate law.

**Evidence.** E7, E12, E13, E20. Frappe HR definition is a person under a contract of employment, then stores the contract dates on the same master. Odoo splits Contracts into another app but still keys the file as Employee. Moqui and OntoUML keep the split.

**Decision state.** `hypothesis`.

**Falsifier.** A payroll or labor-law corpus where the Employee record must remain the identity of the person after all employments end, and where a later customer relationship cannot reuse that person. EC02, EC15.

**Runtime consequence.** Status Left closes Employment. It must not destroy Person.

## Composition recommendation

**Claim.** The party fragment can be composed from Party, Person, Organization, LegalPerson, OperatingUnit, Role membership, identifiable relationships, ContactPerson, ContactMeans, and TaxRegistration. It does not by itself earn new RFC primitives.

**Kind.** Candidate law about the engine, not about the world.

**Evidence.** Constitution rule 1. Prefer composition when meaning and enforcement survive. Issue 3 already hypothesizes the same for Role and Relator. This folder does not close that question.

**Decision state.** `hypothesis`.

**Falsifier.** Ordinary objects plus constraints cannot refuse two Kinds, keep Role out of the identity key, target relationship-objects with actions, distinguish the three identity operations, and keep site-level tax registrations from rewriting history.

**Runtime consequence.** Wave B runtime work should implement those enforcement points, not a Customer opcode.

## Rejected claims

**R1. Account is a party kind.**
Receivable and payable accounts in ERPNext are books projections. Odoo partner ledger is a report. Login accounts are principals. **Decision state.** `rejected` as a party kind.

**R2. Copy ERPNext Customer and Supplier as OS types.**
Party Link exists because that copy is already false in the product that uses it. **Decision state.** `rejected`.

**R3. Copy Odoo `res.partner` as the OS party.**
The same model is a legal entity, a person, and a dock address. That collapse is the bug this fragment is trying to avoid. **Decision state.** `rejected` as a canonical type.
