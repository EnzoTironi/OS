# Journey runtime

`./e2e/run.sh prepare` is the single-writer build phase. After it succeeds,
`./e2e/run.sh run <scenario>` treats dependencies, generated sources, `dist/`,
and Cargo outputs as immutable inputs. `./e2e/run.sh parallel` admits only
weight-one-through-four live entries through a weighted pool capped at four;
weight-zero static journeys remain directly selectable but are never scheduled.
Fiscal realm generators are
materialized under `dist/e2e/realms` during preparation; runners never execute
tracked source or compile TypeScript.

The reader/writer authority lives below Git's common directory, so all linked
worktrees coordinate through the same registry. A source-only Node shim records
a reader before any compiled module or dependency is loaded. Root suite readers
may sponsor nested suite and journey readers while a writer is pending; an
active writer admits none. A journey atomically transfers its reader to a port
lease, and aggregation keeps its suite reader through immutable publication.
Only the active writer can publish `prepared.json`, and it invalidates the old
manifest before changing build outputs.
The manifest binds the clean Git HEAD to the complete regular-file sets in
`dist/` and `apps/auth/dist/` and to the bytes plus normalized executable bit
of the four journey launchables in `target/debug`. The source shim rehashes
that exact set before loading compiled code and again before scenario effects;
any post-prepare mutation requires a new prepare. `CARGO_TARGET_DIR` overrides
are rejected so build, manifest, and runners cannot disagree about launchables.

Every run leases a deterministic port block from a registry shared by all Git
worktrees. Before publishing the lease, the allocator binds every localhost
port in the candidate block and skips externally occupied blocks. It holds those
probe sockets until the lease is published; the shared lease closes races among
journeys, while an unrelated process can still race after the probes are
released and will produce a normal startup failure rather than being killed.
Its context owns the Compose project, generated files, logs, process
metadata, volumes, networks, and evidence root. Cleanup checks the lease token
and Docker labels before removing anything, then releases the port lease last.
Incomplete slot claims are never published as numeric leases. Interrupted
reaping and release transitions retain the complete lease and reserve their
slot. The registry lock chooses one reclaimable cleaner, then process and Docker
teardown runs outside the global lock so unrelated allocations continue.
Cleanup writes an owned receipt before removing the transition; repeating the
same cleanup converges without touching a sibling run.
Every lifecycle command reconstructs paths, ports, host names, and Compose
project from the physical shared-registry lease. Context paths never choose a
cleanup root; non-canonical files, symlinked run ancestors, or slot/transition
names that disagree with lease ownership fail closed.

An attempt pointer is an atomic, monotonic reference to the newest allocated
attempt. Aggregation does not trust that reference as a completion signal: it
selects the greatest completed attempt in the logical run and publishes all
scenario evidence as one immutable `artifacts/generations/*` directory. A
single atomic `artifacts/current.json` switch makes that generation visible to
the verification gates, so readers cannot observe a mixed suite.
The allocator serializes only the same canonical
worktree/suite/scenario/run identifier, so a retry cannot overlap its prior
attempt while intentionally identical IDs in another worktree remain isolated.

Credential-backed fiscal scenarios are outside the general pool. Their
allocation is exclusive across the shared registry: it succeeds only when no
other run is active, and a live exclusive lease prevents new general runs.
Weight four therefore consumes the entire bounded pool as well as the shared
lease authority; cancellation reconciles every admitted context before the pool
releases its suite reader.

The scripts under `apps/*/scripts/prove*.sh` are separate, manual product proofs
and are not entries in `e2e/scenarios.json`. Some still use explicit
production-style ports and must run serially. They reject existing listeners
and never adopt or kill their processes; migrating those proofs into the
journey runtime belongs with their later product-journey replacement.

`JourneyRunContext.httpNames` is the Portless integration seam. The runtime is
correct without Portless because `portless@0.15.6` requires Node 24 while CI
uses Node 22, and Portless does not reserve native ports. A future opt-in adapter
must retain the shared lease as authority, own only its exact run-derived
aliases, and must not use `--force` or automatic `portless prune`.
