# Evidence

**Status.** Partial Wave A pass, 2026-08-16.  
**Decision.** per card.

Card fields: id, kind, decision, claim, locator, limit.

Kinds are domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. A card may carry two kinds when a source behavior is also a counterexample to a thesis reading.

## Palantir

### E-001. Ontology sits on merged datasources

**Kind.** source-system artifact.  
**Decision.** `supported` as Palantir's model.

S16 says the Ontology "sits on top of the digital assets integrated into the Palantir platform (datasets, virtual tables, and models)" and that semantics are defined "by mapping existing datasources into objects, properties, and links." S22 says the Ontology "unifies these disparate data sources into coherent objects, properties, and links."

**Limit.** Official architecture, not a customer tenant.

### E-002. System Silos anti-pattern kills competing observations

**Kind.** source-system artifact, counterexample to P1 as first-class claims.  
**Decision.** `supported`.

S20 names "System Silos" as creating separate object types per source. The prescribed fix is a single object type, a join transform, and "clear precedence rules for conflicting values." Example given is HR as authoritative for job title.

**Runtime consequence.** V-001's ERP 20, WMS 800-receipt, spreadsheet 980, and chat substitute cannot remain four live claims about demand and stock unless the modeler defies official guidance.

### E-003. Time Machine anti-pattern kills version-per-time objects

**Kind.** source-system artifact, counterexample to P10 as native bitemporality.  
**Decision.** `supported` as Palantir guidance. `undetermined` as OS time.

S20 says modeling historical versions as separate objects is an anti-pattern. The fix is one object per entity, linked amendment or history objects, time series properties, or backing-dataset and edits history.

**Runtime consequence.** "What did we believe on 10 August?" is an application query over amendments or pipeline history, not a native valid-time versus known-time API in the pages opened.

### E-004. Action is a local ontology transaction

**Kind.** source-system artifact.  
**Decision.** `supported`.

S17. An action is "a single transaction that changes the properties of one or more objects." "The same action logic and validations can be made available across all user-facing applications." Edits land in a writeback dataset.

### E-005. Submission criteria evaluate at submit, not after a later approval

**Kind.** source-system artifact.  
**Decision.** `supported`.

S19. Criteria "determine whether an action can be submitted." The aircraft example checks group membership and aircraft status "at the moment that the action is submitted." All root criteria must pass. Ontology Manager offers a test run.

S19 also lets Scenario execution context relax who may submit, so planners can try assignments they could not commit live. That is a preview fork, not a hashed proposal.

### E-006. Writeback webhook is not atomic with the ontology write

**Kind.** source-system artifact, counterexample to P8.  
**Decision.** `supported`.

S18. Writeback runs before object changes. External failure blocks ontology edits. "It is still possible that the external request may succeed but Ontology changes could fail." Only one writeback webhook is allowed.

Side-effect webhooks run after object changes. The user may see success first. Failures are not shown. Multiple side effects run in no particular order.

S23. If submission criteria fail, side effects do not run. Notification failure can still leave edits successful.

### E-007. One-to-one cardinality is a hint

**Kind.** source-system artifact, counterexample to P2 enforcement.  
**Decision.** `supported`.

S21. "The one-to-one cardinality serves as an indicator of the intended relationship, but the one-to-one cardinality is not enforced." Object-backed links exist when the relationship needs its own properties.

### E-008. Humans and agents share the action primitive

**Kind.** source-system artifact.  
**Decision.** `supported` at the product-architecture level.

S22. The Ontology "enables both humans and AI agents to collaborate." Agents inherit a human or project security scope. S17 already says the same action logic is available across applications.

A Palantir Developer Community reply on 2025-01-31 says AIP Action Tool runs any Action in Automatic or Manual mode. Manual asks a human to confirm pre-filled parameters. That is a confirm toggle, not Ontologiq's hashed revalidation. Grade below S17.

## Open Foundry

### E-009. README pipeline commits, then fires side effects

**Kind.** source-system artifact.  
**Decision.** `supported` as documented intent. Sibling S10 E-005 is the code-level confirmation this session did not re-open.

S24. Action pipeline is "validate, authorise, consent, preconditions, execute, side-effects, audit, emit." "Transactional mutations" run "in a single SPI transaction." "Compensating transactions" with `ROLLBACK_ALL` "restores prior object and link state on failure." "Side-effect executor" triggers HTTP webhooks and event-bus notifications "post-commit."

Seeds apply "via the object/link managers (outside the action pipeline)."

S10 E-007. Webhook retries treat HTTP `>= 400` as failure. No `unknown` state. A timeout is an error string.

### E-010. Generated surfaces and claimed history

**Kind.** source-system artifact.  
**Decision.** `supported` for generated GraphQL and REST. `undetermined` for temporal query semantics.

S24. GraphQL and REST are generated from ODL. REST is "action-oriented." Object lifecycle claims "version history, soft deletes, temporal queries, and lineage tracking." Schema versions classify SAFE or BREAKING. Supply-chain pack names Product, Supplier, Shipment, Facility, InventoryRecord, PurchaseOrder and actions ShipOrder, ReceiveShipment, CreateOrder, CancelOrder.

CDC and Debezium are named. S10 left the connector unopened. Federation stays `declared-only`.

## Ontologiq

### E-011. Propose cannot execute. Approve re-checks. Lost I/O is unknown

**Kind.** source-system artifact.  
**Decision.** `supported`.

S25. "An AI agent cannot complete a governed action on its own." `propose` creates a proposal. Approval is a separate process. Preconditions run at propose and again at execute. Approved arguments are hashed. "A lost response is recorded `unknown`, never `failed`." "Ontologiq never writes to your database."

S10 E-002 and E-003 opened `serve/actions.py` and `serve/effects.py` at `5a087250`. Outcomes are `executed`, `effect_failed`, and `unknown`. After bytes leave, a missing response is `unknown` and must not be retried.

### E-012. State is live. History is absent. Source is one table

**Kind.** source-system artifact, counterexample to P1 and P10.  
**Decision.** `supported`.

S25. `state` is computed from warehouse rows. "No credentials, no server, no database of ours." Compiler emits SQL views, MCP tools, and an HTML page.

S10 E-004. Runtime state is live SQL. History is deferred on the roadmap. One table per object. Identity uniqueness is a read-time refusal (`ambiguous_identity`).

**Runtime consequence.** V-001 steps 11 and 12 have nowhere to live. There is no stock-as-known-then and no second observation beside the warehouse row.

## ObjectStack

### E-013. Same action, three surfaces, trusted body

**Kind.** source-system artifact, counterexample to P12 authority parity.  
**Decision.** `supported` as documented.

S28. An action is metadata. "The same declaration renders in the Console, executes over REST, and (with an explicit opt-in) becomes an AI tool over MCP."

S27 and S29. `script` / `body` actions run as trusted application code after invoke-time `ai.exposed` and `requiredPermissions`. Internal reads and writes are not bounded by the caller's row-level security. Flow actions honor `runAs`.

### E-014. Approval nodes re-read live fields and refuse a bare record

**Kind.** source-system artifact.  
**Decision.** `supported` as documented.

S26. Approval is a flow node. `field` and `expression` bind at node entry, not at submit. Expression roots are `current.*`, `trigger.*`, and `vars.*`. A bare `record` is refused because the record is ambiguous across two times. `runAs: 'user'` is refused when there is no triggering user. Approval-outcome flows must declare `runAs: 'system'` explicitly.

S10 E-012 recorded the same page. This session re-fetched it.

**Limit.** This is live routing, not a hashed argument digest on a script action. S10 Q-36-07 left script-action revalidation after HITL `undetermined`.

## Moqui

### E-015. Service is the named verb, with a transaction policy

**Kind.** source-system artifact.  
**Decision.** `supported`.

S30. The main unit of logic is the service. Services are transactional, secured, validated, and callable locally, remotely, synchronously, asynchronously, or on a schedule. Name shape is `${path}.${verb}#${noun}`. Transaction options are ignore, use-or-begin, force-new, cache, force-cache. SECA rules fire at phases of execution.

S12. Mantle names `place#Order`, `pack#Shipment`, `apply#Payment`, `reserve#AssetsForOrder`. Implicit `update#Entity` remains a CRUD back door.

### E-016. External work is a post-commit hook, not an unknown outcome

**Kind.** source-system artifact, counterexample to P8.  
**Decision.** `hypothesis` from official docs plus a public forum clarification. Not re-traced in USL XML this session.

S30 documents SECA phases. The Moqui forum thread at https://forum.moqui.org/t/issues-with-transitions-and-services/326 distinguishes `post-commit` from `tx-commit`. `tx-commit` runs asynchronously after a successful commit. That is "do not tell the world until it landed," not "the world may have accepted a timeout."

## Frappe / ERPNext

### E-017. Mutation is document lifecycle, not Action-with-preview

**Kind.** source-system artifact.  
**Decision.** `supported`.

S31. Controller hooks cover insert, save, submit, cancel, and update-after-submit. `validate` can throw. `on_submit` and `on_cancel` are the posted-work hooks. `on_change` also runs on `db_set` and "should be idempotent."

S11 INV-DOC-01 through INV-DOC-04. Submitted documents do not return to draft. Amend replaces a cancelled document. Close is not cancel. Downstream posted work blocks cancel.

### E-018. Ledgers keep history by reversal, not by bitemporal query

**Kind.** domain evidence inside a source doc.  
**Decision.** `supported` as ERPNext behavior.

S32. Cancel retains original GL and stock rows and adds opposite rows. Do not delete ledger rows through the database or API. A permitted backdated stock transaction can create a Repost Item Valuation job that recalculates later layers. Period controls can still block the correction.

S11 INV-STOCK-02. Posting datetime order is part of valuation truth. S11 INV-LEDGER-02. Two cancel encodings exist.

**Runtime consequence.** V-001 step 11 is representable as a backdated stock voucher plus repost. "What did we believe on 10 August?" is not a first-class query. It is a reconstruction from posting datetimes and knowledge of when the voucher was created.

### E-019. Commitment documents are not stock or GL

**Kind.** domain evidence.  
**Decision.** `supported` inside ERPNext official guidance, via S11 INV-LEDGER-04.

Sales Order and Purchase Order update reservations and statuses on submit. They do not post stock or GL. A Sales Invoice with Update Stock can skip the commitment document.

**Cross-link.** P3 is partially present as document types, often collapsed as dates on one form.

## ValueFlows, used as an independent model, not a platform

### E-020. Intent, commitment, plan, and event are different classes

**Kind.** domain evidence.  
**Decision.** `supported` as a published vocabulary. `rejected` as a replace-OS runtime.

S33.

- Intent. "A desired or proposed or planned or estimated economic flow, usually with only one agent associated, which could become a commitment and/or economic event."
- Commitment. "A planned economic flow that has been scheduled or promised by one agent to another agent."
- Plan. "A logical collection of processes, with optional connected agreements, that constitute a body of scheduled work with defined deliverable(s)."
- Economic Event. "An observed economic flow."

hREA is an implementation family. This session did not open it. ValueFlows does not provide P4 through P9 as an engine.

## Cross-cutting

### E-021. Objects plus actions plus generated tools are becoming commodity

**Kind.** candidate law pressure, from multiple source artifacts.  
**Decision.** `supported` as a cross-project fact. `rejected` as a replace-OS argument.

S08, S10, S16, S24, S25, S28. Palantir, Open Foundry, Ontologiq, and ObjectStack independently ship typed objects, named actions, and at least one generated surface. That is the easy half of the thesis. S08 already said so. This pass agrees.

### E-022. No inspected engine owns P1, P6, P8, and P10 together

**Kind.** counterexample to "extend the closest platform."  
**Decision.** `supported` for the six named candidates. `undetermined` for unopened trees.

Scorecard rows P1, P6, P8, and P10 never share a single `enforced` column. See `scorecard.md`.

### E-023. License blocks several otherwise interesting cores

**Kind.** source-system artifact.  
**Decision.** `supported` as OS policy via S15.

ERPNext GPL, Odoo Community LGPL, Xpert AGPL, OpenBKN extra conditions. Conceptual extraction remains in bounds. Implementation reuse is a separate decision and is not implied by a high scorecard cell.

### E-024. Issue 55 already refuses one Product type across contexts

**Kind.** domain evidence, via sibling.  
**Decision.** `supported` as a warning, not as this issue's verdict.

S13. Commerce, manufacturing, and accounting "Product" are false cognates. A platform that offers one object type named Product and tells you to merge sources (E-002) will flatten V-001's SKU, lot, and valuation class unless the modeler fights the platform.

This folder does not copy that tree and does not reopen issue 55.
