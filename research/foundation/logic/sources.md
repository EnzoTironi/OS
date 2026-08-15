# Sources

**Retrieved:** 2026-08-15  
**Method:** official docs and first-party specs, fetched this session. Secondary blogs used only when the vendor wrote them.

## OS documents (this repo)

- [https://github.com/EnzoTironi/OS/issues/8](https://github.com/EnzoTironi/OS/issues/8). Assigned question.
- `docs/open-questions.md` Q9, Q10
- `docs/thesis.md` (deterministic logic inside the ontology)
- `docs/constitution.md` §§1, 5, 13, 16, 18
- `docs/hypothesis-history.md` H2 through H4
- `rfcs/0001-metamodel-hypothesis.md` Function / Constraint / Policy sections (read only, not edited)
- `docs/swarm-research-backlog.md` Agent output contract
- `scenarios/README.md` S-003, S-012

`docs/swarm-result-contract.md` is absent on `origin/main`.

## Palantir Foundry (official)

- [Functions overview](https://palantir.com/docs/foundry/functions/overview/)
- [External functions](https://palantir.com/docs/foundry/data-connection/external-functions/)
- [Action types overview](https://palantir.com/docs/foundry/action-types/overview/)
- [Submission criteria](https://palantir.com/docs/foundry/action-types/submission-criteria/)
- [Function-backed actions](https://palantir.com/docs/foundry/action-types/function-actions-getting-started/)
- [Side effects](https://palantir.com/docs/foundry/action-types/side-effects-overview/)
- [Derived properties (beta)](https://palantir.com/docs/foundry/ontology/derived-properties/)
- [Configure derived properties](https://palantir.com/docs/foundry/object-link-types/derived-properties/)
- [Object backend overview](https://palantir.com/docs/foundry/object-backend/overview/)

## Cedar (official)

- [How Cedar authorization works](https://docs.cedarpolicy.com/auth/authorization.html)
- [Cedar security](https://docs.cedarpolicy.com/other/security.html)
- [Basic Cedar syntax](https://docs.cedarpolicy.com/policies/syntax-policy.html)

## OpenFGA (official)

- [Concepts](https://openfga.dev/docs/concepts)
- [Relationship queries](https://openfga.dev/docs/interacting/relationship-queries)
- [Perform a Check](https://openfga.dev/docs/getting-started/perform-check)
- [Conditions](https://openfga.dev/docs/modeling/conditions)

## CEL and OPA (official)

- [cel-expr/cel-spec README](https://github.com/cel-expr/cel-spec)
- [CEL overview](https://cel.dev/overview/cel-overview)
- [CEL in Kubernetes](https://kubernetes.io/docs/reference/using-api/cel/)
- [Validating admission policy](https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/)
- [OPA FAQ (conflict resolution and default styles)](https://openpolicyagent.org/docs/faq)
- [Rego `default` keyword](https://openpolicyagent.org/docs/policy-reference/keywords/default)
- [OPA policy language](https://openpolicyagent.org/docs/policy-language)

Google's 2024-06 CEL blog is first-party commentary on four-valued logic. It is not the spec.

- [Common Expressions For Portable Policy](https://opensource.googleblog.com/2024/06/common-expressions-for-portable-policy.html)

## Constraint / planning (official)

- [MiniZinc Handbook 2.9.7, basic modelling](https://docs.minizinc.dev/en/stable/modelling.html)

## Design by Contract (official)

- [Eiffel. ET. Design by Contract, assertions and exceptions](https://www.eiffel.org/doc/eiffel/ET-_Design_by_Contract_(tm),_Assertions_and_Exceptions)
- [Eiffel. I2E. Design by Contract and assertions](https://www.eiffel.org/doc/eiffel/I2E-_Design_by_Contract_and_Assertions)

## ERP validation (official, conceptual only)

- [Frappe controllers / hooks](https://docs.frappe.io/framework/user/en/basics/doctypes/controllers)
- [Odoo 17. Chapter 10. Constraints](https://www.odoo.com/documentation/17.0/developer/tutorials/server_framework_101/10_constraints.html)
- [Odoo 18. ORM API. `constrains()`](https://www.odoo.com/documentation/18.0/developer/reference/backend/orm.html)
- [Odoo 19. Chapter 8. Computed fields and onchanges](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/08_compute_onchange.html)

Frappe/ERPNext is GPL. Odoo is LGPL. These notes extract documented behavior. No source was copied into OS.

## Not used as authority

- Vendor marketing for agent/AIP products
- Third-party Odoo blogs
- Strands Agents Cedar wrapper (it restates Cedar, then adds its own fail-closed handler)

## Licensing posture

OS is MIT. This folder is clean-room research. No copyleft implementation, no pasted controllers, no translated validation code.
