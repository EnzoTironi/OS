# Hypothesis disposition and failure archive

- Artifact ID: `issue-0081-failure-archive`
- Issue: <https://github.com/EnzoTironi/OS/issues/81>
- Parent: <https://github.com/EnzoTironi/OS/issues/2>
- Track: research operations
- Retrieved: 2026-08-16

This folder exists so later agents do not rediscover abandoned ideas as if they were new. **It must not manufacture certainty retrospectively.**

A hypothesis can leave the active design space for several different reasons:

- `rejected/falsified`: evidence defeated the scoped claim;
- `superseded`: another framing replaced it without proving it universally false;
- `assumption-withdrawn`: OS stopped taking it as a starting assumption;
- `not-promoted`: a proposed semantic primitive did not earn primitive status, while the mechanism/pattern may remain useful;
- `scope-limited`: the idea remains live in a narrower context;
- `undetermined`: evidence is insufficient.

Only `rejected/falsified` is a strict failure. The other dispositions are still important historical information.

## Question

Which hypotheses and architecture framings have actually been defeated, which merely lost priority or primitive status, and what evidence would be required to revisit them?

## Historical result

`docs/hypothesis-history.md` supports the following minimum reading:

- H0 ERP replacement: `rejected/falsified` as the top-level product framing.
- H1 ERP + ontology: `assumption-withdrawn` as the ideal greenfield assumption; still `hypothesis/scope-limited` for brownfield integration.
- H2 Pack: `not-promoted` as a semantic primitive; packaging/module architecture remains open.
- H2 Compiler: `not-promoted` as a semantic primitive; compilation/generation remains open implementation architecture.
- H2 separate deterministic semantic kernels: `assumption-withdrawn/not-promoted` as second business authorities; specialized physical evaluators remain live.
- H3 Frappe/ERPNext foundation: `rejected/falsified` as the assumed greenfield foundation for the research program; ERPNext remains a primary corpus.
- H4 executable ontology and H5 empirical-corpus method are not failures. H4 remains falsifiable.

See [`cards/FA-historical-seeds.md`](cards/FA-historical-seeds.md) for the scoped records.

## Sibling Wave A verdicts

`cards/FA-sibling-rejections.md` preserves claims that sibling branches originally labeled `rejected`. Those labels are **inputs, not automatically archived truth**. Many sibling PRs underwent adversarial review after this archive was authored. Before a sibling claim enters the strict failure ledger, verify that:

1. the exact scoped claim was defeated rather than merely unsupported or not promoted;
2. the sibling artifact is review-clean or its challenge is represented explicitly;
3. the rejection does not infer the truth of the opposite claim;
4. a scope narrowing would not dissolve the apparent contradiction.

Until then, treat sibling entries as `proposed rejection under review`.

## Files

| File | Meaning |
| --- | --- |
| [`ledger.md`](ledger.md) | disposition ledger; strict failures are separated from withdrawn/not-promoted hypotheses |
| [`cards/FA-historical-seeds.md`](cards/FA-historical-seeds.md) | corrected H0-H5 history |
| [`cards/FA-sibling-rejections.md`](cards/FA-sibling-rejections.md) | original sibling rejection candidates; not automatically endorsed |
| [`undetermined.md`](undetermined.md) | open claims |
| [`sources.md`](sources.md) | source locators |

## Rules

- Preserve the original claim, its scope, the evidence that changed its status, and any surviving narrower form.
- `not-promoted` is not `rejected`.
- Failure to kill a thesis is not evidence that its negation is rejected.
- A later architecture choice can supersede an older one without proving the older one impossible.
- Draft kill-test verdicts do not enter the strict failure ledger until adversarial review is represented.
- Never delete a prior disposition when evidence changes; append/revise with history.

This is research history, not an architecture decision and not an edit to RFC-0001.
