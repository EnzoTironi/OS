# W1-01 worker brief

## Mission

Implement governed definition publication on branch `codex/w1-01-governed-publish` in worktree `/tmp/zoen-wt-w1-01`, based on `origin/main` at `d530f622141149f564a22e2f03051c34690426f4`.

Read these first.

- `/home/box/code/OS/AGENTS.md`
- `/home/box/code/OS/orchestrate/zoen-final/reports/w1-01-architecture.md`
- `/home/box/code/OS/orchestrate/zoen-final/reports/w0-synthesis.md`, pilot section
- `/home/box/code/OS/.agents/skills/poteto-mode/SKILL.md`
- `/home/box/code/OS/.agents/skills/typescript-best-practices/SKILL.md`

The architecture report is frozen. Implement it as one coherent pre-launch change. Do not add a compatibility surface.

## Required shape

- Keep the one public operation at `DefinitionEngine::publish`.
- Split private content admission from a governed `AdmittedDefinitionPublication`.
- Derive `zoen.definition.publish` and the candidate definition resource inside the engine.
- Check delegation and `PolicyOperation::PublishDefinition` before any store call.
- Treat missing candidate policy as fail-closed. No fallback.
- Construct `DefinitionPublished` v2 only after permit.
- Make `AuthorityStore::publish` accept only the sealed publication. Delete the raw context plus content-only shape.
- Return a first-class `DefinitionPublication` with revision, actor, principal, workload, server time, and exact `PolicyEvidence`.
- Replace the Connect publish response atomically with the publication aggregate. Regenerate checked-in Connect output mechanically.
- Keep pack installation on the same governed engine path. No privileged bypass.
- Add migration 0026 with immutable forced-RLS publication and delegation-grant rows, exact foreign keys, and a deferred invariant that rejects a new ungoverned definition revision.
- Exact replay must authorize current caller first, return the original durable aggregate, and create no rows.
- Do not add a replay cache.

## Journey

Extend `e2e/definition-publication.ts`. Do not add unit tests, mocks, fakes, stubs, or `vi.mock`.

Prove all of these through Connect and Postgres.

1. Builder allow.
2. Same-World observer Cedar deny.
3. Delegation deny.
4. Missing candidate policy.
5. Tenant substitution deny.
6. Every denial leaves commit, revision, publication, grants, outbox, and head unchanged.
7. Authorized identical replay returns the original revision and policy evidence with no new rows.
8. A caller denied after the original commit cannot replay it successfully.
9. Outbox failure rolls back every publication artifact and head movement.
10. Restart returns the exact original publication and evidence.
11. Existing canonicalization, RLS, immutability, and publish-does-not-activate assertions remain true.

Update every live journey that publishes so it declares Publish delegation and candidate policy explicitly.

## Throughput checkpoint

After the first allow/deny slice, inspect the fixture edits. If a second same-shaped digest-policy edit is needed, stop and build a deterministic policy fixture generator or checker. Do not hand-edit a fleet of digest-bearing manifests.

## Constraints

- No Redis or Rivet.
- No boot-policy fallback or second policy source.
- No schema alias, dual read, dual write, backfill, or applied-migration rewrite.
- No `unwrap`, linter bypass, or weakened lint.
- No unrelated cleanup.
- Preserve user files outside this worktree.
- Do not merge, deploy, close, retarget, or force-push.
- Commit only this unit. Push the branch and open a PR against `main` after all required checks pass.

## Verification

Run from `/tmp/zoen-wt-w1-01`.

```text
just e2e definition-publication
just verify
git diff --check origin/main...HEAD
```

Inspect the generated journey artifact. Confirm its `sourceCommit` is the final commit. If a verification command changes generated files, commit the intended artifacts and rerun the affected check on the final SHA.

## Required report

Report branch, final SHA, PR URL and number, exact commands and exit status, journey artifact path, files changed by subsystem, database invariants, throughput-checkpoint outcome, deviations, and residual risks. A compiler-only result is not a verdict.
