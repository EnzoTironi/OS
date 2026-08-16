# Adversarial review — issue #46 cross-ontology verification

**Date:** 2026-08-16  
**Status:** `review-clean` after cross-ontology CI run `31931624253` passed both `semantic-verification` and `postgres18-integration`.

## R-V46-01 — registry coverage is inventory, not proof

The registry's `370 scenarios / 163 laws` proves reviewed inputs are machine-discoverable and traceable. It does **not** mean all 370 scenarios or 163 laws have executable/formal evidence.

Keep evidence states distinct:

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

A coverage percentage without evidence class and risk is misleading.

## R-V46-02 — the checker itself produced a false negative

The first CI run (`31929652520`) failed because the README contained `does **not** mean verified` while the checker searched raw Markdown for `does not mean verified`.

Correction: normalize Markdown emphasis in the checker. The guard remained intact; the verifier became less brittle.

## R-V46-03 — red-team found a potentially false-green unittest hole

The initial harness placed several Hypothesis properties at module level while CI used `unittest discover`, which does not discover module-level test functions.

Correction:

- all property/deterministic tests are now `unittest.TestCase` methods;
- `check_research.py` rejects future module-level `def test_*` definitions while unittest is the runner.

This is a verifier-of-the-verifier invariant.

## R-V46-04 — property testing is sampled evidence

Hypothesis is valuable for generated values, action sequences and shrinking. A green run is not exhaustive proof and example counts are not a probability-of-correctness metric.

The harness intentionally keeps deterministic seeded traces too. When a meaningful failure is found, its minimized trace should be promoted into `regressions/known-counterexamples.json` rather than depending forever on a framework seed/database.

## R-V46-05 — bounded BFS currently proves safety only

`modelcheck.py` exhausts a deliberately small local-commit/external-effect state space. It checks state-safety properties such as one EffectRequest per local semantic operation, no unsafe blind retry under the safe model, and preservation/reconciliation of remote outcome knowledge.

It does **not** prove:

```text
liveness
fairness
eventual reconciliation
unbounded histories
arbitrary network queues
multiple independent concurrent operations/effects
```

The explorer merges equal states reached through different traces. That is valid for the current state-based safety predicates, but can lose path information required for temporal/liveness properties. Do not extend its claims without extending the model/logic.

## R-V46-06 — model-checker sensitivity is part of the gate

The deliberately unsafe configuration:

```text
provider_idempotent = false
allow_blind_indeterminate_retry = true
```

must produce a duplicate-effect witness. A checker that only returns green is not trusted; critical rules should gain mutation/sensitivity cases where feasible.

## R-V46-07 — current Z3 evidence is bounded policy algebra, not the authorization subsystem

The SMT model establishes small properties under explicit axioms:

- delegated scope subset is transitively bounded;
- tenant equality remains transitive;
- numeric child bounds cannot exceed root bounds;
- explicit SoD independence excludes same-principal approval.

It also requires SAT witnesses when scope/SoD constraints are intentionally removed.

This is useful L4 evidence but remains close to the encoded algebra. It does **not** prove that a future Cedar/OpenFGA/custom PDP adapter, Grant lifecycle, entity projection, currentness rule or commit integration implements those axioms. #42/#70 must model the actual candidate decision relation before SMT can approve an authorization backend architecture.

## R-V46-08 — formal spec and implementation conformance are separate

A formal model proves the model, not production code. High-risk laws need the strongest justified chain, for example:

```text
semantic law
 -> bounded/formal model
 -> executable reference model
 -> real backend/integration test
 -> deployed invariant/monitor where needed
```

No rung substitutes for every other rung.

## R-V46-09 — PostgreSQL 18 evidence remains narrow

Cross-ontology CI reruns the reviewed #39 PostgreSQL 18 experiment against a real backend. It covers the tested write-skew/serializable case, exclusion constraint, operation marker atomicity, binding history and snapshot-without-fabricated-event behavior.

It does not close #39's unresolved ontology-layout, hot-contention, PITR-after-external-effect, multi-region, erasure/backup or projection-rebuild questions.

## R-V46-10 — reference models prevent drift but are still models

CI reruns reviewed #40/#41/#43 executable models. This prevents #46 from silently drifting away from the contracts it claims to verify. It does not make those reference models the production implementation.

## R-V46-11 — known counterexamples are permanent, provenance-bearing artifacts

A useful promoted regression retains:

```text
property/law
source scenario IDs
minimal operations/input
observed violation
executable test/model reference
```

The canonical scenario catalog remains in its originating research artifacts. #46 stores only promoted minimal failures plus links, avoiding a second manually copied truth.

## R-V46-12 — toolchain drift is evidence drift

The tested formal/property toolchain is pinned in CI:

```text
Hypothesis 6.165.9
z3-solver 4.16.0.0
```

Upgrades are explicit changes that must rerun sensitivity and backend gates. The PostgreSQL driver remains a compatibility-range dependency because current evidence targets database semantics rather than psycopg internals.

## R-V46-13 — differential ERP tests are oracles, not majority truth

ERPNext/Odoo/Moqui/REA/other mature systems can expose missing concepts and edge cases. Convergence is domain evidence, not a theorem. Divergence should become a research question about industry, jurisdiction, architecture debt or a missing semantic distinction.

## R-V46-14 — weak coverage metrics create false confidence

Do not reward number of tests, examples or formalized laws alone. A weak test attached to every scenario is worse than an explicit `designed/unexecuted` status.

Coverage should be risk-weighted and evidence-depth-aware, with counterexample sensitivity favored over vanity counts.

## R-V46-15 — production/shadow monitoring is a separate layer

Some assumptions depend on deployed integrations, external authorities, configuration and future code. Examples worth monitoring include operation-ID/intent collisions, stale-derived-state use at high-risk commits, grant escalation, false projection freshness and confirmed external outcomes disappearing after restore.

Monitoring detects reality/model divergence; it is not a substitute for prevention.

## R-V46-16 — verification architecture remains metamodel-neutral

#46 verifies claims. It does not earn `Scenario`, `Proof`, `Workflow`, `Fact`, `Event`, Hypothesis, Z3 or any formal notation as an ontology primitive.

## Final verdict

The architecture survives red-team, including two self-corrections that materially improved trust in the gate:

1. Markdown normalization fixed a checker false negative.
2. unittest discovery hardening fixed a potential false-green that could have skipped Hypothesis properties.

Run `31931624253` then passed:

```text
registry/checker
property + state-machine + regression tests
bounded commit/effect model checker
bounded Z3 authorization checks
reviewed #40/#41/#43 reference models
issue #46 index validation
real PostgreSQL 18 integration experiment
```

The strongest justified statement is:

> reviewed semantic research now has one machine-discoverable falsification corpus; selected critical cross-family safety properties have executable/property/backend/bounded-formal evidence, and remaining evidence debt is explicit.

Explicitly rejected overclaims:

```text
all 370 scenarios are verified
all 163 laws are proved
Z3 proves the authorization system
bounded BFS proves eventual success/liveness
PostgreSQL is selected because its experiment passed
passing CI proves the final ontology/runtime
```
