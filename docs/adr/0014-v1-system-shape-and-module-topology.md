# ADR-0014: V1 system shape uses a few deep responsibility-owned modules

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Problem

Zoen V1 must be implementable by agents without letting incidental library choices become architecture. The system spans semantic authority, transactional durability, query/computation, policy, sandboxed code, orchestration, knowledge retrieval, agents and generated UI. A technology-per-crate design looks organized but creates shallow modules and pass-through layers: callers end up coordinating Postgres, DataFusion, Cedar, Wasmtime and Restate directly and infrastructure details leak into semantic code. Per `/architect`, the shape is derived from the caller's usage, screened for shallow modules, information leakage, temporal decomposition and pass-through methods.

## Usage (caller's view)

A client should learn one semantic API rather than the implementation topology:

```text
publish(definition_bundle) -> DefinitionRevision
query(SemanticQuery, Consistency) -> SemanticResult + Lineage
propose(ActionRef, Input) -> Proposal
approve(ProposalRef, bounds) -> Approval
commit(ProposalRef, OperationId) -> CommitReceipt
operation_status(OperationId) -> OperationStatus
explain(SemanticRef) -> CausalExplanation
```

The TypeScript intelligence plane consumes the same API:

```text
Company Brain -> semantic query/explain -> scoped Action discovery -> proposal/commit
Surface IR    -> semantic query        -> ActionRef             -> proposal/commit
```

No caller selects Postgres versus DataFusion, Cedar versus internal authority logic, Restate invocation details, or Wasmtime resource machinery.

## Shape

The production repository starts with these deep Rust modules/crates:

```text
crates/
  zoen-core/       # semantic constitution; no IO
  zoen-engine/     # semantic lifecycle and authority orchestration
  zoen-query/      # semantic query planning/execution; DataFusion integration
  zoen-adapters/   # production mechanism implementations behind deep ports
apps/
  zoend/           # composition root, auth/session boundary and Connect transport

packages/
  ontology/        # TypeScript authoring DSL/compiler
  mcp/             # ontology MCP door
  effect-worker/   # leftover Restate effect worker (later unit)

proto/             # versioned public Protobuf contracts
deploy/            # Fly production image
e2e/               # production-shaped acceptance environments and scenarios
```

### `zoen-core`

Owns semantic types and laws: identity, typed values, canonical definitions, Type/Relation/Computation/Action, Claim/Provenance, temporal algebra, StateBasis, Action/Effect state types, semantic query AST, lineage and causal types. It does not import Tokio networking, SQLx, DataFusion, Cedar, Wasmtime, Restate or HTTP frameworks.

### `zoen-engine`

Owns complete semantic operations rather than execution stages: definition publication/evolution, evidence admission, Action discovery/proposal/approval/revalidation/commit, trusted authority/delegation, effect/reconciliation admission and explanation. It exposes few deep mechanism ports only where substitution is real.

Allowed load-bearing ports are initially limited to concepts such as:

```text
AuthorityStore
QueryExecutor
PolicyEvaluator
ComputationExecutor
EffectScheduler
BlobStore        # only if engine-owned evidence admission needs it
Clock            # only where time cannot be supplied explicitly
```

A new trait requires an ADR or demonstrated second implementation/test seam. There is no repository interface per entity and no service interface per use case.

### `zoen-query`

Owns semantic query lowering, consistency semantics, physical source selection, DataFusion integration and equivalence across authoritative/projected sources. DataFusion details are private to this module.

### `zoen-adapters`

Contains concrete production mechanisms such as PostgreSQL transactional authority, Cedar evaluation, Wasmtime component execution, Restate scheduling and object storage. An adapter implements a deep port; it does not define a parallel domain API.

### `zoend`

Is the composition root and process boundary. It authenticates transport requests, derives trusted session context, converts Protobuf/wire types into semantic types, calls deep engine/query operations and maps typed outcomes back to protocol errors/results. Transport types never become core domain types.

## Dependency law

```text
zoen-core
  ^      ^
  |      |
zoen-engine   zoen-query
      ^          ^
       \        /
       zoen-adapters
            ^
            |
          zoend
```

`zoen-core` cannot depend outward. `zoen-engine` and `zoen-query` may depend on core but not on concrete adapters. Cross-module calls must carry semantic types, not SQL rows, Arrow schemas, Cedar entities or Protobuf messages.

## Synthesis decision

Two structurally different shapes were compared.

**Candidate A — technology-per-crate:** `zoen-postgres`, `zoen-datafusion`, `zoen-cedar`, `zoen-wasm`, `zoen-restate`, `zoen-protocol`, plus orchestration services. Rejected as the base because it organizes by mechanism/vendor rather than knowledge ownership, encourages pass-through layers and leaks infrastructure choices across callers.

**Candidate B — responsibility-owned deep modules:** core/engine/query/adapters/process boundary. Accepted because each public interface hides substantial policy and mechanism while keeping caller coordination small. Technology choices remain replaceable inside deep seams.

We retain from Candidate A only explicit isolation of heavyweight dependencies inside `zoen-adapters`/`zoen-query`, without promoting each dependency to a public architectural layer.

## Tradeoffs accepted

- We accept larger internal modules in exchange for deeper interfaces and less cross-module coordination.
- We accept that some production dependencies coexist inside `zoen-adapters` in exchange for preventing vendor-shaped architecture; split a mechanism into its own crate only when build/deployment/reuse evidence justifies it.
- We accept a single `zoend` process boundary initially in exchange for avoiding premature network boundaries; Restate workers or projection workers may run as modes/binaries while preserving the same module ownership.
- We accept deliberate internal refactoring during implementation; public semantic contracts and conformance laws are the stability boundary.

## Alternatives considered

- **Technology-per-crate:** lost because it exposes mechanism topology and creates shallow forwarding abstractions.
- **Microservice-per-capability:** lost because it turns semantic consistency boundaries into network contracts before workload evidence requires distribution.
- **Single giant `zoen` crate:** hides technology but loses explicit dependency direction and makes contamination of the semantic constitution difficult to enforce.

## Invariants

- No business/domain identifier appears in generic runtime dispatch.
- Wire, SQL, Arrow/DataFusion, Cedar, Wasmtime and Restate representations are private to their owning boundary.
- Callers never coordinate internal execution phases to complete one semantic operation.
- A module should be split only when the resulting interface is deeper than the boundary it replaces.
- Repeated pass-through methods, duplicated representation knowledge or same-shape implementation deviations trigger `/architect` Phase E: scrap and redesign instead of adding escape hatches.

## Next implementation step

Build the first V1 vertical through the final boundaries: TypeScript ontology authoring -> canonical definition IR -> Connect -> `zoend` -> `zoen-engine` -> PostgreSQL publication -> restart -> exact revision retrieval, creating only the modules needed to make that production path real.
