# Candidate laws

**Kind.** candidate law  
**Fetched.** 2026-08-16  
**Decision.** per law. Never `accepted`.

Each law is the smallest claim that would explain the catalog. A later synthesis pass should try to break these before touching RFC-0001.

### L-001 Most named disagreements are reducible

- Statement: If two values become jointly true after they are typed by identity, speech-act or layer, valid time versus knowledge time, unit, and party role, the case is not a fact conflict and needs no authority mechanism.
- Evidence: E-001, E-003, E-006, E-007, E-010, E-011, E-015, E-016, E-019
- Independent convergence: ValueFlows layers, Palantir identity-versus-observation, ERPNext promise versus Delivery Note, Odoo Delivery Date versus Expected date, GS1 owning versus possessing, SAP parallel ledgers.
- Known limits: Does not cover IRR rows.
- Counterexamples: X-001
- Decision state: `supported` for the RED rows marked supported. `rejected` as a claim that every disagreement in the six domains reduces.

### L-002 Same property, same identity, same valid time can still clash

- Statement: Two live records can assert incompatible values of one typed property for one bound identity at one valid time. Renaming the fields does not remove the clash.
- Evidence: E-004, E-008, E-009, E-012, E-013
- Independent convergence: Foundry refuses to map two datasources onto one property. ERPNext and Odoo keep book and count as two inputs. GUM keeps two estimates. ERPNext Manual Inspection decides a failed reading.
- Known limits: Some apparent IRR rows are still `hypothesis`, including bank versus book and dual-write conflict rules.
- Counterexamples: X-002
- Decision state: `supported`

### L-003 The required mechanism is a Decision Action, not a truth layer

- Statement: The smallest mechanism that covers IRR rows is a governed Action that consumes the live rival records and emits a new record. Stock reconciliation, quality disposition, identity link or split, promise supersession, and statement restatement are that shape. A standing accepted-fact store that mutates or drops the inputs is larger than the evidence.
- Evidence: E-002, E-005, E-008, E-009, E-013, E-014, E-018
- Independent convergence: ValueFlows `corrects`. ERPNext and Odoo adjustment postings. IAS 8 retrospective restatement. PROV revision and invalidation. Foundry merge is the counter-pattern because it drops the loser from the object.
- Known limits: Legal regimes that require a filed canonical number to exist as its own durable object are not surveyed. That would narrow, not enlarge, the mechanism to a Decision record.
- Counterexamples: X-003, X-004
- Decision state: `hypothesis`

### L-004 Authority is scoped by property, Action, and time

- Statement: The same observation can be visible and still unauthorized for a given Action. A number that may drive a dashboard may not drive a payment, a pick, or a tax filing. Authority is not an object-level winner table.
- Evidence: E-004, E-005, E-008, E-013, E-015
- Independent convergence: Foundry property-scoped datasource ownership. SAP ledger-scoped valuation. ERPNext inspection status gating stock documents.
- Known limits: No complete authority matrix was built this pass.
- Counterexamples: X-005
- Decision state: `hypothesis`

### L-005 Accepted state is a projection plus optional Decision

- Statement: Pickers, payment runs, and filings need one number. That number is the projection used by an Action at a time, optionally pinned by a Decision record. It is not a mutated original and not a kernel AcceptedFact type.
- Evidence: E-002, E-005, E-008, E-009, E-017, E-019
- Independent convergence: ERP ledgers present an active balance while cancelled rows remain. Microsoft virtual tables avoid a second store. Foundry materializes a merged object and loses the loser.
- Known limits: Question 3 stays open. This law is the kill-test pressure, not an answer.
- Counterexamples: X-003
- Decision state: `hypothesis`

### L-006 Confidence is not authority

- Statement: Uncertainty ranks inspection. It does not settle a payable, a stock ledger, a legal promise, or a release.
- Evidence: E-012, E-013, E-018
- Independent convergence: GUM requires uncertainty on every result. ERPNext still needs a status decision. PROV records primary source without electing a value.
- Known limits: A regulated process that treats a calibrated posterior as legally sufficient without a disposition Action would reject this law. Not found.
- Counterexamples: X-006
- Decision state: `hypothesis`

### L-007 Identity binding is prior to value authority

- Statement: Unbound or split identity is a different problem than rival values. A merge or split Decision must run before property authority.
- Evidence: E-003, E-016
- Independent convergence: Palantir primary-key join. ERPNext Party Link without master merge.
- Known limits: ISO 8000 and LEI practice were not read.
- Counterexamples: X-007
- Decision state: `hypothesis`

## Rejected readings

| Reading | State | Why |
| --- | --- | --- |
| Hypothesis A as a complete kill of authority | `rejected` | IRR-01 through IRR-04 and IRR-06 remain after typing. |
| Hypothesis B as a standing canonical-truth layer | `rejected` | The surviving operations append a Decision or adjustment. Foundry-style winner-merge drops evidence. |
| Inherit H1 winner tables from `docs/hypothesis-history.md` | `rejected` | Integration pattern, not domain law. |
| Confidence equals authority | `rejected` | E-012 and E-018. |
