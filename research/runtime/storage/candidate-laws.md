# Candidate laws — physical persistence

**Issue:** #39  
**Status:** falsifiable Wave B hypotheses. `supported` means evidence is strong for the scoped claim, not accepted architecture.

## L-STO-01 — storage representation is not ontology semantics

**State:** `supported`.

A SQL row, KV tuple, graph node, RDF triple, datom, log record, Iceberg row or workflow checkpoint is a physical representation until an explicit mapping/authority contract gives it domain meaning.

**Falsifier:** a deliberately identical semantic/physical DSL where the storage construct is definitionally the ontology construct. Even then, engine internals remain implementation details; the law narrows at that boundary.

## L-STO-02 — each authoritative statement/action family needs an unambiguous write authority

**State:** `supported`.

Two independent writable stores must not both author the same semantic state/transition without an explicit leader/merge/reconciliation protocol.

**Falsifier:** a formally convergent multi-master domain whose merge law is itself the authoritative semantics and cannot produce contradictory committed truth. Scoped exception, not default.

## L-STO-03 — many physical stores do not imply semantic multi-master

**State:** `supported`.

Search, graph, analytics, vector, orchestration and CDC stores can coexist as rebuildable/read-oriented materializations of authoritative data.

## L-STO-04 — rebuildability is the primary test for a derived store

**State:** `supported`.

If deleting a store irrecoverably loses business truth/evidence, it is not merely a cache/index and must satisfy authority/audit requirements for what it uniquely holds.

## L-STO-05 — transaction isolation must match the semantic dependency, not one global slogan

**State:** `supported`.

Exact-version, absence/range, aggregate predicate and immutable-reference Actions require different conflict/basis mechanisms. `ACID` alone is underspecified.

## L-STO-06 — snapshot isolation is insufficient for arbitrary #40 write-skew/predicate invariants

**State:** `supported`.

Concurrent transactions can each observe a valid snapshot and jointly violate a cross-row/set invariant unless a constraint/lock/serialization rule covers that predicate.

**Evidence:** PostgreSQL isolation model; TypeDB snapshot-isolation caveat.

## L-STO-07 — serializable storage does not eliminate semantic operation identity

**State:** `supported`.

A transaction can commit exactly once physically while caller/retry behavior still needs stable LocalOperationId and intent mismatch detection.

## L-STO-08 — operation-id marker/result belongs in the authoritative commit scope

**State:** `supported`.

If operation dedupe is written later in another non-atomic store, crash/failure can expose committed mutation without its semantic replay marker.

## L-STO-09 — business valid time and system/transaction time are distinct concepts

**State:** `supported`.

A contract can be effective before/after the transaction that records it; database transaction history can exist for concepts with no meaningful domain-valid interval.

## L-STO-10 — universal bitemporal semantics are not earned

**State:** `supported` as anti-overgeneralization.

Native valid/system-time databases are useful physical mechanisms, but source capture time, binding effectivity, provider sequence, ontology revision and business occurrence time do not all reduce to exactly one valid/system pair.

## L-STO-11 — native bitemporal storage can still be a valid physical default

**State:** `supported` as possibility.

Rejecting universal semantic bitemporality does not reject a database that physically versions all rows by valid/system time, provided domain code does not attribute false meaning to those axes.

## L-STO-12 — PITR is disaster-recovery history, not application semantic history

**State:** `supported`.

Restoring a PostgreSQL cluster to T reconstructs physical database state at T. It does not answer domain-valid-time, source-provenance, or “what evidence did Action O use?” unless those facts were modeled.

## L-STO-13 — source snapshot knowledge must be storable without fabricated event history

**State:** `supported`.

Observed inventory 108 can exist as an observation/position even when no movement ledger is available.

## L-STO-14 — append-only is a domain-scoped invariant, not universal storage policy

**State:** `supported`.

Accounting/stock/legal ledgers can require reversal/immutable history while drafts, derived projections, PII evidence and caches may legitimately mutate/delete under policy.

## L-STO-15 — immutable/history-oriented databases do not necessarily forbid legal erasure

**State:** `supported` as counterexample.

XTDB exposes `ERASE`; other systems may use excision/crypto-erasure/separate sensitive stores. “History database” must be evaluated against actual deletion guarantees, not assumed incompatible with privacy.

## L-STO-16 — graph-shaped domain/query does not imply graph-native authoritative storage

**State:** `supported`.

Links can be represented relationally/KV/fact-wise and projected to a graph index. Choose graph-native authority only if traversal/workload evidence outweighs transaction/concurrency costs.

## L-STO-17 — graph-native schema/type expressiveness does not prove #40 concurrency correctness

**State:** `supported`.

TypeDB/Neo4j show that relation ergonomics and transaction isolation are separate dimensions.

## L-STO-18 — a log record is not automatically a domain Event

**State:** `supported` by #45/#41 and Kafka scope.

CDC/outbox/Kafka record can be transport/evidence. Domain Event meaning comes from semantic mapping/authority.

## L-STO-19 — transport/log exactly-once does not imply business exactly-once

**State:** `supported`.

Kafka producer/Streams transactions protect Kafka processing scope, not arbitrary #40 state or #41 external systems.

## L-STO-20 — analytical snapshot isolation/time travel does not imply OLTP authority

**State:** `supported`.

Iceberg snapshots/table transactions and ClickHouse analytical guarantees are valuable for derived historical/OLAP reads but do not by themselves implement high-risk multi-entity Action commits.

## L-STO-21 — authoritative current state and historical evidence may share a store without sharing one record shape

**State:** `supported`.

A PostgreSQL/XTDB/Datomic-like authority can host both current state and history while using different tables/types/temporal treatment for different semantic roles.

## L-STO-22 — history should be retained at the semantic granularity required for explanation/correction

**State:** `supported`.

Not every physical row version is important; not every historical decision may be discarded. Preserve exact operation/binding/effect/policy evidence needed to reconstruct governed behavior.

## L-STO-23 — source/provenance history and business ledger history are distinct

**State:** `supported`.

Raw source corrections can supersede observations while accounting postings remain immutable/reversed. One universal history rule loses one side or overconstrains the other.

## L-STO-24 — derived denormalization is safe only with explicit authority, lineage and freshness

**State:** `supported`.

Duplicated values in ClickHouse/graph/search/materialized views are acceptable when consumers know source revision/freshness and cannot write them back as independent truth.

## L-STO-25 — logical replication/CDC does not create a second write authority

**State:** `supported` as architecture law.

Replicas/projections should normally be read-only for replicated semantic statement families. If they accept writes, conflict/authority semantics must be explicit.

## L-STO-26 — restore/PITR cannot roll back an independent external world

**State:** `supported`.

Restoring local DB before a payment/fiscal/marketplace effect occurred requires #41 reconciliation. Replaying the local request blindly can duplicate external effect.

## L-STO-27 — backup correctness includes semantic identities needed for recovery

**State:** `supported`.

LocalOperationId, EffectRequestId, binding/policy revision evidence and authoritative current state must survive/reconstruct under DR strongly enough to prevent duplicate/misattributed operations.

## L-STO-28 — ontology/schema revision identity is independent from physical schema version

**State:** `supported`.

One ontology revision may require several physical migrations; a physical online index migration can occur without changing ontology semantics.

## L-STO-29 — tenant isolation must extend to derived stores and backups

**State:** `supported`.

A tenant-safe primary DB with a cross-tenant leaking graph/vector/analytics index is not a tenant-safe architecture.

## L-STO-30 — deletion/retention must propagate through derivation lineage

**State:** `supported`.

Erasing/redacting source evidence requires locating derived embeddings/search indexes/analytics copies where policy requires deletion, while preserving legally permitted non-sensitive audit outcomes.

## L-STO-31 — storage specialization should be introduced by measured workload, not ontology aesthetics

**State:** `supported` as engineering law.

Add graph, temporal, vector, OLAP, log or custom-KV stores when a competency/performance/security requirement justifies them—not simply because the ontology contains Links/Events/History.

## L-STO-32 — a small authoritative-store count is preferable but not universally one

**State:** `hypothesis`.

One operational authority minimizes distributed consistency. Some subdomains may legitimately require external/legal authorities or independently governed ledgers. The architecture should minimize—not dogmatically eliminate—authoritative boundaries.

## L-STO-33 — PostgreSQL-centered hybrid is the strongest current working hypothesis, not a decision

**State:** `hypothesis`.

It currently covers the highest-risk semantic workloads with the smallest custom trusted storage kernel. It must survive executable concurrency, restore, ontology-evolution and scale tests.

## L-STO-34 — FoundationDB becomes preferable only if the value of its transaction substrate exceeds the custom-layer correctness burden

**State:** `hypothesis`.

AGI reduces implementation labor but not the verification/security/operational consequences of owning query/index/schema/storage layers.

## L-STO-35 — pervasive native temporal correction could make XTDB preferable to explicit Postgres history modeling

**State:** `hypothesis`.

This depends on empirical domain workload frequency and #40 throughput/invariant fit, not philosophical preference for bitemporality.

# Explicit non-laws

Rejected as universal claims:

- `ontology Object = SQL row`;
- `ontology Link = graph edge stored in a graph DB`;
- `domain Event = Kafka/log entry`;
- `PITR = business time travel`;
- `WAL = audit log sufficient for business explanation`;
- `ACID = #40 correctness`;
- `snapshot isolation = serializable`;
- `one row version column is enough for every invariant`;
- `every fact needs valid_from/valid_to`;
- `every fact needs known_from/known_to`;
- `every concept has exactly two time axes`;
- `append-only everywhere is safer`;
- `mutable state destroys auditability`;
- `immutable database cannot support privacy erasure`;
- `graph ontology requires graph database authority`;
- `typed graph database is automatically the best ontology database`;
- `Kafka exactly-once = business exactly-once`;
- `Iceberg serializable table update = business transaction serializable`;
- `ClickHouse should be the OLTP authority because agents generate analytical queries`;
- `logical replica can safely accept authoritative writes to replicated data by default`;
- `single source of truth = one physical database process`;
- `polyglot persistence = semantic multi-master`;
- `derived store can be writable because reconciliation will fix it later`;
- `all raw evidence must be retained forever`;
- `all runtime workflow history belongs in the business audit ledger`;
- `PostgreSQL has been selected`;
- `FoundationDB has been rejected`;
- `XTDB has been rejected`.
