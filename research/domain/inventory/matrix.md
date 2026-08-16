# Convergence matrix

**Kind.** comparative evidence  
**Fetched.** 2026-08-16  
**Decision.** per row. Never accepted.

Marks. Yes means the source makes the distinction in first-party text fetched this session. No means the fetched text does not make it, or collapses it. Partial means a workaround or a different name. Question mark means not covered in the pages fetched this session.

This is not a feature comparison. It is evidence of semantic convergence or divergence.

## Question

Where do ERPNext, Odoo, Moqui, ValueFlows or REA, and GS1 EPCIS independently split the same inventory fact?

## Distinctions

| Distinction | ERPNext | Odoo | Moqui | VF / REA | GS1 EPCIS / CBV | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Ownership ≠ custody | Partial. Company of warehouse. Supplier warehouse | Yes. Assign Owner. Consignment excluded from valuation | Yes. `ownerPartyId` on Asset | Yes. `accountingQuantity` vs `onhandQuantity`. transferAllRights vs transferCustody | Yes. `owning_party` vs `possessing_party` | Strongest independent split this pass |
| Location ≠ party | Partial. Warehouse Type includes Supplier | Partial. Location Type includes Vendor and Customer | Yes. Facility vs Party | Yes. `currentLocation` vs `primaryAccountable` | Yes. `location` vs owning or possessing party. readPoint vs businessLocation | Odoo and ERPNext reuse location for counterparty |
| Nested storage place | Yes. Warehouse tree to bin | Yes. Parent Location | Yes. FacilityLocation, optional Container | Yes. location as a complex ontology | Yes. GLN, GLN plus extension | Convergence on hierarchy. Not on types |
| On-hand ≠ available | Yes. Actual vs Reserved vs Projected | Yes. On Hand vs reserved vs Forecasted | Yes. QOH vs ATP | No reserved qty on resource. Commitment instead | No. Visibility of occurrence, not ATP | Divergence on how to represent the claim |
| Reservation has purpose | Yes. SO, pick list, WO, subcontract, plan | Yes. Operation type and move | Yes. OrderItem on AssetReservation | Partial. Commitment | No | o2c L-004 |
| Movement is an event | Yes. SLE from submitted vouchers | Yes. stock move. Adjustment writes a move | Yes. AssetDetail diffs | Yes. Economic Event | Yes. EPCIS event | Strong convergence |
| Current qty is explainable from movements | Yes. Ledger report | Partial. Quant stored, moves recorded | Yes. totals from details | Yes. derived, may be cached | Yes. latest uncontradicted businessLocation | state CL-1, CL-3 |
| Adjustment ≠ ordinary receipt | Yes. Stock Reconciliation | Yes. Physical Inventory apply | Yes. PhysicalInventory variance | Yes. raise, lower vs real action | Partial. errorDeclaration, recount as new event | Convergence |
| Lot ≠ serial | Yes | Yes. By Lots vs serial | Yes. lotId vs serialNumber | Yes. batch record vs trackingIdentifier | Yes. class-plus-qty vs instance | product L-04 |
| Negative stock allowed | Policy for fungible. Forbidden for serial or batch from v15 | Forecasted can go negative after set-to-zero on reserved stock | ? | No first-party allow flag fetched | No | Not a domain law |
| Backdated posting | Yes. Edit posting date. Future SLE and GL recomputed. Freeze dates | Counting Date on apply. Less explicit recomputation in fetched pages | `effectiveDate` on AssetDetail | Events can be recorded late | eventTime vs recordTime | temporal L1 |
| Consignment | Partial. Supplier warehouse, inter-warehouse DN | Yes. first-class Owner | ownerPartyId can be non-internal | Yes. VMI example | owning vs possessing | ERPNext weaker |
| Quarantine or quality hold | Rejected Warehouse plus QI | Location plus quality apps, not fetched in depth | quantityRejected on receipt | state on resource | disposition, not a quarantined URI | Hold model undetermined |
| In-transit | Transit warehouse, two entries | Transit location type. Dropship vendor to customer | Shipment between facilities | pickup, dropoff, transferCustody. FOB example | `in_transit` disposition | Ownership during transit diverges |
| Valuation layers | FIFO, LIFO, moving average. Perpetual GL | Standard, AVCO, FIFO. SVL. Manual or automatic | Average cost history. CostComponent. acquireCost | Not a costing-method catalog | Out of scope | Method set is policy |
| Transformation ≠ transfer | Manufacture vs Material Transfer vs Repack | ? this session | production consume or produce via WorkEffort | consume or produce vs transfer vs combine | TransformationEvent vs ObjectEvent vs AggregationEvent | standards L-004 |
| Correction is a new fact | Cancel and amend. Immutable ledger note from v13 | Revert adds a `[reverted]` move | New AssetDetail | New event | errorDeclaration plus replacement | hypothesis for OS |

## Formula disagreement

ERPNext Projected Qty.

Actual + Planned + Requested + Ordered − Reserved − Reserved for Production − Reserved for Subcontracting − Reserved for Production Plan

Odoo Forecasted Qty on the confirmation page.

On Hand + Incoming − Outgoing

These are both planning projections. They do not agree on which plans count. Q-PROJ is a function with named inputs, not one number.

## Strongest convergence

1. Ownership and custody can diverge.
2. On-hand and reserved can diverge.
3. Movement is an occurrence. Reservation is not.
4. Lot and serial are different grains.
5. Count becomes stock only when applied as an event.
6. Transformation is not packing and not a location change.

## Strongest divergence

1. Whether reserved quantity is a stock figure or a commitment.
2. Whether owner is a field on a quant or a transfer of rights.
3. Whether counterparty is a location type.
4. The projected-quantity formula.
5. Whether negative fungible stock is a legal book state.

## Cross-links

Product identity. `research/domain/product/matrix.md` on `origin/cursor/issue-15-domain-cfd8`.

Order reservation. `research/domain/o2c/matrix.md` on `origin/cursor/issue-16-domain-cfd8`.

Visibility events. `research/standards/evidence.md` on `origin/cursor/issue-38-corpus-cfd8`.

Moqui versus ERP versus Odoo atlas. `research/moqui/erpnext-odoo-moqui-convergence-matrix.md` on `origin/cursor/issue-34-corpus-cfd8`.
