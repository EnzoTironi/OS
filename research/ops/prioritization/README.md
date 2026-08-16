# Research prioritization by information gain

- Artifact ID: `issue-0076-information-gain`
- Issue: <https://github.com/EnzoTironi/OS/issues/76>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Snapshot date: 2026-08-16
- Kind: research operations. Dated snapshot, not a living dashboard.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

This folder estimates which open research questions still shrink the architecture space. Issue numbers are not priority. Closing an issue to look busy is `rejected`.

`docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. The unmerged draft lives on `origin/cursor/swarm-result-contract-cfd8` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9` as [PR 84](https://github.com/EnzoTironi/OS/pull/84). Until that file lands, this unit follows the Agent output contract in `docs/swarm-research-backlog.md` and links the draft contract.

Nothing here answers `docs/open-questions.md`. Cite a sibling artifact or leave the question `undetermined`.

## How to read this folder

Start with `snapshot-2026-08-16.md`. That note is the Wave A contract result.

Use `execution-order.md` when you need the next-action ranking and the parallel-versus-blocked split.

Use `dependency-edges.md` when a sibling verdict should move storage, party, or synthesis work.

Use `candidate-laws.md` when you need the smallest reusable claims.

Use `sources.md` when you need exact commits, issues, and `git show` paths.

Use `index-issue-0076-information-gain.json` when a later graph or synthesis agent needs a machine-readable shard. The shard is local to this exclusive tree because this unit must not write `research/index/`.

## What this snapshot is not

It is not a license to close issues. It is not a merge queue. It is not Wave B storage advice. It is not a substitute for the review gate on issue 2.

Sibling notes were read with `git show` only. They are not copied here.

## Licensing

Concepts and coordination facts only. No implementation reuse.
