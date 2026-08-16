# Adversarial review — issue #46 cross-ontology verification

**Date:** 2026-08-16  
**Status:** pre-merge self-review.

## R-V46-01 — registry coverage is inventory, not verification coverage

The registry's `370 scenarios / 163 laws` result proves that reviewed research inputs are discoverable and traceable. It does **not** mean 370 scenarios or 163 laws have executable evidence.

The matrix must keep at least these states distinct:

```text
designed
executable-reference
property-tested
backend-tested
bounded-model-checked
SMT-checked
differentially-tested
production-monitored
```

A percentage such as `90% covered` is meaningless unless the verification class and risk are stated.

## R-V46-02 — the first CI exposed a checker false negative

Run `31929652520` failed because the README said:

```text
does **not** mean verified
```

while the checker searched the raw Markdown string `does not mean verified`.

The correction belongs in the checker: normalize presentation markup before checking epistemic guard text. A safety checker that is sensitive to Markdown emphasis creates noise and trains maintainers to weaken guards.

## R-V46-03 — the second review found a more dangerous green-CI hole

The initial `test_harness.py` defined several Hypothesis properties as module-level `def test_*` functions while CI used:

```text
python -m unittest discover
```

`unittest` does not discover module-level test functions. A run could therefore be green while silently skipping most declared properties.

Correction:

- property tests are now `unittest.TestCase` methods;
- `check_research.py` rejects future module-level `def test_*` definitions in the harness while unittest discovery is the selected runner.

This is a verifier-of-the-verifier invariant, not cosmetic test organization.

## R-V46-04 — property-based tests are sampled evidence, not exhaustive proof

Hypothesis generates and shrinks many examples/traces, but a green run does not enumerate the whole state space.

Use it for:

- metamorphic invariants;
- sequence bugs;
- boundary values;
- shrinking/minimal witnesses.

Do not use its example count as a probability-of-correctness metric.

## R-V46-05 — generated seeded traces and Hypothesis are two different mechanisms

`harness.py` includes deterministic seeded generation so a failing trace can be reproduced independently of Hypothesis internals. Hypothesis adds adaptive generation and shrinking.

Keep both:

```text
seeded deterministic regression/replay
!=
property-based search/shrinking engine
```

When a meaningful new failure is found, promote the minimized trace into `regressions/known-counterexamples.json` rather than relying forever on a framework seed/database.

## R-V46-06 — the explicit model checker currently proves bounded safety only

`modelcheck.py` explores a small local-commit/external-effect protocol and checks state safety such as:

- one EffectRequest per semantic local operation;
- no duplicate remote effect under the safe model;
- indeterminate non-idempotent effect has no blind-retry transition;
- cancellation does not erase a remote effect;
- hidden success can be reconciled.

It does **not** currently prove:

- liveness;
- fairness;
- eventual reconciliation;
- arbitrary queue/network behavior;
- multiple concurrent effects/operations;
- unbounded histories.

The BFS merges identical states reached by different traces. That is sound for the current state-based safety predicates, but can be wrong for path-sensitive temporal properties. Do not add liveness claims to this checker without changing the model/logic.

## R-V46-07 — model-checker sensitivity is mandatory

A checker that only returns green can be vacuous. The deliberately unsafe configuration:

```text
provider_idempotent = false
allow_blind_indeterminate_retry = true
```

must yield a concrete duplicate-effect witness.

This mutation/sensitivity pattern should be extended whenever important enforcement is added: remove/relax one critical rule and ensure a known counterexample becomes reachable.

## R-V46-08 — current Z3 checks prove a bounded policy algebra, not the authorization subsystem

The initial SMT model establishes small properties inside its axioms:

- transitive scope subset cannot exceed root scope;
- transitive tenant equality does not cross tenant;
- numeric child bounds do not exceed root bounds;
- an explicit SoD independence constraint excludes same-principal approval.

It also produces SAT witnesses when scope/SoD constraints are intentionally removed.

This is useful solver/sensitivity evidence, but it is still close to proving the algebra we encoded. It does **not** prove that a future Cedar/OpenFGA/custom PDP adapter, entity projection, Grant lifecycle, currentness rule or commit integration implements those axioms.

#42/#70 must evolve L4 models toward the actual candidate decision relation before SMT evidence can approve an authorization backend architecture.

## R-V46-09 — formal-spec correctness and implementation conformance are independent

Even a perfect TLA+/Alloy/Z3 model proves the model, not production code.

High-risk laws therefore need a chain such as:

```text
semantic law
 -> formal/bounded model
 -> executable reference model
 -> backend/integration test
 -> deployed invariant/monitor where needed
```

No single rung substitutes for all others.

## R-V46-10 — PostgreSQL 18 integration is valuable but narrow

The CI reruns the reviewed #39 PostgreSQL 18 experiment on a real backend. That currently covers a narrow set:

- `REPEATABLE READ` write-skew counterexample;
- `SERIALIZABLE` protection in the tested aggregate case;
- temporal exclusion constraint;
- semantic-operation marker atomicity;
- binding history;
- snapshot observation without fabricated Event.

It does not validate the unresolved storage falsifiers such as ontology physical mapping, hot contention, PITR after external effects, multi-region behavior, erasure/backups or projection rebuild.

## R-V46-11 — reference-model reruns prevent isolated verifier drift, but they remain models

Cross-ontology CI reruns #40/#41/#43 reference-model tests so #46 cannot silently diverge from the reviewed semantics it claims to verify.

This catches semantic-contract drift. It still does not make those toy/reference models the implementation.

## R-V46-12 — known counterexamples need provenance and permanence

A useful regression fixture records at minimum:

```text
property/law
source scenarios
minimal operations/input
observed violation
executable test/model reference
```

Do not turn counterexample files into a manually copied scenario catalog. Source scenario IDs remain canonical in the original research artifacts; #46 stores only promoted minimal failures plus links.

## R-V46-13 — toolchain drift is a verification risk

A verification gate can change behavior when solver/property-testing libraries change. The CI therefore pins the currently tested toolchain:

```text
Hypothesis 6.165.9
z3-solver 4.16.0.0
```

Upgrades should be explicit reviewed changes with the full sensitivity suite rerun.

The PostgreSQL driver remains a compatibility-range dependency because the backend experiment targets PostgreSQL semantics rather than psycopg internals; this can be tightened later if driver behavior becomes evidence-bearing.

## R-V46-14 — differential ERP testing is a semantic oracle, not truth by majority vote

ERPNext/Odoo/Moqui/SAP-like behavior can expose missing concepts and edge cases. Agreement among mature systems is strong evidence of domain pressure, not a theorem that their shared behavior is universally correct.

Differential failures should become research questions such as:

```text
Is this divergence industry-specific?
jurisdiction-specific?
implementation debt?
a true semantic distinction we missed?
```

## R-V46-15 — coverage metrics can create perverse incentives

Do not reward number of tests, generated examples or formalized laws by itself. A weak test attached to every scenario is worse than an explicit `designed/unexecuted` status because it creates false confidence.

Coverage should emphasize risk-weighted evidence depth and counterexample sensitivity.

## R-V46-16 — production/shadow monitoring is a separate verification layer

Some assumptions depend on integrations, deployment configuration, external authorities and future code. They cannot be discharged entirely pre-deployment.

Examples:

- no operation ID is observed with two intent digests;
- no high-risk commit consumed stale derived state as current authority;
- no delegated grant exceeds its effective parent bounds;
- no projection claims a freshness watermark it has not consumed;
- no confirmed external outcome is silently erased after restore.

These monitors detect reality/model divergence; they are not substitutes for prevention.

## R-V46-17 — the verification architecture must remain metamodel-neutral

#46 verifies claims. It must not make `Scenario`, `Proof`, `Workflow`, `Fact`, `Event`, or one formal notation into ontology primitives by implementation convenience.

The eventual metamodel can expose verification metadata/tooling without importing the verifier's internal object model into business semantics.

## Pre-merge verdict

The verification architecture survives red-team with two concrete self-corrections already made:

1. Markdown-normalization fixed a false-negative structural guard;
2. unittest-discovery validation fixed a potentially **false-green** property-test gate.

The strongest justified claim is now:

> reviewed semantic research has one machine-discoverable falsification corpus; critical cross-family safety properties have executable/property/backend/bounded-formal evidence, and the remaining evidence debt is explicit.

The following stronger claims remain rejected:

```text
all 370 scenarios are verified
all 163 laws are proved
Z3 proves the authorization system
bounded BFS proves eventual success/liveness
PostgreSQL is selected because its experiment passed
passing CI proves the final ontology/runtime
```

Final `review-clean` status still requires the corrected/pinned CI head to pass all semantic-verification and PostgreSQL 18 jobs.
