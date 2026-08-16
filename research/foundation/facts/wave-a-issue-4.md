# Wave A contract. Issue 4

**Track:** foundation  
**Issue:** https://github.com/EnzoTironi/OS/issues/4  
**Open question:** `docs/open-questions.md` Q3  
**Decision state:** `undetermined`  
**Retrieved:** 2026-08-15  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This file is the single-page contract. The other files in this folder are the queryable cards.

## 1. Question

What information model should OS use when several sources make incompatible claims about the same world?

Subquestions from the issue, left unanswered.

- Is `Fact` fundamental, or should the model distinguish Observation, Assertion, Claim, Decision, and Derived Fact?
- Is accepted or canonical fact necessary?
- How does authority vary by property, context, time, and operation?
- How are contradictions preserved without polluting current state?
- How does confidence participate without becoming authority?
- What is a correction versus a contradiction?

## 2. Sources

Primary sources read in this pass. Secondary notes in this repo are cited only as session context.

| Source | What was read | Kind |
| --- | --- | --- |
| Palantir Foundry docs | Object types overview. Ontology best practices. How user edits are applied. Multi-datasource object types. | Official product docs |
| ValueFlows | Core concepts. Flows. Model text. Accounting corrections. Ontology HTML. Event-resource logic. | Official vocabulary |
| W3C PROV | PROV-O. PROV-DM. PROV-CONSTRAINTS. | W3C Recommendations, 2013-04-30 |
| McCarthy 1982 | REA paper bibliographic record and later summaries | Journal article |
| Dunn et al. 2016 | CAIS 38 survey of REA layers | Journal article |
| ERPNext docs | Buying settings. Stock reconciliation. Immutable ledger. Common party accounting. | Official docs, pages dated 2026 |
| Odoo 17 docs | Inventory adjustments | Official docs |
| Ontologiq | `https://github.com/ontologiq/ontologiq` README, retrieved 2026-08-15 | Primary repo |
| This repo | `docs/thesis.md`, `docs/constitution.md`, `docs/open-questions.md` Q3, `docs/swarm-research-backlog.md`, `docs/hypothesis-history.md` H1, `research/README.md`, `research/reference-landscape.md`, `rfcs/0001-metamodel-hypothesis.md` read only | Project context |

URLs.

- https://palantir.com/docs/foundry/object-link-types/object-types-overview/
- https://palantir.com/docs/foundry/ontology/ontology-best-practices/
- https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- https://palantir.com/docs/foundry/object-permissioning/multi-datasource-objects/
- https://www.valueflo.ws/introduction/core/
- https://www.valueflo.ws/concepts/flows/
- https://www.valueflo.ws/specification/model-text/
- https://www.valueflo.ws/concepts/accounting/
- https://www.valueflo.ws/specification/all_vf.html
- https://www.valueflo.ws/specification/event-resource/
- https://www.w3.org/TR/prov-o/
- https://www.w3.org/TR/prov-dm/
- https://www.w3.org/TR/prov-constraints/
- https://doi.org/10.2308/tar-4487748
- https://doi.org/10.17705/1cais.03829
- https://docs.frappe.io/erpnext/buying-settings
- https://docs.frappe.io/erpnext/stock-reconciliation
- https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext
- https://docs.frappe.io/erpnext/common-party-accounting
- https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html
- https://github.com/ontologiq/ontologiq/blob/main/README.md

Not used as Ontologiq evidence. Design essays that describe write-back ownership unless they appear in the Ontologiq README above.

Code corpora for ERPNext and Odoo were not cloned. Behavior is taken from current public manuals. That is a gap for issue #32 and #33.

## 3. Evidence

**Domain evidence.**

- Requested, promised, planned, and actual flows are different relations. ValueFlows layers. Issue 4 caution. Palantir "separate identity from observation."
- Economic records that hit reports are not edited in place. ValueFlows `corrects`. ERPNext reversal rows. PROV revision and invalidation.
- Physical count and book quantity are two inputs. Odoo and ERPNext both post an adjustment rather than overwrite history.
- One legal party can be two masters. ERPNext Party Link.
- Provenance supports later trust judgments. It does not elect a value. PROV-CONSTRAINTS abstract.
- A lost external effect is `unknown`, not `failed`. Ontologiq README.

**Source-system artifact.** See section 4.

## 4. Source artifacts

- Foundry property multiplicity is forbidden. One property, one datasource.
- Foundry "user edits win" or "most recent timestamp" merge. Losing values leave the object.
- Foundry row-wise multi-source objects are unavailable.
- Ontologiq one source table per object in the published examples. No warehouse writes.
- ERPNext DocTypes and cancel-and-amend identifiers.
- ValueFlows `Claim` as an economic receivable, not an epistemic claim.
- Palantir "canonical object type" as DRY, not accepted fact.

## 5. Convergence

Independent sources share these distinctions.

| Distinction | Who |
| --- | --- |
| Plan or promise is not observation | ValueFlows, later REA, OS thesis, Palantir identity-versus-observation |
| Correction appends | ValueFlows, ERPNext, PROV |
| Property-scoped source ownership | Foundry MDO, Ontologiq computed versus declared identity, ERPNext party fields |
| Current quantity can be derived | ValueFlows `accountingQuantity`, Ontologiq `state`, ERP and Odoo ledgers |
| Identity binding is separate from value authority | Ontologiq identity declaration, ERPNext Party Link, Foundry primary keys |
| Uncertainty must remain speakable | Ontologiq `unknown`, constitution §9, Odoo confirm-before-apply |

## 6. Divergence

| Topic | Split | Plausible reason |
| --- | --- | --- |
| Unit of information | Foundry object property. REA event. PROV entity with fixed aspects. ERP document plus ledger row. Ontologiq SQL view. | Different jobs. Operation, economic history, provenance interchange, fiscal audit, warehouse governance. |
| Rival values for one property | Foundry picks a winner in the index. ERP keeps documents and matches. REA types them apart. Ontologiq avoids the case. | Product UX versus audit versus economic theory. |
| Canonical | Foundry wants one object type. ERP keeps two party masters. | Modeling hygiene versus role-specific controls. |
| Write-back | Session H1 and some essays want ontology write-back. Ontologiq refuses to write the warehouse. | Integration architecture, not domain law. |

## 7. Candidate laws

All `hypothesis`.

1. Epistemic speech and economic `Claim` are different types.
2. Observation, Intent, Commitment, Decision, and Derived are different kinds. A generic Fact may encode them. It must not collapse them.
3. Most date fights are Class A collapsed properties.
4. Authority is keyed by property, Action, and time, after identity is bound.
5. Confidence may rank inspection. It must not settle a ledger or a contract.
6. Correction appends and points at the earlier record. Contradiction leaves both live.
7. Accepted operational state, if any, is a projection plus an optional Decision record. It is not a mutated original.
8. Class D same-type, same-identity, same-valid-time clashes do not dissolve by renaming.

## 8. Counterexamples

- All four delivery dates are the same customer promise. Class A fails. See [`adversarial-cases.md`](adversarial-cases.md) case 1.
- System A stores reserved qty and system B stores on-hand. Class D was mis-typed.
- Two legal entities share a trade name. Party Link would be wrong.
- A regulated sensor whose posterior is legally sufficient without a Decision. Would challenge law 5. Not found here.
- Kill test #59. If Class D never appears in the first four domains, law 8 dies.

## 9. Runtime pressure

If the candidate laws survive, an engine must

- persist rival live records
- project accepted state per Action without deleting inputs
- record knowledge time and valid time
- treat unknown external outcomes as unknown
- pin identity decisions separately from value decisions

No store, queue, or language is selected. Wave B waits on this pressure.

## 10. Open questions

Q3 remains open. This folder is evidence, not an answer.

Also still open, and pressed by this pass.

- Q2. Is Fact a kernel type? Tests in [`fact-primitive-falsification.md`](fact-primitive-falsification.md).
- Q7. Must every record carry both time dimensions?
- Q8. Which PROV relations are semantic, and which are interchange?
- Q13. Which REA flow types belong in the core?
- Issue #5 and #6. Time and provenance tracks should consume these notes rather than re-derive them.
- Issue #32 and #33. Confirm manuals against tests and cancellation code.
- Issue #35 and #36. Deeper Palantir and Ontologiq archaeology.

No new GitHub issue is opened. The questions above already exist.

## 11. Decision state

| Claim | State |
| --- | --- |
| Q3 resolved | `undetermined` |
| Fact is a kernel type | `undetermined` |
| Accepted fact is a stored kernel type | `undetermined` |
| Layer split among request, promise, plan, actual | `supported` as a domain distinction. Not a type list. |
| Correction is append-only relative to the original economic record | `supported` in the manuals above. Implementation details remain source-specific. |
| Confidence equals authority | `rejected` as a reading of these sources |
| Inherit session H1 winner tables as OS requirements | `rejected` |
| Candidate laws 1 to 8 | `hypothesis` |

RFC-0001 is unchanged.
