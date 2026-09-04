# W2-04 repair validation

## Verdict

- Unit: `W2-04`
- Pull request: `#688`
- Branch: `codex/w2-04-release-authority-lock`
- Exact reviewed head: `28b5e72ddf114ee5a7c38b0f0688b882eaf1dff2`
- Verdict: `journey-verified`
- Squash merge: `6fae261e475576d2ec858ead6082bd985487f837` at `2026-09-04T13:48:39Z`

## Repaired authority boundary

The release store issues an opaque, move-only authorization bound to the exact operation, World, release, optional preview, Membership, principal, actor, workload, delegation snapshot, and candidate Cedar evidence. Publication, preview, decision, or activation consumes it once and commits the mutation with an immutable authority-ledger row. First activation locks a stable row for the World before reading its active-release pointer.

The journey provisions separate invited Builder and Owner Memberships with disjoint delegations. Identity identifiers use 128 bits of system entropy after a concurrent journey reproduced a clock-only primary-key collision.

## Exact-head evidence

- Workspace Clippy with `-D warnings`: PASS
- `cargo check`: PASS
- TypeScript build and lint: PASS
- `world-release`: 132/132 PASS with artifact `sourceCommit` equal to the exact reviewed head
- `agent-parity`: 18/18 PASS
- `governed-clinic`: 27/27 PASS
- `wasm-code-mode`: 16/16 PASS
- `messaging-boundary`: 28/28 PASS after reproducing and repairing the identity collision
- `activation-identity`: 27/27 PASS
- `commercial-identity`: 7/7 PASS

J1 covers distinct actors, the production-shaped path, Cedar and delegation denials, revoked-token replay, cross-World isolation, recovery through a fresh authorized Membership, immutable persisted evidence, and a concurrent first-activation race without a pre-created lock row. Exactly one activation wins and a stale candidate cannot overwrite it.

## Independent and remote evidence

Two independent Shipping reviews passed, including one on exact head `28b5e72ddf114ee5a7c38b0f0688b882eaf1dff2`, with no blocking findings. Every required GitHub check passed on that head, including workspace build/check/Clippy, the full journey matrix, concurrent journeys, one-Fly image construction, CodeQL, Sonar, and the required aggregate. GitHub closed issue #633 when PR #688 squash-merged.

## Remaining scope

The seven governed public verbs and literal multi-surface parity belong to W2-05 and later units. They do not weaken the completed W2-04 release-authority contract.
