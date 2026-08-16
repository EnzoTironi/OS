# Architecture candidates — physical persistence designs

**Issue:** #39  
**Status:** comparative hypothesis. No architecture selected.

Scoring vocabulary:

```text
PASS       directly/natively supports the requirement
PASS*      valid with an explicit application/storage pattern that must be tested
DERIVED    suitable as a read/index/analytics projection, not authoritative write path
FAIL       conflicts with a hard semantic requirement in the proposed role
UNKNOWN    requires executable benchmark/proof before judgment
```

A candidate does not win by total PASS count. A failure in #40 serializable correctness, operation identity, authority uniqueness, restore safety, or historical explainability outweighs many query conveniences.

# Candidate H1 — PostgreSQL authoritative core + derived specialist stores

```text
                     PostgreSQL
        ┌───────────────────────────────────┐
        │ authoritative business identity  │
        │ current operational state        │
        │ #40 operation/commit markers     │
        │ scoped revision/history          │
        │ #45 provenance/binding graph     │
        │ #41 EffectRequest/outbox         │
        │ #42 grants/governance            │
        └────────────────┬──────────────────┘
                         │ CDC/outbox/export
          ┌──────────────┼──────────────┬──────────────┐
          ▼              ▼              ▼              ▼
      Search/vector   ClickHouse     Iceberg/lake   Graph index?
       derived         derived        derived        optional
                         │
                         └─ BI / agents / historical analytics

#43 orchestration persistence can be:
- external runtime store (Temporal/Restate/Camunda/etc.), or
- PostgreSQL-local checkpoint tables (DBOS-like),
without becoming business authority merely by colocation.
```

## Key competency score

| CQ family | Score | Rationale |
| --- | --- | --- |
| CQ-01..03 identity/binding history | PASS* | relational identities + typed relation/history tables; requires disciplined ontology/revision schema |
| CQ-04 exact-version | PASS | guarded update/version constraint |
| CQ-05 write skew | PASS* | `SERIALIZABLE`/SSI + whole-transaction retry; must actually run relevant Actions at required isolation |
| CQ-06 overlap/absence | PASS | exclusion/range constraints for many interval cases; serializable predicate/range logic for others |
| CQ-07 aggregate reservation | PASS* | serializable transaction/advisory/common-row locking/materialized aggregate depending invariant; must benchmark contention |
| CQ-08 operation replay | PASS | unique operation marker + result within authoritative transaction |
| CQ-09 frozen basis | PASS | immutable/revision rows/digests plus normal transaction |
| CQ-10..14 source evidence | PASS* | ordinary/provenance tables + JSON/blob refs + nullable/unresolved relations; schema design required |
| CQ-15 domain valid time | PASS* | range/effective tables where domain models it; not automatic universal temporal history |
| CQ-16 system/admission history | PASS* | explicit revision/audit/event tables; no built-in application time travel for every table |
| CQ-17 knowledge cutoff | PASS* | reconstruct from capture/admission/revision IDs; requires provenance design |
| CQ-18 source sequence | PASS | ordinary source-position fields |
| CQ-19/20 temporal counterexamples | PASS | no forced valid-time/system-time semantic columns |
| CQ-21 immutable ledger | PASS* | append/reversal schema + permission/trigger/constraint discipline |
| CQ-22 mutable draft | PASS | ordinary update/revision patterns |
| CQ-24 local state + effect request | PASS | same SQL transaction/outbox |
| CQ-25..27 effects | PASS* | history/attempt tables + causal FKs/IDs |
| CQ-28..30 authorization | PASS* | relational/recursive queries, indexes/materialized authorization projections; performance must be benchmarked |
| CQ-31..33 orchestration | PASS*/DERIVED | co-located or external runtime store both possible |
| CQ-34..37 graph traversal | PASS* | joins/recursive CTEs sufficient for bounded OLTP paths; deep/analytic graph may need derived index |
| CQ-38 OLAP scale | DERIVED | offload to ClickHouse/Iceberg |
| CQ-39 fuzzy/vector | PASS*/DERIVED | PostgreSQL text/trigram/vector extensions possible; dedicated search remains replaceable |
| CQ-40 analytical snapshots | DERIVED | Iceberg/warehouse export ideal |
| CQ-41..46 tenant/privacy | PASS* | RLS/schema/key/retention patterns; must prove erasure across derived stores/backups |
| CQ-47 PITR after remote effects | PASS* | PITR + #41 reconciliation; restore itself does not solve external-world divergence |
| CQ-48 derived loss | PASS | architecture explicitly rebuilds specialist stores |
| CQ-49 failover markers | PASS* | WAL/HA/PITR can preserve committed markers; DR procedure must be tested |
| CQ-50 physical/ontology migration | PASS* | transactional DDL/migration/revision discipline |
| CQ-51 dual writable representation | PASS | architecture designates Postgres authority; derived stores are non-authoritative |
| CQ-52 rebuild criterion | PASS | explicit architectural rule |
| CQ-53 write-path count | PASS | one primary OLTP authority in normal path |
| CQ-54 ontology evolution | PASS* | stable IDs + additive/revisioned physical schema |
| CQ-55 replace specialist backend | PASS | derived interfaces decouple semantic IDs from physical indexes |

## Main risks

1. **History/schema code becomes our burden.** PostgreSQL does not magically provide semantic time travel/provenance; we must model only the histories each concept needs.
2. **Serializable is not default.** A repository/Action path accidentally using Read Committed can violate semantic invariants.
3. **Hot aggregate contention.** SSI or common-lock strategies for extreme high-contention inventory/counters may need sharding/materialized reservations/escrow-like designs.
4. **Graph/recursive query limits.** Deep graph analytics can be expensive and justify a derived graph index.
5. **Table proliferation.** Generic ontology implementation must avoid generating an unmanageable table-per-version-per-source design.
6. **Large raw documents/analytics do not belong in hot OLTP tables.** Blob/object storage and analytical projection boundaries must be explicit.

### Current verdict

**Strongest working hypothesis**, not selected.

H1 minimizes the amount of storage-kernel correctness OS must invent while keeping specialist stores replaceable.

# Candidate H2 — FoundationDB authoritative tuple/KV kernel + custom semantic layers

```text
FoundationDB strict-serializable keyspace
       │
       ├─ entity/property tuples
       ├─ relation adjacency tuples
       ├─ operation markers
       ├─ secondary indexes
       ├─ history/provenance encodings
       └─ outbox/effect records
             │
             ├─ SQL/query layer
             ├─ graph layer
             └─ analytics/search projections
```

## Key score

| Area | Score | Rationale |
| --- | --- | --- |
| #40 serializable commit/predicates | PASS | strict serializability and key-range conflicts are native |
| operation dedupe | PASS | key uniqueness/transaction |
| arbitrary indexes | PASS* | transactionally maintainable but implemented by OS/layer |
| relational query/joins | PASS* | must build/use a layer; not core FDB facility |
| graph traversal | PASS* | custom adjacency/index/query engine |
| temporal history | PASS* | custom version encoding |
| #45 provenance | PASS* | physically representable; query ergonomics are ours |
| authorization | PASS*/FAIL as direct DB boundary | no user-level DB access control; service layer must be sole trusted gateway |
| bulk/large transaction | FAIL for >5s / >10MB single tx | must decompose; okay only if semantic operation permits decomposition |
| OLAP/search | DERIVED | external projections required |
| operational complexity | UNKNOWN/high | FDB cluster + custom data/query/schema layer |

## Main risk

FoundationDB solves the **hardest low-level concurrency primitive** while giving us responsibility for nearly everything above it. Under an AGI premise this is implementable, but implementation capacity is not the only concern: every custom index/query/migration/security layer becomes part of the trusted correctness base.

### When H2 could beat H1

- scale/throughput requirements materially exceed a well-designed Postgres cluster;
- ontology's generic dynamic schema makes relational DDL/modeling disproportionately painful;
- we prove a small tuple/index algebra can implement all competency questions elegantly;
- strict global serializability across a sharded keyspace is more valuable than mature SQL/constraints/tooling.

### Current verdict

**High-potential kernel research path; not yet the pragmatic winner.** Requires an executable mini-layer benchmark before selection.

# Candidate H3 — XTDB authoritative bitemporal relational core

```text
XTDB
  every row system-time + valid-time versioned
  current + historical SQL
  ASSERT transactional guards
  ERASE for legal deletion
       │
       └─ analytics/search projections as needed
```

## Key score

| Area | Score | Rationale |
| --- | --- | --- |
| CQ-15 domain valid time | PASS | native valid-time |
| CQ-16 system history | PASS | native system-time |
| historical correction | PASS | core model |
| CQ-19 static atemporal concept | PASS physically / semantic-risk | engine still assigns temporal metadata even when domain does not care |
| CQ-20 >2 clocks | PASS* | extra source/mapping/binding clocks stored as domain data |
| legal erasure | PASS | `ERASE` removes all valid/system history |
| #40 predicate commit | PASS*/UNKNOWN | `ASSERT` and serialized transaction log are promising; complex concurrency/throughput needs proof |
| high-write OLTP throughput | UNKNOWN | benchmark required under serialized log and representative Actions |
| operation markers/outbox | PASS* | normal transactional data |
| relational query | PASS | SQL |
| graph traversal | PASS*/derived | SQL joins/recursive patterns; optional derived graph |
| OLAP | PASS*/DERIVED | columnar internals are attractive, but large analytics should still be isolated from OLTP contention |

## Semantic risk

XTDB's great feature is also the temptation:

```text
physical valid-time/system-time
      ↓ accidental promotion
universal ontology ValidFrom/ValidTo/KnownFrom/KnownTo
```

#39 rejects that promotion. XTDB remains viable if physical temporal columns are treated as database mechanics/default query basis while domain-specific time remains explicitly modeled.

### Current verdict

**Strong specialist/alternative candidate** if temporal correction is pervasive enough to justify making bitemporal versioning universal physically. Needs #40 throughput and invariant experiments.

# Candidate H4 — Datomic-like immutable fact authority

```text
immutable datoms/facts
 transaction identity/history
 as-of/since/history views
 transaction functions/CAS
      │
      └─ projections for operational/analytics/search
```

## Strengths

- excellent historical/system-state query;
- additive fact model aligns with some ontology/property evolution;
- stable identities/unique attributes;
- transaction functions and CAS for guarded writes;
- no separate hand-built history table for ordinary fact changes.

## Risks

- encourages fact decomposition even where #59/#45 warned it can obscure object/action ergonomics;
- business valid time is not native system history;
- missing/unknown/source-proposal semantics need explicit modeling;
- complex aggregate/predicate #40 invariants need proof under transaction functions;
- retention/high-churn/privacy and query/operational ergonomics require evaluation.

### Current verdict

**Semantically attractive history donor; unproven as general OS operational authority.**

# Candidate H5 — graph-first authoritative core

Subvariants:

```text
H5a TypeDB typed graph
H5b Neo4j property graph
H5c RDF/Jena TDB2
```

## H5a TypeDB

**Pros:** types/relations/schema/query closely match ontology-shaped data.  
**Hard problem:** snapshot isolation permits write-skew/duplicate patterns unless protected by concurrent constraints. Arbitrary #40 predicate invariants require additional protocol.

**Verdict:** attractive semantic/derived graph; authority role has high concurrency proof burden.

## H5b Neo4j

**Pros:** mature property graph traversal, reverse links, constraints, rich graph tooling.  
**Hard problem:** Read Committed default; serializable behavior requires explicit shared locks/serialization design. Cross-key predicates can escape lock domains.

**Verdict:** strong derived graph/query store; universal authority not justified yet.

## H5c Jena TDB2/RDF

**Pros:** RDF/SPARQL standards; serializable transactions.  
**Hard problem:** one active writer limits general high-throughput operational authority.

**Verdict:** interoperability/semantic-query projection, not primary OLTP candidate.

# Candidate H6 — append-only log/event authority (Kafka-centric)

```text
commands/events -> Kafka transaction log
                    │
                    ├─ state projection
                    ├─ graph projection
                    └─ analytics
```

## Strengths

- durable ordered streams;
- excellent replay/integration;
- Kafka exactly-once within Kafka protocol/Streams domains;
- natural feed for projections.

## Hard failures as universal authority

- current-state aggregate/predicate invariants require a separate serialized state authority or very constrained partition model;
- source snapshots without event histories become awkward if forced into domain Event form;
- arbitrary cross-partition #40 commit is not solved by “event log exists”;
- log exactly-once does not solve external effects;
- correction/retention/privacy semantics differ by data class.

### Verdict

**FAIL as sole universal business authority. PASS as transport/projection substrate.**

# Candidate H7 — analytical authority (Iceberg / ClickHouse)

## Iceberg

Strong for snapshots, time travel, schema evolution, reproducible analytics and table-level transactions.

## ClickHouse

Strong for low-latency/high-scale OLAP and real-time derived analytics.

### Hard boundary

Neither is the natural #40 OLTP authority for arbitrary multi-object business invariants. Both are excellent downstream stores.

### Verdict

**DERIVED for OS operational architecture.**

# Candidate H8 — explicit hybrid: relational authority + object/blob + analytics + optional graph/search

This is H1 made more explicit about data classes:

```text
                       PostgreSQL authority
                  ┌──────────────┴──────────────┐
                  │                             │
       small/structured semantics       blob/artifact metadata
                  │                             │
                  │                     Object storage
                  │                       raw PDF/XML/media
                  │                             │
                  ├──── CDC/outbox ─────────────┤
                  ▼                             ▼
              ClickHouse                    Iceberg
            fast analytics           durable analytical snapshots
                  │                             │
                  └──────────┬──────────────────┘
                             ▼
                    search/vector/graph
                    rebuildable indexes
```

Rules:

1. blob bytes can live outside Postgres, but content/integrity/source identity is authoritative and transactionally referenced;
2. analytics/search/graph stores do not accept direct business writes;
3. CDC/export records lineage and projection revision;
4. current decision/action paths re-read authoritative state when their #40 basis requires it;
5. an analytical snapshot can be a named immutable evidence artifact when explicitly admitted, without becoming live OLTP authority.

### Current verdict

**Strongest complete working architecture** because it lets each specialized engine solve its natural workload while preserving one clear operational authority.

It is still a hypothesis until executable Postgres and recovery experiments pass.

# Architecture ranking after source study — provisional

| Rank | Candidate | Current status |
| --- | --- | --- |
| 1 | H8/H1 PostgreSQL-centered hybrid | strongest working hypothesis; needs executable proof |
| 2 | H3 XTDB authority + adjuncts | strongest alternative if pervasive bitemporality dominates |
| 3 | H2 FoundationDB custom kernel | strongest scale/control alternative; highest trusted-code burden |
| 4 | H4 Datomic-like fact authority | strong history semantics; domain/transaction fit unproven |
| 5 | H5 graph-first authority | graph ergonomics strong; write correctness/scaling constraints significant |
| — | H6 Kafka log as sole authority | rejected for universal role; valuable transport |
| — | H7 Iceberg/ClickHouse as OLTP authority | rejected for universal role; valuable analytics |

# What would falsify H8/H1

PostgreSQL-centered hybrid loses first place if experiments show any of the following without a clean pattern:

1. dynamic ontology schema/versioning requires pathological physical migrations or generic EAV/JSON that destroys type/query/invariant performance;
2. #40 high-contention aggregate Actions cannot scale under SSI/locking/reservation techniques;
3. provenance/binding history creates unacceptable join/storage complexity relative to fact/bitemporal alternatives;
4. graph traversals required in hot Action paths cannot meet latency without a synchronously writable graph authority;
5. tenant isolation/restore requirements cannot be cleanly implemented;
6. operation/effect recovery after PITR cannot be made safe enough;
7. required temporal historical queries are so pervasive that explicit temporal tables become more complex/error-prone than XTDB's native model.

Until those are tested, “Postgres wins” would be premature.
