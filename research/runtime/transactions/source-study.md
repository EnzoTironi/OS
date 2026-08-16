# Source study — transactions, concurrency, retries, and idempotency

**Issue:** #40  
**Retrieved/rechecked:** 2026-08-16  
**Decision:** source observations only; architecture remains `undetermined`.

Primary sources were selected because they expose materially different concurrency/idempotency mechanisms while letting us derive an implementation-neutral contract.

# 1. PostgreSQL 18 — serializable execution, application retry, and predicate dependencies

Primary sources:

- Transaction isolation: <https://www.postgresql.org/docs/18/transaction-iso.html>
- Application-level consistency: <https://www.postgresql.org/docs/18/applevel-consistency.html>
- Serialization failure handling: <https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html>
- SET TRANSACTION: <https://www.postgresql.org/docs/18/sql-set-transaction.html>

## E-TX-PG-01 — Read Committed is not a sufficient generic invariant contract

PostgreSQL's default `READ COMMITTED` takes a new snapshot for each statement and explicitly documents cases where an updating command can see a view that combines concurrent changes in ways unsuitable for complex search/update conditions.

**Pressure:** a generic business commit cannot simply assume the default SQL isolation level protects arbitrary cross-object/predicate invariants.

## E-TX-PG-02 — Repeatable Read is stable-snapshot isolation but can still admit serialization anomalies

PostgreSQL's Repeatable Read holds one transaction snapshot and eliminates several anomalies, but the documentation states that the resulting committed set need not correspond to any serial execution. It specifically warns that application-level business rules at this level need careful locking/other help.

**Pressure:** `stable snapshot` and `serializable business commit` are distinct requirements.

## E-TX-PG-03 — Serializable protects predicate/read-write dependencies, not just row versions

PostgreSQL Serializable monitors read/write dependencies and uses nonblocking predicate locks to detect cases that could produce a serialization anomaly. The documentation's aggregate example shows two transactions reading different classes, writing each other's derived results, and one being aborted because both commits cannot be serialized.

**Pressure:** a state dependency can be a predicate/set/aggregate, not just `object version == N`. A row-level CAS alone is not universally sufficient.

## E-TX-PG-04 — transaction results are not valid until successful commit under Serializable

The docs state that data read in a normal serializable transaction must not be treated as valid for the transaction's purpose until the transaction successfully commits, because the transaction itself may later be aborted by serialization detection.

**Pressure:** a preview/calculation performed inside a retryable commit attempt cannot be published as final merely because its reads succeeded.

## E-TX-PG-05 — retry means rerun the complete transaction logic

On `serialization_failure` (`40001`), PostgreSQL requires retrying the **complete transaction**, including application logic that decides which SQL and values to issue. PostgreSQL does not provide an automatic correctness-preserving retry because it cannot know that surrounding logic.

**Pressure:** physical retry belongs around the full semantic calculation/validation needed for that attempt, not only around the failed write statement.

## E-TX-PG-06 — a constraint failure can be a concurrency symptom but is not always retryable

The docs note that some unique/exclusion violations can arise from concurrent key selection patterns and may deserve retry, while the same error classes can also indicate persistent invalid input.

**Pressure:** error code alone does not define semantic retryability. The operation contract and failure cause matter.

## E-TX-PG-07 — all participants must honor the concurrency discipline

PostgreSQL's application consistency guidance warns that serializable integrity protection only applies when relevant writes/reads use the required isolation; lower-isolation writers can subvert the assumption.

**Pressure:** a semantic invariant cannot rely on a database mechanism that bypass paths are allowed to ignore. Generic direct-write escape hatches can invalidate commit guarantees.

# 2. FoundationDB — strict serializability, explicit conflict ranges, and unknown commit result

Primary sources:

- Developer Guide: <https://apple.github.io/foundationdb/developer-guide.html>
- Python API: <https://apple.github.io/foundationdb/api-python.html>
- Automatic idempotency: <https://apple.github.io/foundationdb/automatic-idempotency.html>
- Architecture: <https://apple.github.io/foundationdb/architecture.html>

## E-TX-FDB-01 — strict serializability through MVCC + optimistic conflict detection

FoundationDB gives transactions a snapshot/read version and rejects conflicting transactions at commit. It tracks read and write conflict ranges and exposes explicit conflict-range APIs.

**Pressure:** serializable enforcement can be optimistic and can operate over ranges/predicates rather than pessimistically locking each domain object.

## E-TX-FDB-02 — conflict ranges are part of physical enforcement, not business semantics

FoundationDB allows snapshot reads that intentionally avoid creating read conflicts, plus explicit conflict ranges that restore only the dependency actually needed. Its documentation gives a case where reading an entire range would over-conflict, while the semantic requirement is only that the selected key remain unchanged.

**Pressure:** physical read set can be stronger than the semantic state basis. A runtime should preserve the narrow business dependency and compile it into suitable guards rather than defining the domain by accidental DB reads.

## E-TX-FDB-03 — only database operations are rolled back by transaction retry

The developer guide explicitly warns that mutating ordinary client memory inside the retry loop is not rolled back when the FoundationDB transaction conflicts and retries.

**Pressure:** executing an external HTTP call, sending a message, generating a new semantic ID, or mutating another authority inside a DB retry loop is not made transactional by the database.

## E-TX-FDB-04 — `commit_unknown_result` means the local commit may already have happened

FoundationDB can return `commit_unknown_result` when the client cannot determine whether a commit succeeded. Its normal retry machinery treats that error as retryable, so an unguarded retry can execute the transaction twice.

**Pressure:** even local authoritative commit has an epistemic outcome distinct from the actual durable outcome. `failed RPC` is not equal to `definitely aborted transaction`.

## E-TX-FDB-05 — idempotence needs a stable operation marker outside retry-local generation

FoundationDB recommends generating unique IDs outside retry loops and checking/writing a unique completion marker in the transaction so a retried unknown commit does not apply the semantic effect twice.

**Pressure:** operation identity must survive physical transaction attempts. Retry-local random IDs destroy deduplication.

## E-TX-FDB-06 — some unknown-status errors are even weaker than `commit_unknown_result`

Current FoundationDB docs note errors such as timeout/cancellation where the client may lack the guarantee that an already-sent old transaction is no longer able to commit, making blind retry even trickier.

**Pressure:** commit uncertainty needs typed recovery semantics; not every timeout belongs in one `unknown` bucket with identical guarantees.

## E-TX-FDB-07 — transaction duration is a mechanism limit, not a domain-process limit

FoundationDB resolves conflicts only over a short transaction window and throws `transaction_too_old` for long attempts.

**Pressure:** a human approval/workflow lasting hours or days cannot be one open database transaction. Proposal/approval/process state must be durable outside the final short atomic commit.

# 3. etcd v3.6 — explicit compare-and-swap as a small commit guard

Primary source:

- etcd API v3.6: <https://etcd.io/docs/v3.6/learning/api/>

## E-TX-ETCD-01 — transaction as atomic If/Then/Else over explicit comparisons

etcd transactions atomically test comparisons over key value/version/create/modification revision and execute a success or failure request list. This is the primitive for compare-and-swap and higher-level concurrency control.

**Pressure:** exact-version/state guards can be expressed explicitly when the semantic dependency is known and narrow.

## E-TX-ETCD-02 — explicit CAS does not automatically discover hidden predicates

The etcd transaction only protects the comparisons declared in the request. It does not infer that a business decision depended on an aggregate/query over unrelated keys unless the client encodes a suitable guard.

**Pressure:** CAS is a useful backend for `ExactVersion`-like state basis but not proof that all business dependencies reduce to object versions.

## E-TX-ETCD-03 — one atomic revision can cover several local writes

Mutations in one successful etcd transaction share one store revision.

**Pressure:** a durable commit can expose a single physical revision/receipt useful for causality, but a store revision is not itself the business operation identity.

# 4. Stripe — mature idempotency APIs show key semantics are contextual

Primary sources:

- API v1 idempotent requests: <https://docs.stripe.com/api/idempotent_requests>
- API v2 overview/idempotency: <https://docs.stripe.com/api-v2-overview>

Stripe is used here as an **idempotency-contract donor**, not as evidence for database transaction semantics.

## E-TX-STRIPE-01 — idempotency key is bound to request semantics and a retention scope

Stripe v1 stores the first started request's status/body for a key and rejects reuse with mismatched parameters while the key is retained. It documents a retention period after which reuse can become a new request.

**Pressure:** `idempotency_key` without operation namespace, parameter identity and retention semantics is underspecified.

## E-TX-STRIPE-02 — one platform can intentionally define different idempotency semantics in different API generations

Stripe v1 and v2 differ in supported methods, replay scope/window, and behavior after failed/partially failed requests. v2 considers API + account/sandbox + time window in replay identity and can re-execute failed requests while preventing duplicate side effects.

**Pressure:** there is no universal vendor idempotency behavior to copy. OS must define idempotency at the semantic operation level.

## E-TX-STRIPE-03 — validation/pre-execution failures need not consume the idempotency result

Stripe v1 stores an idempotent result only after endpoint execution begins; request validation failures or concurrent conflicts that prevent execution can be retried.

**Pressure:** `attempt received` and `semantic operation began/committed` can have distinct dedupe states.

# 5. Palantir Actions — transaction/action semantics and the stale-front-end problem

Primary sources:

- Submission criteria: <https://www.palantir.com/docs/foundry/action-types/submission-criteria>
- Permissions: <https://www.palantir.com/docs/foundry/action-types/permissions>
- How user edits are applied / entity version control: <https://www.palantir.com/docs/foundry/object-edits/how-edits-applied>
- Object edits overview: <https://www.palantir.com/docs/foundry/object-edits/overview>
- Action log: <https://www.palantir.com/docs/foundry/action-types/action-log>

## E-TX-PAL-01 — business submission criteria evaluate user/parameter/object state at action submission

Palantir submission criteria can depend on the current user and object parameter properties; the official aircraft example explicitly evaluates aircraft operating status at the moment the Action is submitted.

**Pressure:** mature operational ontology products recognize that action admissibility depends on state, parameters and actor context, not CRUD permission alone.

## E-TX-PAL-02 — front-end state and apply-time state can differ

Current entity-version-control docs explicitly describe a user loading object versions in a form and the Actions server later loading potentially different versions because the `/apply` request does not include those front-end object versions by default.

**Pressure:** a preview/form state is not automatically a commit witness. If a decision intends to bind what the user saw, the basis must be explicitly carried/pinned.

## E-TX-PAL-03 — action execution loads definitions and object instances whose versions can change

Palantir notes that object definitions and instances are used through validation, Functions and side effects, and version consistency is required to avoid acting on the wrong version.

**Pressure:** semantic definition revision and data revision are both potential commit dependencies.

## E-TX-PAL-04 — Actions are local transaction boundaries, but side-effect success can differ

Palantir describes an Action as a single transaction changing one or more objects. Its permissions docs also note that notification side effects can fail while edits succeed.

**Pressure:** local commit and external/notification side effects must be separate outcomes. #41 owns the latter.

## E-TX-PAL-05 — Action log makes submitted decisions durable data

Action log object types can record action submissions as Ontology data for decision/audit workflows.

**Pressure:** the semantic operation identity/result deserves durable explainability independent of the low-level storage transaction.

# 6. Wave A + #45 pressure

Internal sources:

- `research/foundation/action-event-effect/...`
- `research/kill/action-mutation/...`
- `research/kill/fact-bitemporal/...`
- `research/domain/inventory/...`
- `research/domain/accounting/...`
- `research/runtime/ingest/...` (#45)
- `research/agi/fuzzing/...`

## E-TX-WA-01 — Action is not universal persistence, but governed decisions need named operation semantics

Wave A rejected Action-as-universal-write API. Source observations/imports can arrive without an OS Action. But OS-authoritative business decisions should not degrade into generic mutable-field writes that bypass policy/invariants/audit.

## E-TX-WA-02 — approval needs explicit state basis

The fuzzing review corrected `always reread current world`: live-at-commit decisions and intentionally frozen-snapshot decisions are both legitimate.

## E-TX-WA-03 — domain invariants differ in dependency shape

Inventory reservation can depend on an aggregate/predicate across lots/reservations; accounting posting may need all journal lines atomically balanced; uniqueness/duplicate invoice rules can rely on scoped keys; high-risk identity binding from #45 can depend on exact evidence/revision.

**Pressure:** commit guard vocabulary cannot be only `expectedVersion` on one object.

## E-TX-WA-04 — semantic revisions matter

Ontology/function/policy revision can change while a proposal/approval is open. Historical explanation cannot silently evaluate the earlier decision under whatever definition is current later.

# 7. Convergence matrix

| Semantic pressure | PostgreSQL | FoundationDB | etcd | Stripe | Palantir | Wave A/#45 |
| --- | --- | --- | --- | --- | --- | --- |
| atomic local commit | strong | strong | strong | API-local | strong | required |
| predicate/set dependency | strong Serializable | conflict ranges | explicit only | n/a | partial/version checks | strong |
| exact version/CAS guard | possible | possible | strong | request identity | partial/version | strong |
| whole-logic retry after conflict | explicit | explicit retry loop | client-defined | request replay | product-defined | required distinction |
| unknown local commit outcome | client/network can exist, less explicit in docs | **strong explicit** | transport-dependent | request-layer problem | not main focus | must model |
| stable operation identity across attempts | app responsibility | recommended | app responsibility | strong | action submission/log | strong |
| idempotency key scope/retention | app-defined | app marker | app-defined | explicit | action-specific | required |
| preview/front-end may go stale | app concern | app concern | app concern | n/a | **explicit** | strong |
| semantic definition revision can change | app/schema concern | app concern | app concern | API version | explicit ontology defs | strong |
| external effects outside local atomicity | app concern | explicit retry caveat | app concern | API itself remote | side effects can diverge | #41 boundary |

# 8. Main disagreements / lessons

## D-TX-01 — explicit dependency declaration vs automatic serializable conflict discovery

etcd/CAS-like mechanisms require the caller to name the exact key/version predicates. PostgreSQL Serializable and FoundationDB normal reads can infer broad physical conflict dependencies from what the transaction reads.

**Research conclusion:** the business operation should declare/derive its **semantic state basis**, while the runtime may use either explicit guards or a stronger serializable mechanism. Physical read set is not necessarily the canonical semantic dependency graph.

## D-TX-02 — transaction retry can be transparent physically but not semantically

PostgreSQL/FDB encourage retries after definitely aborted conflicts. Yet a retry may see new data and recompute a materially different result.

**Research conclusion:** physical retry is transparent only while the operation's intent, approval scope and declared state-basis contract allow re-evaluation. Otherwise a conflict escalates into a new proposal/reapproval, not an invisible retry.

## D-TX-03 — `unknown commit` is not the same as conflict/abort

FoundationDB explicitly separates known-not-committed conflicts from commit-unknown errors.

**Research conclusion:** a runtime must not report all transaction exceptions as business failure. Unknown durable outcome requires dedupe/reconciliation by stable operation identity.

## D-TX-04 — idempotency behaviors legitimately vary

Stripe v1/v2 demonstrate different yet intentional replay semantics. FoundationDB's marker technique protects a transaction, not an HTTP API response contract.

**Research conclusion:** idempotency must be defined per semantic operation: what counts as the same operation, which result is replayed/recomputed, for how long, and under which caller/tenant/revision scope.

## D-TX-05 — front-end preview state is not necessarily execution state

Palantir explicitly documents this gap. A system can choose submit-time re-evaluation, optimistic version binding, or a deliberately frozen proposal.

**Research conclusion:** state basis belongs in the operation contract, not as an accidental consequence of UI timing.

# 9. Source-study conclusion

The sources converge on a stronger model than `transaction = database BEGIN/COMMIT`:

```text
semantic operation identity
+ declared state dependency/basis
+ definition/policy/authority revision
+ atomic local invariant enforcement
+ replay/idempotency contract
+ typed commit outcome evidence
```

The physical database can enforce this via serializable transactions, CAS, conflict ranges, locks, constraints, or combinations. The semantic contract must survive changing that mechanism.
