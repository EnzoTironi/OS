# Candidate laws

**Kind:** candidate law  
**Decision:** stated per law. Never `accepted`.  
**Evidence:** `evidence.md`. **Attacks:** `false-history.md`.

Each law is the smallest claim that still explains more than one source. A law that only restates one vendor feature is a source-system artifact and is not listed here.

## L1. A released revision is immutable

**Claim.** After a revision of ontology definitions is released, its contents do not change. A later edit is a new revision.

**State.** `supported`

**Evidence.** SemVer MUST NOT modify a released version (E-A1). Palantir function versions are immutable after creation (E-P8). ObjectStack publish freezes `manifestJson` and a checksum (E-O2). Palantir repair of a bad function release is a new version, not an edit of the bad tag (E-P8).

**Does not claim.** The identifier must be a content hash. That remains `undetermined`.

**Falsify if.** A mature operational ontology mutates a released revision in place and still lets independent consumers rely on "version X means these bytes."

**Runtime consequence.** Storage for definitions is append-only or copy-on-write. "Save" creates a new snapshot.

## L2. A historical action pins the definitions that authorized it

**Claim.** An action record that matters for audit or replay names the revision of the types, action definition, functions, and policies that ran. A version integer of the action type alone is not enough if those other definitions can move independently.

**State.** `hypothesis`

**Evidence.** RFC-0001 and S-012 state the need. Palantir Action Log stores action-type version, not function or policy text (E-P7). Functions live in another repository with their own SemVer (E-P1, E-P8). Thesis wants ontology revision in the causal chain of current state.

**Falsify if.** Systems that store only an incrementing action-type version can still reconstruct why a decision was legal after the function body and policy have been replaced, without any other pin.

**Attacks.** FH-3, FH-8.

**Runtime consequence.** If this survives, commit of an action writes revision references, not only actor, time, and parameters.

## L3. Reusing a stable identifier is semantic replacement, not rename

**Claim.** A rename keeps a stable identifier and changes a label. Attaching a new meaning to an identifier that already has instances or history is a different, breaking operation. Old bytes will be read as the new meaning.

**State.** `supported`

**Evidence.** Protobuf field numbers and `reserved` (E-A2). Palantir property ID change on an edited field forces unregister and can delete history (E-P5). Alembic sees a column rename as drop plus add (E-D2). GraphQL lists rename as breaking (E-A3).

**Falsify if.** Independent systems reuse identifiers for new meanings and still parse old instances correctly without a reserved-id or coexistence mechanism.

**Attacks.** FH-1, FH-5, FH-6.

**Runtime consequence.** Identifiers of types, properties, relationships, actions, functions, and policies are not recycled. Deprecation retires them.

## L4. Representation migration is not meaning migration

**Claim.** Moving values into a new column, file, or indexer can preserve bits and still change what those bits are taken to mean. Rollback of schema is not rollback of meaning when the only copy of the old distinction was dropped or transformed non-invertibly.

**State.** `supported`

**Evidence.** Flyway undo limits (E-D3). ObjectStack reverse of dropped data is not auto-run (E-O2). Palantir OSv2 without preserve-history keeps latest state (E-P6). GraphQL split of `name` is not invertible (FH-7). Writeback history deletion (E-P5).

**Falsify if.** A schema undo or pointer swap restores prior meaning after a non-invertible backfill without having kept the old values.

**Attacks.** FH-1, FH-2, FH-4, FH-7, FH-9.

**Runtime consequence.** A `MigrationPlan` must name invertibility. Destructive meaning steps need a retained prior revision of the data, not only of the schema.

## L5. A breaking change needs a coexistence window before contraction

**Claim.** The safe sequence is add the new shape, move readers and writers, then remove the old shape. Each step is separately releasable. Skipping contraction leaves two histories. Skipping coexistence makes the change a flag day.

**State.** `supported` as a pattern. Not a claim that OS must implement Fowler's three method names.

**Evidence.** Fowler expand, migrate, contract (E-D1). GraphQL deprecation lifecycle (E-A3). ObjectStack one-major conversion window plus ordered expand-contract plan (E-O2, E-O3). Palantir OSv1 and OSv2 dual-index soak (E-P6). SemVer deprecation in a minor before removal in a major (E-A1).

**Falsify if.** Production ontology changes routinely delete and replace in one step without coexistence and without losing caller or history correctness.

**Attacks.** FH-12. Palantir P6 shows the cost of a one-step unregister.

**Runtime consequence.** Two revisions of a definition can be installed at once. Callers and facts name which one they use.

## L6. Explain-replay uses the pinned revision. Correct-replay is a new fact

**Claim.** To answer "why was this allowed?" the engine evaluates the pinned historical definitions. To answer "what do we now think that past situation meant?" the engine uses current definitions and records a correction. Those answers must not overwrite each other.

**State.** `hypothesis`

**Evidence.** S-012. XTDB system-time versus valid-time (E-T1). Axon leaves original events (E-E1). Thesis: current state should be explainable, including ontology revision. Palantir restore does not replay actions (E-P4).

**Falsify if.** Re-evaluating old actions under current functions is sufficient for audit in a regulated operational setting, or if a single timeline can answer both questions without a pin.

**Attacks.** FH-4, FH-8, FH-11.

**Runtime consequence.** Replay APIs take an explicit mode. Default must not be "run today's functions on yesterday's parameters and call it history."

## L7. Structural compatibility is not semantic compatibility

**Claim.** A change can keep the wire, the SQL, or the function signature working and still change authorized outcomes, truncated values, or exhaustive client behavior.

**State.** `supported`

**Evidence.** Protobuf wire-compatible lossy casts (E-A2). GraphQL dangerous enum adds (E-A3). Palantir function checks miss internal breaks (E-P8). SemVer major is defined on the public API, which may omit policy bodies (E-A1). OpenAPI's own spec abandoned SemVer (E-A4).

**Falsify if.** Signature or wire compatibility reliably predicts identical business outcomes across independent systems.

**Attacks.** FH-8, FH-10.

**Runtime consequence.** Compatibility classification needs a meaning check, not only a schema diff. See L8.

## L8. Automated diffs find structural impact. They do not certify meaning

**Claim.** Agents and tools can propose diffs, conversion tables, and backfills. A green structural check is not acceptance. Semantic conversions stay explicit. Destructive steps stay gated.

**State.** `supported`

**Evidence.** Alembic "always necessary to manually review" (E-D2). GraphQL schema diff plus usage analysis (E-A3). Palantir type-to-confirm and incomplete function checks (E-P2, E-P8). ObjectStack silent conversion only for lossless maps, semantic changes excluded, consumer tests as acceptance (E-O3). ObjectStack production `force` plus approval (E-O2).

**Falsify if.** An autogenerated migration plus a structural gate is enough to prevent FH-1 through FH-10 in practice.

**Attacks.** FH-6, FH-8, FH-10.

**Runtime consequence.** Impact analysis is a first-class research and product loop. It emits a plan and a verdict, not a silent write to `main`.

## Claims tried and not adopted

| Claim | State | Why |
| --- | --- | --- |
| Stored facts should be rewritten in place to the latest schema | `rejected` as a general law | Axon and ObjectStack read-time conversion exist specifically to avoid that. FH-4 |
| SemVer numbers are a sufficient ontology compatibility model | `rejected` | L7, E-P8, E-A4 |
| Palantir Action Log is already the OS pin | `rejected` as a complete pin | E-P7 stores increment and keys, not definitions |
| Content hash is required as the only revision id | `undetermined` | L1 needs immutability. Identity scheme is still open |
| RFC-0001 ontology-revision paragraph is settled | unchanged `hypothesis` | Independent sources converge on immutability and coexistence, not on the full pin |

## What would promote L2 and L6

Need at least one more independent operational source that stores a definition snapshot or hash on the action record, and one counterexample search that fails to find a system which audits correctly without that pin. Until then, do not edit RFC-0001.
