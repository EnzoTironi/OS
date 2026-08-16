# Competing models — issue #156

**Decision:** none  
**Current candidate:** M4-v2 / R6-capability remains `hypothesis`.

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

**State:** control.

Its strength is directness. Its cost is that it may name a scheduling/enforcement mechanism that can be derived from smaller typed operation semantics and may otherwise grow into a universal hook system.

## M1 — definition graph plus special dispatcher

```text
Type Rule
Relation evaluatedBy(Rule, Computation)
Relation appliesTo(Rule, Target)
Relation locus(Rule, Commit)
```

Runtime still performs:

```text
for rule in graph where locus=commit and target=X:
    evaluate(rule)
```

**Verdict:** `rejected` as reduction.

This is a storage/metamodel encoding of RuleBinding, not deletion of its semantic job. The executable model records a `dispatch_calls` witness so the hidden recreation is observable.

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

**Verdict:** `rejected` as sufficient.

The accounting sensitivity model blocks an unbalanced Action while an admin mutation creates the same illegal state. Extending every read/effect/admin/lifecycle operation with local rule lists only distributes the same attachment protocol.

Inline authoring can still be ergonomic sugar over a stronger generic mechanism.

## M3 — executable Relation trigger

```text
Relation trigger(
  target,
  evaluator,
  phase=commit
)
```

Runtime searches Relations by trigger semantics.

**Verdict:** `rejected` as reduction in the tested form.

It either recreates the dispatcher using Relation records or promotes Relation into a larger trigger super-form containing scheduling/failure/authority semantics. A lower form count with a less orthogonal primitive is not demonstrated to be simpler.

## M4 — proof-carrying refined Types

### Core move

Remove runtime rule scheduling by locus.

A privileged operation declares the proof values required by its typed signature:

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

These are values of the same generic `TypeDef + refinements + construct()` system used for ordinary business values. There is no `CapabilityType` semantic species.

Example:

```text
Type PositiveAmount
  contract: value
  refinement: Positive

Type CommitPermit<Purchase>
  contract: capability
  refinement: AuthorizePurchaseCommit
  freshness: current
```

Both are constructed through the same Type refinement mechanism. Only a Type carrying the standard `capability` contract can satisfy a privileged operation signature.

### No locus field

`commit` is not metadata on a rule. The operation `commit:Purchase` simply requires `CommitPermit` and `PostStateValid` values.

`preview` cannot authorize commit because it is a different typed operation requiring a different proof Type.

### No scope lookup

Rules are not discovered by asking which bindings apply to a target. A caller must present values of the exact Types required by the operation signature. Construction evaluates the declared Type refinements.

### Authorization algebra

A proof refinement can invoke one typed PDP Computation. That PDP owns its policy combination semantics and returns:

```text
Permit | Deny | Error
+ determining evidence
+ evaluator/model revision
```

Generic Type construction accepts Permit and preserves Deny versus Error as distinct failed constructions. This does not force Cedar/OpenFGA/OPA combination details into generic Type refinement.

### Global invariants

The single low-level authoritative local commit operation requires a post-state-valid proof. Both business Actions and admin operations use this boundary.

The invariant is therefore not scheduled because a RuleBinding matched `locus=commit`; the proposed state cannot be committed without a value proving the required refined Type.

### External effects and reads

The same signature mechanism separates `EffectAttemptPermit` and `ReadPermit`. A read proof cannot authorize an effect attempt.

### Why capability machinery is independently required

Even with zero business Constraints/Policies/Invariants, runtime must prevent ordinary Computations from mutating authoritative state, using credentials, dispatching external effects, or crossing tenant/environment authority boundaries.

A capability boundary therefore exists independently of RuleBinding. M4 reuses this authority boundary rather than introducing a second scheduler.

## M4-v1 falsified — revision-bound proof is not context-bound proof

The first green M4 bound proof values to:

```text
type
target
semantic operation
current revision or pinned basis
```

That was insufficient.

A proof for a balanced proposed state could be reused for a different proposed state inside the same revision. Likewise authorization for `amount=5` could be substituted into an attempt with changed inputs. This is a TOCTOU/context-substitution failure even though revision freshness is correct.

The first green run is retained as evidence that **revision-only proof validity is too weak**.

## M4-v2 hardening — exact semantic + trusted execution context

The next candidate bound business inputs/state/payload but still omitted trusted execution identity. Deep review found that the proof could therefore transfer across actors, represented principals or workloads when the business context was unchanged. The same class of attack exists across authority domains such as tenant/environment/session when those dimensions affect permission.

The current candidate binds each operational proof to a digest of the exact context it validated:

```text
target
semantic operation identity
actor
represented principal
workload
authority context (for example tenant/environment/session when material)
inputs
proposed/pending state
pinned state/basis
payload where relevant
```

The runtime also seals the proof over:

```text
type
target/context digest
basis revision / pinned digest
determining evidence
evaluator revisions
```

The bounded model uses HMAC-SHA256 as a concrete anti-forgery mechanism. HMAC is not proposed as ontology semantics; the law is that an untrusted caller must not be able to mint, retarget, transfer or rewrite an authority proof outside the trusted runtime boundary.

Permanent regressions distinguish:

- **business/execution context substitution** -> `ContextMismatch`;
- **tampering with a sealed proof while keeping context unchanged** -> `ForgedProof`.

The substitution suite now varies inputs, proposed state, actor, represented principal, workload, tenant, environment and session.

This hardening required no RuleBinding/locus/scope dispatcher and no new `CapabilityType` form.

Important production boundary: the toy API accepts execution context explicitly to make transfer attacks testable. A real operation boundary must derive actor/workload/tenant/environment/session from trusted runtime identity/context and authorize any represented-principal delegation. If the caller controls both proof-minting identity and invocation identity, sealing merely authenticates a lie.

### Currentness after hardening

Global revision is a deliberately conservative bounded model. Production may bind proof validity to a declared dependency/StateBasis digest so unrelated revisions do not invalidate everything.

That refinement is allowed only if it remains proof-value validity. If it requires rediscovering and scheduling rules by locus/scope, R6 fails and R5 survives.

### Occurrence lifecycle

`update:Occurrence` requires an authority proof whose Type is intentionally uninhabited under the tested contract. This is not enough to settle repair/privacy/migration paths; #157 owns that falsifier.

## Hidden-recreation challenge against M4-v2

M4 is not automatically a real reduction. It dies if any of these becomes necessary:

1. proof Types grow arbitrary `locus`, `scope`, `timing`, `on_error`, `combine` fields until they are RuleBinding records;
2. runtime searches proof declarations by operation phase instead of checking values required by signatures;
3. business-specific branches decide which refinements to run;
4. cross-cutting invariants require an external registry because operation signatures cannot express them compositionally;
5. currentness/dependency validity cannot be represented on proof values without a separate scheduler;
6. the capability boundary has no independent purpose outside business rules;
7. `capability` itself requires a new semantic Type species rather than a standard Type contract;
8. trusted actor/workload/represented-principal/authority-domain context must be supplied by untrusted callers rather than runtime identity;
9. exact-context binding cannot cover the semantics that determine authorization/invariant validity without reconstructing RuleBinding metadata.

The bounded model currently avoids 1–7 and 9. Item 8 is a mandatory runtime boundary: the bounded API accepts execution context for testability, while production must derive it from trusted session/workload/delegation/tenant/environment context.

## Interim comparison

| Criterion | M0 RuleBinding | M1 graph | M2 inline | M3 Relation trigger | M4-v2 refined proof |
| --- | --- | --- | --- | --- | --- |
| Rule lookup by locus | yes | yes | duplicated locally | yes | **no** |
| Alternate-path invariant | yes | yes | **fails** | yes if dispatcher complete | yes via commit signature |
| Preview != commit | explicit locus | explicit locus | duplicated | trigger value | distinct required Types |
| Deny != evaluator Error | yes | possible | ad hoc | must add algebra | distinct construction failure |
| Current-state freshness | binding basis | binding data | ad hoc | trigger metadata | proof validity |
| Exact business-context binding | possible | possible | ad hoc | possible | **context digest** |
| Exact execution/authority-domain binding | possible | possible | often implicit | possible | **context digest** |
| Pinned evidence | binding basis | binding data | ad hoc | trigger metadata | basis-bound proof |
| Read/effect separation | loci | loci | duplicated | triggers | distinct signatures/Types |
| Caller can forge/retarget authority | runtime dependent | runtime dependent | often implicit | runtime dependent | sealed runtime-issued proof |
| Hidden dispatcher | explicit by design | **yes** | distributed | **yes** | not in bounded model |
| Independent runtime reason | enforcement itself | no | no | no | Computation/credential/I/O isolation |

## Interim verdict

M1, M2 and M3 do not beat R5.

M4-v1 was falsified by context substitution. The first M4-v2 hardening fixed input/state substitution but deep review exposed cross-identity transfer; the current M4-v2 expands exact context to trusted execution/authority-domain context and adds permanent regressions.

M4-v2 is therefore still the first competitor in this pass that may constitute a **real** reduction rather than a rename. It revives a four-form candidate:

```text
Type
Relation
Computation
Action
```

but with a materially stronger Type/runtime-capability model than Wave A's rejected quartet.

This candidate is provisionally called `R6-capability`. It is not an RFC update and not accepted. It must survive exact-head CI and then #157/#158/#71 before any disposition of RFC-0002 changes.
