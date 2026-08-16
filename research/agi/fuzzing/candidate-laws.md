---
issue: 51
kind: explanation
fetched: 2026-08-16
decision_state: hypothesis
---

# Candidate fuzzing laws

These are claims about the **research method**, not OS primitives. A review correction can narrow a law without erasing the original attack that motivated it.

## L-FUZ-01 — Happy paths are necessary but insufficient evidence

**Decision:** `supported` in this limited form.

A happy path demonstrates basic representability/compatibility. It does not establish robustness or a universal semantic law. Strong support requires adversarial cases capable of falsifying the candidate distinction.

## L-FUZ-02 — Source systems are differential oracles, not semantic authorities

**Decision:** `supported`.

ERPNext, Odoo, Moqui and peers can disagree because of domain differences, product history, version, implementation accident or naming. Differential output produces a question; majority behavior does not automatically produce a law.

## L-FUZ-03 — Attempt, occurrence and observation must remain separable in attack generation

**Decision:** `supported` as research-method pressure; OS encoding `undetermined`.

A generator that conflates `tried`, `happened`, and `source said it happened` cannot test stale approvals, ambiguous external outcomes, duplicate messages or contradictory evidence.

## L-FUZ-04 — Shrink must preserve validity and the same semantic failure

**Decision:** `supported`.

The reducer must regenerate or otherwise validate a candidate so it remains a legal scenario and fails the **same semantic predicate**. A replayable choice stream is the current reference implementation, not a universal representation requirement. AST/solver/property-based shrinkers are equally valid if they preserve these properties.

## L-FUZ-05 — Prefer exact oracles when the problem is fully specified; use relations/competency oracles when it is not

**Decision:** `supported`.

Tax, valuation and scheduling often have exact deterministic answers **after** method, facts, jurisdiction/rule revision and boundary conditions are specified. Metamorphic/competency oracles are appropriate when an attack deliberately varies those assumptions, admits several legal solutions, or tests a relational/historical property rather than one scalar result.

## L-FUZ-06 — Coverage should measure semantic pressure, not only case/statement count

**Decision:** `supported` as methodology.

Useful coverage dimensions include candidate distinctions exercised, counterexamples attempted, cross-domain combinations, competency questions answered and failure classes reached. Raw number of generated examples is not enough.

## L-FUZ-07 — Authoritative committed occurrences require governed correction semantics

**Decision:** `supported` in scope; encoding `hypothesis`.

For authoritative committed/posting/fulfillment occurrences whose history matters, correction should preserve the fact that the original occurrence was recorded/recognized when applicable—through reversal, compensating occurrence, correction record or a legally governed replacement. This is **not** a universal no-delete rule for drafts, caches, privacy-governed data or disposable observations.

## L-FUZ-08 — Rights, custody and location are independent attack axes when the domain allows them to diverge

**Decision:** `supported` as a required adversarial family.

Consignment, loan, goods in transit and third-party logistics demonstrate cases where ownership/right, custody and place differ. The generator should not force them into one party/location field.

## L-FUZ-09 — Message identity is not automatically occurrence identity

**Decision:** `supported` as integration pressure.

Retries, reordering and duplicate delivery can produce several observations/messages about one occurrence. A generator must be able to represent that case without double-applying the economic/operational occurrence.

## L-FUZ-10 — Approval binds an explicit proposal and state/temporal basis

**Decision:** `supported` that a bare sticky boolean is too weak; exact bind set `hypothesis`.

Approval should identify what was approved: parameters/intent plus the state or temporal assumptions the decision contract depends on. Commit validates against that declared basis. Some decisions require **live-at-commit** revalidation; others legitimately bind a **frozen snapshot** while still checking non-waivable current constraints. `Always reread current world` is therefore not a universal law.

## L-FUZ-11 — A fuzz failure must become a typed, falsifiable research question

**Decision:** `supported` as process discipline.

`implementation A != implementation B` is not enough. Minimized failures should say what distinction failed, whether the discrepancy is source/version artifact, domain ambiguity, authority/temporal issue or candidate-model insufficiency, and what evidence would resolve it.

## L-FUZ-12 — Reusable executable generators belong in the research toolchain, not the OS runtime

**Decision:** `supported`.

Issue #51 explicitly asks for reusable generators. [`generator.py`](generator.py) and [`test_generator.py`](test_generator.py) now provide a small executable reference. That does **not** make the fuzz DSL an OS language or select a runtime engine.

The generator is allowed to be real software because AGI-era research should make semantic hypotheses executable and falsifiable. The boundary is semantic: research tooling must not silently become the production metamodel.

## L-FUZ-13 — Ontology revision is an adversarial dimension

**Decision:** `hypothesis`, with strong pressure from historical explainability.

A decision/event performed under revision R must remain explainable after revision R+1. The generator should test revision identity, migration/reinterpretation and historical audit without assuming that replaying old executable code is the only implementation.

## Current executable coverage

The reference generator implements:

- D-01 partial quantities
- D-02 late/backdated evidence
- D-04 duplicate/reordered observations
- D-10 concurrent decisions
- D-11 stale approval with explicit state basis
- D-12 ambiguous external outcome
- D-13 contradictory observations
- D-14 ontology revision

Other recipes remain specified in `dimensions.md` and can be implemented as the acceptance suite grows.
