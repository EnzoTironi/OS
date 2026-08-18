# ADR-0015: Canonical semantic identity and public wire protocol are separate contracts

**Status:** Accepted for V1  
**Date:** 2026-08-18

## Context

Zoen definitions must have stable content identity across languages, processes and deployments, while public clients need an evolvable typed protocol. Reusing a transport serialization as semantic identity would leak protocol-library behavior into ontology history; reusing canonical JSON as the runtime RPC surface would sacrifice schema evolution and generated client ergonomics.

## Decision

Zoen V1 uses two deliberately separate contracts.

### Canonical definition IR

Published ontology definitions use a versioned strict JSON semantic IR, beginning with `zoen.definition.v1`.

The publication pipeline is:

```text
Authoring source
  -> RawDefinitionBundle
  -> semantic validation
  -> normalized CanonicalDefinitionBundle
  -> RFC 8785 JSON Canonicalization Scheme bytes
  -> SHA-256 DefinitionDigest
  -> immutable publication
```

Rules:

- reject duplicate JSON object keys before canonicalization;
- every executable field participates in canonical identity;
- object-member ordering is not semantic;
- unordered semantic collections are normalized before JCS; ordered relations/lists retain explicit order;
- exact decimal, money and quantity magnitudes use tagged decimal strings rather than binary JSON floating-point representation;
- dates/times, entity references, bytes and typed collections use explicit tagged canonical forms;
- externally compiled executable artifacts such as Wasm components are referenced by immutable content digest and declared interface/capabilities;
- presentation metadata is not part of semantic definition identity unless a definition explicitly declares it semantic.

Authoring tools may expose richer sugar such as properties, links, policies and interfaces, but compilation normalizes them to the canonical `Type + Relation + Computation + Action` model before hashing.

### Public protocol

Zoen V1 public machine protocol uses versioned Protobuf contracts managed with Buf lint/breaking-change checks and served through ConnectRPC.

The transport boundary lives in `zoend`:

```text
Protobuf request
  -> validate transport shape
  -> convert to zoen-core semantic types
  -> engine/query operation
  -> typed semantic result
  -> Protobuf response
```

Protobuf serialized bytes are never used as ontology/content hashes. Public generated Rust/TypeScript clients depend on `.proto` contracts, not internal Rust structs.

## Protocol services

V1 protocol is capability-oriented rather than CRUD-oriented. Exact message details may evolve under Buf compatibility rules, but service responsibilities are fixed:

```text
DefinitionService
  Publish
  GetRevision
  GetActiveRevision
  PlanEvolution
  ActivateRevision

WorldService
  RecordEvidence
  Query

ActionService
  Discover
  Propose
  Approve
  Commit
  GetOperationStatus

EffectService
  RecordAttemptEvidence
  Reconcile

HistoryService
  Explain
```

Bulk/streaming forms may be added where needed without creating parallel business semantics.

## Invariants

- Same semantic definition -> same canonical bytes -> same digest across supported implementations.
- Changing executable meaning changes canonical bytes/digest.
- Historical semantic identity does not depend on Protobuf implementation/version.
- Wire types do not cross into `zoen-core` public APIs.
- Internal storage rows/Arrow schemas are not public protocol types.
- Unknown protocol fields can evolve according to Protobuf compatibility without silently changing semantic identity.
- Canonical IR version changes require explicit compatibility/evolution handling.

## E2E verification

V1 release tests must:

1. compile the same ontology from independent processes and prove identical canonical bytes/digest;
2. mutate every executable definition family and prove digest changes;
3. publish through a generated TypeScript Connect client and retrieve through a generated Rust/CLI client after process restart;
4. run Buf breaking-change checks against the previous released protocol image;
5. prove semantically identical canonical definitions transported through Protobuf JSON/binary forms publish to the same definition digest;
6. inject malformed/duplicate-key/non-canonical authoring input and prove no revision is partially published.

## Consequences

The canonical IR can outlive transport choices, and transport can evolve without rewriting ontology history. TypeScript authoring, agents and visual tooling all compile to one semantic artifact. The cost is maintaining explicit conversion at the `zoend` boundary; that conversion is intentional boundary discipline, not duplication.

## Revisit if

A future canonical binary format provides demonstrably stronger cross-language determinism/tooling without coupling semantic identity to a transport implementation. Any migration must preserve existing revision identities forever.
