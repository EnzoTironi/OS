# Adversarial review — issue #158 Relation unification

**Status:** review-pending  
**Architecture decision:** none  
**Candidate:** one canonical Relation remains favored over canonical Property+Link in this bounded experiment; R6 remains `hypothesis`, not accepted.

## Review question

Did the unified candidate genuinely remove Property/Link as canonical semantic species, or did it merely rename the split into endpoint type flags, hidden generator branches, statement wrappers or storage layouts?

## Findings

### 1. The first executable slice did not need canonical Property/Link dispatch

Competitor A generates the same binary SDK-style field signatures as B Property+Link and C slot+Link for required/optional/multi scalar values and one/many entity references.

Canonical generators for SDK, query, mutation-tool and UI surfaces inspect endpoint Type/cardinality/collection metadata. They do not dispatch on `PropertyDef`, `LinkDef` or `SlotDef`.

That defeats the weakest argument for separate canonical forms: “we need two primitives in order to render fields differently from links.” We do not.

### 2. `TargetKind` is a real distinction, but not yet Property/Link renamed

Literal/value endpoints and identifiable entity endpoints have different equality and referential semantics:

```text
String/Money/Quantity -> value semantics
Party/Product/...      -> stable entity identity semantics
```

The reduction would be fake if it erased that distinction. It does not.

The stronger adversarial question is whether this difference forces a unique interpreter/evolution/authority protocol for *relations themselves*. So far it does not: the same Relation definition, cardinality, provenance envelope and generation pipeline handle both. Physical lowering may choose a value column versus FK because endpoint representation differs; that is not evidence for separate canonical semantic species.

Revive Property/Link if later cases show the endpoint distinction repeatedly grows independent lifecycle/authority/query rules that cannot be expressed through Type + Relation metadata without reconstructing two interpreters.

### 3. The initial inverse model was under-specified

The first model could generate an inverse navigation name but did not model inverse cardinality independently. Forward `Order.customer = exactly one Party` does not imply whether a Party has one or many Orders.

Post-green hardening introduced an independent binary forward/inverse cardinality contract. This made Relation richer, not split: the same constraint machinery applies to any binary relation.

For n-ary relations, richer functional-dependency/uniqueness constraints remain open for #71/toolchain work.

### 4. `ordered: bool` hid a missing bag/multiset case

The first candidate treated unordered-many as set and ordered-many as list. That can silently destroy duplicate multiplicity.

The hardened candidate distinguishes SET, LIST and BAG. The same collection contract works for scalar and entity targets. Therefore the omission did not support Property/Link separation; it exposed generic collection semantics that any correct canonical model needs.

### 5. Definition-level provenance was not enough when one assertion needs identity

The first candidate marked a Relation definition as supporting effective time/observation time/provenance, but it did not identify a concrete assertion that can be corrected or independently sourced.

`RelationAssertion` now provides a generic optional envelope for scalar-valued and entity-valued statements alike. A correction creates a new assertion identity linked to the old one rather than mutating history in place.

This is **not** evidence that `Fact` must become a metamodel primitive. It only proves that some relation assertions need stable runtime/semantic identity when history/provenance requires it. #71 may still reveal a richer cross-domain Fact/Claim/Observation protocol.

### 6. Lifecycle relationships do not force Link-instance identity

Employment is the key control:

```text
Employment : identifiable Type
Employment.worker   -> Party
Employment.employer -> Party
Employment.valid    -> Interval
```

Actions target `Employment`, not a magical Link edge. This matches the earlier Role/Relator pressure while keeping participant connections as ordinary Relations.

### 7. N-ary statements favor one Relation algebra

`available_quantity(Product, Warehouse) -> Quantity` uses the same Relation form rather than requiring reification because Property/Link are binary-only.

This does not prove anonymous n-ary tuples are sufficient for every relationship. A tuple that needs stable identity/lifecycle can itself become an identifiable Type.

### 8. Fully relational D is useful but appears too low-level as the primary semantic center

Competitor D can encode the enterprise slice and stays type-safe, but normal object/field/navigation surfaces need reconstruction from predicates. That moves complexity into toolchain views.

D remains a plausible logical/compiler/query IR beneath the canonical authoring model. The current experiment does not favor it as the primary human/agent semantic center.

### 9. Stable Relation ID does not make scalar→entity migration automatically continuous

The migration classifier correctly treats literal→entity endpoint changes as `breaking-equality-identity-change`.

A stable ID may be retained only after explicit semantic compatibility/migration adjudication. Turning an enum/status code into a reference-data entity can change identity, lifecycle and authority semantics even if the business label is unchanged.

This is the same lesson #157 found for TypeRevision: IDs are historical contracts, not convenience labels.

### 10. Physical specialization is compatible with semantic unification

The illustrative lowering chooses columns, FKs, value/join tables or n-ary tuple tables from endpoint/cardinality information. A search/graph/OLAP projection may lower again differently.

The reduction does **not** claim one generic Relation table should store the enterprise. The physical layer may specialize aggressively as long as those representations remain derived from the same semantic definition and do not become rival authority.

## Current verdict

Within the bounded #158 slice, no unique Property-only or Link-only interpreter law survived.

The strongest surviving candidate is:

```text
Relation definition
+ typed roles/endpoints
+ endpoint equality/identity semantics
+ cardinality / inverse constraints
+ SET/LIST/BAG collection semantics
+ derived/computation metadata
+ optional assertion identity/time/provenance envelope
+ physical/tooling lowering
```

Authoring may still expose `property` and `link` words because they are useful ergonomic views. They have **not earned canonical semantic-primitive status** in this experiment.

This verdict is narrower than “everything is a Relation.” `Type`, `Computation`, `Action`, lifecycle contracts, statement envelopes and ontology revision still have independent jobs. R6 remains unaccepted until #71.

## Revival conditions for canonical Property/Link

Split them again if cross-cycle evidence shows any of the following cannot be expressed without repeated hidden species branches:

1. scalar versus entity endpoint requires distinct authority/commit protocols rather than ordinary target Type semantics;
2. scalar and entity assertions require incompatible provenance/time/correction identity models;
3. migration/evolution has separate irreversible laws not reducible to endpoint Type/cardinality/identity changes;
4. policy/query/action targeting needs a distinct canonical discriminator beyond target Type/roles;
5. generated surfaces repeatedly reintroduce `is Property?` / `is Link?` logic across independent toolchain layers.

## Remaining blockers before `review-clean`

- exact final-head branch CI after post-green inverse/collection/assertion hardening;
- v2 index shard aligned with the 21 candidate laws;
- PR-triggered CI on the exact reviewed head;
- #71 cross-cycle vertical before any RFC promotion.

A future `review-clean` means only that this bounded experiment and its adversarial history are internally coherent. It does not accept R6 or edit RFC-0002 automatically.
