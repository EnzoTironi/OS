# Open questions

Unresolved uncertainty from this pass. Decision state on every card is `undetermined` unless a cited artifact already answers it. This file does not edit `docs/open-questions.md` and does not invent answers to the questions listed there.

## Q-001 Does the surviving design still deserve the name one ontology?

- Kind: domain evidence
- Points at: `docs/open-questions.md` question 1. L-012.
- What is known: The one-vocabulary reading is `rejected`. A shared metamodel plus context modules is `hypothesis`.
- What would settle it: Synthesis issue 70 rewriting the thesis sentence with a named artifact, or a later kill that shows the metamodel itself fails.
- Decision state: `undetermined`

## Q-002 What is in the shared kernel?

- Kind: candidate law
- Points at: L-009. RFC-0001 primitive list. `docs/open-questions.md` question 2.
- What is known: Product, Customer, Employee, and Inventory-quantity are outside. LegalPerson is a candidate. Action, Event, Fact, Constraint, Policy, time, and provenance are candidates because they are metamodel forms, not domain types.
- What would settle it: A kernel membership test. Add a type. See whether two sibling domains can use it without translation and without losing a recorded law.
- Decision state: `undetermined`

## Q-003 Are context modules semantically real?

- Kind: candidate law
- Points at: `docs/open-questions.md` question 16. L-010. A-015.
- What is known: Pack is `rejected` as a business entity. Evans bounded context is `supported` as a modeling necessity. Whether OS needs a native Context sort, or only namespaces and mappings, is not shown.
- What would settle it: A case where ordinary modules plus mapping objects cannot refuse a homonym or pin a mapping revision.
- Decision state: `undetermined`
- Do not invent an answer to question 16.

## Q-004 What is the mapping primitive?

- Kind: candidate law
- Points at: L-005, L-010. Evans Published Language and Anticorruption Layer. GraphQL `@key`.
- What is known: sameAs is `rejected`. A dated correspondence with grain and provenance is `hypothesis`. Whether that correspondence is a Relator, a Fact, or another form belongs to issue 3 and issue 12.
- What would settle it: Foundation notes that can express S-014 and S-015 without a new primitive, or a counterexample that composition cannot.
- Decision state: `undetermined`

## Q-005 How should contradictory claims become operational?

- Kind: domain evidence
- Points at: `docs/open-questions.md` question 3. L-007. Seed S-011.
- What is known: Multiple claims must be representable. Authority is not last-write-wins. The policy that picks an operational stance is not designed here.
- What would settle it: Issue 4 and issue 5 research on accepted fact versus observation, cited from durable notes, not from this folder's intuition.
- Decision state: `undetermined`
- Do not invent an answer to question 3.

## Q-006 Does data mesh apply to operational mutation?

- Kind: domain evidence
- Points at: E-008, A-009, D-003.
- What is known: Dehghani writes about analytical data products. The attack on golden datasets still lands. The four principles are not thereby OS runtime laws.
- What would settle it: A later note that shows operational mutation requiring centralized canonical types, or a note that shows domain-owned operational ontologies scaling without a god-model.
- Decision state: `undetermined`

## Q-007 Can one metamodel host incompatible invariants without a second engine?

- Kind: runtime consequence
- Points at: `docs/open-questions.md` question 23, bullets on a second semantic authority and on specialized kernels. RFC-0001 falsification targets 5 and 12.
- What is known: This kill test did not show that accounting equality or stock exclusivity need a second engine. It showed they need a different context than commerce Product.
- What would settle it: Kill test issue 58 and accounting issue 21, cited as artifacts.
- Decision state: `undetermined`
- Do not invent an answer to question 23.

## Q-008 How do surfaces stay shared if denotation is contextual?

- Kind: runtime consequence
- Points at: thesis "one model, many surfaces." Constitution §15. L-008.
- What is known: Inside one context, human, API, and agent should still share an Action. Across contexts, an unqualified Product tool is incomplete.
- What would settle it: A surface-generation experiment that parameterizes context without forking business meaning. Wave B. Not designed here.
- Decision state: `undetermined`

## Q-009 How are context ontologies versioned relative to historical actions?

- Kind: runtime consequence
- Points at: `docs/open-questions.md` question 19. Seed S-012. S-021.
- What is known: Independent versioning is `hypothesis`. A cross-context action probably pins every context revision it read. Mechanism unknown.
- What would settle it: Foundation issue 10 notes, cited.
- Decision state: `undetermined`
- Do not invent an answer to question 19.

## Q-010 Is a published language enough, or is an anticorruption layer required on every edge?

- Kind: candidate law
- Points at: E-005. Evans Open-host Service plus Published Language versus Anticorruption Layer.
- What is known: Both patterns exist. GraphQL federation looks like a published language at the gateway. Downstream contexts may still translate.
- What would settle it: Two sibling domains that share a published correspondence without local translation, versus a case that corrupts a consumer model without an isolating layer.
- Decision state: `undetermined`

## Q-011 Do we need a new GitHub issue?

- Kind: domain evidence
- Statement: No new semantic question appeared that is not already owned by issue 55, issue 1-style open questions, issue 3 identity, issue 14 party, issue 15 product, or issue 70 synthesis.
- Decision state: `supported` that no child issue is opened this pass.

## Questions from the issue body, status

| Issue 55 question | Status | Artifact |
| --- | --- | --- |
| Can one ontology preserve contextual meaning without becoming a global god-model? | One-vocabulary reading `rejected`. Metamodel reading `hypothesis`. | L-012, A-005, A-006 |
| Should OS support multiple ontologies or context modules with explicit mappings? | `hypothesis` yes. Encoding `undetermined`. | L-009, L-010, Q-003 |
| What does cross-context identity mean? | Correspondence with grain and provenance. Not sameAs. | L-005 |
| Can contradictory local models coexist safely? | Representable, `hypothesis`. Safe operational projection `undetermined`. | L-007, Q-005 |
