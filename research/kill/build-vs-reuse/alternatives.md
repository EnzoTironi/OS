# Architecture alternatives

**Kind:** explanation.  
**Decision:** ranking is `hypothesis` except where a row says otherwise.  
**Mode:** understanding. This is not a Wave B shopping list.

Rank is semantic quality for a greenfield OS. Lines of code do not move a row. Integration architectures for companies that already run an ERP can differ. Those are not the ideal core.

## Ranked list

### A1. Own the semantic core. Reuse only replaceable mechanism

**Rank.** 1.  
**Decision.** supported as the current quality winner.

OS owns types, actions, events or facts, functions, constraints, policy meaning, time, and provenance. ERPNext, Odoo, Moqui, Palantir, Open Foundry, ObjectStack, Ontologiq, REA, ValueFlows, PROV, EPCIS, and ISA-95 are corpora. Temporal, Cedar, OpenFGA, XTDB, a ledger store, and a solver may appear later as workers behind L-001 through L-004. No worker is selected here.

**Why it wins.** It is the only alternative that satisfies E-001, E-002, and L-003 at once. It keeps "build it ourselves" for the part that existing products get wrong. It still allows reuse where AGI does not buy correctness, such as replay, Allow or Deny evaluation, and append-only transfers.

**What it inherits.** Only the constraints of engines that later pass the boundary test. Nothing yet.

### A2. Own the semantic core and build every mechanism too

**Rank.** 2.  
**Decision.** hypothesis.

Same core as A1. Durability, policy evaluation, temporal indexes, and ledger enforcement are also written in-tree.

**Why it is worse than A1.** Question 21 says reimplementing solved infrastructure with no semantic benefit is not the goal. Cedar's default-deny and forbid-wins are specified. Temporal's replay contract is specified. TigerBeetle's immutability is specified. Recreating those without a semantic gain spends AGI on the wrong layer.

**When A2 beats A1.** A candidate engine cannot be wrapped without importing skip-on-error, commit-then-notify, or a second chart of accounts, and no other engine exists. Then build the mechanism.

### A3. Ontologiq as the mutation protocol, OS as ontology and write authority

**Rank.** 3.  
**Decision.** rejected as a product core. supported as a pattern donor.

Steal propose, hashed arguments, revalidate, and `unknown`. Do not adopt the warehouse-as-truth runtime. Sibling issue 36 already recorded the pattern.

**Why it loses to A1.** Early maturity. No valid-time store. Writes live elsewhere. Using it as the core recreates H1 with a DuckDB warehouse instead of an ERP.

### A4. Moqui plus Mantle as the enterprise runtime

**Rank.** 4.  
**Decision.** rejected as a core. supported as a corpus.

CC0 is the friendliest grant in the ERP-shaped list. Services are named verbs. Party versus role and AssetDetail versus quantity are real domain evidence.

**Why it loses.** Entity, Service, Screen, implicit CRUD, XML Actions, and SECA become the metamodel. Mantle UDM becomes a second ontology. The framework is pre-agent. Sibling issue 34 already separates Action-like services from invented CRUD.

### A5. Open Foundry or ObjectStack as the ontology runtime

**Rank.** 5.  
**Decision.** rejected as a core.

Shared object-link-action vocabulary is commodity (E-020). Open Foundry commits then notifies (E-008). ObjectStack can elevate inside a shared Action (E-010). Both are younger or more application-shaped than the OS thesis needs.

**Why they stay on the list at all.** They are inspectable Apache-2.0 donors for surfaces and action manifests. Steal tests, not the executor.

### A6. Compose an operational ontology over ERPNext

**Rank.** 6.  
**Decision.** rejected as the greenfield architecture. still plausible as an integration architecture.

This is H1. Two authorities for Product, Order, Action, and permissions. GPL on the ERP side. Form lifecycle under the ontology.

**Why it exists.** Real companies already have an ERP. A greenfield OS that starts here freezes the wrong primary artifact.

### A7. Fork Frappe and ERPNext into the Business OS

**Rank.** 7.  
**Decision.** rejected.

This is H3. Frappe MIT is tempting for metadata UI. ERPNext GPL and DocType lifecycle are not. Submit and cancel are useful verbs trapped inside a row machine (E-003, E-004).

### A8. Temporal as the business process or entity kernel

**Rank.** 8.  
**Decision.** rejected as a core. undetermined as a durability worker.

Workflow-as-code becomes the ontology. Event History collides with Event. Activities retry, so timeout is not `unknown`. Entity Workflow stores order state in Workflow variables (E-011, E-012). RFC-0001 already refuses Workflow as a primitive until evidence requires it.

**Hard-to-recreate benefit.** Multi-year replay, worker failover, and deterministic command journals. Keep that class. Do not keep Workflow Type as ObjectType.

### A9. OpenFGA as the relationship and authorization ontology

**Rank.** 9.  
**Decision.** rejected as a core. hypothesis as a check projection.

Stored tuples are a second graph. Employment, ownership, and membership would live twice unless OS is the only writer and OpenFGA is derived.

Cedar ranks above OpenFGA as a worker because Cedar does not require a stored relationship world. It evaluates PARC against supplied entities.

### A10. XTDB, a graph store, or TigerBeetle as the metamodel

**Rank.** 10.  
**Decision.** rejected as a metamodel. undetermined as storage.

XTDB rows are not Facts with provenance and contradiction (E-015). Graph stores are not Actions (E-018). TigerBeetle transfers are not journal entries with OS accounts (E-016). Each can be a later physical engine if L-002 holds.

## How to read the ranking

A1 is the only alternative that can still host A3's protocol, A8's durability, A9's check API, and A10's store without changing ontology types. The others bake a vendor noun into the core.

If Wave A later produces the X-006 corpus, this ranking should be redone. Until then, "build the core" wins on quality.
