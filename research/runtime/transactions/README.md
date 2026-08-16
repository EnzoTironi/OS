# Transaction, concurrency, idempotency, and commit semantics

- Artifact ID: `issue-0040-commit-semantics`
- Issue: <https://github.com/EnzoTironi/OS/issues/40>
- Track: Wave B runtime boundary research
- Date: 2026-08-16
- Base: Wave A frozen snapshot + merged #45 ingest/entity-resolution contract
- Decision: none. This folder defines an implementation-neutral **commit contract** and adversarial litmus suite; it does not select PostgreSQL, FoundationDB, etcd, a lock protocol, or a transaction manager.

## Question

What must an executable business operation bind and revalidate so that concurrent execution, approval, policy, invariants, retries, idempotency, ontology revision, and ambiguous commit outcomes remain semantically correct?

The wrong question is:

```text
which database gives us ACID?
```

The right question is:

```text
what did this operation mean,
what assumptions did it rely on,
what authority/revision approved it,
what must still hold at commit,
and what do we know actually committed?
```

## Core result

A **semantic operation** and a **physical transaction attempt** are not the same identity.

```text
Operation / Action invocation O
  stable intent + parameters + actor/delegation + semantic revisions
        │
        ├── optional Proposal / Preview P
        │      computed result + declared State Basis B
        │
        ├── optional Approval A
        │      approves P / limits / basis / expiry / authority
        │
        ▼
Commit attempt T1
  reauthorize + revalidate B + enforce invariants
        │
        ├── definitely aborted / conflict
        │       │
        │       └── retry physical transaction under O if contract permits
        │
        ├── committed
        │
        └── outcome indeterminate
                │
                └── reconcile/dedupe by stable operation identity before
                    deciding whether another attempt is safe
```

A retry can therefore be:

- **physical retry** — same semantic operation, same operation identity, transaction re-executes after a definitely-aborted conflict;
- **semantic re-evaluation** — same high-level user goal, but the world changed enough that a new proposal/result/approval may be required;
- **duplicate replay** — same operation arrives again and should return/reconstruct the already committed result;
- **new operation** — parameters/intent/basis changed materially; reusing the old idempotency identity is invalid.

## The commit witness

The strongest working hypothesis is that a governed operation needs a **commit witness** (research term, not primitive) sufficient to explain and enforce the decision:

```text
operation identity
operation/action definition revision
parameters / intent digest
actor + delegation / authority context
proposal identity, if any
approval identity/scope, if any
declared state basis / assumptions
policy / invariant / function revisions that matter to the decision
idempotency scope
physical transaction attempt(s)
commit outcome evidence
resulting durable domain mutations / occurrences
```

The witness is not necessarily one stored object. It can be composed from ordinary records/relations and durable transaction metadata if #70 finds that sufficient.

## State basis is explicit, not “always reread everything”

Wave A already broke the simplistic rule `approval -> reread current world -> commit`.

An operation can depend on different kinds of state:

```text
ExactVersion(resource, revision)
Predicate(condition, dependency set)
ImmutableReference(definition/evidence revision)
FrozenSnapshot(snapshot/hash)
CurrentAtCommit(query/predicate)
NoRelevantStateDependency
```

These are research vocabulary, not proposed language syntax.

Examples:

- reserve 7 units: requires a live predicate such as available quantity >= 7 at commit;
- approve a quoted fixed price: may intentionally bind a frozen quote/snapshot for a validity interval;
- pay supplier invoice: exact legal counterparty/invoice binding + current non-waivable payment controls may be required;
- ingest identity merge: approval may bind the exact candidate evidence set, or require no contradictory legal identifier at commit;
- historical posting: accounting period/rule revision may be pinned while authorization to post can still be current.

## Serializable transaction is a mechanism, not the semantic contract

PostgreSQL Serializable and FoundationDB strict serializability show that a runtime can detect hidden read/write conflicts without requiring the business model to enumerate every row version manually. etcd transactions show the opposite end: explicit compare-and-swap guards can encode exact version/value assumptions over known keys.

The semantic layer should therefore be able to compile the same state-basis requirement into different physical guards:

```text
semantic dependency            possible physical enforcement
────────────────────────────────────────────────────────────
object version unchanged       CAS / mod_revision / version column
predicate still holds          SERIALIZABLE predicate tracking / lock / constraint
unique business key            unique constraint + transaction / serializable check
multi-object invariant         serializable tx / explicit locking / constraint/evaluator
frozen immutable snapshot      content hash / revision pin
no dependency on hot counters  snapshot read + targeted conflict guard, if safe
```

No mechanism is universally best. The runtime must preserve the semantic dependency, not expose storage accident as the domain contract.

## Commit outcomes

The caller-visible result must not be only `success | failure`.

Candidate semantic outcome classes:

```text
Committed
DefinitelyNotCommitted(reason)
CommitOutcomeIndeterminate(evidence)
```

FoundationDB is direct evidence that even a local transactional database can report an unknown/indeterminate commit result after the commit request was sent. Therefore `unknown` is not only an external-effect problem.

`CommitOutcomeIndeterminate` does **not** mean the database transaction is still in flight forever. It means the caller cannot establish from the failed exchange whether the durable commit happened. The recovery path uses the stable operation identity / durable effect marker / reconciliation evidence.

## Idempotency is an operation contract, not a UUID field

A useful idempotency identity must bind at least:

```text
operation namespace/type
operation/idempotency key
caller/tenant/account scope
intent/parameter identity
retention/replay window
committed result or outcome evidence
```

Stripe's v1/v2 APIs are useful evidence that even one mature platform gives different idempotency semantics by API generation: replay scope, retention window, failed-request behavior, and result reuse differ. Therefore OS must define its own operation-level semantics rather than copying one vendor's key behavior.

A physical retry after a serialization failure should normally preserve the same semantic operation identity. If recomputation changes intent/parameters or invalidates approval, the runtime must stop pretending it is the same approved operation.

## What commit must protect

The generic engine must be able to make the following atomic with respect to the local authoritative mutation:

1. operation dedupe/admission marker where required;
2. state-basis validation that is part of the commit contract;
3. current authorization/non-waivable policy checks that are defined as commit-time checks;
4. domain invariant enforcement;
5. all local mutations that form one business commit;
6. durable record/evidence that the operation committed and what semantic revision/basis it used;
7. creation of any **intent to perform external effects** that must causally follow this commit, if the architecture uses an outbox/effect-request pattern.

Actual remote side effects are not made magically atomic with the database by this contract. #41 owns their attempt/unknown/reconciliation semantics.

## What this research refuses

```text
approval = sticky boolean forever
preview result = commit result
read committed = safe for arbitrary cross-object invariants
repeatable read = serializable
row version check = sufficient for every predicate invariant
serialization failure = business failure
retry = new business decision
retry = always safe
same idempotency key + different intent = okay
transaction timeout = definitely aborted
ACID commit = caller always knows whether commit happened
external HTTP call inside retry loop = transactional because DB is ACID
latest ontology/policy revision silently reinterprets an approved proposal
```

## Files

| File | Purpose |
| --- | --- |
| [`source-study.md`](source-study.md) | PostgreSQL 18, FoundationDB, etcd, Stripe, Palantir + Wave A/#45 evidence |
| [`commit-contract.md`](commit-contract.md) | proposal/approval/state-basis/commit/retry/outcome semantics |
| [`candidate-laws.md`](candidate-laws.md) | falsifiable laws and non-laws |
| [`adversarial-cases.md`](adversarial-cases.md) | concurrency, stale approval, retry, unknown-result and revision litmus cases |
| [`reference_model.py`](reference_model.py) | small executable research model for basis/retry/dedupe semantics |
| [`test_reference_model.py`](test_reference_model.py) | regression/litmus tests; not production runtime |
| [`open-questions.md`](open-questions.md) | handoff to #41/#42/#39/#46/#49/#70 |

## Current primitive-reduction result

This pass does **not** earn `Proposal`, `Approval`, `StateBasis`, `CommitWitness`, `Transaction`, or `IdempotencyKey` as ontology root sorts.

The current strongest hypothesis is:

- business `Action`/operation semantics remain explicit;
- proposal/approval are ordinary typed business/governance records when the domain requires them;
- a generic engine provides transactionality, version/predicate guards, invariant/policy enforcement, dedupe/idempotency, revision pinning, and commit-result evidence;
- a `commit witness` can be a composed durable record/graph rather than a new primitive.

#70 must still attack whether any of those capabilities require first-class metamodel semantics.
