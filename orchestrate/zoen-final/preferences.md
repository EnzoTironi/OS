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
- These prohibitions apply to every worker on all 52 units. Workers never merge, deploy, force-push, rewrite published history, or perform destructive Git or data operations.
- Only the coordinator may merge or deploy, only after Enzo explicitly authorizes the exact operation, and only for the exact head SHA verified in the ledger. Force-push remains forbidden to every role.
- Resolve every actionable human and automated review comment before merge. Any review-driven commit invalidates the prior verdict.
- Every unit reports its branch, head SHA, exact commands, verdict, deviations, and follow-up risks.
- Use the `gh` CLI for GitHub work. Do not add repository-owned PR Cockpit or Graphite wiring.
- Do not revive PR 616 or its runtime design.
- Workers on all 52 units do not use Herdr, Cursor SDK, Portless, PR Cockpit, or Graphite.
- Use Kache for Rust commands when a unit runs Rust compilation.
- Verify the exact pull request head. A new head invalidates an earlier verdict.
- Keep research evidence distinct from normative product decisions.
