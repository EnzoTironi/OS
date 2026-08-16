---
issue: 50
kind: reference
fetched: 2026-08-16
decision_state: undetermined
---

# Open questions

Residual uncertainty after this pass. None of these writes an answer into `docs/open-questions.md`. If a later agent needs a stance, cite a file in this folder or leave the item `undetermined`.

## Q1. Can induction replace a human ontologist?

First-party ontology-learning papers treat tools as support for an engineer. Huang et al. show intrinsic self-correction without external feedback can degrade reasoning. No independent first-party source in this session agrees that a human ontologist can leave.

**Decision state.** `undetermined`  
**Cite.** E2, E8. L-IND-07. Standing order after push.

## Q2. How much ontology evolution can AGI perform?

`docs/open-questions.md` item 20 asks this. This folder only supplies a protocol hypothesis and a thin benchmark. It does not measure safe proposal of new types, actions, or invariants.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 20. L-IND-04. L-IND-09.

## Q3. Where may nondeterminism exist in the research loop?

`docs/open-questions.md` item 10 asks what an agent may propose versus commit. For induction, proposal is the ontologist card. Commit is promotion to `supported`. Whether an agent may ever write `supported` without a human is the same as Q1.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 10. [protocol.md](protocol.md) phase 10.

## Q4. Is Reservation a commitment, a relator, or a stock figure?

Sibling inventory L-INV-04 leaves this open. ValueFlows has no reserved quantity. ERPNext and Odoo materialize one. This protocol can keep the disagreement typed. It cannot close it.

**Decision state.** `undetermined`  
**Cite.** E9. S-OQ item 12. `research/domain/inventory/candidate-laws.md` on `origin/cursor/issue-18-domain-cfd8`.

## Q5. Does OS need native Kind, Role, Phase, or Relator sorts?

Sibling party and identity notes leave this to issue 3. Supplier and customer behaving as roles is not an answer to the metamodel question.

**Decision state.** `undetermined`  
**Cite.** S-OQ items 2 and 12. E13. `research/identity-kinds-roles/` on `origin/cursor/issue-3-foundation-cfd8`.

## Q6. Which manufacturing distinctions are universal?

`docs/open-questions.md` item 14. This folder only shows that a protocol must keep specification, authorization, and execution apart, and must treat Work Order as a homonym.

**Decision state.** `undetermined`  
**Cite.** S-OQ item 14. E10, E11, E12. `research/domain/manufacturing/` on `origin/cursor/issue-19-domain-cfd8`.

## Q7. What evidence threshold should promote a law?

The protocol uses two families, one attack, typed disagreement, license pass, and a human gate. That threshold is a `hypothesis`. No measured precision or recall exists.

**Decision state.** `undetermined`  
**Cite.** [protocol.md](protocol.md) phase 10. L-IND-03.

## Q8. Can generated counterexamples replace historian work?

Issue 50 asks for tests, migrations, and issues. This session did not clone vendor trees. Whether synthetic scenarios can stand in for historical fixes is untested.

**Decision state.** `undetermined`  
**Cite.** Benchmark historian cells. S-PROGRAM "inspect historical fixes."

## Q9. Does messy real-company data falsify the three benchmark splits?

Issue 77 is the place for that attack. No corpus is in-repo.

**Decision state.** `undetermined`  
**Cite.** E15. L-IND-10. https://github.com/EnzoTironi/OS/issues/77

## Q10. Is debate worth its cost against self-consistency?

Huang et al. found no gain at equal response count on their reasoning tasks. Du et al. reported gains on theirs. Enterprise induction was in neither paper.

**Decision state.** `undetermined`  
**Cite.** E6. L-IND-05.

## Q11. What would close issue 50?

A later run that executes the eleven phases on a concept not already mined by siblings, with historian pointers, a messy-data attack or an explicit blocked-needs-data waiver, and a measured comparison against a summarizer baseline on homonym detection.

**Decision state.** `undetermined`  
**Cite.** L-IND-09.

## Questions this folder refuses

The twenty-three items in `docs/open-questions.md` stay as that file left them. This folder cites items 2, 10, 12, 14, and 20 as context. It does not fill them.
