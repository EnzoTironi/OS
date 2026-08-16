# Evidence

**Kind:** mixed. Each block names its kind.  
**Fetched:** 2026-08-15  
**Decision:** none at file level. Decision state lives on the claim inside the block or in `candidate-laws.md`.

Inference is marked. Quotes are short and from the fetched page.

## Palantir

### E-P1. Kinetic elements are versioned separately from object types

- Kind: domain evidence
- Source: P1 Ontology overview, P9 Function versioning
- Decision: `supported` as Palantir's split

Palantir splits "semantic elements" (objects, properties, links) from "kinetic elements" (action types, functions, dynamic security). Functions are published as immutable SemVer tags. Ontology Manager cannot edit function bodies. You leave to a Functions repository.

Inference: an ontology revision that versions only object types can drift from the functions that implement actions. Historical explainability needs both.

### E-P2. Save is a reviewed commit, not a live mutation of a working copy that others already see

- Kind: source-system artifact
- Source: P2 Save changes

Edits stay local until Save. Concurrent saves require Update. Conflicts choose latest Ontology or the working state. Destructive edits require typing the entity name after a warning.

Runtime consequence: governance sits on the commit of definitions. It does not by itself pin which definition an old action used.

### E-P3. Protected resources change on a branch and merge through a proposal

- Kind: source-system artifact
- Source: P3 Branching, P4 Review proposals

A branch is created from `main` only. Protected object, action, link, interface, and shared property types must save to a branch. A proposal is the pull-request analog. Merge checks include conflicts. Reviewers approve per resource. Changelog shows who changed what and when.

This is definition-control, not historical replay.

### E-P4. Restore copies an old object-type definition into working state

- Kind: source-system artifact
- Source: P5 Restore changes

History lists each save with time and user. Restore of an object type undoes later definition edits into the working state. You must Save again for it to take effect.

Inference: this is rollback of metadata, not rollback of instance meaning. It does not replay old actions.

### E-P5. Some object-type edits delete Phonograph edit history

- Kind: domain evidence
- Source: P6 Edit object types
- Decision: `supported` as documented Palantir behavior

Writeback rebuilds current objects by reapplying the stored edit history. Unregistering backing datasources deletes that history. Future writeback builds fail. Changes that unregister include backing-datasource change, primary-key change, and object-type deletion. With writeback, a change to the ID or base type of a property that has ever received edits also requires unregister.

Display-name and visibility edits do not unregister. Fields that never received edits can change without erasing other fields' history.

The properties pane highlights whether a field has ever received edits. Save warns when history is at risk. Errors `InvalidColumnRemoval` and `InvalidColumnFieldSchemaChange` refuse the reindex until you revert or accept unregister.

**Runtime consequence.** A schema edit that looks like a rename can destroy the only reconstruction path for user edits.

### E-P6. Storage migration can drop action edit history on purpose

- Kind: domain evidence
- Source: P7 OSv1 to OSv2
- Decision: `supported`

OSv1 and OSv2 object types coexist. Schema must stay stable during migration and soak. User edits are disabled for the whole period. Preserve-history is optional and costs compute. Without it, only the latest object state moves. Palantir requires acknowledgment that user-edit history will not be preserved except Action Logs. Soak dual-indexes for up to 14 days. After soak, rollback to OSv1 is not possible.

**Counterexample seed.** A later reader of current objects cannot reconstruct the action sequence if preserve-history was off and Action Logs were not configured to hold the needed fields.

### E-P7. Action Log pins action-type version, not a definition hash

- Kind: domain evidence
- Source: P8 Action log
- Decision: `supported` as Palantir's pin. Whether that pin is enough for OS is `undetermined`

Default stored fields:

- Action RID
- Action type RID
- Action type version, auto-incremented each time the action type is updated
- Timestamp, user id
- Primary keys of edited objects. Other edited properties are not stored by default
- Optional summary, parameter values, and some referenced-object properties

The page says the log can capture "the state of the world (as represented by the Ontology) at the time of action submission" by linking concurrently edited objects. It does not say the function body, policy text, or ontology snapshot is stored.

Inference: Palantir can answer "which increment of this action type ran." It is not shown to answer "what did that increment compute" after the function repository moved on, unless the function version is stored elsewhere.

### E-P8. Function compatibility checks are structural and incomplete

- Kind: domain evidence
- Source: P9 Function versioning
- Decision: `supported`

Published function versions are immutable. Checks warn on drop function, drop or reorder input, add required input, and bad type changes. The page says the checks are not exhaustive. Internal implementation breaks may not be detected. "It is not safe to release a minor or patch version based solely on a successful outcome from these checks."

If you ship a breaking signature as a minor, the documented repair is a new minor that restores the old signature. You must not mutate the bad version.

## ObjectStack

### E-O1. Stored metadata carries the schema version that wrote it

- Kind: source-system artifact
- Source: O1 ADR-0008

Every stored spec is tagged with the Zod schema version that wrote it. On read, an older version runs a registered codemod in flight and does not rewrite storage. `objectstack migrate` is the explicit rewrite.

This matches Axon's leave-and-convert-on-read more than a Flyway in-place `ALTER`.

### E-O2. Publish seals a checksummed version. Activate is a pointer swap

- Kind: source-system artifact. ADR-0027 is Proposed
- Source: O2 ADR-0027
- Decision: `hypothesis` as ObjectStack intent, not proven here as shipped behavior

Lifecycle: open draft, stage with no DDL, diff, preview, publish, promote, rollback, deprecate.

Publish validates, plans migration, dry-runs, runs DDL, seals `manifestJson` plus checksum plus semver, then swaps the environment install pointer. Failed publish after DDL emits `schema-ahead` rather than pretending DDL rolled back. Traffic stays on the previous pointer if activation never swapped.

`MigrationPlan` is `{ changes, backfills, destructive }`. Destructive kinds named: `field_removed`, `field_type_change`, `field_required_no_default`. Production blocks destructive without `force` and approval. Reverse of dropped data is surfaced, not auto-run. Expand-contract is modeled as an ordered plan that may span two sealed versions.

Promotion installs the same sealed checksum in the next environment.

### E-O3. Protocol upgrades prefer silent conversion, then executable chain, then structured refusal

- Kind: source-system artifact. ADR-0087 is Accepted
- Source: O3 ADR-0087

Assumption stated on the page: the consumer's maintainer is an AI agent. Preference ladder:

1. Do not break
2. Convert old shapes at load for one major
3. Replay a preserved migration chain from any past major
4. Refuse with a structured diagnostic
5. Verify with the consumer's own tests

Lossless renames may convert silently. Semantic changes cannot. Retired conversions graduate into the permanent chain. Timeliness of a deprecation warning is "never load-bearing" because a consumer may arrive three majors late.

**Domain evidence.** Agent-synthesized migration is already a design pressure in a nearby metadata platform. The platform still forbids silent semantic conversion.

## Schema migrators

### E-D1. Parallel change is expand, then migrate, then contract

- Kind: domain evidence
- Source: D1 Fowler Parallel Change
- Decision: `supported` as a documented pattern

A backwards-incompatible interface change is split so that the supplier supports both shapes, clients move, then the old shape is removed. Fowler lists database refactoring, remote APIs, and deployments as applications. If the contract phase never runs, the system is worse than before because two versions remain.

### E-D2. Autogenerate cannot see a rename

- Kind: domain evidence
- Source: D2 Alembic autogenerate
- Decision: `supported`

Alembic says autogenerate is not intended to be perfect and must be reviewed. It detects table and column add or remove. It cannot detect table-name or column-name changes. Those appear as add plus drop, "which is not at all the same as a name change." `alembic check` fails the build when a new revision would be non-empty.

**Runtime consequence.** An agent that applies autogenerate without review will drop a column and add an empty one, then treat the empty column as the historical field.

### E-D3. Flyway undo restores schema steps, not dropped meaning

- Kind: domain evidence
- Source: D3 Flyway undo
- Decision: `supported`

An undo script reverses one versioned migration. It assumes the whole migration succeeded. It "work[s] for undoing schema changes but not so well for undoing data changes." Destructive SQL cannot restore rows unless the data is static. Flyway's alternative is keep the database backward compatible with old application versions, plus backup and restore.

## Event upcasting

### E-E1. Axon keeps stored events and converts at handling time

- Kind: domain evidence
- Source: E1 Axon 5.3 Event versioning
- Decision: `supported` as Axon's law for events

Stored form and `MessageType` stay. Handlers receive the type they declare. Adding defaults, ignoring removed fields, and mapping renames often need no upcaster. Reshape, split, drop, or rename of the event identity uses a transformation chain. Transformations are deterministic and side-effect-free. The stored event is not rewritten.

Inference: this is the strongest fetched counter to "migrate history by updating the rows."

## API compatibility

### E-A1. SemVer forbids mutating a released version

- Kind: domain evidence
- Source: A1 SemVer 2.0.0
- Decision: `supported` for published packages. `rejected` as a complete ontology model

"Once a versioned package has been released, the contents of that version MUST NOT be modified. Any modifications MUST be released as a new version." Major is for incompatible public API changes. Deprecation happens in a minor. Removal happens in a later major. Repair of an accidental break is a new version, not an edit of the bad one.

SemVer requires a declared public API. An ontology's invariants and policy bodies are not covered by signature SemVer alone. See E-P8.

### E-A2. Protobuf identity is the field number. Reuse corrupts meaning

- Kind: domain evidence
- Source: A2 proto3 Updating a message type
- Decision: `supported`

Wire-unsafe: change field numbers, move fields into an existing `oneof`. Wire-safe: add fields, remove fields if the number is reserved, add enum values. Wire-compatible: parse succeeds but may be lossy, for example `int64` read as `int32` truncates.

"Field numbers should never be reused." Deleted numbers go in `reserved` so later authors cannot attach a new meaning to old bytes. The page also says a wire-safe schema change can still break application code, for example an exhaustive switch on a new enum value.

Unknown fields are preserved on the binary wire and lost if you serialize to JSON or copy field-by-field.

### E-A3. GraphQL prefers coexistence and usage-gated deletion

- Kind: domain evidence
- Source: A3 Schema change management
- Decision: `supported` as GraphQL's model

Breaking: remove or rename fields or types, change types, make optional arguments required, make a non-null field nullable. Safe additive: new fields and types, optional arguments with defaults that match prior behavior. Dangerous: new enum values, new interface implementations.

Lifecycle: add replacement, deprecate old, migrate clients, remove when usage is acceptable. Data migration completes before the schema change is published. Breaking-change detection belongs in CI. Usage analysis against real queries is a second gate because a schema diff does not prove impact.

### E-A4. OpenAPI's own spec is not SemVer

- Kind: source-system artifact
- Source: A4 OAS 3.2.0 Versions and deprecation

`major.minor` is the feature set. Patch is editorial. Minor versions may include non-backwards compatible changes when impact is believed low. Deprecated fields stay until a future policy. `info.version` is the document version, not the OAS feature set.

Inference: if a specification body will not bind itself to SemVer, an ontology should not assume SemVer numbers are enough.

## Temporal analog

### E-T1. "As we knew it" and "as we now think it was" are different queries

- Kind: domain evidence
- Source: T1 Time in XTDB
- Decision: `supported` for facts. `undetermined` whether ontology revisions need the same two axes

Default query is system-time "as best known" and valid-time "as of now." Audit uses `FOR SYSTEM_TIME AS OF`. Curated history uses `FOR VALID_TIME`. Corrections change what "best known" returns and leave system-time intact.

This is fact temporality, not ontology revision. It is the closest fetched model for "replay under historical versus current semantics" on data. It does not pin which function computed a derived fact.
