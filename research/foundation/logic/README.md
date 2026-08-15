# Functions, constraints, policies, and planning

**Issue:** [#8](https://github.com/EnzoTironi/OS/issues/8)  
**Status:** investigating  
**Decision:** undetermined  
**Retrieved:** 2026-08-15  
**Q9:** not settled

## Question

How many logic forms does OS actually need?

RFC-0001 and `docs/open-questions.md` Q9 float a collapse:

```text
Constraint = Function<Context, Bool> + enforcement
Policy     = Function<Principal, Action, Resource, Context, Bool> + fail-closed
```

This note tests that collapse against Palantir Functions/Actions, Cedar, OpenFGA, CEL/OPA, MiniZinc, Design by Contract, and ERP validation. It does not promote a primitive set.

## Verdict

A boolean Function plus a flag is not enough.

The boolean body often reduces. The thing that does not reduce is the **binding**. Who is obligated, when the check runs, how errors combine, and what a yes/no means.

Cedar's authorizer is the sharpest counterexample. A policy evaluates to `true`, `false`, or `error`. The decision is then `Allow` or `Deny` by default-deny, forbid-overrides-permit, and skip-on-error. That algebra is not `bool && failClosed`. Kubernetes CEL admission splits the same gap another way. A false validation and a CEL runtime error are different knobs (`validationActions` vs `failurePolicy`).

Search is a second non-collapse. MiniZinc distinguishes parameters from decision variables, and `solve satisfy` from `solve minimize`. Checking a plan is evaluation. Finding a plan is search.

`docs/open-questions.md` Q9 stays open. This package supplies evidence and a reduction attempt, not an answer.

## How the compared systems work

**Overview.** Mature systems keep a small expression language and then attach it to different jobs. Palantir puts reusable code in Functions and mutation in Actions. Cedar and OpenFGA answer authorization, not general computation. CEL is an embeddable expression. OPA is a general policy document language whose combination rules the caller writes. ERP stacks split derive, validate, and submit. Constraint solvers search.

**Key concepts.**

- **Eval.** Typed computation over known inputs. CEL expressions, Palantir `@Query()`, Odoo compute methods.
- **Search.** Assign unknown decision variables under constraints, optionally against an objective. MiniZinc `solve`.
- **Bind.** Attach an Eval or Search result to an obligation, a locus, and an error algebra. Cedar authorization, Kubernetes admission, Frappe `validate` vs `on_submit`.

**Where things live in this folder.**

| File | Job |
| --- | --- |
| [sources.md](sources.md) | Exact URLs, retrieval date, license posture |
| [evidence.md](evidence.md) | Cited observations, labeled by kind |
| [comparative-matrix.md](comparative-matrix.md) | Convergence and divergence |
| [reduction.md](reduction.md) | Smallest set, then loss cases |
| [enforcement-loci.md](enforcement-loci.md) | Read, preview, commit, effect, projection |
| [candidate-laws.md](candidate-laws.md) | Laws, counterexamples, runtime pressure, decision state |
| [open-questions.md](open-questions.md) | What remains unresolved |

**Gotchas.**

- Palantir "derived properties" and Workshop "function-backed columns" are different product paths. Treat them as two forms.
- Cedar skip-on-error is a designed safety property, not a bug. Calling Cedar fail-closed without that caveat is wrong.
- Odoo `@api.constrains` does not fire unless the named fields are in the `create`/`write` values. Official docs say an override of `create` is needed to test absence.
- Odoo onchanges are form-only. Official docs say never put business logic there.
- Frappe/ERPNext and Odoo are copyleft. Notes here are conceptual. No implementation was copied.

## Evidence kinds

Every claim in this folder is one of:

- **domain-evidence.** A real-world distinction forced by operations.
- **source-artifact.** A product or language construct.
- **candidate-law.** A smallest claim that would explain several sources.
- **counterexample.** A case that would falsify a candidate law.
- **runtime-consequence.** An enforcement or audit property if a law survived.

## Related issues left to siblings

- #6 provenance and confidence
- #7 Action / Event / Effect / unknown
- #9 ontology revision and historical replay
- #10 where nondeterminism may exist

Wave B/C runtime and synthesis stay parked.

## Contract

`docs/swarm-result-contract.md` is not on `origin/main`. This package follows the Agent output contract in `docs/swarm-research-backlog.md`.
