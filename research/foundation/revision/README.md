# Ontology revision, migration, compatibility, and historical reproducibility

**Track:** foundation  
**Issue:** [#9](https://github.com/EnzoTironi/OS/issues/9)  
**Status:** Wave A research notes, 2026-08-15  
**Decision:** none accepted. Claims below are `hypothesis`, `supported`, `rejected`, or `undetermined`.  
**Contract:** Agent output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

This folder is the durable artifact for issue 9. It is not an RFC and does not edit `rfcs/0001-metamodel-hypothesis.md` or `docs/open-questions.md`.

## Question

How does an executable ontology evolve without destroying the meaning of historical data and decisions?

Restated so evidence can answer it:

> Which revision, compatibility, migration, replay, and rollback distinctions appear independently in operational ontologies, schema migrators, event stores, and API compatibility models, and which naive migrations produce a history that later readers would treat as true when it is not?

## Claim under test

A later synthesis agent can treat this as the claim:

> An executable ontology can change if every released revision is immutable, every historical action pins the definitions that authorized it, representation changes are separated from meaning changes, and replay for explanation uses the pinned revision rather than today's rules.

What would falsify it:

- A mature operational system that mutates released ontology definitions in place and still reconstructs historical decisions without a side channel.
- A migration that rewrites stored facts under a new name or type and later answers "what was decided then?" correctly without retaining the old definition.
- A compatibility model that treats structural sameness as semantic sameness without producing false historical claims in the scenarios in `false-history.md`.

## File map

| File | Mode | Contents |
| --- | --- | --- |
| [`sources.md`](sources.md) | reference | URLs fetched this session, fetch date, license posture |
| [`evidence.md`](evidence.md) | reference | Labeled observations from those pages |
| [`taxonomy.md`](taxonomy.md) | reference | Revision model and migration taxonomy |
| [`false-history.md`](false-history.md) | explanation | Scenarios where naive schema migration creates false historical claims |
| [`candidate-laws.md`](candidate-laws.md) | explanation | Smallest claims, decision state, falsifiers |
| [`open-questions.md`](open-questions.md) | reference | Residual uncertainty. Does not answer `docs/open-questions.md` |

## Agent output contract

### 1. Question

See above. The issue also asked for a revision model, a migration taxonomy, and false-history scenarios. Those live in `taxonomy.md` and `false-history.md`.

### 2. Sources

Primary pages fetched 2026-08-15 are listed in `sources.md`. Memory was not used as a substitute for those pages.

### 3. Evidence

Labeled blocks are in `evidence.md`. Each block names its kind:

- **domain evidence.** A real-world distinction the source is forced to handle.
- **source-system artifact.** A product mechanism that may not be an OS primitive.
- **candidate law.** A smallest claim that would explain several sources.
- **counterexample.** A case that would falsify a candidate law.
- **runtime consequence.** An enforcement or storage property implied if a claim survives.

### 4. Source artifacts

Do not promote these into OS vocabulary without more evidence:

- Palantir Ontology Manager save, Global Branching, Phonograph unregister, Action Log object types, Function SemVer tags
- ObjectStack `sys_package_version`, install-pointer swap, `conversions/N.ts`, `MigrationPlan.destructive`
- Flyway `V` and `U` scripts, Alembic `upgrade` and `downgrade`, Axon `EventTransformerChain`
- Protobuf field numbers, GraphQL `@deprecated`, SemVer `MAJOR.MINOR.PATCH`

### 5. Convergence

Independent sources agree on these distinctions. Decision: `supported` as observed distinctions, not as OS primitives.

1. A released revision must not be silently rewritten. SemVer 2.0.0, Palantir function versions, and ObjectStack sealed package versions all say this.
2. Rename of a display name is not the same as reuse of a stable identifier. Protobuf field numbers, Palantir property IDs, and Alembic rename detection all treat identifier reuse as a different, more dangerous operation than a label change.
3. Structural compatibility is not semantic compatibility. Protobuf wire-compatible changes can be lossy. GraphQL can add an enum value without a schema break and still surprise exhaustive clients. Palantir function checks miss internal behavior changes.
4. Coexistence before deletion is the safe shape of a breaking change. Fowler parallel change, GraphQL deprecation lifecycle, ObjectStack one-major conversion window, and Palantir OSv1 or OSv2 soak all keep two shapes live for a window.
5. Schema undo is not meaning undo. Flyway undo docs, ObjectStack reverse migration, and Palantir writeback-history deletion all separate "put the columns back" from "restore what the decision meant."

### 6. Divergence

Sources disagree on identity, storage rewrite, and how much of a decision to pin.

| Topic | Positions | Plausible reason |
| --- | --- | --- |
| Revision identity | SemVer numbers, Palantir auto-increment action-type versions, ObjectStack semver plus checksum, Alembic revision hashes | Compatibility signaling versus content identity are different jobs |
| Whether stored history is rewritten | Axon keeps stored events and converts at read. Relational migrators rewrite tables. Palantir reindex can delete Phonograph edit history | Event stores optimize for "bytes as written." Tables optimize for current query shape |
| How much a historical action pins | Palantir Action Log stores action-type version, timestamp, user, edited primary keys, optional parameters. RFC-0001 hypothesizes pinning ontology, function, and policy definitions | Product audit versus explainable replay are different requirements |
| Version the whole surface or evolve in place | SemVer versions a declared API. GraphQL prefers one evolving schema. OpenAPI 3.1 stopped following SemVer for the spec itself | Client-control and "select star" pressure differ |

### 7. Candidate laws

See `candidate-laws.md`. Short list:

- **L1** Released revisions are immutable. `supported`
- **L2** Historical actions pin the definitions that ran. `hypothesis`
- **L3** Identifier reuse is semantic replacement, not rename. `supported`
- **L4** Representation migration is not meaning migration. `supported`
- **L5** Breaking changes need a coexistence window before contraction. `supported` as a pattern
- **L6** Explain-replay uses the pinned revision. Correct-replay uses current rules and records that it is a correction. `hypothesis`
- **L7** Structural compatibility is not semantic compatibility. `supported`
- **L8** Automated diffs find structural impact. They do not certify meaning. `supported`

### 8. Counterexamples

See `false-history.md`. The load-bearing ones are in-place identifier reuse, writeback-history deletion, upcast-then-persist, and re-evaluating an old action under a new policy.

### 9. Runtime pressure

If L1 through L4 survive, a later runtime must be able to:

- address a revision as an immutable snapshot
- store, on each important action, which revision of types, actions, functions, and policies authorized it
- migrate data without overwriting the only copy of the old meaning
- answer "what did we believe then?" without compiling today's functions

Those are pressures, not storage choices. Decision: `undetermined` which engine implements them.

### 10. Open questions

See `open-questions.md`. Questions 19 and 20 in `docs/open-questions.md` stay `undetermined`. This folder cites evidence. It does not write answers into that file.

### 11. Decision state

| Claim | State |
| --- | --- |
| Released ontology revisions must be immutable | `supported` |
| Identity of a revision must be a content hash and nothing else | `undetermined` |
| Every historical action must pin exact function and policy definitions | `hypothesis` |
| Stored facts should be rewritten in place to the latest schema | `rejected` as a general law |
| SemVer numbers are a sufficient ontology compatibility model | `rejected` |
| Two ontology revisions can coexist during migration | `supported` as a pattern |
| Agent-synthesized migrations can be applied without independent verification | `rejected` as sufficient |
| RFC-0001 ontology-revision paragraph | unchanged `hypothesis` |

## Throughput checkpoint

`throughput checkpoint: n/a, read-only investigation`
