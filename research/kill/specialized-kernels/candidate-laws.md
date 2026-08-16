---
issue: 58
kind: explanation
fetched: 2026-08-16
decision_state: mixed
---

# Candidate laws

Smallest claims that still fit the evidence. Each law names a falsifier. Decision state is never `accepted`. These are not RFC-0001 edits.

## L-K-01. Semantic authority stays in the ontology

**Kind.** candidate law  
**Decision.** supported

Business meaning for posting, valuation, explosion, tax determination, and document minting is stated as ontology Functions, Constraints, Actions, and Facts. A physical engine may evaluate those statements. It may not invent accounts, formulas, or tax codes the model cannot see.

**Evidence.** E-001, E-002, E-005, E-006, E-007, A-AGAINST-01, A-AGAINST-05.

**Counterexample.** S-K-01.

**Runtime consequence.** An evaluator must cite the definition revision it ran. A result that cannot be explained against that revision is a defect.

## L-K-02. Semantic specialization is not physical specialization

**Kind.** candidate law  
**Decision.** supported

Domain definitions may be specialized. Brazil fiscal tables, FIFO versus average, Anglo-Saxon versus Continental timing, and eSocial rubricas live in the model. Runtime evaluators, stores, solvers, signers, and official validators are physical. Mixing the two words is how H2 returned.

**Evidence.** E-002, E-005, E-018, E-022.

**Counterexample.** S-K-02.

**Runtime consequence.** Wave B may add evaluators without adding primitives. Wave A must not treat an evaluator as a new sort.

## L-K-03. Debit equals credit is a Constraint, not an AccountingKernel

**Kind.** candidate law  
**Decision.** supported

A successful posting is refuse-closed on imbalance in the functional currency. The law is the Constraint. A specialized store may enforce it. The store is not the meaning.

**Evidence.** E-003, E-004, sibling L1.

**Counterexample.** S-K-03.

**Runtime consequence.** Agents may not invent a plug account. Preview must not write LedgerEntries. See thesis example. Do not edit the thesis from this folder.

## L-K-04. Posted history is not rewritten in place

**Kind.** candidate law  
**Decision.** supported

Ordinary correction adds compensating rows or a reversing journal. Physical engines that allow UPDATE or DELETE of posted transfers fail this law even if they are fast.

**Evidence.** E-003, E-008, sibling L3, TigerBeetle immutability.

**Counterexample.** S-K-04.

**Runtime consequence.** Delete of a LedgerEntry is not a business Action.

## L-K-05. A valuation formula is a dated Function over movements

**Kind.** candidate law  
**Decision.** supported

FIFO, weighted average, standard, and specific identification are Functions. They consume a pinned movement history, a formula identity, and a valid-time cut. They are not a quantity kind and not an engine primitive. LIFO may exist as a jurisdictional Function. IAS 2 does not require it.

**Evidence.** E-007, E-008, E-009, E-020, sibling inventory "not in the kernel."

**Counterexample.** S-K-05.

**Runtime consequence.** Backdated movement triggers an ordered replay of the same Function. Silent rate overwrite is illegal.

## L-K-06. Stock movement and ledger posting are different individuals

**Kind.** candidate law  
**Decision.** supported

A quantity Event can exist without a GL Event. When coupling exists, name the coupling Action. Do not hide a GL write inside an inventory evaluator.

**Evidence.** E-009, E-017, sibling L11, L-P-13.

**Counterexample.** S-K-06. Same falsifier as sibling L11.

**Runtime consequence.** Perpetual posting is a policy plus Action, not a kernel default.

## L-K-07. Explosion and netting are Functions. Finite allocation is search.

**Kind.** candidate law  
**Decision.** supported for the class split. `undetermined` for the metamodel word.

Dependent demand is calculated from independent demand, a specification revision, and a declared position. That calculation is deterministic. A capacity-feasible sequence is a search over a factorial space and may return infeasible.

**Evidence.** E-010, E-011, sibling L-01, L-03, L-06, S-APS-01.

**Counterexample.** S-K-07.

**Runtime consequence.** Do not treat an MRP suggestion as an authorized work order. Open question 9 stays open.

## L-K-08. A solver proposes. An Action commits.

**Kind.** candidate law  
**Decision.** hypothesis

Optimization output is a candidate plan with explicit inputs, objective, and provenance. It does not become operational supply until an Action rebinds current facts and policy.

**Evidence.** E-011, sibling L-07, Palantir "scenario" versus "purchase order" permission split in S-PL-01.

**Counterexample.** S-K-08.

**Runtime consequence.** Wave B may host a solver. The solver must not be a silent writer of work orders.

## L-K-09. Fiscal and payroll legal checkers are external Effects

**Kind.** candidate law  
**Decision.** supported

Authorization, PVA acceptance, and eSocial receipts are observations from an external authority. Local minting, signing, and layout emission are Actions or Functions that can finish unknown. Official codes and layouts are dated model data.

**Evidence.** E-012, E-013, E-014, E-015, E-022, sibling CL-003, CL-005, CL-009, CL-012.

**Counterexample.** S-K-09.

**Runtime consequence.** Do not put CFOP, S-1200, or PVA into the generic engine. Emitters may compile them.

## L-K-10. Certified software may constrain the management system without becoming the ontology

**Kind.** candidate law  
**Decision.** hypothesis

PAF-ECF requisito I forbids a second set of books. That is an integration and certification duty on whatever system holds accounting numbers. It does not require a FiscalKernel sort. It does require one semantic authority.

**Evidence.** E-013, A-FOR-01, A-AGAINST-01.

**Counterexample.** S-K-10.

**Runtime consequence.** If a physical POS emitter exists, it must read the same Facts the books use.

## L-K-11. Decimal money is a value type, not a kernel

**Kind.** candidate law  
**Decision.** supported

Statutory amounts use exact decimal or integer minor units. Rounding is a named operation. Binary float is illegal for money. That is issue 62. It is not reopened as a primitive here.

**Evidence.** E-016.

**Counterexample.** S-K-11.

**Runtime consequence.** A specialized numeric evaluator is allowed. `MoneyKernel` is not a sort.

## L-K-12. Physical specialization is allowed when it cannot become a second authority

**Kind.** candidate law  
**Decision.** hypothesis

A specialized store, layer walker, solver, signer, or official validator is allowed if it meets the tests in `boundary.md`. Failure of those tests is a semantic kernel and is rejected.

**Evidence.** E-004, E-005, E-008, E-014, A-FOR-01 through A-FOR-04, A-AGAINST-05.

**Counterexample.** S-K-12.

**Runtime consequence.** Wave B recommendations wait for this test, not for a product shortlist.

## Rejected claims

**R-K-01. Accounting, inventory, MRP, or fiscal require a semantic kernel primitive.**  
Decision. `rejected`. Evidence E-001, E-005, E-007, A-AGAINST-02.

**R-K-02. FIFO, LIFO, or average belong in the generic engine.**  
Decision. `rejected`. Evidence E-007, sibling inventory.

**R-K-03. CFOP, CST, chave de acesso, or eSocial event codes are engine primitives.**  
Decision. `rejected`. Evidence E-022, sibling fiscal.

**R-K-04. A solver may be the semantic authority for supply.**  
Decision. `rejected` as a law. L-K-08 remains `hypothesis` as the positive alternative.

**R-K-05. One naive interpreter is proved sufficient for production posting, replay, search, and filing.**  
Decision. `rejected`. That claim was never a thesis law. The physical-for cards kill it.

**R-K-06. This folder answers open question 9.**  
Decision. `rejected` as a move. The class split is supported. The primitive word stays with the open question.
