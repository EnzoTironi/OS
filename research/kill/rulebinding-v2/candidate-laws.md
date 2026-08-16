# Candidate laws — issue #156

**Decision vocabulary:** `supported`, `hypothesis`, `rejected`, `undetermined`.  
**Architecture decision:** none.

These laws summarize only what the post-R5 reduction experiment supports. They do not update RFC-0002.

## L-RB-01 — Encoding RuleBinding as ordinary records while retaining a special dispatcher is not semantic reduction

**State:** `supported`.

M1 stores rule metadata in ordinary graph records but runtime still selects by target + operation phase and dispatches evaluators. The semantic job survives unchanged.

## L-RB-02 — Making Relation executable through trigger metadata is not automatically a smaller metamodel

**State:** `supported`.

M3 lowers the form count only by making Relation carry scheduling semantics and requiring a trigger dispatcher. This is hidden recreation or primitive overloading until shown otherwise.

## L-RB-03 — Action-local checks cannot enforce a system invariant across independent mutation paths

**State:** `supported`.

M2 blocks an unbalanced journal through one Action while an admin path creates the illegal state. The invariant must live at a shared authoritative boundary or equivalent generic mechanism.

## L-RB-04 — Operation phase can be represented by typed operation identity rather than a rule `locus` field

**State:** `hypothesis`.

M4 represents `preview:Purchase`, `commit:Purchase`, `read:Journal`, `effect-attempt`, and `update:Occurrence` as different typed operation signatures. No M4 code identifier named `locus` exists.

Falsifier: a required cross-cutting semantic rule cannot be expressed through the required proof Types of operation signatures without reintroducing a scheduler.

## L-RB-05 — Refinement can be generic Type semantics rather than a capability-specific semantic species

**State:** `hypothesis`.

The same `TypeDef + refinements + construct()` mechanism validates both `PositiveAmount` and proof-carrying authority values. `CapabilityType` was deliberately removed from M4.

Falsifier: ordinary values and authority proofs need fundamentally incompatible refinement semantics that force separate interpreter kinds.

## L-RB-06 — `capability` can remain a standard Type contract plus runtime authority rather than a base semantic form

**State:** `hypothesis`.

A Type with the `capability` contract can satisfy a privileged operation signature. A refined ordinary value cannot. Runtime specialization does not by itself prove a semantic primitive.

Falsifier: expressing the authority boundary requires a new semantic kind with identity/evolution/composition laws not expressible by Type contracts.

## L-RB-07 — Capability isolation is required independently of business RuleBindings

**State:** `supported` as runtime pressure.

Ordinary Computations must be unable to mutate authoritative state or perform privileged external operations. The malicious-refinement sensitivity test mutates state and the engine restores state and rejects it.

This gives the capability boundary an independent reason to exist.

## L-RB-08 — A global post-state invariant can be a required proof Type of the single low-level commit operation

**State:** `hypothesis`.

Both `commit:Purchase` and `admin:ledger` require `PostStateValid`. No Action-local callback is sufficient to satisfy either signature.

Falsifier: production architecture requires legitimate authoritative state mutation below this boundary.

## L-RB-09 — No-bypass is a property of the authority graph, not of the authoring noun `Invariant`

**State:** `hypothesis`.

If every authoritative mutation path must cross the same commit signature, system invariants are inescapable without a RuleBinding scheduler.

Issue #157 owns the stronger adversarial test over admin/import/migration/privacy/repair paths.

## L-RB-10 — Preview authority and commit authority should not be substitutable values

**State:** `supported` in the bounded model.

`PreviewPermit` cannot satisfy `commit:Purchase`; the operation signature demands a different proof Type.

## L-RB-11 — Current-state authority can be represented as proof validity against explicit state basis, but revision alone is insufficient

**State:** `hypothesis`.

A current proof constructed at revision N is stale after an authoritative revision change. That handles coarse currentness, but the red-team found that revision/target/operation scoping alone still permits context substitution inside the same revision.

The hardened candidate therefore combines freshness with L-RB-18's exact semantic-context binding. Production may use a dependency/StateBasis digest rather than one global revision to avoid unnecessary invalidation.

Falsifier: required currentness cannot be represented as proof-value validity without rebuilding RuleBinding scheduling semantics.

## L-RB-12 — Pinned evidence can be represented as a proof value bound to a named basis digest

**State:** `hypothesis`.

A pinned proof survives unrelated current revisions but fails if the supplied pinned basis changes.

This is evidence semantics, not permission to substitute historical approval for current authority.

## L-RB-13 — Denial and evaluator error remain distinct failed constructions

**State:** `supported` in the bounded model.

M4 raises distinct outcomes for refinement `DENY` and refinement `ERROR`, preserving the #8/#42 distinction.

## L-RB-14 — Policy-combination semantics need not live in a generic RuleBinding algebra

**State:** `hypothesis`.

A typed PDP Computation can own Cedar/OpenFGA/OPA-specific combination semantics and return `Permit | Deny | Error + evidence`; generic Type construction only accepts Permit while preserving the other outcomes.

Falsifier: cross-policy composition must be visible/composable outside the PDP Computation to support explanation or static analysis, forcing a generic combination layer back into the metamodel.

## L-RB-15 — Determining evidence and evaluator revision should travel with the proof value

**State:** `supported` in the bounded model.

Successful commit audit includes the exact evaluator revisions and determining evidence that constructed required proof values. The hardened model seals these fields so callers cannot rewrite the explanation independently of the validated proof.

## L-RB-16 — Read authority and external-effect attempt authority are distinct typed proofs

**State:** `supported` in the bounded model.

`ReadPermit` cannot authorize `effect-attempt`; each privileged operation declares its required proof Type.

## L-RB-17 — An occurrence update can be impossible because no value inhabits its required authority Type

**State:** `hypothesis` only.

`UpdatePermitOccurrence` has an unsatisfied refinement, so `update:Occurrence` cannot be invoked in M4.

This does not settle Event demotion across privileged repair/privacy/migration paths. #157 is a mandatory dependency before promotion.

## L-RB-18 — Operational proof values must be bound to the exact semantic and execution context they validated and be unforgeable

**State:** `supported` in the hardened bounded model.

Target, Type, semantic operation identity and revision are necessary but not sufficient. A proof for `amount=5` must not authorize `amount=500`; a `PostStateValid` proof for a balanced proposed state must not authorize a different unbalanced state in the same revision; and an authority proof minted for one actor/principal/workload must not transfer to another merely because the business inputs are identical.

The hardened model binds each authority proof to a digest of the exact validated context:

```text
target
operation identity
actor
represented principal
workload
inputs
proposed/pending state
pinned basis
payload where relevant
```

and runtime-seals the proof together with determining evidence and evaluator revisions. Input/state/identity substitution raises `ContextMismatch`; caller rewriting of a sealed field raises `ForgedProof`.

Production need not use HMAC specifically, but callers must not be able to manufacture or retarget an authority proof outside the trusted runtime boundary. The production operation boundary must derive actor/workload/representation from trusted execution context rather than accept self-asserted identity as ordinary business input.

## L-RB-19 — R6-capability is materially different from Wave A's rejected Type/Link/Function/Action quartet

**State:** `hypothesis`.

Wave A's quartet left Event immutability, policy enforcement and global invariant enforcement as conventions. R6 adds no fifth semantic form, but relies on generic refined Type values plus an independently required runtime capability boundary and typed privileged-operation signatures.

Falsifier: if that runtime/type machinery is merely RuleBinding decomposed or requires a hidden scheduler, the distinction collapses and R5 survives.

## L-RB-20 — Passing #156 is insufficient to supersede R5

**State:** `supported` as epistemic discipline.

At minimum #157 (no-bypass), #158 (Relation unification), and #71 (cross-cycle semantic acceptance) must attack the same R6-capability candidate. RFC-0002 remains `Status: hypothesis`, `Decision: none`, `Supersedes: nothing`.
