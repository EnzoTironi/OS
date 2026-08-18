# ADR-0009: Semantic query and causal explanation require complete lineage

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

A semantic runtime must answer not only “what is the value?” but “why?”. Prototype reviews exposed two failure modes: explanation could claim completeness while omitting evidence, and a query's listed contributors could omit a dependency used by the computation that produced the result.

The semantic query contract must also remain independent of physical execution strategy. PostgreSQL can be useful for current indexed reads and transactional adjacency, while DataFusion is a strong candidate for columnar Relation/history scans, aggregates, projections and semantic Computations. Neither physical engine should define query meaning.

## Decision

Queries operate over semantic definitions rather than physical storage layout and may return a value plus a structured evaluation trace. Causal explanation is derived from durable semantic and causal records, not domain-specific formatting or graph reachability heuristics.

Lineage must cover every material computational dependency used to produce a result, including dependencies on other predicates/relations and excluded/rival evidence when relevant. A list of claims sharing the queried predicate is not sufficient lineage.

Semantic query meaning is defined once in Rust-owned contracts and may be lowered to multiple physical execution backends. PostgreSQL and DataFusion are complementary candidates rather than mutually exclusive architecture choices: simple/current queries may execute against PostgreSQL, while columnar/analytical workloads may execute through DataFusion over Arrow/Parquet or derived projections.

Physical routing/planning is invisible to callers and cannot change the semantic result contract.

## Invariants

- Query results are attributable to an ontology revision and temporal/knowledge basis.
- Supporting, rival, excluded, corrected and computational dependency roles remain distinguishable.
- `complete` has a contract-specific meaning and cannot be inferred merely because some graph nodes were reached.
- Explanations of Actions include relevant proposal basis, commit basis, authority/approval, committed records and effects/reconciliation where applicable.
- Physical projections and caches may accelerate queries but do not become semantic authority.
- PostgreSQL table layout, Arrow schemas and DataFusion logical/physical plans are implementation artifacts, not semantic query APIs.
- Equivalent semantic queries must preserve meaning and lineage requirements across supported physical execution backends.

## Consequences

The core evaluation machinery should naturally emit dependency traces rather than reconstruct them after the fact. Company Brain and audit surfaces can consume the same explanation contract.

Query planning should preserve a clean boundary between semantic planning and physical lowering. DataFusion should be evaluated early against the first non-trivial Relation/Computation workloads rather than being treated merely as a hypothetical late optimization; PostgreSQL remains valid for the smallest correct read path where appropriate.

## Evidence

- Issues #6, #13, #39, #48, #49, #65 and #66.
- V-001/V-002 temporal queries and explanations.
- PR #183 added commit-basis evidence after earlier explanation omitted the WMS claim.
- Review of PR #184 showed a result whose declared contributors did not account for a reserved-quantity dependency, proving that queried-predicate contributors alone are insufficient.

## Revisit if

Complete dependency lineage is prohibitively expensive for normal execution and an alternative mechanism preserves reliable on-demand causal reconstruction without semantic blind spots; or the first measured workloads show that the proposed physical query-engine split creates more complexity than value.
