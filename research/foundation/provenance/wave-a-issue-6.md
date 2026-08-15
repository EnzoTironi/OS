# Wave A contract. Issue 6

**Track:** foundation  
**Issue:** https://github.com/EnzoTironi/OS/issues/6  
**Open question:** `docs/open-questions.md` Q8  
**Decision state:** `undetermined` for Q8. `hypothesis` for the vocabulary in `vocabulary.md`  
**Retrieved:** 2026-08-15  
**Contract used:** `docs/swarm-research-backlog.md` Agent output contract. `docs/swarm-result-contract.md` was not in the tree.

This file is the single-page contract. The other files in this folder are the queryable cards.

throughput checkpoint: n/a, read-only investigation

## 1. Question

What provenance must be represented semantically so OS can explain why it believes something and why an action was allowed?

Subquestions from the issue, left unanswered as architecture.

- How do source, actor, activity, and derivation differ?
- What is an evidence object, and what does it mean to consume one?
- Can confidence exist without becoming authority?
- Can a derived fact cite the Function and prior facts that produced it?
- What belongs in action-decision provenance?
- What graph answers `why is this state true?` versus `why was this action permitted?`
- What must survive retention and redaction?

Q8 asks how fundamental provenance is. This note records pressure. It does not close Q8.

## 2. Sources

Primary sources read in this pass. Repo docs are project context, not evidence that a design is true.

| Source | What was read | Kind |
| --- | --- | --- |
| W3C PROV-O | Starting-point classes and properties. Entity, Activity, Agent. Generation, usage, derivation, attribution, association, delegation. | W3C Recommendation, 2013-04-30 |
| W3C PROV-DM | Definition of provenance. Six components. Core types and relations. Derivation may omit the activity. | W3C Recommendation, 2013-04-30 |
| W3C PROV-CONSTRAINTS | Uniqueness, ordering, impossibility, type constraints. Entity and activity identifiers must not overlap. Attributes of an entity are fixed aspects. | W3C Recommendation, 2013-04-30 |
| OpenLineage spec | Job, Run, Dataset, Facet. START plus COMPLETE/FAIL/ABORT. Column lineage and quality facets. | Official spec on `main`, retrieved 2026-08-15 |
| DataHub lineage SDK | Dataset, DataJob, Chart, Dashboard edges. Column paths. Optional query node from transformation text. | Official docs, retrieved 2026-08-15 |
| Palantir Foundry | Data Lineage overview. User edit history. Action log. How user edits are applied. Functions `@Edits` provenance for permissions. | Official product docs, retrieved 2026-08-15 |
| ValueFlows / REA | Flow layers. Economic Event as observed past. `corrects`. Event time versus `created`. | Official vocabulary, retrieved 2026-08-15 |
| ERPNext | Immutable ledger. Cancel retains original plus reversal. Closed periods. Repost is not cancel. | Official docs, page updated 2026-08-14 |
| Odoo 17 | `mail.thread` field tracking. `mail_notrack` and `tracking_disable` can suppress the trail. | Official developer docs, 17.0 |
| GDPR | Art. 5(1)(e) storage limitation. Art. 17 erasure and Art. 17(3) exceptions. | Regulation (EU) 2016/679, EUR-Lex CELEX 32016R0679 |
| This repo | Thesis, constitution art. 11, open questions Q3/Q8/Q10/Q11, RFC-0001 provenance section read only, hypothesis history, research README, reference landscape, scenarios S-003 | Project context |

URLs.

- https://www.w3.org/TR/2013/REC-prov-o-20130430/
- https://www.w3.org/TR/2013/REC-prov-dm-20130430/
- https://www.w3.org/TR/2013/REC-prov-constraints-20130430/
- https://raw.githubusercontent.com/OpenLineage/OpenLineage/main/spec/OpenLineage.md
- https://docs.datahub.com/docs/api/tutorials/lineage
- https://palantir.com/docs/foundry/data-lineage/overview/
- https://palantir.com/docs/foundry/object-edits/user-edit-history/
- https://palantir.com/docs/foundry/action-types/action-log/
- https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- https://palantir.com/docs/foundry/functions/edits-overview/
- https://palantir.com/docs/foundry/functions/api-ontology-edits/
- https://www.valueflo.ws/concepts/flows/
- https://www.valueflo.ws/concepts/accounting/
- https://www.valueflo.ws/specification/all_vf.html
- https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext
- https://www.odoo.com/documentation/17.0/developer/reference/backend/mixins.html
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679

Not examined in this pass.

- PROV-AQ access protocols.
- OpenLineage JSON Schema file byte-for-byte beyond the markdown spec.
- Palantir internal lineage APIs. Community posts say they are unsupported.
- ERPNext or Odoo source at a pinned commit. Behavior is from current public manuals. Issues #32 and #33 own that archaeology.
- SAP change documents and SOX 404 text. Named as a gap.
- Issue 37 PROV-O note on another branch. Read, not copied. See dependent research.

## 3. Evidence

Kind key. Domain evidence is a real-world distinction. Source-system artifact is a local schema, UI, or API. Candidate law is a smallest claim. Counterexample is a scenario that could kill the claim. Runtime consequence is a property a runtime would have to preserve if the claim survives.

### E-001 PROV defines provenance as a later trust record

- Grade: `official-doc`
- Claim supported: Provenance names entities, activities, and people involved in producing a thing so later readers can judge quality, reliability, or trustworthiness.
- Citation: W3C, PROV-DM, 30 April 2013, Abstract, http://www.w3.org/TR/2013/REC-prov-dm-20130430/
- Observation: The abstract says provenance is information about entities, activities, and people involved in producing a piece of data or thing, which can be used to form assessments about its quality, reliability or trustworthiness.
- Limits: Assessment sits outside the core triples. PROV does not elect a business winner.

**Domain evidence.** "Why do we believe this number?" is a trust question. The record that supports the answer is part of meaning when a later Action depends on it. Constitution article 11 says the same thing for a signed invoice versus a chat extract.

### E-002 Source, actor, activity, and derivation are four relations

- Grade: `official-doc`
- Claim supported: A source artifact, a responsible agent, a timed activity, and a derivation edge are not interchangeable.
- Citation: W3C, PROV-O, 30 April 2013, §3.1 Starting Point classes and properties, http://www.w3.org/TR/2013/REC-prov-o-20130430/
- Observation: `prov:Entity` is a thing with some fixed aspects. `prov:Activity` occurs over a period of time and uses or generates entities. `prov:Agent` bears responsibility for an activity or an entity. `prov:wasDerivedFrom` can chain entities when the activity is unknown or uninteresting. `prov:used` and `prov:wasGeneratedBy` build mixed chains. `prov:wasAttributedTo` and `prov:wasAssociatedWith` attach responsibility. `prov:actedOnBehalfOf` keeps both agents responsible.
- Limits: PROV is domain-agnostic interchange. It does not define OS ObjectType.

**Source-system artifact.** OWL-RL encoding, qualified-influence reification, bundles, RDF serializations.

### E-003 A PROV entity cannot also be an activity, and its attributes are fixed

- Grade: `official-doc`
- Claim supported: Validity of a provenance instance is consistency of history, not election of operational truth.
- Citation: W3C, PROV-CONSTRAINTS, 30 April 2013, §6, Constraint 57 and the note that entity attributes are fixed aspects of an underlying changing thing, http://www.w3.org/TR/2013/REC-prov-constraints-20130430/
- Observation: No identifier may be both entity and activity. Generation must precede use. Specialization is irreflexive. Entity attributes are fixed aspects. Changing aspects require a new entity, often linked by `specializationOf` or `wasRevisionOf`.
- Limits: These constraints validate a provenance graph. They do not decide which invoice pays.

**Domain evidence.** A person who changes phase cannot be one frozen entity with mutable attributes. Issue 37 already rejected `prov:Entity` as ObjectType. This pass agrees and does not reopen that as OS vocabulary.

### E-004 Lineage systems model Job, Run, and Dataset, not belief or permission

- Grade: `official-doc`
- Claim supported: OpenLineage and DataHub explain how datasets were produced by job runs. They do not explain why a business Action was allowed.
- Citation: OpenLineage spec, Core Lineage Model, retrieved 2026-08-15, https://raw.githubusercontent.com/OpenLineage/OpenLineage/main/spec/OpenLineage.md
- Citation: DataHub, Lineage, retrieved 2026-08-15, https://docs.datahub.com/docs/api/tutorials/lineage
- Observation: OpenLineage requires a Run Event with Job, Run UUID, inputs, outputs, producer, and schema URL. A Job is a process definition. A Run is one execution. Facets attach schema, SQL, source code location, parent run, error message, column lineage, and data-quality metrics or assertions. DataHub stores upstream and downstream edges among Dataset, DataJob, Chart, and Dashboard. It can attach a query node from `transformation_text`. Column lineage is Dataset to Dataset only.
- Limits: Specs describe metadata platforms. They do not claim to be operational ontologies.

**Source-system artifact.** OpenLineage event types, facet key replacement, DataHub URNs, hop counts, GraphQL `updateLineage`.

**Domain evidence.** A derived table still needs the producing job, the run identity, the input versions, and the transform text. That is derivation through a Function-shaped activity. It is not a policy decision.

### E-005 Palantir splits pipeline lineage, object edit history, and action logs

- Grade: `official-doc`
- Claim supported: Dataset ancestry, object field diffs, and action-submission records answer different questions.
- Citation: Palantir, Data Lineage, retrieved 2026-08-15, https://palantir.com/docs/foundry/data-lineage/overview/
- Citation: Palantir, Enable user edit history, retrieved 2026-08-15, https://palantir.com/docs/foundry/object-edits/user-edit-history/
- Citation: Palantir, Action log, retrieved 2026-08-15, https://palantir.com/docs/foundry/action-types/action-log/
- Observation: Data Lineage expands ancestors and descendants of datasets, colors out-of-date tables, and shows schema, last build, and generating code. User edit history is a per-object-type toggle. It starts only after enablement. Anyone who can see the current object can see the entire history, including history from before a delete-and-recreate of the same primary key. Disabling the toggle permanently deletes the history. Action log object types map one-to-one with action types. One submission yields one log object linked to every edited object. Default fields are action RID, action type RID, action type version, UTC timestamp, submitting user, edited primary keys, and optional summary, parameters, and uneited context properties. The docs say this captures decisions and the state of the world at submission. Edit history is the path when the goal is every edit. Action log is the path when the goal is the decision as data.
- Limits: Product docs, not a formal ontology. Community posts about missing public lineage APIs are not used as normative evidence.

**Source-system artifact.** `[LOG]` prefix, Multipass user IDs, Highbury store, Workshop widgets, OSv2 toggles.

**Domain evidence.** "What pipeline produced this column?" is not "who closed these ten alerts in one decision?" and is not "which Action type version ran?"

### E-006 Palantir uses declared write-set provenance to enforce Action permissions

- Grade: `official-doc`
- Claim supported: Some permission checks need a declared set of object types a Function may edit.
- Citation: Palantir, Ontology edits, retrieved 2026-08-15, https://palantir.com/docs/foundry/functions/api-ontology-edits/
- Citation: Palantir, Ontology edits overview, retrieved 2026-08-15, https://palantir.com/docs/foundry/functions/edits-overview/
- Observation: The TypeScript v1 page says Actions may require provenance information to enforce permissions, and `@Edits` names the object types for which the function returns edits. Static analysis is a fallback. The overview says `@Edits` provides actions with provenance information which the actions may use to enforce permissions. Function-backed action logs require that `Edits` provenance be configured. Running the function in the authoring helper does not apply edits. Only an Action applies them.
- Limits: "Provenance" here means declared write-set, not a full derivation graph.

**Domain evidence.** "Why was this action allowed?" can depend on which types the Function claimed it would touch. Hidden writes break the explanation.

### E-007 Palantir user edits can hide source disagreement

- Grade: `official-doc`
- Claim supported: A conflict strategy can elect a visible value without keeping both records first-class.
- Citation: Palantir, How user edits are applied, retrieved 2026-08-15, https://palantir.com/docs/foundry/object-edits/how-edits-applied/
- Observation: Default strategy. User edits win for edited properties, including after the row disappears and returns. Alternate strategy. Compare action time to a UTC timestamp column on the input datasource. Deletions are not edits. A deleted object stays gone even if the datasource still has the row.
- Limits: Index-time election. Applications see one value.

**Source-system artifact.** One-property-one-datasource. Timestamp-column recency.

**Candidate law pressure.** Recency is not confidence and not authority. See L-003.

### E-008 REA and ValueFlows treat observation, promise, and correction as different layers

- Grade: `official-doc`
- Claim supported: An Economic Event is observed past. A forecast or commitment is not an event. Correction adds a new event.
- Citation: ValueFlows, Flows, retrieved 2026-08-15, https://www.valueflo.ws/concepts/flows/
- Citation: ValueFlows, Accounting, Making Corrections, retrieved 2026-08-15, https://www.valueflo.ws/concepts/accounting/
- Citation: ValueFlows ontology, `vf:corrects` and `vf:created`, retrieved 2026-08-15, https://www.valueflo.ws/specification/all_vf.html
- Observation: Recipe, Intent, Commitment, Economic Event, and Claim form a progression. Economic Events describe past flows, never a potential future event. Events are immutable in accounting practice. A later event with `corrects` backs out or adjusts quantity. Negative quantity is allowed only there. The correction is recorded as of the correction date. Every event should also store computer-generated `created` time because event date is often earlier than entry date. Traces use `created` to avoid missing or double counting.
- Limits: Vocabulary for economic coordination. Not a general Fact model.

**Domain evidence.** A forecast derived from a Function is not an observation. A correction is a new record that points at the old one.

### E-009 ERPNext keeps original ledger rows and records reversals

- Grade: `official-doc`
- Claim supported: Fiscal evidence is not rewritten in place. Cancel, amend, return, reverse, or repost. Each is a different operation.
- Citation: ERPNext, Immutable Ledger, updated 2026-08-14, https://docs.frappe.io/erpnext/immutable-ledger-in-erpnext
- Observation: Cancel adds opposite GL rows for the same voucher. Combined effect is zero. The original rows remain. Cancelled source documents that own ledger rows cannot normally be deleted. Closed periods and freeze dates can block cancel or amend. Repost Accounting Ledger regenerates entries from a still-submitted document. It is not cancellation. Backdated stock can trigger Repost Item Valuation and change later FIFO or moving-average values. The page says quietly replacing original ledger rows would make the audit trail impossible to trust.
- Limits: Application-level design, not a blockchain. Code not cloned in this pass.

**Source-system artifact.** DocType submit/cancel/amend. `Show Cancelled Entries`. Version DocType mentioned in older Frappe blog posts, not used as current normative evidence.

**Domain evidence.** Reviewers need to see what was posted first. Period close is a retention and authority control, not a delete.

### E-010 Odoo field tracking is optional and can be suppressed

- Grade: `official-doc`
- Claim supported: An ERP chatter trail is a product feature, not a semantic guarantee.
- Citation: Odoo 17.0, Mixins and Useful Classes, Logging changes, https://www.odoo.com/documentation/17.0/developer/reference/backend/mixins.html
- Observation: Inherit `mail.thread` and set `tracking=True` on a field to log changes in chatter. Context keys `mail_notrack` and `tracking_disable` skip tracking or all MailThread features on create and write.
- Limits: Developer reference. Accounting lock dates and inventory adjustment docs were not re-read in this pass beyond issue 4's citations.

**Source-system artifact.** Chatter HTML, optional `mail.tracking.value` table in later refactors.

**Counterexample pressure.** A trail that a caller can disable cannot be the only explanation graph for a governed Action.

### E-011 GDPR forces retention classes, not infinite logs

- Grade: `official-doc`
- Claim supported: Personal data in provenance cannot be kept identifiable forever, and erasure has listed exceptions.
- Citation: Regulation (EU) 2016/679, Article 5(1)(e) and Article 17, CELEX 32016R0679, https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- Observation: Art. 5(1)(e) requires storage no longer than necessary for the purpose, with a longer-archive exception under Art. 89(1). Art. 17(1) requires erasure without undue delay on listed grounds. Art. 17(3) carves out freedom of expression, legal obligation or public task, public health, archiving or research that would be seriously impaired, and legal claims.
- Limits: This is personal-data law. Fiscal retention in member-state tax law was not read. The regulation does not name audit logs.

**Domain evidence.** An explanation graph that stores a person's identifier has a retention class. Redaction can remove the identifier and keep the edge that an actor of some class did the act, if a legal basis still requires the act record.

### E-012 Palantir edit-history ACL and deletion collide with E-011

- Grade: `official-doc`
- Claim supported: Seeing current state can imply seeing the whole history, and disabling history destroys it.
- Citation: Palantir, Enable user edit history, retrieved 2026-08-15, https://palantir.com/docs/foundry/object-edits/user-edit-history/
- Observation: Users who can access the current object can access the entire history. Delete and recreate with the same primary key still exposes prior history. Disabling the toggle permanently deletes all existing edit histories for the object type after an acknowledgment.
- Limits: Product default. Customers may add extra controls not in this page.

**Counterexample.** A clerk who should see today's stock quantity also sees last year's overridden cost entered by a named person. That is a redaction failure if the name is personal data past its purpose.

## 4. Source-system artifacts

Keep these out of any OS primitive list unless later evidence promotes them.

- PROV OWL, qualified relations, bundles, collections, `prov:value`.
- OpenLineage `eventType`, facet-name replacement, producer URL, Run UUID.
- DataHub URNs, hop search, `column_lineage` fuzzy match.
- Palantir Data Lineage UI, `[LOG]` object types, Multipass, OSv2 toggles, `@Edits` decorator syntax.
- ERPNext DocType Version, submit/cancel/amend names, Repost Item Valuation jobs.
- Odoo `mail.thread`, chatter, `tracking=True`.
- GDPR RoPA documents. Those are controller records, not ontology types.

## 5. Convergence

Independent sources make the same cuts.

| Distinction | PROV | Lineage (OpenLineage / DataHub) | Palantir | REA / ValueFlows | ERP audit |
| --- | --- | --- | --- | --- | --- |
| Source artifact ≠ actor | Entity vs Agent | Dataset vs ownership facet | Dataset vs submitting user | Resource/event vs Agent | Document vs `modified_by` |
| Activity ≠ derivation | Activity optional on `wasDerivedFrom` | Job/Run versus dataset-to-dataset edge | Pipeline versus action log | Process versus `corrects` / fulfill | Repost job versus reversal voucher |
| Observation ≠ plan or forecast | Entities can be imaginary, but generation is past | Job output is produced data | Lineage colors stale builds | Event is past only | Submitted posting versus draft |
| Correction adds a record | `wasRevisionOf`, invalidation | New run, new dataset version | New action log object | `corrects` event | Original plus reversal |
| Confidence ≠ authority | Trust assessment is later | Quality facets do not pay invoices | Recency strategy, not a score | Layer and speech-act | Match and period close |
| Decision record is extra | Delegation and association | Parent run facet | Action log plus `@Edits` | Agreement, Commitment | Submit permission, workflow |

## 6. Divergence

### D-001 What the graph is about

- Claim A. PROV and ValueFlows describe world history and responsibility.
- Claim B. OpenLineage, DataHub, and Palantir Data Lineage describe dataset and pipeline ancestry.
- Conflict: same word "lineage", different object of explanation.
- Possible explanation: pipeline lineage is a specialization of derivation for analytical tables. It is not enough for "why was ShipOrder allowed?"
- Status: `open`
- Resolution test: find a lineage product that stores policy revision, bound assumptions, and denied Actions as first-class nodes. Not found in this pass.

### D-002 How disagreement is stored

- Claim A. ValueFlows and ERPNext keep both the original and the correcting or reversing record.
- Claim B. Palantir default edit strategy shows one elected property value. Odoo tracking can be turned off.
- Conflict: visible state versus reconstructable history.
- Status: `open`
- Resolution test: a regulated posting that must display both the wrong submitted invoice and its reversal. ERPNext already does. A Palantir object property after a user edit does not, unless action log or edit history was enabled first.

### D-003 Whether provenance is a permission input

- Claim A. Palantir `@Edits` feeds Action permission checks. Constitution article 11 says source can change authority.
- Claim B. PROV-DM treats provenance as input to a later trust judgment, not as an access-control language. OpenLineage ownership facets are metadata.
- Conflict: scope. "Participates in authority" versus "is the policy".
- Status: `open`
- Resolution test: issue 4's candidate law that provenance participates in authority and does not replace a policy. Still `hypothesis`. This note does not settle it.

### D-004 Identifier reuse after delete

- Claim A. Palantir edit history survives delete-and-recreate of the same primary key and remains visible to anyone who can see the new object.
- Claim B. PROV invalidation ends an entity. A later entity with overlapping aspects should be a new entity, possibly `alternateOf` or `specializationOf`.
- Conflict: identity of the explained thing.
- Status: `open`

## 7. Candidate laws

All `hypothesis`. None `accepted`.

### L-001 Four relations, not one audit blob

A belief or a permission explanation must be able to name source artifact, actor, activity, and derivation as separate edges. Collapsing them into `changed_by` plus `changed_at` loses at least one of the issue's questions.

Evidence: E-002, E-004, E-005.  
Independent convergence: PROV starting point, OpenLineage Job/Run/Dataset, Palantir three products, ValueFlows agent versus event versus process.  
Counterexamples: X-001, X-004.

### L-002 Two explanation graphs

`why is this state true?` walks usage, generation, and derivation, including Function identity and revision.  
`why was this action permitted?` walks a DecisionRecord. Principal, policy revision, ontology revision, bound inputs, evidence consumed, declared write-set, and the allow-or-deny outcome.

Evidence: E-004, E-005, E-006.  
Known limits: the graphs share nodes. They are not the same query.  
Counterexamples: X-002, X-003.

### L-003 Confidence is not authority

A quality score, recency stamp, or model probability may rank what to inspect next. It must not, by itself, settle a payable, a stock ledger, or a legal promise.

Evidence: E-001, E-007, E-008, plus issue 4 authority notes on the sibling branch.  
Counterexamples: X-002. A calibrated sensor that a statute treats as conclusive would narrow this law. Not found.

### L-004 Derived facts cite Function plus inputs

A value produced by computation must record the Function identity and revision, the input artifacts actually used, and whether the output is observation, forecast, or proposal. OpenLineage already stores job, run, inputs, outputs, and often SQL or source hash. DataHub can store the transform text.

Evidence: E-004.  
Counterexamples: X-002.

### L-005 Correction is a new record that points at the old one

Fiscal and other reported records are not silently rewritten. Cancel, reverse, amend, or `corrects`. Knowledge time (`created`, system time) stays distinct from event or valid time.

Evidence: E-003, E-008, E-009.  
Counterexamples: X-005.

### L-006 Evidence is consumed, not merely attached

An artifact becomes evidence for a belief or a DecisionRecord when an activity uses it. Unused sources do not explain the decision. Palantir action logs can store uneited context properties for that reason. PROV `used` is the consumption edge.

Evidence: E-002, E-005.  
Counterexamples: X-001.

### L-007 Provenance that policy depends on must be reconstructable after redaction

Personal identifiers can be erased or restricted under GDPR Art. 17, subject to Art. 17(3). The graph shape that an Action was allowed, by some principal class, under a pinned policy, on named evidence types, must remain if a legal basis still requires the explanation. Wholesale deletion of history, or leaking full history to every reader of current state, fails this.

Evidence: E-011, E-012, E-009 period close.  
Counterexamples: X-005.  
Known limits: member-state fiscal retention periods not read.

## 8. Counterexamples

See `adversarial-cases.md` for full setups. IDs here.

- X-001 Stale source used after a newer correction existed.
- X-002 Forecast treated as on-hand stock.
- X-003 Agent chain-of-thought stored as if it were a Function derivation.
- X-004 Manual override that erases the defeated evidence.
- X-005 Corrected record whose original rows were deleted or whose personal actor was both required and forbidden.

## 9. Runtime pressure

If L-001 through L-007 survive, a runtime must be able to

- store more than a single `changed_by` field
- pin Function, Policy, and ontology revisions on DecisionRecords
- walk a derivation graph for a displayed value
- walk a permission graph for an allow or deny
- refuse to treat confidence as a write
- add corrections without destroying prior rows
- apply retention classes and redaction without dropping required edges

This does not choose storage, RDF, event sourcing, or a policy engine. Q18 stays open. Wave B stays parked.

## 10. Open questions

All `undetermined`.

- Q8. How fundamental is provenance? Attachment on every Fact versus a graph, reuse of PROV names versus mapping, and whether uncertainty belongs in the core remain open.
- Q3. How provenance affects authority. This note records that it can participate. It does not write the authority table.
- Q10. Whether agent reasoning is a typed Function with uncertainty, or stays outside deterministic semantics.
- Q11. Actor versus Principal versus delegation. PROV `actedOnBehalfOf` is a mapping target, not an OS primitive decision.
- Q7. Valid time versus knowledge time. ValueFlows `created` versus event date and ERPNext posting versus entry add pressure only.
- Whether denied Actions need the same DecisionRecord as allowed ones. Palantir action log describes submissions. Denials were not found as first-class objects in the pages read.
- Fiscal retention periods by jurisdiction.

## 11. Decision state

| Claim | State |
| --- | --- |
| Q8 as a settled architecture answer | `undetermined`. Not answered. |
| L-001 through L-007 | `hypothesis` |
| Adopt PROV class names as OS primitives | `rejected` as a requirement. Mapping remains useful. Agrees with issue 37's negative claim that `prov:Entity` is the wrong ObjectType. |
| Pipeline lineage alone is enough for Action explainability | `rejected` within the sources read |
| Confidence as a write to ledgers | `rejected` as a candidate law. No source did this. |
| Inherit Palantir, OpenLineage, or ERPNext schemas | `rejected` as requirements. They remain evidence. |

## Dependent research

- Sibling, read only. `origin/cursor/issue-37-corpus-cfd8` `research/provenance/issue-0037-prov-o.md`. Export PROV. Do not use Entity as ObjectType.
- Sibling, read only. `origin/cursor/issue-4-foundation-cfd8` `research/foundation/facts/authority-semantics.md`. Confidence is not authority. Provenance participates in authority and does not replace policy.
- Related issues. #3 principals, #4 facts, #5 time, #7 Action/Event/Effect, #8 Functions, #11 actors, #37 formal ontologies, #38 traceability standards.

## Licensing

Concepts and public behavior only. No OWL, ERPNext, or Odoo implementation copied. MIT clean-room. Wave B and Wave C stay parked.

## Sources consulted, why-skill coverage

- Source control (git/gh). `origin/main` at `dc918a50e550d384d1e18a6f24424e6ed4595b9c`. Issue 6 body. Sibling research trees listed above. No historical implementation of OS provenance exists.
- Issue tracker (GitHub). Issue 6. No comments. Parent #2.
- Long-form docs (repo). Thesis, constitution, open questions, RFC-0001 read only, research program, backlog, reference landscape, scenarios.
- Real-time team chat. Skipped. No matching MCP. Gap.
- Infrastructure observability. Skipped. No matching MCP and no runtime.
- Error tracking. Skipped. No matching MCP and no runtime.
- Product analytics warehouse. Skipped. No matching MCP and no product events.
