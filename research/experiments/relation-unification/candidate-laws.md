# Candidate laws — issue #158

**Architecture decision:** none.  
**RFC-0002 Relation disposition:** hypothesis under attack.

## L-REL-01 — Property and Link authoring words do not by themselves justify separate canonical semantic forms

**State:** `hypothesis`, strengthened by executable surface equivalence.

Human-facing syntax may preserve `property` and `link` because those words are useful. Canonical semantics only need separate forms if downstream meaning/enforcement cannot be derived from ordinary endpoint typing/cardinality/identity.

## L-REL-02 — Value equality and entity identity must remain explicit even under one Relation algebra

**State:** `supported` as a required distinction.

Unification is invalid if it treats an entity reference like a scalar value merely because both occupy an object role. Literal/value endpoints use value semantics; identifiable entity endpoints use stable identity semantics.

This difference is a property of endpoint Type semantics, not evidence by itself for Property vs Link.

## L-REL-03 — Required, optional and multi-valued semantics are cardinality, not Property/Link species

**State:** `supported` in the bounded model.

`1`, `0..1`, `0..N`, `1..N`, ordered-many and unordered-many apply to both literal-valued and entity-valued relations.

## L-REL-04 — Absence, unknown and not-applicable must not collapse into one nullable slot

**State:** `supported` as modeling pressure.

Optional cardinality permits absence of an assertion. If `unknown` or `not applicable` is itself known information, it needs an explicit typed value/state or another domain representation. SQL NULL does not define ontology semantics.

## L-REL-05 — Money and Quantity remain typed values under Relation unification

**State:** `supported` as a distinction.

A canonical Relation does not imply untyped RDF-like string/object bags. Endpoint Types still carry units, currency/dimensional constraints, equality and conversion rules.

## L-REL-06 — Inverse navigation can be derived from one canonical relation identity

**State:** `hypothesis`.

Forward `SalesOrder.customer` and inverse `Party.orders` need not be two independently authored semantic links. They can be views over one stable Relation definition with role metadata.

**Falsifier:** real inverse semantics require independently versioned authority/cardinality meaning rather than a view of the same relation.

## L-REL-07 — Ordered multiplicity is relation-role metadata

**State:** `supported` in the model.

Order is meaningful for some many-valued scalar lists and some entity relationships. It therefore does not uniquely belong to Property or Link.

## L-REL-08 — N-ary semantics favor Relation over a binary-only Property/Link split

**State:** `hypothesis`.

Availability `(Product, Warehouse) -> Quantity`, allocation tuples, prices under context, and other n-ary statements fit a role-based Relation algebra directly. Binary Property/Link models need reification or another tuple form for the same job.

This is evidence for a general Relation concept, not proof that every n-ary relation should remain anonymous.

## L-REL-09 — A relationship with lifecycle should be an identifiable Type, not a magical Link instance

**State:** `supported` by identity/relator/domain pressure; exact metamodel encoding remains hypothesis.

Employment, contract, assignment and similar relationships can have stable identity, Actions, temporal lifecycle, provenance and their own properties. Model that thing as an identifiable Type and connect participants through ordinary Relations.

## L-REL-10 — Derived scalar values and derived entity relations can share the same Computation/Relation mechanism

**State:** `hypothesis`.

`available_quantity` and a derived relationship/set do not need separate `DerivedProperty` and `DerivedLink` interpreters if Computation returns a typed relation result subject to ordinary endpoint/cardinality checks.

## L-REL-11 — Shape/Interface requirements can target relation capabilities independent of scalar/entity endpoint kind

**State:** `hypothesis`.

A shape can require `name: String[1]` and `customer: Party[1]` through the same relation-capability contract. Endpoint target Type preserves the important difference.

## L-REL-12 — Time and provenance can annotate relation assertions uniformly

**State:** `hypothesis` with strong Wave A/B provenance pressure.

Effective time, observation time and source evidence may apply to a scalar-valued assertion or an entity relationship. Separate Property/Link forms do not remove that shared statement-level problem.

## L-REL-13 — Canonical unification does not require one physical storage layout

**State:** `supported` as architecture boundary.

One scalar relation may lower to a column; one entity relation to an FK; many-valued relations to join/value tables; n-ary relations to tuple tables; search/graph projections may use other structures. Physical optimization is not canonical semantic authority.

## L-REL-14 — Physical lowering may branch on endpoint representation without recreating Property/Link semantics

**State:** `hypothesis`.

Choosing `text column` for literal `String` versus `uuid FK` for identifiable `Party` is a storage/type decision. The reduction fails only if the semantic interpreter/toolchain repeatedly needs two independent behaviors keyed on a Property/Link kind.

## L-REL-15 — Generated SDK/API/tool signatures can remain field-like under canonical Relation

**State:** `supported` in the bounded executable slice.

The unified model generates the same binary signatures as canonical Property+Link and slot+Link competitors:

```text
name: str
weight: Quantity | None
tags: set[str]
customer: Party
lines: list[OrderLine]
```

This does not prove every UI/query surface, but it defeats the claim that separate canonical forms are necessary merely to generate typed fields versus links.

## L-REL-16 — Fully relational tuple IR is expressively sufficient but may be a worse semantic authoring/tooling center

**State:** `hypothesis`.

Competitor D can encode the slice, but ordinary binary fields become predicate-call shapes. If downstream tooling repeatedly reconstructs Type-owned field/navigation views, full tuple minimalism may move complexity rather than remove it.

## L-REL-17 — Scalar-to-entity migration is a breaking equality/identity change even when Relation identity is stable

**State:** `supported` in the migration model.

Changing `code: String` into `code -> ReferenceDataEntity` changes equality, lifecycle and referential semantics. A unified Relation model must surface that as a breaking migration; it may not celebrate stable relation ID and silently coerce the data.

## L-REL-18 — Single-to-many and many-to-single changes are SDK/data-shape migrations, not primitive changes

**State:** `supported` in the bounded model.

Changing cardinality changes generated signatures and can be lossy. The same migration problem exists for scalar and entity targets and does not uniquely justify Property/Link.

## L-REL-19 — Stable Relation identity must survive authoring sugar/refactors

**State:** `hypothesis`.

Renaming field syntax or choosing a different physical layout should not create a new semantic relation accidentally. Conversely, changing to a new stable Relation ID is a semantic change even if the display name remains identical.

## L-REL-20 — One Relation algebra survives #158 only if hidden-branch audit stays clean

**State:** `hypothesis`.

The strongest current falsifier is implementation leakage: if query, SDK, policy, migration or runtime code repeatedly asks `is Property?` / `is Link?`, the canonical unification is fake.

Branches on ordinary endpoint Type, cardinality, identity strategy, derivation and physical representation are permitted because those distinctions survive either architecture.

## L-REL-21 — Passing #158 is insufficient to accept R6

**State:** `supported` as epistemic discipline.

#157 covers Event lifecycle demotion, #158 covers Property/Link unification. The cross-cycle #71 vertical must still exercise Type + Relation + Computation + Action through real business semantics and ontology evolution. RFC-0002 remains a hypothesis until explicit synthesis/promotion.
