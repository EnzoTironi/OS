# W1-03 validation

## Current state

- Unit: `W1-03`
- Pull request: `#625`
- Branch: `codex/w1-03-rust-recovery`
- Exact head: `6683cdcf47af02464a01aa021b34977f450da5d2`
- Component verdict: `VERIFIED`
- Canonical journey verdict: `NOT_EVALUATED`
- Program state: `proof_pending`
- State: the production runtime substrate was squash-merged after independent Shipping PASS and green required CI; issue `#626` remains open for its literal J6/J8 acceptance
- Squash merge: `4e33c57151ec8e3e28ee4c43a894da63173febc0` at `2026-09-03T17:02:36Z`
- Parent of recovery: `c9779377` (main at rebuild)

No verdict from superseded PR `#617` or earlier recovery heads is inherited.

## Exact-head component evidence

- Independent focused effect-runtime journey at `665e2b8575bd7404bb8f3d9e6233661b3670c5b6`: PASS
- Assertions: 44/44
- Artifact SHA-256: `206e2cb17cd24c9f916e5892e49c9ef7c04951b6ac15f4a9298829ccf2b07469`
- Worktree: `/workspace/w103-effect-runtime-665e`
- Follow-up commits on the landed tip (`710ed2da`, `6683cdcf`) only harden e2e runner process-group ownership so concurrent cleanup reaps zoend/auth children; they do not change the Rust ZoenEffect production handler behaviour proven at `665e2b8`

Fresh evidence on `main@db4708b29c2f0a57296b2208768011f14763ed24` is GitHub Actions run `33871776340`: `effect-runtime`, `one-fly-image`, and `required` all passed. Its effect-runtime log binds one `EffectRequest` through dispatch, Restate invocation, attempt claim, provider operation, and immutable result, and proves that a persisted invocation resumes after Restate restart with one provider request.

## Independent review

Independent Shipping review returned PASS on the Rust recovery head before land. Scope covered fail-closed Rust handler and registrar, production Fly wiring, bounded connector I/O, credential/grant revalidation, and isolated real journey coverage for J6/J8.

## Remote evidence

- GitHub checks on `6683cdcf47af02464a01aa021b34977f450da5d2`: `e2e-concurrent` PASS, `required` PASS, full verify e2e matrix PASS, CodeQL/coverage/Sonar PASS
- PR state: squash-merged from the box

## Canonical acceptance still pending

The runtime evidence does not complete either named journey. On the audited main source:

- no `AutomationDefinition` or `ExecutorCall` type, API, or table exists, so the J6 path cannot create the required two ExecutorCall records;
- effect execution owns `EffectRequest`, attempt, dispatch, and reconciliation state, but it has no verified conversation-origin delivery ledger;
- the one-Fly image journey proves boot, registration/readiness failure, and restart convergence, but it does not execute the two-reminder J6 path;
- the full proofs are deliberately sequenced through W6-01 (generic automation), W6-02 (production Restate execution), W6-03 (origin-bound delivery), W6-04 (two-reminder proof), and W8-01/W8-02 (final production recovery and shared-artifact proof).

Accordingly, the real `effect-runtime` artifact reports `canonicalJourneyVerdict: "NOT_EVALUATED"` and marks J6/J8 as `SUBSTRATE_ONLY`. A green runtime scenario must not be used to close `#626` before those downstream ceremonies pass on the same production-shaped artifact.

## Notes

- Live WhatsApp personal inbox remains banned; Kapso sandbox only
