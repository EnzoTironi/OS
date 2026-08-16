# Candidate laws

**Kind:** explanation  
**Retrieved:** 2026-08-16  
**Decision:** per law. Never `accepted`.

Smallest claims that still fit the evidence. Each law names a falsifier. These are not RFC-0001 edits and not a target schema. If a law would change the thesis or the RFC list, it stays a recorded decision state.

## L-P-01. Irreducibility is an enforcement test

- Kind: candidate law
- Statement: A form earns a base sort only when composition cannot reproduce the enforcement, or when removing it creates repeated operational ambiguity. Elegance, product familiarity, and diagram cleanliness do not count.
- Evidence: Constitution §1. E-013, E-014, E-020
- Counterexample: A sort that never refuses an illegal write and never appears in two corpora, yet still seems tidy.
- Decision state: `supported` as the scoring rule for this folder
- Runtime consequence: Linters and style guides are not substitutes for Bind or Event.

## L-P-02. Action is not Event

- Kind: candidate law
- Statement: An attempted, authorized, or proposed intervention is a different sort from an observed occurrence. One Action may yield zero, one, or many Events. Events may arrive with no OS Action.
- Evidence: E-001, E-003, E-007, E-021. Constitution §8. Seed S-001, S-004, S-010
- Independent convergence: ValueFlows Intent or Commitment versus Economic Event. Issue 7 L-005. ERPNext submit versus ledger rows.
- Counterexample: A mature operational domain where "we requested X" and "X occurred" are safely one record, including timeouts and late observations.
- Decision state: `supported`
- Runtime consequence: Surfaces share Actions. Ledgers and stock histories store Events. Collapsing them is how M1 dies.

## L-P-03. Unknown after dispatch is not a false Event

- Kind: candidate law
- Statement: After a request has left OS, missing proof is `unknown`. It is not `failed` and not an observed business Event.
- Evidence: E-004, E-005, E-006, E-024. Constitution §9. Seed S-004
- Counterexample: A network where a timeout is legally identical to a confirmed failure and retry with a new key is always safe.
- Decision state: `supported`
- Runtime consequence: The Action invocation holds the unknown. A later Event or lookup reconciles. M2 cannot store this as `happened=false`.

## L-P-04. Event nature is not an Interface tag

- Kind: candidate law
- Statement: Storing an occurrence as a typed object is allowed. Treating Event as an ordinary Type that happens to implement an Event interface is not enough. The engine default for those individuals must refuse in-place mutation and must prefer append correction.
- Evidence: E-001, E-007, E-009, E-021. Issue 7 left encoding `undetermined`. This law hardens the enforcement half.
- Counterexample: A first vertical where Event-as-interface plus a linter prevents every posted-row edit, and where authors never add `status` mutation to occurrences.
- Decision state: `supported` for the nature. `rejected` for Type-plus-tag as sufficient enforcement. Encoding details stay `undetermined`
- Runtime consequence: M1 dies. M4 keeps Event as a sort or as a required nature with the other default. I do not grant the flag-only version yet.

## L-P-05. Eval is not Bind

- Kind: candidate law
- Statement: Typed computation over known inputs yields a value. A gate yields a decision at a locus with an obligation, an error algebra, and optional combination. The same body text can be reused. The jobs cannot be one sort.
- Evidence: E-002, E-008, E-012, E-020. Thesis `DebitTotal` versus `BalancedJournal`. Issue 8 R0 `rejected`, R2 not accepted
- Counterexample: A mapping to one `Function<Bool>` that preserves Cedar skip-on-error, Kubernetes false-versus-error, OpenFGA 400, and accounting refuse-closed, without a side channel.
- Decision state: `supported`
- Runtime consequence: Constraint and Policy die as base sorts. Bind stays. Function as the only logic word dies.

## L-P-06. Constraint and Policy are Bind jobs, not base sorts

- Kind: candidate law
- Statement: Constraint is Bind with obligation=system. Policy is Bind with obligation=authority and a specified combination. The user-facing words may remain. They do not mint sorts.
- Evidence: E-002, E-008, E-014, E-020, E-022. Issue 67 L-13
- Known limits: Issue 55 kept Constraint in the shared vocabulary. This law deletes the sort, not the job.
- Counterexample: A domain where authority and validity must be different sorts because Bind metadata cannot refuse the illegal mix `if user == admin: skip_validate`.
- Decision state: `hypothesis`
- Runtime consequence: If synthesis accepts this, RFC-0001's Constraint and Policy lines become derived forms. That is a candidate change, not an RFC edit.

## L-P-07. Relator is a pattern, not a native category

- Kind: candidate law
- Statement: When a relation has attributes, actions, validity, or more than two parties, give it object identity. Do not add a Relator storage sort until ordinary Type plus Links plus Binds fail in more than one corpus.
- Evidence: E-010. Issue 3 L3 `supported` for the threshold, `undetermined` for the sort. Issue 28 L4 `undetermined`. Constitution §1
- Counterexample: The falsifier issue 3 already wrote. Composition cannot refuse two Kinds, keep Role out of the identity key, and target the relationship, without hidden convention, in two corpora.
- Decision state: `rejected` as a native category on present evidence. `supported` as a pattern
- Runtime consequence: M3 dies. Employment, supply hold, and reservation are Types.

## L-P-08. Interface cannot carry Role and is not yet earned as a sort

- Kind: candidate law
- Statement: Shared shape is not contingent relational classification. Supplier, Customer, and Employee are founded by relationships. `Priceable` and `Principal` may be shapes. Putting Role names in the Interface slot loses anti-rigidity and identity.
- Evidence: E-011, E-019. Issue 3 L2, L4
- Counterexample: A system that uses only interfaces for Supplier and Customer, keeps one identity per legal party, and still lets the party leave the role without key collision.
- Decision state: Role carrier `rejected`. Interface as kernel sort `undetermined`
- Runtime consequence: M1's usual Role encoding is illegal. M4 may omit the Interface node.

## L-P-09. Property is not a base sort

- Kind: candidate law
- Statement: A typed attribute lives on Type. Money and quantity are value types. They do not add a metamodel sort named Property.
- Evidence: E-018. Issue 3 L6. Issue 62
- Counterexample: A value that needs lifecycle, merge, and Actions of its own while remaining equal by content only.
- Decision state: `rejected` as a base sort
- Runtime consequence: The type system still rejects binary float money and unitless quantities. That is value-type pressure, not a tenth primitive.

## L-P-10. Fact is not the only information atom

- Kind: candidate law
- Statement: Independent systems do not converge on one assertion type. Some current values are primary facts. Some are derived. Some history is Events. Forcing every object to be a projection invents fake events. Forcing every occurrence into a mutable field deletes history.
- Evidence: E-015, E-016. Issue 4 F5. Issue 12 CL-2, CL-3, CL-5
- Counterexample: After Class A collapsed fields are removed, ERPNext, Odoo, ValueFlows, PROV, Palantir, and Ontologiq still share one assertion-like unit with valid time and provenance.
- Decision state: `rejected` as sole atom. Kernel sort `undetermined`. Encoding `hypothesis`
- Runtime consequence: M2 dies. Experimental assertion rows may still be useful. They are not the metamodel.

## L-P-11. Time is a clock on sorts, not a sort

- Kind: candidate law
- Statement: Valid-then and known-then are different questions. Not every stored property carries both. Knowledge time is runtime-owned. Valid time is a domain value.
- Evidence: E-017. Issue 5 L1 through L4
- Counterexample: A domain where omitting either axis on ordinary notes and drafts causes repeated operational failure, forcing universal bitemporal rows as a law.
- Decision state: `supported`
- Runtime consequence: Do not add Time to M4. Declare clocks on the Types and Events that need them.

## L-P-12. Preview Bind is not commit Bind

- Kind: candidate law
- Statement: A judgment made against a shown world does not authorize the world at persist time. Commit rebinds against current inputs, including ontology and policy revisions named by the Action.
- Evidence: E-003, E-012. Seed S-003. Issue 7 L-003. Issue 67 L-05
- Counterexample: A lawful approval whose parameters, assumptions, and world digest may all drift, and where auditors still treat the approval as a commit.
- Decision state: `supported`
- Runtime consequence: M1 Function-as-policy evaluated once dies. Proposal Types are allowed. They are not a seventh sort.

## L-P-13. Stock Events and ledger Events are different individuals

- Kind: candidate law
- Statement: A quantity movement can exist without a general ledger posting. When coupling exists, name the coupling Action. Do not hide a GL write inside an inventory Type.
- Evidence: E-008, E-009. Issue 21 L11. Issue 18 L-INV-10. Issue 55 L-003
- Counterexample: Independent perpetual systems that all post the same accounts on the same operational Event, including Odoo, ERPNext, and Moqui.
- Decision state: `supported` for the split
- Runtime consequence: One Event sort can host both natures. One Event individual cannot be both facts unless a named coupling says so.

## L-P-14. The smallest unrejected core is six sorts, and that claim is still a hypothesis

- Kind: candidate law
- Statement: Type, Link, Action, Event, Eval, and Bind are the smallest set that this pass could not reject. M1, M2, and M3 are too small or the wrong small.
- Evidence: models M1 through M4. L-P-02 through L-P-10
- Counterexample: A seventh sort forced by the first vertical after good-faith use of M4. Or a working M1 with real enforcement. Or a working Fact-rule kernel that keeps Action stages and unknown outcomes without hidden verbs.
- Decision state: `hypothesis`
- Runtime consequence: Wave B must not emit a schema from this list. Synthesis issue 70 may shrink or grow it. RFC-0001 stays a hypothesis document.

## Rejected claims

**R-P-01. Type plus Link plus Function plus Action is enough.**
M1. Decision state: `rejected`.

**R-P-02. Typed Facts plus rules is the kernel.**
M2. Decision state: `rejected`.

**R-P-03. UFO natures plus Action plus Policy is the kernel.**
M3. Decision state: `rejected`.

**R-P-04. Action equals Event.**
L-P-02. Decision state: `rejected`.

**R-P-05. Policy equals Function plus fail-closed.**
L-P-05. Decision state: `rejected`.

**R-P-06. Event equals Type implementing Interface.**
L-P-04. Decision state: `rejected` as sufficient enforcement.

**R-P-07. Relator is required as an engine category.**
L-P-07. Decision state: `rejected` on present evidence.

**R-P-08. Interface carries Role.**
L-P-08. Decision state: `rejected`.

**R-P-09. Fact is the only atom.**
L-P-10. Decision state: `rejected`.

**R-P-10. The RFC-0001 ten-form list is irreducible.**
README verdict. Decision state: `rejected`.

## What would change RFC-0001

If later synthesis accepts L-P-06, L-P-07, L-P-09, and L-P-14, the RFC candidate list shrinks. Constraint, Policy, Property, and Relator-as-sort leave the base list. Interface is demoted or dropped. Fact stays an open encoding. That paragraph is a forecast of pressure. It is not an edit.
