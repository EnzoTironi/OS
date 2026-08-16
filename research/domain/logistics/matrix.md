# Convergence matrix

**Kind:** domain evidence (comparative)  
**Decision:** mixed. Each cell states its own decision.  
**Legend:** `Y` = first-party page this session shows the distinction. `P` = partial or adjacent. `N` = page shows a collapse or absence. `?` = not settled by pages fetched this session.  
**This is not a feature checklist.** A `Y` means the source is evidence that the distinction exists in the world or in that system's model.

| Distinction | ERPNext | Odoo 18 | Moqui | GS1 EPCIS or CBV | Incoterms or ValueFlows | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Fulfillment progress ≠ one movement | Y | Y | Y | P | P | L-E-001. GS1 has no "fulfillment" object. VF commitments versus events. |
| Warehouse exit ≠ carrier consignment | Y | N | N | P | ? | L-E-002, L-E-010. ERPNext splits Delivery Note and Shipment. Odoo and Moqui collapse. GS1 `shipping` is the outbound process, not a document pair. **Identity undetermined.** |
| Delivery as last-mile complete event | P | P | Y | Y | P | Moqui Delivered status. CBV `accepting`. Odoo and ERPNext "delivery" often means warehouse exit. |
| Package or handling unit ≠ shipment | Y | Y | Y | Y | P | L-E-005. SSCC. VF tracking identifier on custody transfer. |
| Reusable internal package ≠ shippable package | ? | Y | P | P | ? | Odoo Disposable versus Reusable. Leave warehouse asset to #18. |
| Carrier party ≠ service offer | Y | Y | Y | ? | P | L-E-006. GS1 names carriers in examples, not as a master type in pages fetched. |
| Intra-facility route ≠ transport leg | Y | Y | Y | Y | P | L-E-007. Odoo pick or pack versus Moqui route segment versus CBV packing versus transporting. |
| Multi-stop vehicle trip | Y | P | P | P | ? | ERPNext Delivery Trip. Odoo batch or wave is picker-centric. Moqui picklist is warehouse. |
| Multi-leg carrier handoff | ? | ? | Y | Y | P | Moqui many route segments. CBV loading, transporting, unloading. ERPNext and Odoo pages fetched do not model interline. |
| Custody ≠ rights or title | P | P | P | Y | Y | L-E-008. Explicit in VF and in CBV shipping versus consigning. ERPs split stock move versus invoice. |
| Risk transfer ≠ physical arrival | P | ? | ? | ? | Y | Incoterms. ERPNext Shipment has an Incoterm field. **Moment undetermined.** |
| In-transit as first-class state | N | P | P | Y | P | L-E-009. GS1 `in_transit`. Odoo Output location is pre-ship, not carrier in-transit. |
| Proof of pickup | P | P | Y | Y | ? | L-E-011. |
| Proof of delivery | P | P | Y | Y | ? | CBV `accepting`. Moqui actualArrivalDate. |
| Partial shipment against one commitment | Y | Y | Y | Y | P | L-E-012. `void_shipping` for over-reported ship. |
| Split one movement across packages | Y | Y | Y | Y | ? | |
| Backorder or quantity not handled | Y | Y | Y | P | ? | |
| Cross-dock skip storage | ? | ? | ? | P | ? | L-E-013. **Undetermined.** |
| Return as new reverse movement | Y | Y | Y | P | P | L-E-014. CBV 2.0 has no dedicated `returning` bizStep in text searched. |
| Stock return ≠ commercial credit | Y | Y | P | N | P | ERPNext and Odoo documents are independent. |
| Billed freight ≠ incurred freight | Y | Y | Y | N | Y | L-E-015. |
| Tracking code per package-leg | P | P | Y | Y | P | L-E-016. |
| Tracking observation ≠ shipment identity | P | P | Y | Y | Y | EPCIS event versus object. |
| Dropship ship-from ≠ seller facility | P | Y | Y | ? | P | L-E-017. Inventory object to #18. |
| Void or cancel after recorded ship | P | ? | Y | Y | ? | L-E-018. |
| Packed as billing trigger | N | N | Y | N | N | L-A-003. Source artifact, not a domain law. |
| Invoice without warehouse document | Y | Y | P | N | P | ERPNext can skip Delivery Note. |
| Warehouse document without invoice | Y | Y | Y | Y | Y | All three ERPs. GS1 shipping without invoice transaction is allowed. VF custody without rights. |

## Divergence that must not be averaged away

### L-E-019 Billing trigger
- **Kind:** domain evidence
- **Decision:** supported as a disagreement
- **Observed:** Moqui invoices at Packed. ERPNext and Odoo invoice on a separate Sales Invoice, with stock already moved or not. GS1 can attach an invoice as a business transaction on an event without making packing the invoice.
- **Why it matters:** a law "fulfillment implies billable" fails Moqui's own later statuses (Shipped, Delivered) and fails ERPNext skip-delivery invoicing.

### L-E-020 Object count
- **Kind:** domain evidence
- **Decision:** undetermined which count is domain-true
- **Observed:** ERPNext 4 outbound objects (note, slip, shipment, trip). Odoo 1 picking plus optional package and carrier. Moqui 1 shipment plus mandatory package and segment. GS1 0 documents, N events.
- **Falsifier for "one shipment object is enough":** a scenario that needs warehouse-exit audit, carrier AWB, box contents, and multi-stop trip as independently cancellable facts. See L-S-007, L-S-025.
- **Falsifier for "four objects are required":** a consumer parcel that is one box, one carrier, one drop, with no trip.

### L-E-021 Immediate stock decrement
- **Kind:** domain evidence
- **Decision:** supported as a common ERP choice, `undetermined` as a domain law
- **Observed:** ERPNext and Odoo one-step decrement source stock at validate or submit, and credit the customer location. GS1 `in_transit` keeps the object in a shipped-not-received state. ValueFlows can hold custody on the carrier's bill of lading (`toResourceInventoriedAs` in S-VF-EX).
- **Inventory #18 owns** whether customer location quantity is on-hand.
