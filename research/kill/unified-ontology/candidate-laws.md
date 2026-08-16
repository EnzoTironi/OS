# Candidate laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`. These are not RFC-0001 edits and not a target schema.

## L-001 A shared word is not a shared type

- Kind: candidate law
- Statement: When independent domains use the same English word for facts with different identity grains or invariants, OS may not give them one type.
- Evidence: E-003, E-018, E-019, E-021, E-022, A-001, A-010
- Independent convergence: Evans false-cognate problem. Product R-01. Manufacturing Work Order split. Accounting L11.
- Known limits: A word that survives every consumer with the same grain may be shared. LegalPerson is a candidate. Product is not.
- Counterexamples: S-001, S-011
- Decision state: `supported`
- Runtime consequence: Type names are qualified by context, or the runtime refuses unqualified homonyms.

## L-002 A commercial or workforce label is not identity

- Kind: candidate law
- Statement: Customer, Supplier, Employee, and User do not supply the identity of the enduring party. The enduring party can enter and leave those classifications.
- Evidence: E-015, E-017, E-018, E-023, E-027, A-002, A-004
- Independent convergence: Party L1, HR L1, FIBO mapping, SCIM core versus enterprise, seed S-005.
- Known limits: Some products store a personnel file or a customer master. That is a source artifact.
- Counterexamples: S-002, S-007, S-009
- Decision state: `supported`
- Runtime consequence: Identity keys of role records must not be the only key of the person or organization.

## L-003 Physical quantity, legal ownership, and carrying amount are different facts

- Kind: candidate law
- Statement: A bin count, a title claim, and an IAS 2 carrying amount can move independently. One inventory number cannot be the organizational truth.
- Evidence: E-016, E-020, E-022, E-024, A-003
- Independent convergence: Inventory L-INV-01 and L-INV-10. Accounting L11. IAS 2. Multi-entity L4 as hypothesis.
- Known limits: A tiny firm may post them together. The facts remain distinct even if one action writes several.
- Counterexamples: S-004, S-005, S-012, S-020
- Decision state: `supported`
- Runtime consequence: Queries for "inventory" must name grain. Quantity event and valuation event are different writes.

## L-004 Person, employment, post, and principal are different identities

- Kind: candidate law
- Statement: Ending employment, vacating a post, and deprovisioning a login are different actions. They may be coordinated. They are not one flag.
- Evidence: E-017, E-023, A-004
- Independent convergence: HR L1, L5, L10, L13. RFC 7643. Party L6 and L9.
- Known limits: Issue 11 owns Principal. This law only forbids the collapse.
- Counterexamples: S-007, S-008, S-009, S-019
- Decision state: `supported`
- Runtime consequence: Policy checks must be able to name each identity. SCIM `active` does not terminate employment.

## L-005 Cross-context identity is correspondence, not substitution

- Kind: candidate law
- Statement: A link across contexts names the local identities, the grain, the valid interval, and the provenance. It does not share all properties.
- Evidence: E-005, E-012, E-013, E-014, A-008
- Independent convergence: Evans translation. OWL anonymous individuals standardized apart. Halpin sameAs critique. FIBO maps words to Party rather than equating the words.
- Known limits: When two local identities are later proved to have been the same grain all along, a merge correspondence may be asserted. That is Party L5, not sameAs.
- Counterexamples: S-014, S-015
- Decision state: `supported`
- Runtime consequence: No global substitutive equality operator over context objects. Joins are explicit mappings.

## L-006 Context composition fails closed

- Kind: candidate law
- Statement: If two context modules contribute incompatible types, cardinalities, or invariants for a shared name, composition does not produce an executable union.
- Evidence: E-011, E-012, A-006, A-007
- Independent convergence: Apollo breaking composition. OWL inconsistent axiom closure. Evans "buggy, unreliable" result of combining distinct models.
- Known limits: Compatible widening may be allowed. The rule is about conflict, not about every difference.
- Counterexamples: S-017, S-022
- Decision state: `supported` as a required property. The composition calculus is `undetermined` and is Wave B.
- Runtime consequence: Do not pick a winner. Do not coerce. Report the conflicting context ids.

## L-007 Contradictory local models may both remain first-class

- Kind: candidate law
- Statement: Two contexts can hold facts that cannot be true in one axiom set. OS must keep both, with provenance, until a named policy projects an operational stance.
- Evidence: E-008, E-028, A-013, constitution §9
- Independent convergence: Seed S-011. Data mesh multiple interpretive contexts. Accounting parallel books. Open question 3.
- Known limits: Some apparent conflicts are collapsed concepts (requested versus promised versus actual). Those are not contradictions.
- Counterexamples: S-016, S-018, S-024
- Decision state: `hypothesis`
- Runtime consequence: A projection that picks a winner must name the policy and the losing claims. Silent overwrite is forbidden.

## L-008 An unqualified organizational query is incomplete for a known homonym

- Kind: candidate law
- Statement: A human, API, or agent request that uses Product, Customer, Inventory, or Identity without a context does not have a single denotation.
- Evidence: E-001, A-001, A-005
- Independent convergence: Evans ubiquitous language is per bounded context. Thesis "one model, many surfaces" assumed a shared denotation.
- Known limits: A default context can be policy. It is still a choice, not a unique meaning.
- Counterexamples: S-010, S-024
- Decision state: `hypothesis`
- Runtime consequence: Surfaces generated from the metamodel must carry context. Constitution §15 still holds inside one context.

## L-009 The shareable kernel is the metamodel plus surviving kinds, not role types

- Kind: candidate law
- Statement: What contexts may share without translation is a small set. Role labels and homonymous documents are outside it. Surviving kinds such as LegalPerson may be inside it after more evidence.
- Evidence: E-006, E-026, A-012, A-015
- Independent convergence: Evans Shared Kernel. RFC-0001 exclusion of Pack. FIBO Foundations versus domain modules.
- Known limits: The exact kernel membership is not known. Putting LegalPerson in the kernel is `hypothesis`. Putting Product there is `rejected`.
- Counterexamples: S-022, S-023
- Decision state: `hypothesis` for membership. `supported` that Product, Customer, Employee, and Inventory-quantity are outside the kernel.
- Runtime consequence: Kernel changes are versioned and consulted. Context modules depend on a pinned kernel revision.

## L-010 A context map is part of meaning

- Kind: candidate law
- Statement: The points of contact, the translation, the isolation, and the influence between context ontologies are themselves model content. They are not deployment topology.
- Evidence: E-005, E-009, E-010, A-016
- Independent convergence: Evans Context Map. Data mesh federated governance. GraphQL schema registry as a surface analog.
- Known limits: Whether the map is a first-class ontology object or a toolchain manifest is `undetermined`. Constitution rule 6 warns against promoting packages.
- Counterexamples: S-021, S-023
- Decision state: `hypothesis`
- Runtime consequence: An action that crosses contexts must cite the mapping revision it used.

## L-011 External systems are anticorruption targets, not internal contexts

- Kind: candidate law
- Statement: An ERP, marketplace, or fiscal service that OS does not own is reached through a translation layer in OS terms. It is not a second internal ontology authority.
- Evidence: E-025, A-016
- Independent convergence: Evans Anticorruption Layer. H1 weakening.
- Known limits: Brownfield companies may need H1-like integration. That is not the greenfield thesis.
- Counterexamples: none run
- Decision state: `hypothesis`
- Runtime consequence: External identifiers live on correspondences. They do not become OS type names.

## L-012 The thesis reading "one enterprise vocabulary" is false. The reading "one metamodel" is unproven

- Kind: candidate law
- Statement: Issue 55 changes the thesis scope. The primary artifact cannot be one ubiquitous language for the organization. It may still be one executable metamodel hosting federated context ontologies. That second reading is a new hypothesis, not a silent acceptance of the old sentence.
- Evidence: E-001, E-002, E-025, A-005, L-001 through L-009
- Independent convergence: Open question 1. Open question 16. Open question 23 first bullet, "critical business behavior cannot be represented cleanly without a second semantic authority."
- Known limits: Synthesis issue 70 owns the rewrite. This folder does not edit `docs/thesis.md` or RFC-0001.
- Counterexamples: A later note that shows one vocabulary preserving every sibling law without mappings would revive the old reading.
- Decision state: `supported` for the rejected reading. `hypothesis` for the federated metamodel.
- Runtime consequence: None until synthesis. Wave B must not assume a single Product table.

## Rejected claims

**R-001 One Product, Customer, or Inventory type for the organization.**
A-001, A-002, A-003. Decision state: `rejected`.

**R-002 owl:sameAs as cross-context identity.**
A-008, S-014. Decision state: `rejected`.

**R-003 OWL import closure as the federation mechanism.**
A-006. Decision state: `rejected`.

**R-004 Pack as the semantic context unit.**
A-015, E-026. Decision state: `rejected`.

**R-005 Golden dataset governance.**
A-009. Decision state: `rejected` as the OS truth model.

**R-006 The entire executable-ontology thesis is dead.**
A shared Action, Event, Fact, Constraint vocabulary was not killed. Decision state: `rejected` as an overreach. The scope change is L-012.
