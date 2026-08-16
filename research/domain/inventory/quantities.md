# Quantities taxonomy

**Kind.** reference  
**Fetched.** 2026-08-16  
**Decision.** hypothesis for the taxonomy. per-row decisions below. Never accepted.

This is a named list of quantity kinds that independent sources already separate. It is not a schema and not a list of OS fields.

A later synthesis agent should try to merge rows only when a source treats two names as the same fact without losing a query.

## Question

Which quantity words are different facts, and which are formulas over other facts?

## How to read a row

**Kind** is domain-evidence when at least two independent families name the split, source-system artifact when only one implementation uses the name, or derived when the page gives a formula.

**Decision** is supported, hypothesis, rejected, or undetermined.

## Custody and rights

| ID | Name | Meaning | Sources | Kind | Decision |
| --- | --- | --- | --- | --- | --- |
| Q-ONHAND | On-hand, actual, quantity on hand | Physical custody at a place | ERPNext Actual Qty. Odoo On Hand. Moqui `quantityOnHandTotal`. VF `onhandQuantity` | domain-evidence | supported |
| Q-OWNED | Accounting, owned | Primary rights, irrespective of custody | VF `accountingQuantity`. Odoo Owner. GS1 `owning_party` | domain-evidence | supported |
| Q-CUSTODY | In-custody, possessed | Physical control, irrespective of rights | VF `onhandQuantity` for the custodian. GS1 `possessing_party`. Odoo consignment on-hand | domain-evidence | supported |
| Q-CONSIGNED | Consigned on-hand | Q-ONHAND for the store and Q-OWNED for the vendor | Odoo consignment. VF VMI example | domain-evidence | supported as a situation, not a third primitive |
| Q-INTRANSIT | In transit | Quantity between two places, or in a transit location | ERPNext Transit warehouse. Odoo Transit location. GS1 `in_transit` | mixed | hypothesis. May be Q-ONHAND at a transit place |

Q-CONSIGNED is Q-ONHAND and Q-OWNED held by different parties. Do not add a `consignedQty` primitive unless a source cannot query it from those two.

## Exclusive claims and plans

| ID | Name | Meaning | Sources | Kind | Decision |
| --- | --- | --- | --- | --- | --- |
| Q-RSV | Reserved, allocated | Exclusive claim on a slice for a purpose | ERPNext Reserved Qty and Stock Reservation Entry. Odoo reserved. Moqui `AssetReservation.quantity` | domain-evidence | supported |
| Q-RSV-PROD | Reserved for production | Claim for a work order or production plan | ERPNext Reserved Qty for Production and for Production Plan | source-system artifact | hypothesis that purpose is a parameter of Q-RSV, not a new quantity kind |
| Q-RSV-SUB | Reserved for subcontracting | Claim until material moves to supplier warehouse | ERPNext Reserved Qty for Subcontracting | source-system artifact | same as Q-RSV-PROD |
| Q-ATP | Available to promise | What may still be claimed | Moqui `availableToPromiseTotal`. Informal "available" in Odoo | domain-evidence | supported as a remainder. Usually Q-ONHAND minus Q-RSV, with policy extras |
| Q-NOT-ATP | Promised beyond on-hand | Reservation that is not yet covered by stock | Moqui `quantityNotAvailable` | domain-evidence | supported as a remainder of a reservation |
| Q-PLANNED | Planned output | Work order qty not yet manufactured | ERPNext Planned Qty | domain-evidence | supported as a plan, not stock |
| Q-REQ | Requested inbound | Material request not yet ordered | ERPNext Requested Qty | domain-evidence | supported as a plan |
| Q-ORD | Ordered inbound | Purchase ordered, not received | ERPNext Ordered Qty. Odoo Incoming | domain-evidence | supported as a commitment, not stock |
| Q-OUT | Outgoing committed | Sales or delivery demand not yet issued | Odoo Outgoing. ERPNext Reserved Qty on the sales path | domain-evidence | often equals Q-RSV. undetermined whether they always coincide |
| Q-PROJ | Projected, forecasted | Planning combination of stock and plans | ERPNext Projected Qty formula. Odoo Forecasted = On Hand + Incoming − Outgoing | derived | supported as a function. rejected as a stored fact |

ERPNext Projected Qty and Odoo Forecasted Qty are different formulas. See [matrix.md](matrix.md). Do not freeze one equation.

## Movement and observation

| ID | Name | Meaning | Sources | Kind | Decision |
| --- | --- | --- | --- | --- | --- |
| Q-MOVE | Movement qty | Quantity on an event | ERPNext SLE qty. Odoo move qty. VF `resourceQuantity`. Moqui receipt or issuance qty | domain-evidence | supported |
| Q-ACC | Accepted qty | Quantity accepted at receipt | ERPNext Purchase Receipt Accepted | domain-evidence | supported |
| Q-REJ | Rejected qty | Quantity refused at receipt | ERPNext Rejected, with Rejected Warehouse | domain-evidence | supported |
| Q-COUNT | Counted qty | Observed physical count | Odoo Counted. ERPNext reconciliation qty. Moqui PhysicalInventory | domain-evidence | supported as an observation |
| Q-DIFF | Difference, variance | Counted minus book, or raise minus lower | Odoo Difference. Moqui variance. VF raise and lower | derived | supported as a remainder of Q-COUNT and Q-ONHAND at a time |
| Q-SCRAP | Scrap qty | Output that is waste or by-product | ERPNext scrap item to scrap warehouse | domain-evidence | hypothesis. May be a produce event of a different specification |
| Q-LOSS | Process loss qty | Planned output that never became stock | ERPNext Process Loss. No stock impact. Cost folded into remaining FG | domain-evidence | supported as a cost allocation, not a stock qty |
| Q-OVER | Over-receive or over-deliver | Qty above ordered, inside an allowance | ERPNext Limit Percent | source-system artifact | hypothesis as policy on Q-MOVE |

## Identity-bearing quantities

| ID | Name | Meaning | Sources | Kind | Decision |
| --- | --- | --- | --- | --- | --- |
| Q-SERIAL | Serial presence | Quantity is one, or absent | ERPNext Serial No status Available. VF tracking identifier | domain-evidence | supported |
| Q-LOT | Lot qty | Substitutable quantity under one lot id | ERPNext Batch actual qty. Odoo lot on-hand. VF batch record | domain-evidence | supported |
| Q-UOM | Qty in a unit | Same stuff, different unit | ERPNext Stock UOM versus transaction UOM. Odoo UoM | domain-evidence | supported. Conversion is not identity. Product L-05 |

## Valuation, not quantity

| ID | Name | Meaning | Sources | Kind | Decision |
| --- | --- | --- | --- | --- | --- |
| V-IN | Incoming rate | Value at which a receipt entered | ERPNext Incoming Rate | domain-evidence | supported |
| V-RATE | Valuation rate | Unit cost under the costing method | ERPNext Valuation Rate. Odoo unit cost | domain-evidence | supported |
| V-BAL | Balance value | V-RATE times Q-ONHAND, or sum of layers | ERPNext Balance Value | derived | supported as a function |
| V-LAYER | Valuation layer | A cost slice consumed by FIFO or average | Odoo SVL. ERPNext FIFO layers implied by perpetual examples | domain-evidence | supported that layers exist. undetermined as a primitive |
| V-LAND | Landed cost | Charges added after receipt | ERPNext Landed Cost Voucher, additional costs | domain-evidence | supported as a revaluation event |

## Candidate invariants on quantities

These are candidate laws restated as quantity rules. Full cards live in [candidate-laws.md](candidate-laws.md).

1. Q-ONHAND and Q-OWNED can diverge. VMI, consignment, FOB, loan.
2. Q-ATP is not stored independently of Q-ONHAND and Q-RSV unless a source proves a third independent input.
3. Q-PROJ is never authoritative stock.
4. Q-COUNT does not change Q-ONHAND until an apply or raise or lower event.
5. Q-SERIAL cannot be negative. Q-ONHAND for fungible qty can be negative only as a documented policy exception.
6. V-* never substitute for Q-*. Consigned Q-ONHAND can be positive while V-BAL for the consignee is zero.

## Rejected collapses

| Collapse | Why it fails | Evidence |
| --- | --- | --- |
| One `qty` for owned and on-hand | VMI and consignment | E-01, E-04 |
| One `available` for on-hand | Reservation | E-08, E-09, E-10, E-11 |
| One `reserved` integer on Item | Purpose and identity | E-08, E-09, o2c L-004 |
| Projected as on-hand | Planning formula | E-08, E-10 |
| Valuation as quantity | Consignment excluded from valuation | E-04, E-22 |
| Quarantine as a GS1 standard qty | CBV forbids inventing quarantined | E-21 |
