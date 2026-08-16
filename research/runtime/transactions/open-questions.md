# Open questions and downstream handoff

**Issue:** #40  
**Status:** unresolved unless explicitly answered.

# Questions #40 can answer now

## Q-TX-01 — is one object version check the generic stale-state contract?

**Answer:** no.

Exact-version guards are useful for single-resource dependencies, but business correctness can depend on predicates, absence, set membership, aggregate quantity, immutable snapshots and current authorization.

## Q-TX-02 — must every approved operation reread current state?

**Answer:** no.

The operation declares which dependencies are live/current and which are intentionally pinned/frozen. Re-reading current state is correct for some guards and semantically wrong for others.

## Q-TX-03 — is approval a sticky state on the target object?

**Answer:** no as a general model.

Approval evidence binds a proposal/intent/limits/basis. Materially changing that scope without reapproval destroys the meaning of approval.

## Q-TX-04 — is every transaction exception evidence of no commit?

**Answer:** no.

FoundationDB explicitly demonstrates an indeterminate local commit outcome. Commit-result knowledge must be modeled separately from the actual durable state.

## Q-TX-05 — is serialization conflict a business failure?

**Answer:** no generally.

It can be a known-abort physical conflict eligible for retry. It becomes a semantic re-proposal when recomputation changes the decision outside approved/declared bounds.

## Q-TX-06 — must every domain invariant use SERIALIZABLE storage?

**Answer:** no.

A unique constraint, exact CAS, explicit lock, generated conflict range, or specialized physical evaluator can be the appropriate mechanism. The invariant's semantic dependency determines the needed enforcement strength.

# Open metamodel/runtime questions

## Q-TX-10 — is `StateBasis` a metamodel primitive?

Current answer: `undetermined`; not earned.

The capability is required. It may reduce to ordinary Functions/predicates + explicit revision references + generic transaction dependency metadata. #70 should attempt that reduction before creating a first-class sort.

## Q-TX-11 — is `CommitWitness` a first-class domain object?

Current answer: `undetermined`.

Auditable operations need enough durable evidence to reconstruct what committed and under which basis/revisions. This could be a projection over Action log + approvals + transaction receipt + resulting events rather than one native object.

## Q-TX-12 — is `Proposal` universal?

No evidence supports universality. Many Actions can commit directly. Proposal/preview/approval exists only where user experience, risk, optimization, or governance needs it.

## Q-TX-13 — should idempotency identity equal Action invocation identity?

Strong working hypothesis: often yes for one semantic attempt-to-do-once operation, but not universally.

A long-running business goal may spawn several legitimate Action invocations. API retry key may also have a narrower retention scope than permanent business uniqueness. #70/#44/#41 should keep those identities composable rather than forcing one ID everywhere.

## Q-TX-14 — what transaction result must be durable?

At minimum enough to distinguish/reconcile a duplicate operation after caller uncertainty. Exact payload retention depends on domain/audit/privacy requirements.

Candidates:

```text
operation id + committed marker + semantic result digest
full Action result
causal resulting occurrence ids
storage transaction revision/receipt
```

# Handoff to #41 — external effects

#41 must consume these boundaries rather than redefining them.

1. A local Action can commit while a remote effect has not yet begun.
2. The local transaction can atomically record an **effect intent/request** if the architecture uses an outbox, but that does not mean remote success.
3. A remote call cannot safely execute inside a retryable transaction merely because local writes are ACID.
4. Local `CommitOutcomeIndeterminate` and remote `EffectOutcomeUnknown` are different states, although stable operation/effect IDs and reconciliation are common techniques.
5. #41 must define whether an external effect attempt has its own idempotency identity distinct from the local Action operation ID.
6. If local commit is indeterminate, external-effect executor must not infer that it should/not execute until local operation reconciliation establishes whether effect intent committed.
7. Compensation/reversal after a committed Action is a new governed operation, not transaction rollback.

Required #41 scenario:

```text
Action local commit becomes indeterminate to caller
EffectRequest actually committed
executor later sends remote operation
caller retries original Action
```

The system must neither create a second local operation nor second remote effect.

# Handoff to #42 — authorization/delegation

#42 must define which authority checks are:

```text
historical approval evidence
current-at-commit authorization
pinned/effective-date business policy
non-waivable current security/compliance policy
```

Questions:

1. Does a revoked delegator invalidate pending approvals or only future approvals?
2. Which actor is authorized at commit: initiator, current executor, approving principals, service workload, all of them in different roles?
3. Can an agent retry a known-abort transaction after its task grant expired between attempts? Current hypothesis: no if task grant is current-at-commit.
4. How are four-eyes/SOD constraints protected against concurrent approvals?
5. What authorization evidence belongs in the commit witness without copying IAM state forever?

# Handoff to #39 — storage/physical transaction design

#39 should compare mechanisms against the **semantic dependency shapes** rather than choosing a database from feature lists.

Required support:

```text
exact version/CAS
predicate/absence/range dependency
multi-record atomic write
unique/exclusion constraints
serializable execution or equivalent where required
short transaction retry
stable operation dedupe marker
known-abort vs indeterminate result evidence
revision pinning
operation/commit causal history
```

Evaluate at least:

- PostgreSQL Serializable/constraints/locks;
- FoundationDB strict serializable/conflict ranges;
- relational+event/outbox hybrids;
- whether a second graph/temporal store belongs outside the commit authority.

Do not force every read into a conflict dependency; advisory/non-decision reads should be separable.

# Handoff to #43 — durable execution

A workflow/orchestrator must never keep the authoritative DB transaction open while waiting for humans/timers/external events.

It should persist process/proposal state, then invoke a fresh #40 commit operation when ready. Retry of orchestration activity and retry of semantic commit are different layers.

# Handoff to #46 — verification

Turn the S-TX-* cases into executable concurrency/property tests.

Highest-value generated/model-checked cases:

- write skew across independent rows;
- phantom absence/unique business key;
- aggregate inventory reservation;
- cancel-vs-commit race;
- duplicate delivery of same operation;
- retry after known conflict with changed result;
- unknown commit followed by replay;
- current authorization revoked between attempts;
- policy/ontology revision during pending proposal;
- invariant bypass via lower-level mutation path.

Metamorphic properties:

1. **Retry identity preservation:** known-abort retry does not create a second semantic operation.
2. **Duplicate replay invariance:** replay of committed O does not change authoritative state.
3. **Intent mismatch rejection:** same operation id + materially different intent never becomes replay.
4. **Serializability:** committed outcomes are equivalent to some permitted serial order for commit invariants.
5. **Frozen-basis stability:** unrelated current changes do not alter an intentionally pinned result.
6. **Live-basis sensitivity:** a relevant live predicate change can prevent commit.
7. **No partial local mutation:** failed invariant leaves no authoritative subset of defined atomic mutations.

# Handoff to #49 — observability

Required explanation graph for one committed operation:

```text
operation O
  initiated by actor/delegation D
  interpreted under Action/Ontology revision R
  proposal P (optional)
  approved by A1/A2 under policy revision PR
  state basis B
  physical attempts T1(conflict), T2(committed)
  invariant/policy checks
  local commit receipt CR
  resulting domain changes/events
  effect intents E1/E2
```

For indeterminate commit, observability must show the failed caller exchange and later reconciliation evidence without rewriting the attempt as ordinary failure.

# Handoff to #70 — primitive reduction

Try at least three encodings:

### M1 — native operation lifecycle primitives

`Proposal`, `Approval`, `StateBasis`, `CommitWitness` are engine-native.

### M2 — Action + ordinary typed records/relations + generic transaction guard metadata

Proposal/Approval are domain/governance objects when needed. State basis composes from Functions/predicates/revision references. Commit witness is derived/durable audit graph.

### M3 — pure state-machine/event representation

Every operation stage is an ordinary Event/Fact plus reducers.

Attack M3 especially on authorization/invariant enforcement and indeterminate commit, not only representability.

Current strongest hypothesis is M2. It remains unselected until #46/#70 proves composition can enforce all cases without convention-only holes.
