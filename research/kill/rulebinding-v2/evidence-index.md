# Evidence index — issue #156 RuleBinding reduction

**Status:** synthesis index  
**Decision:** none  
**Candidate:** `R6-capability` remains `hypothesis` and `not-accepted`.

This file maps the load-bearing claims in #156 to reviewed repository evidence and executable counterexamples. It is not fresh source mining.

## Reviewed inputs

| Source | Contribution to #156 | Evidence class |
| --- | --- | --- |
| issue #8 | Bool/Gate reduction loses obligation, locus, error algebra, policy combination, solver/agent distinctions | prior kill evidence |
| issue #40 | preview != commit, StateBasis/currentness, semantic operation identity, commit-time revalidation | runtime pressure |
| issue #41 | effect attempt/unknown/retry requires a privileged runtime boundary distinct from local commit | runtime pressure |
| issue #42 | authority requires actor/represented/workload identity, currentness, Permit/Deny/Error and determining evidence | runtime pressure |
| issue #46 | property/state testing, sensitivity mutants, bounded verification and false-green guards | verification method |
| issue #56 | `Type + Link + Function + Action` was insufficient; M4 kept Eval/Bind jobs; hidden conventions are failure | prior primitive kill evidence |
| issue #70 / RFC-0002 | R5 base forms include RuleBinding; anti-cheat rule forbids deleting a noun while recreating its dispatcher | direct attack target |

## Competitor evidence

### M1 — definition graph + dispatcher

Executable witness: `DefinitionGraphDispatcher`.

The model stores rule metadata as ordinary records and still performs target/phase lookup. `dispatch_calls` makes the hidden semantic dispatcher observable.

**Verdict:** `rejected` as reduction.

### M2 — inline Action/Type checks

Executable witness: `InlineContractEngine`.

The Action-local accounting check rejects an unbalanced post, while the independent admin mutation path produces the illegal state.

**Verdict:** `rejected` as sufficient.

### M3 — executable Relation trigger

Executable witness: `ExecutableRelationDispatcher`.

Relation only replaces RuleBinding by acquiring trigger scheduling semantics and a trigger dispatcher.

**Verdict:** `rejected` as reduction in the tested form.

### M4-v1 — refined proof values scoped by target/operation/revision

This version removed RuleBinding/locus/scope dispatch and used generic refined Types plus privileged operation signatures. It initially passed the bounded gate.

Red-team counterexample discovered after the green run:

```text
proof validates balanced proposed state S1
same revision remains current
caller reuses proof for different state S2
```

and equivalently:

```text
proof authorizes amount=5
caller reuses proof with amount=500
```

Revision/target/operation identity did not bind the proof to the exact context it validated.

**Verdict:** `rejected` as sufficient. The green run is retained as a false-green semantic lesson.

### M4-v2 — generic refined Type + exact-context-bound runtime-issued proof

Current candidate.

The same generic `TypeDef + refinements + construct()` mechanism validates both:

```text
PositiveAmount          // ordinary business value
CommitPermit            // capability-contract value
PostStateValid          // capability-contract value
```

There is no `CapabilityType` semantic class.

Operational proof values additionally carry:

```text
exact semantic-context digest
basis revision / pinned basis digest
determining evidence
evaluator revisions
runtime seal
```

Context includes target, semantic operation identity, inputs, pending/proposed state, pinned basis and payload where applicable.

**Sensitivity regressions:**

- changed proposed state -> `ContextMismatch`;
- changed Action inputs -> `ContextMismatch`;
- caller edits sealed determining evidence with same context -> `ForgedProof`;
- unrelated current revision invalidates current proof in the conservative model;
- malicious refinement mutating authoritative state -> restored + `ComputationMutation`;
- ordinary refined value cannot satisfy privileged operation signature.

**Current state:** `hypothesis`, pending adversarial review and downstream #157/#158/#71.

## Why the capability boundary is not currently counted as a fifth semantic form

The runtime needs an authority/capability boundary even if the business ontology contains no Policies, Constraints or Invariants: ordinary Computations must not be able to mutate authoritative state, use credentials, dispatch external I/O or cross tenant/environment authority.

#156 therefore tests reuse of an independently necessary runtime boundary rather than introduction of a new business semantic sort.

The proof value itself is an instance of generic Type semantics under a standard `capability` contract. If future implementation requires a distinct semantic Type species with independent composition/evolution laws, this argument fails.

## Why operation signatures are not currently counted as RuleBinding

M4-v2 does not search declarations by `locus` or `scope`. A privileged operation has an ordinary typed requirement:

```text
commit:Purchase(CommitPermit, PostStateValid, ...)
```

A proof is constructed before invocation under generic Type refinement semantics and verified against the exact invocation context.

The reduction fails if runtime later needs to ask "which rules apply at commit?" or dynamically schedule evaluator attachments by operation phase. The AST anti-cheat guard rejects `locus`, `_bindings_for`, `_enforce`, `RuleBinding`, and `CapabilityType` identifiers in the candidate region.

## Load-bearing laws

The strongest current evidence supports:

- L-RB-01..03: M1/M2/M3 do not reduce RuleBinding;
- L-RB-07: capability isolation has an independent runtime reason;
- L-RB-10: preview proof cannot substitute for commit proof;
- L-RB-13: Deny and evaluator Error remain distinct;
- L-RB-15: determining evidence/evaluator revision travel with proof;
- L-RB-16: read and external-effect attempt authority are distinct;
- L-RB-18: operational proof must be exact-context-bound and unforgeable;
- L-RB-20: #156 alone cannot supersede R5.

The rest remain hypotheses because real backend/no-bypass/type-system pressure can still falsify them.

## Verification history

Important runs, all on branch `research/issue-156-rulebinding-reduction`:

- run `31949270473`: failed because the first anti-cheat checker grepped explanatory prose; corrected to AST identifier inspection;
- run `31949322363`: M4 with dedicated `CapabilityType` passed, then was rejected by manual red-team as possible primitive substitution;
- run `31949474462`: generic Type-refinement M4 passed full #156 + cross-ontology + PostgreSQL 18 gate;
- after that green, manual red-team discovered context substitution, proving the run insufficient;
- run `31949626438`: context-bound hardening tests captured the new failure family; one forgery test initially conflated context substitution with tampering;
- run `31949750222`: isolated context-substitution and HMAC-forgery regressions passed on head `46de3230e764e9a5c46426b7cb47ca06d8bcc565`;
- later exact-head runs must be cited by `review.md` before the shard becomes `review-clean`.

A green run is evidence about the bounded models, not proof of production architecture or universal minimality.

## Open pressure before any R5 -> R6 promotion

1. **Trusted execution identity.** Test code passes `actor="alice"` for convenience. Production callers must not self-assert actor/workload/represented-principal. These values must come from trusted execution context.
2. **Dependency basis.** Global revision is conservative. A production proof likely needs a declared dependency/StateBasis digest; that must not revive a locus/scope scheduler.
3. **Authorization composition.** Keeping combination semantics inside a typed PDP Computation must preserve static analysis and explanation.
4. **No raw authority path.** #157 must attack business/admin/import/migration/privacy/repair/restore paths below the proposed signature boundary.
5. **Type semantics.** #158/#62 may reveal that refined capability values require a stronger Type system than currently modeled.
6. **Cross-cycle acceptance.** #71 must reuse R6-capability across order, inventory, manufacturing and accounting semantics.

These are promotion blockers, not optional polish.
