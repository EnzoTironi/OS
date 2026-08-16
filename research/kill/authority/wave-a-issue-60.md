# Wave A contract. Issue 60

**Track:** kill  
**Issue:** https://github.com/EnzoTironi/OS/issues/60  
**Parent:** https://github.com/EnzoTironi/OS/issues/2  
**Open question:** `docs/open-questions.md` question 3  
**Decision state:** see section 11  
**Retrieved:** 2026-08-16  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` is not on `origin/main`.

This file is the single-page contract. The other files in this folder are the queryable cards.

## 1. Question

Do we need an explicit authority or truth layer when sources disagree, or does correct domain modeling eliminate it?

Hypothesis A. Most disagreement is model collapse. Requested, promised, planned, and actual dates are different concepts. Model them correctly and no authority layer is needed.

Hypothesis B. Irreducible disagreement remains. Two sensors, two identity claims, or a manual override versus a source still collide. Explicit source authority or decision semantics are necessary.

Test domains. Inventory, customer commitments, finance, master data, quality measurements, imported ERP state.

Deliverable. A catalog of reducible versus irreducible disagreements, and the smallest authority mechanism required, if any.

## 2. Sources

See [`sources.md`](sources.md). Primary evidence is public manuals and standards. Sibling research was read with `git show` only and is not copied.

## 3. Evidence

Numbered records live in [`evidence.md`](evidence.md).

**Domain evidence.**

- Requested, promised, planned, and actual flows are different relations. E-001, E-006, E-007.
- Ownership is not possession. E-010.
- A measurement is an estimate plus uncertainty, and it is not the measured object. E-003, E-011, E-012.
- IFRS and local GAAP are two valuation questions. E-015.
- One legal party can be two role masters. E-016.
- Book quantity and counted quantity are two inputs to a later posting. E-008, E-009.
- A failed quality reading can still be accepted by a later status decision. E-013.
- An estimate change is not an error correction. E-014.

**Source-system artifact.** Foundry property multiplicity ban and user-edits-win merge. Palantir canonical type as DRY. ERPNext Customer and Supplier DocTypes. SAP leading ledger. Microsoft dual-write copy versus virtual-table proxy.

## 4. Source artifacts

See the artifact list in [`catalog.md`](catalog.md). None of those names is proposed as an OS type.

## 5. Convergence

Independent sources share these distinctions.

| Distinction | Who |
| --- | --- |
| Plan or promise is not observation | ValueFlows, ERPNext Sales Order versus Delivery Note, Odoo Delivery Date versus Expected date |
| Correction appends | ValueFlows `corrects`, ERPNext and Odoo adjustments, IAS 8 restatement, PROV revision |
| Property-scoped source ownership | Foundry MDO, SAP ledgers, ERPNext inspection gating stock |
| Current quantity can be derived | ERP and Odoo ledgers, ValueFlows event history |
| Identity binding is separate from value authority | ERPNext Party Link, Palantir primary keys |
| Uncertainty stays speakable | GUM, ERPNext Manual Inspection, PROV primary source |

## 6. Divergence

| Topic | Split | Plausible reason |
| --- | --- | --- |
| Rival values for one property | Foundry picks a winner in the index. ERP keeps documents and posts an adjustment. REA types flows apart. | Application UX versus audit versus economic theory. D-001. |
| Canonical | Foundry wants one object type per concept. ERPNext keeps two party masters. | Modeling hygiene versus role-specific controls. |
| Imported ERP | Microsoft virtual tables stay a proxy. Dual-write copies. Foundry merges edits into an index. | Integration architecture, not domain law. |
| Kill-test pointer | Issue 4 named issue 59. This assigned issue is 60. | D-002. Numbering, not semantics. |

## 7. Candidate laws

All recorded in [`candidate-laws.md`](candidate-laws.md).

1. L-001. Most named disagreements are reducible. `supported` for the RED rows. `rejected` as a total kill of authority.
2. L-002. Same property, same identity, same valid time can still clash. `supported`
3. L-003. The required mechanism is a Decision Action, not a truth layer. `hypothesis`
4. L-004. Authority is scoped by property, Action, and time. `hypothesis`
5. L-005. Accepted state is a projection plus optional Decision. `hypothesis`
6. L-006. Confidence is not authority. `hypothesis`
7. L-007. Identity binding is prior to value authority. `hypothesis`

## 8. Counterexamples

See [`counterexamples.md`](counterexamples.md). X-001 through X-007. None ran as executable tests. Manuals already narrow X-001, X-004, and X-005.

## 9. Runtime pressure

If L-002 and L-003 survive, an engine must

- persist rival live records
- project the input an Action used without deleting the inputs
- record knowledge time and valid time
- treat identity Decisions as prior to value Decisions
- refuse to treat confidence as a write

No store, queue, or language is selected. Wave B waits on this pressure.

## 10. Open questions

Question 3 remains `undetermined`. This folder is evidence, not an answer.

Also still open.

- Question 2. Is Fact a kernel type? Not decided here.
- Question 7. Must every record carry both time dimensions? Pressed by RED-15 and IRR-02.
- Question 8. Which PROV relations are semantic? E-018 is interchange evidence only.
- Bank versus book. IRR-05 stays `hypothesis` until a named bank-reconciliation manual is cited.
- Dual-write conflict policy. IRR-09 needs a named Microsoft conflict page.
- ISO 8000 and LEI practice for master data. Unread.

No new GitHub issue is opened. Those questions already exist or stay in this note.

## 11. Decision state

| Claim | State |
| --- | --- |
| Question 3 resolved | `undetermined` |
| Hypothesis A as the majority case | `supported` |
| Hypothesis A as "no authority layer is needed" | `rejected` |
| Hypothesis B as "some decision semantics are necessary" | `supported` |
| Hypothesis B as a standing accepted or canonical truth layer | `rejected` |
| Smallest remaining mechanism is a reconciliation Decision Action | `hypothesis` |
| Accepted fact is a stored kernel type | `undetermined` and not required by this catalog |
| Confidence equals authority | `rejected` |
| Inherit H1 winner tables | `rejected` |
| RFC-0001 edit | not done |

## Licensing

Concepts and published behavior only. No implementation reuse.
