# Logistics and fulfillment

**Issue:** [EnzoTironi/OS#20](https://github.com/EnzoTironi/OS/issues/20)  
**Track:** domain  
**Fetched:** 2026-08-16  
**Contract:** Agent output contract in `docs/swarm-research-backlog.md` (`docs/swarm-result-contract.md` was absent on `origin/main`)

## Question

What real-world distinctions must an executable ontology keep among shipment, package, carrier, route or leg, custody, delivery, tracking, freight responsibility, and return, and which of those distinctions collapse into one object in mature systems?

## How to query these notes

Each card has a stable id, a **Kind**, and a **Decision**. Kind is one of `domain evidence`, `source-system artifact`, `candidate law`, `counterexample`, or `runtime consequence`. Decision is one of `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted. Nothing here is a target schema.

| Need | File |
| --- | --- |
| Exact URLs and fetch dates | [sources.md](sources.md) |
| Observed behavior and source-shaped objects | [evidence.md](evidence.md) |
| Same distinction across corpora | [matrix.md](matrix.md) |
| Status sequences and what each status means | [lifecycle.md](lifecycle.md) |
| Smallest falsifiable claims | [candidate-laws.md](candidate-laws.md) |
| Adversarial cases, including the six named in the issue | [scenarios.md](scenarios.md) |
| Unresolved forks, none invented | [open-questions.md](open-questions.md) |

## Verdict for a later synthesis agent

Independent first-party sources **support** these separations:

- Fulfillment progress on a commercial commitment is not the same fact as a physical movement.
- A handling unit is not the shipment and is not the product instance.
- A carrier service offer is not the party that operates it.
- Custody change is not title or risk change.
- A tracking observation is not the shipment identity.
- A billed freight charge is not the carrier's incurred cost.
- A return is a new reverse movement, not deletion of the outbound history.
- Proof of pickup or delivery is evidence, not the movement itself.

They **diverge** on object identity:

- ERPNext keeps Delivery Note, Shipment, Packing Slip, and Delivery Trip as different documents.
- Odoo uses one `stock.picking` family for warehouse transfers and treats carrier data as fields and labels on that transfer.
- Moqui uses one Shipment with required packages and required route segments, and treats Packed as the billing trigger.

**Shipment versus delivery identity** stays `undetermined`. **When title moves relative to custody** stays `undetermined`. Incoterms, invoices, and physical accept events do not pick one shared moment.

Dropship, consignment, and warehouse location ownership stay with inventory issue #18. This folder records only the logistics-only cuts those topics force.

## Boundary with other issues

- Order commitment and invoice or claim identity belong to order-to-cash (#16) and accounting.
- Stock quantity, lot, location ownership, consignment, and dropship inventory objects belong to inventory (#18).
- Party as enduring entity versus role belongs to party (#14).
- GS1 corpus archaeology belongs to #38. This folder uses EPCIS and CBV as domain evidence, not as a corpus dump.

## Licensing

OS is MIT. These notes extract concepts and behavior from public docs. No implementation was pasted or translated.
