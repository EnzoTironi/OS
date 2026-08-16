# Open questions from the operational-runtime audit

**Status:** unresolved after a 45-minute Wave A pass, 2026-08-15.  
**Decision:** undetermined.  
**Rule:** none of these answers were written into `docs/open-questions.md`.

Each item is a question a later agent can falsify. Cite a file from this folder or mark the work still undone.

## Q-36-01. Who should own the write?

Ontologiq never writes the warehouse. Open Foundry writes objects first. gura105 writes the source first when `writeback` is set.

This is `docs/open-questions.md` item 5 (Action versus Event versus Effect) and item 6 (mutable state). This session did not choose. It only showed that the three designs exist in code.

**What would settle it.** A kill-test that runs S-004 and S-010 against all three designs with the same domain story.

## Q-36-02. Is Fact required for an operational ontology?

Ontologiq computes current state and ships. Open Foundry updates current objects and keeps before-and-after snapshots on the audit row. Neither implements valid-time plus knowledge-time as a query API in the files that were opened.

RFC-0001 Fact stays a hypothesis. This corpus does not promote it and does not kill it.

## Q-36-03. Where is UOSE actually implemented?

Docs describe `simulateAction`, ontology snapshots, and adapter execution. The main `xpert-ai/xpert` tree did not yield that function before the GitHub code-search rate limit. Possible later homes are `xpert-ai/xpert-plugins` or a package name this session did not guess.

Until that path is read, UOSE cells stay `declared-only` or `undetermined`.

## Q-36-04. Does Open Foundry CDC exist as code?

[syzygyhack/open-foundry README](https://github.com/syzygyhack/open-foundry/blob/f29bcb9ed819be76d549183b017316908bab8585/README.md) names JDBC connectors and Debezium CDC. Those packages were not opened. Federation remains declared-only.

## Q-36-05. What does OpenBKN do on permission-transport failure?

`CheckPermission` returns `(false, error)` on HTTP failure. Callers were not read. Fail-closed versus abort-the-request is undetermined. Simulation and risk-type enforcement were also not opened.

## Q-36-06. Is Open Ontology a real Lisp runtime?

Arkhe names "Open Ontology (ontology-db)". Product sites exist at ontologyruntime.com and open-ontology.com. `gh search repos` did not confirm a public tree that matches those pages. Marked undetermined. Do not invent capabilities from the marketing copy.

## Q-36-07. Does ObjectStack revalidate script-action arguments after HITL?

ObjectOS has a pending-action queue. The open MCP path relies on the client confirmation prompt. Neither path was traced in TypeScript this session. The documented trusted-body behavior may make argument revalidation less useful than it looks.

## Q-36-08. Can two ontology revisions coexist?

Ontologiq refuses approve across a digest change, with a terminal `--force`. Open Foundry claims SAFE and BREAKING schema class. ObjectStack has commit-history ADRs. No inspected engine showed two live revisions serving historical replay. This is `docs/open-questions.md` item 19. Still undetermined.

## Q-36-09. Is Relator hiding in object-backed links?

Open Foundry and ObjectStack store rich relationships as objects or as links with properties. None use UFO vocabulary. Whether that is enough is issue 12, not settled here.

## Q-36-10. What is OpenCrab's hosted mutation model?

The public repo says the SaaS is elsewhere. Local approval is a three-state queue. Hosted MCP write semantics are undetermined.

## Q-36-11. Empty or missing licenses

`u485349-coder/OpenFoundry` has a 0-byte LICENSE. OpenCrab claims MIT in the README and has no LICENSE file. A later licensing pass (issue 69) should treat both as undetermined for reuse, regardless of conceptual quality.

## Q-36-12. Projects named and not reached

These were found and not opened past metadata, on purpose, because the timebox ended:

- `cloudbadal007/foundry-ontology-open`
- `ekyx/OpenFoundry`
- `smilebank7/OpenFoundry`
- `sekacorn/OpenOntologyLite`
- GATE at deterministicagents.ai, named by Arkhe as a consumer of its contracts

A follow-up worker can open them without repeating the Ontologiq and syzygyhack reads.

## What this session will not pretend to know

It will not answer whether OS should be an executable ontology. That is `docs/open-questions.md` item 1.

It will not answer the smallest semantic core. Item 2.

It will not freeze Action as a primitive. Item 4.

Those questions need this folder plus the foundation and domain tracks. They do not need another sentence in the issue thread.
