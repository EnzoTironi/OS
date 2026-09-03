# Program working agreements

These rules apply to the 52-unit program in `program.json`.

- Zoen has exactly three products: Ontology, Eve, and Better Auth.
- Poke is the voice reference. Eve is the Conversation product.
- Ontology exposes exactly seven public verbs: `Discover`, `Query`, `Propose`, `Decide`, `Commit`, `Explain`, and `Execute`.
- A `WorldRelease` has exactly four catalogs: ontology, policy, executors, and components.
- One Fly application contains the initial production-shaped deployment.
- Restate provides durability only for `ZoenEffect`. Eve owns conversation durability.
- Do not add Redis, a fourth product, a fifth release catalog, or provider-specific public verbs.
- Pre-launch changes delete obsolete paths. Do not add compatibility aliases, dual reads, dual writes, or preservation work unless Enzo asks for them.
- Journeys drive the products. Do not add unit tests, mocks, fakes, stubs, or `vi.mock`.
- Use one writer per worktree. Give each worker its own branch and private Cargo `target`. Concurrent workers never share writable build state.
- Workers on all 52 units never rebase, merge, deploy, force-push, delete data, close pull requests, or retarget pull requests. They do not run Graphite (`gt`).
- The source handoff records a human gate for irreversible actions, production deploys, data deletion, force-pushes, and closing someone else's pull request.
- The source handoff also records Enzo's standing authorization for any merge and production deploy. Merge only a current ledger-verified SHA. Deploy only the exact production-shaped artifact that passed the release journeys.
- That standing authorization supersedes only the merge and deploy gates in the earlier orders. Workers still cannot merge or deploy. The coordinator or designated stacker may merge the verified SHA and deploy the exact verified artifact.
- The standing authorization does not authorize force-push, data deletion, or third-party messages. Force-push and data deletion still require a separate human gate.
- Resolve every actionable human and automated review comment before merge. Any review-driven commit invalidates the prior verdict.
- Every unit reports its branch, head SHA, exact commands, verdict, deviations, and follow-up risks.
- Use the `gh` CLI for GitHub work. Do not add repository-owned PR Cockpit or Graphite wiring.
- Do not revive PR 616 or its runtime design.
- Workers on all 52 units do not use Herdr, Cursor SDK, Portless, PR Cockpit, or Graphite.
- Use Kache for Rust commands when a unit runs Rust compilation.
- Verify the exact pull request head. A new head invalidates an earlier verdict.
- Keep research evidence distinct from normative product decisions.
