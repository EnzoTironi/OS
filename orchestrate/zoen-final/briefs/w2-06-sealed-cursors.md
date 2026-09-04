# W2-06 Plan (HAVE)

## Goal
Authorize before discovery and seal cursors to authority, query, release, and budget. Prove J4 (governed clinic query) on a real Postgres path across actors, happy path, negative, replay, isolation, and recovery. Produce FIN-05 evidence.

## Authority
- `docs/product/zoen-governed-data-extension-spec.md` (sealed cursors, BudgetClass, FIN-05)
- `docs/product/zoen-final-architecture.md`
- Issue #635 / unit W2-06 in `orchestrate/zoen-final`

## Shape
1. Discover/Query refuse before authority binds (no catalog leak).
2. Cursor tokens seal Membership authority + query + WorldRelease digest + BudgetClass; reject tamper/cross-membership/cross-release reuse.
3. Server-budgeted compute uses release-owned budget, not client ResourceLimits.
4. Explain returns the policy decision that gated discovery/page.
5. Journey `e2e/governed-clinic` covers six dimensions; artifact for FIN-05.

## Out of scope
ObjectKey/TypeAssignment (W2-08), BudgetClass catalog ownership beyond cursor seal (W2-07 owns BudgetClass replace).

## Success
Independent Shipping PASS on exact head; PR squash-merged; #635 closed; ready-for-agent moved to newly unblocked units.
