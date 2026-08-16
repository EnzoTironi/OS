# Adversarial review — issue #156 RuleBinding reduction

**Status:** review-pending  
**Architecture decision:** none  
**Candidate:** `R6-capability` remains `hypothesis` and `not-accepted`.

This review asks whether M4-v2 genuinely removes `RuleBinding` or merely redistributes the same semantic job into Type refinements, capability values, operation signatures, or trusted runtime code.

A clean review does not update RFC-0002 and does not make R6 the architecture.

## Review basis

The review covers:

- R5 control from #70;
- M1 graph-dispatch, M2 inline and M3 executable-Relation competitors;
- generic refined Type M4;
- explicit removal of dedicated `CapabilityType`;
- context-substitution counterexample that falsified M4-v1;
- exact-context-bound + sealed M4-v2;
- Hypothesis/property pressure and cross-ontology regressions;
- PostgreSQL 18 regression gate;
- candidate laws L-RB-01..20;
- evidence index and historical failed/green runs.

## Attack 1 — Did `CapabilityType` simply replace RuleBinding?

The first serious M4 version did define a dedicated `CapabilityType`. That was not accepted as sufficient evidence because it could merely exchange one primitive for another.

The current model removes that class. The same `TypeDef + refinements + construct()` semantics validate both an ordinary `PositiveAmount` and authority values such as `CommitPermit` and `PostStateValid`.

The `capability` marker is a standard Type contract that allows a value to satisfy a privileged operation signature. It is not a separate semantic base form in the bounded model.

**Current review state:** this specific primitive-substitution attack is answered in the bounded model.

**Falsifier:** real Type semantics require capability values to become a separate identity/composition/evolution category rather than a contract over Type.

## Attack 2 — Is `OperationSignature` just RuleBinding under another name?

RuleBinding says, conceptually:

```text
at locus L on scope S, discover evaluator E and enforce its result under basis/algebra B
```

M4-v2 instead says:

```text
operation O has typed inputs; among them are proof values P1..Pn
```

There is no candidate runtime lookup by `locus` or `scope`, no `_bindings_for`, and no dynamic scheduling of an evaluator because an operation entered a phase. Proof construction follows generic Type refinement semantics; invocation only verifies that the exact required Types were constructed for the exact invocation context.

The distinction is real **only while operation requirements remain ordinary static/typed signature requirements**. If future composition needs dynamic "all rules applying at this phase" discovery, RuleBinding returns.

**Current review state:** no hidden RuleBinding dispatcher found in M4-v2.

## Attack 3 — Are Type refinements themselves RuleBindings?

A Type refinement is an attachment from a Type to a Computation, so this is the most dangerous semantic similarity.

The current defense is that refinement has a simpler, independent meaning:

> a value does not inhabit Type T unless T's refinement predicates/procedures validate that exact value/context.

The mechanism is used for ordinary values as well as authority proofs. It has no operation phase, scope selector, false/error action table, or cross-operation scheduler.

Deny vs evaluator Error remains distinguishable because construction can fail in different ways, but enforcement is not "what to do at commit"; the operation simply cannot receive a required valid value.

**Current review state:** plausible real reduction.

**Falsifier:** refinements grow `locus`, `scope`, `combine`, timing or enforcement-action semantics to satisfy real domains.

## Attack 4 — Could callers self-authorize by forging a proof?

The first M4 versions used plain dataclass values, so a caller could conceptually manufacture one in an untrusted implementation.

M4-v2 introduces a runtime-issued seal over proof identity, basis, context, evidence and evaluator revisions. The concrete model uses HMAC-SHA256 only as a sensitivity mechanism; the semantic requirement is unforgeable authority provenance from the trusted runtime boundary.

The permanent forgery regression changes sealed evidence while keeping the validated context identical and requires `ForgedProof`.

**Current review state:** bounded attack answered.

**Production requirement:** proof constructors/types must not expose a public unchecked construction path. Language/API design must make runtime issuance authoritative.

## Attack 5 — Context substitution / TOCTOU

This attack falsified M4-v1 after a green run.

Revision, target and operation identity alone did not stop:

```text
validate state S1 -> obtain PostStateValid
same revision -> commit different state S2
```

or changed Action parameters.

M4-v2 binds proof to an exact semantic-context digest including inputs and pending/proposed state, and verifies that digest at invocation. Separate regressions distinguish context mismatch from proof forgery.

**Current review state:** the discovered counterexample is repaired without reintroducing RuleBinding.

## Attack 6 — Actor/workload/represented-principal self-assertion

The toy API accepts `actor="alice"` as a test parameter. That must not become production semantics.

If an untrusted caller can choose actor/workload/represented-principal while minting a proof, the authorization system is meaningless even if the proof is perfectly sealed afterwards.

Production proof construction must derive these identities from trusted execution/session/workload context, and any `on behalf of` representation must itself be evidenced/authorized.

**Review state:** `open production boundary`; not a reason by itself to restore RuleBinding.

This must be tested in #71/runtime work before R6 promotion.

## Attack 7 — Global revision is too coarse

Current proof freshness uses one revision counter. This safely invalidates too much, not too little.

A practical system needs dependency-sensitive `StateBasis` or equivalent digest so an unrelated stock observation does not invalidate a purchase authorization unnecessarily.

The reduction survives only if dependency basis remains a property of proof validity/context. If the runtime needs a registry that dynamically discovers which rules/dependencies apply at each locus, the RuleBinding job returns.

**Review state:** open optimization/precision question; safe bounded semantics, incomplete production semantics.

## Attack 8 — Can a global invariant really live on the lowest authority boundary?

M4-v2 requires `PostStateValid` on both Action commit and modeled admin ledger commit. The M2 sensitivity mutant demonstrates why an Action-local check is insufficient.

The architecture claim is stronger than the toy model: there must be exactly controlled authority paths for accepted-state mutation, and every path that changes protected state must require the relevant refined proof.

#157 deliberately attacks the privileged paths not modeled here: import, replay, migration, repair, privacy, restore, projection rebuild and reconciliation.

**Review state:** #156 bounded evidence supports the pattern; no-bypass remains gated on #157.

## Attack 9 — Does PDP combination disappear into opaque code?

M4-v2 proposes that Cedar/OpenFGA/OPA-specific combination semantics live inside a typed PDP Computation. The proof carries determining evidence and evaluator/model revision.

This avoids a universal RuleBinding `combine` algebra, but could damage static analysis or explanation if the PDP becomes opaque arbitrary code.

**Review state:** `hypothesis`.

The Computation contract must expose enough typed result/evidence/model metadata for policy tooling to remain inspectable. If cross-policy composition must be modeled outside the PDP to satisfy enterprise explanation/governance, R6 may need a separate authority semantic construct—but that construct need not necessarily be RuleBinding.

## Attack 10 — Does the capability runtime have an independent reason to exist?

Yes in the current architecture thesis: Computation must not gain ambient authority to mutate accepted state, use credentials, dispatch external I/O or cross tenant/environment boundaries.

The malicious-refinement sensitivity test demonstrates one part: a Computation that mutates state is detected, state is restored, and the value is not minted.

Thus the runtime authority boundary is not introduced solely to simulate business rules.

**Review state:** strong runtime-pressure argument, still implementation-neutral.

## Hidden-dispatch audit

In the M4/M4-v2 candidate region, the checker rejects AST identifiers for:

```text
RuleBinding
CapabilityType
locus
scope_kind
_bindings_for
bindings_for
_enforce
```

M1/M3 are intentionally allowed to contain dispatch concepts because they are sensitivity controls.

Current M4-v2 runtime operations are:

```text
construct refined Type value
verify proof/value against required Type + target + operation + basis + exact context + seal
invoke privileged operation if its ordinary typed signature is satisfied
```

No hidden rule discovery was found in this bounded model.

## Verification assessment

The verification history is stronger than one clean run:

1. checker itself produced a prose false-positive and was corrected to AST inspection;
2. dedicated `CapabilityType` passed but was manually rejected as possible primitive substitution;
3. generic refined Type model passed;
4. manual red-team then discovered context substitution despite that green;
5. context-binding regressions captured the flaw;
6. the forgery regression initially conflated context mismatch with seal tampering and was isolated;
7. M4-v2 now requires exact-context binding and runtime anti-forgery issuance.

This history is evidence that the kill test is capable of falsifying its favored candidate.

It still does not prove production concurrency, distributed identity, liveness, complete authorization semantics, migration/privacy no-bypass or universal minimality.

## Interim verdict

Pending exact-head CI on the complete review/index artifacts, the strongest conclusion justified by #156 is:

> `RuleBinding` is **not currently shown irreducible**. A materially different four-form candidate, `R6-capability = Type + Relation + Computation + Action`, survives the bounded attacks when Type supports generic refinements and privileged operations require runtime-issued, exact-context-bound, unforgeable proof values.

This is stronger than merely saying "RuleBinding may reduce to data". M1 proved that data + dispatcher is fake reduction. R6 removes phase/scope rule discovery from the bounded candidate.

However, #156 alone is insufficient to delete RuleBinding from RFC-0002. #157, #158 and #71 are explicit promotion blockers.

## Review transition rule

This file may become `review-clean` only after:

- evidence/index/checker coherence is enforced in CI;
- exact final SHA passes #156 tests + cross-ontology regressions + PostgreSQL 18;
- candidate remains `hypothesis` / `not-accepted`;
- RFC-0002 remains unchanged.

`review-clean` would mean only that no contradiction found inside #156 requires discarding R6-capability before downstream falsification.
