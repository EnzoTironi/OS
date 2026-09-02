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
- Deployment: automatic main workflow and live Fly verification PASS

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
- PR state: squash-merged with the exact-head guard
- Review decision: no changes requested
- Reviews: 0
- Review comments: 0
- Review threads: 0 total, 0 unresolved

## Live Fly evidence

The automatic `main` workflow run `33644910132` completed successfully in 30m44s for the exact squash merge `cf504cbf68a6956b199b9c8c8a5c2417b322586a`.

- Fly release: version 78, release `rel_ljg928dwlok0z43o`
- Machine: `d8944e1c736908`, started in `gru`, host healthy, with no restart event
- Image tag: `registry.fly.io/zoen:cf504cbf68a6956b199b9c8c8a5c2417b322586a`
- Image digest: `sha256:2906efbda8ae6431e497cebaf6a6505a868677c3af13d6cc10fee6ccad904e86`
- Active volume: fresh `vol_vjygw27ldmgo7xov` mounted at `/data`
- Recovery volume: `vol_rkgkj3ozngoko6w4` remains encrypted, healthy, unattached, and retained for 60 days
- Fly service check: PASS with `ready`
- `https://zoen.fly.dev/ready`: HTTP 200 with `ready`
- `https://zoen.tironi.xyz/ready`: HTTP 200 with `ready`
- Long-running Supervisor programs: auth, dispatcher, Eve, MinIO, PostgreSQL, projection, remint, Restate, and zoend all `RUNNING`
- One-shot Supervisor programs: agent binding, MinIO bucket creation, and personal lake all exited with status 0 as expected
- SQLx migrations: 27 total, maximum version 27, zero failed migrations
- Projection role: login enabled, not superuser, and cannot bypass RLS
- Projection grants: SELECT only on the six source/projection tables, column-scoped INSERT on manifests and watermarks, and column-scoped UPDATE only on watermark fields
- Live PostgreSQL activity includes connections owned by `zoen_projection`
- Projection process retains `ZOEN_PROJECTION_DATABASE_URL`; every forbidden ambient application, auth, Postgres, bootstrap, and libpq credential is absent
- Projection state: one manifest and one watermark through commit 4
- Heartbeat proof: the watermark timestamp advanced from `1788362906306230` to `1788362916316933` while the authority head remained unchanged
- `ZOEN_PROJECTION_PASSWORD` is deployed as a Fly secret; only its name and deployment status were inspected

## Pre-deploy Fly diagnosis and recovery

The replaced Fly machine ran the previous `f121cef` image, where `zoend` and the dispatcher were `FATAL`. Its database had two pre-launch `definition_revisions` and migrations only through version 25. Migration 26 intentionally rejected that disposable legacy state, so no process listened on port 58701. Reusing the same volume would also have skipped PostgreSQL init and failed to create the projection role.

Before merge, the coordinator stopped the only machine cleanly, created snapshot `vs_YD4aLGoLNgRsBGK5XRMAq1O` with 60-day retention, materialized recovery volume `vol_rkgkj3ozngoko6w4`, destroyed the old machine and disposable volume, created empty `zoen_data` volume `vol_vjygw27ldmgo7xov` in `gru`, and staged a generated `ZOEN_PROJECTION_PASSWORD` without deploying. The exact verified head was then squash-merged with GitHub's head guard, and the merge tree was confirmed byte-for-byte equal to the verified head. The automatic deployment and all required live release checks subsequently passed; the recovery volume remains available and must not be removed as part of this unit.
