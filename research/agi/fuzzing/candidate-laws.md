---
issue: 51
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate fuzzing laws

Smallest claims about the attack method. Each law names a falsifier. Decision state is never `accepted`.

These are protocol laws. They are not RFC-0001 edits and not answers to `docs/open-questions.md`.

## L-FUZ-01. A happy path is setup, not evidence

**Claim.** A scenario that only completes the intended flow does not support a candidate law. Support requires an attack that could have broken the law and did not, or an attack that did break it.

**Kind.** candidate law  
**Evidence.** E1. Constitution rule 13. S-SCEN principles.  
**Decision state.** `supported`

**Falsifier.** A domain whose only production failures are already visible on the happy path, so adversarial generation never adds a distinction.

**Runtime consequence.** Do not score a fragment by green happy tests. Score it by M3 and M4.

## L-FUZ-02. A source system is a differential oracle, not the semantics

**Claim.** ERPNext, Odoo, Moqui, and peers are comparable programs in McKeeman's sense. A difference is a candidate question. Majority behavior is not a domain law.

**Kind.** candidate law  
**Evidence.** E7, E9, E10. Constitution rule 2 and rule 4. Issue 51 body.  
**Decision state.** `supported`

**Falsifier.** A first-party argument that one mature ERP is already the correct ontology for a distinction, including after independent formal models disagree.

**Runtime consequence.** `oracle.kind = differential` cannot move a law to `supported`.

## L-FUZ-03. Attempt, occurrence, and observation are different steps

**Claim.** A generator that has only one "post document" step cannot attack stale approval, timeout, or contradictory claims.

**Kind.** candidate law  
**Evidence.** E13, E14. Constitution rules 8 and 9. Seed S-003, S-004, S-011. RFC-0001 Action versus Event, read only.  
**Decision state.** `supported` as a method split. `undetermined` as OS primitives

**Falsifier.** A fragment that answers S-003, S-004, and S-011 with a single step kind and no hidden extra fields.

**Runtime consequence.** The research schema keeps `Attempt`, `Occur`, and `Observe`. Wave B must not collapse them to one write API just to make a fuzzer easy.

## L-FUZ-04. Shrink must stay inside the generator

**Claim.** Editing a dumped timeline, or shrinking by type, can change the failing law. Internal reduction on the choice sequence is the default. External `ddmin` is allowed only after re-validation.

**Kind.** candidate law  
**Evidence.** E3, E4, E5.  
**Decision state.** `supported` for the validity requirement. `hypothesis` that Hypothesis-style choice sequences are the representation

**Falsifier.** A measured run where type-based shrink of business scenarios never changes the failing law id, including even-like constraints such as "only reserved lots."

**Runtime consequence.** Do not check in minimized YAML that the generator could not have emitted.

## L-FUZ-05. When a single expected value is missing, use a relation

**Claim.** Backdating, valuation, and tax often have no unique correct number. The oracle is a metamorphic relation or a competency question.

**Kind.** candidate law  
**Evidence.** E6, E8. Seed S-007. Sibling L-INV-08.  
**Decision state.** `supported`

**Falsifier.** A complete expected-value oracle for late receipts that does not name valuation method, freeze, and known-then versus believed-then, yet still matches two independent families.

**Runtime consequence.** Generators attach `metamorphic` and `competency` oracles by default on D-02, D-07, D-08.

## L-FUZ-06. Coverage is distinctions and questions, not statements

**Claim.** M3, M4, and M7 are the scores that can shrink the design space. Statement coverage and raw case count cannot.

**Kind.** candidate law  
**Evidence.** E8, E16. Gruninger on lookup-only questions. McKeeman on shallow random strings.  
**Decision state.** `supported`

**Falsifier.** A fragment that passes M1 and M2 at 100 percent and later needs a new primitive the attacks never touched.

**Runtime consequence.** A Wave B fuzzer that reports only "N cases ran" has failed this issue's metric.

## L-FUZ-07. Cancellation after consequences is compensate or refuse, not delete

**Claim.** Independent families keep history and add a reversal, a return, or a block. They do not erase the original occurrence.

**Kind.** candidate law  
**Evidence.** E9, E10. Seed S-010. Sibling S-O2C-07. ValueFlows correcting events in o2c notes.  
**Decision state.** `supported` as "not delete." `hypothesis` as one preferred encoding

**Falsifier.** A lawful production system that deletes posted fulfillment and still answers audit and valuation.

**Runtime consequence.** D-03 generators must emit the blocked-cancel case, not only the happy cancel.

## L-FUZ-08. Rights, custody, and location are independent generator axes

**Claim.** A quantity with one party field cannot express consignment, loan, or FOB-in-transit. ValueFlows already names three actions.

**Kind.** candidate law  
**Evidence.** E11. Sibling L-INV-01, L-INV-13.  
**Decision state.** `supported`

**Falsifier.** A mature domain where owner, custodian, and place are always the same party and place, including documented VMI.

**Runtime consequence.** D-05 is pairwise-combined with D-01 and D-06 by default.

## L-FUZ-09. Duplicate messages are not duplicate occurrences

**Claim.** Reorder and retry are observation problems. Occurrence identity is not message identity.

**Kind.** candidate law  
**Evidence.** E6 as the relation "drop the second copy, quantity unchanged." Sibling S-INV-07. Seed future-family "duplicate external events."  
**Decision state.** `hypothesis`

**Falsifier.** A domain where every inbound payload is a new economic event and reconciliation is unnecessary.

**Runtime consequence.** D-04 steps carry `idempotency` when the source is external.

## L-FUZ-10. Approval binds a world, not a button

**Claim.** An approval that does not pin parameters, assumed facts, and definition revision is stale by construction. Commit must re-read.

**Kind.** candidate law  
**Evidence.** E14. Seed S-003. `docs/open-questions.md` item 4, cited not answered.  
**Decision state.** `hypothesis` as the exact bind set. `supported` that a boolean approved flag is too weak

**Falsifier.** A production approval flow that never revalidates and never mis-executes after intervening receipts.

**Runtime consequence.** D-11 and D-14 are one pairwise cell. Adversarial agents are the interleaving, not a new primitive. D-15.

## L-FUZ-11. A fuzz failure becomes a typed question or it is discarded

**Claim.** The output of a failing case is a research question with a contradiction type. It is not a closed issue comment and not an edit to `docs/open-questions.md`.

**Kind.** candidate law  
**Evidence.** E15. Induction L-IND-06 and L-IND-07. Standing orders 3 and 8.  
**Decision state.** `supported`

**Falsifier.** A measured process where untyped "X != Y" comments produce better later laws than typed cards.

**Runtime consequence.** [dsl.md](dsl.md) `failure.question` is required on `failed`.

## L-FUZ-12. This folder is not a fuzzer and not a runtime

**Claim.** Issue 51 asked for methodology. Implementing a generator, picking an engine, or designing OS syntax would violate standing order 7 and the issue's own "not necessarily engine syntax" clause.

**Kind.** candidate law  
**Evidence.** E16. S-ISSUE-51.  
**Decision state.** `supported` as a negative claim

**Falsifier.** A later project decision that Wave A should have shipped executable tools. That decision does not exist in this folder.

**Runtime consequence.** Wave B may implement `generate` against this schema. It may not treat this schema as the language.

## L-FUZ-13. Ontology revision is an attack dimension, not a migration script

**Claim.** A historical action must remain explainable under the revision that ran. Generators that only mutate current types miss S-012 and S-M01.

**Kind.** candidate law  
**Evidence.** Seed S-012. Manufacturing S-M01. `docs/open-questions.md` item 19, cited not answered.  
**Decision state.** `hypothesis`

**Falsifier.** An audit practice that always replays under current rules and is accepted as historical explanation by two independent families.

**Runtime consequence.** D-14 steps are `ReviseOntology` plus a later competency question, not a schema-migration tool pick.
