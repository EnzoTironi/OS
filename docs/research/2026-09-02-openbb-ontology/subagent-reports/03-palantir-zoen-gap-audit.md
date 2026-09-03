# Palantir Ontology ↔ Zoen gap audit for OpenBB-like financial data

**Subagent role:** Lane 3 — Palantir public-contract and Zoen runtime auditor  
**Date:** 2026-09-02  
**Zoen snapshot:** `e34445c511f24e879c3dfb93387861f7cdd9e98e`  
**Repository:** `/Users/enzotironi/Code/OS`  
**Method:** Read-only comparison of current Palantir primary documentation against the checked-out Zoen runtime, wire contracts, persistence code, migrations, deployment supervision, and user-level journey coverage. Runtime claims below are tied to the stated Git snapshot and exact local file/line anchors. Negative-surface claims were checked across tracked source paths, not inferred from README aspirations.  
**Scope:** Object identity, typed links, object sets and object views, Actions and functions, authentication and entitlements, branching and governance, lineage and audit, generated CLI/API/MCP surfaces, and the dense observation/time-series boundary that an OpenBB-like provider layer would exercise.  
**Out of scope:** Reproducing Palantir internals that are not publicly documented; assessing Bloomberg or provider licenses; choosing OpenBB code for reuse; creating a fourth Zoen product; implementation changes.

## Executive verdict

Palantir's useful lesson is not its product breadth. It is its separation of concerns: a governed object world for meaning and decisions, separate indexing/sync machinery for bulk data and time series, typed query plans over objects, and one security model carried through every generated surface.

Zoen already has a stronger authority kernel than a conventional provider framework: content-digested canonical definitions, immutable claims with valid and knowledge time, replay-safe operations, explicit consistency cuts, causal explanations, governed proposal/approval/commit, and durable effect reconciliation. Those are not gaps to replace.

The blocking mismatch is physical and semantic. OpenBB-like market data would currently enter as scalar evidence. A batch is atomic, but every new direct-ingress claim becomes its own authority commit and outbox row; every projection advance then reloads all claims and rewrites one full Parquet snapshot. At the same time, Zoen lacks an explicit object-membership invariant, target-type enforcement for links, a governed accepted-view policy for rival values, provider-bound provenance, field/series entitlements, range-native series reads, rich object-set algebra, and a real inbound Ontology MCP surface.

The current projection worker's credential boundary is **not** a remaining gap. At the final snapshot, it is supervised and fail-closed against an exact least-privilege PostgreSQL role. That improvement should be preserved. It does not change the full-rebuild algorithm or make scalar claims suitable for ticks, candles, fundamentals, or large provider backfills.

The minimum coherent target is therefore:

1. keep Zoen's authority ledger for definitions, identities, policies, accepted decisions, batch manifests, Actions, and corrections;
2. add an immutable observation plane for dense tabular/time-series partitions;
3. bind the two through typed `ObservationSeries` / `DatasetVersion` objects and content-addressed manifests;
4. materialize permission-scoped typed object views and object-set plans from published meaning;
5. generate the same verbs into CLI, Connect API, MCP, and Eve.

## Comparative map

| Concern | Palantir public contract | Zoen runtime at the audited snapshot | Consequence for OpenBB-like integration |
|---|---|---|---|
| Object identity | An object is an instance of one object type and is identified by a configured primary-key property. | `EntityId` is a validated nominal string; there is no durable object-instance row or primary-key property. Type-query membership is inferred from the presence of any claim whose relation declares the requested `source_type`. | A ticker/provider symbol can accidentally become identity; one string can appear as several types; ambiguity and merge/split history have no home. |
| Typed links | A link type relates two object types, has independently named sides, is traversable in both directions, and carries explicit cardinality. | A relation may target `Type(T)`, represented as an entity-reference claim. Admission checks only that the value is an entity reference, not that the target is an instance of `T`. No generated reverse side exists. | Provider relationships can be structurally invalid while still admitted; traversal requires ad hoc queries. |
| Object sets | Lazy, single-type plans support filters, search-around, set algebra, order, limits, and aggregations. | `SemanticQuery` offers one by-entity selection or a paged by-type enumeration at a single `valid_at`. The by-type result is only entity IDs and the read layer caps pages at 100. | Screening, universes, portfolios, peer sets, and linked discovery cannot be expressed as one governed plan before fetching data. |
| Object views | Configured views expose typed properties, links, Actions, and application presentation. | There is no materialized `ObjectView<T>` contract. Relation and computation results are returned independently. | CLI, API, MCP, and Eve have no shared object-shaped projection to render. |
| Actions | One governed transaction can validate and edit multiple objects/properties/links and trigger side effects. | Zoen has proposal, policy, optional approval, state-basis hashing, commit, effect requests, and reconciliation. One Action's semantic effects share one authority commit. A single proposal is resource-centric; a Scenario can package multiple proposals atomically. | Preserve this kernel. Extend it to identity adjudication and accepted-view decisions; do not let provider connectors mutate accepted state directly. |
| Functions | Server-side functions have generated Ontology bindings, consistent snapshots, object-set inputs/outputs, and can back Actions. | Canonical definitions contain expression computations. Zoen also runs digest-pinned Wasm components with explicit query/explain/action capabilities and resource limits, but the wire interface is generic and not a generated typed Ontology function surface. | Computation safety is an advantage; discoverability, typed bindings, set operations, and released function contracts remain missing. |
| Security | Permissions distinguish ontology resources from object/link data; object-, row-, property-/column-, and combined policies are supported. Time-series backing sources have separate access rules. | Better Auth resolves a trusted tenant/principal/workload context; tables use tenant RLS; Cedar/MAC gates reads and governed Actions per entity. Direct evidence admission is authenticated but not Cedar-evaluated, and provenance source fields are caller supplied. Read authorization occurs after candidate discovery and is not relation/source/purpose-specific. | A licensed provider needs source-bound write authority and pre-discovery field/series entitlements before any broad ingestion. |
| Branching/governance | Ontology resources can be changed on branches, rebased, conflict-resolved, reviewed through proposals, protected, and merged to `main`. | Definition revisions are canonical/digested, evolution is classified, migrations are explicit, activation is governed, and rollback exists. There is no ontology branch/rebase/review-proposal model. Scenarios are data overlays pinned to a commit, not schema branches. | Provider mapping changes need isolated review and impact analysis without weakening current revision and migration guarantees. |
| Lineage/audit | Actions can generate action-log objects; audit logs answer who/what/when/where; lineage and edit history are platform concerns. | Claims retain source provenance; semantic values retain supporting/rival/computation lineage; `HistoryService.Explain` reconstructs Actions/claims/effects/policies and redacts protected payloads. | This is a Zoen advantage. Add raw-artifact, partition-range, mapping-version, resolution-policy, and searchable activity lineage rather than replacing causal explanation. |
| Generated surfaces | OSDK generates selected object/action/function types for TypeScript, Python, Java, and OpenAPI; Ontology MCP exposes permission-scoped ontology capabilities. | Connect contracts generate TypeScript protobuf bindings. The CLI registry is static. The tracked executable MCP path is a client/source connector to another MCP server; no inbound Ontology MCP server implementation was found. | README surface parity is aspirational. Provider routes must not become the MCP ontology by default. |
| Dense observations | Time-series object metadata contains a series reference; a separate dataset/stream-backed time-series sync indexes `seriesId`, timestamp, and value. | Dense values would be ordinary semantic claims. Projection is one full Parquet snapshot of all claims through head. Queries are point-in-time; an instant matches only that exact timestamp. | This is the principal P0 boundary: do not put market-data cells into the authority ledger one by one. |

## 1. Object identity and type membership

### Palantir contract

Palantir documents an object type as the schema of a real-world entity or event and an object as one instance. A configured primary-key property uniquely identifies each instance; edits remain attached to that key. See [Object types](https://www.palantir.com/docs/foundry/object-link-types/object-types-overview/) and [Create an object type](https://www.palantir.com/docs/foundry/object-link-types/create-object-type).

That does not by itself solve cross-provider instrument identity, but it establishes two invariants Zoen currently lacks: membership is explicit, and the key belongs to a type rather than being inferred from the presence of arbitrary properties.

### Exact Zoen behavior

- All semantic IDs, including `EntityId`, `TypeId`, and `RelationId`, are string newtypes using the same identifier grammar: [core identifiers](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:104), [identifier validation](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:288).
- A canonical definition declares types, relations, computations, and Actions, but `TypeDefinition` itself contains only an ID and attribute declarations: [definition model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:545), [canonical definition](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:611).
- `EvidenceDraft` associates an `EntityId` with one relation/value assertion; there is no object-instance or explicit membership field: [evidence model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1091).
- A by-type query first collects all relation IDs whose `source_type` is the requested type, then enumerates distinct entity IDs having any matching claim: [type relation expansion](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:916), [by-type execution](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:269).

### Gap and provider impact

There is no invariant equivalent to `ObjectKey = (TypeId, PrimaryKeyValue)`, no required-membership record, and no lifecycle for aliases or identifier assignments. For finance this is unsafe: `IBM`, an ISIN, a FIGI, a CIK, a crypto pair, and a provider-local slug refer to different identity levels and contexts. A stable internal `EntityId` must not be the first provider symbol observed.

The target identity master should minimally distinguish `LegalEntity`, `Instrument`, `ShareClassOrIssue`, `Listing` / `VenueInstrument`, `Venue`, `ExternalIdentifierAssignment`, and `CorporateAction`. An identifier assignment needs scheme, value, authority, identity level, venue/market context, valid interval, evidence, confidence/status, and supersession history.

Resolution must be explicit and plural:

```text
resolve(scheme, value, desired_identity_level, venue_or_market_scope?,
        valid_at?, include_inactive?, source)
  -> 0..n candidates + evidence
```

It must never silently select the first provider result.

## 2. Typed links and cardinality

### Palantir contract

Palantir link types relate two declared object types. A single link is bidirectional, with independently named/API-addressable sides, and links may express one-to-one, one-to-many, or many-to-many relationships. See [Link types](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/) and [Functions API: objects and links](https://www.palantir.com/docs/foundry/functions/api-objects-links).

### Exact Zoen behavior

- `RelationDefinition` has `source_type`, `target` (`Type` or scalar `Value`), and `Cardinality::{One,Many}`: [relation model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:557).
- Canonical admission parses and retains a type target: [relation decoding](/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:446).
- Evidence admission for `RelationTarget::Type(_)` checks only `ExactValue::Entity(_)`; the target type ID is intentionally unused and target membership is not looked up: [evidence target validation](/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:105).
- Ordinary relation queries evaluate the relation expression and return every valid claim; `QueryPlan` does not apply relation cardinality: [query plan](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:819).
- The Action state-basis path separately reduces `Cardinality::One` to the value with the latest supporting commit: [Action cardinality reduction](/Users/enzotironi/Code/OS/crates/zoen-engine/src/action/state_basis.rs:216).

### Gap and provider impact

Two consumers can therefore observe different semantics for the same cardinality-one relation: a direct query sees rivals, while an Action precondition gets the latest committed value. Latest commit is also not an adequate universal truth policy: it ignores provider authority, observation time, quality, license/purpose, correction status, and explicit adjudication.

The target must:

- create explicit typed object membership before accepting object links;
- validate source and target membership at admission/promotion time;
- publish link-side names and inverse traversal in the ontology contract;
- separate storage cardinality from belief selection;
- make violations conflicts requiring a governed resolution, not implicit overwrites;
- model link instances as objects when the relationship itself carries dates, source, confidence, or entitlements.

## 3. Accepted world view, rivals, and object sets

### What Zoen already has

Zoen correctly preserves plural evidence. A semantic value retains dependency roles for supporting, rival, and computation evidence: [lineage model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1188), [rival attachment](/Users/enzotironi/Code/OS/crates/zoen-engine/src/action/state_basis.rs:145). Definitions and queries are pinned to a digest/revision and knowledge cut, so changing a view need not rewrite history.

### Missing accepted-view contract

There is no named, published `knowledge_basis` or reducer policy that turns rival assertions into a purpose-specific accepted view. A relation query may return all currently valid assertions, and Action state uses latest supporting commit only for cardinality-one inputs. There is no durable resolution receipt saying which claims won, which lost, why, under which policy revision, for which purpose, and at which knowledge cut.

The reproducibility basis should become explicit:

```text
result = WorldRelease x valid_at x knowledge_cut x knowledge_basis x principal/purpose
```

`knowledge_basis` must select without deleting rival evidence. A minimal `WorldRelease` should close over the ontology revision, provider contracts, identity and resolution policies, quality rules, computation/component digests, and entitlement-policy revisions.

### Object-set and view gap

Palantir object sets are lazy plans with filtering, link traversal/search-around, set union/intersection/subtraction, ordering, limiting, and aggregation: [Object sets](https://www.palantir.com/docs/foundry/functions/api-object-sets/). Zoen's wire contract exposes one by-entity relation/computation selection or one by-type page at a single `valid_at`: [World API query shape](/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:94), [core query model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1121). The read engine caps type pages at 100: [read limit](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:18).

The target `ObjectView<T>` should be materialized at `(WorldRelease, valid_at, knowledge_cut, knowledge_basis, principal/purpose)` and contain verified type membership, typed selected properties plus rivals, typed links, series references, per-property entitlement decisions, lineage, and available governed Actions. `ObjectSet<T>` should be a pinned plan over filters, traversals, ordering, pagination, set algebra, and aggregations.

## 4. Actions and functions

### Palantir contract

Palantir describes Actions as single transactions that change one or more objects/properties/links under common logic and authorization, with optional side effects: [Actions](https://www.palantir.com/docs/foundry/action-types/overview/). Functions are isolated server-side logic with first-class object, link, object-set, edit, and generated binding support: [Functions](https://www.palantir.com/docs/foundry/functions/overview) and [Functions on objects](https://www.palantir.com/docs/foundry/functions/functions-on-objects).

### Zoen strengths to preserve

- The canonical definition includes typed Action inputs/outputs, a precondition, and relation effects: [Action definition](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:585).
- Action execution separates discovery, proposal, approval, commit, and operation-status surfaces: [Action API](/Users/enzotironi/Code/OS/proto/zoen/action/v1/action.proto:8).
- A commit records the policy evidence, trusted context, state basis, operation/intent identity, semantic records, and effect requests in one database transaction; all semantic effects share one `commit_sequence`: [Action commit](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/action_store/commit.rs:161), [Action records](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/action_store/commit.rs:222).
- Scenario application can package multiple proposal plans under one scenario authority commit and rejects a diverged base: [Scenario package commit](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/scenario_store.rs:297), [Scenario stale-basis check](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/scenario_store.rs:417).
- Wasm components are digest-pinned and execute only through an explicit capability manifest covering query, explain, and Action calls, under fuel/memory/table/instance/deadline bounds: [computation wire contract](/Users/enzotironi/Code/OS/proto/zoen/computation/v1/computation.proto:9), [capability manifest](/Users/enzotironi/Code/OS/crates/zoen-engine/src/computation.rs:52), [host interface](/Users/enzotironi/Code/OS/crates/zoen-engine/src/computation.rs:363).

### Remaining gap

Zoen does not yet expose functions as named, versioned ontology resources with generated typed object/set inputs and outputs. The current computation response is a narrow generic result shape, and provider logic is not released as a semantic contract alongside its mappings. An OpenBB adapter must not gain direct mutation authority merely because it can execute code.

Adapt the Wasm runtime into published typed `FunctionDefinition`s whose host capability manifest is derived from the ontology release. Let functions query object sets and observation ranges, return typed values/objects/sets, and propose governed Actions. Preserve capability pinning, resource bounds, deterministic digests, and the separation between an ontology edit and an external effect.

## 5. Authentication, authorization, and financial entitlements

### Palantir contract

Palantir distinguishes permissions on ontology schema resources from permissions on object/link data and supports granular object and property controls: [Object permissioning](https://www.palantir.com/docs/foundry/object-permissioning/overview/) and [Object security policies](https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies/). Time-series access additionally depends on the backing sync/data source: [Time-series permissions](https://www.palantir.com/docs/foundry/time-series/time-series-permissions).

### Zoen strengths

- Better Auth session evidence is resolved server-side from the auth database and expiry is checked: [SessionDoor](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/session_door.rs:26).
- Door, workload, and channel credentials resolve into a `TrustedExecutionContext`; the payload tenant must equal the trusted membership tenant: [credential resolution](/Users/enzotironi/Code/OS/apps/zoend/src/session.rs:108), [tenant match](/Users/enzotironi/Code/OS/apps/zoend/src/world_service.rs:61).
- The trusted context carries tenant, actor, principal, workload, delegation, and clearance: [trusted context](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:742).
- Read execution evaluates Cedar/MAC per returned entity and removes denied values; pinned-host reads fail closed: [read policy loop](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:160), [Cedar/MAC evaluator](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/cedar.rs:127).
- Authority tables are tenant-isolated with forced RLS, including semantic claims and projection metadata: [semantic/projection RLS](/Users/enzotironi/Code/OS/crates/zoen-adapters/migrations/0002_semantic_evidence_projection.sql:121).

### P0 write-admission hole

The generic evidence endpoint authenticates the tenant context, then parses `source_id`, `source_digest`, and `source_ref` directly from the caller payload: [wire provenance](/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:50), [payload parsing](/Users/enzotironi/Code/OS/apps/zoend/src/world_service.rs:314). `WorldEngine::record_evidence_batch` validates definition/relation/value shape and delegates to the store, but it has no `PolicyEvaluator` and performs no Cedar decision: [evidence engine path](/Users/enzotironi/Code/OS/crates/zoen-engine/src/lib.rs:808), [admission checks](/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:86).

Thus a caller with a valid tenant session can submit semantic evidence claiming to be another source unless an outer deployment convention prevents it. Authentication and tenant isolation are real; source attestation and write authorization are not.

The provider boundary must bind a source-specific workload credential to:

- allowed provider/capability IDs and endpoints;
- credential vault reference, not credential material in claims;
- raw artifact request/response digest and adapter/component digest;
- allowed entity types, relations/fields, time ranges, and update modes;
- license, purpose, retention, derivation, display, export, and redistribution rights;
- an admission policy decision recorded with the batch/claim.

### P0 read-entitlement hole

Zoen first executes/paginates a semantic query, then applies per-entity read policy: [query before policy](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:160). Denied candidates can affect page occupancy and cursors, and policy projection currently sets `object_type: None` and has no property/source/purpose dimension: [policy projection](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:219).

For licensed financial data, permission filtering must happen before candidate discovery and again at derived output/export. The policy subject is not just an entity; it is `(principal/workload, purpose, object/type, field or series, provider/license, operation, valid/knowledge time)`. Errors, lineage, citations, MCP schemas, aggregate counts, and cursors must not leak denied data.

## 6. Branching and ontology governance

### Palantir contract

Palantir's current branching model supports isolated resource changes, ontology proposals, protected resources, rebasing from `main`, explicit conflict resolution, review, and merge: [Branching the ontology](https://www.palantir.com/docs/foundry/ontologies/branching-ontology/).

### Exact Zoen behavior

Zoen publishes canonical definition JSON under a digest/revision and records actor, principal, workload, policy evidence, and commit sequence: [definition publication model](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:622). Evolution changes are classified as compatible, migration-required, breaking, or forbidden; activation/rollback records previous and active references and migration identity: [evolution classification](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:641), [activation record](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1252). The Definition API exposes plan, prepare/apply migration, activate, and rollback: [Definition service](/Users/enzotironi/Code/OS/proto/zoen/definition/v1/definition.proto:9).

This is substantial governance and should not be replaced by generic Git-only versioning. What is missing is a first-class draft branch/proposal closure that lets an operator change an ontology plus provider contracts, mappings, identity/resolution policy, entitlements, Wasm capability manifests, and generated surfaces together, then inspect impact, rebase, resolve conflicts, approve, activate, and roll back.

Zoen Scenarios are valuable but solve a different problem: they pin a world-data base, overlay proposed effects, and apply only if the base still matches. They are not definition branches and should not be stretched into one.

## 7. Lineage and audit

### Palantir contract

Palantir Action logs model each submission as an object linked to edited objects, while security audit logs capture who did what, when, and where: [Action log](https://www.palantir.com/docs/foundry/action-types/action-log) and [Audit logs](https://www.palantir.com/docs/foundry/security/audit-logs-overview).

### Zoen advantage

Zoen's causal evidence is deeper than a simple activity log:

- claims retain definition reference, valid time, source identity/digest/reference, observed time, and server-stamped ingestion time: [evidence/provenance](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1065);
- semantic values retain supporting, rival, computation, and migration origins: [semantic lineage](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1188), [query migration enrichment](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:259);
- causal explanations can target operation, claim, effect request, or proposal decision and explicitly report missing, corrupt, unavailable, or redacted evidence: [History API](/Users/enzotironi/Code/OS/proto/zoen/history/v1/history.proto:9), [explanation engine](/Users/enzotironi/Code/OS/crates/zoen-engine/src/history.rs:177);
- claim payload visibility is re-authorized and action payloads are redacted for other principals: [history payload access](/Users/enzotironi/Code/OS/crates/zoen-engine/src/history.rs:761).

### Gap for provider data

The observation plane needs lineage units larger than scalar claims: request identity, raw response CAS digest, adapter/component version, provider schema snapshot, normalized partition digest, row/range coordinates, validation result, identity-resolution receipt, accepted-view policy, entitlement decision, and derived computation range. Projection Parquet currently carries source ID/digest/reference and valid time but omits observed/ingested timestamps from its physical schema: [projection source load](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:190), [physical claim schema](/Users/enzotironi/Code/OS/crates/zoen-query/src/physical.rs:15).

Zoen also needs a searchable activity/audit projection for operators. `Explain(target)` is excellent causal retrieval, but it is not a queryable feed of all source syncs, policy denials, mapping changes, identity resolutions, exports, or Action submissions.

## 8. Generated surfaces and MCP

### Palantir contract

Palantir's OSDK generates permission-scoped types and operations for selected objects, links, Actions, and functions across supported language/package surfaces: [OSDK overview](https://www.palantir.com/docs/foundry/ontology-sdk/overview/). Its Ontology MCP is likewise an ontology-aware agent surface: [Ontology MCP](https://www.palantir.com/docs/foundry/ontology-mcp/overview/).

### Exact Zoen behavior

- Zoen defines Connect services for Definition, World, Action, Computation, Effect, and History: [World service](/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:7), [Action service](/Users/enzotironi/Code/OS/proto/zoen/action/v1/action.proto:8), [History service](/Users/enzotironi/Code/OS/proto/zoen/history/v1/history.proto:9).
- Buf generates TypeScript protobuf bindings into `gen/connect`: [Buf generation](/Users/enzotironi/Code/OS/buf.gen.yaml:1).
- The journey gate explicitly rejects reintroduction of `@zoen/sdk`, `@zoen/osdk`, or ontology package paths: [surface gate](/Users/enzotironi/Code/OS/e2e/run.sh:118). This is evidence that there is no current OSDK compatibility promise, not a recommendation to add a separate SDK product.
- CLI command schemas are manually registered, including `source.connect.mcp`: [static CLI schema](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:194).
- The executable MCP code connects Zoen as a client to an external URL, invokes `initialize`, then calls a named remote tool and converts its generic result into the demo source path: [MCP source connector](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:1868), [MCP fetch](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2116). It even assigns the current demo resource `entity.nota.1`: [demo MCP mapping](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2142).
- Workload credentials contain an `McpInboundRead` allowance, but no tracked inbound Ontology MCP server implementation was found. An allowance is not a server surface.

### Target

Do not create a fourth product or a parallel SDK ontology. Generate metadata/adapters from the same published canonical meaning into the existing three Ontology surfaces:

- `zoen object ...`, `zoen data ...`, and governed `zoen action ...` CLI verbs;
- Connect API messages and descriptors;
- progressively disclosed MCP resources/tools/prompts;
- Eve's human explanation and membership workbench.

Borrow OpenBB's progressive tool discovery and compact schemas so hundreds of provider capabilities do not flood agent context. Every surface must preserve the same identity, valid/knowledge/belief basis, policy decision, lineage, idempotency, and Action boundary. No generated tool may expose a direct accepted-state mutation bypass.

## 9. High-volume and time-series boundary

### Current direct-ingress transaction shape

1. `RecordEvidenceBatch` rejects empty input and caps a request at 1,000 claims: [batch endpoint](/Users/enzotironi/Code/OS/apps/zoend/src/world_service.rs:114).
2. The store opens one transaction, takes the tenant authority-head row `FOR UPDATE`, loops the admitted items, updates the head once, and commits atomically: [batch transaction](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:31).
3. For every **new** direct-ingress claim, `write_claim` increments the head, inserts one `authority_commits` row with kind `evidence`, inserts the semantic claim, and inserts one `projection_outbox` row at ordinal zero: [one commit per claim](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:246).
4. Replay is correctly idempotent: an existing identical claim returns its original receipt, a conflicting same claim ID fails, and operation ID plus intent digest replays the whole prior batch: [claim replay](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:252), [operation replay](/Users/enzotironi/Code/OS/crates/zoen-engine/src/evidence.rs:38).

The phrase “every claim is a commit” must be scoped precisely. It is true for each new **direct evidence-ingress** claim, including claims inside `RecordEvidenceBatch`. It is false for all semantic records globally: one governed Action's multiple effects share one Action commit, and all proposal plans applied as one Scenario package share one Scenario commit.

### Current projection shape

On every advancing run, the worker:

1. reads the authority head and current projection;
2. verifies that every authority commit through the target has an ordinal-zero outbox row; the outbox is a coverage assertion, not a queue of deltas: [outbox coverage query](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:157);
3. loads **all** `semantic_claims` with `commit_sequence <= target`: [full claim load](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:190);
4. builds one Arrow batch and full Parquet byte vector in memory, writes an immutable object, writes an immutable manifest object, then publishes the manifest/watermark in PostgreSQL: [full serialization](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:96), [object publication](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:107);
5. records `from_commit = 1`; the source comment states this is a placeholder because v1 rebuilds are always full: [full-rebuild marker](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:252).

When the watermark already covers head, the worker now refreshes only `projection_watermarks.updated_at` and returns without rewriting data: [no-change heartbeat](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:88), [watermark refresh](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:293). No query path currently uses that timestamp; it is operational liveness, not changed result semantics.

Continuous mode processes one canonical `ZOEN_TENANT_ID` and defaults to a five-second interval: [continuous worker](/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:55), [single tenant](/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:138). This is one tenant per supervised worker, not tenant discovery or sharding.

### Final-snapshot security correction

Earlier snapshots only checked that the projection credential could not insert semantic claims. That gap is closed and should be removed from the priority matrix:

- the process rejects generic authority URLs/passwords and ambient libpq credential/service/option variables, validates the explicit projection URL, and invokes the exact-role check before constructing the worker: [projection startup boundary](/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:22), [ambient credential rejection](/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:78);
- runtime verification requires the exact `zoen_projection` identity and audits database, schema, column, table, sequence, default ACL, and routine capabilities: [role boundary](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/authority_store.rs:128), [boundary audit sequence](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/authority_store.rs:180);
- migration `0027` revokes broad table/sequence/default privileges and grants SELECT on exactly six source/metadata tables plus column-scoped INSERT/UPDATE on manifests/watermarks: [projection grants](/Users/enzotironi/Code/OS/crates/zoen-adapters/migrations/0027_projection_role_boundary.sql:17);
- Fly now supervises and restarts the projection process with coordinated termination: [projection supervisor](/Users/enzotironi/Code/OS/deploy/fly/supervisord.conf:64).

This is a real Zoen advantage. It reduces blast radius; it does not reduce projection complexity.

### Current query boundary

- `SemanticQuery` has one `valid_at`; there is no interval/range, latest, first/last, resample, downsample, window, or aggregate series contract: [semantic query](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1135).
- Stored instant claims match only `valid_from_micros == valid_at`; intervals use half-open containment: [Postgres temporal predicate](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/claim_store.rs:86), [valid-time semantics](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1045).
- Strong reads use PostgreSQL at authority head; snapshot reads use PostgreSQL at the requested cut; eventual and satisfied at-least reads use the Parquet projection: [source selection](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:395).

### Why OpenBB-like volume breaks it

Ten years of roughly 252 daily sessions for 10,000 listings, with OHLCV plus adjusted close as six scalar relations, is about 151.2 million claims before quotes, fundamentals, corporate actions, alternatives, or intraday bars. Through current direct ingestion that means approximately 151.2 million authority commits and 151.2 million outbox rows. Every projection advance verifies commit coverage across the range, reloads all claims through head, materializes them in memory, and rewrites the whole Parquet snapshot.

The cost is not merely storage. It couples decision-log serialization, tenant-head contention, projection latency, object-store churn, and query freshness to the number of market-data cells. A five-second polling interval can cause repeated whole-history builds under a continuously moving head. Multi-provider rivals multiply the count again. The absence of native range reads then makes the expensive representation less useful than a normal series store.

### Palantir's relevant separation

Palantir documents a time-series object/type as metadata and a series identifier, while a separate dataset- or stream-backed time-series sync indexes `seriesId`, timestamp, and value for efficient retrieval: [Time-series overview](https://www.palantir.com/docs/foundry/time-series/time-series-overview), [Time-series syncs](https://www.palantir.com/docs/foundry/time-series/time-series-syncs), and [Time-series concepts](https://www.palantir.com/docs/foundry/time-series/time-series-concepts-glossary). Access to the object/property and backing sync are separately considered.

The design lesson is a boundary, not a request to clone Foundry: the ontology binds identity, semantics, security, and decisions to the series; the timestamp/value population lives in specialized sync/index storage.

### Concrete Zoen target boundary

| Plane | Durable units | Commit policy | Query/use |
|---|---|---|---|
| Authority/semantic plane | definitions, provider capability contracts, identity assignments/resolutions, entitlement policies, accepted-view policies, Actions, corrections, `ObservationBatchAccepted` manifests | one authority commit per governed decision or admitted immutable synchronization slice, never one per market-data cell by default | exact semantic reads, object views, causal explanation, governance |
| Raw acquisition plane | request identity, response bytes, headers, retrieval/observation time, adapter/component digest, provider schema snapshot, terms metadata | content-addressed CAS receipt referenced by one batch manifest | replay normalization and prove source fidelity |
| Observation plane | immutable Arrow/Parquet partitions keyed by series/dataset version and bounded time/sequence range; column statistics and semantic bindings | append a partition/segment; corrections create replacement/tombstone manifests, not in-place edits | range, latest, first/last, as-of, aggregate, downsample, resample |
| Projection/index plane | incremental partition manifests, compacted snapshots, per-series statistics, checkpoints | consume new batch/outbox ranges; compose manifests; full rebuild only for repair | freshness and efficient scans without rewriting history |

Required invariants:

1. A provider page/window/stream checkpoint has a stable idempotency identity derived from provider, capability, normalized query, cursor/window, adapter version, and raw digest.
2. One admitted segment records count, schema/mapping revision, series identities, min/max event time, source/terms, raw and normalized digests, previous checkpoint, and validation outcome.
3. Authority commit and batch outbox publication are atomic; object-store content is immutable and addressable before acceptance.
4. Projection consumes explicit new commit/segment ranges and publishes a manifest that composes immutable partitions. `from_commit` is real, not a placeholder.
5. Corrections, provider restatements, splits, and deletions are new revision/tombstone overlays. Raw observations remain recoverable.
6. A derived scalar claim cites the exact series partitions/range, algorithm/component digest, parameters, calendar/adjustment policy, and knowledge cut.
7. Entitlements are checked before series discovery and at read, derivation, cache, citation, export, and redistribution boundaries.
8. Scalar semantic claims remain appropriate for sparse operational truth, decisions, annotations, exceptions, accepted identity mappings, and deliberately materialized metrics.

## Prioritized gap matrix

Priority meanings: **P0** blocks a safe first OpenBB-like financial-data vertical; **P1** blocks Palantir-grade operability or surface parity after the first vertical; **P2** improves breadth and ergonomics without being required for the initial coherent kernel.

| ID | Priority | Gap | Exact current evidence | Target / definition of done |
|---|---|---|---|---|
| G1 | P0 | Dense observations share the scalar authority path and projection is full-rebuild. | [batch cap](/Users/enzotironi/Code/OS/apps/zoend/src/world_service.rs:114), [per-claim commit/outbox](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:246), [full load](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:190), [full marker](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:252) | Observation plane, one accepted segment commit, incremental manifests, range-native query; full rebuild reserved for repair. |
| G2 | P0 | Provider/source identity is caller-asserted and evidence writes are not policy-evaluated. | [caller provenance](/Users/enzotironi/Code/OS/apps/zoend/src/world_service.rs:314), [policy-free WorldEngine path](/Users/enzotironi/Code/OS/crates/zoen-engine/src/lib.rs:808) | Source-specific workload, raw CAS receipt, governed mapper digest, admitted relation/type/time scope, recorded write-policy evidence. |
| G3 | P0 | No provider-independent object identity or explicit type membership. | [generic EntityId](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:104), [type inferred from relations](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:916) | Canonical object keys and effective-dated identifier assignments; ambiguous resolution returns candidates; membership is durable and validated. |
| G4 | P0 | Typed link target and cardinality invariants are not enforced uniformly. | [type target ignored beyond entity shape](/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:137), [query ignores cardinality](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:825), [Action latest-commit reduction](/Users/enzotironi/Code/OS/crates/zoen-engine/src/action/state_basis.rs:216) | Validate both endpoint types; publish inverse sides; separate cardinality from a named accepted-view reducer; conflicts are explainable. |
| G5 | P0 | No governed accepted-view/knowledge-basis contract for rival provider facts. | [plural semantic values](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:1208), [rival lineage](/Users/enzotironi/Code/OS/crates/zoen-engine/src/action/state_basis.rs:145) | Published resolution policy plus durable receipt yields selected belief and rivals at a cut/purpose without deleting evidence. |
| G6 | P0 | Read policy is entity-only, post-discovery, and lacks field/series/provider/purpose entitlements. | [query then policy](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:160), [object type absent from policy projection](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:246) | Pre-discovery authorization and property/series/source/purpose controls; no leakage in counts, cursors, errors, lineage, citations, or exports. |
| G7 | P1 | Provider capability and semantic mapping are not published ontology resources. | [static/demo source contract](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2000), [hard-coded resources](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2106) | Canonical provider capability contract pins adapter, query/output schemas, identity/time/unit semantics, raw digest rules, terms, mapping, and generated-surface metadata. |
| G8 | P1 | No typed ObjectView/ObjectSet algebra. | [narrow query shape](/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:107), [100-item policy layer cap](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:166) | Typed view plus lazy filter/traverse/set/order/aggregate plan pinned to release/time/cut/belief/principal. |
| G9 | P1 | No schema branch/rebase/review proposal spanning the release closure. | [existing revision/evolution API](/Users/enzotironi/Code/OS/proto/zoen/definition/v1/definition.proto:9) | Branch ontology/provider/policy/component changes together; impact, rebase/conflict, approval, activation, rollback are user-visible journeys. |
| G10 | P1 | No generated inbound Ontology MCP or unified permission-scoped surface. | [static CLI](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:194), [outbound MCP client](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2116), [SDK exclusion gate](/Users/enzotironi/Code/OS/e2e/run.sh:123) | Same published nouns/verbs generate CLI, Connect, progressive MCP, and Eve adapters with identical policy and lineage. |
| G11 | P1 | Wasm computation is safe but not a typed ontology function resource. | [generic Execute contract](/Users/enzotironi/Code/OS/proto/zoen/computation/v1/computation.proto:73), [capability host](/Users/enzotironi/Code/OS/crates/zoen-engine/src/computation.rs:363) | Versioned function definition with typed object/set/series input/output, consistent basis, capability-derived host access, and Action proposal support. |
| G12 | P1 | Causal explanation is target-oriented, not a searchable operational audit/feed. | [single Explain RPC](/Users/enzotironi/Code/OS/proto/zoen/history/v1/history.proto:9) | Permissioned audit/activity object set for source syncs, mapping/policy changes, Actions, denials, exports, and effect outcomes; causal Explain remains source of depth. |
| G13 | P1 | Projection object publication can leave unreferenced immutable objects on failed/racing publication; no compaction/GC contract is visible. | [objects written before DB publish](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:107), [late advisory lock](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:219) | Segment/manifest lifecycle with reachability, safe compaction, orphan collection, concurrent-build fencing, and repair journey. |
| G14 | P2 | Interfaces/shared semantic capability contracts are absent. | [current type/relation-only definition](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:545) | Minimal interface primitive for required properties, links, and Actions across financial object types; avoid cloning Palantir's full metadata breadth. |
| G15 | P2 | Rich object-view configuration and analytical UI are absent. | No runtime object-view resource at this snapshot. | Generate small view metadata for Eve/widgets after identity, accepted view, security, and sets are real; no fake chat dashboard. |

### Explicitly removed/downgraded gap

“Projection worker has excessive database authority or is unsupervised” is no longer P0/P1 at this snapshot. Exact-role verification, narrow grants, ambient-credential rejection, and Fly supervision are implemented. Remaining operational work such as multi-tenant placement, metrics, compaction, and GC belongs under G13 or later scaling work, not under a claim that the worker can mutate authority.

## Product journeys, not unit tests

These are end-to-end user journeys consistent with Zoen's repository law. They should drive the real CLI/API/MCP/Eve and deployed stores; do not replace them with unit mocks, fakes, stubs, or `vi.mock`.

### Journey 0 — resolve identity ambiguity

Given `ticker=IBM`, fetch a mapping with venue/currency context, preserve raw bytes/digest and all candidates, create candidate identifier assignments, and require a governed Action to resolve the intended Listing.

**Exit proof:** ambiguous candidates cannot collapse silently; replay from the raw artifact yields the same candidates; History explains who resolved the assignment, under which definition/policy/source evidence.

### Journey 1 — one comparable price, two providers

Fetch one daily close from two providers for the resolved Listing. Bind currency, venue, trading date/calendar, adjustment basis, provider observation time, mapping revision, and entitlements. Preserve both as rivals and apply a published selection policy or explicit adjudication Action.

**Exit proof:** one object view returns selected belief plus rivals; changing provider priority creates a new resolution basis without rewriting history; each value is reconstructible from raw bytes.

### Journey 2 — a real observation series

Ingest one year of daily OHLCV plus adjusted close as immutable partitions bound to `ObservationSeries`. Query a date range through the actual data plane without one authority commit per cell. Materialize 20-day volatility as a semantic claim citing the exact source partitions and component digest.

**Exit proof:** range/latest/downsample queries work at a pinned cut; a correction publishes a new segment/manifest; the derived claim has complete causal lineage.

### Journey 3 — SEC fundamental fact and restatement

Ingest one filing with CIK, accession, taxonomy namespace/version, concept, dimensional context, period, unit, decimals, and direct/imputed status. Validate one accounting identity. Later ingest a restatement.

**Exit proof:** standardized values retain original facts and derivations; the restatement is a new vintage, not an overwrite; `as_known_at` reproduces both states.

### Journey 4 — entitlement-aware object and series

Grant one principal a provider field for on-screen research but not export, and deny another principal entirely. Open the same object and series through CLI, Connect, MCP, and Eve.

**Exit proof:** denied information is absent from discovery, values, counts, cursors, lineage, citations, cached artifacts, and tool descriptions; permitted Actions agree across surfaces.

### Journey 5 — corporate-action derivation

Preserve an unadjusted raw price series; publish a split/dividend event with announcement, ex, record, pay, and effective times; derive an adjusted series pinned to event vintage, formula/component digest, mapping revision, and knowledge cut.

**Exit proof:** adjusted values never overwrite raw observations and are reproducible under the exact event/action vintage.

### Journey 6 — multi-leg rebalance with unknown broker outcome

Preview one rebalance, let market state stale the basis, re-propose and approve, atomically commit the portfolio decision, dispatch broker effects, and reconcile an initially unknown provider result.

**Exit proof:** state decision and external effects remain distinct; all legs share one governed operation basis; replay does not duplicate an order effect.

### Journey 7 — provider schema evolution

Change one provider field or semantic mapping on a release branch. Show impact on accepted views, series, entitlements, Wasm capabilities, and generated surfaces; migrate, review, activate, and roll back.

**Exit proof:** historical queries and explanations remain valid under the original provider/field/mapping revision; conflicting branch changes are explicit.

### Journey 8 — surface parity

Publish one typed object query, one series query, and one governed Action. Use the generated equivalents in CLI, Connect API, progressively disclosed MCP, and Eve.

**Exit proof:** names, types, identity, valid/knowledge/belief basis, policy, lineage, idempotency, and effect semantics agree; no surface exposes a bypass.

### Journey 9 — projection repair without authority escalation

Run the supervised projection worker under only `zoen_projection`; inject an object-store publication failure; resume incrementally; compact old segments; collect only unreachable objects; rebuild from manifests as an explicit repair.

**Exit proof:** the worker cannot mutate claims/authority, successful watermarks never reference partial data, a normal advance does not rescan/rewrite all history, and repair preserves snapshot digests.

## Zoen advantages that must survive the integration

1. **Canonical published meaning:** retain RFC-8785-style canonical JSON, digest/revision identity, governed activation, explicit migration, and rollback.
2. **Evidence is not belief:** retain immutable rival claims and add a resolution receipt; never turn provider priority into destructive overwrite.
3. **Two times:** retain domain valid time and ordered knowledge cuts; add provider/event/retrieval/vintage semantics without collapsing them.
4. **Explicit consistency:** retain strong, snapshot, at-least, and eventual reads; extend them across observation manifests rather than hiding freshness.
5. **Causal explanation:** retain supporting/rival/computation/migration lineage, explicit gaps, and payload redaction.
6. **Governed verbs:** retain discover/propose/approve/commit, state-basis conflict detection, policy evidence, and atomic Action commits.
7. **Effects are not commits:** retain durable effect requests, attempts, unknown outcomes, and reconciliation through `zoen-effect-dispatcher`/Restate.
8. **Constrained computation:** retain digest-pinned Wasm, declared capabilities, deterministic request/result evidence, and hard resource limits.
9. **Trusted tenancy:** retain Better Auth SessionDoor, membership-derived context, workload credentials, tenant RLS, Cedar, and MAC.
10. **Least-privilege projection:** retain the exact `zoen_projection` role boundary, ambient-credential rejection, and process supervision.
11. **Small coherent product:** Ontology remains CLI + API + MCP, Conversation remains Eve, and Auth remains Better Auth. Richness belongs in ontology verbs and evidence, not a new dashboard product.

## Decision gates

1. Do not integrate OpenBB wholesale until its applicable license and distribution boundary are reviewed for the exact code/version used.
2. Do not promise Bloomberg equivalence without licensed content, explicit field/series entitlements, and identity operations.
3. Do not call a normalized provider row an ontology object until type membership, links, accepted-view policy, and security are enforced.
4. Do not put dense price/quote/fundamental history into `semantic_claims`; land the observation-series boundary first.
5. Do not admit provider evidence from caller-supplied `source_id`; bind a source workload to raw CAS and a governed mapper.
6. Do not make latest authority commit the implicit universal truth rule.
7. Do not generate hundreds of provider endpoints directly as always-on MCP tools; disclose domain capabilities progressively.
8. Build and prove the first vertical journeys before a generic plugin marketplace or rich object-view UI.

## Primary Palantir sources

- [Ontology system architecture](https://www.palantir.com/docs/foundry/architecture-center/ontology-system)
- [Ontology overview](https://www.palantir.com/docs/foundry/ontology/overview)
- [Object types](https://www.palantir.com/docs/foundry/object-link-types/object-types-overview/)
- [Object type primary keys](https://www.palantir.com/docs/foundry/object-link-types/create-object-type)
- [Link types](https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/)
- [Interfaces](https://www.palantir.com/docs/foundry/interfaces/interface-overview)
- [Object sets](https://www.palantir.com/docs/foundry/functions/api-object-sets/)
- [Actions](https://www.palantir.com/docs/foundry/action-types/overview/)
- [Action log](https://www.palantir.com/docs/foundry/action-types/action-log)
- [Functions](https://www.palantir.com/docs/foundry/functions/overview)
- [Functions on objects](https://www.palantir.com/docs/foundry/functions/functions-on-objects)
- [Branching the ontology](https://www.palantir.com/docs/foundry/ontologies/branching-ontology/)
- [Object permissioning](https://www.palantir.com/docs/foundry/object-permissioning/overview/)
- [Object security policies](https://www.palantir.com/docs/foundry/object-permissioning/object-security-policies/)
- [Audit logs](https://www.palantir.com/docs/foundry/security/audit-logs-overview)
- [Time-series overview](https://www.palantir.com/docs/foundry/time-series/time-series-overview)
- [Time-series syncs](https://www.palantir.com/docs/foundry/time-series/time-series-syncs)
- [Time-series permissions](https://www.palantir.com/docs/foundry/time-series/time-series-permissions)
- [Ontology SDK](https://www.palantir.com/docs/foundry/ontology-sdk/overview/)
- [Ontology MCP](https://www.palantir.com/docs/foundry/ontology-mcp/overview/)

## Local Zoen evidence index

- Product boundary: [README](/Users/enzotironi/Code/OS/README.md:6)
- Canonical object/relation/Action definition: [zoen-core](/Users/enzotironi/Code/OS/crates/zoen-core/src/lib.rs:545)
- World evidence and query wire contract: [world.proto](/Users/enzotironi/Code/OS/proto/zoen/world/v1/world.proto:7)
- Evidence admission: [admission.rs](/Users/enzotironi/Code/OS/crates/zoen-engine/src/admission.rs:86)
- Evidence batch and per-claim commit/outbox: [evidence_store.rs](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/evidence_store.rs:31)
- Query semantics and source selection: [zoen-query lib](/Users/enzotironi/Code/OS/crates/zoen-query/src/lib.rs:120)
- Exact instant/interval matching: [claim_store.rs](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/claim_store.rs:75)
- Read authorization: [read.rs](/Users/enzotironi/Code/OS/crates/zoen-engine/src/read.rs:99)
- Governed Action commit: [action commit](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/action_store/commit.rs:161)
- Scenario package commit: [scenario store](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/scenario_store.rs:297)
- Causal explanation: [history engine](/Users/enzotironi/Code/OS/crates/zoen-engine/src/history.rs:177)
- Wasm capability runtime: [computation](/Users/enzotironi/Code/OS/crates/zoen-engine/src/computation.rs:52)
- Full Parquet projection: [projection](/Users/enzotironi/Code/OS/crates/zoen-query/src/projection.rs:69)
- Projection least-privilege enforcement: [authority store](/Users/enzotironi/Code/OS/crates/zoen-adapters/src/authority_store.rs:128)
- Projection grants: [migration 0027](/Users/enzotironi/Code/OS/crates/zoen-adapters/migrations/0027_projection_role_boundary.sql:17)
- Projection process/single-tenant cadence: [zoen-projection](/Users/enzotironi/Code/OS/apps/zoend/src/bin/zoen-projection.rs:22)
- Projection supervision: [supervisord](/Users/enzotironi/Code/OS/deploy/fly/supervisord.conf:64)
- Static CLI and outbound MCP source connector: [CLI schema](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:194), [MCP fetch](/Users/enzotironi/Code/OS/apps/zoend/src/cli.rs:2116)

## Limitations and audit notes

- Palantir is proprietary. This report compares only public product contracts and does not infer private storage or implementation details.
- OpenBB-like provider behavior is used as a workload class: federated providers, heterogeneous identifiers, pagination/backfills, corrections, dense market observations, and licensed fields. Detailed OpenBB repository findings belong to the companion research lanes.
- The audit is source-level and read-only. It did not alter Zoen runtime files or claim that every code path was load-tested at market-data scale.
- The repository HEAD advanced during the broader research. The final re-audit compared the projection/authority delta through `e34445c511f24e879c3dfb93387861f7cdd9e98e`. It strengthened projection credential isolation, role verification, grants, supervision, and changed continuous polling to one tenant at five seconds. It did **not** change direct claim commit/outbox behavior, full-rebuild projection, query semantics, auth/type/link/accepted-view behavior, or MCP implementation.
- Development working-tree changes unrelated to this research belong to the user. This report makes no claim about them and changes no project file.
- Architecture priorities are recommendations, not statements that Palantir or any standard mandates Zoen's proposed internal design.
