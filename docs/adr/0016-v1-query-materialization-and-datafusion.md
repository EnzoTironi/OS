# ADR-0016: DataFusion is the V1 semantic read/compute engine over authoritative and materialized sources

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen needs both strongly consistent operational reads and large historical/analytical computation over up to roughly 100M semantic records per company. PostgreSQL is appropriate for transactional authority but making every historical Relation traversal, aggregate and Computation depend on PostgreSQL execution would couple semantic query to the write store. Conversely, treating Parquet/DataFusion as authority would weaken transactional semantics and recovery.

## Decision

DataFusion is the primary V1 physical execution engine for `SemanticQuery` and scalable semantic Computations. PostgreSQL remains the transactional authority source and can satisfy strong/current indexed source reads; immutable Parquet projections in S3-compatible object storage provide columnar historical/analytical sources. Both are exposed to the query layer as physical providers behind one Rust-owned semantic query model.

```text
SemanticQuery + Consistency + temporal cut
                 |
          semantic planner
                 |
      DataFusion LogicalPlan
          /              \
 authoritative source   materialized source
 Postgres provider      Parquet/Arrow provider
```

DataFusion logical/physical details remain private to `zoen-query`. Standard relational operators are preferred; custom logical/physical extension nodes are introduced only for semantic operators that cannot be represented without loss.

## Consistency contract

Every semantic query explicitly requests one of:

```text
Strong
AtLeast(CommitSequence)
Snapshot(CommitSequence)
Eventual
```

Semantics:

- `Strong`: evaluate against authoritative state at a transactionally valid current cut. A projected source may be used only if it is proven current for that exact cut.
- `AtLeast(c)`: projected data is eligible only when its watermark is at least `c`; otherwise the planner waits within deadline, falls back to authority, or returns a typed freshness outcome according to request policy.
- `Snapshot(c)`: evaluate exactly against the immutable semantic snapshot/cut identified by `c`.
- `Eventual`: the latest available valid projection may be used and its watermark is returned.

The result reports the actual `CommitSequence`, ontology revision(s), temporal/knowledge basis and lineage used.

## Materialization

Every successful authority commit receives a monotonic `CommitSequence` within its tenant/authority namespace and atomically appends projection work to the transactional outbox.

A production projection worker reads committed ranges and emits immutable Arrow RecordBatches/Parquet objects. Projection metadata in PostgreSQL records content-addressed manifests and watermarks:

```text
ProjectionManifest {
  projection_id
  semantic_schema_revision
  from_commit
  through_commit
  object_refs[]
  manifest_digest
}

ProjectionWatermark {
  projection_id
  through_commit
  manifest_digest
}
```

Projection objects are immutable. Rebuild creates new manifests and advances the active watermark atomically; it does not mutate semantic authority or manufacture business occurrences.

## Physical representation law

Semantic `Type`, `Relation`, claims and temporal meaning do not prescribe one SQL/Arrow shape. Providers may denormalize, partition, dictionary-encode or index as needed, provided the semantic equivalence suite remains green.

No graph database is part of V1. Graph-like traversal is a semantic query capability lowered to joins/traversal operators over the available providers. A future graph projection may be added only as a rebuildable query source.

No Kafka is part of V1. Transactional outbox + projection workers + Restate durable invocation cover V1 delivery/orchestration needs at the accepted scale. Kafka requires measured fan-out/streaming evidence and remains outside the V1 dependency graph.

## Required semantic equivalence property

For every query class supported by both paths:

```text
same SemanticQuery
+ same definition revision
+ same temporal/knowledge cut
+ same CommitSequence snapshot
---------------------------------
authoritative-source result == projected-source result
and material lineage is equivalent
```

This is a permanent conformance law, not a benchmark-only check.

## Scale target

V1 architecture is validated against approximately:

- 100M semantic records for a company/tenant;
- millions of knowledge fragments/documents;
- ~1,000 users per tenant;
- peak hundreds of Action commits per second per tenant where the domain workload permits.

These are validation targets, not hard-coded limits.

## E2E verification

Release verification must run real PostgreSQL, object storage and DataFusion and prove:

1. committed records are materialized through the real outbox into Parquet;
2. projection process death/restart resumes without gaps or duplicate semantic rows;
3. immutable manifests/watermarks survive restart;
4. strong/current and projected/historical paths satisfy the consistency contract;
5. authoritative and projected results/lineage are semantically equivalent for the same snapshot;
6. stale projection cannot satisfy `AtLeast` or `Strong` silently;
7. corrupted/missing Parquet objects are detected and do not become authority;
8. a projection can be rebuilt from authority/history without changing semantic results;
9. the target-scale suite records latency/throughput/memory budgets and fails explicit V1 SLO thresholds established by the release spec.

## Invariants

- DataFusion executes plans; it does not define semantic meaning.
- Parquet/object storage is never transactional authority.
- Query callers never choose a physical engine directly.
- Projection freshness is observable, never guessed.
- Projection rebuild cannot write accepted semantic state.
- No domain-specific DataFusion operator is added merely to make a vertical pass.

## Revisit if

DataFusion cannot meet measured V1 semantic-query workloads or memory/latency goals. Replacement must preserve `SemanticQuery`, consistency and equivalence contracts; it must not change ontology meaning.
