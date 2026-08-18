# ADR-0010: Rust owns semantic authority; persistence and query execution are separate physical planes

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

The research prototypes were written in Python to cheaply falsify semantic ideas. They are not a production foundation. Durable commit experiments in PostgreSQL established useful transactional laws, but describing PostgreSQL as the general "authority store" is too broad: it risks coupling semantic query and computation to one physical database and obscures the role of a columnar execution engine such as DataFusion.

Zoen has at least two materially different physical concerns:

1. a **transactional authority/commit plane** that must provide atomicity, operation identity, concurrency control, replay/recovery and durable semantic writes;
2. a **read/compute plane** that must execute semantic queries, Relation traversal, history scans, aggregates and Computations efficiently, potentially over Arrow/Parquet/materialized projections.

These planes share one semantic model but need not share one physical engine.

## Decision

The production semantic authority is implemented in Rust.

PostgreSQL is the initial **transactional authority backend** for the parts of the system that require durable atomic commit: operation identities/intents, authority-head revisions, committed semantic records, definition-revision publication/activation metadata, causal records required by commit, and EffectRequests.

PostgreSQL is **not** declared to be the universal database or universal query engine for Zoen.

DataFusion is a **first-class Architecture v0 candidate for the read/compute plane**, especially for columnar execution over Arrow/Parquet, large Relation/history scans, aggregates, projections and semantic Computations. Its exact entry point is driven by the first semantic-query workloads rather than postponed as a generic future optimization.

Small/current indexed queries may initially execute directly against PostgreSQL while larger analytical or columnar workloads execute through DataFusion. This routing is a physical planning concern behind the same semantic query contract; callers must not depend on which engine executed a query.

The Rust core owns interpretation/evaluation of definitions, Action planning and revalidation, authority semantics, temporal meaning, semantic query meaning and effect/reconciliation state laws. Physical engines execute plans and persist state; they do not define business meaning.

The Python prototype is abandoned rather than ported file-by-file. Its only surviving product role is historical evidence captured in ADRs, closed PRs/issues and Git history.

## Invariants

- Neither PostgreSQL nor DataFusion branches on business/domain identifiers.
- SQL does not evaluate business Actions or become a second policy engine.
- DataFusion plans/operators do not become a second semantic model.
- Rust modules depend on semantic contracts, not PostgreSQL table layout, Arrow schema or DataFusion plan shape.
- Physical specialization, projections, caches, Arrow/Parquet layouts and indexes remain replaceable and rebuildable where they are not authority records.
- A query result has the same semantic meaning regardless of whether its physical execution used PostgreSQL, DataFusion or a future specialized backend.
- The initial deployment remains a boring modular monolith unless evidence forces distribution.

## Consequences

Architecture v0 should expose deep seams between semantic interpretation, transactional commit and physical query execution without creating an interface forest.

The first Rust vertical can use PostgreSQL for both persistence and simple reads when that is the smallest correct implementation, but this must not hard-code PostgreSQL as the semantic query architecture. Issue #192 and subsequent Relation/Computation workloads are the natural point to evaluate DataFusion integration early.

A likely physical evolution is:

```text
                    Rust semantic authority
                           │
              ┌────────────┴────────────┐
              │                         │
     transactional authority        read / compute
              │                         │
          PostgreSQL              DataFusion
              │                  Arrow / Parquet
 operation/head/replay          projections/history
 commit/effect requests        scans/aggregates
```

This split does not imply CQRS as a semantic primitive and does not require duplicated business truth.

## Evidence

- Issues #13, #39, #40, #48, #65 and #66.
- PRs #178/#179 establish storage-level commit/recovery properties without proving PostgreSQL should own all query execution.
- The Relation/temporal/query experiments show that semantic query meaning must stay independent of physical layout.
- DataFusion's role remains to be validated against executable semantic-query workloads, not selected by taste.

## Revisit if

A different transactional backend materially simplifies the required commit laws; DataFusion fails the semantic-query workloads; or a specialized physical engine becomes useful while still preserving one Rust-owned semantic authority.
