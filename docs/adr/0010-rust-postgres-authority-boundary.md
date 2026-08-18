# ADR-0010: Rust owns semantic authority; transactional persistence and query execution are separate physical planes

**Status:** Accepted for Architecture v0; inherited by V1 and narrowed by ADR-0016  
**Date:** 2026-08-18

## Context

The research prototypes were written in Python to cheaply falsify semantic ideas. They are not a production foundation. Durable commit experiments in PostgreSQL established useful transactional laws, but describing PostgreSQL as the general "authority store" is too broad: it risks coupling semantic query and computation to one physical database.

Zoen has at least two materially different physical concerns:

1. a **transactional authority/commit plane** that provides atomicity, operation identity, concurrency control, replay/recovery and durable semantic writes;
2. a **read/compute plane** that executes semantic queries, Relation traversal, history scans, aggregates and Computations efficiently over authoritative and materialized representations.

These planes share one Rust-owned semantic model but need not share one physical engine.

## Decision

The production semantic authority is implemented in Rust.

PostgreSQL is the V1 **transactional authority backend** for state that requires durable atomic commit: operation identities/intents, authority-head/commit sequence, committed semantic records, definition publication/activation metadata, causal records required by commit, EffectRequests and projection outbox state.

PostgreSQL is not the universal Zoen database or semantic query model.

ADR-0016 selects DataFusion as the V1 semantic read/compute engine. DataFusion executes semantic plans over providers such as authoritative PostgreSQL snapshots and immutable Arrow/Parquet projections. Callers use the same semantic query contract and cannot observe/select a physical engine as business behavior.

The Rust core/engine owns interpretation of definitions, Action planning/revalidation, authority, temporal meaning, semantic query meaning and effect/reconciliation laws. PostgreSQL/DataFusion/Arrow execute mechanism; they do not define business meaning.

The Python prototype is abandoned rather than ported. Its surviving role is historical evidence captured in ADRs, closed PRs/issues and Git history.

## Invariants

- Neither PostgreSQL nor DataFusion branches on business/domain identifiers.
- SQL does not evaluate business Actions or become a second policy engine.
- DataFusion plans/operators do not become a second semantic model.
- Semantic Rust modules do not depend on PostgreSQL table layout, Arrow schema or DataFusion plan shape.
- Projections/caches/Arrow/Parquet layouts are rebuildable and never transactional authority.
- A query result has the same semantic meaning at the same cut regardless of physical provider.
- Transactional commit and read/compute may scale independently without creating dual business truth.

## Consequences

The deep architecture separates semantic interpretation, transactional commit and query execution without an interface forest:

```text
                    Rust semantic authority
                           |
              +------------+------------+
              |                         |
     transactional authority        read / compute
              |                         |
          PostgreSQL              DataFusion
              |                  Arrow / Parquet
 operation/head/replay          projections/history
 commit/effect requests        scans/aggregates
```

PostgreSQL constraints/transactions enforce generic physical invariants; DataFusion/provider logic handles physical query planning. Neither receives canonical business-specific semantics.

## Evidence

- Issues #13, #39, #40, #48, #65 and #66.
- PRs #178/#179 establish storage-level commit/recovery properties without proving PostgreSQL should own all query execution.
- Relation/temporal/query experiments demonstrate that semantic query meaning must remain independent of physical layout.
- ADR-0016 is the V1 production decision based on this separation.

## Revisit if

A different transactional backend materially simplifies commit laws or DataFusion fails the V1 E2E/query-scale contract. Replacement must preserve one Rust-owned semantic authority and the semantic equivalence/consistency contracts.
