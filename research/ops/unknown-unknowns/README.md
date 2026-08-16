# Unknown-unknowns scan

**Issue:** [#73](https://github.com/EnzoTironi/OS/issues/73) 
**Track:** ops 
**Date:** 2026-08-16 
**Decision:** none. This folder is a discovery map, not a metamodel.

## Question

The Wave A backlog is shaped by ERP, manufacturing, and commerce. Which enterprise domains and semantic traditions are missing, and which of them put new pressure on RFC-0001 rather than repeating order, stock, or work-order problems?

This pass does not build domain ontologies. It ranks candidate domains by the foundational assumption each can falsify, then names child issues only when that pressure is not already owned by an open issue.

## How to read this folder

| File | Mode | Contents |
| --- | --- | --- |
| `sources.md` | reference | Primary standards and docs opened for this scan |
| `evidence.md` | reference | Domain evidence and source-artifact cards |
| `map.md` | explanation | Ranked unknown-unknowns map and backlog advice |
| `candidates.md` | explanation | Candidate domains, assumption challenged, child-issue proposals |
| `candidate-laws.md` | explanation | Smallest claims the scan can state, each still a hypothesis |
| `scenarios.md` | reference | Counterexamples a later agent can run without rereading #73 |
| `open-questions.md` | explanation | Unresolved questions. Answers stay undetermined unless a card cites evidence |

Every card names a **kind** and a **decision state**.

Kinds used here:

- domain evidence
- source artifact
- candidate law
- counterexample
- runtime consequence

Decision states used here:

- hypothesis
- supported
- rejected
- undetermined

Nothing in this folder is silently accepted. RFC-0001 was not edited.

## Relation to nearby issues

[#79](https://github.com/EnzoTironi/OS/issues/79) is the later primitive stress matrix. This folder is the discovery input. Do not treat the two as the same unit.

[#38](https://github.com/EnzoTironi/OS/issues/38) already owns GS1 EPCIS and ISA-95. This scan adds other public traditions that #38 should ingest, not replace.

[#15](https://github.com/EnzoTironi/OS/issues/15), [#18](https://github.com/EnzoTironi/OS/issues/18), [#22](https://github.com/EnzoTironi/OS/issues/22), [#24](https://github.com/EnzoTironi/OS/issues/24), [#26](https://github.com/EnzoTironi/OS/issues/26), [#27](https://github.com/EnzoTironi/OS/issues/27), [#29](https://github.com/EnzoTironi/OS/issues/29), [#10](https://github.com/EnzoTironi/OS/issues/10), [#8](https://github.com/EnzoTironi/OS/issues/8), [#4](https://github.com/EnzoTironi/OS/issues/4), [#5](https://github.com/EnzoTironi/OS/issues/5), [#62](https://github.com/EnzoTironi/OS/issues/62), and [#67](https://github.com/EnzoTironi/OS/issues/67) already cover several named industries at the ERP grain. A domain appears below as a child proposal only when the missing piece is a different semantic tradition, not a missing industry label.

## What this scan did not do

- It did not design a target schema.
- It did not answer `docs/open-questions.md`.
- It did not copy sibling Wave A folders.
- It did not file GitHub issues.
- It did not mine copyleft implementations. Notes extract published concepts and behavior only.

## Licensing

OS is MIT. IFRS, ISO, OASIS, OMG, HL7, W3C, TM Forum, IEC, and EU texts were read as public conceptual evidence. Do not paste or translate their schemas into the MIT core.
