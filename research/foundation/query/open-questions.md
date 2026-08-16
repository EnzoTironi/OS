# Open questions

**Kind:** unresolved uncertainty.  
**Decision:** `undetermined` unless a row says otherwise.  
**Rule:** none of these rows are written into `docs/open-questions.md`. Cite that file when the question already lives there.

---

## Q-query-1. Is query semantics part of the language or the toolchain?

**Already asked.** `docs/open-questions.md` Q15.

**What this folder adds.** L1 to L12 are semantic. They constrain whatever later authors a syntax or a compiler. They do not decide whether a query compiler is a visible OS concept. RFC-0001 still excludes Compiler as a primitive.

**Decision state.** `undetermined`. Do not invent an answer.

---

## Q-query-2. Must every fact carry valid time and knowledge time?

**Already asked.** `docs/open-questions.md` Q7.

**What this folder adds.** SQL:2011 allows at most one application-time period and one `SYSTEM_TIME` period per table, and it allows tables with only one of them. Palantir object-set reads fetched this session are current-state plus optional snapshot paging. S-007 and example 5 need both dimensions. Whether *every* OS fact carries both is still open.

**Decision state.** `undetermined`.

---

## Q-query-3. Is provenance a query dimension on every read, or only when authority depends on it?

**Already asked.** `docs/open-questions.md` Q8.

**What this folder adds.** PROV-AQ treats provenance as ordinary SPARQL-able data, not a special operator. Constitution §11 is conditional ("when decisions depend on it"). L8 follows the conditional reading. A later kill test should try a domain where attaching provenance to every read makes ordinary operational queries unreadable.

**Decision state.** `undetermined`.

---

## Q-query-4. Does Interface carry relationships and actions, or only properties?

**Already asked.** RFC-0001 Interface open questions. `docs/open-questions.md` Q2.

**What this folder adds.** Palantir interfaces include interface properties, link type constraints, and action type constraints. OSS aggregation-by-interface and interface link types were still in development on 2026-08-16. GraphQL interfaces are fields only. TypeDB roles are relation interfaces, not Palantir-style interfaces.

**Decision state.** `undetermined`. L4 only requires *a* shared contract.

---

## Q-query-5. Is link-level authorization a primitive?

**New in this folder.** Not a restatement of an existing numbered open question.

**Claim to test.** "Principal P may traverse relationship R" might collapse to "P may see both endpoints" or "P may see the relator object." Palantir documents interface link types as in development. ObjectQL inherit the target object's row and field rules. No fetched spec defines a third grain that is not object or property.

**Falsifier.** A required case where seeing both objects is allowed and walking the link is not, or the reverse, that cannot be modeled by a relator object plus object/property policy.

**Decision state.** `undetermined`. Do not open a GitHub issue until a domain example survives that falsifier. Issue #13 already lists the grain. A new issue would be a restatement.

---

## Q-query-6. Deny-as-absent, deny-as-null, or deny-as-error?

**New in this folder.**

Palantir hides the object on object-policy failure and returns null on property-policy failure. ObjectQL strips the field. Neither page fetched this session treats deny-as-error as the default read behavior.

Agents that treat null as "the property is unknown" will mis-read a forbidden property. Agents that treat a missing object as "it does not exist" will mis-read a forbidden object.

**Related.** `docs/open-questions.md` Q3 (what truth means when sources disagree) and Q6 (what is mutable state). Those questions are about facts. This one is about authorized views of facts.

**Decision state.** `undetermined`.

---

## Q-query-7. One expression language for query, Function, Constraint, and Policy?

**Already asked.** `docs/open-questions.md` Q9.

**What this folder adds.** Palantir Functions share ObjectSet algebra with reads. TypeQL functions *are* read-only queries. ObjectQL uses three dialects. L12 is `hypothesis`. Enforcement semantics (fail-closed policy, constraint phases) may still require native forms even if the boolean body is shared.

**Decision state.** `undetermined`. Not answered here.

---

## Q-query-8. May a set contain more than one object type without an interface?

**New in this folder.**

Palantir `ObjectSet<T>` is single-type. Cross-type work uses Search Around or `interfaceBase`. TypeQL and SPARQL bind heterogeneous variables in one pattern. Datalog relations have a fixed tuple type.

**Pressure.** Example 5 (exposure) wants parties, shipments, and reservations in one *question*. That can be one heterogeneous set, or three typed sets plus a function that aggregates them.

**Decision state.** `undetermined`. Prefer the smaller claim (typed sets plus functions) until a counterexample forces a heterogeneous set primitive.

---

## Q-query-9. Are unbounded recursive paths a semantic requirement?

**New in this folder.**

SPARQL `*` / `+`, Datalog recursion, TypeQL recursive functions, and Gremlin `repeat` exist. Palantir caps Search Around depth and size. Lot recall (S-008), guarantee chains (example 5), and routing predecessors (example 4) look recursive.

**Falsifier.** Every required OS path question has a known small bound that can live in the ontology as an explicit hop list.

**Runtime consequence.** Unbounded recursion is expensive. That is not by itself a semantic no.

**Decision state.** `hypothesis` that some domains need recursion. `undetermined` whether the kernel must offer a general transitive-closure operator.

---

## Q-query-10. How do query results pin ontology revision?

**Already asked.** `docs/open-questions.md` Q19. Scenario S-012.

**What this folder adds.** Palantir load accepts experimental `branch` and `transactionId`. That is a product handle on "read this snapshot," not a content-addressed ontology revision. A query used to justify an Action (S-003, S-012) may need to pin the definitions it ran under.

**Decision state.** `undetermined`. Belongs to the revision track. Recorded here because query is a consumer.

---

## Q-query-11. What would falsify first-class sets?

If Wave C finds that every surviving vertical only ever needs a single page of objects, never consumed by a later Action, Function, or named set, L2 should move to `rejected`. No such vertical was found in this session.

---

## Questions this folder must not answer

These remain the property of `docs/open-questions.md` and RFC-0001. This folder only cites them.

- What is the primary artifact? (Q1)
- What is the smallest semantic core? (Q2)
- What is an Action? (Q4)
- Is Fact fundamental? (Q2, RFC-0001)
- What is the right physical data model? (Q18)
- Is there a compiler? (Q17)
- Build from scratch or reuse a query engine? (Q21)

Reuse of SPARQL, TypeQL, or an object-set service is a Wave B question. Standing order 7. Wave B waits for this Wave A pressure.
