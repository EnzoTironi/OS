# W2-01 validation

## Current state

- Unit: `W2-01`
- Pull request: `#673`
- Branch: `feat/w2-01-world-release`
- Exact reviewed head: `630dddd948d8f1a7b2da553d54fb3b4e7526fee1`
- Verdict: `journey-verified`
- State: squash-merged after green required CI
- Squash merge: `fce9bc524b8c54b388968a12e0b918ff2f5d6fe5` at `2026-09-03T22:30:02Z`

## Exact-head journey evidence

Local world-release artifact retained from the W2-01 worktree:

- Assertions: 41/41 PASS
- Artifact: `orchestrate/zoen-final/reports/artifacts/w2-01-world-release.json`
- SHA-256: `33beee0011611ef4d13c49e857014d396b7854458377a7812ba5e7de7588a159`
- Artifact `sourceCommit` field: `a1ece9dc9384bbfebe9dec705a8d46009f4ee4b7` (pre-tip base used for the local run)
- Dimensions recorded: actors, path, negative, replay, isolation, recovery

Honesty note: the retained local artifact names `a1ece9dc…` as `sourceCommit`, not the final PR tip `630dddd…`. Required GitHub checks on PR `#673` / tip `630dddd…` were green before squash-merge. Later W2-02..W2-04 journeys extend the same `e2e/world-release` surface on their exact tips.

## Independent review

Independent Shipping review PASS on the PR tip before land (squash-merge by EnzoTironi after CI green). Scope: private WorldRelease content types, domain-tagged RFC 8785 JCS `ReleaseDigest`, caller-supplied digest rejection.

## Remote evidence

- Product PR `#673` squash-merged to `fce9bc524b8c54b388968a12e0b918ff2f5d6fe5`
- Tracker: issue `#630` closed

## Honest remaining gaps

Belong to later units; do not reopen W2-01:

- Catalog blob persistence → `W2-02`
- Cedar PolicyCatalog as authority → `W2-03`
- Preview / Decide / activate gate → `W2-04`
- Seven public verbs on one catalog → `W2-05`
