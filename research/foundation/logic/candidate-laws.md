# Candidate laws, counterexamples, runtime pressure

**Retrieved:** 2026-08-15  
**Decision state:** hypothesis  
**Q9:** not settled

Laws are the smallest claims that fit [evidence.md](evidence.md). Each law names what would kill it.

## L1. A boolean body is not a logic form

**Claim.** Several sources share boolean expressions (CEL, Cedar `when`, Odoo Python, Eiffel assertions). The form that matters is the **binding**. Obligation, locus, and error algebra.

**Kind:** candidate-law

**Support.** Cedar fold ≠ bool. Kubernetes false vs error. Eiffel require/ensure/invariant. Odoo compute vs constrain. Frappe validate vs submit.

**Counterexample that would kill it.** A single `Function<Context, Bool>` API that reproduces Cedar diagnostics, K8s `validationActions` × `failurePolicy`, and Eiffel blame assignment without extra metadata the runtime interprets as a second language.

**Runtime-consequence.** If L1 survives, the engine can share one expression IR and still must treat Bind as semantically visible. Authoring syntax can look like "functions." Enforcement cannot.

## L2. Authority Bind and state Bind are different until proven otherwise

**Claim.** "May this principal do this?" and "may this world look like this?" share a locus (often commit) and must not share a skip path.

**Kind:** candidate-law

**Support.** Palantir submission criteria vs Action edit rules. Cedar PARC vs ERP SQL CHECK. Constitution §1 (enforcement composition cannot reproduce safely). The admin-bypass smell in ERPs.

**Counterexample that would kill it.** A production domain where every authority rule is a state invariant over `Principal` facts, with no residual "fail closed when the principal record is missing" special case. OpenFGA 400 on unknown relation currently points the other way.

**Runtime-consequence.** Policy history for S-012 is not the same log as constraint failures. Cross-link #6 and #9.

**Q9 status.** L2 is why Q9 is not answered "three names, one Function." It is also not answered "Policy is a native primitive." Both remain possible implementations of two Binds.

## L3. Evaluate and search are different jobs

**Claim.** Checking a supplied assignment is Eval. Finding an assignment is Search. Search results carry a status (`unsat`, `sat`, `optimal`), not only a value.

**Kind:** candidate-law

**Support.** MiniZinc `par`/`var` and `solve satisfy|minimize|maximize`. Palantir Scenarios as a product-level search sandbox. MRP/planning in the thesis as deterministic logic that still *chooses*.

**Counterexample that would kill it.** A planner that is only ever invoked as `Eval(knownDemand, knownCapacity) -> uniquePlan` with a proof there is no search (functional dependency). Real MRP rarely looks like that.

**Runtime-consequence.** A solver-backed Function used as a commit Gate must Bind the **chosen** assignment. The solver log is provenance (#6), not the Action.

## L4. Preview Bind does not authorize commit

**Claim.** Any Gate evaluated on a shown or proposed world must be re-bound on the world that will persist, with current policy/function revisions.

**Kind:** candidate-law

**Support.** Palantir Scenario vs merge. Frappe draft vs submit. S-003. Ontologiq pattern in `research/reference-landscape.md` (recheck after approval). Cedar is stateless per request, which is the same idea. Each call re-evaluates.

**Counterexample that would kill it.** A domain where the approved parameter hash is sufficient and re-read is illegal (some signed, offline instruments). That would be a different Bind (obligation=caller+notary), not a collapse of preview into commit.

**Runtime-consequence.** Action invocation records must store which Bind results were used at preview and at commit. Cross-link #7 and #9.

## L5. Purity is an enforcement boundary

**Claim.** Pure Eval, external-read Eval, and outward Effect cannot share one callable without a runtime refusal.

**Kind:** candidate-law

**Support.** Palantir `@Query()` vs `Write API` only on `@OntologyEditFunction()`. Cedar effect-free policies. CEL mutation-free. Constitution §9 (timeout ≠ fail).

**Counterexample that would kill it.** A pure-looking Function that *must* call a market price feed to be correct, with a declared freshness and a recorded quote id, and with commit still possible when the feed is down. That is still L5 if the feed is typed as external-read and the downtime path is explicit.

**Runtime-consequence.** Historical replay (#9) cannot re-call the feed. It must reuse the recorded external-read or mark the decision non-replayable.

## L6. Derived values are Eval at projection, not facts, and not automatically constraints

**Claim.** A derived property is an Eval. Making it a stored fact or a Constraint is an extra Bind. Defaults differ across systems and are not yet chosen for OS.

**Kind:** candidate-law

**Support.** Palantir derived properties. Read-only, no property constraints, security fold. Odoo compute vs `store=True` vs `@constrains`. Thesis `DebitTotal` / `CreditTotal` / `BalancedJournal` already splits Eval from Constraint.

**Counterexample that would kill it.** A derived value that cannot be wrong relative to its inputs *and* cannot be unseen relative to its inputs, so projection, fact, and constraint coincide. Even then, backdated corrections (S-007) split valid-time fact from later projection.

**Runtime-consequence.** Materialization is runtime (constitution §6). Semantic derivedness is not.

## L7. Error, false, undefined, and unknown are not one "no"

**Claim.** At least four negative outcomes appear in the sources and must not be normalized too early.

| Outcome | Source |
| --- | --- |
| false | Cedar unsatisfied policy, OpenFGA no tuple, CEL `false` |
| error | Cedar policy error (skipped), CEL cost overrun, K8s runtime error |
| undefined | OPA rule without `default` |
| unknown / missing input | CEL partial eval, OpenFGA 400 on bad relation, #7 timeout |

**Kind:** candidate-law

**Support.** Citations in [evidence.md](evidence.md).

**Counterexample that would kill it.** A mapping to one fail-closed Bool that preserves Cedar's skip-on-error *and* Kubernetes default Fail *and* OpenFGA 400, without a side channel. Unlikely. That is the point.

**Runtime-consequence.** `Policy = Function + fail-closed` is already false as a universal law. Some Binds should fail closed. Cedar's authorizer, as specified, does not treat policy error as deny.

## Laws not claimed

- That Function, Constraint, and Policy are three base primitives.
- That they are one primitive.
- That Search must be a user-visible language node (it may be a Function purity with a mandated status type).
- That agent reasoning has a home in the core. Q10 stays open.
- That Q9 is answered.

## Decision state

| Item | State |
| --- | --- |
| R0 one Computation | rejected as semantic core |
| R1 Function+Gate | challenged (loses algebra, search, triggers) |
| R2 Q9 collapse | not accepted, not used as architecture |
| R3 Eval / Search / Bind | hypothesis |
| L1 through L7 | hypothesis |
| Primitive count | undetermined |

Promotion path. A law moves toward `supported` only after a domain issue in the #14 through #31 set uses it without an escape hatch, and a kill-test (#56 or #60) fails to break it.
