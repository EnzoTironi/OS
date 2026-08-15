# Open questions

**Retrieved:** 2026-08-15  
None of these is answered. `docs/open-questions.md` Q9 is **not** settled.

## Q9 remains open

The tempting collapse is still a research object:

```text
Constraint = Function<Context, Bool> + enforcement
Policy     = Function<PARC, Bool> + fail-closed
```

This package shows losses (see [reduction.md](reduction.md) loss table). Losses are not a veto. They are the conditions a later collapse must discharge.

A later agent may still conclude OS exposes three names and compiles them to Eval+Bind. That would be a **surface** decision, not evidence that the three are one semantic form.

## Unresolved here

1. **Is OpenFGA-style relation reachability an Eval, a fourth job, or a pattern over Facts?** Graph Check is the weakest fit for R3. Domain issues on party/org and GRC (#14, #31) should try to break or absorb it.

2. **Which error algebra is default for authority Bind?** Cedar skip-on-error, Kubernetes Fail, OPA caller-defined. Constitution §18 wants a falsifiable pick. Not picked.

3. **Must Search be visible in the ontology language?** MiniZinc evidence says the job exists. It does not say the keyword `solve` belongs next to `Action`.

4. **Can a derived property ever carry a Constraint?** Palantir says no for its derived properties. The thesis journal example wants `BalancedJournal` over `DebitTotal`/`CreditTotal`. Those totals look like derived Evals plus a commit Bind. Confirm on a real ledger corpus (#20, #32, #33).

5. **How is an external-read Eval pinned?** Quote id, as-of time, content hash. Cross-link #6 and #9. Without a pin, S-012 fails for price-dependent discounts.

6. **Where may an agent Eval sit?** Q10. This package only claims it must not be a system or authority Bind until a typed result is committed by an Action.

7. **Are SQL-level and application-level Constraints one Bind with two runtimes, or two meanings?** Odoo treats them as one invariant family with different strength. Frappe `validate` is application-only. If agents or bulk loaders can skip application hooks, the SQL-shaped Bind is the one that is real.

8. **Does Policy participate in provenance?** Cedar determining policies are already an audit object. Whether that object is PROV Activity or a Fact about an Action is #6.

9. **Preview for solvers.** Is a Palantir Scenario a Search sandbox, a preview locus, or both? If both, Bind and Search compose. If they leak into each other, R3 is wrong.

10. **Kill-test #56.** If R3's Bind metadata is "too many primitives in disguise," the honest move is to drop Bind from the language and keep it as runtime. That would reopen Q9 rather than close it.

## What would close Q9

All of the following, together:

- A Gate type that encodes L7's four negatives without a side channel.
- A worked order-to-cash and journal-post example with no admin bypass.
- A Cedar-like policy pack and an ERP invariant pack using the same Gate, with audit trails a human can tell apart.
- A kill-test that fails to force a hidden second algebra.

Until then the decision state stays `undetermined`.
