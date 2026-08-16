# Storage models — derive physical requirements from semantic contracts

- Artifact ID: `issue-0039-storage-models`
- Issue: <https://github.com/EnzoTironi/OS/issues/39>
- Track: Wave B physical/runtime research
- Date: 2026-08-16
- Base: Wave A + merged #45 ingest + #40 commit + #41 effects + #42 authorization + #43 orchestration
- Decision: none. This folder derives a storage contract and competing physical architectures; it does **not** select PostgreSQL, FoundationDB, XTDB, Datomic-like storage, a graph/RDF database, event sourcing, or a columnar store.

## Question

What must the physical persistence layer guarantee so an executable business ontology can preserve identity, transactions, provenance, temporal knowledge, history, effects, authorization and durable execution **without allowing the storage representation to become the semantic model?**

The first rule is:

```text
semantic concept != physical representation
```

Examples:

```text
Object / relation          != SQL row or graph node by definition
Event                      != append-log record by definition
Fact/observation           != bitemporal tuple by definition
business valid time        != database transaction time
source capture time        != domain occurrence time
Commitment                 != workflow row/token
Action commit              != arbitrary database write
ledger semantics           != universal append-only storage
current projection         != source of historical truth by default
```

## The storage problem is several workloads, not one model

Wave B now gives at least six distinct physical workload families:

```text
A. AUTHORITATIVE OPERATIONAL COMMIT
   #40 Actions/invariants/identity changes/current operational state
   strong atomicity + concurrency + stable operation dedupe

B. SOURCE EVIDENCE / PROVENANCE
   #45 captures, mappings, observations, candidate relations, lineage
   append/supersede history + irregular time/provenance + unresolved data

C. EXTERNAL EFFECT / RECONCILIATION
   #41 EffectRequest, attempts, receipts, observations, knowledge
   durable identity + ordered/causal evidence + pending/unknown states

D. AUTHORITY / GOVERNANCE
   #42 grants, revisions, participation/SoD, decisions, revocation evidence
   current low-latency evaluation + historical explanation

E. DURABLE EXECUTION MEMORY
   #43 runtime checkpoints/history/timers/signals
   backend-specific persistence + retention/versioning independent of business truth

F. QUERY / SEARCH / ANALYTICS
   traversals, aggregates, full-text/vector, BI/OLAP, historical exploration
   often read-optimized and rebuildable from authoritative/evidence stores
```

The central architecture question is not “which database supports the most checkboxes?” It is:

> **Which workloads must share one transactional authority, and which can safely be projections/materializations/adjunct stores?**

## Strong constraints inherited from prior research

### 1. One business authority per committed statement/transition

A graph index, search engine, lakehouse, vector DB or orchestration store can be useful without becoming a second writable source of the same business state.

If two systems can independently accept conflicting authoritative writes to `Product.cost`, `InventoryPosition`, `Commitment.fulfilled`, `Grant.active`, etc., storage has created a semantic split-brain.

### 2. Universal bitemporal rows are not justified

Different records expose different time axes:

```text
business valid/effective time
source-reported occurrence time
source position/LSN/offset
capture/ingest time
mapping/model revision time
binding effectivity
commit/system transaction revision
external provider sequence/time
workflow scheduling/wakeup time
```

Only store/expose the axes the concept actually has. Physical system-version history may exist underneath without becoming a semantic property on every object.

### 3. Snapshot-only knowledge is legitimate

A current inventory PDF/API snapshot can be stored as an observation of position without fabricating missing movement Events just to satisfy event sourcing.

### 4. Append-only is domain-scoped, not universal

Accounting/stock/legal ledgers may require immutable/reversal semantics. Configuration, provisional observations, derived projections and retention-governed raw data can have different lifecycle rules.

### 5. Derived stores may be aggressively denormalized

A read/index projection can duplicate data when:

- its source/authority is explicit;
- it can be rebuilt/reconciled;
- writes flow through authoritative semantic operations;
- staleness semantics are known;
- consumers cannot confuse it with the commit authority.

## Initial physical architecture competitors

These are hypotheses to test, not selections.

### P1 — PostgreSQL-centered authoritative core + derived adjuncts

```text
PostgreSQL
  authoritative normalized/typed relational state
  transactions / constraints / operation dedupe
  provenance/history tables where required
  JSON/document fragments where source shape is irregular
  outbox/effect metadata
       │
       ├─ search/vector index
       ├─ graph/materialized traversal index?
       ├─ columnar/lakehouse analytics
       └─ durable-orchestration backend/store
```

**Attraction:** one strong operational authority, excellent constraints/transactions, lower operational complexity.  
**Risk:** temporal/graph/history/query workloads can become bespoke schema machinery or performance bottlenecks.

### P2 — transactional KV/tuple core (FoundationDB-like) + semantic indexes

```text
strict-serializable ordered KV authority
  custom tuple/entity/index encoding
  explicit conflict ranges / operation markers
       │
       ├─ relational/query projection
       ├─ graph projection
       └─ analytics/search
```

**Attraction:** strong programmable transaction substrate, explicit indexes, scalable keyspace.  
**Risk:** much more database/kernel machinery becomes our responsibility; query ergonomics and migration/tooling may be expensive.

### P3 — bitemporal/document authority (XTDB-like) + transactional adjuncts if necessary

```text
bitemporal entity/document database
  valid-time + transaction/system-time history
  immutable historical versions
       │
       ├─ specialized commit/invariant enforcement?
       └─ analytics/search projections
```

**Attraction:** historical/temporal query is native and expressive.  
**Risk:** encourages semantic bitemporality where it may not exist; must prove #40 transaction/invariant/action workloads fit without hidden second authority.

### P4 — immutable fact/log authority + projections

```text
durable append log / Datomic-like facts / event records
        │
        ├─ current state projection
        ├─ graph/query index
        └─ analytics
```

**Attraction:** history/provenance/replay/audit.  
**Risk:** can force every state correction/snapshot/configuration into event/fact semantics and complicate #40 atomic invariants/current-state operations.

### P5 — polyglot authorities by semantic subdomain

Different authoritative stores for accounting ledger, graph relationships, documents, operational state, etc.

**Attraction:** each workload gets ideal storage.  
**Risk:** distributed transactions, ownership ambiguity, consistency/reconciliation burden, semantic split-brain. High proof burden.

### P6 — one logical authority over a multi-model engine

Use a system whose physical engine exposes relational/document/graph/temporal capabilities behind one transaction/identity model.

**Attraction:** fewer synchronization boundaries.  
**Risk:** capability breadth can hide weaker transaction/query semantics or lock OS to one product's data model.

## Working hypothesis

The evidence so far favors a distinction between:

```text
AUTHORITATIVE WRITE MODEL
  small number of strongly governed stores

DERIVED READ MODELS
  many replaceable/materialized indexes optimized for query/search/analytics
```

But it does **not** yet prove that the authoritative write model should be relational, fact-oriented, bitemporal, or KV.

#39 must falsify at least P1–P5 with actual competency questions and executable microbenchmarks where useful.

## Files

| File | Purpose |
| --- | --- |
| [`workload-matrix.md`](workload-matrix.md) | semantic workloads and required physical guarantees |
| [`competency-questions.md`](competency-questions.md) | queries/mutations every candidate architecture must answer |
| `source-study.md` | current first-party storage/database evidence (next) |
| `architecture-candidates.md` | scored physical designs after source study |
| `candidate-laws.md` | falsifiable storage laws after comparison |
| `adversarial-cases.md` | corruption/race/history/staleness/failover cases |
| `open-questions.md` | handoff to #46/#47/#49/#70 |

## Explicit non-decisions

Do **not** infer from this overview:

- “Postgres wins”;
- “bitemporal database wins”;
- “event source everything”;
- “graph database is required because ontology has Links”;
- “one database is always simpler”;
- “polyglot persistence is always bad”;
- “every record is immutable forever”;
- “every object needs valid-time and transaction-time columns”.

Those claims must survive the workload matrix and physical experiments first.
