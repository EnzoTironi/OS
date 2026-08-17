# Competitor scorecard — issue #158

**Decision:** none. Scores are research aids, not architecture votes.

Scale:

- `++` cleanly satisfies the dimension in the bounded model;
- `+` satisfies with modest extra machinery;
- `0` neutral/trade-off;
- `-` repeated conceptual/tooling friction;
- `--` material distortion in this experiment.

| Dimension | A one Relation | B Property + Link | C slot + Link | D tuple/predicate IR |
|---|---:|---:|---:|---:|
| Required/optional/multi scalar typing | ++ | ++ | ++ | + |
| Entity one/many typing | ++ | ++ | ++ | + |
| Value equality vs entity identity | ++ | ++ | ++ | ++ |
| Ordered multiplicity | ++ | ++ | ++ | + |
| N-ary relations | ++ | 0 | 0 | ++ |
| Inverse navigation | ++ | ++ | ++ | + |
| Money/Quantity/value objects | ++ | ++ | ++ | ++ |
| Time/provenance on scalar + entity assertions | ++ | + | 0 | ++ |
| Identifiable relationship lifecycle | ++ | + | + | ++ |
| Shape/interface unification | ++ | + | 0 | + |
| Derived scalar + entity relation | ++ | + | 0 | ++ |
| Field-like generated SDK | ++ | ++ | ++ | - |
| Query/navigation ergonomics | ++ | ++ | ++ | - |
| Scalar↔entity migration visibility | ++ | + | - | ++ |
| One generic migration vocabulary | ++ | + | - | ++ |
| PostgreSQL physical specialization | ++ | ++ | ++ | + |
| Graph/search projection | ++ | ++ | ++ | ++ |
| Hidden canonical interpreter branches | ++ in current model | -- by definition | -- by definition | ++ |
| Human authoring familiarity | + with sugar | ++ | ++ | -- |
| Agent canonical inspectability | ++ | + | + | 0 |
| Canonical concept count | ++ | 0 | + | ++ |

## A — one canonical Relation

### Strengths

- Binary scalar and entity relations produce the same field-like SDK signatures as B/C.
- N-ary statements do not require introducing a second tuple construct.
- Effective time/provenance can annotate the assertion independent of endpoint kind.
- Scalar↔entity changes become ordinary target-kind/equality migrations under one stable relation identity.
- Physical lowering can still specialize aggressively.
- Current canonical surface generator contains no Property/Link class dispatch.

### Risks

- `Relation` can become an over-general word if role/target/cardinality metadata are weak.
- Endpoint Type semantics must remain strong enough to distinguish literal equality from stable entity identity.
- Authoring should retain ergonomic property/link views instead of forcing tuple syntax.
- The compiler/query layer must continue to avoid concept-specific branch creep as more cases are added.

## B — separate Property + Link

### Strengths

- Familiar to application/ontology users.
- Static scalar/entity intent is obvious at authoring and IR level.
- Generated field and navigation surfaces are straightforward.

### Costs discovered

- The executable generator necessarily dispatches on two semantic classes even when result signatures are otherwise identical.
- Time/provenance, derivation, cardinality and lifecycle concerns still need shared lower-level machinery.
- N-ary relations need another construct/reification.
- Scalar→reference migration crosses a semantic class boundary in addition to the already-real endpoint identity change.

The split is workable, but this experiment has not found a unique runtime law that only Property or only Link needs.

## C — scalar slots + Link

### Strengths

- Very familiar ORM/application model.
- Excellent simple-column ergonomics.

### Costs discovered

- Scalar assertion provenance/time becomes a slot-specific problem while relationship provenance/time is a relation problem.
- Multi-valued/historical scalar slots often need auxiliary tables/statement objects anyway.
- Scalar→reference evolution crosses the deepest architectural boundary.
- N-ary value relations are awkward.

C looks strongest if the product is a CRUD/ORM system. It looks weaker if the goal is one semantic IR spanning operational evidence, history and agents.

## D — fully relational tuple IR

### Strengths

- Minimal and expressive.
- Uniform n-ary, provenance and logical treatment.
- No Property/Link distinction.

### Costs discovered

- Ordinary object-shaped SDK/UI/query surfaces need reconstruction from predicates.
- Type-owned capabilities become less inspectable for humans and agents.
- The toolchain tends to rebuild an object/field view downstream, moving rather than eliminating complexity.

D remains a useful lower-level logical representation/compiler target. The experiment does not currently favor it as the primary semantic authoring/canonical IR.

# Provisional ranking

For the exact question in #158 — **canonical semantic IR**, not user syntax or storage — the current order is:

```text
A unified Relation
    > B Property + Link
    > C slot + Link

D is orthogonal: mathematically minimal but less suitable as the primary object/agent-facing semantic center.
```

This ranking is provisional until executable tests, hidden-branch checks and adversarial review pass. It must not be copied into RFC-0002 as an accepted decision automatically.
