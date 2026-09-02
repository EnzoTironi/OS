# W1-H1 journey runtime architecture

## Decision

Isolate by execution, not by scenario. The selected implementation adds a run namespace plus an atomic lease for a deterministic block of ports. Preparation remains single-writer; runtime stacks fan out with bounded concurrency.

The current harness is only repeatable in series. Its per-scenario Compose projects, ports, artifacts, and generated directories collide when the same scenario runs twice. More importantly, thirteen runtime journeys share Better Auth on `127.0.0.1:58704`, and `e2e/ba-door.ts` kills any existing owner with `fuser -k`. That caused a real W1-02 verification failure when another task ran an Auth-backed journey concurrently.

## Alternatives considered

### A. Run namespace plus port-block lease

Create a `JourneyRunContext` before a scenario loads. An atomic registry shared by all worktrees leases a slot for the entire process lifetime. Stable offsets within the slot assign every host endpoint. Compose, files, process groups, and evidence use the run ID and an owner token. A stale owner can be reconciled; a live owner is never touched.

This preserves the existing host-based TypeScript and Rust runners and can land independently of the larger runtime units.

### B. Kernel-assigned endpoints and runtime discovery

Publish Docker ports dynamically, bind native services to port zero, and make every process report its endpoint through a structured readiness handshake. This removes the port pool, but it also requires every runner and native starter to stop calculating URLs during module load.

This is the cleaner endpoint mechanism long term. It is not the first move because it would combine a broad lifecycle rewrite with W1-02, W1-03, and W1-04 integration. The selected `JourneyRunContext` keeps this migration possible without changing callers again.

## Portless 0.15.6

Portless is useful above the run context, not below it. It gives HTTP services stable `.localhost` names and adds a worktree prefix. It does not reserve ports: its allocator probes a port, closes the socket, and starts the child afterward. Its route lock protects route metadata rather than the port. It also does not isolate PostgreSQL, Compose projects, databases, volumes, generated files, or artifacts.

The local installation was updated from 0.15.1 to the current 0.15.6 package published from verified upstream commit `713f84dec04b5328c02ffc62d1937b27a80fbc5f`. The W1-H1 integration may expose names such as `auth.<run-id>.zoen.localhost` after the run owns the underlying port. It must not use `--force`; it must not run `portless prune` automatically because a reused stale port could identify the wrong process; and it must remove only the run's exact aliases during idempotent cleanup.

Portless 0.15.6 requires Node 24, while repository CI currently pins Node 22. Therefore the first isolation slice must remain correct without Portless. A pinned adapter can become a suite feature when its runtime is provisioned explicitly, without changing the `JourneyRunContext` contract.

## Ownership model

```text
suiteId
└── scenario
    └── runId / attempt
        ├── context.json
        ├── generated/
        ├── logs/
        └── artifact.json
```

The run context owns its Compose project, process group, port lease, writable directories, database cluster, and durable service volumes. Build outputs, package caches, and image layers are immutable inputs and may be shared.

Cleanup validates the owner token, signals only the recorded process group, removes only the exact Compose project, and releases the port slot last. Repeating cleanup converges to the same empty owned state.

## Concurrency contract

`prepare` is a single-writer phase for dependency installation, generation, lint, compilation, and build. `run` is read-only with respect to build outputs. A weighted pool initially admits four units of local work: host-only scenarios cost zero, PostgreSQL-only stacks cost one, and stacks with MinIO or Restate cost two. Credential-backed effects remain exclusive.

The full proof is specified in `briefs/w1-h1-idempotent-journeys.md`. It includes simultaneous same-scenario runs, cross-worktree runs, failure isolation, same-ID retry, double cleanup, and suite aggregation bound to one source SHA and build identity.
