# W1-02 Supervised projection

## Goal

Ship `zoen-projection` inside the one-Fly product as a continuously supervised, least-privilege projection worker. Establish the health contract that W1-06 can consume without changing `/ready` in this unit.

## Base and ownership

- Product base: `main` squash commit `f121cef13e5bb9f8d702eaf15ec87607ae64d7d4`. Its tree is identical to the W1-01 verified head `6e6eddf3fa326cc1d30182ac5a53a6031d4c6409`.
- Branch: `codex/w1-02-supervised-projection`.
- Worktree: `/Users/enzotironi/Codex/zoen-w1-02-projection`.
- W1-02 owns projection runtime, the projection database role, its launcher and supervision, and the projection journey. W1-06 owns aggregate readiness. W1-07 owns the final image CI gate.

## Required design

1. `zoen-projection` opens only `ZOEN_PROJECTION_DATABASE_URL`. It does not run migrations and fails closed if stronger application credentials such as `DATABASE_URL` or `ZOEN_APP_PASSWORD` are present.
2. Replace the current write-only probe with an exact effective-capability check. Require `current_user` and `session_user` to be `zoen_projection`; deny superuser, create-role, create-db, replication, bypass-RLS, inherited-role escalation, role memberships, schema create, unrelated table access, sequence access, authority DML, manifest mutation, and forbidden watermark columns.
3. The allowed database surface is:
   - `SELECT`: `authority_heads`, `authority_commits`, `projection_outbox`, `semantic_claims`, `projection_manifests`, `projection_watermarks`.
   - `INSERT`: only the columns the worker writes in `projection_manifests` and `projection_watermarks`.
   - `UPDATE`: only `through_commit`, `manifest_digest`, and `updated_at` in `projection_watermarks`.
4. Keep migration `0021` immutable. Add `0027_projection_role_boundary.sql` as the idempotent current desired state: revoke broad historical and default grants, then grant only the allowlist. Make runtime grant reconciliation replay `0027`, never `0021`.
5. On empty Fly state, create `zoen_projection` as `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, with database connect and schema usage only. Require disposable development-volume recreation rather than a compatibility path.
6. Build, copy, launch, and supervise `zoen-projection`. The launcher constructs the loopback URL from `ZOEN_PROJECTION_PASSWORD`, removes stronger credentials before `exec`, waits boundedly for PostgreSQL, schema, and grants, and never waits on global `/ready`.
7. Continuous Wave 1 operation uses only canonical `ZOEN_TENANT_ID`. Explicit tenant arguments remain for `--once` and `--rebuild`; do not retain a second `ZOEN_PROJECTION_TENANTS` production configuration or invent a global tenant scan.
8. Refresh `projection_watermarks.updated_at` after every successful poll, including a caught-up no-op. A failed poll must not refresh it. Preserve the watermark as the projected cut.
9. Handle SIGINT and SIGTERM cleanly under Supervisor. Functional failures must be observable through stale watermark time for W1-06.

## Likely files

- `apps/zoend/src/bin/zoen-projection.rs`
- `crates/zoen-query/src/projection.rs`
- `crates/zoen-adapters/src/authority_store.rs`
- `crates/zoen-adapters/migrations/0027_projection_role_boundary.sql`
- `deploy/fly/init/001-roles.sh`
- `deploy/fly/zoen-start-projection`
- `deploy/fly/Dockerfile`
- `deploy/fly/supervisord.conf`
- `deploy/fly/fly.toml`
- `e2e/semantic-query.ts` and its fixture SQL/support
- Projection fixture parity in evolution journeys when required
- `README.md`

Do not edit `apps/zoend/src/main.rs`, aggregate `/ready`, or `.github/workflows/verify.yml` unless direct evidence proves the unit cannot be coherent without it. Do not mix W1-03 handler or W1-04 Eve cleanup into this branch.

## Journey acceptance

Extend the live `semantic-query` journey. It must prove:

- Continuous projection starts with only the projection credential, catches a new authority commit, and advances its watermark.
- A caught-up successful poll refreshes the heartbeat timestamp.
- Stopping the worker stops heartbeat progress; authority can advance while the watermark does not.
- Restart catches up without duplicate authority or business history and retains the exact role boundary.
- SIGTERM exits cleanly.
- `zoen_app`, ambient `DATABASE_URL`, ambient `ZOEN_APP_PASSWORD`, wrong password, missing grants, schema creation, sequences, unrelated reads, authority writes, manifest mutation, forbidden watermark mutation, delete, and truncate all fail closed without fallback.
- A failed projection attempt changes neither watermark cut nor heartbeat.
- Existing tenant isolation, idempotence, object-store failure, publication rollback, rebuild, and restart evidence remains green.

Remove local `#[cfg(test)]` modules from touched projection Rust files and move their behavioral proof into this journey. Add no unit tests, mocks, fakes, or stubs.

## Verification

- `just e2e semantic-query`
- `just e2e evolution-compatible`
- `just e2e evolution-breaking`
- `just verify`
- Local release Docker build plus executable/config inspection
- `git diff --check`
- Independent exact-head code review before ledger entry

The resulting PR must stay unmerged until the exact head has current CI, zero actionable review threads, a journey verdict in the ledger, and coordinator approval.
