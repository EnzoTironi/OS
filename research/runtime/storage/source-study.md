# Source study — physical persistence models

**Issue:** #39  
**Method:** current first-party documentation only for technology behavior. Product capabilities are evidence about physical mechanisms, not semantic authority.

# 1. PostgreSQL 18

Primary references:

- <https://www.postgresql.org/docs/18/transaction-iso.html>
- <https://www.postgresql.org/docs/18/sql-set-transaction.html>
- <https://www.postgresql.org/docs/18/rangetypes.html>
- <https://www.postgresql.org/docs/18/ddl-constraints.html>
- <https://www.postgresql.org/docs/18/continuous-archiving.html>
- <https://www.postgresql.org/docs/18/logical-replication.html>

Observed mechanisms relevant to OS:

- `SERIALIZABLE` rejects executions that would produce serialization anomalies and requires application retry on serialization failure.
- PostgreSQL's default remains `READ COMMITTED`; serializable semantics must therefore be selected intentionally for Actions that depend on them.
- range/multirange types and GiST exclusion constraints can enforce non-overlap predicates such as temporal reservations/agreements.
- ordinary relational constraints include primary/foreign/unique/check/exclusion constraints.
- WAL continuous archiving supports cluster point-in-time recovery and recovery timelines.
- logical replication preserves publisher transactional ordering within a subscription; independently writing the same replicated tables on subscribers can introduce conflicts.

### Strength against competency suite

PostgreSQL is a strong candidate for the **authoritative operational write model** because #40 maps naturally to:

```text
short transaction
stable operation marker
relational identities/links
constraints/exclusion indexes
serializable predicate dependency where required
atomic outbox/effect request
```

It also has enough data/index types to keep irregular source metadata and operational traversals local without immediately requiring another authority.

### Important limitations/anti-inferences

- PITR is disaster-recovery time travel, not application semantic history or business valid time.
- logical replication does not make two writable replicas co-authoritative safely.
- normal MVCC row versions are not automatically the historical fact/provenance model required by #45.
- relational representation does not itself solve ontology identity, source binding or temporal semantics.
- `READ COMMITTED` must not silently back high-risk Actions that require #40 predicate/aggregate serializability.

# 2. FoundationDB

Primary references:

- <https://apple.github.io/foundationdb/developer-guide.html>
- <https://apple.github.io/foundationdb/known-limitations.html>
- <https://apple.github.io/foundationdb/consistency.html>
- <https://apple.github.io/foundationdb/anti-features.html>

Observed mechanisms:

- global ACID transactions with strict serializability by default using optimistic concurrency;
- reads/writes create conflict ranges; snapshot reads can deliberately relax conflicts;
- ordered key-value substrate on which relational/document/index layers can be built;
- application-managed secondary indexes can be maintained atomically in the same transaction;
- transactions lasting more than roughly five seconds are unsupported;
- current documented transaction data limit is 10 MB, with guidance to redesign operations substantially above 1 MB;
- FoundationDB itself is not a user-level security boundary: clients that can connect can access the keyspace, so external protection/layers are required.

### Strength

FoundationDB is the strongest low-level candidate for a custom OS storage kernel:

```text
strict serialization
ordered keyspace/range conflicts
custom tuple/identity layout
atomic indexes
horizontal scaling substrate
```

Its short-transaction model aligns with #40's requirement that approvals/waits happen outside the authoritative transaction.

### Cost

The same minimalism moves major responsibilities into OS:

```text
schema/catalog
query planning
joins/traversals
index design
migrations
history representation
temporal representation
constraints beyond conflict ranges
authorization boundary
observability/admin ergonomics
```

This is not merely implementation effort. It increases the semantic surface where a storage-layer bug can violate ontology guarantees.

# 3. XTDB

Primary references:

- <https://docs.xtdb.com/intro/what-is-xtdb.html>
- <https://docs.xtdb.com/about/time-in-xtdb.html>
- <https://docs.xtdb.com/reference/main/sql/queries.html>
- <https://docs.xtdb.com/reference/main/sql/txs.html>

Observed mechanisms:

- XTDB is a relational, transactional, bitemporal database.
- all stored data receives system-time and valid-time versioning automatically;
- SQL queries can independently select `VALID_TIME` and `SYSTEM_TIME` bases;
- transactions support normal temporal DML plus `ASSERT`, which aborts the transaction when a predicate is false;
- `ERASE` irretrievably removes all valid/system-time history for a document, explicitly supporting legal erasure use cases despite the otherwise immutable history model;
- current/default queries are optimized as ordinary current-world reads despite retained bitemporal history.

### Strength

XTDB directly addresses several hard temporal questions:

```text
what is valid/effective at T?
what did the database know/claim at system time K?
what is the current state after historical corrections?
```

It is a serious candidate for domains with pervasive effective-dating/regulatory history.

### Proof burden

Wave B found more temporal axes than one generic valid/system pair:

```text
source capture time
provider sequence
mapping revision
binding effectivity
ontology revision
business occurrence/effective time
runtime scheduling time
```

XTDB can store additional axes as domain data, but its physical bitemporal defaults can encourage semantic overreach if `_valid_*` is treated as meaning every concept's domain validity.

#39 therefore must distinguish:

> native database temporal capability

from:

> universal semantic claim that every business record has meaningful valid/system time.

# 4. Datomic

Primary references:

- <https://docs.datomic.com/reference/filters.html>
- <https://docs.datomic.com/transactions/transaction-functions.html>
- <https://docs.datomic.com/schema/schema-reference.html>
- <https://docs.datomic.com/reference/best.html>

Observed mechanisms:

- immutable fact/datoms with transaction identity/time;
- `history`, `as-of`, and `since` database views expose historical/system-time perspectives;
- uniqueness can be identity-like or value-like; `:db.unique/identity` supports upsert/unification;
- `db/cas` supports single-datom optimistic concurrency;
- pure transaction functions receive `db-before` + args and can validate/transform transaction data;
- Datomic encourages additive/accretive schema practices and historical querying.

### Strength

Datomic is a strong donor/candidate for:

```text
historical system state
append/retract fact provenance
stable identity/lookup refs
querying historical revisions without separate history tables
```

### Proof burden

- system transaction history is not automatically business valid time;
- #45 unresolved evidence/missingness/source snapshots may become awkward if every operational notion is decomposed into generic datoms;
- #40 aggregate/predicate invariants need executable proof under the transaction-function model, not assumptions based on CAS alone;
- high-churn/current operational state, analytical scans and retention/privacy must be evaluated against the fact-history model.

# 5. TypeDB 3.x

Primary references:

- <https://typedb.com/docs/core-concepts/typedb/transactions/>
- <https://typedb.com/docs/typeql-reference/pipelines/put/>

Observed mechanisms:

- typed entities/relations/attributes and expressive relation-oriented TypeQL;
- ACID transactions up to **snapshot isolation**;
- current docs explicitly note that concurrent `put` operations can both insert when the pattern is not protected by a cardinality/key/unique constraint;
- cardinality/key/unique restrictions are validated across concurrent transactions and can prevent constrained duplicates.

### Strength

The physical data model is unusually close to ontology-shaped relationships and can reduce impedance for deep typed traversal.

### Critical #40 pressure

Snapshot isolation is not sufficient for arbitrary write-skew/phantom predicate invariants. Constraints solve an important subset, but #40 also requires cases like aggregate availability and cross-object negative/absence predicates.

TypeDB can still be viable if OS proves a concurrency/serialization mechanism around every affected Action, but it cannot receive a free pass merely because its type system resembles an ontology.

# 6. Neo4j current

Primary references:

- <https://neo4j.com/docs/operations-manual/current/database-internals/>
- <https://neo4j.com/docs/operations-manual/current/database-internals/concurrent-data-access/>

Observed mechanisms:

- ACID transactions;
- default isolation is Read Committed;
- automatic node/relationship write locking;
- traversal reads are not automatically protected from concurrent modification and non-repeatable reads can occur;
- stronger serialization can be simulated by explicitly taking locks on a common node/resource;
- rich graph traversal/index/constraint capabilities.

### Strength

Excellent physical fit for traversal-heavy relationships and explainability paths.

### Proof burden as authority

The default isolation level is weaker than the #40 semantic contract for many aggregate/predicate Actions. Explicit common-node locking can implement a stronger serialized domain **when** all competing mutations share that lock, but that becomes application protocol that must be proved/fuzzed.

This makes Neo4j easier to justify initially as a **derived graph index** than as the universal write authority.

# 7. Apache Jena TDB2 / RDF

Primary references:

- <https://jena.apache.org/documentation/txn/transactions_tdb.html>
- <https://jena.apache.org/documentation/tdb2/>

Observed mechanisms:

- RDF/SPARQL-native physical model;
- serializable transactions;
- TDB2 uses MVCC/copy-on-write structures;
- multiple readers but one active writer (writers can be queued/managed by the system);
- TDB2 removed older TDB1 transaction-size limits.

### Meaning for OS

Jena disproves the simplistic claim that “semantic/RDF graph databases are inherently weak transactionally”. It provides strong isolation.

However, the single-active-writer model is a major OLTP throughput/scaling constraint for a general business write authority. RDF remains valuable for interoperability, knowledge exchange or a derived semantic query surface.

# 8. Apache Kafka 4.0

Primary references:

- <https://kafka.apache.org/40/streams/developer-guide/config-streams/>
- <https://kafka.apache.org/40/javadoc/org/apache/kafka/clients/producer/KafkaProducer>

Observed mechanisms:

- Kafka Streams supports `exactly_once_v2` within Kafka's processing model;
- transactional producers can atomically produce records to Kafka partitions/topics under a transactional ID;
- read-committed consumers can avoid observing aborted transactional writes;
- idempotent producer/fencing semantics provide strong messaging guarantees within the Kafka protocol.

### Meaning for OS

Kafka is excellent for:

```text
CDC/change transport
outbox publication
projection pipelines
analytics ingestion
replayable integration streams
```

But Kafka exactly-once is scoped to Kafka transactions/processing. It does not enforce #40's arbitrary business invariant over current operational state, nor does a Kafka record automatically become a domain Event.

A Kafka log is therefore normally **transport/derived history**, not the sole semantic write authority.

# 9. Apache Iceberg 1.11

Primary references:

- <https://iceberg.apache.org/docs/latest/api/>
- <https://iceberg.apache.org/docs/latest/branching/>
- <https://iceberg.apache.org/docs/latest/spark-queries/>
- <https://iceberg.apache.org/javadoc/latest/org/apache/iceberg/IsolationLevel.html>

Observed mechanisms:

- table metadata references immutable snapshots;
- snapshot/time-travel reads and branch/tag references;
- transactions group multiple changes to one Iceberg table into an atomic table-level commit;
- row-level operations can select snapshot or serializable isolation semantics depending on engine/operation support;
- snapshots have explicit lifecycle/expiration policies.

### Strength

Excellent derived analytical/audit snapshot layer:

```text
large scans
reproducible analytical snapshots
schema evolution
branch/tag experiments
historical table states
```

### Boundary

Iceberg transactions are fundamentally **table/snapshot metadata transactions**, not a general replacement for #40 multi-entity operational concurrency/invariant semantics across an executable business model.

It is far easier to justify as a derived analytical authority for named exported datasets/snapshots than as OLTP write authority.

# 10. ClickHouse current

Primary references:

- <https://clickhouse.com/blog/postgres-clickhouse-oss>
- <https://clickhouse.com/blog/update-performance-clickhouse-vs-postgresql>

ClickHouse's own current material describes the common architecture as:

```text
PostgreSQL -> transactional OLTP/system of record
ClickHouse -> analytical OLAP at scale
```

and explicitly contrasts PostgreSQL's full transactional default with ClickHouse's different columnar execution/transaction guarantees.

### Meaning for OS

ClickHouse is a strong derived target for:

- marketplace/sales analytics;
- operational telemetry;
- process/action outcome analysis;
- large history scans;
- near-real-time analytical projections.

It is not the initial candidate for #40 authoritative operational commit.

# 11. Cross-source conclusions

## 11.1 Strong transaction substrate does not imply semantic completeness

FoundationDB proves this most clearly: strict serializability is excellent, but query/schema/index/security/temporal semantics become application layers.

PostgreSQL adds more of those facilities without making them business semantics automatically.

## 11.2 Ontology-shaped physical model does not imply sufficient write authority

TypeDB/Neo4j provide excellent relation-oriented data models, but their default isolation semantics require extra proof for #40 predicate/write-skew workloads.

Jena shows the opposite trade-off: strong serializability, but one active writer.

## 11.3 Native temporal history is a capability, not a universal ontology law

XTDB and Datomic make historical queries radically simpler, but their time/history models still need mapping to actual business temporal semantics.

## 11.4 Logs and analytical snapshots have scoped exactly-once/transaction semantics

Kafka and Iceberg have strong guarantees in their own transaction domains. Those domains do not automatically coincide with a high-risk business Action commit.

## 11.5 The physical architecture can be polyglot without semantic multi-master

A coherent pattern is emerging:

```text
one authoritative write path for a statement/action family
            │
            ├─ CDC/log transport
            ├─ graph/query projection
            ├─ search/vector projection
            ├─ analytical/lakehouse projection
            └─ orchestration runtime memory
```

The presence of many stores is not itself split-brain. Split-brain begins when two stores can independently author the **same semantic state/transition** without an explicit authority/reconciliation contract.
