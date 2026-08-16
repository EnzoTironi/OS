# Evidence

**Question:** What semantic query capabilities must exist so humans and agents can ask business questions without depending on storage layout?

Every block is labeled. Labels are `domain evidence`, `source-system artifact`, `candidate law`, `counterexample`, or `runtime consequence`. Interpretation sits after the label, not inside it.

Primary pages are listed in [sources.md](sources.md). Fetched 2026-08-16.

---

## 1. Sets as first-class values versus query results

### E1. Palantir Object Sets are definitions that other applications consume

**Kind:** source-system artifact  
**Source:** [Object backend overview](https://palantir.com/docs/foundry/object-backend/overview/), [Datasets and object sets](https://palantir.com/docs/foundry/analytics/datasets-object-sets/), [Functions object sets](https://palantir.com/docs/foundry/functions/api-object-sets/), [Create Temporary Object Set](https://palantir.com/docs/foundry/api/ontologies-v2-resources/ontology-object-sets/create-temporary-object-set/), [ObjectSet model](https://raw.githubusercontent.com/palantir/foundry-platform-python/develop/docs/v2/Ontologies/models/ObjectSet.md)

The Object Set Service serves reads by searching, filtering, aggregating, and loading objects. An object set is saved as a Foundry resource and shared across applications.

Two definition kinds exist:

- Static. A list of primary keys. Membership does not change when source data changes.
- Dynamic. A saved filter. Membership updates when new objects match.

Two lifetimes exist:

- Temporary. Created from a definition, used to hand a set between services, expires (overview says 24 hours for some temporary RIDs; the create-temporary API says one hour).
- Permanent. Stored for later use.

The Functions API states an object set is an unordered collection of objects of a single type. Filter, Search Around, and aggregation run on the set. Loading is deferred until `.all()`, `.take()`, or an aggregation forces materialization. The official discriminator includes `base`, `filter`, `union`, `intersect`, `subtract`, `searchAround`, `interfaceBase`, `static`, `reference`, `nearestNeighbors`, and `interfaceLinkSearchAround`.

**Interpretation.** Palantir treats the set as a value. The value is a definition, not a page of rows. That is why Workshop, Functions, Object Explorer, and Quiver can pass the same set.

### E2. Datalog relations are sets. Output is a named relation.

**Kind:** source-system artifact  
**Source:** [Soufflé Program](https://souffle-lang.github.io/program), [Soufflé Relations](https://souffle-lang.github.io/relations)

Soufflé defines a relation as a set of ordered tuples whose attributes have types. A program declares relations, asserts facts, writes rules, and names an output relation. `.output B` queries relation `B` after evaluation. The result is still a relation, not a presentation tree.

B-tree, Brie, `eqrel`, inlining, and magic-set are declared as representation or evaluation choices. They are not part of the relation's meaning.

**Interpretation.** In Datalog the set *is* the query result. There is no separate "result page" type. Composition is "another rule that mentions the relation."

### E3. GraphQL and ObjectQL return trees or record pages, not reusable sets

**Kind:** source-system artifact  
**Source:** [GraphQL October 2021](https://spec.graphql.org/October2021/) §§2, 2.8, 3.7; [ObjectQL query syntax](https://docs.objectstack.ai/docs/protocol/objectql/query-syntax)

A GraphQL document contains operations and fragments. The result of a query is a selection-set tree. Fragments reuse field selections. They do not name a set of objects that another operation can filter or traverse. The spec has no ObjectSet type.

ObjectQL's `QueryAST` names one `object`, a `where` predicate, `fields`, `expand`, `limit`/`offset`, and optional aggregations. `expand` is a second batched `$in` read, not a join the driver renders. Dotted projection such as `owner.name` is refused (`INVALID_FIELD`, #7532). There is no first-class named set that another query can take as input.

**Interpretation.** Hiding SQL is not the same as making sets values. ObjectQL and GraphQL hide storage and still treat the answer as a one-shot page or tree.

### E4. TypeQL answers are streams. Functions name reusable streams.

**Kind:** source-system artifact  
**Source:** [TypeQL query composition](https://typedb.com/docs/learn-typedb/quickstart/query-composition/), [Functions vs rules](https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/)

A TypeQL stage produces a stream of answers. Stages chain. `reduce`, `sort`, and `limit` are stream operators. They do not read or write database state. Functions wrap a read-only pipeline and can be called from `match`, `assert`, or `fetch`. TypeDB 3 replaced silent rules with explicit functions so computation is not confused with stored facts.

**Interpretation.** TypeQL's reusable unit is a function or a pipeline, not a saved object-set resource. The stream is still a first-class answer, not a storage cursor the caller is supposed to understand.

### E5. Domain pressure for first-class sets

**Kind:** domain evidence  
**Source:** `scenarios/README.md` S-002, S-008; issue #13 inventory and overdue-commitment examples

"Units available to promise," "lots that contain a defective input," and "commitments past promised date" are sets that later questions reuse. S-002 asks how partial fulfillments relate to one commitment. S-008 asks which customers received affected lots. Those questions take a set as input.

**Candidate implication.** If OS can only return a page, every later question re-states the predicate and can drift.

---

## 2. Polymorphic queries through interfaces

### E6. Palantir Interface is an abstract query type

**Kind:** source-system artifact  
**Source:** [Interfaces overview](https://palantir.com/docs/foundry/interfaces/interface-overview/), [Load objects or interfaces](https://palantir.com/docs/foundry/api/ontologies-v2-resources/ontology-object-sets/load-object-set-objects-or-interfaces/)

An interface describes shape and capabilities. It is not backed by a dataset and cannot be instantiated. Object types implement one or more interfaces. Interfaces extend other interfaces. A `Facility` interface with name and location can be implemented by `Airport`, `Manufacturing Plant`, and `Maintenance Hangar`. New implementers join existing workflows without a rewrite.

OSS can search and sort by interface. Aggregation by interface and interface link types were documented as in development on the page fetched this session. The load API accepts `{"type":"interfaceBase","interfaceType":"Person"}`. If the object is viewed as the interface, only interface properties are returned. Mixing interface-shaped and object-type-shaped rows in one result is an error.

**Runtime consequence.** Polymorphism is a load-shape rule, not only a schema comment. Partial platform support is a product fact. It does not erase the semantic need.

### E7. GraphQL interfaces guarantee fields. Fragments recover concrete type.

**Kind:** source-system artifact  
**Source:** [GraphQL October 2021](https://spec.graphql.org/October2021/) §3.7

An interface is a list of named fields. Implementing object types must define those fields. A field that returns an interface returns a concrete object at runtime. A selection on the interface may only ask for interface fields. Concrete fields require a fragment with a type condition. Types may implement multiple interfaces.

**Interpretation.** GraphQL polymorphism is structural field sharing plus runtime type tests. It is not a saved set of all `NamedEntity` values.

### E8. TypeDB splits interface polymorphism and subtype polymorphism

**Kind:** source-system artifact  
**Source:** [Entities, relations, attributes](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)

A role declared with `relates` is an interface. `plays` implements it. `owns` implements an attribute's ownership interface. Several types may play the same role. That is interface polymorphism.

A subtype created with `sub` inherits `owns` and `plays`. `$x isa person` matches `person` and every subtype. That is subtype polymorphism. Inheritance is single. Roles compose the rest.

**Interpretation.** TypeDB's "interface" is a role or ownership, not a Palantir/GraphQL interface object. The query need is the same. Ask once across every type that can fill a role.

### E9. RFC-0001 already suspects Interface

**Kind:** domain evidence  
**Source:** `rfcs/0001-metamodel-hypothesis.md` (hypothesis, not accepted)

RFC-0001 lists Interface as a candidate form for shared capabilities (`Principal`, `Locatable`, `InventoryResource`, `Fulfillable`). It asks whether an interface holds only properties or also relationships and actions. Palantir interfaces include property, link, and action constraints. That is independent convergence on the richer reading, still a hypothesis for OS.

---

## 3. Typed relationships and path traversal

### E10. Palantir Search Around is typed-link traversal on sets

**Kind:** source-system artifact  
**Source:** [Functions object sets](https://palantir.com/docs/foundry/functions/api-object-sets/), [Functions objects and links](https://palantir.com/docs/foundry/functions/api-objects-links/), [Object backend overview](https://palantir.com/docs/foundry/object-backend/overview/)

Search Around methods are generated from imported link types. Example. Filter flights by departure code, then `searchAroundPassengers()` to get a passenger object set. The hop stays on the set. A `MultiLink` on one loaded object is not an ObjectSet. The caller must lift the object into a set to keep composing.

Documented limits. At most three Search Arounds when loading with `.all()`. OSv1 result cap 100,000. OSv2 result cap 10 million. Default Search Around scale 100,000 unless raised.

**Runtime consequence.** Traversal is a semantic operation with physical fan-out limits. The limits are engine pressure, not a reason to make callers write joins.

### E11. Cypher, SPARQL, and Gremlin all treat typed edges as the query

**Kind:** source-system artifact  
**Sources:** [Cypher overview](https://neo4j.com/docs/cypher-manual/current/introduction/cypher-overview/), [SPARQL 1.1 §9](https://www.w3.org/TR/sparql11-query/#propertypaths), [TinkerPop reference](https://tinkerpop.apache.org/docs/current/reference/#graph-traversal-steps)

Cypher writes `(actor:Actor)-[:ACTED_IN]->(movie:Movie {title: 'The Matrix'})`. The relationship type is in the pattern. The SQL comparison on the same page is a three-table join the caller must name.

SPARQL property paths are routes through a directed, possibly cyclic graph with named edges. `*`, `+`, and `?` express unbounded or optional connectivity. Inverse and negated paths exist. A path does not span multiple graphs in a dataset. Some paths translate to triple patterns and `UNION`. Unbounded paths do not.

Gremlin starts at a traversal source and steps with `out('knows')`, `values('name')`, `path()`, and `repeat(out()).times(2)`. The edge label is an argument to the step. TinkerPop states Gremlin is the unifying interface across OLTP and OLAP providers.

**Interpretation.** Independent graph languages agree that the asker names a typed relationship, not a foreign-key column.

### E12. TypeDB relations are first-class and can carry attributes

**Kind:** source-system artifact  
**Source:** [Entities, relations, attributes](https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/)

A relation depends on role players. An `employment` cannot exist without employer and employee players. The relation may `owns start-date`. Role names are scoped to the relation (`employment:employer`). This matches RFC-0001's suspicion that a link with lifecycle is a relational entity, not an enriched edge.

**Domain evidence.** `scenarios/README.md` S-006 (employment with promotion, suspension, termination) and S-008 (lot transformation) need a traversable thing that is not a bare foreign key.

### E13. ObjectQL expand is not graph navigation

**Kind:** source-system artifact  
**Source:** [ObjectQL](https://docs.objectstack.ai/docs/protocol/objectql), [Query syntax](https://docs.objectstack.ai/docs/protocol/objectql/query-syntax)

Related records load through `expand`. The engine issues a batched `$in` on the foreign key. `joins` were removed from the live protocol (#4286). A dotted path is not a traversal.

**Counterexample (to "any object query language already has graph navigation").** ObjectQL can hide PostgreSQL and still lack typed multi-hop navigation.

---

## 4. Temporal queries

### E14. SQL:2011 splits valid time and transaction time

**Kind:** source-system artifact  
**Source:** Kulkarni and Michels, [Temporal features in SQL:2011](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf)

Two dimensions:

- Valid time (application-time period). When the row is believed true in the world. The user sets start and end, including past and future. `FOR PORTION OF` updates or deletes only inside a period and splits overlapping rows.
- Transaction time (`SYSTEM_TIME`). When the row was recorded. The system maintains the period. Historical rows are not current system rows.

Periods are closed-open. At most one application-time period and one system-time period per table. Primary keys on application-time tables need `WITHOUT OVERLAPS` or the same employee can belong to two departments in the same interval. Referential constraints must hold at every point in the period, not only on current rows.

**Domain evidence.** `docs/constitution.md` §10 and `docs/open-questions.md` Q7 ask the same two questions. `scenarios/README.md` S-007 is the stock version. S-001 needs requested, promised, planned, and actual as different facts, not one overwritten date.

### E15. Palantir object-set reads are mostly current-state plus snapshot paging

**Kind:** source-system artifact  
**Source:** [Load objects or interfaces](https://palantir.com/docs/foundry/api/ontologies-v2-resources/ontology-object-sets/load-object-set-objects-or-interfaces/)

`snapshot=true` freezes the page stream so later pages do not duplicate or skip. `snapshot=false` (default) lets new results enter. `branch` and `transactionId` are experimental. The fetched pages do not define `FOR SYSTEM_TIME` or valid-time predicates on Object Sets.

**Interpretation.** A mature operational ontology can still leave bitemporal query as a gap. That is evidence of product scope, not evidence that OS can skip the dimension.

### E16. ObjectQL history is field tracking, not a query dimension

**Kind:** source-system artifact  
**Source:** [ObjectQL](https://docs.objectstack.ai/docs/protocol/objectql)

`trackHistory: true` is an object enable flag. The query AST fetched this session has no valid-time or knowledge-time parameter.

**Counterexample (to "storage-agnostic query already includes time").** ObjectQL's claim is compile-to-many-stores. Time is not in the AST.

---

## 5. Provenance-aware queries

### E17. W3C treats provenance as ordinary queryable data

**Kind:** source-system artifact  
**Source:** [PROV-O](https://www.w3.org/TR/prov-o/), [PROV-AQ](https://www.w3.org/TR/prov-aq/)

PROV-O encodes Entity, Activity, Agent, generation, and derivation in OWL. PROV-AQ says provenance records are located and retrieved over HTTP. For richer access it recommends a SPARQL service using PROV-O terms. The example in the PROV family FAQ (linked from the note) selects `prov:wasGeneratedBy` / `prov:startedAtTime`. There is no separate "provenance query language."

**Interpretation.** If OS stores provenance as first-class facts, the query model must be able to mention those facts. A side log that queries cannot filter on is not what PROV-AQ describes.

### E18. Domain pressure from contradictory observations

**Kind:** domain evidence  
**Source:** `docs/constitution.md` §11; `scenarios/README.md` S-011; `docs/open-questions.md` Q3 and Q8

Two identical delivery dates with different sources (ERP, spreadsheet, chat) are not the same fact. A query "what is the promised date?" that cannot cite source, activity, and evidence returns an unexplained value. Constitution §11 says provenance is part of meaning when decisions depend on it.

No first-party Palantir or ObjectQL page fetched this session defines a provenance predicate on object-set or ObjectQL filters. That absence is recorded, not filled.

---

## 6. Aggregates and windowing versus operational queries

### E19. Palantir splits object-set aggregation from analytic datasets

**Kind:** source-system artifact  
**Source:** [Functions object sets](https://palantir.com/docs/foundry/functions/api-object-sets/), [Datasets and object sets](https://palantir.com/docs/foundry/analytics/datasets-object-sets/), [Object backend overview](https://palantir.com/docs/foundry/object-backend/overview/)

Object-set aggregations (`count`, `sum`, `average`, `min`, `max`, `cardinality`, `groupBy`, `segmentBy`) run on searchable properties. Caps. 10,000 buckets. `topValues()` is approximate above 1,000 distinct values. Loading more than 100,000 objects fails. Quiver and Contour can save an object set *or* write a dataset. Production pipelines are directed to Code Repositories. OSv2 adds a Spark path for higher-scale Search Arounds and more accurate aggregations.

**Runtime consequence.** Operational set math and analytic windows share objects and diverge in scale, approximation, and materialization.

### E20. ObjectQL declared analytic members that the engine did not honor

**Kind:** source-system artifact  
**Source:** [ObjectQL query syntax](https://docs.objectstack.ai/docs/protocol/objectql/query-syntax)

`QuerySchema` is wider than `IDataEngine.find()`. `joins`, `windowFunctions`, `cursor`, and `distinct` were removed after they parsed but did not execute (#4286, ADR-0049). A per-aggregation `distinct` flag (#6815) produced a deduplicated sum on the in-memory fallback and an ordinary sum on SQL drivers. The live replacement is `count_distinct` only.

**Counterexample (to "one AST can mean both operational and analytic without an execution contract").** A declared window or distinct flag that some backends ignore is two answers for one question.

### E21. TypeQL reduce is not a database write

**Kind:** source-system artifact  
**Source:** [Query composition](https://typedb.com/docs/learn-typedb/quickstart/query-composition/)

`reduce $count = count` consumes the matched variable and creates a new one. `groupby` keeps grouping variables. The operator transforms the answer stream. It does not change stored facts.

**Interpretation.** Aggregation as a stream function over a set is the shared idea. Binding it to a SQL `GROUP BY` plan is a source artifact.

---

## 7. Composable predicates and reusable named sets

### E22. Palantir composes filters and set algebra on the same type

**Kind:** source-system artifact  
**Source:** [Functions object sets](https://palantir.com/docs/foundry/functions/api-object-sets/), [ObjectSet model](https://raw.githubusercontent.com/palantir/foundry-platform-python/develop/docs/v2/Ontologies/models/ObjectSet.md)

`.filter()` takes typed predicates (`exactMatch`, `range`, geo, link `isPresent`). `Filters.and` / `or` / `not` compose them. `&&` and `||` are rejected. `.union()`, `.intersect()`, and `.subtract()` require the same object type. A `reference` ObjectSet points at a saved definition.

**Source-system artifact.** Single-type sets. Cross-type questions go through Search Around or `interfaceBase`, not through union of unlike types.

### E23. TypeQL functions and Datalog rules are the reusable predicate

**Kind:** source-system artifact  
**Sources:** [Functions vs rules](https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/), [Soufflé Program](https://souffle-lang.github.io/program)

TypeQL `fun reachable_from($from: node) -> { node }` is a named, recursive, read-only query. Arguments must be bound. Return values bind with `in`. Silent rule inference was removed so data and computation stay separate.

Soufflé `B(x,z) :- A(x,y), B(y,z).` names a derived relation. Recursion is ordinary. The named relation is the reusable set.

**Interpretation.** Two independent traditions make "overdue commitment" a named definition, not a pasted `WHERE` clause.

### E24. GraphQL fragments compose selections, not membership

**Kind:** source-system artifact  
**Source:** [GraphQL October 2021](https://spec.graphql.org/October2021/) §2.8

Fragments reuse field lists under a type condition. They do not define "the set of overdue orders."

**Counterexample (to "GraphQL already has named sets").** Reuse of projection is not reuse of membership.

---

## 8. Query authorization at object, property, and link grain

### E25. Palantir cell-level security is object policy plus property policy

**Kind:** source-system artifact  
**Source:** [Managing object security](https://palantir.com/docs/foundry/object-permissioning/managing-object-security/), [Object security policies](https://palantir.com/docs/foundry/object-permissioning/object-security-policies/)

Object security policy. Row grain. Fail the policy and the instance is not viewable.

Property security policy. Column grain. Pass the object policy and fail the property policy and the property is returned as null. The primary key cannot sit in a property policy. A non-key property belongs to at most one property policy.

Restricted views and multi-datasource object types remain as data-source policies. Palantir recommends object/property policies for Ontology reads because updates apply without a pipeline rebuild and they work with streams and branching.

Media-reference warning. Ontology property security does not automatically secure the media set the property points at.

**Runtime consequence.** A query that "returns the object" is incomplete unless it says which properties the principal may see. Null-as-hidden is a Palantir choice, not a law.

### E26. ObjectQL injects row and field constraints before execution

**Kind:** source-system artifact  
**Source:** [ObjectQL security](https://docs.objectstack.ai/docs/protocol/objectql/security), [ObjectQL](https://docs.objectstack.ai/docs/protocol/objectql)

Documented check order. Object CRUD grant, then RLS `using` (unless `viewAllRecords`), then field-level strip. RLS is CEL compiled to a row filter. Multiple policies OR. Context is limited to unique identifiers (`current_user.id`, `organization_id`, pre-resolved membership sets). Display name is intentionally not resolvable so a name collision cannot leak a row.

**Interpretation.** Authorization is part of the query the engine runs, not a later UI hide. That matches constitution §15 (surfaces must not fork meaning) if and only if every surface hits the same injection.

### E27. GraphQL, SPARQL, Cypher, and Soufflé do not define object-property-link policy

**Kind:** source-system artifact  
**Sources:** GraphQL spec, SPARQL 1.1, Cypher overview, Soufflé program pages fetched this session

None of those language specs define row, column, or edge authorization. Auth is left to the host. That is a source-system gap, not evidence that OS can omit it.

**Link grain.** Palantir documents interface link types as in development. ObjectQL expand follows a lookup field and inherits object/field rules on the related object. No fetched page defines a distinct "may traverse this link type" predicate separate from "may see the target object." Decision on link-level authorization stays `undetermined` as a required primitive. See [open-questions.md](open-questions.md).

---

## 9. Shared expression semantics with Functions and Policies

### E28. Palantir Functions use the same object-set algebra

**Kind:** source-system artifact  
**Source:** [Functions object sets](https://palantir.com/docs/foundry/functions/api-object-sets/)

A `@Function()` method filters, Search-Arounds, and aggregates through `Objects.search()`. The function input can be an ObjectSet so the caller does not load rows. Filters must use the `Filters` API, not JavaScript `&&`.

**Interpretation.** Operational logic and query share one object-set type. That is the practical form of RFC-0001's claim that a Function is reusable in properties, constraints, policies, actions, and queries.

### E29. TypeQL functions are read-only query pipelines

**Kind:** source-system artifact  
**Source:** [Query composition](https://typedb.com/docs/learn-typedb/quickstart/query-composition/), [Functions vs rules](https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/)

Functions may contain full pipelines and must not have side effects. They replace rules. They do not infer new stored instances. Goal-driven evaluation computes only calls relevant to the current query.

**Interpretation.** The shared core is a typed, side-effect-free expression. Mutation stays in Actions (OS) or insert stages (TypeQL), not in the function.

### E30. ObjectQL splits query `$op` from policy CEL

**Kind:** source-system artifact  
**Source:** [Query syntax](https://docs.objectstack.ai/docs/protocol/objectql/query-syntax), [Security](https://docs.objectstack.ai/docs/protocol/objectql/security)

`where` uses Mongo-style `$gt` / `$eq`. RLS uses CEL (`owner_id == current_user.id`). Validation rules use a third condition string (`end_date < start_date`).

**Counterexample (to "one product already unified query, function, and policy expressions").** Three expression dialects in one protocol. Drift risk is documented by the project's own enforce-or-remove sweep on inert query members.

### E31. OS open question 9 is not answered here

**Kind:** domain evidence  
**Source:** `docs/open-questions.md` Q9; `rfcs/0001-metamodel-hypothesis.md` Function / Constraint / Policy

The tempting collapse is `Constraint = Function<Context, Bool>` and `Policy = Function<Principal, Action, Resource, Context, Bool>` plus fail-closed enforcement. This folder does not promote that collapse. Evidence only says query predicates, functions, and policies *mention the same objects, links, and properties*. Whether they share one language remains `hypothesis`.
