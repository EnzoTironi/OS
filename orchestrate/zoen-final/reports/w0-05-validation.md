# W0-05 validation

## Recorded implementation

- Unit: `W0-05`
- Pull request: `#620`
- Branch: `codex/zoen-governed-north-ratification`
- Exact head: `1cb0609561fcf00f9c5412a2dfb4cb28235c5c11`
- Verdict: `journey-verified`
- Merge: `d8843d7effe2822dc69568319a3e01c177648b89` at `2026-09-03T06:17:12Z`

The verdict applies only to this head. The closeout does not inherit evidence from an earlier revision of the pull request.

## Positive proof

The exact-head independent review returned PASS with no findings. GitHub recorded 26 passing checks and one skipped Graphite check. The passing set included the required aggregate, CodeQL, SonarCloud, Codecov, build, check, Clippy, 12 product journeys, and the concurrent journey run.

The ratification validator proved 52 units, 112 unique dependency pairs, eight canonical journeys, nine final gates, three products, seven public verbs, and four `WorldRelease` catalogs. It also verified the seven ratification decisions, the 20 initial pull request dispositions, the clean-room and AGPL records, path containment, generated status files, and research-file hashes.

The `docs/product`, `docs/research`, and `orchestrate/zoen-final` trees are unchanged between the W0-05 merge and recorded `main` at `be24e0956e0bfb681634c796b5410afc5eef2e38`. The later Better Auth repair did not change the ratified artifact.

## Denial and fail-closed proof

The executable self-checks reject missing journey dimensions, incomplete bootstrap facts, altered ratification decisions, altered initial pull request dispositions, duplicate dependency pairs, unsafe evidence paths, and ledger identities with missing, malformed, or mismatched pull request and SHA values.

The closeout adds wave-independent denial cases for a `done` W0-05 record with no ledger row or duplicate rows. A changed SHA or evidence text that omits the exact head also fails. Wave 0 records without a pull request remain valid.

## Recovery and reproducibility

`render-status.mjs --write` regenerates the five derived status and TSV files. A subsequent read-only renderer run rejects any difference. `verify-ratification.mjs` then checks the canonical JSON, TSV records, visual, documentation paths, and immutable research hashes together.

The closeout records merge facts and evidence only. It does not change the ratified specification, research sources, product code, W1-02 ledger row, or the status of W1-03 and W1-04.
