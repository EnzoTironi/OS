# Evidence

**Retrieved:** 2026-08-15  
Each block is one observation. Kind is `domain-evidence` or `source-artifact`. Laws live in [candidate-laws.md](candidate-laws.md).

## Palantir

**source-artifact.** Foundry Functions run server-side in an isolated environment. Official use cases include Workshop values, function-backed table columns, aggregations, function-backed Actions that edit many objects, Slate/Quiver metrics, **external functions** that query other systems, and Python sidecars in Pipeline Builder.  
Source: [Functions overview](https://palantir.com/docs/foundry/functions/overview/)

**source-artifact.** External Functions call Data Connection webhooks. A `@Query()` function is read-only and must not alter an external system. An `@OntologyEditFunction()` can later back an Action. Webhooks marked `Write API` may be used only in `@OntologyEditFunction()`.  
Source: [External functions](https://palantir.com/docs/foundry/data-connection/external-functions/)

**source-artifact.** An Action type is one transaction of object/property/link edits plus side-effect behavior. The same action logic and validations are available across applications.  
Source: [Action types overview](https://palantir.com/docs/foundry/action-types/overview/)

**source-artifact.** Submission criteria (formerly validations) decide whether an Action can be submitted. They are independent of permissions that govern editing the Action type itself. All listed criteria must pass. Criteria can read current user, parameters, and whether the Action runs inside an Ontology Scenario.  
Source: [Submission criteria](https://palantir.com/docs/foundry/action-types/submission-criteria/)

**source-artifact.** A function-backed Action pins a Function version by default. Auto-upgrade resolves a version range at runtime. Official security note. Users who cannot edit the Action can still change its behavior by editing the Function. Provenance of the Action is the object types the selected minimum Function version may edit. Extra object types in a newer release fail execution.  
Source: [Function-backed actions](https://palantir.com/docs/foundry/action-types/function-actions-getting-started/)

**source-artifact.** Side effects are notifications and webhooks. Palantir names the non-Foundry-source-of-truth pattern "decision orchestration."  
Source: [Side effects](https://palantir.com/docs/foundry/action-types/side-effects-overview/)

**source-artifact.** Derived properties are calculated at runtime from other properties or links. They use the security of **all** objects in the calculation. They are read-only and cannot be edited by Functions or Actions. They cannot be required, cannot carry property type constraints, and cannot be primary keys.  
Sources: [Derived properties](https://palantir.com/docs/foundry/ontology/derived-properties/), [Configure derived properties](https://palantir.com/docs/foundry/object-link-types/derived-properties/)

**source-artifact.** The object-backend overview splits "semantic elements (objects, properties, links)" from "kinetic elements (actions, functions, dynamic security)."  
Source: [Object backend overview](https://palantir.com/docs/foundry/object-backend/overview/)

**domain-evidence.** Palantir's Scenario exception is an operational need. Planners may try aircraft assignments that a flight controller would be forbidden to commit. Preview and commit do not share one authority check.  
Source: [Submission criteria](https://palantir.com/docs/foundry/action-types/submission-criteria/) (airline / Scenario example)

## Cedar

**source-artifact.** A request is PARC. Principal, Action, Resource, Context. Each policy evaluates to `true`, `false`, or `error`. Combination rules are fixed.

1. Any satisfied `forbid` → `Deny`
2. Else any satisfied `permit` → `Allow`
3. Else `Deny`

Diagnostics name determining policies and erroneous policies.  
Source: [Authorization](https://docs.cedarpolicy.com/auth/authorization.html)

**source-artifact.** Cedar states three properties. Default-deny. Forbid-overrides-permit. Skip-on-error. Skip-on-error is deliberate. Deny-on-error was rejected because a broken 101st policy would start denying every request. Applications may still read diagnostics and choose a stricter decision.  
Sources: [Authorization](https://docs.cedarpolicy.com/auth/authorization.html), [Security](https://docs.cedarpolicy.com/other/security.html)

**source-artifact.** Cedar has a Lean formal model, a Rust engine, and differential testing between them. Policies of bounded size terminate and are effect-free. Cedar authorizes. It does not authenticate.  
Source: [Security](https://docs.cedarpolicy.com/other/security.html)

**counterexample seed (Cedar vs "fail-closed Function").** A policy that errors is skipped, not treated as `false`. `Function<PARC, Bool>` has no third value and no combination algebra. See [reduction.md](reduction.md).

## OpenFGA

**source-artifact.** Check answers "does user X have relation Y with object Z?" by resolving the authorization model plus tuples. It is not a general predicate language. Read returns stored tuples only. It does not expand the graph.  
Source: [Relationship queries](https://openfga.dev/docs/interacting/relationship-queries)

**source-artifact.** If the relation is defined and no matching tuple exists, Check returns `allowed: false`. If the relation is **not** defined in the model, Check returns HTTP 400, not `false`.  
Source: [Perform a Check](https://openfga.dev/docs/getting-started/perform-check)

**source-artifact.** A Condition is a named CEL expression with typed parameters. Conditional tuples require the condition to evaluate truthy. At request time, persisted tuple context and request context merge. **Persisted context wins.** Default CEL cost budget is 100. Tuple condition context is capped at 32KB.  
Sources: [Concepts](https://openfga.dev/docs/concepts), [Conditions](https://openfga.dev/docs/modeling/conditions)

**source-artifact.** Checks should pass an `authorizationModelId`. Latest-model fallback exists. Pinning is recommended.  
Source: [Perform a Check](https://openfga.dev/docs/getting-started/perform-check)

## CEL and Kubernetes

**source-artifact.** CEL evaluates in linear time, is mutation-free, and is not Turing-complete. The usual result is Boolean. Object construction is also in the spec.  
Source: [cel-spec README](https://github.com/cel-expr/cel-spec)

**source-artifact.** Kubernetes evaluates CEL inside the API server. Expressions have a runtime cost budget. Exceeding it halts evaluation and errors.  
Source: [CEL in Kubernetes](https://kubernetes.io/docs/reference/using-api/cel/)

**source-artifact.** `ValidatingAdmissionPolicy.failurePolicy` is `Fail` (default) or `Ignore`. It covers parse, type-check, runtime, and misconfiguration errors. It does **not** define what happens when a validation expression is false. False validations are enforced by the binding's `validationActions` (`Deny`, `Warn`, `Audit`).  
Source: [Validating admission policy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)

**source-artifact.** Google's CEL commentary describes four-valued logic. True, false, error, unknown. Partial evaluation can say "need more input." This is not a probability.  
Source: [Google Open Source Blog, 2024-06](https://opensource.googleblog.com/2024/06/common-expressions-for-portable-policy.html)

## OPA / Rego

**source-artifact.** `allow` and `deny` are not keywords. Conflict resolution is a document the caller names. OPA's FAQ shows default-allow, default-deny, and `authz { allow; not deny }`.  
Source: [OPA FAQ](https://openpolicyagent.org/docs/faq)

**source-artifact.** `default allow := false` is how authors get a defined deny when rules are undefined. That is a convention, not a language-enforced authorizer.  
Source: [Rego `default`](https://openpolicyagent.org/docs/policy-reference/keywords/default)

**source-artifact.** Rego functions take infinitely many inputs. Rules are defined for finitely many inputs and support iteration. Safety is a compiler requirement on rules.  
Source: [OPA FAQ, Functions versus rules](https://openpolicyagent.org/docs/faq)

## Design by Contract

**source-artifact.** Eiffel `require` binds the caller (precondition). `ensure` binds the supplier (postcondition). `old expression` is valid only in `ensure`. A class `invariant` must hold after creation and after every exported routine. The invariant is implicitly added to both pre and post of exported routines.  
Sources: [ET. Design by Contract](https://www.eiffel.org/doc/eiffel/ET-_Design_by_Contract_(tm),_Assertions_and_Exceptions), [I2E. Design by Contract](https://www.eiffel.org/doc/eiffel/I2E-_Design_by_Contract_and_Assertions)

**domain-evidence.** "Balance >= 0 after every exported mutation" and "caller passed a non-negative deposit" are both booleans. They name different obligated parties. Collapsing them to `Function<Context, Bool>` drops who is at fault when the boolean is false.

## MiniZinc

**source-artifact.** Parameters (`par`) are fixed. Decision variables (`var`) are unknown until solve. Constraint items must all hold. A model has at most one solve item. Forms are `solve satisfy`, `solve maximize <expr>`, `solve minimize <expr>`. Omit the solve item and the model is satisfaction.  
Source: [MiniZinc Handbook, basic modelling](https://docs.minizinc.dev/en/stable/modelling.html)

**domain-evidence.** "Is this production plan feasible?" is evaluation. "Find a feasible plan that minimizes tardiness" is search. The second introduces variables the caller does not supply.

## Odoo

**source-artifact.** Two official invariant channels. `_sql_constraints` become table constraints. `@api.constrains` runs Python and must raise `ValidationError`. Official advice. Prefer SQL when it can express the rule.  
Source: [Odoo 17. Chapter 10](https://www.odoo.com/documentation/17.0/developer/tutorials/server_framework_101/10_constraints.html)

**source-artifact.** `@constrains` fires only if the named fields are in the `create` or `write` call. Dotted relational names are ignored. Fields absent from a view will not trigger on create. Official text says override `create` to test absence.  
Source: [Odoo 18 ORM, `constrains()`](https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html)

**source-artifact.** Computed fields are not stored by default. `store=True` writes them and enables search. They are read-only unless an `inverse` is declared. Inverse runs on save. Compute runs when dependencies change.  
Source: [Odoo 19. Chapter 8](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/08_compute_onchange.html)

**source-artifact.** Onchanges update a form without saving. Official rule. Never use an onchange to add business logic. They are not triggered on programmatic create.  
Source: [Odoo 19. Chapter 8](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/08_compute_onchange.html)

**domain-evidence.** "Total area = living + garden" is a derived value. "Selling price may not be below 90% of expected" is an invariant. Odoo gives them different hooks. Putting the invariant in compute or onchange would not block API writes.

## Frappe / ERPNext

**source-artifact.** Controller hooks split the document lifecycle. `validate` throws and blocks save on insert, save, and submit. `before_submit` / `on_submit` run only on submit. `before_cancel` / `on_cancel` run only on cancel. `on_change` also runs on `db_set` and official text says it should be idempotent.  
Source: [Frappe controllers](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers)

**domain-evidence.** A draft Sales Order can be saved under `validate` and still be illegal to submit. Save-time validity and submit-time validity are different gates. That is the ERP analog of preview vs commit.

**licensing.** Conceptual extraction only. GPL/LGPL code was not copied.
