# Cross-industry primitive stress test

**Issue.** [79](https://github.com/EnzoTironi/OS/issues/79)  
**Kind.** explanation index  
**Fetched.** 2026-08-16  
**Decision.** mixed. Never `accepted`.  
**Contract.** `docs/swarm-result-contract.md` is absent on `origin/main`. This folder follows the Agent output contract in `docs/swarm-research-backlog.md`.

## Question

Which RFC-0001 candidate forms, and which ERP-shaped assumptions, survive domains that are not manufacturing commerce?

The initial corpus is heavy on ERP, inventory, and plant transformations. This folder does not build industry ontologies. It picks scenarios that attack tangible identity, linear leftover-quantity fulfillment, inventory movement as the fulfillment event, one owner pointer, one-time orders, and consume-produce as the only process.

## How to query this folder

| File | Kind | Use when |
| --- | --- | --- |
| [sources.md](sources.md) | source list | You need a URL, standard, or sibling git ref |
| [evidence.md](evidence.md) | domain evidence | You need a cited observation |
| [scenarios.md](scenarios.md) | counterexample | You need a named attack on an ERP assumption |
| [matrix.md](matrix.md) | convergence and stress | You need the primitive stress matrix |
| [candidate-laws.md](candidate-laws.md) | candidate law | You need a claim, falsifier, and runtime pressure |
| [open-questions.md](open-questions.md) | open question | You need what this pass did not answer |

Sibling notes were read with `git show` only. They are not copied here. Cite them as `origin/cursor/issue-N-*-cfd8:path`.

## Verdict

OS is not forced to be a manufacturing ERP ontology if it keeps three cuts that independent non-ERP sources also make.

1. An attempted intervention is not an observed occurrence.
2. A standing or contingent promise is not the event that satisfies it.
3. A kind description is not an inventoried individual.

Several ERP leftovers fail as kernel laws.

- Inventory movement is not the fulfillment event.
- A one-shot sales order is not the commercial primitive.
- Consume-and-produce is not the only process.
- One owner pointer is not ownership.
- Leftover demand as unshipped quantity does not cover remaining period, remaining coverage, remaining entitlement, or remaining case work.

Those leftovers need reframing as interval performance, rights bundles, and contingent claims. That reframing is a hypothesis. It is not an RFC-0001 edit.

## What this pass did not do

It did not answer `docs/open-questions.md`. Where a numbered question is touched, the note says `undetermined` and points at an artifact in this folder.

It did not edit `rfcs/0001-metamodel-hypothesis.md`.

It did not recommend a Wave B runtime.
