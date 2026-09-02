# W1-H1 Idempotent parallel journey runtime

## Outcome

Make a journey execution the unit of ownership. Two runs of the same scenario, including runs from different Git worktrees on the same Docker daemon, must coexist without killing, cleaning, reading, or overwriting each other. Keep check and build as one preparation phase, then fan out the lightweight runtime stacks with bounded concurrency.

## Base and sequencing

- Stack this unit on the final W1-02 tree because W1-02 changes `e2e/ba-door.ts` and its environment boundary.
- Land after W1-02 and before W1-03/W1-04 integration and their full-suite verification.
- Do not merge W1-03 or W1-04 deploy topology through this branch.
- Credential-backed fiscal journeys remain exclusive until their external providers expose a run-isolated sandbox and an idempotency contract.

## Architecture decision

Implement a required `JourneyRunContext` backed by an atomic run lease and a deterministic port-block lease. Do not select a free port and release it before use. Do not use `fuser`, `pkill`, `killall`, or a Compose project derived only from the scenario.

The selected design is the smallest safe step from the current host-runner topology. Kernel-assigned ports and endpoint handshakes remain a future implementation behind the same context, because adopting them now would require simultaneous lifecycle changes in every native starter.

The context owns:

- `suiteId`, `runId`, attempt, source SHA, and build identity
- a unique Compose project and labels
- a run root containing generated files, logs, process metadata, and the immutable artifact
- assigned PostgreSQL, zoend, Better Auth, MinIO, Restate, connector, worker, and adapter ports
- a random owner token used by cleanup and stale-run reconciliation

## Required changes

1. Create one scenario registry consumed by the local runner, full-suite runner, and CI matrix. Remove duplicated scenario lists.
2. Split execution into `prepare` and `run`. Preparation installs, generates, checks, and builds once. A run may only read `node_modules`, `gen`, `proto`, `dist`, and the Cargo target.
3. Allocate a unique run context before loading scenario endpoints. Use an atomic shared lease registry that coordinates all Git worktrees of this repository.
4. Derive the Compose project, artifacts, generated files, logs, and process metadata from the run context.
5. Make Better Auth's listen port and zoend's Auth upstream configurable. Return the actual origin from `startAuthDoor`; pass the door to signup helpers; remove the global port killer.
6. Make every scenario helper use the context's Compose project. Centralize manual Compose command construction.
7. Keep one PostgreSQL cluster per run. Share image layers and immutable build output, never databases, volumes, or roles.
8. Replace MinIO clients on host networking with one-shot jobs on the isolated Compose network.
9. Publish artifacts with temp-file plus atomic rename. Aggregate only one explicitly complete suite whose artifacts share the expected source SHA and build identity.
10. Run live scenarios through a weighted pool, initially capped at four. Zero-weight scenarios may overlap; Postgres-only costs one; Postgres plus MinIO or Restate costs two. Credential journeys remain exclusive.
11. Cleanup must be safe when called twice and must validate ownership before signaling a process group or removing a Compose project. Release the port lease last.
12. Keep production's normal Better Auth port explicit in Fly configuration; the harness must have no static-port fallback.

## Proof journey

Add a real concurrent harness journey, not a unit test or mock:

1. Prepare once.
2. Start two `definition-publication` runs concurrently with separate IDs and hold a barrier after Compose and Auth are ready.
3. Assert different projects, port slots, Auth origins, run roots, volumes, and artifact paths.
4. Terminate one run after readiness and prove the sibling remains healthy and completes.
5. Retry the terminated run with the same ID and prove stale ownership is reconciled without manual cleanup.
6. Repeat two instances of `semantic-query` concurrently.
7. Prove the same pair succeeds from two worktrees against the same Docker daemon.
8. Run four distinct Better Auth journeys concurrently.
9. Call cleanup twice and assert no owned containers, volumes, networks, listeners, or run processes remain. A labeled sentinel Compose project must remain untouched.
10. Run the bounded parallel full suite and aggregate only its complete evidence root.

## Acceptance gates

- No journey path contains a global process killer or scenario-only Compose cleanup.
- Same-scenario, cross-scenario, and cross-worktree concurrency proofs pass.
- A killed run cannot interrupt its sibling and can be retried with the same run ID.
- Runners perform no build or dependency writes during fanout.
- Artifacts are immutable, per run, atomic, and tied to one SHA/build identity.
- Aggregation rejects incomplete, partial, mixed-SHA, or mixed-build suites.
- Existing serial journey semantics and verification bundles remain equivalent.
- `npm run check`, `npm run lint:ts`, `cargo fmt --check`, `cargo clippy`, and `git diff --check` pass.

## Guardrails

- Add no unit tests, mocks, fakes, stubs, or `vi.mock`.
- Do not make product operations artificially idempotent to compensate for a leaking harness.
- Do not share mutable Postgres, Restate, MinIO, Auth, generated, artifact, or process state across runs.
- Do not hide collisions behind retries without ownership evidence.
- Do not parallelize live external-provider effects until their isolation is proven.
