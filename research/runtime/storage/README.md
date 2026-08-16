# Storage models — derive physical requirements from semantic contracts

- Artifact ID: `issue-0039-storage-models`
- Issue: <https://github.com/EnzoTironi/OS/issues/39>
- Track: Wave B physical/runtime research
- Date: 2026-08-16
- Base: Wave A + merged #45 ingest + #40 commit + #41 effects + #42 authorization + #43 orchestration
- Decision: none. This folder derives a storage contract and competing physical architectures; it does **not** select PostgreSQL, FoundationDB, XTDB, Datomic-like storage, graph/RDF authority, event sourcing, or an analytical engine.

## Question

What must physical persistence guarantee so an executable business ontology can preserve identity, transactions, provenance, temporal knowledge, history, effects, authorization and durable execution **without allowing the storage representation to become the semantic model?**

First rule:

```text
semantic concept != physical representation
```

Examples:

```text
Object / relation          != SQL row or graph node by definition
Event                      != append-log/Kafka record by definition
source observation         != bitemporal tuple by definition
business valid time        != database transaction time
source capture time        != domain occurrence time
Commitment                 != workflow row/token
Action commit              != arbitrary database write
ledger semantics           != universal append-only storage
current projection         != historical/source authority by default
```

## The main result: authority topology comes before database topology

The phrase `single source of truth` is too vague. The useful rule is:

> **For each semantic statement/transition family, there must be one unambiguous writable authority or an explicit formal multi-authority protocol.**

That authority can be:

- OS-local — e.g. an internal planning-cost decision committed by an Action;
- external — e.g. SEFAZ authorization outcome, marketplace listing state, payment-provider state;
- artifact-scoped — e.g. object storage is authoritative for immutable/versioned document bytes while relational metadata identifies/hash-verifies the artifact.

Therefore **multiple physical stores are fine**. Semantic split-brain begins only when two stores independently author the same semantic state without a governing merge/leader/reconciliation contract.

A graph index, ClickHouse table, Iceberg snapshot, vector index or workflow store can coexist safely when its authority/freshness/rebuild semantics are explicit.

## Six physical workload families

Wave B gives at least:

```text
A. AUTHORITATIVE OPERATIONAL COMMIT
   #40 Actions/invariants/current governed local state
   atomicity + correct concurrency + stable operation identity

B. SOURCE EVIDENCE / PROVENANCE
   #45 captures, mappings, observations, candidates, bindings, lineage
   revision/history + irregular provenance/time + unresolved data

C. EXTERNAL EFFECT / RECONCILIATION
   #41 EffectRequest, attempts, receipts, outcome evidence
   causal identity + pending/unknown/contradicted states

D. AUTHORITY / GOVERNANCE
   #42 grants, delegation, SoD, policy revisions, revocation
   low-latency current checks + historical explanation

E. DURABLE EXECUTION MEMORY
   #43 checkpoints/history/timers/signals/versioning
   backend-specific persistence independent from business truth

F. QUERY / SEARCH / ANALYTICS
   traversal, fuzzy/vector retrieval, OLAP, named historical snapshots
   usually read-optimized and rebuildable/materialized
```

The architecture question is:

> **Which workloads must share a transactional authority, and which can safely be projections/materializations/adjunct stores?**

## Temporal conclusion

Universal bitemporal **semantics** are not justified.

Real data can carry different clocks:

```text
business valid/effective time
business occurrence time
source-reported time
source LSN/offset/provider sequence
capture/ingest time
mapping/model revision
binding effectivity
OS commit/admission revision
ontology/policy/connector revision
workflow scheduling/wakeup time
```

A database such as XTDB may physically version every row with valid/system time and still be a valid candidate. The constraint is conceptual:

> native database time dimensions must not be automatically exported as ontology meaning for concepts that do not have that meaning.

Likewise PostgreSQL PITR/WAL is recovery history, not an answer to `what did Action O know?` unless O's evidence/revision basis was modeled.

## History conclusion

Neither extreme survives:

```text
latest-state only
append-only everything forever
```

Different domains need different laws:

- accounting/stock/legal posting can require immutable/reversal semantics;
- source evidence can be revisioned/superseded;
- current observations may exist without event history;
- drafts/configuration can mutate;
- derived projections can be rebuilt;
- raw PII can require erasure/redaction;
- workflow internals can have shorter retention than business audit evidence.

## Source comparison result

See [`source-study.md`](source-study.md). Current evidence:

- **PostgreSQL 18:** strong operational transaction/constraint/relational toolkit; serializable SSI available but must be chosen; history/provenance remain explicit application design.
- **FoundationDB:** excellent strict-serializable ordered-KV substrate; largest custom trusted query/schema/index/security layer burden.
- **XTDB:** strongest native bitemporal relational alternative; needs throughput/#40 fit proof and discipline against temporal semantic leakage.
- **Datomic:** strong immutable/system-history fact model; aggregate-invariant, valid-time and operational ergonomics need proof.
- **TypeDB / Neo4j / Jena:** strong graph/semantic query models with different concurrency tradeoffs; no automatic right to be write authority just because ontology has Links.
- **Kafka:** strong transactional/log transport semantics inside Kafka scope; not arbitrary business-state authority.
- **Iceberg / ClickHouse:** strong analytical/historical projection roles; not current #40 OLTP authority candidates.

## Architecture candidates

Detailed scoring against 55 competency questions is in [`architecture-candidates.md`](architecture-candidates.md).

Current provisional ordering:

1. **H8/H1 — PostgreSQL-centered local authoritative core + specialist derived stores** — strongest working hypothesis.
2. **H3 — XTDB authority + adjuncts** — strongest temporal alternative if pervasive temporal correction dominates.
3. **H2 — FoundationDB custom transactional kernel** — strongest scale/control alternative; largest trusted-code surface.
4. **H4 — Datomic-like fact authority** — strong history semantics; operational/invariant fit unproven.
5. **H5 — graph-first authority** — graph ergonomics strong; concurrency/throughput proof burden significant.
6. Kafka/log and Iceberg/ClickHouse remain highly valuable **derived/transport** roles, not universal authorities.

This is a research ranking, not a freeze.

## H8/H1 working topology

```text
                  OS-local governed commit authority
                       PostgreSQL hypothesis
              ┌────────────────┴────────────────┐
              │                                 │
       structured semantic state         artifact metadata/hash
       #40 operation identities                │
       #45 bindings/provenance                 ▼
       #41 EffectRequest/outbox          object/blob storage
       #42 grant/governance              source bytes/media
              │                                 │
              └──────────────┬──────────────────┘
                             │ lineage / CDC / export
            ┌────────────────┼───────────────────┬─────────────────┐
            ▼                ▼                   ▼                 ▼
       ClickHouse          Iceberg          search/vector      graph index?
       fast OLAP       named snapshots       candidates        if benchmarked

#43 durable orchestration keeps its own runtime persistence or can co-locate
checkpoint tables when a backend proves safe co-commit. It does not become
business authority by storage colocation.
```

For externally authoritative statements, PostgreSQL stores governed observations/correlation/projections; it does not magically become the external authority.

## Real PostgreSQL 18 experiment

[`experiments/postgres18/`](experiments/postgres18/) is executable research, not production code.

Validated GitHub Actions evidence:

```text
storage-research-ci run 31928881458
job postgres18: success
PostgreSQL service: postgres:18
```

It proves a narrow but important subset:

1. **Write skew:** two disjoint updates both commit under `REPEATABLE READ` and violate an aggregate invariant; under `SERIALIZABLE`, one aborts and the invariant survives.
2. **Range exclusion:** overlapping temporal reservations are rejected by a GiST exclusion constraint.
3. **Semantic operation identity:** operation marker + business mutation commit atomically; same ID+intent replays, same ID+changed intent is rejected.
4. **Binding history:** one source key resolves to different business identities in different effective eras without rewriting old history.
5. **Snapshot without Event:** an inventory-position observation can persist with provenance while domain Event count stays zero.

The experiment does **not** prove scale, ontology dynamic-schema mapping, deep provenance traversal, DR after external effects, tenant/privacy lifecycle or multi-region behavior.

## Strongest laws after red-team

Full set: [`candidate-laws.md`](candidate-laws.md).

Most load-bearing:

1. Storage representation is not ontology semantics.
2. Each statement/transition family needs unambiguous write authority.
3. Derived-store rebuildability is a semantic test, not just an ops feature.
4. Isolation must match the actual #40 dependency; ACID/snapshot/version columns are insufficient slogans.
5. Operation marker/result belongs inside the authoritative commit scope.
6. Business valid time != system/transaction time; universal bitemporal semantics not earned.
7. PITR != semantic history and cannot rewind the external world.
8. Append-only is domain-scoped.
9. Graph-shaped queries do not require graph-authoritative storage.
10. Kafka/log exactly-once is scoped to the transport/log protocol.
11. Analytics/search/graph projections need explicit lineage + freshness + tenant/delete semantics.
12. Ontology revision != physical schema revision.
13. H8/H1 leads today, but remains falsifiable.

## What can still overturn H8/H1

The three highest-priority unresolved experiments are in [`open-questions.md`](open-questions.md):

### Q-STO-10 — dynamic ontology physical mapping

Benchmark table-per-type, typed property tables, JSON/document+typed projections and hybrid generated layouts. A Postgres architecture that degenerates into untyped JSON or pathological EAV loses much of its value.

### Q-STO-11 — high-contention workloads

Benchmark hot inventory/accounting/absence predicates under SSI, explicit locks/reservations and alternative substrates such as FoundationDB.

### Q-STO-12 — disaster recovery after external-world divergence

Perform an actual restore/reconciliation drill around an effect that may have succeeded after the restore point. Database restore must not duplicate external payment/fiscal/marketplace effects.

Until these and #70's metamodel synthesis mature, storage is **not selected**.

## Files

| File | Purpose |
| --- | --- |
| [`workload-matrix.md`](workload-matrix.md) | semantic workloads and physical guarantees |
| [`competency-questions.md`](competency-questions.md) | 55 acceptance questions |
| [`source-study.md`](source-study.md) | current first-party storage/database evidence |
| [`architecture-candidates.md`](architecture-candidates.md) | scored physical architecture competitors |
| [`candidate-laws.md`](candidate-laws.md) | 35 falsifiable laws/non-laws |
| [`adversarial-cases.md`](adversarial-cases.md) | 70 race/history/restore/staleness/privacy scenarios |
| [`experiments/postgres18/`](experiments/postgres18/) | real PostgreSQL 18 executable competency subset |
| [`open-questions.md`](open-questions.md) | unresolved experiments + handoffs |
| [`review.md`](review.md) | adversarial self-review of H8/H1 and alternatives |
| [`check_research.py`](check_research.py) | structural/regression guard |

## Explicit non-decisions

Do **not** infer:

- PostgreSQL has been selected;
- XTDB/FoundationDB/Datomic have been rejected;
- one physical database must contain all truth/evidence/bytes;
- event-source everything;
- every row/object is semantically bitemporal;
- graph database is required because ontology has Links;
- derived stores can accept direct business writes;
- all records are immutable forever;
- all raw evidence is retained forever;
- SERIALIZABLE should be used for every query/transaction.

The storage choice stays subordinate to the semantic contracts and future #70 synthesis.
