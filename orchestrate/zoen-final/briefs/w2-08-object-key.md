# W2-08 Plan (HAVE)

## Goal
Add ObjectKey, private typed references, and temporal TypeAssignment. Prove J2 and J4 on real Postgres paths. Produce FIN-01 evidence.

## Authority
- `docs/product/zoen-governed-data-extension-spec.md` (§ ObjectKey, TypeAssignment, FIN-01)
- Issue #637 / unit W2-08 in `orchestrate/zoen-final`

## Shape
1. Stable private ObjectKey (not public UUID dumps).
2. Temporal TypeAssignment as sole type-evidence; never call it Membership.
3. Typed refs carry ObjectKey + TypeId + verified TypeAssignmentRef.
4. Ambiguous identity denied with FIN-01 artifact.
5. Journeys prove propose/commit/query/explain with typed objects; clinic query uses typed patient objects.

## Dependencies
W2-04 done. Coordinate with W2-06 sealed cursors if both land near each other; do not block on W2-06.

## Success
Independent Shipping PASS; PR squash-merged; #637 closed; unblock W2-09 and W4-07.
