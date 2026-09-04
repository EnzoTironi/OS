# W2-04 validation

## Current state

- Unit: `W2-04`
- Pull request: `#678`
- Branch: `coder/w2-04-world-release-activate`
- Exact reviewed head: `eb33b4162f061cdcee3858e164a9f834d54fd50d`
- Verdict: `journey-verified`
- State: squash-merged after green required CI (full e2e matrix + one-fly-image + required)
- Squash merge: `13395c50f2c4aa458497f01bb2350f49883a37e4` at `2026-09-04T05:04:46Z`

## Exact-head journey evidence

- Journey: `e2e/world-release` (J1 governed release) on exact PR tip
- Assertions: 94/94 PASS
- Artifact: `orchestrate/zoen-final/reports/artifacts/w2-04-world-release.json`
- SHA-256: `b57a940d32d7343d9bf03375bdf42be3e5415b1607ae9c87e7b299d0483f064c`
- `sourceCommit`: `eb33b4162f061cdcee3858e164a9f834d54fd50d`
- Dimensions: actors, path, negative, replay, isolation, recovery — including preview, owner Decide approve/reject, activate-without-approve denial, stale/wrong preview fail-closed, crash/retry single active pointer

## Independent review

Independent Shipping review PASS on exact tip before land. Scope: content-addressed WorldRelease activation preview; owner Decide; atomic activate gated on matching approving Decide for same World + release + preview.

## Remote evidence

- Product PR `#678` squash-merged to `13395c50f2c4aa458497f01bb2350f49883a37e4` by EnzoTironi
- Required CI green on tip (clippy/build/check/e2e matrix/one-fly-image/Sonar/CodeQL/PR Lens)
- Tracker: issue `#633` closed; newly unblocked and labeled `ready-for-agent`: `#634` W2-05, `#635` W2-06, `#636` W2-07, `#637` W2-08, `#639` W3-01

## Honest remaining gaps

Belong to later units; do not reopen W2-04:

- Seven public verbs on one governed catalog → `W2-05`
- Sealed cursors + FIN-05 → `W2-06`
- Release-owned BudgetClass → `W2-07`
- ObjectKey / TypeAssignment + FIN-01 → `W2-08`
- Identity storage alignment → `W3-01`
