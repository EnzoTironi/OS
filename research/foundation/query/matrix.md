# Semantic query capability matrix

**Kind:** convergence and divergence table.  
**Decision:** none. A check mark means the fetched first-party page documents the capability. It does not mean OS should copy the product.  
**Fetched:** 2026-08-16.

Legend.

- `Y` documented as a semantic capability in the pages listed in [sources.md](sources.md)
- `P` partial, experimental, or documented as in development
- `N` not present in the fetched pages
- `n/a` outside the system's claimed job

Storage engines and surface syntax are omitted on purpose.

## Capability by system

| Capability | Palantir Object Sets | GraphQL 2021 | TypeQL 3 | ObjectQL | Datalog (Soufflé) | Relational / SQL:2011 | SPARQL 1.1 | Cypher | Gremlin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ask without naming physical tables | Y | Y | Y | Y | Y | N (tables are the interface) | Y (graph, not tables) | Y | Y |
| Set as a first-class value | Y | N | P (stream / function) | N | Y (relation) | Y (relation) | P (result set, not a saved resource) | P | P (traversal, then `toList`) |
| Saved / named reusable set | Y (static, dynamic, reference) | N | Y (function) | N | Y (named relation) | Y (view) | N in spec | P (query reuse, not a set resource) | N |
| Static snapshot membership | Y | N | N | N | Y (facts) | Y | N | N | N |
| Dynamic predicate membership | Y | n/a | Y | Y (`where`) | Y (rules) | Y (`WHERE`) | Y | Y | Y |
| Set algebra (union, intersect, subtract) | Y (same type) | N | P (or / not in patterns) | N | Y | Y | Y (`UNION`, `MINUS`) | Y | Y |
| Polymorphic query through a shared contract | Y (`interfaceBase`) | Y (interface + fragments) | Y (`plays` / `isa`) | N | N | N | P (`rdf:type` / `rdfs:subClassOf` if modeled) | P (labels) | P (labels) |
| Interface-shaped projection | Y (no mix with object shape) | Y (interface fields only) | Y (role / own) | N | n/a | n/a | P | N | N |
| Typed relationship traversal | Y (Search Around) | P (nested fields, fixed depth) | Y (relation + roles) | P (`expand` one hop) | Y (binary relations) | N (caller writes joins) | Y (property paths) | Y | Y |
| Unbounded / recursive path | N (max 3 hops when loading) | N | Y (recursive functions) | N | Y | N | Y (`*` / `+`) | Y | Y (`repeat`) |
| Relation as an object with attributes | P (object-backed links in landscape notes; not in OSS pages fetched) | N | Y | N | N (tuple only) | N | N (triple only) | P (relationship properties) | P (edge properties) |
| Valid-time query | N in OSS pages | N | N | N | N | Y (application-time) | P (if modeled) | P (if modeled) | P (if modeled) |
| Knowledge / system-time query | P (snapshot, experimental transaction) | N | N | N | N | Y (`SYSTEM_TIME`) | N | N | N |
| Provenance as a queryable fact | N in OSS pages | N | N | N | N | N | Y (PROV-AQ recommends SPARQL) | N | N |
| Operational object load | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Aggregates on the same algebra | Y (capped, some approximate) | P (field resolvers) | Y (`reduce`) | P (AST wider than engine) | Y | Y | Y (`GROUP BY`, aggregates) | Y | Y |
| Window / analytic distinct from operational | P (datasets / Spark) | N | N | P (windows removed or experimental) | N | Y | N | N | P (OLAP graph) |
| Composable predicates | Y (`Filters`) | P (arguments) | Y (patterns, functions) | Y (`$op`) | Y | Y | Y | Y | Y |
| Object-level authorization | Y | N in spec | N in spec | Y | N in spec | N in spec | N in spec | N in spec | N in spec |
| Property-level authorization | Y (null on deny) | N in spec | N in spec | Y (strip field) | N | N | N | N | N |
| Link-level authorization | P (in development / inherit target) | N | N | P (target object rules) | N | N | N | N | N |
| Query expressions shared with functions | Y (Functions API) | N | Y (functions are queries) | N (CEL vs `$op`) | Y (rules are the program) | N | N | N | N |
| Query expressions shared with policy | P (granular policies, not the filter API) | N | P (assert) | N (CEL vs `$op`) | N | N | N | N | N |

## Convergence (same distinction, independent sources)

1. **Storage hiding is not enough.** Palantir, TypeQL, ObjectQL, GraphQL, SPARQL, Cypher, and Gremlin all let a caller avoid physical tables. They still disagree on whether the answer is a set, a tree, or a stream. The shared law is "ask in ontology terms." The disputed law is "the answer is a set value."
2. **Membership is a predicate.** Dynamic object sets, Datalog rules, TypeQL functions, SPARQL graph patterns, and SQL `WHERE` all treat "who is in the set" as a composable condition. GraphQL fragments do not.
3. **Polymorphism is required once types share a capability.** Palantir interfaces, GraphQL interfaces, and TypeDB `plays` / `isa` exist so a question does not enumerate `Airport` and `Plant` and `Hangar`.
4. **Traversal is typed.** Search Around, Cypher relationship types, SPARQL property paths, Gremlin edge labels, and TypeQL roles all refuse to make the asker name a join table.
5. **Valid time and knowledge time are different questions.** SQL:2011 and the OS constitution state both. Operational object-set products fetched this session mostly answer "now."
6. **Authorization that is not in the query language still happens, or it leaks.** Palantir and ObjectQL put it in the read path. GraphQL and SPARQL leave it to the host. Constitution §15 fails if each surface reimplements hide rules.

## Divergence (disagreement and a plausible reason)

| Disagreement | Who | Plausible reason |
| --- | --- | --- |
| Set as a saved resource vs one-shot result | Palantir, Datalog vs GraphQL, ObjectQL | Palantir apps pass sets between Workshop and Functions. GraphQL was designed for client selection trees. |
| Single-type sets vs heterogeneous matches | Palantir Functions (`ObjectSet<T>`) vs TypeQL / SPARQL | Palantir generates a typed TypeScript API per object type. TypeQL patterns bind variables across types. |
| Silent inference vs explicit function | TypeDB 2 rules vs TypeDB 3 functions; Datalog still infers | TypeDB 3 wants data and computation separated. Datalog's job is derived relations. |
| Bounded hops vs unbounded paths | Palantir (3 hops / size caps) vs SPARQL `*` / Datalog recursion | Operational UX vs deductive closure. Fan-out is the cost. |
| Relation as object vs edge | TypeDB, RFC-0001 vs Cypher/Gremlin default edge | Employment and lot-transform have lifecycle. Movie `ACTED_IN` often does not. |
| Deny-as-null vs deny-as-omit vs deny-as-error | Palantir property null vs ObjectQL field strip vs unspecified | Product choice. OS must pick one meaning or queries are not comparable. |
| One expression language vs several | Palantir Functions+OSS vs ObjectQL `$op`+CEL | Policy wants principal context. Query wants indexes. Unifying them is extra work products skip. |
| Analytic flags that do not execute | ObjectQL inert AST members | Schema grew ahead of drivers. Semantic risk. One query, two numbers. |

## Source artifacts (do not promote to OS primitives)

These appeared in fetched pages and look like implementation or product machinery:

- Palantir RIDs, temporary one-hour expiry, OSv1 vs OSv2, Spark aggregation path, Searchable render hint, KNN dimension limits.
- ObjectQL Mongo `$op` spelling, `top` as OData alias, driver names, Zod schemas.
- Soufflé B-tree / Brie / `eqrel` qualifiers, C preprocessor, inlining.
- Gremlin JVM method naming, bytecode compilation, provider-specific OLAP.
- SQL:2011 choice to avoid a period *type* so JDBC and ETL would not have to change.
- GraphQL response field ordering rules.

## What the matrix does not decide

OS still has not chosen a syntax or a store. A `Y` in Cypher or SPARQL is evidence that typed traversal is a real query need. It is not a recommendation to embed that language.
