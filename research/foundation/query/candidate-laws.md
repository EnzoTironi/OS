# Candidate laws

**Kind:** candidate law, counterexample, runtime consequence, decision state.  
**Rule:** a law is the smallest claim that explains the evidence. It is not accepted. Falsifiers are listed.

RFC-0001 is not edited. These claims are attack surface for later synthesis.

---

## L1. A business query names ontology things, not storage things

**Claim.** A human or agent question is well-formed only if it mentions types, interfaces or roles, properties, relationships, time, provenance, and principals that exist in the ontology. Physical tables, indexes, join order, and driver names are not part of the question.

**Evidence.** Palantir OSS, TypeQL, ObjectQL, GraphQL, SPARQL, Cypher, Gremlin, and Datalog all hide or ignore physical layout. Constitution §6. Thesis non-decision on the physical database. ObjectQL's compile-to-many-stores pitch.

**Counterexample that would reject this.** A required enterprise question that cannot be stated until the asker names a partition key or an index. Not found this session.

**Runtime consequence.** The engine may use tables, graphs, or search indexes. Those choices stay below the semantic cut.

**Decision state.** `supported` as a requirement. `rejected` as a claim that any one of those languages is the OS language.

---

## L2. Sets are values. Result pages are not.

**Claim.** The answer to a membership question is a set that later filters, traversals, aggregations, Actions, and Policies can consume without restating the predicate. A one-shot page or selection tree is a surface over that set, not a substitute for it.

**Evidence.** Palantir ObjectSet discriminator and saved static/dynamic resources (E1). Datalog output relations (E2). Examples 1 to 5 all reuse a named set. TypeQL functions as reusable streams (E4).

**Counterexample.** GraphQL fragments and ObjectQL `find()` pages (E3, E24). They hide SQL and still cannot pass "overdue open commitments" to an Action as a value.

**Falsifier.** A complete OS vertical in which no Action, Function, or later query ever consumes a prior membership result.

**Runtime consequence.** Materialize late. Palantir defers load until `.all()` / `.take()` / aggregate. Temporary sets expire. Those are engine tactics, not laws.

**Decision state.** `supported`.

---

## L3. Static membership and dynamic membership are different set kinds

**Claim.** A set defined by identity list and a set defined by a predicate are not the same object. Confusing them silently changes answers when the world changes.

**Evidence.** Palantir static (primary keys, stable) vs dynamic (filters, updates) (E1). SQL:2011 current system row vs historical row. S-003 (approval of a set that later changes).

**Counterexample.** Treating a saved "short items this morning" snapshot as a live short-items query after a receipt posts.

**Runtime consequence.** Saved resources need a definition kind in their metadata. Expiry of temporary sets is a product detail.

**Decision state.** `supported`.

---

## L4. Polymorphic queries range over a shared contract, not a type list

**Claim.** If several types share a capability, a query over that capability must remain valid when a new implementer appears. The contract may be an Interface (Palantir, GraphQL, RFC-0001) or a role / ownership (TypeDB). Enumerating concrete types in every question is not an adequate substitute.

**Evidence.** Palantir `Facility` / `interfaceBase` (E6). GraphQL `NamedEntity` (E7). TypeDB `plays` and `isa` (E8). Examples 1, 2, 4, 5.

**Counterexample.** ObjectQL queries name one `object` string (E3). A new subtype requires a new query.

**Falsifier.** A domain where every shared-capability question is simpler and safer when written as an explicit union of concrete types, including after types are added.

**Runtime consequence.** Load shape must be uniform. Palantir forbids mixing interface properties and object-type properties in one page (E6). That is a consequence of L4, not a Palantir-only quirk.

**Decision state.** `supported` for the need. `undetermined` whether OS Interface also carries relationships and actions (RFC-0001 open question). Palantir interfaces include link and action constraints, which is suggestive only.

---

## L5. Traversal is over typed relationships

**Claim.** Moving from one object set to another is done by a typed relationship (link type, role, edge label, property path), not by the asker naming a foreign-key column or a join table.

**Evidence.** Palantir Search Around (E10). Cypher, SPARQL, Gremlin (E11). TypeQL relations (E12). Constitution §2 (model the world, not the source schema).

**Counterexample.** ObjectQL `expand` as batched `$in` on a lookup field (E13). SQL joins in the Cypher comparison page.

**Falsifier.** A required question that is only expressible as an ad-hoc join between properties that are not a relationship in the ontology.

**Runtime consequence.** Fan-out limits (Palantir 3 hops, 1e5 to 1e7 objects) are physical. Unbounded SPARQL `*` and Datalog recursion are semantic. OS must not treat a hop cap as a domain law.

**Decision state.** `supported`.

---

## L6. A relationship with its own lifecycle is queried as an object

**Claim.** If a relationship has identity, attributes, time, authority, or actions, queries treat it as an object (relator) that can be filtered and traversed, not only as an edge label.

**Evidence.** TypeDB `employment` owning `start-date` (E12). RFC-0001 employment example. S-006. Supply agreement in example 2.

**Counterexample.** Cypher `ACTED_IN` with only a role property and no lifecycle. Many graph edges stay edges.

**Falsifier.** A lifecycle-bearing relationship that is simpler and less ambiguous as a property-bearing edge in every query, including historical and authorization questions.

**Decision state.** `hypothesis`. Same open question as RFC-0001 Relator. This folder does not add a Relator primitive.

---

## L7. Valid time and knowledge time are query dimensions

**Claim.** "What was true then?" and "what did we know then?" are different queries. A model that only filters current properties cannot answer S-007 or financial exposure at last close.

**Evidence.** SQL:2011 application-time vs `SYSTEM_TIME` (E14). Constitution §10. Open-questions Q7. S-001, S-007. Examples 1 and 5.

**Counterexample.** Palantir object-set pages fetched this session (E15) and ObjectQL AST (E16) lack those dimensions and still ship operational products. That shows a product can defer the problem. It does not show the problem is unreal.

**Falsifier.** A reconstruction of S-007 that uses only a current snapshot and still explains both "stock as known on August 10" and "stock now believed for August 10."

**Runtime consequence.** Temporal indexes and history tables are implementation. Dual-period keys and `WITHOUT OVERLAPS` (E14) are semantic.

**Decision state.** `hypothesis` as a required query capability for OS. `supported` as a distinction in the domain and in SQL:2011. Not written into `docs/open-questions.md`.

---

## L8. Provenance participates in query meaning when authority depends on it

**Claim.** If two values can agree numerically and disagree in source, activity, or evidence, a query that cannot filter or project provenance answers a different question than the business asked.

**Evidence.** PROV-O + PROV-AQ (E17). Constitution §11. S-011. Examples 2, 3, 5.

**Counterexample.** A query language that treats provenance as an opaque log. All fetched object-set and ObjectQL pages do this. They are incomplete relative to S-011, not counterexamples that S-011 is false.

**Falsifier.** A domain in which collapsing source into the value never changes a decision, including credit, quality, and fiscal questions.

**Runtime consequence.** Provenance can be ordinary ontology facts queried with the same algebra (PROV-AQ's position). It does not need a second query language. It does need to be addressable.

**Decision state.** `hypothesis`.

---

## L9. Operational set queries and analytic reductions are different jobs over the same sets

**Claim.** Counting, summing, and bucketing consume sets and return measures. They do not replace the set. Windowing and approximate distinctness are analytic. An engine that silently changes an aggregate's meaning across backends is wrong even if both answers are numbers.

**Evidence.** Palantir aggregation caps and dataset export (E19). TypeQL `reduce` as a stream operator (E21). ObjectQL #6815 two sums (E20). TinkerPop OLTP vs OLAP note.

**Counterexample.** Forcing every bottleneck or exposure question through a warehouse cube so the operational set disappears.

**Falsifier.** A single execution contract that preserves set identity, exactness, and window semantics for every backend OS will run.

**Runtime consequence.** Bucket limits, approximate `cardinality` / `topValues`, and Spark offload are allowed as engine tactics if the query says whether it asked for exact or approximate.

**Decision state.** `supported` for the split. `undetermined` whether one expression language covers both jobs.

---

## L10. Predicates compose. Named predicates are reusable.

**Claim.** Boolean composition (`and` / `or` / `not`) and named definitions (saved set, function, rule) are required. Pasting the same `WHERE` into every surface is how meaning forks.

**Evidence.** Palantir `Filters` and `reference` sets (E22). TypeQL functions (E23). Datalog rules (E23). Examples 3 and 4.

**Counterexample.** GraphQL fragments (E24). ObjectQL has `where` composition and no named set type (E3).

**Falsifier.** A vertical in which every repeated predicate is safer when inlined than when named, including after policy and function reuse.

**Decision state.** `supported`.

---

## L11. Authorization is evaluated inside the query, at object and property grain

**Claim.** The principal is an input to read meaning. Object grain decides whether an instance is visible. Property grain decides whether a value is visible. Surfaces must not reimplement those decisions.

**Evidence.** Palantir object vs property policies (E25). ObjectQL CRUD + RLS + FLS order (E26). Constitution §15. Examples 1, 3, 5.

**Counterexample.** GraphQL / SPARQL / Cypher specs with no auth algebra (E27). Host-side hide rules that differ by surface.

**Open grain.** Link-level authorization as a primitive separate from "may see the target" is `undetermined` (E27).

**Runtime consequence.** Deny-as-absent-object, deny-as-null-property, and deny-as-error are different answers. Palantir uses the first two together. OS must pick meanings that auditors can explain. Media-set leakage in Palantir is a warning that property security does not automatically cover linked resources.

**Decision state.** `hypothesis` as a required capability. `supported` as a pattern in two operational products. Deny representation is `undetermined`.

---

## L12. Query, Function, and Policy should mention the same expressions

**Claim.** A membership or comparison that is legal in a query and different in a Function or Policy will fork business meaning. The shared core is a typed, side-effect-free expression over ontology values. Enforcement and mutation stay outside that core.

**Evidence.** Palantir Functions on ObjectSets (E28). TypeQL read-only functions (E29). RFC-0001 Function reuse list. Example 3 (dunning) and example 5 (credit block). S-003 (re-read before commit).

**Counterexample.** ObjectQL `$op` vs CEL vs validation strings (E30).

**Falsifier.** A necessary policy condition that cannot be expressed as a query Function without losing fail-closed or principal context.

**Note.** This does not answer `docs/open-questions.md` Q9. Constraint and Policy may still need native enforcement even if the boolean body is a Function.

**Decision state.** `hypothesis`.

---

## L13. Syntax and storage are not semantic primitives

**Claim.** Choosing GraphQL, TypeQL, Cypher, SPARQL, Datalog, ObjectQL, or SQL as "the" OS query language, or choosing a graph or relational engine, does not by itself satisfy L1 to L12.

**Evidence.** Thesis and RFC-0001 explicit non-decisions. ObjectQL AST members that did not execute (E20). Palantir OSv1 vs OSv2 behind one ObjectSet API (E1, E10).

**Counterexample that would reject this.** A single existing language that already satisfies L1 to L12 with fail-closed object/property auth, bitemporal query, and provenance, without host-side conventions. Not found this session.

**Decision state.** `supported` (as a negative law). Wave B runtime recommendations wait for this Wave A pressure.

---

## Decision state table

| ID | Law | State |
| --- | --- | --- |
| L1 | Query names ontology things | `supported` |
| L2 | Sets are values | `supported` |
| L3 | Static vs dynamic membership | `supported` |
| L4 | Polymorphic contract | `supported` (need) / `undetermined` (interface contents) |
| L5 | Typed relationship traversal | `supported` |
| L6 | Lifecycle-bearing relationship as object | `hypothesis` |
| L7 | Valid time and knowledge time | `hypothesis` (OS requirement) / `supported` (distinction) |
| L8 | Provenance in query meaning | `hypothesis` |
| L9 | Operational vs analytic | `supported` (split) |
| L10 | Composable named predicates | `supported` |
| L11 | Auth in the query at object and property grain | `hypothesis` |
| L12 | Shared expressions with Function and Policy | `hypothesis` |
| L13 | No syntax or store choice | `supported` |

Nothing in this table is `accepted`.
