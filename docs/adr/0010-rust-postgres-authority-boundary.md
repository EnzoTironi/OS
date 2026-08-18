# ADR-0010: Rust owns semantic authority; PostgreSQL owns initial durability

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

The research prototypes were written in Python to cheaply falsify semantic ideas. They are not a production foundation. Durable commit experiments in PostgreSQL established useful storage laws, but moving Action evaluation or policy semantics into SQL would create a second semantic kernel.

## Decision

The production semantic authority is implemented in Rust. PostgreSQL is the initial authoritative durable store for committed operations, semantic records, definition revisions, causal records and EffectRequests.

The Rust core owns interpretation/evaluation of definitions, Action planning and revalidation, authority semantics, temporal semantics, query semantics and effect/reconciliation state laws. PostgreSQL owns generic physical guarantees such as atomic transactions, compare-and-swap/head locking, uniqueness, durable append and recovery of committed receipts.

The Python prototype is abandoned rather than ported file-by-file. Its only surviving product role is historical evidence captured in ADRs, closed PRs/issues and Git history.

## Invariants

- PostgreSQL never branches on business/domain identifiers.
- SQL does not evaluate business Actions or become a second policy engine.
- Rust modules depend on semantic contracts, not Postgres table layout.
- Storage, query acceleration and connector implementations sit behind deep seams and remain replaceable.
- The initial deployment is a boring modular monolith unless evidence forces distribution.

## Consequences

Architecture v0 should begin with few deep Rust modules/crates rather than microservices or a large trait hierarchy. A daemon/service boundary may expose the semantic runtime to TypeScript and other clients, while internal Rust code remains free of transport concerns.

## Evidence

- Issues #39, #40, #61 and #65.
- PRs #178/#179 establish storage-level commit/recovery properties without wiring them into the Python kernel.
- The two-day prototype phase repeatedly demonstrated that implementation scaffolding should not be mistaken for final architecture.

## Revisit if

A different store materially simplifies the required semantics, or profiling demonstrates a specialized runtime should own part of physical execution while preserving one semantic authority.
