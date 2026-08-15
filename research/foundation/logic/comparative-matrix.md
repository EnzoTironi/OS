# Comparative matrix

**Retrieved:** 2026-08-15  
Checkmarks mean the source **makes the distinction**, not that OS should copy the construct. Citations are in [evidence.md](evidence.md) and [sources.md](sources.md).

## Logic jobs

| Distinction | Palantir | Cedar | OpenFGA | CEL | OPA | MiniZinc | Eiffel DbC | Odoo | Frappe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Typed computation without mutation | Function / `@Query()` | policy expr (effect-free) | CEL condition | core | function / rule | `par` expr | query | compute | controller method |
| Mutation as a named operation | Action | no (authz only) | Write tuples (admin) | no | no | no | routine | create/write/button | save / submit / cancel |
| External I/O inside logic | External Function, webhook | forbidden | no | embedder-supplied | optional builtins | no | no | possible in Python | possible in Python |
| Derived value vs stored fact | derived property vs property | n/a | n/a | can construct objects | virtual document | output vs assignment | query vs attribute | compute vs stored | formula / server method |
| Boolean check vs search | Function vs (not first-class) | check only | Check / ListObjects | check only | query | `solve` | n/a | n/a | n/a |
| Authorization vs validation | submission criteria vs Action rules | authorizer | Check | embedder chooses | caller-defined | n/a | n/a | ACL vs `@constrains` | permissions vs `validate` |
| Pre vs post vs invariant | submission vs (weak) | n/a | n/a | n/a | n/a | n/a | `require` / `ensure` / `invariant` | onchange vs constrain | `validate` vs `on_submit` |
| Error algebra specified | version / provenance fail | skip-on-error | 400 vs false | cost error | undefined vs default | unsat | assertion fail | ValidationError | `frappe.throw` |
| Default-deny built in | product RBAC + criteria | yes | missing tuple = false | no | convention only | n/a | n/a | n/a | n/a |
| Version pin of logic | Function version on Action | policy set is input | `authorizationModelId` | compiled AST | bundle | model+data files | compiled class | module version | app version |
| Preview ≠ commit | Ontology Scenario | n/a | contextual tuples | partial eval (blog) | `with` override | intermediate solutions | n/a | onchange (form only) | draft vs submit |

## Combination algebras (authorization)

| Algebra | Who owns it | Fail on policy error? |
| --- | --- | --- |
| default-deny + forbid-overrides-permit + skip-on-error | Cedar language | skip that policy |
| graph reachability + optional CEL | OpenFGA model | undefined relation is 400 |
| whatever document you query | OPA caller | undefined unless `default` |
| `failurePolicy` × `validationActions` | Kubernetes admission | Fail (default) or Ignore |
| all criteria must pass | Palantir submission criteria | fail the submit |

These are not the same boolean fold. Treating them as `AND` of `Function<…, Bool>` loses diagnostics and error behavior.

## Derive vs enforce (ERP + Palantir)

| Job | Palantir | Odoo | Frappe |
| --- | --- | --- | --- |
| Show a calculated value | derived property, function-backed column | compute (optionally stored) | method / virtual |
| Block a bad write | submission criteria, Action rules | SQL + `@constrains` | `validate` |
| Block a stronger lifecycle step | Scenario vs merge criteria | button / state methods | `before_submit` |
| Form-only assistance | Action form | onchange | client script (not studied here) |
| After-commit outward effect | notification, webhook | mail / cron | `after_insert`, `on_submit` |

Odoo official text. Prefer compute over onchange. Never put business rules in onchange. That is independent confirmation that **preview UI logic is not an invariant**.

## Convergence

Independent sources keep at least these splits:

1. **Compute a value** vs **forbid a state** vs **decide authority**.
2. **Evaluate known inputs** vs **search unknown assignments**.
3. **False** vs **error** vs **unknown / undefined**.
4. **Draft / preview** vs **commit / submit**.
5. **Pure / sandboxed** vs **external I/O**.
6. **Pin the definition** that ran (Function version, model id, ontology revision). Cross-link #9.

## Divergence

- Cedar hard-codes combination. OPA refuses to. Kubernetes splits false vs error. OpenFGA uses a graph, then CEL at the edge.
- Palantir lets a Function both compute and emit Ontology edits (`@OntologyEditFunction`). Cedar forbids effects inside policy. CEL forbids mutation. Those are different purity stories.
- Palantir derived properties cannot carry constraints. Odoo computed fields can sit next to `@constrains` on other fields. Same "derived" word, different coupling to enforcement.
- ERP submit is a domain lifecycle. Palantir Scenario is a planning sandbox. Both are preview≠commit, for different reasons.
