# Journey runtime

`./e2e/run.sh prepare` is the single-writer build phase. After it succeeds,
`./e2e/run.sh run <scenario>` treats dependencies, generated sources, `dist/`,
and Cargo outputs as immutable inputs. `./e2e/run.sh parallel` admits the live
registry through a weighted pool capped at four by default.

Every run leases a deterministic port block from a registry shared by all Git
worktrees. Its context owns the Compose project, generated files, logs, process
metadata, volumes, networks, and evidence root. Cleanup checks the lease token
and Docker labels before removing anything, then releases the port lease last.
Incomplete slot claims are never published as numeric leases. Interrupted
reaping and release transitions retain the complete lease and are resumed under
the allocator lock.

An attempt pointer is an atomic, monotonic reference to the newest allocated
attempt. Aggregation does not trust that reference as a completion signal: it
selects the greatest completed attempt in the logical run and publishes all
scenario evidence as one immutable `artifacts/generations/*` directory. A
single atomic `artifacts/current.json` switch makes that generation visible to
the verification gates, so readers cannot observe a mixed suite.

Credential-backed fiscal scenarios are outside the general pool. Their
allocation is exclusive across the shared registry: it succeeds only when no
other run is active, and a live exclusive lease prevents new general runs.

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
