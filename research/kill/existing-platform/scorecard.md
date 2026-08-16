# Property scorecard

**Status.** Partial, 2026-08-16.  
**Kind.** source-system artifact plus classification.  
**Decision.** none on the grid. Folder verdict lives in `README.md` and `replace-os-report.md`.

Cells are enforcement classes, not feature scores and not developer-effort scores.

| Class | Meaning |
| --- | --- |
| `enforced` | The engine refuses the illegal state or records the required one |
| `modeled` | A careful modeler can represent it. The engine does not know the distinction |
| `distorted` | The recommended model collapses or fights the distinction |
| `absent` | Not present in opened docs or sibling traces |
| `declared` | README or architecture page claims it. This session did not verify enforcement |
| `undetermined` | Not opened |

A thin cited cell beats a guessed complete one.

## Grid

| Property | Palantir | Open Foundry (syzygyhack) | Ontologiq | ObjectStack | Moqui / Mantle | Frappe / ERPNext |
| --- | --- | --- | --- | --- | --- | --- |
| P1 Multi-source observations | distorted. E-001, E-002 | declared CDC. E-010 | absent. E-012 | declared federation ADR. S10 | absent as claims | absent as claims |
| P2 Typed identity and relations | modeled. types yes, 1:1 not enforced. E-007 | enforced in ODL. E-010 | enforced for one warehouse identity. E-012 | modeled in metadata | modeled as entities and roles. S12 | modeled as DocTypes and Links. E-017 |
| P3 Requested / committed / planned / actual | modeled as properties or extra types | modeled in pack names, not natures | distorted into live computed state | modeled as fields | partial. S12 time row | partial. documents split, dates often collapse. E-019 |
| P4 Action with preview and policy | partial. submit criteria plus Scenario. E-005 | partial. CEL plus transaction. Dry-run incomplete in S10 | enforced dry-run and policy. E-011 | modeled. named actions, preview `undetermined` | partial. validated service, no preview protocol | distorted. validate/submit, no preview primitive. E-017 |
| P5 Approval | modeled. apps, Manual AIP confirm | absent in inspected executor. S10 | enforced. other process. E-011 | enforced as flow nodes. E-014 | modeled. `approve#Order` | modeled. optional Workflow |
| P6 Stale-state revalidation | distorted. criteria at submit. E-005 | absent. S10 | enforced. hash plus live re-check. E-011 | partial. live re-read at node entry, no arg digest. E-014 | absent as protocol | absent |
| P7 Transaction | enforced locally. E-004. not across webhook. E-006 | enforced locally, then post-commit webhook. E-009 | absent as local write. Effect is the write. E-011 | `undetermined` | enforced. service transaction attribute. E-015 | enforced as document save |
| P8 External unknown | distorted. E-006 | distorted. E-009 | enforced. E-011 | `undetermined`, no unknown in opened docs | distorted. tx-commit hook. E-016 | distorted. timeout as error |
| P9 Reconciliation | modeled as pipelines and writeback | partial compensation of local state only. E-009 | absent as a later fact. Do-not-retry is the rule. E-011 | `undetermined` | modeled in application services | modeled as reports and repost jobs. E-018 |
| P10 Temporal history | distorted. E-003 | declared version history. E-010 | absent. E-012 | declared. S10 | `undetermined` | partial reversal history, not known-then. E-018 |
| P11 Provenance | partial. edits history, optional confidence struct. Merge drops losers. E-002 | partial post-commit audit. S10 | enforced append-only audit of the decision. E-011 | partial. `isSystem` can skip stamping. S10 | `undetermined` | partial. owner and modified_by, not PROV |
| P12 Agent and human, same operation | enforced as shared Action. E-008 | partial. same REST/GraphQL actions. Agent tools `declared` | enforced propose vs approve split. E-011 | enforced invoke path, leaked authority. E-013 | partial. screen, REST, job share a service | partial. form and API share document methods |
| P13 Generated or readable surface | enforced product. Workshop, OSDK. S17, S22 | enforced generated GraphQL/REST. E-010 | partial. MCP, HTML docs, workbench | enforced schema-driven UI plus MCP. E-013 | partial. XML screens and forms | enforced DocType forms |

## Other candidates, not scored as replace-OS cores

| Candidate | Why it is here | Why it is not a replacement |
| --- | --- | --- |
| ValueFlows / hREA | Independent P3 vocabulary. E-020 | A model, not an engine for P4 through P9. hREA not opened |
| Odoo | Second ERP corpus in S12 | Same document-and-form shape as ERPNext. LGPL. Not opened this session |
| OpenBKN | Evidence-chain story in S10 | Mixed license. S15 blocks MIT reuse. Enforcement untraced |
| Xpert / UOSE | Agent plus workflow product | AGPL. UOSE cells in S10 are `declared-only` |
| gura105 operational-ontology | Write-back-first, dry-run of the commit plan. S10 E-019 | Crash window loses audit. Not a product. MIT reference only |
| Arkhe | Tool-contract IR. MCP is an emitter | Refuses to be a runtime. S10 |
| u485349 / Przyval "Open Foundry" | Name collision | S10 rejected them as donors. S15 left one license empty |

## Column reading

**Palantir** wins P12 and P13 and the marketing version of P2. It loses P1, P6, P8, and P10 on official guidance, not on missing widgets.

**Open Foundry** is the closest open Palantir-shaped engine. It inherits the commit-then-webhook hole and has no proposal object.

**Ontologiq** wins P4, P5, P6, P8, and the honest half of P12. It loses P1, P7, P9, and P10 by design.

**ObjectStack** wins P13 and the surface half of P12. It loses authority parity and has no unknown outcome in opened docs.

**Moqui** wins named verbs and real transactions. It is a pre-agent SOA framework with a CRUD hatch.

**ERPNext** wins domain depth and reversal-shaped ledgers. It is a document engine. GPL.

## What would flip a column to `enforced`

Write the new evidence in this folder. Do not silently upgrade a cell because a later README added a bullet.
