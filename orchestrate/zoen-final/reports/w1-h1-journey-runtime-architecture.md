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
