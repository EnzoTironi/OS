# Wave B execution — derived from Wave A

**Status:** research execution map, not architecture.  
**Wave A evidence pin:** `research/wave-a-2026-08-16` @ `53235fc5b8fb723e84351435ccfad719e784d5ba`.  
**Research graph:** issue #75 / `research/graph/`.  
**Adversarial review:** `research/reviews/wave-a-review-ledger.md` + `wave-a-resolution-overrides.md`.

Wave B must consume Wave A **pressure**, not inherit every candidate-law verdict. Where a Wave A artifact says `supported/rejected` but the adversarial ledger says `challenged`, the challenge wins until resolved.

## Why the order changed

The original backlog intentionally delayed runtime/toolchain research until semantic pressure existed. Wave A now gives us that pressure. The highest-information-gain questions are no longer “which database?” or “which workflow engine?” They are:

1. how messy external evidence becomes typed identity/observation without inventing truth;
2. what atomic commit means when approvals, constraints and concurrent state interact;
3. how an external side effect can be attempted, become ambiguous, and later reconcile;
4. how authority/delegation binds human, agent, task and workload to the exact operation;
5. how semantic composition avoids one overloaded global vocabulary without prematurely assuming federation;
6. only then, which persistence/runtime mechanisms preserve those contracts.

## Wave B0 — boundary contracts first

Run these first, with independent agents where possible.

### P0. #45 ingestion + entity resolution

Wave-A pressure:

- HF reality check: successful string joins did not prove identity; 38 auto repairs included low-confidence cases and ambiguous suffix semantics.
- Product / SKU / marketplace listing have different lifecycle/multiplicity.
- snapshots and source assertions must be representable without fabricated event history.
- source authority is per statement/action/context, not one file per entity.
- Odoo/ERP comparisons demonstrated version/source provenance matters.

Must answer:

- representation of source identity vs candidate business identity;
- Observation/Assertion/Binding-candidate semantics without presupposing those as base sorts;
- deterministic and probabilistic/entity-resolution proposal boundaries;
- confidence/evidence/provenance and human/agent adjudication;
- merge/split/rebinding history;
- source row/document vs occurrence vs projection;
- schema drift and source-version binding;
- how imports can be non-authoritative while still queryable;
- how reconciliation works when later evidence invalidates a binding.

Kill test: prove whether the same requirements can be expressed without a generic `Fact/Observation/Binding` primitive.

Do **not** design an ETL framework or choose a vector database first.

### P0. #40 transaction / commit / concurrency semantics

Wave-A pressure:

- named business Action is not the universal persistence API;
- Action/attempt, occurrence, observation and external outcome remain distinct;
- approval must bind an exact proposal plus a declared state/temporal basis;
- `always reread current state` is too strong: live-at-commit and frozen-snapshot contracts both exist;
- inventory/reservation/accounting domains require atomic invariants under concurrency;
- ontology revision identity matters for historical explanation.

Must answer:

- candidate lifecycle: propose/preview/authorize/approve/revalidate/commit without assuming all stages are universal;
- optimistic version/CAS vs serializable transaction vs predicate locks vs other mechanisms;
- which assumptions must be bound into a proposal/witness;
- how commit handles stale live assumptions versus deliberately frozen snapshots;
- constraint/invariant enforcement and all-or-nothing multi-object effects;
- Action idempotency at the business-operation boundary;
- ontology/policy/function revision binding;
- cancellation/correction after commit versus transaction abort before commit.

Kill test: find business decisions that cannot be represented by the proposed commit contract without special source-shaped exceptions.

### P0. #41 external effects / unknown / reconciliation

Wave-A pressure:

- marketplace/integration state can diverge with poor logs;
- `timeout == failure` is invalid;
- safe retry with the same idempotency contract may be correct;
- authorization request ≠ external legal outcome (Brazil fiscal is a concrete case);
- an external authority can create meaning OS does not own;
- semantic duplication kill rejected untracked dual authority, not read-only replication.

Must answer:

- Effect intent/attempt/transport acknowledgement/domain outcome/observation/reconciliation distinctions;
- exact conditions for `unknown`/indeterminate outcome;
- idempotency-key scope and replay contract;
- query-before-retry, reconcile-before-compensate, compensation semantics;
- webhooks/callbacks versus authoritative read-back;
- externally authoritative outcome versus OS-owned decision;
- eventual confirmation, contradiction and dispute;
- durable provenance linking Action/proposal → external request → observations/outcome;
- what can safely be retried automatically by agents.

Do not require a literal `Effect` base sort or literal `unknown` enum; derive the semantic requirement first.

## Wave B1 — authority + composition

### P1. #42 authorization / delegation / principal model

Wave-A pressure:

- Human, software agent, delegator, workload and task grant are separable;
- authority generally governs which evidence/decision may drive an Action, not metaphysical truth;
- GRC objects are not the same thing as request-time allow/deny;
- SOD, thresholds, exceptions and hard invariants have different consequence patterns;
- agent authority needs task/session/resource/time scoping.

Compare Cedar, OpenFGA and other primary models against scenarios, not feature lists. Test whether one system suffices before composing two.

Must cover revocation, delegation chains, subagents, approval authority, service/workload identity, contextual conditions, SoD, deny/fail-closed behavior, audit witness and proposal/commit re-authorization.

### P1. #63 composition / reuse of ontology definitions

Wave-A pressure:

- kill test #55 rejects an **unscoped overloaded global vocabulary**, not necessarily one ontology;
- Party/Role, Product/Offer/BOM/valuation, HR/CRM/fiscal contexts need scoped meaning;
- `Pack` is not a proven business primitive;
- client/country/industry specificity must not leak into engine code;
- cross-artifact lexical equality is unsafe.

Competing hypotheses to test:

- one ontology + namespaces/modules;
- interfaces/traits/capabilities;
- contextualized/scoped types;
- imports/dependency graphs;
- federated context ontologies with explicit correspondence;
- another composition model.

Required cases: same Party in customer/supplier/employment contexts; same product specification across selling/manufacturing/accounting; Brazil legal extensions; cross-company variants; cross-industry SaaS/insurance/care examples.

Do not conclude federation from DDD, OWL imports, GraphQL Federation or data mesh analogies alone.

## Wave B2 — persistence and execution mechanisms

### P2. #39 storage / temporal persistence

Only start recommendations after #45/#40 contracts are available.

Wave-A pressure:

- universal semantic bitemporal rectangles are over-generalized;
- system time ≠ organizational knowledge time;
- current state may be an observed snapshot when event history is missing;
- transaction/ledger history is domain-specific;
- physical storage may retain broad system history even when semantic types expose only selected clocks;
- replicas/materialized views are valid when authority/provenance remains explicit.

Compare relational/temporal/document/graph/event-log and hybrid strategies by competency requirements. Do not let XTDB/Datomic/Postgres/event sourcing define the semantics.

### P2. #43 durable process / orchestration

Wave-A pressure:

- Workflow was not proven a base semantic sort;
- long-running processes absolutely exist;
- external effects can be ambiguous;
- retries/compensations need operation-specific idempotency semantics;
- standing obligations/commitments can outlive one process execution.

Compare Temporal and alternatives as **process-memory mechanisms**, not business authority. Separate business Process/Commitment semantics from orchestration state.

### P2. #47 safe code/function/agent execution

Wave-A pressure:

- deterministic business Functions/Constraints can be ontology semantics;
- agents/non-deterministic models may advise or reason where appropriate;
- specialized physical evaluators may exist without becoming second business authorities;
- external authorities need not compile OS definitions;
- domain code must not leak into generic engine source.

Test WASM/sandbox/process/container/capability models, deterministic resource limits, network/effect separation, version pinning, replay and provenance.

### P2. #46 formal verification / invariant checking

Consume the executable fuzz tooling from #51. Determine which claims need:

- type checking;
- constraint solving/SMT;
- model checking;
- property-based/semantic fuzzing;
- differential tests;
- transaction isolation litmus tests;
- static dependency/effect analysis.

Do not promise formal proof for semantics that depend on external law/human classification.

## Wave B3 — observability, surfaces, analytics and scale

### P3. #49 causal observability / debugging

Must answer `why is current state X?`, `why was this Action allowed?`, `what external outcome is still unknown?`, and `which source/binding/rule revision produced this projection?` without assuming every answer is replay from events.

### P3. #44 generated surfaces / UI / API / MCP

Wave A supports “same semantic business operation across surfaces,” not necessarily one literal endpoint/runtime call. Validate:

- UI forms/views;
- APIs/SDKs;
- MCP/tool descriptors;
- human confirmation/preview;
- field/read policies;
- progressive disclosure;
- agent tool descriptions;
- how surfaces avoid exposing generic CRUD write bypass.

MCP remains a transport/surface, never the domain primitive.

### P3. #66 analytics / metrics

Use sales/cost/inventory/reporting reality-check pressure. Distinguish metric definition, dimensions, effective versions, data quality, projection/as-of semantics and operational Action inputs. Do not create a second semantic layer that contradicts the operational ontology.

### P3. #48 scale / distribution

Run after semantic/runtime contracts are concrete. Measure what needs to scale: object count, temporal history, relationship traversal, subscription/change fanout, Action throughput, audit/provenance, multi-tenant isolation, agent queries. Avoid distributed-systems architecture by prestige.

## Wave B4 — authoring/toolchain and AGI product behavior

### #64 language/authoring model

Derive from surviving semantics and composition. Compare code-first, declarative schema, typed DSL, AST/model APIs and agent-generated definitions. Human readability, structural diffs, stable IDs, refactoring and versioning matter more than syntax aesthetics.

### #65 compiler / interpreter / generated artifacts

Compiler remains an implementation hypothesis, not business semantics. Test mixed strategies: interpreted metadata, generated validators/SDKs/UI/tools, AOT query/index plans, codegen, caches/materializations. One definition must not drift into several manually maintained business contracts.

### #52 self-evolving ontology

Must operate through proposals/diffs/tests/migrations/compatibility analysis; no agent silently mutates accepted ontology. Use #9 revision evidence + #51 fuzzing + #75 graph. Separate research hypothesis generation from governance adoption.

### #53 agent operating model

Consume #42/#40/#41. Define actor/delegator/task/workload/grant/action/evidence boundaries. Test subagents and revocation. Agent-native means first-class identity and typed tools—not agent-controlled business truth.

### #54 generated applications

Consume #44/#64/#65. Test whether ontology definitions can generate useful human/agent surfaces without embedding app-specific semantics back into engine core.

## Gate before #70

Do **not** start metamodel v1 synthesis because a calendar says Wave B is done. #80 should evaluate:

- are high-risk semantic boundaries executable/testable?
- can ingestion preserve ambiguity without source-shaped duplication?
- is commit/external-effect behavior precise under concurrency/failure?
- can authorization/delegation express humans + agents safely?
- has composition reduced the global-vocabulary problem?
- can storage/runtime requirements now be stated without choosing semantics by technology?
- do major challenged Wave A laws have bounded resolutions or explicit uncertainty?
- can the first vertical be expressed without hidden ERP/source exceptions?

Only then should #70 propose a metamodel hypothesis v1, and it remains a proposal rather than an accepted architecture.
