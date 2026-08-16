# Sources

**Kind:** source-system artifact catalog.  
**Fetched:** 2026-08-16.  
**Rule:** only pages retrieved or read in this session are listed as primary. Repo docs are local. Community posts are secondary and are not used as sole support for a law.

## Local OS documents (read this session)

| Path | Use |
| --- | --- |
| `docs/thesis.md` | Surfaces vs meaning. Current state must be explainable. Time and provenance are first-class research topics. Storage is not decided. |
| `docs/constitution.md` | Model the world, not the source schema. Time and provenance. Human and machine surfaces must not fork meaning. |
| `docs/open-questions.md` | Q7 bitemporality. Q8 provenance. Q9 Function/Constraint/Policy. Q15 query semantics vs toolchain. Q18 physical data model. Not answered here. |
| `docs/research-program.md` | Evidence loop. Reporting queries as evidence of derived state. |
| `docs/swarm-research-backlog.md` | Agent output contract used by this folder. Issue 74 had not landed on `origin/main`. |
| `rfcs/0001-metamodel-hypothesis.md` | Candidate Interface, Relationship, Function, Policy, Fact. Explicit non-decision on query language and storage. |
| `scenarios/README.md` | S-001 dates. S-003 stale approval. S-007 backdated stock. S-008 lot recall. S-011 contradictory observations. |
| `research/README.md` | Evidence note template. Clean-room posture. |
| `research/reference-landscape.md` | Prior snapshot of Palantir Object Sets and ObjectStack. Treated as a pointer, not as evidence. |
| GitHub issue #13 | Assigned question, compare list, and deliverables. |

## Palantir Foundry (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://palantir.com/docs/foundry/object-backend/overview/ | Object Set Service. Static vs dynamic sets. Temporary vs permanent. Search Around scale notes. Property-level permissions on OSv2. |
| https://palantir.com/docs/foundry/interfaces/interface-overview/ | Interface as abstract Ontology type. Properties, link constraints, action constraints. Multiple implementers. Partial OSS support. |
| https://palantir.com/docs/foundry/api/ontologies-v2-resources/ontology-object-sets/load-object-set-objects-or-interfaces/ | `interfaceBase` load. Interface view vs object-type view. No mixed property shapes. Snapshot paging. Branch and transaction are experimental. |
| https://palantir.com/docs/foundry/api/ontologies-v2-resources/ontology-object-sets/create-temporary-object-set/ | Temporary ObjectSet from a definition. Expires after one hour. |
| https://palantir.com/docs/foundry/functions/api-object-sets/ | Object set as unordered collection of one type. Filter, Search Around, union/intersect/subtract, aggregations, KNN. Load limits. |
| https://palantir.com/docs/foundry/functions/api-objects-links/ | Typed links. Search Around from an ObjectSet. MultiLink is not an ObjectSet. |
| https://palantir.com/docs/foundry/analytics/datasets-object-sets/ | Saved object sets vs analytic datasets. Static vs dynamic definitions. |
| https://palantir.com/docs/foundry/object-permissioning/managing-object-security/ | Cell-level security. Object vs property vs data-source policies. Restricted views. MDOs. |
| https://palantir.com/docs/foundry/object-permissioning/object-security-policies/ | Object policy hides the instance. Property policy returns null. Primary key cannot sit in a property policy. |
| https://raw.githubusercontent.com/palantir/foundry-platform-python/develop/docs/v2/Ontologies/models/ObjectSet.md | Official ObjectSet discriminator. `base`, `filter`, `union`, `intersect`, `subtract`, `searchAround`, `interfaceBase`, `static`, `reference`, `nearestNeighbors`, `interfaceLinkSearchAround`. |

Secondary (community, not used as sole support):

- https://community.palantir.com/t/example-of-payload-for-the-create-temporary-object-set-endpoint/4618

## GraphQL (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://spec.graphql.org/October2021/ | October 2021 Foundation spec. Operations, fragments, interfaces, unions. No authorization algebra. No first-class set type. |

## TypeDB / TypeQL (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://typedb.com/docs/core-concepts/typeql/entities-relations-attributes/ | PERA model. Roles as interfaces. `owns` / `plays`. Single inheritance. Interface polymorphism and subtype polymorphism. |
| https://typedb.com/docs/typeql-reference/functions/functions-vs-rules/ | TypeDB 3 functions replace rules. Functions are explicit computation, not silent inferred facts. Goal-driven evaluation. |
| https://typedb.com/docs/learn-typedb/quickstart/query-composition/ | Pipelines. `reduce` as a stream operator. Functions as reusable read-only pipelines. `fetch` as terminal JSON shaping. |
| https://typedb.com/features | Marketing-adjacent feature list. Used only to confirm documented polymorphism claims already present in the core-concepts page. |

## ObjectStack ObjectQL (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://docs.objectstack.ai/docs/protocol/objectql | ObjectQL as a storage-agnostic AST. Objects as business entities. Security applied before execution. |
| https://docs.objectstack.ai/docs/protocol/objectql/query-syntax | Canonical `QuerySchema`. `where`, `expand`, aggregations, `groupBy`, `having`. Dotted projection refused. Several AST members experimental or removed. |
| https://docs.objectstack.ai/docs/protocol/objectql/security | Object, field, and row security. Permission sets. CEL `using` / `check`. Field strip after row admit. |

## Datalog (first-party Soufflé, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://souffle-lang.github.io/program | Datalog as Horn clauses over relations. Relations are sets of typed tuples. Facts and rules. Output is a named relation. |
| https://souffle-lang.github.io/relations | Relation as a set of ordered tuples. Representation qualifiers are implementation. Inlining and magic-set are evaluation, not meaning. |

Soufflé cites Abiteboul, Hull, and Vianu, *Foundations of Databases*, as the textbook account of Datalog. That book was not re-fetched this session.

## Relational / temporal SQL (first-party or standards commentary, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf | Kulkarni and Michels, "Temporal features in SQL:2011." Valid time vs transaction time. `SYSTEM_TIME` vs application-time period. `FOR PORTION OF`. `WITHOUT OVERLAPS`. Closed-open periods. |
| https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-tables?view=sql-server-ver17 | Vendor implementation of `FOR SYSTEM_TIME` (`AS OF`, `FROM`/`TO`, and related forms). Used as an implementation of the SQL:2011 idea, not as OS storage advice. |

Relational algebra itself is the set of operators (select, project, product, union, difference, rename) over relations as sets of tuples. Soufflé's relation definition is the same mathematical object. No separate Codd 1970 reprint was fetched. The SQL:2011 paper is the temporal extension used here.

## Graph traversal (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://www.w3.org/TR/sparql11-query/ | SPARQL 1.1 Query. Graph patterns. Property paths (`*`, `+`, `?`, inverse, negated). Algebra translation. |
| https://neo4j.com/docs/cypher-manual/current/introduction/cypher-overview/ | Cypher as declarative pattern match on typed nodes and relationships. Contrast with SQL joins. |
| https://tinkerpop.apache.org/docs/current/reference/#graph-traversal-steps | Gremlin traversal source, `out`/`in`, `repeat`, path, OLTP vs OLAP note. |

## Provenance query (first-party, fetched 2026-08-16)

| URL | What it is |
| --- | --- |
| https://www.w3.org/TR/prov-o/ | PROV-O. Entity, Activity, Agent, generation, derivation. |
| https://www.w3.org/TR/prov-aq/ | Provenance access and query. SPARQL over PROV-O is the recommended query form. Provenance is not a separate query language. |

## Licensing

OS is MIT. Palantir docs are proprietary documentation. TypeDB, ObjectStack, Soufflé, TinkerPop, GraphQL, W3C, and SQL:2011 text are used as documented behavior and definitions only. No implementation was copied into this repo.
