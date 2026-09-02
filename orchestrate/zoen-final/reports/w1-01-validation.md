# W1-01 validation

## Current state

- Unit: `w1-01-governed-publish`
- Pull request: `#602`
- Branch: `codex/w1-01-governed-publish`
- Exact head: `6e6eddf3fa326cc1d30182ac5a53a6031d4c6409`
- State: active, not yet recorded in the verification ledger
- Merge blockers: current-head CI completion and a CodeRabbit incremental review after its included-review limit resets

No verdict from an earlier head is inherited.

## Exact-head local evidence

- `./e2e/run.sh verify`: PASS
- Scenario artifacts: 15
- True assertions: 514
- Artifact provenance: one unique `sourceCommit`, equal to the exact head
- `./e2e/run.sh verify-v1`: PASS, 8/8 verification mutants killed, digest `3bf647fc763cadf6a4e8e14a8e5b0a46a0bf6a2d454ce9c30ad44514921efdcd`
- `./e2e/run.sh verify-activation`: PASS, 8/8 verification mutants killed, digest `17c3e46a054241ba2e669b6aaed6af050e8bc5c021b6c8770555cb9d46443081`
- Poisoned `PATH`, `GIT_DIR`, and `GIT_WORK_TREE` probe: PASS
- Abbreviated candidate and evidence probes: rejected fail closed
- `git diff --check`, TypeScript build and lint, Rust format, compile, lint, and migration startup: PASS

## Independent review

The independent verifier found that the first migration protected publication grant rows from update and delete but still allowed a post-commit insert at a fresh ordinal. The head was invalidated before merge.

The fix stores the admitted nonzero grant count on the immutable publication row. Deferred constraints on both parent and child inserts require the final grant ordinals to be exactly `0..grant_count-1`. Update, delete, and truncate remain sealed. The live `definition-publication` journey forges a fresh post-commit ordinal and proves that the statement rolls back without changing publication state.

The verifier reviewed the corrected database design and found no remaining semantic or transactional flaw. Its final merge-readiness verdict remains pending until current-head remote checks settle.

## Remote evidence

- Sonar quality gate: PASS
- Sonar new-code issues: 0
- Sonar duplicated new lines: 1.2 percent at the first current-head analysis
- Review threads before the current CodeRabbit run: 0 unresolved
- CodeRabbit selected the three files in the final delta but reported that the next included review becomes available after its hourly limit resets. This is recorded as a blocker, not treated as a review.

## Merge rule

Record `live-ui-verified` for this exact SHA only after all current-head checks are green, the incremental review completes without an actionable finding, zero review threads remain open, and the independent verifier returns PASS. Only then may the coordinator merge `#602`.
