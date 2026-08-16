---
issue: 50
kind: reference
fetched: 2026-08-16
decision_state: hypothesis
---

# Thin benchmark

This file applies [protocol.md](protocol.md) to the three concepts named in issue 50. It does not re-research those domains. First-party pages and sibling notes are the inputs. Real-company mess is absent.

**Kind.** The scoring rows are domain evidence about the protocol. The concept rows cite sibling candidate laws and do not promote them.

A later domain agent owns the domain laws. This file only asks whether the protocol would have forced the source-versus-law split.

## Scoring rubric

A concept pass needs all six.

1. Source artifact named and tagged.
2. Inferred domain law written as a separate claim.
3. At least two independent families, or an explicit `undetermined` cell.
4. One typed disagreement.
5. One counterexample or falsifier.
6. No schema and no RFC edit.

Historian coverage is `undetermined` for all three this session. Vendor trees and issue trackers were not cloned. That gap is recorded. It does not fail the thin pass.

## Concept A. Inventory reservation

**Question.** Is a reservation a property of an item, a stock movement, a commitment, or another kind of claim?

**Source artifacts.** ERPNext Stock Reservation Entry. Odoo reservation method on operation type and reserved quantity on delivery. Sibling Moqui `AssetReservation`. These names stay in the artifact column.

**Domain evidence.** E9. ERPNext docs. Set aside quantity for a particular purpose or customer. Cancel releases the claim. Work-order reservation cannot be consumed by other transactions. A transfer to WIP moves the claim with the goods. Odoo docs. Reservation timing is a policy on the outbound operation, not a global item flag.

**Independent family.** Sibling inventory L-INV-03 and L-INV-04. On-hand is not available. Reservation is a claim, not a movement. ValueFlows has no reserved quantity on the resource. A future claim there is a Commitment. S-SIB-18 E-12.

**Typed disagreement.** Implementation accident plus missing encoding. ERPNext and Odoo materialize reserved quantity because concurrent promising fails without it. ValueFlows stores the claim as a Commitment. Whether OS needs a reserved figure, a relator, or a commitment is `undetermined`. `docs/open-questions.md` item 12. Not answered here.

**Counterexample.** Shared unreserved remainder of a batch can still be delivered. That does not kill purpose-tagged exclusivity of the reserved slice. A source that promises and issues correctly with only one stored quantity and no claim record would reject the law. Sibling L-INV-04 names that falsifier.

**Candidate law, protocol view.** A summarizer would emit `reserved_qty` on Item. An inducer keeps purpose, warehouse, and identity grain, and refuses to treat cancel-of-reservation as a stock movement.

**Runtime consequence.** Concurrent claims need isolation. A single reserved integer on Item is not enough. Wave B must not pick a store yet.

**Confidence.** `medium` for the claim-versus-movement split. `low` for the OS encoding.

**Decision state.** Protocol pass. Domain law remains the sibling's `supported` for the split and `undetermined` for the encoding. This folder does not treat that sibling decision as accepted.

**Historian.** `undetermined`.

**Messy data.** `undetermined`. E15.

## Concept B. Work Order versus execution

**Question.** What fact authorizes production, and what fact records that a workstation performed an operation?

**Source artifacts.** ERPNext Work Order and Job Card. Odoo Manufacturing Order and Work Order. ISA-95 Job Order, Work Master, and Job Response. ValueFlows Process with commitments and events. Do not merge the Work Order strings.

**Domain evidence.** E10, E11, E12. ERPNext Work Order is a shop-floor signal to manufacture a quantity. Required, transferred, and consumed quantities differ. Planned cost comes from the BOM. Actual cost comes from Job Cards. Job Card stores actual operation at a workstation, including time logs and completed quantity. Odoo creates work orders from BoM operations when the Work Orders feature is on, and can manufacture with only a manufacturing order when it is off.

**Independent family.** ISA-95 Job Order is a request. Job Response is a report. ValueFlows attaches planned flows and observed flows to one process instance. Sibling manufacturing L1. Specification is not authorization is not execution.

**Typed disagreement.** Homonym. ERPNext Work Order ≈ authorization. Odoo Work Order ≈ operation execution under a Manufacturing Order. A term-matching layer cake would collapse them.

**Counterexample.** A plant that uses one record as BOM, release, and as-built, and can still answer what was specified, what was authorized, and what happened after a mid-order revision, would reject sibling L1. Not found in the first-party pages loaded this session.

**Candidate law, protocol view.** A summarizer would pick one product's Work Order document. An inducer keeps specification, authorization, and execution as three facts and treats the shared English phrase as a hazard.

**Runtime consequence.** ReviseSpecification, ReleaseProduction, StartJob, and RecordOutput take different inputs even if one form calls several of them. This is pressure, not a schema.

**Confidence.** `medium` for the layer split. `low` for OS primitive names.

**Decision state.** Protocol pass. Open question 14 stays `undetermined` at the RFC level.

**Historian.** `undetermined`. ERPNext Job Card Pending Qty in v16 is a documented later fix for partial completion. That is historian-shaped evidence from a product page, not from an issue thread.

**Odoo 19.0 manufacturing page.** `undetermined`. 404 this session.

## Concept C. Supplier and customer roles

**Question.** Is Supplier a kind of organization, or a role in a relationship?

**Source artifacts.** ERPNext Customer master and Supplier master. Sibling Party Link that does not merge the masters. Odoo `res.partner` as recorded in sibling notes. Palantir Interface as shared shape. None of these is OS vocabulary.

**Domain evidence.** E13, E14. ValueFlows example. `is supplier of` / `is customer of` is an `AgentRelationshipRole` on an `AgentRelationship` between two Agents. UFO. Role is anti-rigid and relational. Customer is a standard Role example. ERPNext Customer docs. One billed party. Contacts and Addresses are linked records. Disabled keeps history. Internal Customer is one of your companies.

**Independent family.** Sibling party L1. A commercial label is not a Kind. Sibling identity L1 and L4. Interface cannot subsume Role. Scenario S-005.

**Typed disagreement.** Implementation accident. ERPNext keeps two masters because sales and purchase behavior differ, then adds Party Link for offset. ValueFlows and UFO keep one Agent or Person or Organization and put the commercial label on a relationship. Palantir Interface is a third cut. Shared shape, not relational dependence.

**Counterexample.** A corpus where Supplier identity is independent of any Person or Organization, and destroying the organization leaves a Supplier that still refers to the same legal party, would reject "not a Kind." Sibling L1 names that falsifier. Not found this session.

**Candidate law, protocol view.** A summarizer would emit Customer and Supplier types because ERPNext has two DocTypes. An inducer records those DocTypes as artifacts and writes "commercial label is not a Kind."

**Runtime consequence.** The identity key of an organization must not be the Supplier code. Role membership must be able to start and stop. Whether OS needs a native Role or Relator sort stays `undetermined`. Open questions 2 and 12. Issue 3 owns that cut.

**Confidence.** `medium` for "not a Kind." `low` for native Role.

**Decision state.** Protocol pass. This folder does not answer the open questions.

**Historian.** `undetermined`.

**Odoo first-party partner page.** Not fetched this session. Cell uses sibling notes. `undetermined` as first-party.

## Score

| Concept | Source/law split | Two families | Typed disagreement | Falsifier | Schema leaked | Protocol |
| --- | --- | --- | --- | --- | --- | --- |
| Reservation | yes | yes, VF encoding open | yes | yes | no | pass |
| Work Order versus execution | yes | yes | homonym | yes | no | pass |
| Supplier and customer roles | yes | yes | two masters versus role | yes | no | pass |

The protocol is exercisable on the three named concepts using published docs and sibling notes. That does not make the protocol empirically validated on a fresh corpus. Decision state for "this protocol is complete" remains `hypothesis`.

## What the current swarm is not

Wave A folders already use kind tags and decision states. That is useful hygiene. It is not a measured, self-correcting induction pipeline with historian coverage, messy-data attack, and human promotion gates. Claiming the swarm already is issue 50's deliverable is `rejected`. L-IND-09.
