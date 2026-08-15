# Reduction attempt

**Retrieved:** 2026-08-15  
**Decision:** undetermined  
**Q9:** not settled

Express the candidate logic forms with the smallest set that still matches the evidence. Then name what each collapse loses.

This is a reduction, not a metamodel. RFC-0001 is not edited.

## Candidate forms in play

From issue #8, RFC-0001, and the sources:

| Form | Informal job |
| --- | --- |
| Pure Function | typed computation, no I/O, same inputs → same output |
| External Function | computation that reads or writes outside OS |
| Derived property | value defined by other values / links |
| Constraint | state or transition that must not occur |
| Policy | authority over principal × action × resource × context |
| Precondition | what must hold before a routine / Action |
| Postcondition | what the routine / Action guarantees after |
| Invariant | what must hold whenever the object is externally visible |
| Solver-backed Function | assign unknowns under constraints, optional objective |
| Agent / probabilistic Function | judgment with uncertainty |
| Enforcement locus | read, preview, commit, effect, projection |

## Attempt R0. One `Computation`

Everything is `Computation(inputs) -> value` plus metadata (purity, locus, fail mode).

**What still type-checks.** CEL expressions, Odoo compute, Palantir `@Query()`, a Cedar `when` clause, a MiniZinc arithmetic objective, an agent score.

**What it loses.**

- **Enforcement.** A false compute is a number. A false constraint must abort a write. A false policy must abort an attempt. One type cannot say which.
- **Auditability.** Cedar returns determining policy IDs. A bare value does not.
- **Meaning.** Eiffel `require` vs `ensure` vs `invariant` are the same boolean shape and three different contracts. MiniZinc `var` vs `par` are the same `int` and two different epistemic states.

R0 is too small. Rejected as a semantic core. It may still be a compiler IR.

## Attempt R1. `Function` + `Gate`

```text
Function  : typed computation, purity declared, versioned
Gate      : Function<Bool> + obligation + locus + error-algebra
```

Encodings:

| Form | Encoding |
| --- | --- |
| Derived property | Function bound at projection / read |
| Constraint | Gate(obligation=state, locus=commit) |
| Policy | Gate(obligation=authority, locus=read\|commit, algebra=default-deny) |
| Precondition | Gate(obligation=caller, locus=before) |
| Postcondition | Gate(obligation=system, locus=after, may read `old`) |
| Invariant | Gate(obligation=system, locus=after-every-exported-mutation) |
| External Function | Function(purity=external) |
| Solver | Function(purity=search) |
| Agent | Function(purity=agent, result includes uncertainty) |

This is the Q9 temptation with names on the metadata.

### What R1 keeps

- One reusable body language (CEL-like or sandboxed code).
- Palantir's split between `@Query()` and "something that can fail a submit."
- Odoo's compute vs `@constrains` as two bindings of similar Python.
- Frappe `validate` vs `before_submit` as two loci.

### What R1 loses

**1. Authorization is not a boolean.** Cedar evaluates many policies to `{true, false, error}` and folds them. The fold is the product. Diagnostics (which `forbid` won) are part of the answer. `Gate = Function<Bool>` has no fold and no third value.

Kubernetes makes the same cut with different knobs. False CEL → `validationActions`. Error / misconfig → `failurePolicy`. Collapsing both to `failClosed: true` cannot express `Deny+Audit` on false and `Ignore` on error, or the reverse.

OPA goes further. Combination is **not** in the language. `allow` is an ordinary document. R1 would smuggle a Cedar-shaped algebra into OS while claiming Policy is "just a Function."

**2. OpenFGA Check is graph reachability.** `viewer` implied by `writer` is not `Function(user, doc) -> bool` written by the app. It is a model plus tuples. Encoding it as a Function hides the data (tuples) and the question (ListObjects, Expand). A 400 on unknown relation is not `false`.

**3. Search is not evaluation.** MiniZinc decision variables are not Function inputs. `solve minimize tardiness` can return unsat, a feasible non-optimal, or a proven optimal, and can stream improving solutions. Wrapping that as `Function<Plan>` loses completeness status and the right to ask for all optima.

**4. Purity is an enforcement boundary, not a flag.** Palantir forbids `Write API` webhooks inside `@Query()`. Cedar policies are effect-free by construction. If purity is metadata on a general Function, a runtime must still **refuse** the illegal combination. That refusal is the primitive-shaped part.

**5. Derived properties carry security folding.** Palantir derived properties use the security of every object in the calculation and cannot be written by Functions or Actions. A zero-argument Function that returns a number does not automatically inherit those two properties. Odoo `compute_sudo=True` (default on stored computes in current docs) is the opposite default. Same "derived Function" story, opposite authority.

**6. Trigger sets are not the boolean.** Odoo `@constrains('price')` does not run if `price` is absent from the write. A Gate that is "the boolean plus commit" would over-claim enforcement. Official docs require a `create` override to test absence. That is a documented hole in "constraint = function + enforcement."

**7. Side effects are not Gates.** Palantir notifications and ERP webhooks run after a decision. They are Effects (issue #7). Folding them into Function loses unknown-outcome semantics.

**8. Agent uncertainty is not a Bool.** A probability or a rationale is not an allow. Converting it to a Gate without a typed judgment record hides business logic in the prompt (Q10).

R1 is the smallest set that **looks** complete. It loses enforcement, auditability, or meaning in the eight cases above.

## Attempt R2. Q9 as written

```text
Function
Constraint = Function<Context, Bool> + enforcement
Policy     = Function<PARC, Bool> + fail-closed
```

R2 is R1 with two Gate species and a single error story (fail-closed).

**Extra losses vs R1.**

- Cedar skip-on-error is **not** fail-closed. First-party docs rejected deny-on-error.
- OPA default-deny is optional. Fail-closed is a style, not a type.
- Pre/post/invariant collapse into Constraint and lose obligated party.
- Solver and agent have nowhere honest to live except "Function variants," which Q9 itself flags as open.

R2 stays a research object, not a core. Function, Constraint, and Policy may still be surface names over a richer binding. Q9 stays open.

## Attempt R3. Three jobs, not three types

Smallest set that does not immediately contradict the sources:

```text
Eval    typed computation over known, version-pinned inputs
        purity ∈ {pure, external-read}
        result is a value, not a decision

Search  assign decision variables subject to Eval-expressed constraints
        optional objective
        result is {unsat | sat | sat+bound | optimal} plus assignments

Bind    attach Eval or Search to
          obligation ∈ {caller, system, authority, none}
          locus     ∈ {read, preview, commit, effect, projection}
          on_false  ∈ {ignore, warn, deny, audit, …}
          on_error  ∈ {skip, fail, undefined}
          combine   (only when obligation=authority)
```

### Encodings under R3

| Form | R3 |
| --- | --- |
| Pure Function | Eval(pure) |
| External read | Eval(external-read) |
| External write | not logic. That is an Effect (#7) |
| Derived property | Eval bound at projection, obligation=none, plus a **read-authority fold** that is not optional |
| Constraint | Bind(Eval:Bool, obligation=system, locus=commit, on_false=deny) |
| Policy | Bind(Eval or graph-query, obligation=authority, locus=read/preview/commit, combine=specified, on_error=specified) |
| Precondition | Bind(..., obligation=caller, locus=preview+commit) |
| Postcondition | Bind(..., obligation=system, locus=after-commit, env includes `old`) |
| Invariant | Bind(..., obligation=system, locus=after every exported mutation) |
| Solver-backed Function | Search, then Bind the chosen assignment if OS will commit it |
| Agent reasoning | Eval only if purity=agent is banned from Bind(obligation=system\|authority) unless a later Action commits a typed result |

### What R3 still loses

**Graph authorization.** OpenFGA relations are not Eval. R3 would need a fourth job (`Relate`) or must admit that "Eval" here includes a specialized relation engine. That is a hidden primitive.

**Materialization.** Odoo `store=True` and Palantir object indexes are runtime. Putting them in Bind(locus=projection) mixes semantics with caching. Constitution §6 says not to promote caches.

**Historical pin.** Function version, Cedar policy set, OpenFGA model id, and ontology revision are one family (#9). R3 mentions version-pinned inputs and does not specify the pin.

**Partial information.** CEL unknown / OPA undefined / OpenFGA 400 / external timeout are four different "not yes" states. R3's `on_error` is a blunt box.

**Scenario S-003.** Stale approval is not a Function problem. It is "Bind at preview is not Bind at commit" plus rebound inputs. R3 allows two loci. It does not say they must re-run.

R3 is the working reduction for later attacks. It is a hypothesis.

## Loss table (the deliverable)

| Collapse | Enforcement lost | Auditability lost | Meaning lost |
| --- | --- | --- | --- |
| Policy → Function+fail-closed | Cedar skip-on-error; K8s false vs error; OpenFGA 400≠false | determining policies; which model id | authority vs validity |
| Constraint → Function+enforcement | Odoo trigger holes; SQL vs ORM bypass; Frappe save vs submit | why this write was legal then | obligated party; pre vs post vs invariant |
| Derived property → Function | Palantir "cannot be edited"; security of all inputs; Odoo `compute_sudo` | derivation graph (#6) | value vs fact; stored vs live |
| Solver → Function | unsat vs suboptimal vs proven optimal | search certificate, intermediate solutions | decision variable vs input |
| Agent → Function | cannot be a commit Gate | prompt/runtime as hidden rule (Q10) | judgment vs calculation |
| External write → Function | timeout ≠ fail (#7) | effect vs observation | computation vs world change |
| Preview UI → Constraint | Odoo onchange skipped on API create | none (it never ran) | assistance vs law |
| One locus for all Gates | Scenario vs merge; draft vs submit; stale approval | "what did we check when?" | preview ≠ commit |

## Smallest set that survives this pass

Not one. Not Q9's three as base primitives.

Working claim, still a hypothesis:

> OS needs a reusable **Eval**, a distinct **Search**, and a **Bind** that can differ in obligation, locus, and error algebra. Authorization Bind is not Constraint Bind until a counterexample shows one algebra serving both without leaking.

Falsify it by exhibiting a single Gate type that encodes Cedar diagnostics, Kubernetes false-vs-error, OpenFGA 400, Eiffel obligated parties, and MiniZinc solve status without hidden conventions.

Sibling kill-test #56 (too many primitives) should attack R3 from the other side.
