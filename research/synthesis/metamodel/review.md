# Adversarial synthesis review — issue #70

**Status:** review-pending  
**Architecture decision:** none  
**Candidate:** R5 remains `hypothesis`.  

This review asks whether issue #70 actually reduced the metamodel or merely moved deleted nouns into hidden runtime code. A clean research review is not an architecture acceptance. `review-clean` does not mean `accepted`.

## Review basis

The review covers the primitive-reduction matrix, 40 candidate laws, 50 kill tests, executable reference model, deliberately unsafe sensitivity mutants, Hypothesis/state-machine tests, relation-integrity rollback tests, the order/inventory/manufacturing/accounting vertical, and the reviewed Wave A/Wave B inputs named in `evidence-index.md`.

The standard is the anti-cheat rule in `authoring-ir-runtime.md`: deleting a semantic form does not count as reduction if a dedicated dispatcher silently reconstructs the same protocol.

## Findings by R5 form

### Type — survives this pass

I found no smaller composition in the current corpus that preserves both entity identity and value equality without recreating a type system. A fact-only or relation-only representation still needs an interpreter-visible answer to identity, equality, conformance, merge/split and reference validity.

**Review state:** strong survivor in the current hypothesis, not permanently accepted.

### Relation — survives, but the Property/Link unification is still provisional

The executable model demonstrates one typed relation algebra enforcing value/entity endpoint typing and cardinality. Relationship-with-lifecycle can become an ordinary identifiable Type rather than a native Relator.

This is a real semantic reduction only if authoring/query/codegen experiments later preserve required/optional scalar semantics, inverse navigation, n-ary participation, uniqueness/exclusion and migration ergonomics without special Property-only or Link-only semantic machinery. Physical specialization into columns, foreign keys or graph indexes is allowed and does not itself revive separate semantic forms.

**Review state:** plausible base form; `Property -> Relation` and `Link -> Relation` remain hypotheses.

### Computation — survives, breadth unresolved

Reusable typed logic must exist independently of authoritative mutation. The reference model correctly makes direct mutation from Computation a capability violation.

The unresolved risk is over-breadth: pure deterministic evaluation, declarative query, solver/search, graph/PDP evaluation and agentic judgment have different result algebras and capabilities. Calling all of them Computation is acceptable only if illegal combinations are rejected statically/runtime-generically rather than by ad-hoc flags.

**Review state:** survivor; Search/Query/agent subforms remain open.

### Action — survives the reduction attack

The strongest attempted deletion is:

```text
Type ActionInvocation
Computation Planner
RuleBindings
runtime CommitCapability
operationId + intentDigest + actor + StateBasis + replay
```

This does not remove the behavior. It reconstructs the Action/Operation protocol under another name. The sensitivity mutant without semantic operation identity reproduces duplicate mutation on caller retry; R5 preserves replay and rejects same-ID/different-intent mismatch.

Action therefore currently earns a directly interpreted executable form because its generic protocol is shared across unrelated business domains and cannot be removed without either losing semantics or recreating the same dispatcher.

**Review state:** strong survivor, still `hypothesis` as a base-form choice.

### RuleBinding — survives the reduction attack, but remains the best target for a future R6

Representing a binding as ordinary Type/Relation records can be a valid physical/meta representation. It is not a semantic reduction if the runtime must still recognize those records to schedule evaluator E at locus L, select current/pinned/as-of basis, apply obligation/error/combination algebra and produce reconstructable evidence.

Current evidence repeatedly needs this exact job for system invariants, authorization, lifecycle rules and effect-attempt controls. Removing the name while retaining a mandatory binding dispatcher is cosmetic.

A real future reduction must show that an already-required generic mechanism — not a renamed binding engine — provides the same static checking, no-bypass enforcement and explanation.

**Review state:** medium/strong survivor; still the most credible candidate for further reduction.

## Demotions under adversarial review

### Event / Occurrence — plausible real demotion, conditional on no bypass

Wave A correctly rejected `Event = Type + tag/interface`: the tag did not stop edits.

R5 is materially different:

```text
EventType authoring resource
  -> Type + OccurrenceContract
  -> generic lifecycle RuleBindings
```

The runtime does not need an Event-specific mutation branch; it uses the same RuleBinding machinery needed elsewhere. The unsafe tag-only mutant can edit history, while the generic lifecycle-bound occurrence cannot.

This is therefore a real candidate reduction of **base-sort status**, not a deletion of occurrence semantics. `Action != occurrence` remains mandatory and visible.

**Critical falsifier:** any legitimate exported business/admin/import/migration mutation path can change a committed occurrence while bypassing the same generic lifecycle authority. Until real backend paths are tested, Event demotion stays `hypothesis`.

### Constraint / Invariant / Policy — plausible contract demotions

The corpus supports deleting these as unrelated base sorts only because their semantics remain explicit in typed authoring contracts and normalize to evaluator + mandatory RuleBinding.

Policy must never collapse to Bool. `Permit`, `Deny`, evaluator `Error`, combination, determining evidence, currentness and revision remain observable. Likewise an invariant is not an Action-local `if`; it must bind to every relevant authoritative mutation path.

**Review state:** plausible demotions; no claim that their authoring vocabulary should disappear.

### Effect — semantic sort still unearned; runtime capability remains native

External I/O cannot become an ordinary Computation. Credentials, environment, protocol idempotency, unknown outcomes and reconciliation require a privileged runtime capability. The current model preserves stable local EffectRequest identity without requiring a provider key before send, represents timeout-after-send as indeterminate, and refuses unsafe blind retry.

Those requirements do not yet force `Effect` into the canonical semantic base-form list because request/attempt/observation/outcome can remain typed records under a native I/O capability.

**Review state:** semantic demotion plausible; runtime specialization mandatory.

### Workflow — demotion survives

Durable timers, retries, waits, signals and replay are execution memory. They do not define whether a Commitment is fulfilled, a payment occurred or a manufacturing Process completed. Runtime completion cannot manufacture business truth.

**Review state:** supported runtime demotion.

### Fact — unresolved; do not delete by rhetoric

The fact-only kernel remains rejected, but rival source assertions still create pressure for a reusable Statement/Assertion contract with subject, predicate, value/object, provenance, assurance and meaningful time axes.

The current Observation encoding proves representability without a Fact base sort. It does not prove that generic contradiction/provenance/query behavior will remain ergonomic or efficient without a standard statement form.

**Review state:** `undetermined`.

### Interface — unresolved as a first-class static contract

Interface is not Role and does not supply identity. A ShapeContract can describe shared capabilities in the toy model, but real SDK/query/Action polymorphism, variance and migration checking have not been exercised deeply enough to decide whether Interface stays authoring sugar or requires a stronger semantic definition form.

**Review state:** `undetermined`.

## Hidden-recreation check

I looked specifically for deleted forms returning as branches in the reference model.

- **Event:** no Event-specific dispatcher is required for immutability; generic lifecycle RuleBinding provides the enforcement. This passes the anti-cheat test provisionally.
- **Policy/Invariant:** generic RuleBinding dispatches them by obligation/locus/result protocol rather than by authoring noun. This passes provisionally.
- **Projection:** materialization is runtime state over derivation; no Projection business authority branch is required.
- **Workflow:** execution memory is explicitly outside semantic authority.
- **Action:** attempted deletion recreates an operation dispatcher. It therefore stays.
- **RuleBinding:** attempted deletion recreates mandatory binding dispatch. It therefore stays for R5.

## Verification assessment

The current executable evidence is useful because it contains weaker mutants that reproduce the known failures. It is not a proof of the production system.

The green gate demonstrates, within the bounded models:

- occurrence lifecycle enforcement beats a mutable tag;
- semantic operation identity prevents duplicate caller retry and rejects intent mismatch;
- authorization Deny and evaluator Error remain distinct;
- global invariant enforcement beats Action-local checking;
- Relation minimum cardinality can be validated after an atomic construction and rollback on failure;
- effect knowledge does not incorrectly turn timeout into failure or unsafe retry permission;
- property/state-machine testing exercises replay, occurrence immutability, relation typing/cardinality and effect knowledge transitions.

It does **not** establish liveness/fairness, full authorization correctness, production concurrency correctness, privacy/retention behavior, migration/admin no-bypass behavior, or universal minimality of R5. The #46 BFS/SMT layers are bounded/sensitivity evidence, not a proof of the whole architecture.

## Enterprise vertical assessment

Order, inventory, manufacturing and accounting can be expressed using R5 as canonical executable forms while retaining rich domain Types such as `Commitment`, `StockMovement`, `BOM`, `WorkOrder`, `JournalEntry`, `Grant` and `Observation`.

This is important because primitive reduction must not impoverish the business ontology. The reduced kernel does not imply a reduced business ontology.

## Decision on RFC-0001

Do **not** rewrite or mark RFC-0001 accepted from this synthesis. Too many open questions can still change the base-form list, especially RuleBinding, Relation/Property/Link, Type entity/value treatment, Computation breadth, Interface and Event no-bypass behavior.

Issue #70 should instead publish `rfcs/0002-executable-metamodel-hypothesis-v1.md` as a stronger replacement candidate with `Status: hypothesis` and `Decision: none`. It does not supersede RFC-0001.

## Review verdict

Pending final CI on the review artifacts themselves, the research is internally consistent enough to be marked `review-clean` **as research** if the exact final SHA passes all synthesis and cross-ontology gates.

That status means only:

> no contradiction or hidden recreation found in this review that requires changing the recorded R5 hypothesis before downstream falsification.

It does not mean the architecture is accepted, frozen, implementation-ready, or proven minimal.
