# Foundation research. Provenance

**Issue:** https://github.com/EnzoTironi/OS/issues/6  
**Parent:** https://github.com/EnzoTironi/OS/issues/2  
**Open question:** `docs/open-questions.md` Q8 remains `undetermined`  
**Decision state:** `hypothesis`  
**Retrieved:** 2026-08-15

This folder is Wave A evidence for the question

> What provenance must be represented semantically so OS can explain why it believes something and why an action was allowed?

It is not an architecture decision. It does not settle Q8. It does not edit RFC-0001.

`docs/swarm-result-contract.md` is not in this tree. The note follows the Agent output contract in `docs/swarm-research-backlog.md`. Kind keys used throughout are domain evidence, source-system artifact, candidate law, counterexample, and runtime consequence.

## Files

`wave-a-issue-6.md` is the contract page. Sources, numbered evidence, convergence, divergence, candidate laws, and decision state live there.

`vocabulary.md` is the smallest candidate vocabulary that can answer both explanation questions, plus a PROV-O mapping that stays an interchange map.

`adversarial-cases.md` attacks that vocabulary with stale sources, derived forecasts, agent reasoning, manual overrides, and corrected records.

## Sibling research

Issue 37 owns formal PROV-O archaeology under `research/provenance/` on `origin/cursor/issue-37-corpus-cfd8`. This folder does not write there.

Issue 4 owns fact and authority notes under `research/foundation/facts/` on `origin/cursor/issue-4-foundation-cfd8`. Those notes already separate confidence from authority. This folder does not overwrite them.

Wave B and Wave C stay parked.
