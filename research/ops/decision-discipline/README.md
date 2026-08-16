# Decision discipline

- Artifact ID: `issue-0082-kinds-versus-verdicts`
- Issue: <https://github.com/EnzoTironi/OS/issues/82>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Kind: research operations. Exclusive tree, not a `main` convention yet.
- Decision states present: `hypothesis`, `supported`, `rejected`, `undetermined`

Issue 82 asked for conventions on `main`. This branch keeps them here so a later merge can promote them. Nothing in this folder is an OS primitive.

`docs/swarm-result-contract.md` is absent on `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. The unmerged draft lives on `origin/cursor/swarm-result-contract-cfd8` at `f076b311bc911e7f68027cc46c25c6cf5cf683c9` as [PR 84](https://github.com/EnzoTironi/OS/pull/84). This unit follows the Agent output contract in `docs/swarm-research-backlog.md` and links that draft.

Nothing here answers `docs/open-questions.md`. Cite a research artifact or leave the question `undetermined`.

## How to read this folder

Start with `issue-0082-kinds-versus-verdicts.md`. That note is the Wave A evidence.

Use `conventions.md` when you need the mechanical rules. Agents follow that file. They do not invent a fifth verdict.

Use `decision-record.schema.json` when a later linter or index wants the enums and the accepted-decision required fields.

Use `index-issue-0082-kinds-versus-verdicts.json` when a synthesis agent needs a local shard. This unit must not write `research/index/`.

## What this folder is not

It is not an architecture decision. It is not an edit to RFC-0001. It is not a domain model of Observation or Accepted Fact. Those words in `docs/open-questions.md` question 3 stay `undetermined`.

Sibling notes were read with `git show` only. They are not copied here.

## Licensing

Concepts and coordination facts only. No implementation reuse.
