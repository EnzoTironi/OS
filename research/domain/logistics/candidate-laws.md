# Candidate laws

Each law is a small claim. Decision is never `accepted`. A later synthesizer should promote a law only after independent sources keep agreeing and the listed counterexamples fail to kill it.

Runtime notes are pressure, not a storage design.

## L-C-001 Fulfillment is net movement against a commitment

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** Quantity fulfilled on a commercial commitment equals quantity accepted onto outbound movements minus quantity accepted onto reverse movements, plus any explicit short-close. It is not a status of a single shipment object.
- **Evidence:** L-E-001, S-ERP-PF, S-ODO-RET, S-MOQ-SH
- **Falsify if:** a mature system needs a fulfillment object whose quantity cannot be computed from movements and short-close facts.
- **Counterexamples:** L-S-007, L-S-014, L-S-022
- **Runtime consequence:** fulfillment queries must read movement history. A cached percent is a projection.

## L-C-002 Handling unit identity is not shipment identity

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** A package or logistic unit can be identified, weighed, labeled, and tracked while holding a proper subset of a movement's quantity. Destroying or splitting the unit does not destroy the movement.
- **Evidence:** L-E-005, S-ERP-PS, S-ODO-PKG, S-MOQ-SH, S-GS1-SSCC
- **Falsify if:** every first-party model forces one package per shipment and forbids contents that are a subset.
- **Counterexamples:** L-S-003, L-S-009, L-S-029
- **Runtime consequence:** tracking codes hang on package-leg pairs (Moqui), not only on a header.

## L-C-003 Intra-facility handling is not a transport leg

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** Pick, pack, and stage events occur under the shipper's facility custody. A transport leg has a carrier or driver, an origin, a destination, and a custody change at tender or accept. The two graphs do not share one kind.
- **Evidence:** L-E-007, S-ODO-3S, S-MOQ-SH, S-GS1-CBV
- **Falsify if:** a source models carrier interline as the same object type as pick-to-pack with no extra facts required.
- **Counterexamples:** L-S-001, L-S-006, L-S-025
- **Runtime consequence:** authorization and location invariants differ. A picker is not a carrier.

## L-C-004 Custody, inventory recognition, title, and risk can split

- **Kind:** candidate law
- **Decision:** supported as a distinction. The shared instant of title remains `undetermined` (L-Q-001).
- **Claim:** An ontology that has only one "transferred" flag cannot represent Incoterms, CBV shipping versus consigning versus receiving versus accepting, or ERP stock-without-invoice.
- **Evidence:** L-E-008, S-VF-TR, S-GS1-CBV, S-ICC-INCO, S-ERP-SR
- **Falsify if:** every independent source uses one event for all four and never needs to split them.
- **Counterexamples:** L-S-015, L-S-016, L-S-017, L-S-026
- **Runtime consequence:** policy and accounting must name which fact they consume. Inventory #18 owns on-hand rules.

## L-C-005 Requested movement is not occurred movement

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** Plan, label, and tender are actions. Departed, accepted, damaged, and voided are events. A timeout after tender leaves the outcome `unknown`.
- **Evidence:** L-E-011, L-E-018, constitution §8 and §9, S-GS1-CBV `void_shipping`, S-MOQ-SH carrier statuses
- **Falsify if:** operational systems treat Create Shipment as proof of pickup with no later correction path.
- **Counterexamples:** L-S-002, L-S-018, L-S-020, L-S-027
- **Runtime consequence:** retry and reconciliation need idempotent action identity. Do not invent a schema here.

## L-C-006 Reverse movement adds facts

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** A return, return-to-sender, or void does not delete the outbound history. Net fulfillment changes because new movements exist.
- **Evidence:** L-E-014, L-E-018, S-ERP-PF, S-ODO-RET, S-GS1-CBV
- **Falsify if:** a source physically deletes the outbound delivery when a return is entered and cannot answer what originally shipped.
- **Counterexamples:** L-S-005, L-S-014, L-S-023
- **Runtime consequence:** explainable current state (constitution §14) needs both directions.

## L-C-007 Freight billed, freight incurred, and risk are independent

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** A customer shipping charge, a carrier invoice split into transport or service or other, and an Incoterm risk point may each change without the others.
- **Evidence:** L-E-015, S-ERP-RULE, S-ERP-SH, S-ODO-DM, S-MOQ-SH, S-ICC-INCO
- **Falsify if:** every source stores one amount that is always all three.
- **Counterexamples:** L-S-013, L-S-026
- **Runtime consequence:** accounting and pricing consume different facts. Do not pick a ledger here.

## L-C-008 Tracking observations are not the tracked thing

- **Kind:** candidate law
- **Decision:** supported
- **Claim:** An EPCIS event or carrier scan refers to a logistic unit or instance at a time and place with a bizStep. Contradictory scans are multiple claims (open question #3 in `docs/open-questions.md`), not a mutated shipment row.
- **Evidence:** L-E-016, S-GS1-EPCIS, S-GS1-GL, S-MOQ-SH
- **Falsify if:** first-party models have no event or observation object and still explain late or contradictory scans.
- **Counterexamples:** L-S-020, L-S-027, L-S-030
- **Runtime consequence:** provenance attaches to the observation.

## L-C-009 Quantity packed cannot exceed quantity on the parent movement

- **Kind:** candidate law
- **Decision:** supported for a single parent movement. Split across movements is allowed (L-C-001).
- **Claim:** ERPNext enforces packing slip quantity ≤ Delivery Note quantity. Moqui package contents sum to shipment items. GS1 aggregation children are the contents of a parent SSCC.
- **Evidence:** S-ERP-PS, S-MOQ-SH, S-GS1-CBV `packing`
- **Falsify if:** a source allows packed quantity above the movement without a second movement or an over-delivery fact.
- **Counterexamples:** L-S-003, L-S-028
- **Runtime consequence:** this is a constraint, not a UI rule.

## L-C-010 Shipment and delivery are not proven to be one object

- **Kind:** candidate law
- **Decision:** undetermined
- **Claim (not adopted):** shipment and delivery are phases of one identity.
- **Why undetermined:** L-E-010. ERPNext splits documents. Odoo names the picking delivery. Moqui uses statuses on one Shipment. GS1 has shipping and accepting, not a Delivery type.
- **Standing order:** keep the fork open. Do not write it into RFC-0001.
- **Counterexamples that keep it open:** L-S-001, L-S-011, L-S-025

## L-C-011 Packed implies invoice

- **Kind:** candidate law
- **Decision:** rejected
- **Claim:** packing is the billing event.
- **Why rejected:** true in Moqui (L-A-003), false in ERPNext and Odoo, not present in GS1 or Incoterms.
- **Keep:** Packed as a warehouse event. Invoice as a commercial action owned by #16.

## L-C-012 Customer location quantity is in-transit stock

- **Kind:** candidate law
- **Decision:** undetermined
- **Claim:** Odoo `Partners/Customers` after validate is the same fact as GS1 `in_transit`.
- **Why undetermined:** L-E-009, L-E-021. Inventory #18 must say whether that location is on-hand for the seller, the customer, or neither.
- **Do not answer here.**
