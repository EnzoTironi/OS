# Relation unification experiment — issue #158

**Issue:** #158  
**Consumes:** #3, #13, #62, #64, #65, #70, #157  
**Status:** hypothesis under attack  
**Architecture decision:** none

## Question

Can one canonical semantic `Relation` algebra subsume what business/application frameworks usually call **Property** and **Link**, while still generating precise authoring, query, SDK/API/tool surfaces and safe migrations?

The experiment distinguishes four layers that are easy to conflate:

```text
authoring vocabulary
canonical semantic IR
runtime/query/type semantics
physical lowering
```

A user may still write:

```text
property total: Money
link customer: Customer
```

while both lower to the same canonical relation form. That only counts as a real reduction if the canonical runtime/toolchain does not reconstruct two separate semantic species through hidden branches.

## Competitors

### A — unified canonical Relation

```text
RelationDef(
  roles=[subject, object, ...],
  role_types=[EntityType | LiteralType | ValueObjectType],
  cardinality,
  ordered,
  derived,
  annotations
)
```

A binary scalar-valued relation can author/render like a field. A binary entity-valued relation can author/render like a link. N-ary relations are first-class tuples. A relationship that needs its own identity/lifecycle is modeled as an ordinary identifiable Type plus Relations to participants.

### B — canonical Property + Link

Separate `PropertyDef` and `LinkDef` survive in semantic IR even if lower-level query/storage machinery is shared.

### C — Type slots + Link Relation

Scalar values are slots/fields owned by Type; only entity relationships are Relations.

### D — fully relational tuple IR

Everything is a typed tuple predicate, including Type membership and scalar attributes. Type declarations are constraints over tuple positions rather than the primary authoring unit.

## Required semantic distinctions that must survive every competitor

The experiment does **not** attempt to erase real differences:

- literal/value equality vs entity identity;
- 0..1, 1, 0..N, 1..N cardinality;
- ordered vs unordered multiplicity;
- absence vs explicit `unknown` vs `not-applicable`;
- Money/Quantity dimensional typing;
- enum/reference-data values;
- inverse navigation;
- n-ary semantics;
- effective/observed time and provenance on assertions;
- derived relations;
- relationship identity/lifecycle where the relationship itself is a thing.

The question is whether those differences need **Property vs Link as canonical semantic kinds**, or whether ordinary endpoint typing/cardinality/identity already explains them.

## Enterprise slice encoded in every model

The executable models use the same small slice:

```text
Party
Product
SalesOrder
OrderLine
Employment

Product.name                 required String
Product.weight               optional Quantity
Product.tags                 multi String
Product.status               enum ProductStatus
SalesOrder.customer          required Party
SalesOrder.lines             ordered many OrderLine
OrderLine.product            required Product
OrderLine.quantity           required Quantity
OrderLine.unit_price         required Money
Employment                   identifiable Type with lifecycle
Employment.worker            Party
Employment.employer          Party
Employment.valid_during      Interval/value
```

The slice deliberately mixes scalar-like and entity-like relations plus an identifiable relationship.

## Missing values

`nullable` is not used as a universal semantic shortcut.

```text
absent relation assertion
  != explicit UnknownValue
  != explicit NotApplicableValue
```

Optional cardinality means an assertion may be absent. If a domain must represent epistemic unknown or not-applicable as actual information, that is a typed value/state, not SQL NULL semantics smuggled into ontology.

## Lifecycle relationships

A relation whose association itself needs stable identity, Actions, temporal lifecycle, provenance or independent properties is **not forced into an anonymous Link edge**:

```text
Employment : Type
Employment.worker   : Relation(Employment, Party)
Employment.employer : Relation(Employment, Party)
Employment.valid    : Relation(Employment, Interval)
```

This is intentionally the same modeling move for all competitors. The issue tests Property/Link unification, not whether every relationship is an anonymous edge.

## Evaluation dimensions

Each executable competitor is scored on:

1. static typing;
2. cardinality;
3. value equality vs entity identity;
4. query navigation/inverse;
5. SDK/API/MCP/UI generation;
6. schema evolution/refactor safety;
7. time/provenance annotations;
8. lifecycle relationship targeting;
9. physical lowering;
10. human/agent inspectability;
11. hidden interpreter branches.

## Anti-cheat rule

The unified candidate fails if its implementation needs logic equivalent to:

```text
if relation.kind == PROPERTY: ...
if relation.kind == LINK: ...
```

A generic distinction such as:

```text
endpoint type = literal String
endpoint type = entity Party
cardinality = one | many
identity semantics = value | entity-id
```

is **not** by itself evidence that Property/Link are separate primitives. Those are ordinary type/cardinality facts needed in either design.

## Kill criteria

Keep one canonical Relation only if:

- the same relation definition machinery represents all required cases;
- generated surfaces remain statically precise;
- migrations reveal breaking semantic changes rather than silently coercing them;
- physical lowering can specialize without becoming semantic authority;
- no repeated Property/Link-specific runtime branch reappears;
- lifecycle relationships remain targetable via ordinary identifiable Types.

Split canonical Property/Link if scalar-vs-entity semantics require genuinely different identity/evolution/query/authority protocols that cannot be explained by endpoint types and cardinalities.

Passing this experiment would only strengthen the R6 `Relation` hypothesis. It would not accept R6 or edit RFC-0002 automatically.
