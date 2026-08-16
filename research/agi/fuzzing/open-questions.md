---
issue: 51
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. None of these writes an answer into `docs/open-questions.md`. If a later agent needs a stance, cite a file in this folder or leave the item `undetermined`.

## Q1. What is the exact bind set for an approval?

`docs/open-questions.md` item 4 asks whether approval binds parameters, ontology revision, policy revision, and assumptions. L-FUZ-10 says a boolean flag is too weak. It does not list the bind set.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 4. L-FUZ-10. S-FUZ-18. Seed S-003.

## Q2. How is unknown represented after an external timeout?

`docs/open-questions.md` item 5 asks whether Effect is a primitive. This folder only requires that timeout must not become failed, and that D-12 emit `ExternalUnknown`.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 5. S-FUZ-19. L-FUZ-03.

## Q3. Must every fact carry valid time and known time?

`docs/open-questions.md` item 7. D-02 requires both times on generated `Occur` and `Observe` steps so the attack is possible. That is a method choice. It is not a metamodel decision.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 7. L-FUZ-05. S-FUZ-03.

## Q4. Where may nondeterminism exist in generation?

`docs/open-questions.md` item 10. An agent may propose scenarios and type disagreements. Promotion to `supported` stays a human gate per induction L-IND-07. Whether an agent may ever write `supported` is the same as issue 50 Q1.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 10. E15. S-FUZ-23.

## Q5. How should contradictory claims become operational state?

`docs/open-questions.md` item 3. S-FUZ-20 keeps three observations. It does not pick a winner rule.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 3. E13. L-FUZ-11.

## Q6. How does ontology evolution pin historical actions?

`docs/open-questions.md` item 19. D-14 and S-FUZ-21 require a pin in the research schema. Content-addressed versus version number is untested.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 19. L-FUZ-13. Seed S-012.

## Q7. How much ontology evolution can AGI perform?

`docs/open-questions.md` item 20. This folder supplies an attack loop, not a measured self-evolution pipeline.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 20. Issue 50 Q2. L-FUZ-12.

## Q8. Are Hypothesis choice sequences the right shrink representation?

L-FUZ-04 needs validity-preserving shrink. The concrete byte string is a convenience from one library.

**Decision state.** `undetermined`  
**Cite.** E4. L-FUZ-04.

## Q9. Can metamorphic relations replace historian work?

Issue 50 Q8 asked this for induction. Generated backdates can mimic late documents. They cannot invent the production bug that forced a field to exist.

**Decision state.** `undetermined`  
**Cite.** Issue 50 open-questions Q8. S-PROGRAM "inspect historical fixes." S-TESTS missing.

## Q10. Does messy real-company data change the dimension list?

No corpus is in-repo. Issue 77 remains the place for that attack.

**Decision state.** `undetermined`  
**Cite.** S-MESSY. S-ISSUE-77. Induction L-IND-10.

## Q11. Is D-15 a real dimension or only interleaving of the others?

Adversarial agent behavior in this folder is stale tools, double submit, and revocation. Those are D-04, D-11, and D-12 with a software actor. A distinct primitive was not earned.

**Decision state.** `hypothesis` that D-15 is a combinator. `undetermined` as a forever split  
**Cite.** S-FUZ-23. L-FUZ-10. S-OQ item 11.

## Q12. What would close issue 51?

A later run that executes `generate` against this schema on one fragment, reports M3, M4, and M7, shrinks a failure without changing the law id, and lands a typed question on a domain card. This folder is the method, not that measurement.

**Decision state.** `undetermined`  
**Cite.** L-FUZ-12. E16.

## Questions this folder refuses

The twenty-three items in `docs/open-questions.md` stay as that file left them. This folder cites items 3, 4, 5, 7, 10, 11, 19, and 20 as context. It does not fill them.
