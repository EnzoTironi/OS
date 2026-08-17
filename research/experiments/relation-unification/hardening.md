# Post-green hardening — issue #158

**Architecture decision:** none.  
**Purpose:** preserve weaknesses discovered after the first unified-Relation model began passing its basic executable cases.

## H1 — Forward cardinality does not determine inverse cardinality

The first candidate stored object cardinality on a binary relation and rendered inverse navigation as `set[Subject]` whenever an inverse name existed.

That is insufficient. These are different contracts:

```text
Order.customer
  each Order -> exactly one Party
  each Party -> zero or many Orders

Person.spouse
  each Person -> zero or one Person
  each Person <- zero or one Person
```

The forward constraint cannot be inverted mechanically.

**Correction:** `BinaryRelationContract` carries forward and inverse cardinality independently. This is relation-role/uniqueness semantics and applies regardless of whether the endpoint is scalar-like or entity-like. It does not require a `Link` semantic species.

A production n-ary algebra may need richer uniqueness/functional-dependency constraints rather than a binary-only helper; #158 does not pretend the small helper is the final constraint language.

## H2 — `ordered: bool` was not enough collection semantics

The first candidate implicitly mapped:

```text
unordered many -> set[T]
ordered many   -> list[T]
```

That silently loses **bag/multiset** semantics. Some domains can care that the same value/member occurs more than once even when order is irrelevant.

**Correction:** the hardened candidate distinguishes:

```text
SET   unordered, duplicates collapse under endpoint equality
LIST  ordered, duplicate multiplicity may remain meaningful
BAG   unordered, duplicate multiplicity remains meaningful
```

The same collection semantics work for literal and entity targets. Endpoint Type supplies value equality or stable entity identity. Therefore the missing distinction does not support Property/Link separation; it supports a richer generic cardinality/collection contract.

## H3 — Definition annotations were not concrete assertion identity

The first candidate could say that a Relation *supports* effective time, observed time or provenance, but it did not model one concrete assertion that could be corrected, sourced or historically referenced.

That matters equally for:

```text
OrderLine.unit_price = BRL 10.00
Order.customer = Party-123
```

Both may need evidence, observation time or correction identity.

**Correction:** `RelationAssertion` is a generic optional statement envelope:

```text
assertion_id
relation_id
role bindings
effective_at?
observed_at?
provenance[]
```

A correction points to an earlier assertion and supplies a new assertion identity rather than rewriting the old assertion in place.

This is **not** a decision that `Fact` is a metamodel primitive, nor a requirement that every physical scalar value become an individually stored assertion row. It is the semantic/runtime envelope used when identity/provenance/history requires one. Physical lowering may inline simple current values and materialize envelopes selectively as long as historical/authority semantics remain reconstructable.

## H4 — Scalar/entity target kind is a real distinction but not yet a Property/Link distinction

The unification does not attempt to erase:

```text
literal/value endpoint -> value equality
entity endpoint        -> stable identity/reference semantics
```

This distinction is load-bearing for SDK typing, migrations and physical lowering.

The current hidden-branch test asks the narrower architectural question:

> Can every such behavior be selected from endpoint Type/cardinality/identity metadata, or does the interpreter need a separate canonical `Property`/`Link` kind?

So far the executable generators remain clean: they branch on endpoint Type/cardinality where necessary but never on PropertyDef/LinkDef in the unified candidate.

## H5 — Scalar-to-entity migration may not preserve semantic continuity merely because Relation ID is stable

The first migration model correctly marks scalar→entity as `breaking-equality-identity-change`, but a stable relation ID alone does **not** prove that the semantic concept stayed the same.

Example:

```text
Product.status: enum ProductStatus
        ->
Product.status: StatusReferenceEntity
```

This may be a representation migration of one domain concept, or it may introduce a new identity/lifecycle/authority concept. The migration must be explicitly adjudicated. `migration_classification()` identifies a breaking target/equality change; it does not authorize reuse of the old semantic Relation ID automatically.

This boundary mirrors #157's TypeRevision lesson: stable IDs are historical contracts, not convenience labels.

## Still-open boundary A — Generic assertion envelope versus a future Fact/Claim model

`RelationAssertion` demonstrates that scalar and entity relations can share one statement envelope. It does not settle whether cross-domain evidence/claims/observations eventually require a richer first-class semantic concept.

Revive a separate Fact/Assertion primitive only if #71 shows a unique interpreter/identity/authority protocol that cannot be represented as ordinary typed records/relations plus generic statement envelopes.

## Still-open boundary B — N-ary uniqueness constraints

The binary hardening makes forward/inverse multiplicity explicit. N-ary relations can require functional dependencies such as:

```text
(Product, Warehouse, Lot) -> at most one current policy/value
```

A production Relation constraint algebra must express those without decomposing the tuple into fake binary properties/links. This is a #71/toolchain requirement, not evidence yet for Property/Link separation.

## Still-open boundary C — Physical performance

The experiment shows semantic unification can lower differently to columns, foreign keys and tuple tables. It does not prove that one generic physical table should store all assertions. That would likely be the wrong conclusion.

Canonical semantic unification survives only if physical specialization remains generated/derived and cannot become a rival semantic authority.

## Current adversarial reading

The first three weaknesses made the unified candidate **more structured**, not more split:

```text
Relation definition
+ endpoint Type identity/equality
+ per-direction/role cardinality constraints
+ collection semantics
+ optional assertion envelope
+ physical lowering
```

None currently requires a canonical `Property` or `Link` discriminator.

That is evidence for the Relation hypothesis, but #158 remains incomplete until the final branch passes all local and upstream gates and undergoes an explicit review. #71 remains the cross-cycle acceptance test.
