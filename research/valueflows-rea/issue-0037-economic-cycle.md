# REA / ValueFlows economic cycle

- Artifact ID: `issue-0037-economic-cycle`
- Issue: https://github.com/EnzoTironi/OS/issues/37
- Parent: https://github.com/EnzoTironi/OS/issues/2
- Research angle: Which REA and ValueFlows flow stages are domain vocabulary, and which force metamodel behavior.
- Decision states present: `supported`, `hypothesis`, `rejected`
- Primary synthesis: [`../comparative/issue-0037-formal-ontology-synthesis.md`](../comparative/issue-0037-formal-ontology-synthesis.md)

## Question

Are Intent, Commitment, EconomicEvent, Claim, Agreement, Process, and EconomicResource universal OS primitives, or an economic ontology that the metamodel must be able to host?

## Source scope

- ValueFlows ontology 0.17. https://www.valueflo.ws/specification/all_vf.html
- https://www.valueflo.ws/concepts/flows/ and https://www.valueflo.ws/specification/model-text/ , accessed 2026-08-15
- McCarthy 1982 abstract, *The Accounting Review* 57(3), 554-578, https://doi.org/10.2308/tar-4487748
- 1982 PDF timed out. Commitments are not claimed as 1982 content.

## Evidence

See comparative `E-007` through `E-014`.

REA 1982 is resources, events, agents, plus relationships, in a shared data environment. ValueFlows adds a progression from recipe to intent to commitment to event, and a receiver-initiated claim. Events are past and immutable. Inventoried resources are created and updated only by events. Agreement is an abstract reciprocal bundle. Agent includes ecological agents. The spec admits a gray area between Intent and Commitment during planning. Point of sale can skip commitments.

## Domain evidence

Requested, promised, and actual flows are different facts. Stock is a consequence of events. A claim can exist because something already happened and the reciprocal is still due.

## Source-system artifacts

VF Action verbs, Recipe/RecipeFlow, Proposal, AgreementBundle, EcologicalAgent, OM2 units, Holochain/hREA. Do not import.

## Candidate laws

Comparative `L-003` and `L-004`. Attempt is not occurrence. The VF class list is domain vocabulary if modality is expressible.

## Counterexamples

Comparative `X-003` and `X-004`. Timeout after possible success. Point of sale with no commitment.

## Runtime consequences

Comparative `R-002` and `R-003`. Append-only observed flows. Balances as projections.

## Open questions

Open question 13 remains `undetermined` at the RFC level. This note only rejects VF class names as kernel primitives. Whether some ERP documents are independent individuals is `D-005` in the comparative note.

## Licensing

Concepts and published definitions only. No VF or hREA code.

## Decision state

`supported` for the stage distinctions and for event-driven resource updates inside VF. `rejected` for adding those class names to RFC-0001. `hypothesis` for OS-wide event immutability.
