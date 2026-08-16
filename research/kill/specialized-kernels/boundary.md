---
issue: 58
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Proposed boundary

This is the cut the issue asked for. It is a hypothesis. It is not a runtime design and not an RFC edit.

## The cut

```text
Ontology (semantic authority)
  Functions, Constraints or Binds, Actions, Events, Facts
  domain definitions, dated tables, formula identity, policy

Physical evaluators (no new meaning)
  ledger store that refuses imbalance
  ordered valuation replay
  BOM walker
  solver
  decimal numeric engine
  signer and layout emitter
  official validator or authorizer, treated as external
```

Palantir's Language versus Engine is the closest independent statement. Constitution §6 is the local statement. H2 failed because it put kernels *between* definition and surface.

## Tests a physical engine must pass

A specialized evaluator is useful and still not a second semantic authority when all of the following hold.

1. **Quote the definition.** Every result names the Function, Constraint, or Action revision it evaluated.
2. **No private rules.** Accounts, formulas, tax codes, and rounding policies are inputs from the model. The evaluator has no sealed table that authors cannot see.
3. **Refuse-closed on the ontology's Constraint.** If the model says balanced, the store refuses imbalance. The store does not invent a suspense account unless the model named one.
4. **Outputs are Facts or Events.** A solver emits a candidate plan. A poster emits LedgerEntries. A signer emits a payload plus an unknown-or-authorized Effect. Nothing is "true because the engine said so."
5. **Replayability.** The same pinned inputs yield the same result, or the result is explicitly search with a recorded seed, objective, and chosen feasible point.
6. **Replaceability.** Swapping TigerBeetle for another store, or PVA for a later PVA, does not change domain law.
7. **One book.** Certified emitters and back-office evaluators read the same Facts. PAF requisito I is the legal form of this test.

Fail any test and the evaluator has become a kernel in the H2 sense. That is `rejected`.

## What this allows

| Job | Semantic form | Physical form that may exist |
| --- | --- | --- |
| Post journal | Action plus balance Constraint | Append-only debit/credit store |
| Value stock | Function over layers | Ordered replay job |
| Explode BOM | Function over specification revision | Walker or compiled plan |
| Finite schedule | Optimization Function or a later sort | Solver |
| Round money | Named rounding Function | Decimal or integer engine |
| Determine tax | Dated Function of facts and tables | Compiled table evaluator |
| Mint NF-e | Action plus external Effect | Signer, layout emitter |
| File ECD or eSocial | Action plus accessory obligation | Layout emitter, then official PVA or government receipt |

## What this forbids

- `if company == X` inside the generic engine.
- A poster that writes accounts the Journal definition did not name.
- A valuation job that changes rates without a Function revision and a movement history.
- A solver that inserts work orders without an Action.
- A fiscal module that treats DANFE or an internal invoice number as the authorized document.
- A payroll module that owns INSS law in compiled code the ontology cannot print.

## Relation to later waves

Wave B may recommend stores, solvers, and emitters. It should treat this page as semantic pressure, not as a shopping list. Wave C should not reopen R-K-01 unless a vertical produces S-K-01.

Open question 9 still owns the word `Function` for optimization. This page only requires that search not pretend to be arithmetic.
