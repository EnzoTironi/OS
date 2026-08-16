# Open questions from the existing-platform kill

**Status.** Unresolved after a Wave A pass, 2026-08-16.  
**Decision.** `undetermined`.  
**Rule.** None of these answers were written into `docs/open-questions.md`.

Cite a file in this folder or mark the work still undone. Do not invent an answer to a thesis-level question because this kill test needed a sentence.

## Q-68-01. Who should own the write?

Ontologiq never writes the warehouse. Palantir and Open Foundry write ontology objects and then talk to the outside world. gura105, via S10, writes the source first when `writeback` is set.

This is `docs/open-questions.md` item 5. This session showed that all three designs exist and that none of them, as inspected, also keep P1 and P10. It did not choose.

**What would settle it.** X-003 plus X-005, run on V-001.

## Q-68-02. Is Fact required to pass this kill?

Ontologiq and Palantir both operate without a Fact primitive. Both fail P10. That does not prove Fact is the missing primitive. Amendment logs or a bitemporal store might suffice. RFC-0001 Fact stays a hypothesis. Open question 6 and 7 stay open.

## Q-68-03. Can Palantir Scenarios stand in for preview?

S19 lets planners submit inside a Scenario with looser criteria, then merge. That may be a real preview. This session did not open Scenario merge semantics, pin behavior, or whether a merge re-reads live objects the way L-003 requires.

**State.** `undetermined`. Do not upgrade Palantir P4 to `enforced` until that path is read.

## Q-68-04. Does Open Foundry CDC exist as code?

S24 names Debezium. S10 did not open the connector. P1 stays `declared`.

## Q-68-05. Does ObjectStack revalidate script-action arguments after HITL?

S26 re-reads flow fields. S10 Q-36-07 left the script-action queue untraced. Still `undetermined`.

## Q-68-06. Is hREA a hidden replace-OS candidate?

ValueFlows names P3. hREA was not opened. A later corpus worker can score it against P4 through P9. Until then it is a vocabulary, not a platform.

## Q-68-07. Did issue 61 already kill reuse?

`cursor/issue-61-kill-cfd8` was not on the remote. Issue 61 is the "building from zero may be inferior to reuse" kill in the backlog. This folder answers the inverse kill and does not speak for 61.

## Q-68-08. Unopened name collisions

S10 listed other "Open Foundry" and "Open Ontology" trees. X-008. A follow-up may open them. It should not repeat the Ontologiq and syzygyhack reads.

## What this session will not pretend to know

It will not answer whether the primary artifact is an executable ontology. Open question 1. Issue 55 owns a kill on the unified reading.

It will not answer the smallest semantic core. Open question 2.

It will not freeze Action as a primitive. Open question 4.

It will not choose a physical store, a compiler, or a language. Open questions 17 and 18.

Those questions need this folder plus the foundation and domain tracks. They do not need another sentence in the issue thread.
