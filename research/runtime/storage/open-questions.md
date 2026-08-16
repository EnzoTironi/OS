# Open questions and downstream handoff

**Issue:** #39  
**Status:** unresolved unless explicitly answered.

# Questions #39 can answer now

## Q-STO-01 — does an executable ontology require a graph database as the authority?

**Answer:** no.

Graph-shaped relations/traversals are real workload requirements, but relational/KV/fact models can represent them and a graph store can be a derived accelerator. A graph-native authority must independently satisfy #40 concurrency/identity/restore requirements.

## Q-STO-02 — should everything be event-sourced/append-only?

**Answer:** no.

Wave B requires immutable/reversal semantics in some ledgers and history/provenance for many records, but current snapshots, mutable drafts, derived projections and privacy-governed evidence are legitimate. Storage must support scoped history laws.

## Q-STO-03 — should every row/object be bitemporal?

**Answer:** no as semantic contract.

Native physical bitemporality remains a valid engine choice, but domain valid time is meaningful only where modeled. Additional clocks such as source capture, provider sequence, binding effectivity and ontology revision remain independent.

## Q-STO-04 — can multiple databases exist without violating one source of truth?

**Answer:** yes.

`single source of truth` is better expressed as **one unambiguous writable authority per statement/action family**. Derived/search/analytics/workflow stores can coexist when their loss is recoverable and their write semantics cannot rival the authority.

## Q-STO-05 — is PostgreSQL currently disproven for the authoritative core?

**Answer:** no; it is currently the strongest working hypothesis.

A real PostgreSQL 18 experiment passed:

- SERIALIZABLE write-skew protection;
- exclusion-based overlap constraint;
- operation marker + business mutation atomicity;
- operation replay/mismatch;
- source-key binding history;
- snapshot observation without fabricated Event.

This is evidence, not selection.

## Q-STO-06 — is FoundationDB ruled out?

**Answer:** no.

It has a stronger/minimal transaction substrate and may become preferable if scale/dynamic-schema requirements justify owning more of the query/index/schema/security kernel. The burden is correctness surface, not coding labor alone.

## Q-STO-07 — is XTDB ruled out because universal bitemporality is not semantic?

**Answer:** no.

Physical bitemporal versioning can be an excellent default. The unresolved question is whether pervasive temporal correction/history in target workloads is valuable enough to outweigh transaction/throughput/operational tradeoffs and semantic-mapping discipline.

# Highest-priority unresolved questions

## Q-STO-10 — physical mapping of dynamic ontology types/properties

This is the biggest remaining H1/H8 risk.

Competing Postgres representations to benchmark later:

```text
A. table-per-object-type + typed columns + generated migrations
B. shared object identity table + typed property tables
C. JSONB/document payload + typed materialized/indexed projections
D. hybrid: stable object table + first-class links + generated hot-property columns
```

Questions:

1. Can ontology additions usually avoid blocking DDL?
2. How are property type changes/versioning handled without rewriting historical Action meaning?
3. Can #40 constraints/invariants remain database-enforceable?
4. Can arbitrary agent queries stay typed/indexable?
5. Can hot paths avoid EAV join explosion/JSON scans?
6. Can interface/shared-property queries span types efficiently?
7. Can one object type have several storage projections without identity duplication?

This belongs jointly to #39/#70; do not lock the physical representation before the metamodel stabilizes.

## Q-STO-11 — high-contention inventory/accounting/action benchmarks

The simple SSI experiment proves correctness, not scale.

Benchmark families:

```text
same SKU/warehouse hot reservation
many lots satisfying aggregate availability
account balance/posting contention
unique/exclusion-heavy agreement creation
operation marker hot retry storms
```

Compare:

- PostgreSQL SSI;
- explicit lock/advisory-lock strategies;
- escrow/reservation records;
- FoundationDB conflict-range implementation;
- XTDB transaction/ASSERT behavior.

## Q-STO-12 — disaster recovery after external-world divergence

Need an executable DR drill, not just a diagram:

```text
T0 DB backup
T1 Action commits EffectRequest E
T2 remote provider succeeds
T3 local DB disaster
restore to T0/T1 boundary
```

Prove recovery does not duplicate E and can ingest/reconcile provider outcome.

Questions:

- which effect/request markers must be in backup/WAL/audit replica?
- can provider receipts/webhooks reconstruct missing local linkage?
- when must operations remain manually indeterminate?
- how are erased/revoked records re-applied after old backup restore?

## Q-STO-13 — multi-region authority

Current research does not justify active-active multi-master operational writes.

Need decide actual requirements:

- RPO/RTO;
- region-local reads;
- region-local writes during partition;
- legal data residency;
- latency targets.

Possible patterns:

```text
single-writer region + replicas/failover
sharded authority by tenant/legal entity
FoundationDB-style distributed serializable cluster
application-defined convergent subdomains
```

Do not pay multi-master complexity without a requirement.

## Q-STO-14 — provenance traversal performance

Relational representation is semantically adequate but may become expensive for:

```text
current value -> decision -> competing observations -> mapping -> source capture
long grant/delegation chains
lineage-equivalent ETL copies
```

Benchmark real HF-scale then 100x/1000x synthetic scale. A derived graph/path index is acceptable if it is rebuildable and freshness is explicit.

## Q-STO-15 — retention/erasure through backup and derivatives

Need concrete privacy lifecycle:

```text
raw blob
relational provenance row
logical/WAL backup
Iceberg historical snapshot
ClickHouse projection
vector embedding
search document
graph edge
```

For each class, define delete/expire/legal-hold/crypto-erasure semantics and restore-time re-erasure.

## Q-STO-16 — authorization authority store

Should grants/delegations live authoritatively in the same operational relational store, or can Cedar/OpenFGA-like relationship storage be authoritative for authorization relations?

Criteria:

- transactional coupling with business grant Actions/budgets;
- current lookup latency;
- historical audit/revision;
- SoD graph traversal;
- revocation latency;
- derived PDP cache/index semantics.

Default pressure is to keep semantic grant authority with the business operation and derive specialized authorization indexes, but #42 does not force this physically.

## Q-STO-17 — blobs/documents

Do not put large PDFs/audio/media in hot relational rows merely for “one database”.

Need object-storage contract:

```text
content hash
immutable/versioned object identity
source/artifact metadata in authority DB
retention/legal hold
encryption/key deletion
access policy
atomic reference publication
orphan cleanup
```

# Handoff to #46 — verification/fuzzing

Promote S-STO-* and CQ-*.

Highest-value executable properties:

1. **authority uniqueness:** derived-store mutation cannot alter authoritative projection without governed admission.
2. **isolation metamorphism:** replacing SERIALIZABLE with snapshot isolation should cause generated write-skew counterexamples; correct Action configuration must reject them.
3. **projection rebuild:** destroy graph/search/analytics projection and rebuild to equivalent semantic read results for a pinned source revision.
4. **history non-conflation:** changing capture/admission time does not change domain valid time unless an explicit mapping says so.
5. **PITR non-world-rewind:** local restore cannot erase already confirmed external effect.
6. **operation replay:** arbitrary crash points before/after commit/checkpoint do not duplicate semantic operation.
7. **retention closure:** deleting source evidence under policy removes all prohibited derived copies while permitted audit records remain.
8. **ontology physical migration invariance:** index/table migration alone does not change semantic object IDs or old Action meaning.

# Handoff to #47 — safe execution/security

Storage capabilities must be mediated:

- domain Functions/agents do not get raw DB superuser access;
- semantic writes go through #40 Action/commit interface;
- derived stores are read-only or narrowly scoped to projector identities;
- test/replay environments cannot connect to production authority by default;
- migration/admin capabilities are separate from business actor authority;
- object-storage credentials are scoped by tenant/environment.

FoundationDB's lack of user-level keyspace ACL is especially relevant if considered directly: a trusted service layer must fully own the security boundary.

# Handoff to #49 — observability/explanation

Storage-level explanation must join, not conflate:

```text
semantic revision / LocalOperation / EffectRequest
source evidence / binding / policy
physical transaction/revision
projection revision/freshness
workflow execution/checkpoint
```

Operators need to see:

- which store is authoritative for this value?
- which replicas/projections are stale?
- which projection revision produced this answer?
- can this store be rebuilt?
- which physical transaction committed Action O?
- what external effects occurred after a restore point?

# Handoff to #63 — modules/composition

Storage adapters/projections can be packaged independently:

```text
postgres authority adapter
clickhouse projector
iceberg snapshot exporter
graph index projector
object artifact store
orchestration backend adapter
```

Package choice must not leak into semantic IDs/types.

# Handoff to #70 — metamodel synthesis

#70 must decide semantic representation before #39 locks physical generic ontology layout.

Important tests:

- Does every Property need first-class statement identity/history, or only some?
- Are Links reified/relator objects sometimes required?
- Which semantic types need valid-time/effectivity?
- Does Process/Commitment add storage identity/lifecycle needs?
- Can Interfaces/shared properties be queried efficiently across physical type partitions?
- Which invariants are declarative enough to compile into DB constraints vs runtime serializable checks?

# Current physical recommendation — deliberately provisional

Use this only as working direction for future experiments:

```text
PostgreSQL 18+ as authoritative OLTP/provenance/governance/effect-request core
  + object storage for large raw artifacts
  + CDC/outbox
  + ClickHouse for real-time OLAP when justified
  + Iceberg for durable analytical snapshots/lakehouse when justified
  + search/vector index for retrieval/entity candidates
  + graph projection only if traversal benchmarks justify it
  + independent durable orchestration backend per #43
```

This is **not selected architecture** until Q-STO-10/11/12 and #70 are sufficiently resolved.
