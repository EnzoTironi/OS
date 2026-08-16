# Candidate metamodel laws

**Issue:** #70  
**Decision vocabulary:** `supported`, `hypothesis`, `rejected`, `undetermined`. Nothing here is accepted merely by being listed.

## L-META-01 — semantic form and runtime capability are different categories

A concept can require privileged runtime enforcement without becoming a separate semantic base sort.

**State:** `supported` by #40–#43/#47 pressure.  
**Consequence:** effects, orchestration, authorization and transaction enforcement can have native runtime boundaries while their business records remain ordinary typed compositions.

## L-META-02 — domain type and metamodel sort are different categories

`Commitment`, `Claim`, `Agreement`, `Process`, `Employment`, `Grant`, `Observation` and similar concepts may be first-class ontology Types without requiring a new kernel sort.

**State:** `supported`.

## L-META-03 — donor vocabulary does not prove irreducibility

A construct earns base-form status only when smaller composition loses meaning, enforcement or explanation and repair recreates the construct.

**State:** `supported` by issue #70 contract / constitution.

## L-META-04 — Type remains required

A generic engine needs explicit type/equality/identity semantics rather than reconstructing them from arbitrary Facts/queries.

**State:** `supported` by Wave A identity/fact kill tests.  
**Falsifier:** a smaller relational/fact calculus enforcing entity identity, value equality, type conformance and merge/split rules without hidden type machinery.

## L-META-05 — entity identity and value equality are distinct type-system semantics

Money/Quantity/DateInterval values should not gain independent lifecycle identity by default; an Organization/Product can change while remaining the same entity.

**State:** `supported`; exact Type-subcategory encoding remains `hypothesis`.

## L-META-06 — Property need not be a base semantic sort

A scalar characteristic can be modeled as a typed Relation from owner to value with enforceable cardinality and value-type semantics.

**State:** `hypothesis`, executable K70-04/06 evidence in this branch.

## L-META-07 — Link need not be a base semantic sort distinct from Relation

A cheap association among identifiable entities can use the same typed Relation algebra as scalar attributes while preserving endpoint identity.

**State:** `hypothesis`.

## L-META-08 — relationship-with-lifecycle becomes an ordinary entity before it becomes a native Relator sort

When a relationship carries attributes, Actions, independent validity or references, model it as an identifiable Type plus participant Relations.

**State:** `supported` as a pattern; native Relator remains `rejected` on current evidence.

## L-META-09 — Interface is shared shape/capability, not Role or identity

Interface-like contracts may remain valuable for static polymorphism without defining a separate identity principle or anti-rigid business Role.

**State:** `supported` distinction; whether Interface deserves a base form remains `undetermined` leaning contract.

## L-META-10 — structural/nominal conformance may be a Type-system contract rather than a base semantic sort

If Type definitions can declare/verify required Relation/Action/Computation signatures consistently across tools, Interface can be demoted.

**State:** `hypothesis`.

## L-META-11 — Action and occurrence are never collapsed

Attempting/deciding to intervene does not prove that the intended world occurrence happened.

**State:** `supported` across REA/ValueFlows, ERP patterns, #41 and prior kill tests.

## L-META-12 — Event as an unenforced Type tag is rejected

A mutable Type with `event=true` cannot protect accounting/inventory/history correction semantics.

**State:** `rejected` reduction; executable unsafe mutant retained as sensitivity evidence.

## L-META-13 — Event may reduce to Type + an inescapable occurrence/lifecycle contract

If every exported authoritative mutation path enforces create-only/append-correction semantics generically, a separate Event base sort may be unnecessary.

**State:** `hypothesis`, newly reopened by Wave B commit/lifecycle enforcement.  
**Critical falsifier:** any legitimate generic/admin/import mutation path can bypass the lifecycle contract.

## L-META-14 — Event demotion does not demote occurrence meaning

`Occurrence/Event` remains a visible semantic contract/nature even if it is not a distinct storage/metamodel sort.

**State:** `hypothesis`.

## L-META-15 — reusable computation remains distinct from authoritative mutation

A versioned typed computation can derive/plan/decide without direct commit capability.

**State:** `supported` boundary; exact computation subkinds remain open.

## L-META-16 — purity/capability is enforced, not descriptive metadata

A computation declared non-mutating cannot call authoritative mutation/external write capabilities through a hidden path.

**State:** `supported`; reference model enforces by sensitivity snapshot.

## L-META-17 — solver/search is not automatically a separate semantic base form

Search result algebras (`unsat`, feasible, bound, optimal) can potentially be a declared Computation execution class/runtime capability.

**State:** `undetermined` leaning `hypothesis`.

## L-META-18 — agent judgment is not automatically a separate semantic base form

Typed uncertain/model-provenanced judgment can potentially be a Computation execution class, but it cannot silently become a non-waivable invariant/authority decision.

**State:** `hypothesis`.

## L-META-19 — Constraint and Invariant need not be base sorts if RuleBinding is first-class and inescapable

Their irreducible semantics are obligation, locus, dependency/basis, failure/error algebra and mandatory enforcement—not the fact that the evaluator returns Bool.

**State:** `hypothesis`; Action-local guards remain rejected.

## L-META-20 — Policy is not `Function<Bool> + failClosed`

Authority evaluation can have `Permit/Deny/Error`, combination rules, determining evidence/model revisions, currentness and specialized relation evaluation.

**State:** `supported` rejection from Wave A/#42.

## L-META-21 — Policy may be a standard authority RuleBinding rather than a base sort

If a generic RuleBinding can reference a typed PDP/decision evaluator while preserving currentness, combination/error semantics and explanation, no separate Policy sort is required.

**State:** `hypothesis`.

## L-META-22 — preview/commit/effect loci are semantic enforcement metadata

Passing one locus never implies another passed. A binding may also deliberately use current, pinned, immutable or as-of basis.

**State:** `supported` by #40/#42/#43.

## L-META-23 — RuleBinding is a candidate base executable form, not final vocabulary

A reusable evaluator is insufficient unless the engine knows where/why/how it is mandatory. Making this link explicit repeatedly survives policy/constraint/invariant reduction.

**State:** `hypothesis`.  
**Falsifier:** encode bindings as ordinary Type/Relation metadata and provide identical static/runtime guarantees without a special interpreter branch; then demote RuleBinding too.

## L-META-24 — Action is a strong candidate base executable form

Stable invocation/intent identity, actor context, StateBasis, authority, atomic commit, replay/mismatch and causal outcomes form one generic attempted-intervention protocol.

**State:** `supported` as required behavior; base-sort status remains `hypothesis` until the composition attack finishes.

## L-META-25 — removing the Action name without removing its protocol is not reduction

`Computation + MutationPlan + operationId + actor + StateBasis + authority + commit + replay` is an Action/Operation contract under another name.

**State:** `supported` methodological law.

## L-META-26 — Projection is derivation plus materialization, not a base business sort

A derived query/computation can be cached/materialized under lineage, revision and freshness semantics; authority depends on declared StateBasis, not storage convenience.

**State:** `supported` as a reduction hypothesis by #39; no primitive pressure yet.

## L-META-27 — semantic Effect sort remains unearned

External I/O requires a native privileged capability, while request/attempt/observation/outcome identities can be ordinary typed records.

**State:** `hypothesis` strengthened by #41 M-E2.

## L-META-28 — Workflow remains runtime execution memory

Durable timer/signal/replay/cursor state does not define business Process/Commitment completion.

**State:** `supported` by #43.

## L-META-29 — Fact-only kernel remains rejected

Stable entity identity, Action attempt semantics and mixed current/snapshot/occurrence knowledge should not all be forced into one universal Fact atom.

**State:** `rejected` strong core.

## L-META-30 — Fact as a standard statement/evidence contract remains undetermined

Cross-source rival assertions may justify a reusable Statement/Fact form even if it is not the universal information atom.

**State:** `undetermined`.  
**Falsifier for demotion:** ordinary evidence Types/Relations repeatedly require bespoke subject/predicate/value/provenance/query machinery that is semantically identical across domains.

## L-META-31 — Observation can be ordinary immutable evidence with a standard contract

The engine needs to preserve source identity/provenance/assurance/unresolved state, not necessarily an Observation base sort.

**State:** `hypothesis` from #45.

## L-META-32 — Process/Intent/Commitment/Claim/Agreement stay domain semantics

They can be highly reusable domain ontology Types without requiring generic kernel behavior for every instance of OS.

**State:** `supported` against `Workflow` promotion; domain-library design remains later work.

## L-META-33 — Role/Phase/Relator stay patterns until composition fails in more than one domain

Shared shape, anti-rigid classification, relationship identity and phase constraints are distinct concepts; none currently requires its own engine storage sort.

**State:** `supported` by issue #3/#56.

## L-META-34 — Proposal/Approval are optional governance records

Some Actions commit directly. Where present, Proposal/Approval bind intent/basis/actors and remain auditable without becoming universal Action stages.

**State:** `supported` by #40.

## L-META-35 — StateBasis behavior is required; StateBasis sort is not yet earned

Every high-impact commit must declare the live/pinned/as-of dependencies that matter, but those can potentially be Action/RuleBinding transaction metadata.

**State:** `supported` capability / `undetermined` sort.

## L-META-36 — CommitWitness behavior can be an audit graph/materialization

Operations need reconstructable causal evidence, but a single mandatory CommitWitness business object is not yet justified.

**State:** `hypothesis`.

## L-META-37 — time axes are concept-specific, not universal two-clock properties

Occurrence/effectivity/capture/provider/commit/workflow times stay semantically named where they exist. Physical bitemporality does not promote them everywhere.

**State:** `supported` by #39/#45.

## L-META-38 — provenance is cross-cutting but not automatically a universal Fact row

Source/actor/derivation/evidence must be expressible and enforceable where authority/explanation requires it.

**State:** `supported` requirement; exact generic representation remains `undetermined`.

## L-META-39 — storage, orchestration and surfaces cannot manufacture semantic forms

SQL rows, graph nodes, Kafka records, workflow tokens, UI controls, SDK methods and MCP tools are physical/runtime/surface representations of semantic definitions, not evidence of new business primitives.

**State:** `supported`.

## L-META-40 — R5 is rejected if a deleted form is recreated only in hidden runtime code

Minimal syntax is not minimal architecture. A reduction counts only when semantics **and** enforcement compose from visible generic forms/capabilities.

**State:** `supported` methodology.
