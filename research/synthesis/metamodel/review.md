# Adversarial synthesis review — issue #70

**Status:** review-clean  
**Architecture decision:** none  
**Candidate:** R5 remains `hypothesis`.  
**Pending-gate evidence:** workflow run `31948622609` passed both `synthesis` and `postgres18-integration` on SHA `76f5e62704fa7479eae21726480c62efbfd68b1f`.  

This review asks whether issue #70 actually reduced the metamodel or merely moved deleted nouns into hidden runtime code. `review-clean` does not mean `accepted`.

## Review basis

The review covers the primitive-reduction matrix, 40 candidate laws, 50 kill tests, executable reference model, deliberately unsafe sensitivity mutants, Hypothesis/state-machine tests, relation-integrity rollback tests, the order/inventory/manufacturing/accounting vertical, and the reviewed Wave A/Wave B inputs named in `evidence-index.md`.

The standard is the **anti-cheat rule** in `authoring-ir-runtime.md`: deleting a semantic form does not count as reduction if a dedicated dispatcher silently reconstructs the same protocol.

## Findings by R5 form

### Type — survives this pass

No smaller composition in the current corpus preserves both entity identity and value equality without recreating a type system. A fact-only or relation-only representation still needs an interpreter-visible answer to identity, equality, conformance, merge/split and reference validity.

**Review state:** strong survivor in the current hypothesis, not permanently accepted.

### Relation — survives, but Property/Link unification is provisional

The executable model demonstrates one typed relation algebra enforcing value/entity endpoint typing and cardinality. Relationship-with-lifecycle can become an ordinary identifiable Type rather than a native Relator.

The reduction stays provisional until real authoring/query/codegen/migration experiments preserve scalar semantics, navigation, n-ary participation, uniqueness/exclusion and evolution without special Property-only or Link-only semantic machinery. Physical specialization into columns, foreign keys or graph indexes is allowed and does not itself revive separate semantic forms.

**Review state:** plausible base form; `Property -> Relation` and `Link -> Relation` remain hypotheses.

### Computation — survives, breadth unresolved

Reusable typed logic must exist independently of authoritative mutation. The reference model makes direct authoritative mutation from Computation a capability violation.

Pure evaluation, declarative query, solver/search, graph/PDP evaluation and agentic judgment have different result algebras and capabilities. One Computation family remains acceptable only if illegal combinations are rejected generically rather than hidden behind unchecked flags.

**Review state:** survivor; Search/Query/agent subforms remain open.

### Action — survives the reduction attack

The strongest attempted deletion reconstructs semantic operation identity, intent digest, actor context, StateBasis, mandatory rules, atomic commit and replay around a planner Computation. That is not deletion; it is an Action/Operation protocol under another name.

The deliberately weaker mutation engine reproduces duplicate business mutation on caller retry. R5 replays same operation/same intent and rejects same operation/different intent.

**Review state:** strong survivor, still `hypothesis` as a base-form choice.

### RuleBinding — survives the reduction attack

Representing a binding as ordinary Type/Relation records can be a physical/meta representation. It is not semantic reduction if runtime must still recognize those records to schedule evaluator E at locus L, choose current/pinned/as-of basis, apply obligation/error/combination algebra and retain determining evidence.

Current evidence needs this job across invariants, authorization, lifecycle rules and effect-attempt controls. A future R6 must remove the behavior through an already-required generic mechanism, not rename the binding dispatcher.

**Review state:** medium/strong survivor and the most credible future reduction target.

## Demotions under adversarial review

### Event / Occurrence — plausible real demotion, conditional on no bypass

Wave A correctly rejected `Event = Type + tag/interface`: a tag did not stop edits.

R5 instead uses:

```text
EventType authoring resource
  -> Type + OccurrenceContract
  -> generic lifecycle RuleBindings
```

No Event-specific mutation branch is required. The unsafe tag-only mutant can edit history; the lifecycle-bound occurrence cannot. The reduction therefore concerns **base-sort status**, not occurrence meaning. `Action != occurrence` remains mandatory and visible.

**Critical falsifier:** any legitimate exported business/admin/import/migration mutation path changes a committed occurrence while bypassing the same generic lifecycle authority. Event demotion remains `hypothesis` until real backend paths are tested.

### Constraint / Invariant / Policy — plausible contract demotions

Their semantics remain explicit in authoring contracts and normalize to evaluator + mandatory RuleBinding. Policy does not collapse to Bool: `Permit`, `Deny`, evaluator `Error`, combination, determining evidence, currentness and revision remain observable. An invariant is not an Action-local `if`; it applies to every relevant authoritative path.

**Review state:** plausible demotions; their authoring vocabulary should remain explicit.

### Effect — semantic sort unearned; runtime capability mandatory

External I/O cannot become ordinary Computation. Credentials, environment, protocol idempotency, unknown outcomes and reconciliation require a privileged runtime capability. The reduced model preserves stable local EffectRequest identity without requiring a provider key before send, represents timeout-after-send as indeterminate, and refuses unsafe blind retry.

**Review state:** semantic demotion plausible; runtime specialization mandatory.

### Workflow — runtime demotion survives

Timers, retries, waits, signals and replay are execution memory. They do not determine whether a Commitment was fulfilled, a payment occurred or a manufacturing Process completed.

**Review state:** supported runtime demotion.

### Fact — unresolved

The fact-only kernel remains rejected, but rival source assertions create pressure for a reusable Statement/Assertion contract with subject, predicate, value/object, provenance, assurance and meaningful time axes. Observation encoding proves representability without a Fact base sort; it does not prove a standard statement contract is unnecessary.

**Review state:** `undetermined`.

### Interface — unresolved

Interface is not Role and does not supply identity. ShapeContract shows representability in the toy model, but SDK/query/Action polymorphism, variance and migrations have not been tested deeply enough.

**Review state:** `undetermined`.

## Hidden-recreation check

- **Event:** no Event-specific dispatcher is required; generic lifecycle RuleBinding provides immutability. Provisionally passes the anti-cheat rule.
- **Policy/Invariant:** generic RuleBinding dispatches by obligation/locus/result protocol rather than authoring noun. Provisionally passes.
- **Projection:** materialization is runtime state over derivation; no independent business authority branch.
- **Workflow:** execution memory stays outside semantic authority.
- **Action:** attempted deletion recreates an operation dispatcher, so Action stays.
- **RuleBinding:** attempted deletion recreates mandatory binding dispatch, so RuleBinding stays for R5.

## Verification assessment

The executable evidence is meaningful because weaker mutants reproduce known failures. It is not proof of a production system or universal minimality.

Within the bounded models, the gate demonstrates occurrence lifecycle enforcement, semantic retry/mismatch behavior, Deny-vs-Error distinction, global invariant enforcement, Relation minimum-cardinality rollback, conservative effect knowledge, and property/state-machine pressure over replay, occurrence immutability, relation typing/cardinality and effect transitions.

It does **not** establish liveness/fairness, full authorization correctness, production concurrency, privacy/retention behavior, migration/admin no-bypass behavior or universal minimality. #46 BFS/SMT evidence remains bounded/sensitivity evidence, not a proof of the whole architecture.

## Enterprise vertical assessment

Order, inventory, manufacturing and accounting fit R5 as canonical executable forms while retaining rich domain Types such as `Commitment`, `StockMovement`, `BOM`, `WorkOrder`, `JournalEntry`, `Grant` and `Observation`.

The reduced kernel does not imply a reduced business ontology.

## Decision on RFC-0001

Do not rewrite or mark RFC-0001 accepted. RuleBinding, Relation/Property/Link, Type entity/value treatment, Computation breadth, Interface and Event no-bypass behavior can still change the base-form list.

Issue #70 instead publishes `rfcs/0002-executable-metamodel-hypothesis-v1.md` with `Status: hypothesis` and `Decision: none`. It does not supersede RFC-0001.

## Review verdict

The pending review artifacts passed workflow run `31948622609` on SHA `76f5e62704fa7479eae21726480c62efbfd68b1f`, including the synthesis gate and PostgreSQL 18 integration. This justifies marking the **research shard** `review-clean` and publishing RFC-0002 as `proposed-not-accepted`.

A second CI run on the exact final review-clean SHA is still required before merge.

`review-clean` means only that no contradiction or hidden recreation found in this review requires changing the recorded R5 hypothesis before downstream falsification. It does not mean the architecture is accepted, frozen, implementation-ready or proven minimal.
