# Competing models — issue #156

**Decision:** none  
**Current candidate:** M4 / R6-capability remains `hypothesis`.

## Scoring rule

A smaller vocabulary is not automatically better. Score each competitor on:

- mandatory enforcement across operation families;
- static/structural checkability;
- no-bypass behavior;
- state-basis/currentness semantics;
- denial vs evaluator error;
- determining evidence and revision pinning;
- ability to explain what authorized/validated an operation;
- hidden runtime dispatch introduced by the reduction;
- whether the mechanism exists for a reason independent of business rules.

## M0 — R5 explicit RuleBinding

```text
RuleBinding(
  evaluator,
  scope,
  locus,
  obligation,
  basis,
  false/error behavior,
  revision
)
```

Runtime selects bindings by scope/locus and evaluates them.

### Strength

Directly expresses the job the corpus repeatedly requires.

### Cost

The base form may be naming a scheduling/enforcement mechanism that could be derived from more primitive typed operation semantics. It also risks becoming a universal hook system.

### State

`control`.

## M1 — definition graph plus special dispatcher

```text
Type Rule
Relation evaluatedBy(Rule, Computation)
Relation appliesTo(Rule, Target)
Relation locus(Rule, Commit)
```

Runtime then performs:

```text
for rule in graph where locus=commit and target=X:
    evaluate(rule)
```

### Verdict

`rejected` as reduction.

This is a storage/metamodel encoding of RuleBinding, not deletion of its semantic job. The executable model records a `dispatch_calls` witness precisely to make the hidden recreation visible.

## M2 — inline contracts

```text
Action PostJournal:
  pre: ...
  post: balanced(...)
```

or:

```text
Type Occurrence:
  onUpdate: deny
```

### Verdict

`rejected` as sufficient.

The accounting sensitivity model shows Action-local balance enforcement while an admin mutation creates an unbalanced state. Extending every read/effect/admin/lifecycle operation with local rule lists simply reconstructs the attachment protocol repeatedly.

Inline authoring can remain ergonomic sugar if it normalizes to a stronger generic mechanism.

## M3 — executable Relation trigger

```text
Relation trigger(
  target,
  evaluator,
  phase=commit
)
```

Runtime searches Relations by trigger semantics.

### Verdict

`rejected` as reduction in the tested form.

It either:

1. reintroduces the exact dispatcher using Relation records; or
2. promotes Relation into a larger executable trigger super-form whose semantics now include scheduling, failure algebra and authority.

A lower count with a more heterogeneous primitive is not demonstrated to be simpler or more orthogonal.

## M4 — proof-carrying refined capabilities

### Core move

Remove runtime rule scheduling by locus.

A privileged operation declares the capability values required by its **typed signature**:

```text
preview:Purchase    : PreviewPermit<Purchase> -> Unit
commit:Purchase     : CommitPermit<Purchase>
                    × PostStateValid<Purchase> -> Unit
admin:ledger        : AdminPermit<Ledger>
                    × PostStateValid<Ledger> -> Unit
read:Journal        : ReadPermit<Journal> -> JournalView
effect-attempt      : EffectAttemptPermit<Request> -> Attempt
update:Occurrence   : UpdatePermit<Occurrence> -> Unit
```

Capability values are ephemeral values of ordinary refined Types under a standard contract:

```text
Type CommitPermit<Purchase>
  refinement: AuthorizePurchaseCommit
  freshness: current

Type PostStateValid<Ledger>
  refinement: BalancedPendingState
  freshness: current
```

### No locus field

`commit` is not metadata on a rule. The operation named `commit:Purchase` simply requires `CommitPermit` and `PostStateValid` in its type-level signature.

`preview` cannot accidentally authorize commit because it produces/requires a different capability type.

### No scope lookup

Rules are not discovered by asking which bindings apply to `Purchase`. A caller must construct values of the exact Types required by the operation. Construction validates the Type refinements.

### Currentness

A current capability value carries the authority-state revision at which it was minted. Generic value verification rejects it after the revision changes.

A pinned capability carries a digest of its named basis. Unrelated current-state revision changes do not invalidate that evidence, but changing the pinned basis does.

This is value validity, not a binding `basis` field evaluated later.

### Authorization algebra

The capability refinement can call one typed PDP Computation. That PDP owns combination semantics and returns:

```text
Permit | Deny | Error
+ determining evidence
+ evaluator/model revision
```

Capability construction only accepts `Permit`. It preserves Deny vs Error as distinct failed-construction outcomes.

This deliberately avoids making generic Type refinement responsible for Cedar/OpenFGA/OPA combination details.

### Global invariants

The single low-level authoritative local commit operation requires a post-state-valid capability. Both business Actions and admin operations must use the same boundary.

The invariant is therefore not scheduled because a RuleBinding matched `locus=commit`; the proposed state simply cannot be committed without a proof value of the required Type.

### Occurrence lifecycle

`update:Occurrence` requires `UpdatePermit<Occurrence>`. Under the tested contract no value of that capability type can be constructed.

Whether this remains correct across migration/privacy/repair paths is **not** settled here; #157 owns that falsifier.

### External effects and reads

The same signature idea separates `EffectAttemptPermit` and `ReadPermit`. A read token cannot authorize an effect attempt.

### Why capability machinery is independently required

Even if the business ontology had zero Constraints/Policies/Invariants, runtime still needs to prevent ordinary Computations from:

- mutating authoritative state;
- using credentials;
- dispatching external effects;
- crossing tenant/environment boundaries.

A capability boundary therefore exists independently of RuleBinding. M4 tries to reuse that already-required mechanism rather than introduce another scheduler.

## Hidden-recreation challenge against M4

M4 is **not** automatically a real reduction. The following would kill it:

1. capability Types grow arbitrary `locus`, `scope`, `timing`, `on_error`, `combine` fields until they are RuleBinding records;
2. runtime starts searching capability declarations by operation phase rather than validating values demanded by signatures;
3. business-specific branches decide which refinements to run;
4. cross-cutting invariants require an external registry because operation signatures cannot express them compositionally;
5. authorization currentness cannot be represented as capability-value validity without a separate rule scheduler;
6. capability minting only exists because of business rules, so the claimed independent runtime purpose is false.

The current bounded reference model avoids 1–5. Item 6 is supported conceptually by Computation/external-I/O isolation but still needs runtime architecture work.

## Interim comparison

| Criterion | M0 RuleBinding | M1 graph | M2 inline | M3 Relation trigger | M4 capability |
| --- | --- | --- | --- | --- | --- |
| Rule lookup by locus | yes | yes | duplicated locally | yes | **no** |
| Alternate-path invariant | yes | yes | **fails** | yes if dispatcher complete | yes via commit signature |
| Preview != commit | explicit locus | explicit locus | duplicated code | trigger value | distinct capability Types |
| Deny != evaluator Error | yes | possible | ad hoc | must add algebra | distinct mint failure |
| Current-state freshness | binding basis | binding data | ad hoc | trigger metadata | token validity |
| Pinned evidence | binding basis | binding data | ad hoc | trigger metadata | basis-bound token |
| Read/effect separation | loci | loci | duplicated | triggers | distinct signatures/types |
| Hidden dispatcher | explicit by design | **yes** | distributed | **yes** | not in bounded model |
| Independent runtime reason | enforcement itself | no | no | no | capability isolation |

## Interim verdict

M1, M2 and M3 do not beat R5.

M4 is the first competitor in this pass that may constitute a **real** reduction rather than a rename. It revives a four-form candidate:

```text
Type
Relation
Computation
Action
```

but with a materially stronger Type/runtime-capability story than Wave A's rejected M1 quartet.

That candidate is provisionally called `R6-capability`. It is not an RFC update and not accepted. It must survive the #156 executable/property tests, adversarial review, exact-head CI, and later pressure from #157/#158/#71 before any RFC-0002 disposition changes.
