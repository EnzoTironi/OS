# Open questions — intentionally unresolved

**Status:** living research agenda.  
**Decision:** none.

This document exists to prevent the leading thesis from quietly becoming architecture by repetition.

The questions below are not blockers to all implementation. They are the places where OS currently has the most leverage — and the most risk of freezing the wrong abstraction.

## 1. What is the primary artifact?

Current leading hypothesis:

> the primary artifact may be an executable ontology of an organization.

But alternatives remain possible:

- an executable ontology plus a distinct process/economic model;
- a service-oriented business language;
- a fact/event model from which ontology views are derived;
- another abstraction not yet discovered.

Falsification question:

> Is there an important enterprise behavior that becomes unnaturally complex when forced into one executable ontology but simple in a different primary abstraction?

## 2. What is the smallest semantic core?

We currently suspect some subset of:

```text
Type / ObjectType
Interface
Property
Relationship
Action
Function
Constraint
Policy
Event
Fact
```

But every item is provisional.

Questions:

- Is `ObjectType` too broad?
- Are enduring objects and events different ontological natures?
- Are roles and phases native categories or patterns over types/relationships?
- Is `Relator` necessary, or can a relational entity be expressed as an ordinary object with constrained links?
- Is `Fact` fundamental or merely one representation?
- Is an `Interface` only structural, or can it carry actions/relationships/capabilities?

## 3. What does "truth" mean when sources disagree?

A greenfield OS may own operational truth directly, but it must still ingest humans, sensors, documents, external systems, marketplaces, fiscal services, and legacy software.

Questions:

- Do we distinguish Observation, Claim, Assertion, Accepted Fact, Derived Fact?
- Is accepted operational state necessary, or can correct domain modeling eliminate most apparent disagreement?
- How does provenance affect authority?
- Can two contradictory claims both remain first-class without forcing an immediate winner?
- What does correction mean when a previously accepted fact was wrong?
- How is identity reconciled across sources?

Important caution:

Many apparent conflicts are actually collapsed concepts. `requestedDate`, `promisedDate`, `plannedDate`, and `actualDate` should not compete for one field merely because source systems call all of them `delivery_date`.

## 4. What exactly is an Action?

`Action` currently looks like one of the strongest primitive candidates.

Questions:

- Does every meaningful mutation require a named Action?
- Is low-level administrative CRUD permitted, and under what semantics?
- Is Action an intent, command, decision, capability, or all of these with separate stages?
- Does an Action have a preview/proposal stage distinct from commit?
- Must approval bind the exact parameters, ontology revision, policy revision, and assumptions?
- Must commit always re-read/revalidate state after approval?
- How are concurrent Actions serialized or reconciled?

## 5. Action versus Event versus Effect

Working distinction:

```text
Action = attempted/authorized intervention
Event  = occurrence
```

But external reality adds a third problem.

If OS calls an external service and loses the response:

```text
not confirmed
!=
failed
```

Questions:

- Do we need a first-class Effect concept, or is it an Action execution record plus later observations?
- How is `unknown` represented?
- When is retry safe?
- What constitutes reconciliation?
- Can one Action produce many business Events and many external effects?
- How do irreversible effects change cancellation semantics?

## 6. What is mutable state?

We suspect much current state should be explainable as a projection over durable history, but pure event sourcing is not assumed.

Questions:

- Which properties are legitimate mutable facts?
- Which are derived projections?
- Is `status` usually a stored decision or a function of other facts/events?
- Can current state always be reconstructed sufficiently for audit?
- What history is semantically required versus operationally optional?

## 7. Is bitemporality fundamental?

Potential dimensions:

```text
valid time      — when something was true in the modeled world
system/known time — when OS knew/recorded it
```

Questions:

- Must every fact carry both dimensions?
- Are event timestamps different from validity intervals?
- How are late and backdated corrections represented?
- Can we answer both "what was true then?" and "what did we believe then?"
- What are the storage/performance consequences, and can they remain implementation details?

## 8. How fundamental is provenance?

Potential concerns:

```text
source
actor
activity
derivation
evidence
confidence
```

Questions:

- Is provenance attached to every Fact/Event/Action, or to derivation graphs?
- Can a derived fact cite exactly which prior facts/functions produced it?
- Does provenance participate in policy/authority decisions?
- Do we need uncertainty/confidence in the core model?
- Which concepts from W3C PROV-O should be reused semantically versus merely mapped for interoperability?

## 9. Function, Constraint, Policy — one thing or three?

A tempting simplification is:

```text
Constraint = Function<Context, Bool> + enforcement semantics
Policy     = Function<Principal, Action, Resource, Context, Bool> + fail-closed enforcement
```

Questions:

- Does this lose important meaning?
- Are deterministic, probabilistic, optimization, and agentic computations all `Function` variants?
- Can a function depend on external state and still be reproducible?
- How are function versions pinned to historical decisions?
- Should policies and constraints have special language/runtime restrictions even if mathematically functions?

## 10. Where may nondeterminism exist?

AGI should be used where judgment adds value, but not where business invariants require guarantees.

Questions:

- Can agent reasoning be represented as a typed function with uncertainty/provenance?
- What may an agent propose versus commit autonomously?
- How are probabilistic outputs converted into governed business Actions?
- How do we prevent prompt/runtime behavior from becoming hidden business logic?

## 11. What are actors and principals?

Potential model:

```text
Person            implements Actor, Principal
SoftwareAgent     implements Actor, Principal
Service/Connector implements Principal
Organization      may implement Actor
```

Questions:

- Is `Agent` merely a type implementing shared interfaces?
- How do `as`, `on behalf of`, delegated task authority, and service identity differ?
- Does an automation have identity independent from the human who triggered it?
- How is workload/process identity represented and audited?

## 12. Do relationship-entities deserve special semantics?

Examples:

```text
Employment
SupplyAgreement
Membership
Ownership
Reservation
Allocation
```

Questions:

- When is a relationship merely a Link?
- When does it become an entity with identity/lifecycle/actions?
- Does the engine need to know a special `Relator` category, or is that an ontological modeling convention?
- How are cardinality, exclusivity, temporal validity, and role dependence enforced?

## 13. How should economic reality be modeled?

REA/ValueFlows suggests useful distinctions such as:

```text
Intent
Commitment
EconomicEvent
Claim
Agreement
Process
EconomicResource
```

Questions:

- Which are universal enough for OS?
- Are ERP documents merely surfaces/projections over these concepts, or do some documents have independent legal/operational identity?
- How do accounting recognition and economic events relate?
- Can inventory, fulfillment, receivables, and payments share one coherent event/commitment model?

## 14. How should manufacturing reality be modeled?

Key distinctions to test across ERPNext, Odoo, Moqui, ISA-95, EPCIS, and REA/ValueFlows:

```text
resource/product specification
BOM/recipe/process specification
operation
capability
work center / machine / resource
plan
authorization/order
actual execution
consumption
transformation
output
quality/release
```

Questions:

- Which distinctions are universal?
- Which are scheduling/application artifacts?
- Is a Work Order fundamentally a commitment, authorization, plan, process instance, or combination?

## 15. What belongs in the ontology versus the runtime?

The engine should remain generic, but the exact boundary is open.

Questions:

- Is query semantics part of the language or toolchain?
- Is transaction semantics generic runtime behavior?
- Are subscriptions/reactivity language semantics?
- Does the runtime need special awareness of temporal/provenance concepts?
- Can all accounting/inventory/manufacturing behavior remain domain definitions with no domain-name branches in the engine?

Strong smell:

```text
if objectType == "PurchaseOrder"
```

inside the generic engine.

## 16. Do packages, modules, or packs matter semantically?

Earlier hypotheses promoted `Pack` too quickly.

Questions:

- Do we need namespaces/versioned modules for software organization?
- Can domain definitions have explicit dependencies without making modules part of business reality?
- How do organizations extend or override common definitions safely?
- How are Brazil-specific/fiscal concepts composed without contaminating unrelated domains?

Packaging may be necessary. It is not yet ontology.

## 17. Is there a compiler?

Maybe. But this may be a toolchain detail.

Possible implementation techniques:

```text
interpretation
AOT compilation
JIT
code generation
schema generation
materialization
index generation
SDK generation
UI generation
MCP/OpenAPI generation
```

Questions:

- Which artifacts must be generated versus interpreted?
- Does any of this deserve visible semantic meaning?
- Can one canonical definition safely produce all surfaces without those surfaces becoming authorities themselves?

## 18. What is the right physical data model?

No storage engine has been selected.

Questions:

- row/document/graph/fact storage;
- append-only history versus versioned records;
- temporal indexing;
- graph traversal;
- analytical columnar projections;
- search/vector indexes;
- transactional consistency;
- multi-tenant and distributed execution.

Rule:

> Physical storage should be chosen to execute semantics efficiently, not to define those semantics.

## 19. How does ontology evolution work?

This may become one of OS's most important capabilities.

Questions:

- Is every ontology revision content-addressed?
- Do historical Actions pin exact ontology/function/policy revisions?
- Can historical decisions be replayed under the original semantics?
- How are breaking ontology changes detected?
- How are data and facts migrated?
- Can two ontology revisions coexist during migration?
- How do external integrations survive ontology evolution?

## 20. How much ontology evolution can AGI perform?

A new possibility is continuous machine-assisted ontology engineering.

Potential loop:

```text
new evidence / code / standards / failures
        -> research agents
        -> candidate ontology diff
        -> generated counterexamples/tests
        -> impact and migration analysis
        -> human/policy review
        -> ontology revision
```

Questions:

- Can agents safely propose new types/actions/invariants?
- What evidence threshold is required?
- Can generated migrations be formally or empirically verified against historical workloads?
- How do we prevent semantic drift or locally convenient abstractions from accumulating?

## 21. Build from scratch or reuse existing software?

This is intentionally open.

Candidates may contribute:

- concepts;
- standards;
- libraries;
- storage engines;
- policy engines;
- workflow runtimes;
- query systems;
- application/runtime code.

But **minimizing new code is not the objective**.

Decision criterion:

> Reuse something when it preserves or improves the best semantics and operational properties we can design — not merely because it already exists.

Building major parts from scratch is acceptable if existing abstractions impose structural compromises. Reimplementing solved infrastructure with no semantic benefit is not.

## 22. Are surfaces entirely derived?

Current hypothesis:

```text
UI / mobile / API / MCP / chat / voice
```

are surfaces over shared semantics.

Questions:

- Does UI-specific metadata deserve first-class ontology-adjacent representation?
- Can forms and workflows be generated well enough from Action/type metadata?
- Where does human interaction design contain information not present in domain semantics?
- Can agents generate fit-for-purpose interfaces dynamically without making UI definitions part of business truth?

## 23. What would falsify the entire leading thesis?

We should actively search for evidence that an executable ontology is the wrong primary abstraction.

Examples:

- critical business behavior cannot be represented cleanly without a second semantic authority;
- a minimal ontology becomes so general that domain rules become unreadable or unenforceable;
- event/fact/process semantics require fundamentally different runtimes that cannot compose coherently;
- generic execution causes unacceptable performance or correctness tradeoffs;
- mature domain models repeatedly require ad-hoc escape hatches that reveal the language is missing a more fundamental abstraction.

Discovering this early would be success, not failure.
