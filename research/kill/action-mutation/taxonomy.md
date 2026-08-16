# Write-class taxonomy

**Kind.** candidate law for the cuts. Source-system artifact when a class is named after a product.  
**Decision state.** `hypothesis` as an OS vocabulary. The need for more than one write class is `supported`.

This is not a schema. Names are research labels. A later synthesis agent should ask which class a persist belongs to before asking which Action to mint.

## How to classify a write

Ask four questions in order.

1. Does this persist change what the organization decided, promised, posted, or authorized?
2. Does it record something perceived, measured, or already decided elsewhere?
3. Is the stored row only a faster form of facts that already exist?
4. Is the change about the model, the replica pipeline, or the machine, rather than the business?

If 1 is yes, class W1. If 2 is yes and 1 is no, class W2 or W3. If 3 is yes, class W4. If 4 is yes, class W6, W8, or part of W3. Drafts and collaborative text sit in W5 and W9 until someone commits them into W1.

## W1. Decision and intervention

A principal attempts to change operational truth. ShipOrder, PostJournal, ApplyCount, ReverseEntry, LockPeriod, TerminateEmployment.

**Domain evidence.** E-001, E-005, E-006, E-008, E-020. Constitution §7's "meaningful business mutation."  
**Decision state.** Named Action `supported`. Generic field write `rejected`.

These are the writes Action-first was built for. Humans, agents, automations, and APIs should share the same verb.

## W2. Observation and event ingest

A persist that says something was seen or measured. Temperature, dock-door OBSERVE, "the truck arrived," a late carrier scan. The writer is often a sensor, a capture app, or a trading-partner feed.

**Domain evidence.** E-011, E-012, E-016, E-017.  
**Decision state.** These are Events, not Actions. `supported`. Whether ingest itself is a low-level Action stays `hypothesis`. See L-AM-13.

Treating every scan as AdjustStock invents a decision nobody made. Treating every scan as a silent field write on current location hides the observation.

## W3. Replica and source sync

OS copies a fact that another system already holds as its operational truth. Palantir Funnel from a dataset or stream. A nightly SAP stock extract. A marketplace order webhook that OS does not own.

**Domain evidence.** E-002, E-003. Issue 4 disagreement classes, cited not copied.  
**Decision state.** Not a business decision. `supported`. Silent overwrite of OS-owned truth `rejected`.

The write changes what OS knows. It does not change what the warehouse decided. Provenance and authority matter more than a pretty Action name. Sibling issue 6 owns that vocabulary.

## W4. Derived, projection, and cache

A persist that can be thrown away and rebuilt. Materialized ATP. Event-sourced read model. Search index. `REFRESH MATERIALIZED VIEW`. Fowler complete rebuild.

**Domain evidence.** E-013, E-014, E-019. Constitution §6.  
**Decision state.** Not a domain mutation. `supported`.

If a cache write is the only record of a promise, the classification was wrong. That is S-024.

## W5. Collaborative draft and CRDT

Concurrent character-level or field-level edits on something that is not yet operational truth. Contract text. A shared planning note. Two offline salespeople editing a draft quote.

**Domain evidence.** E-015.  
**Decision state.** Generic commutative ops until commit. `hypothesis`. Commit into W1. `supported`.

Action-per-keystroke is the boilerplate case the issue asked about.

## W6. Model administration and ontology revision

Writes that change types, fields, labels, submission criteria, or policy text. Frappe Customize Form. Palantir Ontology Manager. An ontology revision pin.

**Domain evidence.** E-001's action-type definition versus apply. Issue 7 L-007. RFC-0001 ontology revision questions.  
**Decision state.** Different write class from business mutation. `supported`. Whether it is still an Action family. `hypothesis`.

A label rename is not ShipOrder. A policy change that alters who may ShipOrder is closer to a decision about the model.

## W7. Bulk import and cutover

Thousands of item masters, opening balances, or historical invoices loaded at once.

**Domain evidence.** E-010 implicit store. E-007 ignore flags. E-006 opening-balance pressure.  
**Decision state.** Still needs a typed import or cutover operation with provenance. `hypothesis`. Per-row ShipOrder. `rejected` as the only shape.

The danger is importing submitted operational documents through a path that skips Posting.

## W8. Maintenance and repair

Vacuum, reindex, rewrite encoding, compact a Yjs update log, rebuild a broken projection, correct a corrupted replica cursor.

**Domain evidence.** E-014 `MAINTAIN` privilege. E-013 snapshot and rebuild.  
**Decision state.** Runtime, not ontology. `supported`.

If maintenance edits a posted quantity because "the index was wrong," that is a W1 or W2 correction wearing a W8 badge. Refuse the disguise.

## W9. Generic CRUD on drafts and some reference data

Save a draft invoice. Fix a customer phone number. Reorder a form layout. Moqui `update#Example`. Frappe `doc.save` on docstatus 0.

**Domain evidence.** E-005, E-007, E-010.  
**Decision state.** Generic mutation can be semantically correct here. `hypothesis`. Using the same generic write after submit. `rejected`.

This is the honest leftover. Not every draft field deserves AssignEmployee. Not every Customer.phone change is a named business saga. Authority and audit still apply.

## W10. High-frequency telemetry

Readings at sensor rates. Streaming datasources in Funnel. EPCIS sensorElementList. PLC tags.

**Domain evidence.** E-002 streaming path. E-012 event data that grows with time.  
**Decision state.** Append observations. `supported`. Named Action per sample. `rejected`.

Batch ingest may still be a low-level operation. Approval, preview, and submission criteria per reading are how Action-first becomes theater.

## What this taxonomy refuses

It refuses one write path. It also refuses a junk drawer named "other." If a persist does not fit, the next researcher should add a class with evidence, not mint an escape-hatch Action.

Workflow is not a write class. Long-running processes compose W1 and W2. They do not become a kernel because imports and sensors exist.
