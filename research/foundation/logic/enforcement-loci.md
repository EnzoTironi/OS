# Enforcement loci

**Retrieved:** 2026-08-15  
Issue #8 asks where enforcement happens. The sources do not share one moment. They share a small set of moments.

## The five loci

| Locus | Question asked | If the answer is no |
| --- | --- | --- |
| **read** | May this principal see this value / object set? | omit, redact, or deny the query |
| **preview** | Would this attempt be legal on the world we show now? | block the UI / dry-run, do not write |
| **commit** | Is this attempt legal on the world we are about to persist? | abort the transaction |
| **effect** | May / did this outward call happen? | do not fire, or record unknown (#7) |
| **projection** | How is this derived value computed for this reader? | empty / error / skip materialize |

These are Bind loci in [reduction.md](reduction.md). They are not five primitives.

## Read

**source-artifact.** Cedar is invoked each time a user wants to perform an action on a protected resource. The application must call the authorizer.  
Source: [Cedar authorization](https://docs.cedarpolicy.com/auth/authorization.html)

**source-artifact.** OpenFGA Check and ListObjects are read-time. ListObjects with condition context returns different object sets as time moves (grant window example).  
Source: [OpenFGA conditions](https://openfga.dev/docs/modeling/conditions)

**source-artifact.** Palantir derived properties "use the security of all objects involved in the calculation, so they do not expose information a user would otherwise be unable to see."  
Source: [Derived properties](https://palantir.com/docs/foundry/ontology/derived-properties/)

**runtime-consequence.** If Policy is only checked at commit, list/search leaks. If derived values do not fold read authority, a Function becomes an oracle.

## Preview

**source-artifact.** Palantir submission criteria can allow an Action inside an Ontology Scenario for planners who cannot commit the same Action in the live ontology. Merge is a separate Action with its own criteria.  
Source: [Submission criteria](https://palantir.com/docs/foundry/action-types/submission-criteria/)

**source-artifact.** Ontology Manager can test-run submission criteria against parameter values without submitting.  
Source: same page

**source-artifact.** Odoo onchange updates a form without saving and is not run on programmatic create. Official docs forbid using it as the business rule.  
Source: [Odoo 19 Chapter 8](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/08_compute_onchange.html)

**source-artifact.** Google's CEL commentary. Partial evaluation can return unknown when inputs are missing.  
Source: [CEL blog 2024-06](https://opensource.googleblog.com/2024/06/common-expressions-for-portable-policy.html)

**domain-evidence.** Scenario S-003 (stale approval). Preview at 10:01 is not commit at 10:07. A receipt posted at 10:06 must be visible to the commit Bind.

**runtime-consequence.** Preview-only Gates are assistance. They do not satisfy constitution §13 unless commit rebinds.

## Commit

**source-artifact.** Palantir. "Any changes … will be committed to the Ontology when the user takes the action." Submission criteria must all pass.  
Sources: [Action types](https://palantir.com/docs/foundry/action-types/overview/), [Submission criteria](https://palantir.com/docs/foundry/action-types/submission-criteria/)

**source-artifact.** Odoo SQL constraints are table-level. Python `@constrains` run on create/write when listed fields are present.  
Sources: [Odoo 17 Chapter 10](https://www.odoo.com/documentation/17.0/developer/tutorials/server_framework_101/10_constraints.html), [ORM `constrains()`](https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html)

**source-artifact.** Frappe `validate` blocks save on insert, save, and submit. `before_submit` is an extra commit gate for the submit transition.  
Source: [Frappe controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers)

**source-artifact.** Kubernetes. Binding `validationActions: [Deny]` rejects the API request. `Warn` and `Audit` do not.  
Source: [Validating admission policy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)

**domain-evidence.** Accounting balance and "user is in Finance" both abort a post. One is a Constraint Bind. One is a Policy Bind. Same locus, different obligation. Mixing them into one list is how ERPs grow `if user == admin: skip_validate`.

## Effect

**source-artifact.** Palantir side effects (notification, webhook) send data out after an Action. Used when Foundry is not the system of record.  
Source: [Side effects](https://palantir.com/docs/foundry/action-types/side-effects-overview/)

**source-artifact.** Palantir `@Query()` must not alter an external system. `Write API` webhooks are legal only on `@OntologyEditFunction()`.  
Source: [External functions](https://palantir.com/docs/foundry/data-connection/external-functions/)

**source-artifact.** Frappe example hook. `after_insert` sends mail. That is after persist, not a validator.  
Source: [Frappe controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers)

**runtime-consequence.** Effect locus is owned by issue #7. A Function that performs the webhook cannot be the record of whether the world changed. Timeout is not `false`.

## Projection

**source-artifact.** Palantir derived properties calculate at runtime and participate in filter/sort/aggregate in the same request. They cannot carry property type constraints.  
Source: [Configure derived properties](https://palantir.com/docs/foundry/object-link-types/derived-properties/)

**source-artifact.** Odoo compute is on-the-fly unless `store=True`. Stored computes recompute when `@api.depends` fire, including across many referring records.  
Source: [Odoo 19 Chapter 8](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/08_compute_onchange.html)

**source-artifact.** MiniZinc `output` presents a found assignment. It is not a constraint.  
Source: [MiniZinc modelling](https://docs.minizinc.dev/en/stable/modelling.html)

**runtime-consequence.** Projection can be wrong for two reasons. The Eval is stale (`depends` missed a field). The reader should not see a constituent. Those are different failures. One is a bug. One is a Policy Bind at read.

## Cross-locus rules that survived this pass

1. **Commit Bind is not implied by preview Bind.** Palantir Scenario, Frappe draft/submit, S-003.
2. **Read Bind is not implied by commit Bind.** List/query and derived properties.
3. **Effect is not a Bind of a Bool.** It is an attempt with an observation (#7).
4. **Projection Eval is not a Constraint** unless a separate Bind says the stored projection must match. Palantir forbids constraints on derived properties. That is a product choice worth attacking. Accounting totals probably want both a projection and a commit Bind (thesis journal example).
