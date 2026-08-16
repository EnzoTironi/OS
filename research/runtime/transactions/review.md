# Adversarial review — issue #40 transaction/commit semantics

**Date:** 2026-08-16  
**Disposition:** pending CI; research contract remains non-normative.

The draft was attacked after primary-source research and the executable reference model were written.

## R-TX-01 — state-basis failure is not automatically `NeedsReproposal`

**Draft failure:** the first executable model returned `NeedsReproposal` whenever an exact-version or live predicate basis was false.

**Why wrong:** these cases have different lifecycle semantics:

- a live predicate such as `availability >= 7` can simply mean `not committable now`;
- an exact proposal version becoming stale may require reproposal;
- a transient guarded condition may be retried later under the same approval;
- a known serialization conflict is definitely aborted and can be physically retried if the operation contract allows it.

**Correction:** the reference model now exposes `BASIS_NOT_SATISFIED` separately. The operation/lifecycle policy decides whether the response is retry, wait, recompute, or reproposal. Approval/intent mismatch remains `NEEDS_REPROPOSAL`.

This prevents the generic transaction engine from deciding business workflow semantics merely from a failed guard.

## R-TX-02 — `current authorization at commit` needs its own consistency contract

**Draft risk:** saying `reauthorize at commit` can sound like the transaction engine can atomically read a separate IAM/policy system and the business database with no race.

That is not generally true.

Possible authority contracts include:

```text
capability/delegation token pinned to revision + expiry
linearizable policy store participating in commit guard
authority lease/fencing revision
short-lived authorization decision with declared staleness bound
same-store authorization facts
external PDP decision plus version/revocation semantics
```

#42 must decide which semantics OS requires. The #40 law is only:

> if an operation declares an authority/policy condition as current/non-waivable, commit must have evidence satisfying the authority contract's definition of current; a stale historical approval cannot silently substitute for it.

It is **not**:

> every commit must make a magical distributed linearizable IAM read inside the database transaction.

The revocation-vs-commit race is therefore an explicit #42/#46 litmus test.

## R-TX-03 — transaction result knowledge is not one undifferentiated `unknown`

FoundationDB's documentation distinguishes `commit_unknown_result` and other timeout/cancellation conditions whose guarantees differ.

The candidate `CommitOutcomeIndeterminate` is therefore an **epistemic family**, not a promise that every indeterminate outcome has the same retry policy.

A concrete result should carry enough evidence/reason to determine:

```text
could the old attempt still commit?
is there a stable operation marker to query?
is retry itself idempotent?
is a reconciliation read authoritative?
what timeout/session/transaction evidence exists?
```

#41 should make the same distinction for remote effects.

## R-TX-04 — idempotency and permanent domain uniqueness must stay separate

Stripe's API windows are retry/deduplication contracts. A business invariant such as `supplier invoice id unique per supplier/legal entity forever` can outlive an API idempotency window.

Therefore:

```text
API/operation replay identity
!=
permanent domain uniqueness key/invariant
```

The adversarial suite now includes both cases.

## R-TX-05 — serializable physical reads should not automatically become the semantic dependency graph

A runtime can conservatively serialize on more physical data than the business decision truly depends on. FoundationDB snapshot/conflict-range examples make the tradeoff visible; PostgreSQL Serializable also tracks physical predicate dependencies to guarantee serial order.

The semantic contract should preserve the **meaningful state basis** when known, while the physical implementation may use a broader safe dependency set.

Conversely, declaring a physical read non-conflicting is unsafe if hidden application logic actually uses it to choose a mutation. Scenario S-TX-44 captures that failure.

## R-TX-06 — approval record state and actor IAM state are not one thing

The reference model's `Approval.active` field is deliberately a tiny **approval-contract state**, not a model of the approver's current IAM role. Historical approval may remain valid after the actor leaves, depending on the operation contract; current executing authority is a separate #42 concern.

Do not generalize that toy field into `approver must still be active at commit`.

# Surviving contract after review

The strongest current pressure is:

```text
semantic operation identity
+ intent/parameter identity
+ optional proposal/approval scope
+ declared state basis
+ semantic/policy/authority revision contract
+ atomic invariant-valid local mutation
+ stable dedupe/result evidence
+ typed known-abort vs indeterminate commit knowledge
```

Physical mechanisms remain replaceable competitors: Serializable transactions, constraints, CAS, locks, conflict ranges and specialized evaluators can all implement parts of this contract.

No reviewed evidence yet requires `StateBasis`, `Proposal`, `Transaction`, or `CommitWitness` as a base metamodel primitive.
