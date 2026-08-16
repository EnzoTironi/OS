# Open questions

**Kind:** residual uncertainty  
**Decision:** every item is `undetermined` unless noted.  
**Rule:** this file does not answer `docs/open-questions.md`. It points at evidence and leaves those questions open.

## Questions 19 and 20 in docs/open-questions.md

`docs/open-questions.md` §19 asks whether revisions are content-addressed, whether historical actions pin definitions, whether replay uses original semantics, how breaking changes are detected, how facts migrate, whether two revisions coexist, and how integrations survive.

`docs/open-questions.md` §20 asks how much of that loop agents can run.

**State of both:** `undetermined`

This folder supplies pressure, not answers:

- Immutability of a released snapshot is `supported` (L1). Content-addressed identity as the only scheme is `undetermined` (axis 1 in `taxonomy.md`).
- Pinning exact function and policy definitions on each action is `hypothesis` (L2). Palantir pins an incrementing action-type version (E-P7). That is not the same claim.
- Coexistence during migration is `supported` as a pattern (L5). It is not chosen as OS machinery.
- Agent synthesis of lossless conversions is documented in ObjectStack ADR-0087 (E-O3). Agent authority to apply meaning-changing migrations without a gate is `rejected` as sufficient (L8). How much of §20 OS should automate remains open.

Do not copy these sentences into `docs/open-questions.md`.

## Unresolved after this pass

### Q-R1. What is the public API of an ontology revision?

SemVer needs a declared API (E-A1). For OS that API might be types, actions, functions, policies, query shapes, or a subset. Until this is named, compatibility class (axis 3) cannot be mechanical.

**State:** `undetermined`

### Q-R2. Is revision identity a hash, a number, or both?

ObjectStack uses semver plus checksum. Palantir uses incrementing action-type versions and separate function tags. Alembic hashes migration scripts, not domain snapshots.

**State:** `undetermined`

### Q-R3. Do facts carry an ontology-revision dimension in addition to valid time and system time?

XTDB answers historical-versus-current for facts (E-T1). It does not pin which function derived a value. RFC-0001 allows the engine to add ontology revision to a fact. No fetched source showed a three-axis store.

**State:** `undetermined`  
**Risk:** treating XTDB as if it already solved ontology evolution.

### Q-R4. How much of the world-state must an action record snapshot?

Palantir Action Log can store optional parameters and some unedited properties, and it links concurrently edited objects (E-P7). Full object snapshots on every action may be unusable. Primary keys alone fail FH-3 and FH-8.

**State:** `undetermined`

### Q-R5. When is read-time conversion a lie?

Axon and ObjectStack convert on read and leave storage (E-E1, E-O1). If the only query path is converted, explain-replay can still disappear. Is a converted-only API enough if the original bytes are retained but not exposed?

**State:** `undetermined`

### Q-R6. Can two ontology revisions be writable at once, or only readable?

Fowler and Palantir soak allow dual presence. Palantir disables user edits during OSv2 migration (E-P6). ObjectStack preview installs a draft in dev only (E-O2). Production dual-write of two meaning-incompatible revisions is untested here.

**State:** `undetermined`

### Q-R7. How do external integrations pin OS revisions?

Issue 9 asked. No fetched integration contract showed a partner holding an OS revision hash. OpenAPI `info.version` is the document version, not a semantic pin of business meaning (E-A4). GraphQL usually avoids whole-API versions (E-A3).

**State:** `undetermined`  
A later worker on surfaces or integrations should take this. Not a second taxonomy in this folder.

### Q-R8. What is a meaning-rollback, operationally?

Palantir restore rolls definitions (E-P4). ObjectStack rolls a pointer and reverse DDL, not dropped data (E-O2). Flyway undo is schema-shaped (E-D3). Nobody fetched here rolls back "we changed what discount meant" without keeping the old facts and the old function.

**State:** `undetermined`. L4 says schema rollback is not enough. The positive mechanism is open.

### Q-R9. Which changes are meaning-breaking with a stable shape?

L7 is `supported` as a class. The catalog of policy-body and function-body breaks that must fail a release is not collected. Palantir says its own checks are incomplete (E-P8).

**State:** `undetermined`  
A later domain or kill-test worker should take this. Issues 14 to 31 and the kill-test track are the right homes. Not more taxonomy files here.

### Q-R10. Copyleft operational ERPs

This pass did not mine ERPNext, Odoo, or Moqui migration tables. Those corpora may show different history-preservation failures. They are out of this folder's write scope.

**State:** `undetermined`  
Read corpus folders when they exist. Do not paste implementation.

## What this pass is not allowed to settle

- Final OS primitives
- Whether `Fact` carries revision
- Storage engine
- Authoring language
- Edits to RFC-0001
- Closure of issue 9
