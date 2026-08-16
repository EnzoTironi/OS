# Revision model and migration taxonomy

**Kind:** candidate law plus source-system artifact  
**Decision:** `hypothesis` as an OS model. Individual rows cite evidence that is `supported` as an observed distinction.  
**Does not invent** a second tree. This is the only taxonomy for issue 9.

A later synthesis agent should treat the four axes as the model, and the tables as the vocabulary. Do not flatten them into one "version" field.

## Four axes

An ontology change has four questions that sources keep separating.

1. **What is the revision?** How is a definition snapshot identified and made immutable.
2. **What kind of change is it?** Rename, add, restrict, replace meaning, or delete.
3. **What compatibility class is it?** Safe for current callers, lossy but parseable, or breaking.
4. **What happens to history?** Leave bytes, upcast on read, rewrite storage, coexist, or drop.

Mixing 1 with 3 is how SemVer gets over-applied. Mixing 2 with 4 is how a column rename becomes a false historical claim.

## Axis 1. Revision identity

| Model | What identifies a snapshot | Mutability after release | Source | Kind |
| --- | --- | --- | --- | --- |
| Compatibility number | `MAJOR.MINOR.PATCH` chosen by the publisher | Contents of that number must not change | SemVer 2.0.0, Palantir functions | source-system artifact |
| Auto-increment | Integer that increases on each save of an action type | Prior integers remain as labels on old logs | Palantir Action Log `Action type version` | source-system artifact |
| Sealed checksum | Semver plus a checksum over a frozen manifest | Published status is immutable. Rollback swaps a pointer | ObjectStack ADR-0027 | source-system artifact |
| Content hash | Digest of the definition bytes | Same bytes, same id | Not required by the fetched pages. Alembic revision ids are hashes of the migration script, not of the ontology | undetermined for OS |
| Branch plus proposal | Isolated copy of `main`, merged after review | `main` moves. Branch history is a changelog of saves | Palantir Global Branching | source-system artifact |

**Working hypothesis for OS.** A revision needs both an immutable snapshot and a compatibility judgment. A number alone does not prove the bytes. A hash alone does not tell callers whether they can keep working.

**Decision:** content-addressed identity as the only scheme is `undetermined`. Immutability of a released snapshot is `supported`.

## Axis 2. Change kind

Apply to types, properties, relationships, actions, functions, and policies.

| Kind | Meaning | Typical structural look-alike | Why the look-alike lies |
| --- | --- | --- | --- |
| Additive | New optional element. Old instances remain well-formed | New GraphQL field, new protobuf field, new nullable column | Safe only if absence has a defined meaning |
| Restrictive | Old instances may become illegal | Required argument, `NOT NULL` without default | Needs a backfill or a default before enforcement |
| Rename | Same meaning, new label | `ALTER ... RENAME`, protobuf field name change with same number | Autogenerators often emit drop plus add |
| Semantic replacement | Same identifier, new meaning | Reused protobuf field number, reused property ID, reused action name | Old bytes now "mean" the new concept |
| Split or merge | One element becomes many, or many become one | `name` to `firstName` plus `lastName` | Composition is not always invertible |
| Deprecate | Still legal, discouraged | GraphQL `@deprecated`, ObjectStack `deprecated`, Palantir status `deprecated` | Not a deletion. Removal is a later change |
| Delete | Element gone | Drop column, remove field, delete object type | Breaks callers and can erase history that pointed at it |
| Behavior change | Same signature, different function or policy body | Palantir function internal change that compat checks miss | Structural diffs stay green |

**Rename versus semantic replacement** is the distinction issue 9 asked for. Protobuf reserved numbers exist because the wire cannot tell them apart. Palantir treats a property ID change on an edited field as a schema change that can force unregister and delete Phonograph edit history.

## Axis 3. Compatibility class

| Class | Definition used by sources | Example | Decision |
| --- | --- | --- | --- |
| Structurally safe | Old consumers keep working without noticing | GraphQL additive field. Protobuf new field ignored as unknown | `supported` as a class |
| Structurally compatible, semantically lossy | Parses, may truncate or default | Protobuf `int64` read as `int32`. Missing new required meaning filled with default | `supported` |
| Dangerous additive | Schema accepts it. Exhaustive clients may fail | GraphQL new enum value | `supported` as GraphQL's class |
| Breaking | Previously valid use becomes invalid, or response shape changes | Remove or rename a field. Add a required input | `supported` |
| Meaning-breaking with stable shape | Signature unchanged. Authorized outcomes change | Discount policy body replaced in place | `hypothesis` as a named class. Palantir function docs admit internal breaks evade checks |

SemVer maps breaking to major, additive compatible to minor, and bugfix to patch. That mapping needs a declared public API. An ontology's public API is not only its GraphQL or REST surface. It includes which actions are legal and which functions compute results. Decision: SemVer as a sufficient ontology compatibility model is `rejected`.

OpenAPI 3.2.0 says the specification itself is not SemVer and may break in minor versions. That is evidence that even API specs outgrow SemVer when the "public API" is the document.

## Axis 4. History handling

| Mode | Stored history | Reader sees | Source | Risk |
| --- | --- | --- | --- | --- |
| Leave and convert on read | Original bytes stay | Current handler type, via a conversion chain | Axon 5.3, ObjectStack in-flight codemod | Conversion can hide the original if the only query path is converted |
| Leave and query as-of | Original versions stay | Chosen time axis | XTDB `SYSTEM_TIME` versus `VALID_TIME` | Default "as best known" is not "as we knew then" |
| Dual-write coexist | Old and new structures both live | Old readers on old, new readers on new, then cut over | Fowler expand or migrate or contract. Palantir OSv1 and OSv2 soak | Forgotten contract phase leaves two meanings |
| Rewrite in place | Latest schema only | Latest shape as if it had always been that way | Typical `ALTER` plus data backfill | False history unless the old revision is stored elsewhere |
| Drop history | Latest state only | Current objects, maybe a separate action log | Palantir OSv2 without preserve-history | Explicitly irreversible after soak |

## Migration taxonomy

A migration is a planned change from revision R to revision S plus a treatment of existing facts, relationships, and action records.

| Migration kind | What it moves | Reversible? | Sources |
| --- | --- | --- | --- |
| Definition-only | Types, actions, functions, policies. No instance rewrite | Yes, if R remains addressable | Palantir restore copies an old object-type definition into working state. ObjectStack pointer swap |
| Additive storage | New columns, tables, fields | Usually yes | Fowler expand. ObjectStack `add_column` |
| Backfill | Values into new storage from old | Only if the function is invertible and old values remain | ObjectStack `backfills[]`. GraphQL "migrate data before publishing schema" |
| Dual-write cutover | Writers hit both shapes, then readers switch | Yes until contract | Fowler migrate phase |
| Contraction | Remove the old shape | No, if data lived only there | Fowler contract. Flyway undo cannot restore dropped rows |
| Read-time upcast | No storage rewrite. Chain R0 to Rn at read | Yes, disable the chain | Axon transformations. ObjectStack D2 conversion window |
| Persistent upcast | Rewrite stored events or rows to S | No, unless R bytes were kept | Not recommended by Axon 5.3 |
| Environment promote | Same sealed snapshot, new database | Rollback is pointer plus reverse plan | ObjectStack promote Dev to Staging to Prod |
| Storage-engine move | Same ontology, new indexer | Optional history preserve | Palantir OSv1 to OSv2 |

ObjectStack ADR-0027 writes this as one record:

```text
MigrationPlan = { changes, backfills, destructive }
```

That split is the useful source artifact. Schema steps, data steps, and a flag that meaning or data may be lost are three different things. Decision: `supported` as a distinction. The TypeScript shape is a source-system artifact.

## Replay modes

Issue 9 asked about replay under historical versus current semantics. Keep these as different operations.

| Mode | Definitions used | Purpose | If you use the other mode by mistake |
| --- | --- | --- | --- |
| Explain-replay | Pinned revision of the action, function, policy, and types | Answer "why was this allowed?" | Today's policy condemns or blesses an old decision |
| Project-replay | Current types, historical facts, declared conversion | Build today's projection | Fine if conversion is lossless and labeled |
| Correct-replay | Current definitions, recorded as a correction | Fix a wrong past conclusion | Looks like the past always used today's rule |
| Test-replay | Candidate revision against historical workload | Impact analysis | Must not write back as if it were history |

XTDB's pair is the data analog. `FOR SYSTEM_TIME AS OF` is explain. Default valid-time "as best known" is project. Ontology revision is a third pin. A fact as-of T under ontology R is not the same object as that fact as-of T under ontology S.

## Rollback kinds

| Kind | What returns | What does not return | Source |
| --- | --- | --- | --- |
| Working-state restore | Definition of one resource, staged until save | Instance history already deleted | Palantir restore |
| Pointer rollback | Previous sealed package serves traffic | Dropped instance data unless reverse backfill exists | ObjectStack G |
| Scripted undo | Inverse DDL of a versioned migration | Rows removed by `DELETE` or `DROP` | Flyway undo |
| Soak abort | Previous indexer while dual-index lives | After soak, Palantir says rollback to OSv1 is not possible | Palantir OSv2 |
| Application rollback only | Old code against a forward-migrated database | Works only if the expand phase kept old columns | Flyway guidance when undo is unsafe |

**Runtime consequence.** Rollback that only moves a pointer or a schema version cannot repair a meaning change that already rewrote or dropped the only copy of historical facts.

## Agent impact analysis

Sources already expect machines to propose migrations. They do not let those proposals apply themselves.

| Job | What the source automates | What it still requires a human or a test to do |
| --- | --- | --- |
| Structural diff | Alembic `--autogenerate`, GraphQL `findBreakingChanges`, ObjectStack `diff`, Palantir save warnings | Review. Alembic cannot detect column rename. Palantir function checks miss body changes |
| Usage impact | GraphQL query-log analysis | Decide whether remaining callers may break |
| Conversion synthesis | ObjectStack `conversions/N.ts` and `migrations/N.json` for lossless renames | Semantic changes are excluded from silent conversion |
| Destructive gate | ObjectStack `destructive` plus production `force` | Approval. Reverse of dropped data is surfaced, not auto-run |
| Acceptance | ObjectStack consumer `validate` and test loop | The agent must run it. Prose changelog is not the proof |

**Decision:** automated impact analysis is `supported` as a need. Silent acceptance of agent-synthesized meaning changes is `rejected`.
