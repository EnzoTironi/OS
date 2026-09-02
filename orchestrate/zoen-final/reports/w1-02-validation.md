# W1-02 validation

## Current state

- Unit: `w1-02-supervised-projection`
- Pull request: `#609`
- Branch: `codex/w1-02-supervised-projection`
- Exact head: `5bff33bfe9d8c1f623867eeff61b277b19c127f6`
- Exact tree: `5a8dbd5fb49adab1395fd9a4124d1b95732cf1fe`
- Verdict: `journey-verified`
- State: merged after the recoverable pre-launch Fly replacement and exact-head gate passed
- Squash merge: `cf504cbf68a6956b199b9c8c8a5c2417b322586a` at `2026-09-02T14:52:39Z`
- Merge tree: byte-for-byte equivalent to the verified PR head
- Deployment: automatic main workflow in progress

No verdict from the earlier `6d2e287` head is inherited.

## Exact-head journey evidence

- Independent `just e2e-run semantic-query`: PASS
- Semantic-query assertions: 37/37
- Semantic-query failure injections: 35/35
- Artifact: `artifacts/semantic-query/semantic-query.json`
- Artifact SHA-256: `d5d3ab954562b4675fbcc46f7de72dfd3b9c8616ff64e60003dab38b73af03e0`
- Artifact provenance: `sourceCommit` equals the exact head
- Focused evolution journeys: 56/56 assertions and 26/26 failure injections PASS
- Full `just verify`: PASS with all 15 registered live scenario artifacts
- Post-run cleanup: zero journey containers and no listener on the Better Auth port
- `git diff --check`: PASS on a clean worktree

## Independent review

An independent exact-head standards review reran the semantic-query journey and inspected its artifact. A separate release-path audit traced Cargo target declaration, Docker build/copy, launcher behavior, Supervisor policy, least-privilege role creation, and Fly configuration. Both returned PASS with no remaining code blocker.

The audit identified one operational prerequisite rather than a code defect: PostgreSQL init scripts create `zoen_projection` only on empty `PGDATA`. The current pre-launch Fly volume therefore must be replaced before the automatic deployment, and `ZOEN_PROJECTION_PASSWORD` must be staged first.

## Release image evidence

The exact head built locally from `deploy/fly/Dockerfile` as `zoen-pr609:5bff33b`.

- Image manifest: `sha256:8245cd204bf174d40673ca30a198c2c5ee5b5c7c8750c688952184fcbda6e531`
- Platform: `linux/arm64`
- Unpacked size: 1,129,272,210 bytes
- Required binaries and launcher: executable
- `zoen-projection --help`: PASS
- Dynamic linkage: no missing library
- Supervisor projection program, restart, and TERM policy: present

A disposable full-image boot then proved:

- PostgreSQL, `zoend`, and `projection` reach `RUNNING`
- `/ready` succeeds
- SQLx migrations advance through version 27
- `zoen_projection` is login-enabled, not superuser, and cannot bypass RLS
- the worker retains only `ZOEN_PROJECTION_DATABASE_URL` among database credentials
- ambient app, auth, Postgres, projection bootstrap, and `PG*` credentials are absent from the worker process
- terminating the worker with SIGTERM causes Supervisor to restart it with a new PID
- the disposable container and volume are removed without residue

## Remote evidence

- GitHub checks: 26/26 PASS on the exact head
- PR state: open, non-draft, mergeable, and `CLEAN`
- Review decision: no changes requested
- Reviews: 0
- Review comments: 0
- Review threads: 0 total, 0 unresolved

## Fly diagnosis and merge rule

The current Fly machine runs the previous `f121cef` image, but `zoend` and the dispatcher are `FATAL`. The database has two pre-launch `definition_revisions` and migrations only through version 25. Migration 26 intentionally rejects that disposable legacy state, so no process listens on port 58701. Reusing the same volume would also skip PostgreSQL init and fail to create the projection role.

Before merge, the coordinator stopped the only machine cleanly, created snapshot `vs_YD4aLGoLNgRsBGK5XRMAq1O` with 60-day retention, materialized recovery volume `vol_rkgkj3ozngoko6w4`, destroyed the old machine and disposable volume, created empty `zoen_data` volume `vol_vjygw27ldmgo7xov` in `gru`, and staged a generated `ZOEN_PROJECTION_PASSWORD` without deploying. The exact verified head was then squash-merged with GitHub's head guard, and the merge tree was confirmed byte-for-byte equal to the verified head.

The automatic main deployment must still be watched to completion and the live Supervisor, role boundary, worker environment, watermark, and `/ready` state reverified.
