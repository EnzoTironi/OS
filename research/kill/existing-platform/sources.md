# Sources

**Status.** Locators used on 2026-08-16.  
**Kind.** source-system artifact.  
**Decision.** none.

A later agent should re-fetch these URLs rather than trust a paraphrase. Sibling notes are cited by branch and SHA. They were read with `git show` and were not copied into this folder.

`docs/swarm-result-contract.md` is not on `origin/main`. The Wave A contract in `docs/swarm-research-backlog.md` applies.

## OS documents on this branch

| ID | Locator |
| --- | --- |
| S01 | `docs/thesis.md` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c` |
| S02 | `docs/constitution.md` at the same commit |
| S03 | `docs/open-questions.md` at the same commit, especially items 4, 5, 7, 8, 21 |
| S04 | `docs/research-program.md` at the same commit |
| S05 | `docs/swarm-research-backlog.md` Agent output contract |
| S06 | `rfcs/0001-metamodel-hypothesis.md` |
| S07 | `scenarios/README.md` S-001 through S-004, S-007, S-011 |
| S08 | `research/reference-landscape.md` |

## Sibling notes, git show only

| ID | Branch @ SHA | Path |
| --- | --- | --- |
| S09 | `origin/cursor/issue-35-corpus-cfd8` @ `a2bb627d9929d9bdd332958cf4b482b0ba9d61af` | `research/notes/issue-0035-palantir-ontology-primitives.md` |
| S10 | `origin/cursor/issue-36-corpus-cfd8` @ `0d83a5f72b97e754db12f67441ca9bf01e1a6211` | `research/operational-runtimes/matrix.md`, `evidence.md`, `steal-improve-reject.md` |
| S11 | `origin/cursor/issue-32-corpus-cfd8` @ `d91c62dd9ee94a0639c2eba3b789b10c3d6c5715` | `research/erpnext/invariants.md` |
| S12 | `origin/cursor/issue-34-corpus-cfd8` @ `24c9b9986e3aa2d5f45d7c3bfd26d2e5404ad64c` | `research/moqui/service-action-pattern-catalog.md`, `erpnext-odoo-moqui-convergence-matrix.md` |
| S13 | `origin/cursor/issue-55-kill-cfd8` @ `5f4233579cf3057783775126afa64c39ed631353` | `research/kill/unified-ontology/README.md` |
| S14 | `origin/cursor/issue-58-kill-cfd8` @ `b825a15f3f9c8e2471dbb4a2bb641af595ef0cef` | `research/kill/specialized-kernels/README.md` |
| S15 | `origin/cursor/issue-69-ops-cfd8` @ `8d20528db606dc7702c2b74da4f11d224ee2768f` | `research/licensing/issue-69-clean-room-boundaries.md` |

`cursor/issue-61-kill-cfd8` was not present on the remote.

## Palantir official docs, fetched 2026-08-16

| ID | Page |
| --- | --- |
| S16 | https://www.palantir.com/docs/foundry/ontology/overview/ |
| S17 | https://www.palantir.com/docs/foundry/action-types/overview/ |
| S18 | https://www.palantir.com/docs/foundry/action-types/webhooks/ |
| S19 | https://www.palantir.com/docs/foundry/action-types/submission-criteria/ |
| S20 | https://www.palantir.com/docs/foundry/ontology/ontology-anti-patterns/ |
| S21 | https://www.palantir.com/docs/foundry/object-link-types/create-link-type/ |
| S22 | https://www.palantir.com/docs/foundry/architecture-center/ontology-system/ |
| S23 | https://www.palantir.com/docs/foundry/action-types/permissions/ |

AIP Agent Studio Action Tool behavior is cited from Palantir Developer Community, 2025-01-31, https://community.palantir.com/t/how-does-an-action-type-tool-work-in-palantir-aip/2727 . That is community confirmation, not a product spec. Grade it below S17 and S22.

## Open operational-ontology projects, fetched 2026-08-16

| ID | Locator |
| --- | --- |
| S24 | https://raw.githubusercontent.com/syzygyhack/open-foundry/f29bcb9ed819be76d549183b017316908bab8585/README.md |
| S25 | https://raw.githubusercontent.com/ontologiq/ontologiq/5a087250f5ee0c7ab354d27fbafd53694a8ec366/README.md |
| S26 | https://github.com/objectstack-ai/objectstack/blob/716ac9bf8f7419d134d7d90f2ecfc460b84bb2b5/content/docs/automation/approvals.mdx |
| S27 | https://github.com/objectstack-ai/objectstack/blob/main/content/docs/ai/actions-as-tools.mdx fetched 2026-08-16 |
| S28 | https://github.com/objectstack-ai/objectstack/blob/main/content/docs/ui/actions.mdx fetched 2026-08-16 |
| S29 | https://github.com/objectstack-ai/objectstack/blob/main/packages/mcp/README.md fetched 2026-08-16 |

S10 already opened the Open Foundry executor and Ontologiq `propose` / `effects` paths at those commits. This session did not re-open those files.

## Enterprise frameworks, fetched 2026-08-16

| ID | Locator |
| --- | --- |
| S30 | https://www.moqui.org/m/docs/framework/Logic+and+Services/Service+Definition |
| S31 | https://docs.frappe.io/framework/user/en/basics/doctypes/controllers |
| S32 | https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext |
| S33 | https://www.valueflo.ws/specification/all_vf.html , classes `vf:Intent`, `vf:Commitment`, `vf:Plan`, `vf:EconomicEvent` |

## Licensing facts used, not re-litigated

S15 records Frappe Framework MIT, ERPNext GPL-3.0, Odoo Community LGPLv3, Moqui CC0 plus patent grant, ObjectStack Apache-2.0 with ObjectOS commercial, OpenBKN mixed, Xpert AGPL-3.0 CE. This folder treats those as given.

## What this session did not open

- Palantir Phonograph, Funnel, OMS, or customer ontologies
- Open Foundry `action-executor.ts` itself. Relied on S10 E-005 and the README at S24
- Ontologiq `serve/actions.py` itself. Relied on S10 E-002, E-003 and the README at S25
- Odoo source. Used only as a named corpus in S12
- hREA runtime
- `cursor/issue-61-kill-cfd8`
