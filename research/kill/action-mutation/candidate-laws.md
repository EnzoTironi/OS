# Candidate laws

Each law names kind, evidence, a counterexample, decision state, and a runtime consequence. None is silently accepted. A law that would change the thesis is recorded here, not as an RFC edit.

## L-AM-01. Business decisions mutate through named Actions

**Kind.** candidate law  
**Statement.** A persist that changes what the organization decided, promised, posted, reserved, shipped, paid, hired, or authorized is addressed as a named Action. Surfaces share that Action.  
**Evidence.** E-001, E-005, E-006, E-008, E-020, E-022. Issue 56 L-P-02. Constitution §7's narrower reading.  
**Counterexample.** S-002, S-011, S-014. A posted invoice whose totals change through a generic PATCH that auditors treat as correct.  
**Decision state.** `supported`  
**Runtime consequence.** Human button, API, automation, and agent tool invoke one verb. Policy binds that verb. This is the part of Action-first that survives.

## L-AM-02. Every persist is a named business Action

**Kind.** candidate law under attack  
**Statement.** Any write to stored state, including replicas, caches, scans, keystrokes, and index rebuilds, is a named business Action such as ShipOrder.  
**Evidence.** Killed by E-002, E-012, E-013, E-014, E-015, E-016.  
**Counterexample.** The law itself is the target. S-003, S-004, S-005, S-007, S-012, S-018.  
**Decision state.** `rejected`  
**Runtime consequence.** Do not mint an Action type per sensor tick, per Funnel row, or per `REFRESH`. If synthesis later needs a single word for "typed write," pick a write-class, not a fake business verb.

This is the thesis change the kill was paid for. RFC-0001 is not edited. Open question 4 stays `undetermined` as architecture. The recorded pressure is that "all mutations" over-generalizes "business mutations."

## L-AM-03. Observations append Events. They do not patch current objects as the source of truth

**Kind.** candidate law  
**Statement.** A persist that records what was seen or measured is an Event or equivalent occurrence. Current location, temperature, or on-hand may update as a projection. The observation remains the fact.  
**Evidence.** E-011, E-012, E-016, E-017, E-019.  
**Counterexample.** S-003, S-016, S-021. A mature domain where overwriting `last_seen_at` and deleting the scan is how auditors reconstruct a recall.  
**Decision state.** `supported`  
**Runtime consequence.** Ingest paths append. Projections may move. Issue 7 already allowed Events with no OS Action.

## L-AM-04. Derived writes are not domain mutations

**Kind.** candidate law  
**Statement.** A persist that can be discarded and rebuilt from surviving facts is a cache, index, or projection. It is not an Action and not an Event.  
**Evidence.** E-013, E-014, E-019. Constitution §6.  
**Counterexample.** S-007, S-008, S-024. A projection that is the only store of a customer promise.  
**Decision state.** `supported`  
**Runtime consequence.** Wave B may refresh, snapshot, and rebuild. The engine must not treat those jobs as business verbs. If a number is only in a cache, it is not operational truth.

## L-AM-05. Replica application is not a business decision

**Kind.** candidate law  
**Statement.** Copying a source system's already-held fact into OS changes knowledge, not the source decision. Attribution and authority ride on the source, the mapping, and the ingest batch.  
**Evidence.** E-002, E-003. Issue 4 Observation versus Decision. Issue 6 provenance brief.  
**Counterexample.** S-004, S-017, S-028. A sync job that also "fixes" OS-owned stock to match SAP without recording a correction Event or an Adjust Action.  
**Decision state.** `supported`  
**Runtime consequence.** Sync is W3. Conflict with an OS-owned W1 is disagreement, not last-write-wins. Do not design the warehouse here.

## L-AM-06. Posted operational state forbids generic field mutation

**Kind.** candidate law  
**Statement.** After a posting, shipment, stock move done, or observed economic event, ordinary field write is illegal. Correction is a follow-up Action or a correcting Event.  
**Evidence.** E-006, E-007, E-009, E-011, E-018, E-020.  
**Counterexample.** S-001, S-011, S-014, S-019. A field marked allow-on-submit whose change rewrites posted money.  
**Decision state.** `supported`  
**Runtime consequence.** The dangerous CRUD is not draft save. It is `db_set` on a submitted invoice. Fail closed.

## L-AM-07. Drafts and collaborative text may use generic operations until commit

**Kind.** candidate law  
**Statement.** Before operational commit, field edits and CRDT updates may be generic, commutative, and unnamed as business verbs. Commit is W1.  
**Evidence.** E-005, E-015, E-008 counted-before-Apply.  
**Counterexample.** S-002, S-005, S-006, S-022. A draft whose field write already reserved stock or notified a customer.  
**Decision state.** `hypothesis`  
**Runtime consequence.** If a draft edit has operational effects, it was misclassified. It is W1 wearing a draft badge.

## L-AM-08. Model administration is a different write class from business mutation

**Kind.** candidate law  
**Statement.** Changing types, fields, labels, criteria, or policy text is W6. It is not ShipOrder. It may still be a named operation in an admin family.  
**Evidence.** E-001 definition versus apply. Issue 7 L-007. RFC-0001 ontology revision questions.  
**Counterexample.** S-013, S-023. A label rename that also rewrites historical Action meanings without a revision pin.  
**Decision state.** `supported` for the class split. `hypothesis` for "admin Action family"  
**Runtime consequence.** Ontology revision remains a research topic. Do not let Customize Form look like customer CRUD.

## L-AM-09. High-frequency telemetry is ingest, not Action-per-sample

**Kind.** candidate law  
**Statement.** Sensor-rate writes append as W2 or W10. Preview, approval, and submission criteria per reading are meaningless boilerplate.  
**Evidence.** E-002 streaming. E-012 event growth. E-015 scale contrast.  
**Counterexample.** S-012. A regulated reading that legally is a signed human decision each time.  
**Decision state.** `supported`  
**Runtime consequence.** Batch ingest, provenance of the stream, and later use in a W1 are the enforcement points. Not 400 Actions per second.

## L-AM-10. Every persist still has a write class, a source, and attribution

**Kind.** candidate law  
**Statement.** Rejecting universal Action-only does not revive anonymous `UPDATE`. Each persist names its class, its source or principal, and enough provenance to explain why the row exists.  
**Evidence.** E-003, E-012, issue 6 brief, constitution §11.  
**Counterexample.** S-018, S-024. A maintenance job that changes posted quantity with no class and no actor.  
**Decision state.** `hypothesis`  
**Runtime consequence.** Logging is not enough if provenance must affect authority. Sibling issue 6 owns the vocabulary. This law only forbids a hole.

## L-AM-11. Boilerplate EditObject Actions do not restore Action-first meaning

**Kind.** candidate law  
**Statement.** A generated Action whose parameters are "all writable fields" is generic mutation with extra steps. It does not satisfy L-AM-01.  
**Evidence.** E-010 implicit CRUD services. E-021 thin Palantir wrappers.  
**Counterexample.** S-026. A generated EditObject that still evaluates real submission criteria and writes an action log auditors use. That may be W9 done safely. It is still not a business verb.  
**Decision state.** `supported`  
**Runtime consequence.** Code generation can mint wrappers. Semantic review asks whether the name states a decision.

## L-AM-12. Source synchronization and model administration are not business mutation

**Kind.** candidate law  
**Statement.** W3 and W6 answer different questions than W1. Sync asks what another system already holds. Admin asks how OS names the world. Business mutation asks what we just decided.  
**Evidence.** E-002, E-008 versus E-001, taxonomy W3 and W6.  
**Counterexample.** S-017, S-013. A "sync" that posts a journal, or an "admin" field add that changes tax calculation on open invoices without a W1.  
**Decision state.** `supported`  
**Runtime consequence.** Separate authority. A connector principal is not an accountant. An ontology editor is not a warehouse clerk.

## L-AM-13. Low-level typed operations are allowed. Silent mutation of operational truth is not

**Kind.** candidate law  
**Statement.** IngestObservation, ApplyReplicaBatch, RefreshProjection, ApplyDraftPatch, and ReviseOntology may exist as explicit low-level operations. They are not a license to PATCH a posted ledger row.  
**Evidence.** E-007 escape hatches. E-010 service wrap. E-002 Funnel as an unnamed low-level path.  
**Counterexample.** S-009, S-025. A low-level Import that creates submitted invoices and GL rows with no Posting Action.  
**Decision state.** `hypothesis`  
**Runtime consequence.** Wave B may implement typed write ports per class. It must not implement one generic object PATCH for posted state. No schema is chosen here.

## L-AM-14. Workflow-as-kernel stays rejected

**Kind.** candidate law, already decided elsewhere  
**Statement.** Long-running processes compose Actions and Events. They are not a base write class and not a reason to accept a workflow engine as the mutation kernel.  
**Evidence.** RFC-0001 "Workflow" exclusion. Issue 55 and issue 56 did not revive it. This pass's W7 and W10 do not need it.  
**Counterexample.** A capture workflow that is the only place EPCIS events can be understood. That would pressure process modeling, not a kernel workflow primitive.  
**Decision state.** `rejected` as a kernel. Not reopened.  
**Runtime consequence.** Do not add Workflow because sensors and imports exist.

## What this pass does not claim

- A target schema for write ports
- That Fact is or is not a kernel type. Issue 4 and issue 56 left that `undetermined`
- That OS must be event sourced
- That every draft field is free of policy
- An answer written into `docs/open-questions.md`
