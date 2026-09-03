# Zoen delivery program

The program delivers one governed system through 52 units, eight canonical journeys, and nine final gates. `program.json` is the source. Generated TSV files make the graph easy to inspect and validate.

## Product boundary

Zoen has exactly three products:

- Ontology owns `World`, published meaning, evidence, governed Actions, authority commits, queries, explanations, and external-effect intent. The CLI, Connect API, and MCP are Ontology interfaces.
- Eve owns conversation state, channel verification, rendering, and the Membership workbench.
- Better Auth owns account authentication, recovery, device flow, and link confirmation.

Poke informs Eve's voice. Palantir informs the governed ontology standard. Neither reference adds a Zoen product.

Ontology exposes exactly seven public verbs: `Discover`, `Query`, `Propose`, `Decide`, `Commit`, `Explain`, and `Execute`.

## Published meaning

One active `WorldRelease` governs each World. Its content binds exactly four catalogs: ontology, policy, executors, and components. Publication metadata and activation state remain separate from release content.

`ReleaseDigest` is derived from domain-tagged RFC 8785 JSON Canonicalization Scheme bytes. Callers cannot supply an unrelated release ID. The release fields remain private so construction must pass the canonical constructor.

## Tracks

- `runtime-truth` owns the one-Fly artifact, workers, readiness, and CI.
- `world-authority` owns releases, policy, typed objects, evidence, query, observation data, compute, and automation.
- `identity-eve` owns Account, Membership, per-turn authority, Eve, and channels.
- `agent-surfaces` owns generated CLI, Connect, MCP, packs, and catalog parity.
- `integration` owns cross-track journeys, evidence, audits, and deployment.

## Program order

W0-05 ratifies the governed-data contract. Land the active implementation work in this order: W1-03, W1-04, then W2-01. W1-04 preserves `/live` and workload credential governance while it deletes Ontology Conversation and `whoCan`. W2-01 then applies the private release contract across the combined runtime. Later units add typed identity, evidence selection, dense observation data, entitlements, the finance pack, and FIN-01 through FIN-09.

Do not accept semantic auto-merges in `workload_credential_store`, `identity_store`, the core library, or the Action engine. Review the combined invariants even when Git reports no text conflict.

The key dependency chain is:

```text
W0-05 ratification
  -> W2-01 private content-derived WorldRelease
  -> W2-02 through W2-06 release and authorized query
  -> W2-08 and W2-09 typed identity and links
  -> W4-06 through W4-08 resolution, observations, and entitlements
  -> W7-04 finance pack
  -> W8-04 FIN-01 through FIN-09
  -> W8-02 complete production-shaped proof
```

W1-H1 is absent by design. PR 616 is closed, unmerged, and retired. The program does not use its runtime model.

## Evidence and status

- `frontier.json` records current `main`, merged pull requests, active candidates, and retired PRs.
- `ledger.tsv` records exact-head verification verdicts.
- `decisions.tsv` records the seven ratified design decisions and program operations.
- `status.md`, `units.tsv`, `dependencies.tsv`, `journeys.tsv`, and `final-gates.tsv` are generated from the canonical sources.
- `docs/research/2026-09-02-openbb-ontology/` preserves the accepted research with hashes and provenance.

Run `node orchestrate/zoen-final/render-status.mjs --write` after a program change. Run `node orchestrate/zoen-final/verify-ratification.mjs` before review.
