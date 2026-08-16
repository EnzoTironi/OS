# Wave A blocker resolutions

**Date:** 2026-08-16  
**Precedence:** this file supplements `wave-a-review-ledger.md`. It changes only the blockers listed below. All other `challenged` findings remain challenged unless a later resolution says otherwise.

## #84 / issue #74 — swarm result contract

**Original status:** `challenged`, then mechanically conflicted after the corpus integrated.  
**Resolution:** original PR #84 closed as superseded; contract v2 transplanted directly to the current `research-corpus` tip.

Landed artifacts:

- `docs/swarm-result-contract.md`
- `research/schema/research-index.schema.json` (v2)
- `research/index/_empty.json` (explicit `sentinel`)

The v2 contract separates artifact kind, claim epistemic state, evidence status, experiment result, historical disposition and governance/adoption state. Wave A is grandfathered; issue #75 owns normalization/indexing.

**Status now:** `review-clean` as a research contribution convention. A later small promotion PR may move the validated governance convention to `main`; raw research remains non-normative.

## #92 / issue #33 — Odoo corpus

**Original blocker:** Odoo 18 archaeology was compared directly to ERPNext v15 while issue #32 independently pinned ERPNext `develop`, risking false product divergence.

**Resolution:** added `research/odoo/comparison-scope.md` and warning in `research/odoo/README.md`. Odoo-only observations remain valid at their pinned Odoo 18 revision. Cross-product disagreement cards are explicitly **preliminary/cross-generation** until aligned-pin revalidation.

**Status now:** `review-clean` for Odoo source archaeology; current ERPNext↔Odoo divergence remains `undetermined` where it depends on the mismatched pin.

## #122 / issue #30 — Brazilian fiscal

**Original blocker:** several candidate laws over-generalized DF-e lifecycle, tax determinism, IBS/CBS credit and 2026 transition behavior.

**Resolution:** rechecked current official 2026 sources and added `research/domain/fiscal/current-law-2026-review.md`; rewrote candidate laws to:

- scope authorization/correction mechanics to actual document families;
- separate local attempt from external legal outcome;
- make deterministic tax calculation conditional on bound legal facts/classification/interpretation/rule revision;
- use the current LC 214 art. 47/48 credit mechanics rather than accounting shorthand;
- represent 2026 explicitly as an exceptional CBS/IBS transition/test-year context;
- keep Brazil-specific legal codes out of generic engine code without pretending they lack domain meaning.

**Status now:** `review-clean` as of the dated 2026-08-16 source review. It is temporally revisable law evidence, not a permanent tax ontology.

## #128 / issue #51 — semantic fuzzing

**Original blocker:** issue #51 explicitly required reusable generators; the original PR said implementing a generator would violate scope.

**Resolution:** added original stdlib research tooling:

- `research/agi/fuzzing/generator.py`
- `research/agi/fuzzing/test_generator.py`

and rewrote the DSL/method laws to support replay, pairwise composition, choice-stream shrinking, declared approval state basis, ambiguous external outcomes and observation provenance. The generator currently implements D-01, D-02, D-04, D-10, D-11, D-12, D-13 and D-14.

The local shell in the integration session could not resolve `github.com`, so the committed unit tests were **not executed by the reviewer**. This is recorded rather than silently claiming a green test run.

**Status now:** `review-clean` for issue-deliverable presence and semantic narrowing; `observed-execution` evidence for the test suite remains absent until CI/a later agent actually runs it.

## #140 / issue #81 — failure archive

**Original blocker:** the archive converted hypotheses that were only withdrawn/not-promoted into `rejected`, rewriting the project's history.

**Resolution:** rewrote the archive around explicit dispositions:

- `rejected/falsified`
- `superseded`
- `assumption-withdrawn`
- `not-promoted`
- `scope-limited`
- `undetermined`

H1 ERP+ontology remains live as a scope-limited brownfield hypothesis; Pack/Compiler were not promoted as semantic primitives rather than falsified; semantic deterministic kernels were withdrawn as second authorities while physical evaluators remain open. Draft sibling kill verdicts are preserved as proposed rejections under review, not historical truth.

**Status now:** `review-clean`.

## #143 / issue #77 — real-company reality check

**Original gap:** the Wave A map required a real-company validation slice and no issue-77 branch/PR was present after the swarm finished.

**Resolution:** created and merged PR #143 with:

- `research/ops/reality-check/hf-wave-a.md`
- `research/index/issue-0077-hf-reality-check.json`

The report is de-identified and contains no raw customer files. It preserves concrete observations from the previously completed HF source-truth audit and real workflow evidence, and explicitly states that the current Library connector returned `401` so a fresh byte-level extraction was not rerun in this session.

The reality check breaks several source-shaped assumptions: aggregate sales rows are not order lines; Product/SKU/Listing cannot be collapsed; successful joins do not prove identity; missing cost is not zero; price/cost/inventory each contain several statement kinds; snapshots cannot be retroactively turned into complete event histories; source authority is scoped; and substantial business knowledge lives in human/manual/message workflows.

**Status now:** `review-clean` as a reality-gap artifact with `real-company-evidence` marked `observed`, not falsely upgraded to fresh executable verification.

## Remaining challenges

All other entries marked `challenged` in `wave-a-review-ledger.md` remain deliberate inputs to synthesis. Integration into `research-corpus` means **preserved research, not resolved semantic law**.
