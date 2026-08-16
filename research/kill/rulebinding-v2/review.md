# Adversarial review — issue #156 RuleBinding reduction

**Status:** review-clean  
**Architecture decision:** none  
**Candidate:** `R6-capability` remains `hypothesis` and `not-accepted`.  
**Exact-head evidence:** must be refreshed after the identity-binding hardening below.

This review asks whether M4-v2 genuinely removes `RuleBinding` or merely redistributes the same semantic job into Type refinements, capability values, operation signatures, or trusted runtime code. `review-clean` does not make R6 the architecture and does not update RFC-0002.

## Review basis

The review covers R5 from #70; M1 graph-dispatch, M2 inline and M3 executable-Relation competitors; generic refined Type M4; explicit removal of `CapabilityType`; context-substitution counterexamples; exact-context-bound + sealed M4-v2; property/sensitivity tests; cross-ontology regressions; PostgreSQL 18; L-RB-01..20; and the evidence index.

## Attack 1 — Did `CapabilityType` simply replace RuleBinding?

The first serious M4 version did define a dedicated `CapabilityType`. It was rejected manually despite green CI because it could merely exchange one primitive for another.

The current model removes that class. The same `TypeDef + refinements + construct()` semantics validate both ordinary `PositiveAmount` and authority values such as `CommitPermit` and `PostStateValid`. The `capability` marker is a standard Type contract, not a separate base form in the bounded model.

**Verdict:** this primitive-substitution attack is answered in M4-v2.

**Falsifier:** real Type semantics force authority proofs into a separate identity/composition/evolution category rather than a Type contract.

## Attack 2 — Is Operation Signature just RuleBinding under another name?

R5 RuleBinding conceptually says: at locus L on scope S, discover evaluator E and enforce it under basis/algebra B.

M4-v2 says: operation O has typed inputs; among them are proof values P1..Pn. There is no candidate lookup by `locus` or `scope`, no `_bindings_for`, and no dynamic scheduling because an operation entered a phase. Proof construction follows generic Type refinement; invocation verifies the exact required Types against the exact invocation context.

**Verdict:** no hidden RuleBinding dispatcher found in the bounded candidate.

**Falsifier:** composition requires dynamic discovery of “all rules applying at this phase” rather than ordinary typed operation requirements.

## Attack 3 — Are Type refinements themselves RuleBindings?

This is the closest semantic resemblance. A refinement is attached from Type to Computation.

The current distinction is smaller and independently useful: a value does not inhabit Type T unless T's refinement validates that value/context. The same mechanism validates ordinary values. It has no operation phase, scope selector, enforcement-action table, or cross-operation scheduler.

**Verdict:** plausible real reduction.

**Falsifier:** refinements must grow `locus`, `scope`, `combine`, timing or enforcement-action semantics to satisfy real domains.

## Attack 4 — Could callers forge authority?

M4-v2 runtime-issues and seals operational proof values over Type, context, basis, determining evidence and evaluator revisions. The HMAC in the bounded model is only a concrete sensitivity mechanism; the semantic requirement is unforgeable authority provenance from trusted runtime.

The permanent forgery regression keeps semantic/execution context unchanged, modifies sealed evidence, and requires `ForgedProof`.

**Verdict:** bounded attack answered.

**Production requirement:** no public unchecked constructor may manufacture or retarget an authority proof.

## Attack 5 — Context substitution / TOCTOU

This attack falsified M4-v1 **after a green run**.

Revision, target and operation identity alone allowed a proof for proposed state S1 or input I1 to be reused for S2/I2 within the same revision. The first M4-v2 hardening bound inputs/state/payload but still omitted the execution identity that could have determined authorization.

That omission was another real transfer hole: a proof minted while `actor=alice`, `represented_principal=org:buyer`, `workload=svc:purchasing` could otherwise be presented under Bob/another principal/another workload when target/inputs/state were unchanged.

The current candidate therefore binds the proof context to:

```text
target
semantic operation identity
actor
represented principal
workload
inputs
proposed/pending state
pinned basis
payload where relevant
```

Permanent regressions now distinguish input/state substitution, actor substitution, represented-principal substitution, workload substitution and proof-field forgery.

**Verdict:** the discovered bounded substitution attacks are repaired without reintroducing RuleBinding.

## Attack 6 — Actor/workload/represented-principal self-assertion and trusted origin

Binding identity into the proof is necessary but not sufficient. If an untrusted business caller is allowed to choose `actor`, `represented_principal`, or `workload` for both proof minting and invocation, the runtime can still faithfully seal a lie.

The bounded model passes those values explicitly so the transfer property is testable. Production semantics require the operation boundary to derive them from trusted session/workload identity; any `on behalf of` represented-principal edge must itself be authorized/evidenced.

**Verdict:** proof **transfer** across identities is now closed in the bounded model. Trusted **origin** of those identities remains a runtime boundary for #71/#53/#42, not evidence for restoring RuleBinding.

**Kill criterion:** if satisfying trusted identity origin requires a dynamic rule/locus dispatcher rather than an existing authentication/delegation capability boundary, R6 fails.

## Attack 7 — Global revision is too coarse

Current freshness uses one revision counter. It safely invalidates too much, not too little. Production likely needs dependency-sensitive `StateBasis` or an equivalent digest.

R6 survives only if dependency basis remains proof-value validity. If runtime must rediscover which rules/dependencies apply at each operation phase, the RuleBinding job returns.

**Verdict:** safe bounded semantics; incomplete production precision.

## Attack 8 — Can a global invariant really live on the lowest authority boundary?

M4-v2 requires `PostStateValid` on both modeled Action commit and modeled admin commit. M2 proves Action-local checking is insufficient.

The stronger architecture claim is that accepted-state mutation has controlled authority boundaries and every protected mutation path must present relevant proofs. #157 attacks import, replay, migration, repair, privacy, restore, projection rebuild and reconciliation.

**Verdict:** #156 supports the pattern; no-bypass is still gated on #157.

## Attack 9 — Does PDP combination disappear into opaque code?

M4-v2 lets a typed PDP Computation own Cedar/OpenFGA/OPA-specific combination semantics and return `Permit | Deny | Error + determining evidence + model revision`.

This avoids a universal RuleBinding `combine` algebra, but only works if PDP computation remains statically typed and explainable rather than opaque arbitrary code.

**Verdict:** `hypothesis`. A future need for cross-policy composition outside the PDP may require a stronger authority semantic construct, though not necessarily RuleBinding.

## Attack 10 — Does capability runtime have an independent reason to exist?

Yes as runtime pressure: ordinary Computation must not gain ambient authority to mutate accepted state, use credentials, dispatch external I/O or cross tenant/environment boundaries. The malicious-refinement sensitivity test demonstrates one such boundary by detecting mutation, restoring state and refusing value construction.

**Verdict:** strong independent-runtime-pressure argument.

## Hidden-dispatch audit

The checker rejects M4 AST identifiers for:

```text
RuleBinding
CapabilityType
locus
scope_kind
_bindings_for
bindings_for
_enforce
```

M1/M3 retain dispatch identifiers intentionally as sensitivity controls.

Current M4-v2 runtime operations are only:

```text
construct generic refined Type value
verify runtime-issued proof against required Type + target + operation + trusted execution identity + basis + exact business context + seal
invoke privileged operation when its typed signature is satisfied
```

No hidden rule discovery was found in the bounded model.

## Verification assessment

The history matters more than a single green run:

1. checker produced a prose false-positive and was corrected to AST inspection;
2. dedicated `CapabilityType` passed but was rejected as possible primitive substitution;
3. generic refined Type model passed;
4. manual red-team found state/input context substitution despite that green;
5. new regressions captured the flaw;
6. forgery test initially conflated context mismatch with tampering and was isolated;
7. a later deep review found actor/represented-principal/workload were still omitted from the context digest despite the review noting trusted identity as a production boundary;
8. the model now binds trusted execution identity as part of exact context and has permanent cross-identity transfer regressions;
9. the next exact-head CI run must pass #156 tests, cross-ontology regressions, reviewed runtime models and PostgreSQL 18 before merge.

This demonstrates that the kill test can falsify its favored candidate. It does not prove production concurrency, identity-provider trust, distributed liveness, migration/privacy no-bypass or universal minimality.

## Review verdict

The strongest conclusion justified by #156 remains:

> `RuleBinding` is **not currently shown irreducible**. A materially different four-form candidate, `R6-capability = Type + Relation + Computation + Action`, survives the bounded attacks when Type supports generic refinements and privileged operations require runtime-issued, exact-context-bound, unforgeable proof values.

“Exact context” now explicitly includes execution identity when identity affects authority; it is not limited to target/inputs/state.

This is stronger than “RuleBinding may reduce to data”: M1 proved data + dispatcher is fake reduction. R6 removes phase/scope rule discovery from the bounded candidate.

#156 alone is insufficient to delete RuleBinding from RFC-0002. #157, #158 and #71 remain explicit promotion blockers. RFC-0002 stays unchanged.

`review-clean` means only that no contradiction inside #156 requires discarding R6-capability before those downstream falsifiers. It does not mean accepted architecture, proven minimality or production readiness.
