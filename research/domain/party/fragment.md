---
issue: 14
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Proposed canonical party fragment

A model to attack. Not OS vocabulary. Not a schema. Not an RFC edit.

**Kind.** Candidate model.
**Decision state.** `hypothesis`

The fragment is a set of domain concepts and the relations that must stay distinct. Storage, tables, and DocTypes are out of scope.

## Enduring party

A Party is an identifiable person or organized group that can stand in commercial, employment, or legal relations.

Person and Organization are natures of Party. A party has one of those natures. Changing from Person to Organization is not a field edit. It is a claim that the individual was misclassified or that a different individual is now in view.

**Kind.** Domain evidence mapped to a candidate type.
**Support.** E8, E13, E15, E18, E20.
**Decision state.** `supported` for the Person or Organization cut. `hypothesis` for the name Party.

ValueFlows also has EcologicalAgent. This fragment leaves that out. Climate and ecosystem agency is a later domain question.

## Legal capacity is not Organization

LegalPerson is the capacity to accrue liability in a jurisdiction. A natural person can be a LegalPerson. An Organization can fail to be one. A special purpose vehicle can be a LegalPerson created for a narrow, temporary objective.

OperatingUnit is a site, branch, plant, or internal group that acts in operations without keeping its own books. Brand is a public name that may be shared by several LegalPersons or used by one LegalPerson in several markets. Site is a location used by an OperatingUnit.

```text
Party
  Person
  Organization

LegalPerson     -- capacity of a Party in a jurisdiction
OperatingUnit   -- operational subdivision, not automatically a LegalPerson
Brand           -- public name, not a party
Site            -- location used by an OperatingUnit or Party
```

**Kind.** Candidate law. See L2.
**Support.** E6, E10, E19, E20, E25.
**Decision state.** `supported` that books-entity, operating site, and brand are different. `hypothesis` for the four names.

OntoUML treats Legal Entity as a Category that can include contracts and legislation. This fragment does not follow that wider Category. Contracts are instruments, not parties. See open question Q4.

## Commercial labels are roles

Customer, Supplier, Carrier, Competitor, Affiliate, BillTo, ShipTo, Payer, and Payee are roles. They do not supply identity. The same Party can hold several at once, hold none, or leave one without becoming a different individual.

A role is true because a relationship exists, or existed, not because the party implements a shared shape.

```text
Party --plays--> Role
Role  --founded by--> Relationship
```

Bill-to and ship-from can be different parties. Moqui already names them as different RoleTypes. Collapsing them into one Customer flag loses that cut.

**Kind.** Candidate law. See L1.
**Support.** E3, E13, E16, E20, E21, E27.
**Counterexample that looks like one.** ERPNext Customer and Supplier masters. E1, E2, E3.
**Decision state.** `supported` for "not a Kind." `hypothesis` for the exact role list.

## Relationships that earn identity

Use a thin link when the only fact is "A points at B."

Use an identifiable relationship when the relation has terms, validity, suspension, parties beyond two, or actions aimed at the relation itself.

Candidates that earn identity in this domain:

| Relationship | Why it earns identity |
| --- | --- |
| CustomerRelationship | Price list, payment terms, credit limit, portal access, hold |
| SupplyRelationship | Payment terms, hold, transporter flag, score, payable defaults |
| Employment | Position, compensation, suspension, promotion, termination |
| Membership | Organization hierarchy, affiliate, spouse, group member |
| Agreement | Dated instrument with items, terms, addenda |

Employment is the cleanest relator case in the sources. OntoUML uses it as the motivating example. Moqui stores it as PartyRelationship plus optional Agreement. Frappe HR and Odoo collapse it onto an Employee file. The collapse is a source artifact.

**Kind.** Candidate law. See L3.
**Support.** E7, E12, E13, E16, E20, E21.
**Decision state.** `supported` for the threshold. `undetermined` for a native Relator sort. Issue 3 owns that engine question.

## Contact person

A ContactPerson is a Person in a communication role relative to one or more parties. One person can represent two customers. A ContactPerson is not the billed party and not a User.

Portal login is a User or Principal bound to a ContactPerson or Employee. Issue 11 owns the Principal cut. This fragment only refuses to identify login with Party.

**Support.** E4, E8, E12, E13, E24.

## Address and contact means

A ContactMeans is a way to reach a party. Postal address, telecom number, and email are kinds of ContactMeans.

A PostalAddress is a location. Other objects may cite it. Preferred billing and preferred shipping are roles of that location relative to a party or relationship, not extra copies of the party.

Validity belongs on the association of ContactMeans to Party, not only on the means. Moqui makes the means immutable and expires the association. ERPNext allows in-place edit for a minor correction and asks for a new Address when the location materially changes.

**Decision state.** `undetermined` whether a postal address is a value, an object, or an immutable contact means. See E28 and Q5.

Do not make an address a Party. Odoo's child-partner encoding is a source artifact. E8.

## Tax and jurisdictional identity

A TaxRegistration is an identifier assigned by a jurisdiction under a scheme. It can attach to a LegalPerson, to a Site, or to both. Indian GSTIN on a branch Address is the forcing case. EU VAT on a partner is the other common case.

LEI, company registry number, employee number, and driver license are other typed identifiers. They are not the party.

Party-in-role identifiers, such as a customer code, identify the role or relationship, not the LegalPerson. FIBO splits those on purpose. E18.

**Decision state.** `supported` that tax identity is not party identity. `hypothesis` for a first-class TaxRegistration concept.

## Identity operations

Three operations stay distinct.

1. Record merge. Two records always named one party. Odoo merge. Dedup.
2. Legal succession. One LegalPerson succeeds another. Novation, merger, split.
3. Identifier correction. A surrogate or tax id was wrong. The party did not change.

ERPNext Party Link is none of these. It is an accounting offset between two role records.

**Decision state.** `hypothesis`. See L5 and EC12, EC13.

## What this fragment refuses

- Customer, Supplier, or Employee as the identity key of a person or organization.
- SoftwareAgent as a Party. Cross-link issue 11. Not re-proved here.
- Account, meaning a login or a receivable ledger, as a Party. Receivable ledgers are books projections. Logins are principals.
- A target SQL schema, DocType list, or `res.partner` clone.
- EcologicalAgent, until a domain issue asks for it.
- Pack, module, or Company-as-tenant as ontology.

## Runtime pressure if the fragment survives

Queries of the form "who is a supplier" must be able to name the founding relationship and its validity.

Credit limits, payment terms, and holds attach to the relationship, or to the relationship in a Company books context, not to the Person name.

Actions such as HoldSupplier, SuspendEmployment, and DisableCustomer target the relationship or the role membership.

Merge, succession, and identifier correction are different actions with different provenance.

Address edits that change jurisdictional identity must not silently rewrite submitted documents.

**Kind.** Runtime consequence.
**Decision state.** `hypothesis`

## What would falsify this fragment

- A corpus where Supplier identity is independent of any Person or Organization, and destroying the organization leaves a Supplier that still refers to the same legal party.
- A jurisdiction that treats a named software agent as the contract party with no human or organization behind it.
- A working books close that requires Customer and Supplier to remain distinct individuals even after legal identity is unified, for reasons other than module defaults.
- A domain where branch, legal entity, and brand can share one identity without breaking tax, intercompany, or authority.

If those show up, revise the fragment. Do not quietly keep it.

## Cross-links

Issue 3 decides whether Role and Relator need engine categories. This fragment assumes composition is still possible.

Issue 11 decides Actor and Principal. A Party may implement those interfaces. A SoftwareAgent may not be a Party.

Issue 67, when it exists, owns multi-entity books. This fragment only splits LegalPerson from OperatingUnit.
