# Open questions

**Kind.** residual uncertainty  
**Decision state.** `undetermined` unless a row says otherwise

This file does not answer `docs/open-questions.md`. Item 4 there stays open as architecture. Cite this folder when a synthesis agent needs the kill-test evidence.

## Q-AM-01. What is the word for a typed non-business write?

L-AM-13 hypothesizes low-level operations. IngestObservation, ApplyReplicaBatch, RefreshProjection, ApplyDraftPatch, ReviseOntology. Those might be Action subtypes, a write-port enum, or ordinary typed objects. Issue 56 kept Action as a sort for interventions. Stretching Action to cover Funnel and `REFRESH` revives L-AM-02, which this folder `rejected`.

**Blocks.** A later metamodel that wants one invocation type.  
**Does not block.** Recording write classes in research.

## Q-AM-02. Which draft fields already have operational effects?

L-AM-07 dies if draft save reserves stock, bills a card, or emails a customer. ERPNext and Odoo both have draft documents that sometimes touch availability. This pass did not mine those paths in source.

**Cite.** E-005, S-002, S-022. Sibling inventory reservation notes on issue 18.

## Q-AM-03. Where is the line inside "allow on submit"?

S-019. Comments versus rates. Frappe's flag is a source artifact. The domain cut is unpublished here.

**Cite.** E-005, L-AM-06.

## Q-AM-04. How should cutover of already-posted history be spoken?

S-025. Replay Posting, or a typed historical load that does not pretend the clerk posted today? Accounting issue 21 left journal-versus-event identity `undetermined`. This folder will not invent the missing cut.

## Q-AM-05. Who wins when W1 and W3 collide?

S-017, S-028. Issue 4 owns authority when sources disagree. This folder only forbids silent overwrite of an OS-owned decision.

## Q-AM-06. Is a thin EditObject Action ever enough for reference data?

L-AM-11 says it does not satisfy L-AM-01. Customer.phone and Item.barcode may still want a wrapper for policy and audit. Whether that wrapper is W9 or a tiny W1 is `undetermined`.

## Q-AM-07. Do admin writes need revision pinning on every historical Action?

S-023. RFC-0001 already asks this. Issue 7 L-007 left pinning `undetermined`. Do not answer it from a label rename thought experiment.

## Q-AM-08. Are sensor readings Facts, Events, or a third information kind?

Issue 4 left Fact as a kernel type `undetermined`. This folder only needs "append an observation." Encoding waits.

## Q-AM-09. Collaborative editing of already-posted artifacts

L-AM-07 covers drafts. Concurrent edit of a live shared whiteboard that is also operational truth was not evidenced. If that domain exists, it may kill L-AM-07.

## Q-AM-10. Bulk import of opening stock

S-009 versus S-010 versus S-025. Opening balances are historically adjustments. They are also cutover. Sibling 18 and 21 should be read together before anyone names a verb.

## Questions this pass refuses to invent

- The final Action primitive shape
- Whether Event is a primitive or an interface
- Storage engine, queue, or CDC product
- A schema for write ports
- An edit to RFC-0001
- A closed answer to `docs/open-questions.md` item 4

If a later agent needs a decision, the decision state is still `undetermined` until independent evidence converges.
