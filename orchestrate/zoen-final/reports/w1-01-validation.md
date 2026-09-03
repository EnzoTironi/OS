# W1-01 validation

## Current state

- Unit: `w1-01-governed-publish`
- Pull request: `#602`
- Branch: `codex/w1-01-governed-publish`
- Exact head: `6e6eddf3fa326cc1d30182ac5a53a6031d4c6409`
- State: merged after exact-head proof was recorded as `live-ui-verified`
- Merge blocker: none
- Squash merge: `f121cef13e5bb9f8d702eaf15ec87607ae64d7d4` at `2026-09-02T10:48:53Z`
- Merge tree: byte-for-byte equivalent to the verified PR head

No verdict from an earlier head is inherited.

## Exact-head local evidence

- `./e2e/run.sh verify`: PASS
- Scenario artifacts: 15
- True assertions: 514
- Artifact provenance: one unique `sourceCommit`, equal to the exact head
- `./e2e/run.sh verify-v1`: PASS, 8/8 verification mutants killed, digest `2180101fe2e4281da6722c32ef07fc32d93b935ad41b109190a4de89615f04f1`
- `./e2e/run.sh verify-activation`: PASS, 8/8 verification mutants killed, digest `92f2d3ad378e896288a4f5b18fdfbc166363dd56f32dfa3cbd668ae678d195d5`
- Poisoned `PATH`, `GIT_DIR`, and `GIT_WORK_TREE` probe: PASS
- Abbreviated candidate and evidence probes: rejected fail closed
- `git diff --check`, TypeScript build and lint, Rust format, compile, lint, and migration startup: PASS

## Independent review

The independent verifier found that the first migration protected publication grant rows from update and delete but still allowed a post-commit insert at a fresh ordinal. The head was invalidated before merge.

The fix stores the admitted nonzero grant count on the immutable publication row. Deferred constraints on both parent and child inserts require the final grant ordinals to be exactly `0..grant_count-1`. Update, delete, and truncate remain sealed. The live `definition-publication` journey forges a fresh post-commit ordinal and proves that the statement rolls back without changing publication state.

The verifier reviewed the corrected database design and the complete `main...HEAD` diff. It returned PASS for the exact head with no remaining actionable correctness, security, or isolation finding.

## Remote evidence

- GitHub checks: 26/26 PASS on the exact head
- Pre-merge PR state: open, mergeable, and `CLEAN`
- Sonar quality gate: PASS
- Sonar new-code issues: 0
- Sonar duplicated new lines: 1.2 percent
- Codecov patch coverage: 91.21 percent against a 16.33 percent target, exact-head check PASS
- Review threads: 0 unresolved
- CodeRabbit selected the three files in the final delta but reported that the next included review becomes available after its hourly limit resets. It produced no actionable comment. The pilot therefore removed vendor quota from the merge predicate while preserving every actual bot finding as mandatory review input.

The validation command completed its live journeys, exact-SHA evidence checks, CI wait, and review-thread check. Its original final predicate then misread Codecov's `:x:` missing-lines icon as a failed gate even though the exact-head Codecov check was successful. The lever now reads the exact-head `codecov/patch` conclusion and still fails closed when that check is absent or unsuccessful. The corrected predicate and all remaining final-state checks pass.

## Merge rule

Record `live-ui-verified` for this exact SHA only after all current-head checks are green, zero review threads remain open, every actionable review comment is settled, and the independent verifier returns PASS. Only then may the coordinator merge `#602`.

The coordinator recorded the ledger row first, merged with GitHub's exact-head guard, then fetched `main` and verified that the squash commit tree is identical to the verified PR head.
