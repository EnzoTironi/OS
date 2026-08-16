# Open questions

**Kind.** reference
**Fetched.** 2026-08-16
**Decision.** `undetermined` unless a card below says otherwise. This file does not write answers into `docs/open-questions.md`.

## Residual uncertainty from this kill test

### Q-72-01 Does a refuse-by-default hybrid still earn an executable ontology?

- Points at: L-012, thesis "One model, many surfaces"
- Decision state: `undetermined`
- What would decide it: a first vertical where every cross-surface Action is either OS-owned or a virtualized source Action, with no golden-record overlay, and where agents can still work. That is issue 71, after Wave A evidence exists.
- What this folder already says: blanket materialization does not earn it (L-011).

### Q-72-02 When is a stale-tolerant projection required rather than optional?

- Points at: L-004, D-005, E-002, E-007
- Decision state: `undetermined`
- Search, offline, and cross-source joins are the usual reasons. No threshold was measured. Wave B storage work should wait for a named grain that cannot be virtualized and cannot be owned.

### Q-72-03 Who owns a marketplace order?

- Points at: L-010, X-005, E-023
- Decision state: `undetermined`
- Amazon SP-API and Mercado Livre contracts were not retrieved. Do not invent an owner.

### Q-72-04 Is a bank statement line a legally issued identity in the same sense as NF-e?

- Points at: L-005, lifecycle conflict table
- Decision state: `undetermined`
- The shape matches. ISO 20022 `camt.053` and a named bank-reconciliation manual were not read. Issue 60 also left bank-rec as `hypothesis`.

### Q-72-05 What is the Funnel merge rule OS would have to publish if it ever indexes foreign rows?

- Points at: E-004, L-004
- Decision state: `undetermined` as an OS rule. Palantir's two strategies are documented source artifacts, not candidates.
- User-edits-win is already refused for virtualized grains (L-004). A replacement rule is not chosen here.

### Q-72-06 Can an Action bind the mapping revision the way S-012 binds ontology revision?

- Points at: X-015, `docs/open-questions.md` question 19, scenario S-012
- Decision state: `undetermined`
- Historical explanation of a mapped write needs the mapping. This folder does not design that pin.

## Pressure on existing open questions

These questions stay open. The cards name pressure only.

| Open question | Pressure | Still |
| --- | --- | --- |
| 1. Primary artifact | A single executable ontology that is also the SoR for foreign grains is `rejected` under issue 72's assumption. A shared metamodel over owned, virtualized, and refused grains is `hypothesis`. | open |
| 3. Truth when sources disagree | Rival live records and a reconciliation Decision are the pointer from issue 60. This folder adds that a materialized overlay is one more rival, not a resolver. | open |
| 5. Action vs Event vs Effect | Writeback timeout (X-001, E-003, E-011) is more evidence that `unknown` is required. No Effect primitive is proposed. | open |
| 15. Ontology versus runtime | Dual-write, Funnel, CVI, and virtual-table providers are runtime and integration mechanics (constitution item 6). They are not domain types. | open |
| 21. Build versus reuse | Microsoft, Palantir, SAP, and Salesforce already sell the four placements. Reuse of a replica bus would preserve the failure this kill test names. Reuse of a virtualization adapter is not decided. | open |
| 23. What would falsify the thesis | L-011 is a hit on the SoR reading of the thesis diagram. It is not a hit on Action != Event or on one Action for many surfaces. | open |

## What this folder must not be used for

- Answering question 3 with a new Accepted Fact type.
- Editing RFC-0001.
- Selecting a message bus, object database, or MDM product.
- Closing issue 72 from this prose alone. The durable files are the output.
