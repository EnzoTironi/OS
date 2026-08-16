# Candidate laws — transaction and commit semantics

**Issue:** #40  
**Status:** falsifiable Wave B hypotheses. `supported` means the evidence strongly supports the scoped requirement, not that it is accepted architecture.

## L-TX-01 — semantic operation identity survives physical transaction retries

**State:** `supported`.

A known-abort retry should not allocate a new business-operation identity merely because a new database transaction attempt is created.

**Evidence:** PostgreSQL full-transaction retry; FoundationDB retry loops and unknown-result idempotency guidance.

**Falsifier:** operation whose semantics explicitly define every attempt as a separate business occurrence. Then it is not a retry of one semantic operation.

## L-TX-02 — proposal/preview result is not automatically commit result

**State:** `supported`.

Preview is a candidate result under a stated basis. Concurrent state/definitions/authority may change before commit.

**Evidence:** Palantir front-end/apply version gap; Wave A stale-approval cases.

**Falsifier:** proposal is fully determined from immutable pinned inputs and no current non-waivable constraint exists. Then preview can equal committed result by contract.

## L-TX-03 — an approval binds a decision scope, not a mutable boolean field

**State:** `supported`.

Approval must be attributable to the proposal/intent/limits/state basis that was actually reviewed. Material mutation outside that scope invalidates the old approval.

**Falsifier:** domain where approval means unrestricted delegation over all future mutations of an object. That should be modeled as delegation/authority, not sticky approval.

## L-TX-04 — state dependency can be predicate/set-shaped, not only object-version-shaped

**State:** `supported`.

Correctness may depend on absence, aggregate, cardinality, or range membership.

**Evidence:** PostgreSQL Serializable predicate dependencies; FoundationDB range conflict semantics; inventory/uniqueness examples.

**Falsifier:** restricted runtime/domain where all invariants are provably reducible to versions on a fixed finite write set.

## L-TX-05 — exact version checks are a useful mechanism but not a universal commit contract

**State:** `supported`.

CAS protects known key/version assumptions but does not discover undeclared predicates over other keys/rows.

**Evidence:** etcd transaction compare API vs PostgreSQL/FDB predicate/range conflict tracking.

## L-TX-06 — a retry after known serialization conflict reruns all state-dependent decision logic

**State:** `supported`.

Retrying only the failed write can preserve values chosen from a stale snapshot.

**Evidence:** PostgreSQL explicitly requires retry of the complete transaction including logic choosing statements/values.

**Falsifier:** transaction's writes are independent of any reads/state and are commutative/idempotent by definition.

## L-TX-07 — physical retry is semantically transparent only while approval/intent bounds remain satisfied

**State:** `supported` as a bounded law.

A retried transaction may recompute under newer state. If the resulting business decision leaves the approved proposal/limits, it needs re-proposal/reapproval rather than invisible retry.

**Falsifier:** approval explicitly authorizes arbitrary bounded recomputation and the new result remains within those bounds.

## L-TX-08 — commit conflict/abort is not automatically business failure

**State:** `supported`.

Serialization/CAS conflicts can be transient implementation outcomes; runtime can retry or request re-proposal.

**Falsifier:** domain contract explicitly treats inability to commit on first attempt as a business failure/deadline breach.

## L-TX-09 — commit exception is not always evidence that nothing committed

**State:** `supported`.

A client/server database can return an indeterminate commit result after a commit may have become durable.

**Evidence:** FoundationDB `commit_unknown_result` and other unknown-status caveats.

**Falsifier:** physical transaction protocol provides a proven, externally observable exactly-one terminal receipt or known-abort semantics for every failure mode in scope.

## L-TX-10 — indeterminate commit requires stable operation identity and reconciliation/idempotence

**State:** `supported`.

Blind re-execution after unknown status can duplicate a non-idempotent operation.

**Evidence:** FoundationDB guidance to allocate IDs outside retry and use a unique completion marker.

## L-TX-11 — idempotency is operation identity + equivalence/scope/retention semantics, not only a random key

**State:** `supported`.

The runtime must define which repeated request is the same operation and what replay means.

**Evidence:** Stripe v1/v2 deliberately differ in request equivalence, supported methods, retention windows and failed-request replay.

## L-TX-12 — same idempotency identity with materially different intent must be rejected

**State:** `supported`.

Otherwise a duplicate/retry key can authorize a different mutation under old dedupe evidence.

**Evidence:** Stripe v1 rejects parameter mismatch; semantic operation identity requirement.

## L-TX-13 — operation identity should be allocated outside retry-local nondeterminism

**State:** `supported`.

IDs generated independently inside each retry can make duplicate commits look distinct under unknown outcomes.

**Evidence:** FoundationDB unknown-result guidance.

## L-TX-14 — domain invariant and generic atomic enforcement are separate layers

**State:** `supported`.

`debits == credits`, reservation limits and invoice uniqueness stay domain semantics. Generic runtime provides facilities to enforce them atomically.

**Falsifier:** invariant is genuinely universal runtime integrity (e.g. internal record checksum), not business-domain meaning.

## L-TX-15 — no OS-owned authoritative mutation path may bypass required commit guards/invariants

**State:** `supported`.

If one direct CRUD path can mutate the same authoritative state without the Action/policy/invariant transaction discipline, the invariant cannot be guaranteed.

**Evidence:** PostgreSQL consistency guarantees require all relevant participants to use the required isolation/locking discipline; Palantir recommends Actions-only edits for consistent governance.

**Scope:** observations/import evidence that are not OS-authoritative business decisions are not forced through business Actions (#57/#45).

## L-TX-16 — current authorization and historical approval can have different temporal semantics

**State:** `supported` as pressure.

An approval may remain historically valid while current delegation/security/compliance policy can block commit. Conversely a frozen commercial quote may remain valid despite a normal current price rule change.

**Falsifier:** operation contract explicitly pins all authority/policy and no law/security rule requires current reevaluation.

## L-TX-17 — semantic-definition revision binding must be explicit for long-lived proposals

**State:** `supported`.

A proposal cannot silently change meaning because Action/Function/Policy/Ontology definitions changed while it waited.

**Evidence:** Palantir entity/definition version consistency; Wave A ontology revision research.

## L-TX-18 — database transaction lifetime is not business-process lifetime

**State:** `supported`.

Human approval/process can last days; physical transactions are short and mechanism-limited. Persist proposal/approval/basis and open a fresh atomic commit later.

**Evidence:** FoundationDB short transaction window; general database/runtime constraints; Wave A process research.

## L-TX-19 — external side effects are not rolled back merely because code ran inside a retryable database transaction

**State:** `supported`.

Only resource operations participating in the physical transaction's atomicity contract are rolled back. Client memory and remote calls are outside FoundationDB's ACID transaction; equivalent caveat applies generally.

**Handoff:** exact effect mechanism belongs to #41.

## L-TX-20 — local authoritative commit and remote effect outcome are separate causal stages unless a stronger distributed transaction contract proves otherwise

**State:** `supported` as default pressure; not a universal ban on distributed transactions.

A common safe design atomically commits an effect intent/outbox and executes remotely later. A true coordinated distributed protocol may instead couple resources, but must be evaluated explicitly.

## L-TX-21 — committed local mutations must correspond to one serializable/invariant-valid semantic outcome

**State:** `supported`.

Whatever physical mechanism is used, a successful local authoritative business commit must be explainable as an allowed operation over a state satisfying its declared basis and invariants.

**Falsifier:** intentionally eventually consistent domain where temporary invariant violation is itself part of the accepted semantics. Then the invariant was not a commit invariant and must be modeled differently.

## L-TX-22 — commit-result knowledge is provenance/evidence, not identical to durable state

**State:** `supported`.

`Committed`, `DefinitelyNotCommitted`, and `CommitOutcomeIndeterminate` describe what the caller/runtime can establish about durable outcome. The actual storage state exists independently.

**Evidence:** FoundationDB unknown commit status.

## L-TX-23 — frozen state basis does not waive unrelated non-waivable current checks

**State:** `supported` as a contract principle.

Pinning a quote/spec/snapshot does not by itself freeze agent delegation, sanctions, tenant isolation, or other rules that the operation defines as current-at-commit.

## L-TX-24 — serializable storage is sufficient only for invariants encoded/read through that transactional authority

**State:** `supported`.

Serializable isolation cannot protect hidden state in a different uncontrolled authority or writes that bypass its transaction/isolation model.

**Evidence:** PostgreSQL warning about lower-isolation/replica participants; external effects boundary.

# Non-laws / rejected universal claims

- `expectedVersion on the root object protects every business invariant` — rejected.
- `repeatable read == serializable` — rejected for PostgreSQL 18.
- `serialization_failure == business failure` — rejected.
- `retry always means new Action` — rejected.
- `retry is always transparent` — rejected.
- `approval means current state must never change` — rejected.
- `approval means always recompute against latest world` — rejected.
- `all policies should be pinned with approval` — rejected.
- `all policies should be current at commit` — rejected.
- `ACID means caller always knows commit outcome` — rejected.
- `one UUID is a complete idempotency contract` — rejected.
- `database commit version is business operation identity` — rejected.
- `all invariant enforcement must be serializable isolation` — rejected.
- `all invariant enforcement should be CAS` — rejected.
- `remote call inside DB transaction is atomic with DB` — rejected without a distributed atomicity protocol.
- `Transaction`, `StateBasis`, or `CommitWitness` are proven ontology primitives — not established.
