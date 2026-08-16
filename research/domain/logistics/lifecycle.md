# Lifecycle

**Kind:** domain evidence  
**Decision:** hypothesis for a shared sequence, `supported` for the source sequences  
**No target schema.** Status names below are source words or research labels, not OS types.

A later synthesizer should treat each lane as a different projection over the same physical history. Collapsing the lanes into one `status` field is the failure mode these notes exist to prevent.

## Lane A. Commercial fulfillment

Progress against a sales or purchase commitment.

```text
promised
  -> partially moved
  -> fully moved
  -> (return) partially outstanding again
  -> closed short
```

- **ERPNext:** Sales Order pending qty, `% Delivered`, Closed for short-close (S-ERP-PF, S-ERP-DN).
- **Odoo:** order line Delivered quantity, reduced by reverse transfer (S-ODO-RET).
- **Moqui:** `ShipmentItemSource.quantity` and `quantityNotHandled` (S-MOQ-SH).
- **Kind of state:** projection. Not a stored shipment status.

## Lane B. Warehouse handling

Intra-facility work before a carrier or customer takes the goods.

```text
unreserved
  -> reserved or allocated          (#18)
  -> picked
  -> packed into handling units
  -> staged at output
  -> tendered (loaded or departed)
```

- **Odoo 3-step:** Pick (`WH/Stock` to `WH/Packing Zone`), Pack (to `WH/Output`), Delivery (to `Partners/Customers`) (S-ODO-3S).
- **Odoo 1-step:** one validate jumps stock to customer (S-ODO-1S).
- **Moqui Shipment:** Input, Scheduled, Picked, Packed, then Shipped (S-MOQ-SH).
- **GS1:** `picking`, `packing`, `staging_outbound`, `loading`, `departing`, or the coarse `shipping` (S-GS1-CBV).
- **ERPNext:** Pick List can spawn Delivery Notes. Packing Slip exists only while the Delivery Note is Draft. Submit of the note is the stock event (S-ERP-DN, S-ERP-PS).

## Lane C. Transport

Inter-party custody on one or more legs.

```text
label created or tender requested
  -> pickup accepted (proof)
  -> in transit
  -> arrived
  -> delivery accepted or failed
  -> (optional) next leg pickup
```

- **Moqui:** `ShipmentRouteSegment` estimated and actual start or arrival. Carrier integration Not Started, Confirmed, Accepted, Voided. Tracking on `ShipmentPackageRouteSeg` (S-MOQ-SH).
- **GS1:** `departing` or `shipping` with disposition `in_transit`, then `arriving`, `unloading`, `accepting` or `receiving` (S-GS1-CBV).
- **ERPNext Shipment:** AWB and Shipment Status, optional integration (S-ERP-SH).
- **ERPNext Delivery Trip:** vehicle, driver, stops, estimated arrivals (S-ERP-DT). This is last-mile many-stops, not interline.
- **Odoo:** tracking reference after validate. Fine-grained scan events were not on the pages fetched.

## Lane D. Evidence and documents

```text
movement intended
  -> warehouse record submitted or validated
  -> carrier label or AWB issued
  -> pickup proof
  -> tracking observations
  -> delivery proof
  -> (optional) void or correction
```

Constitution §8 applies. A label is not pickup. A warehouse validate is not POD. A timeout after Create Shipment is `unknown`, not failed (scenario L-S-020).

## Lane E. Commercial title, risk, and freight

These clocks are not Lane B or Lane C.

```text
Incoterm risk point     (S-ICC-INCO)
invoice or credit       (S-ERP-SR, S-ODO-RET)
billed freight charge   (S-ERP-RULE, S-ODO-DM)
incurred carrier cost   (S-ERP-SH, S-MOQ-SH)
```

Moqui Packed-to-invoice is a source artifact (L-A-003), not a law for Lanes A through C.

## Lane F. Reverse

```text
return requested
  -> reverse movement created
  -> received or inspected
  -> disposition (saleable, damaged, destroy)
  -> optional credit
```

- **ERPNext:** return Delivery Note, optional Credit Note, net delivered can fall (S-ERP-SR, S-ERP-PF).
- **Odoo:** reverse transfer, optional Credit Note (S-ODO-RET).
- **Moqui:** Sales Return or Purchase Return shipment type (S-MOQ-SH).
- **GS1:** `inspecting` on returns. Disposition `damaged`, `recalled`, `expired`. Older CBV disposition `returned` (S-GS1-CBV).

Return-to-sender is Lane F with destination equal to the original ship-from. Failed delivery (not home, refused) may start Lane F without a customer return request. See L-S-002 and L-S-005.

## Actions, events, invariants (research labels)

These are candidate names for later synthesis. They are not a schema.

### Actions (attempted interventions)

| Label | Means | Evidence |
| --- | --- | --- |
| PlanMovement | create an intended warehouse or transport movement against a commitment | SO to DN, SO to picking, Shipment Input |
| PackHandlingUnit | aggregate quantity into a package | Packing Slip, Put in Pack, CBV `packing` |
| TenderToCarrier | request pickup, rate, or label | Odoo Create Shipment, Moqui Confirmed |
| RecordPickupProof | assert carrier took custody | CBV `accepting` at origin, transport receipt |
| RecordTrackingObservation | append a scan or sensor fact | EPCIS ObjectEvent, trackingCode updates |
| RecordDeliveryProof | assert recipient or carrier completed the last drop | CBV `accepting`, Moqui Delivered |
| RejectDelivery | failed attempt, refuse, damage at door | L-S-002, L-S-004 |
| VoidOutbound | retract a prior ship assertion | CBV `void_shipping`, Moqui Voided |
| InitiateReturn | start reverse movement | return DN, reverse transfer |
| AllocateFreightCharge | add billed shipping to the commercial document | Shipping Rule, Delivery Method |
| RecordCarrierCost | store incurred transport, service, other | Moqui actual*Amount, Shipment Amount |

### Events (occurrences)

| Label | Means |
| --- | --- |
| Packed | handling units closed |
| WarehouseExited | source stock decremented |
| CustodyChanged | possession moved between parties |
| Departed | left a location toward a destination |
| InTransitObserved | disposition or scan while between parties |
| Arrived | present at a location, not yet accepted |
| DeliveryAccepted | carrier contract or recipient signature complete |
| DeliveryFailed | attempt ended without accept |
| DamagedObserved | disposition `damaged` |
| OutboundVoided | prior ship event retracted |
| ReturnReceived | reverse movement accepted into a facility |

### Invariants (to attack)

See [candidate-laws.md](candidate-laws.md). The lifecycle-level ones are:

1. Quantity on packages of one movement cannot exceed quantity on that movement (ERPNext packing rule).
2. Lane A quantity is net of reverse movements.
3. A tracking observation cannot create a handling unit that was never packed.
4. Void or return adds facts. It does not delete Lane D history.
5. CustodyChanged does not entail title or risk change.

## What "in transit" is allowed to mean

Until L-Q-002 is settled, notes should say which of these is meant:

1. **Disposition.** GS1 `in_transit` after shipping.
2. **Location.** a facility or partner location named In Transit.
3. **Projection.** last event was Departed and no Accept or Receive yet.
4. **ERP skip.** already booked to the customer location.

Odoo Output is not (1). It is still seller-facility staging.
