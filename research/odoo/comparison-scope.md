# Comparison scope and version warning

This Wave A corpus has two different jobs:

1. **Odoo source archaeology.** Odoo Community `18.0` at SHA `bca6e5d13118fc2dff99d7b81bd49860e743132a`. These observations remain valid source evidence within that pin.
2. **ERPNext comparison.** The original disagreement report compared Odoo 18.0 with ERPNext `version-15` at SHA `d707cb1e0e808fa6699d29a2bbaf9310983e94ac`.

Issue #32, however, independently pinned ERPNext `develop` at `1212a278c6a5fcad4bd67d27ec15c6af9d3e94b4` on 2026-08-15. Therefore the direct Odoo↔ERPNext disagreement cards in this branch are **cross-generation preliminary comparisons**, not clean evidence that a current product/design difference exists.

## Rule for synthesis

- Odoo-only observations, tests, invariants, model behavior and source artifacts may be consumed at their pinned Odoo 18.0 scope.
- A disagreement card that depends on ERPNext `version-15` must be treated `undetermined/preliminary` for **current cross-product convergence/divergence** unless it is revalidated against the ERPNext corpus pin used by issue #32 or explicitly framed as a historical version comparison.
- A difference that disappears between ERPNext `version-15` and `develop` was a version difference, not evidence of a stable architectural disagreement.
- A difference that survives both pins gains stronger evidence but still does not become a universal domain law.
- Quality remains `undetermined` in this Odoo Community pass because the inspected Community tree did not supply the referenced quality models; absence from this pin is not evidence about Odoo Enterprise or later Community versions.

## Why preserve the old report

The original `disagreement-erpnext.md` is still useful as a hypothesis generator. We preserve it rather than rewrite the research as if the first comparison had been version-aligned. The adversarial review discovered the version-control problem; this note makes that limitation explicit and prevents #70/#75 from counting those cards as clean independent divergence.

A future revalidation can append a new aligned comparison rather than silently editing history.
