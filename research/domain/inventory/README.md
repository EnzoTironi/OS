# Inventory

**Issue.** [#18](https://github.com/EnzoTironi/OS/issues/18)  
**Track.** domain  
**Fetched.** 2026-08-16  
**Decision.** mixed. See [candidate-laws.md](candidate-laws.md) and [open-questions.md](open-questions.md).  
**Contract.** Wave A output contract in `docs/swarm-research-backlog.md`. `docs/swarm-result-contract.md` is not on `origin/main`.

## Question

When a warehouse, a ledger, and a legal claim all talk about "stock," which facts are independent? Physical possession, legal ownership, location, reservation, movement, lot or serial identity, valuation, and reconciliation keep collapsing into one quantity field. Which of those collapses are domain laws, and which are source-system accidents?

## Overview

Independent sources agree on a small set of splits and then disagree on how to store them.

The splits that survive this pass are ownership versus custody, location versus party, on-hand versus available, reservation versus movement, movement versus adjustment, lot versus serial, and quantity versus valuation. ValueFlows and GS1 EPCIS name ownership and custody as different actions or source types. ERPNext, Odoo, and Moqui implement custody as warehouse or facility location and treat ownership as an optional owner field, a supplier warehouse, or a consignment flag.

Current quantity is a projection in every source that talks about explainability. ERPNext writes a stock ledger entry per submitted voucher. Moqui derives `quantityOnHandTotal` from `AssetDetail` diffs. ValueFlows says economic fields on a resource are initially put there by events and could be recalculated. Odoo still stores a `stock.quant` and then records a move when an adjustment is applied. That last shape is a source artifact, not a reason to treat on-hand as a free-standing fact.

This folder is evidence. It is not a target schema.

## Key concepts

**Specification.** What kind of thing can be stocked. Not an inventory balance. Sibling `research/domain/product/` on `origin/cursor/issue-15-domain-cfd8`.

**Stock slice.** A homogeneous quantity addressed by specification, identity grain, location, and owner or custodian. Odoo `stock.quant`. Moqui non-serialized `Asset`. ValueFlows resource keyed by specification plus location plus accountable agent.

**On-hand, or actual.** Quantity in physical custody at a location. ERPNext Actual Qty. Odoo On Hand. Moqui `quantityOnHandTotal`. ValueFlows `onhandQuantity`.

**Accounting quantity, or owned.** Quantity for which an agent has primary rights. ValueFlows `accountingQuantity`. Odoo consignment Owner. GS1 `owning_party`. Often missing as a first-class field in ERPNext.

**Available, or ATP.** On-hand minus exclusive claims, sometimes plus incoming. Moqui `availableToPromiseTotal`. Odoo available after reservation. ERPNext Actual minus several Reserved Qty columns, then a separate Projected Qty.

**Reservation.** A temporary exclusive claim on a slice for a purpose. It does not move the goods. ERPNext Stock Reservation Entry. Odoo reserved quantity on a move line and quant. Moqui `AssetReservation`. Sibling `research/domain/o2c/` law L-004.

**Movement.** An occurrence that changes location, custody, ownership, or identity of a quantity. ERPNext Stock Ledger Entry. Odoo `stock.move`. ValueFlows Economic Event. GS1 EPCIS event.

**Adjustment, or raise and lower.** A movement used when the real cause is unknown or at cutover. ValueFlows `raise` and `lower`. ERPNext Stock Reconciliation. Odoo inventory adjustment.

**Lot.** Shared identity for substitutable units. Quantity lives on the lot. Serial is one unit.

**Disposition.** Business condition after an event. GS1 `recalled`, `damaged`, `in_transit`, `available`. Not the same fact as a bin.

**Valuation layer.** Cost attached to a quantity layer or to a serial. FIFO, LIFO, moving average, standard. Not a second quantity taxonomy.

## How the split works

A receipt can change on-hand without changing owned quantity. Odoo consignment receives into the warehouse and assigns the vendor as Owner. ValueFlows `transferCustody` increments `onhandQuantity` for the receiver and leaves `accountingQuantity` with the vendor. GS1 can emit `possessing_party` without `owning_party`.

A reservation can change available without changing on-hand. ERPNext v15 Stock Reservation creates entries against a sales order or pick list. Odoo reserves on confirmation, manually, or before a scheduled date. Moqui creates `AssetReservation` when an item is promised and deletes it when `AssetIssuance` fulfills it.

A transfer can change location without changing owner. ERPNext Material Transfer and Add to Transit. ValueFlows `move`. Odoo Relocate on the Physical Inventory page. GS1 `readPoint` versus `businessLocation`.

A rights transfer can change owner without changing location. ValueFlows `transferAllRights`. FOB source in ValueFlows. The receiver already has accounting quantity while the goods sit on a truck.

A transformation consumes inputs and produces outputs. ERPNext Manufacture stock entry. ValueFlows `consume` and `produce`. GS1 `TransformationEvent`. Sibling `research/standards/` law L-004 and L-005. Packing is not this. Repair that keeps identity is `accept` and `modify`, not consume and produce.

## Where things live

| File | Mode |
| --- | --- |
| [sources.md](sources.md) | Pages and sibling notes fetched or read this session |
| [evidence.md](evidence.md) | Labeled blocks |
| [quantities.md](quantities.md) | Quantity taxonomy |
| [matrix.md](matrix.md) | Convergence and divergence |
| [scenarios.md](scenarios.md) | Thirty-six adversarial cards |
| [candidate-laws.md](candidate-laws.md) | Smallest claims and falsifiers |
| [open-questions.md](open-questions.md) | What this pass leaves `undetermined` |

Sibling notes on other branches, read only:

- `research/domain/product/` laws L-04, L-05, L-06 on `origin/cursor/issue-15-domain-cfd8`
- `research/domain/o2c/` law L-004 on `origin/cursor/issue-16-domain-cfd8`
- `research/foundation/temporal/` L1 and L4 on `origin/cursor/issue-5-foundation-cfd8`
- `research/foundation/state/` CL-1 and CL-3 on `origin/cursor/issue-12-foundation-cfd8`
- `research/standards/` L-002 through L-006 on `origin/cursor/issue-38-corpus-cfd8`
- `research/erpnext/`, `research/odoo/`, `research/moqui/`, `research/valueflows-rea/` on the matching corpus branches

## Gotchas

ERPNext Warehouse is a storage-location tree that can be a shelf or a bin. Linking every leaf to its own GL account is optional and usually wrong. That is a source artifact.

Odoo Location Type includes Vendor, Customer, Transit, Production, Inventory Loss, and Virtual. Those types mix party, process, and loss. Do not promote Location Type into an OS primitive.

Moqui `Asset` is inventory, equipment, and fixed asset. The entity name is not the domain law.

ValueFlows stores current `accountingQuantity` and `onhandQuantity` on the resource "for performance" while saying they are derived. That is a runtime hint, not a decision that current state is primary.

GS1 CBV forbids inventing `urn:epcglobal:cbv:disp:quarantined`. Quarantine is a user vocabulary or a location plus disposition, not a missing GS1 enum.
