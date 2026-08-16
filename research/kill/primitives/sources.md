# Sources

**Kind:** source list  
**Retrieved:** 2026-08-16  
**Decision:** none. This file only records locators.

Primary sources were read this session. Sibling Wave A notes were read with `git show` and are not copied into this folder.

## This repository, `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`

- `docs/thesis.md`
- `docs/constitution.md`
- `docs/open-questions.md`
- `docs/research-program.md`
- `docs/hypothesis-history.md`
- `docs/swarm-research-backlog.md`
- `rfcs/0001-metamodel-hypothesis.md`, read only
- `scenarios/README.md`
- `research/README.md`
- `research/reference-landscape.md`

`docs/swarm-result-contract.md` is absent on `origin/main`.

## Sibling Wave A notes, cited not copied

| Issue | Branch | SHA | Path used |
| --- | --- | --- | --- |
| 3 | `origin/cursor/issue-3-foundation-cfd8` | `8b9ce1ee5e5a09e556f5442de826e6062c55abfa` | `research/identity-kinds-roles/candidate-laws.md`, `issue-3-result.md` |
| 4 | `origin/cursor/issue-4-foundation-cfd8` | `905baa0c99f09fd445b9f1bb0eee5435fa814be3` | `research/foundation/facts/fact-primitive-falsification.md`, `wave-a-issue-4.md` |
| 5 | `origin/cursor/issue-5-foundation-cfd8` | `a967d4de3164b41098055625d08cc492a7ee3a24` | `research/foundation/temporal/candidate-laws.md` |
| 7 | `origin/cursor/issue-7-foundation-cfd8` | `08676a1040780eed586288c1a43fa40535e2111d` | `research/notes/issue-0007-action-event-effect.md` |
| 8 | `origin/cursor/issue-8-foundation-cfd8` | `d064a310579ac8bc78d744e089c7eb5076dfd585` | `research/foundation/logic/reduction.md`, `candidate-laws.md`, `enforcement-loci.md` |
| 11 | `origin/cursor/issue-11-foundation-cfd8` | `8e922ec72f6c9c85b79afd63d52bb24b3adaf056` | `research/foundation/principals/candidate-laws.md` |
| 12 | `origin/cursor/issue-12-foundation-cfd8` | `db8d2840647f0e01e49759edb3625895bb6f240a` | `research/foundation/state/candidate-laws.md` |
| 18 | `origin/cursor/issue-18-domain-cfd8` | `de2bbe3ff71dcabb9ead699854a1b934496affbc` | `research/domain/inventory/candidate-laws.md` |
| 21 | `origin/cursor/issue-21-domain-cfd8` | `4df1c8b44d8f21cdf23ebfa32bae247cd25aa9dc` | `research/domain/accounting/candidate-laws.md` |
| 28 | `origin/cursor/issue-28-domain-cfd8` | `8856f901462c69ae706615b7d70e668043f9053b` | `research/domain/hr/candidate-laws.md` |
| 55 | `origin/cursor/issue-55-kill-cfd8` | `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/README.md`, `candidate-laws.md` |
| 62 | `origin/cursor/issue-62-foundation-cfd8` | `7457c00312a5686092d8c202b26c6bc92a9f7911` | `research/foundation/values/candidate-laws.md` |
| 67 | `origin/cursor/issue-67-domain-cfd8` | `037982590f250e8c80b31c5006f9511bbab03911` | `research/domain/governance/candidate-laws.md` |

Issues 6, 9, 10, and 13 were listed on origin. They were not needed to kill or keep a sort in this pass.

## Official product and standard docs, fetched 2026-08-16 unless noted

- ValueFlows Flows, <https://www.valueflo.ws/concepts/flows/>
- ValueFlows accounting corrections, cited via issue 4 and issue 7, <https://www.valueflo.ws/concepts/accounting/>
- Cedar authorization, <https://docs.cedarpolicy.com/auth/authorization.html>
- Palantir Action types overview, cited via issue 7, <https://palantir.com/docs/foundry/action-types/overview/>
- Palantir Validate Action, cited via issue 7, <https://palantir.com/docs/foundry/api/v1/ontology-resources/actions/validate-action/>
- Palantir Action webhooks, cited via issue 7, <https://palantir.com/docs/foundry/action-types/webhooks/>
- Palantir derived properties, cited via issue 8, <https://palantir.com/docs/foundry/ontology/derived-properties/>
- Palantir how edits are applied, cited via issue 4, <https://palantir.com/docs/foundry/object-edits/how-edits-applied/>
- ERPNext immutable ledger, updated 2026-08-14, <https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext>
- Stripe advanced error handling, cited via issue 7, <https://docs.stripe.com/error-low-level>
- Stripe idempotent requests, cited via issue 7, <https://docs.stripe.com/api/idempotent_requests>
- W3C PROV-O, 2013-04-30, <https://www.w3.org/TR/prov-o/>
- OpenFGA conditions, cited via issue 8, <https://openfga.dev/docs/modeling/conditions>
- Kubernetes validating admission, cited via issue 8, <https://kubernetes.io/docs/reference/access-authn-authz/validating-admission-policy/>
- Chris Richardson, Transactional outbox, cited via issue 7, <https://microservices.io/patterns/data/transactional-outbox.html>

## Formal and survey texts used through siblings or public abstracts

- Guizzardi et al., UFO and OntoUML materials as cited in issue 3. Role, Kind, Relator, Phase. This pass did not re-read the 2022 PDF.
- McCarthy 1982 REA, bibliographic record via issue 4.
- Halpin, Hayes, and colleagues on `owl:sameAs`, via issue 55. Used only as a warning against substitutive identity, not as a primitive pick.

## Code corpora not cloned this session

ERPNext, Odoo, Moqui, Ontologiq, and Open Foundry implementation files were not cloned here. Behavior is taken from public manuals and from sibling notes that already cited commits. That is a gap. Concepts only. No implementation reuse.

## Licensing note

**Kind:** source-system artifact boundary.

GPL and mixed-license products appear as documented behavior. Nothing from those trees was pasted or translated into this folder.
