# Planning lifecycles

**Kind:** domain-evidence  
**Decision:** supported as observed source lives. A single OS lifecycle is `undetermined`.

This page records how plans, requirements, and schedules move in the corpora. It does not propose an OS state machine.

Execution after release belongs to issue #19. Stock balances belong to issue #18.

## 1. ERPNext Production Plan

Observed statuses on the DocType: Draft, Submitted, Not Started, In Process, Completed, Closed, Cancelled, Material Requested.

```text
draft
  -> submit
      -> optional reserve stock
      -> create work orders and material requests
      -> Material Requested if any raw row was requested
      -> In Process if any ordered or produced qty
      -> Completed if every planned row is produced
      -> Closed  (user stop, even if leftover qty)
      -> re-open from Closed
  -> cancel
      -> delete draft work orders
      -> release reservations
```

Submit is an authorization boundary. Close is a stop-spawning boundary. Complete is a quantity boundary. Those three are not one flag.

`amended_from` exists. A full plan-version graph was not traced.

**Kind of this document:** source-artifact that looks like an Action plus a projection of produced qty. Not enough to close the Action-versus-projection fork.

## 2. ERPNext MPS and MRP report

```text
type or compute Sales Forecast
  -> link forecast on Master Production Schedule
  -> pull sales orders, material requests, delivery schedules
  -> Get Actual Demand
  -> MRP report
      -> explode BOM
      -> offset lead time
      -> net on-hand, PO, WO
      -> optional add safety stock
  -> make_order
      -> Purchase Order or Work Order
```

The MPS is a demand-capture document with a horizon. The MRP report is a Function. `make_order` is an Action. The manuals keep those steps separate even though the UI sits in one manufacturing module.

## 3. Odoo MPS

```text
enable MPS, set period and column count
  -> add product (route Buy or Manufacture, optional BoM)
  -> type Forecasted Demand per period
  -> system suggests Replenishment from safety target and min/max
  -> user may edit Replenishment
  -> Order (row, selection, or all)
      -> RfQ if Buy
      -> Manufacturing Order if Manufacture
```

Until Order, the grid is a projection. Automatic trigger is a setting that turns suggestion into an order without a click. Never means the row is informational.

Official docs forbid using reordering rules on the same products.

There is no Close status. Stale numbers are overwritten in place.

## 4. Odoo replenishment strategies beside MPS

```text
reordering rule
  -> forecasted stock <= minimum
  -> suggest or create PO/MO to maximum

MTO
  -> sales order confirmed
  -> draft PO/MO linked to that order
  -> qty follows the forecast until the supply order is confirmed

MPS
  -> typed forecast over a horizon
  -> manual or automatic Order
```

These are three lives that can emit the same document types. The trigger and the linkage differ.

## 5. Odoo work-center plan

```text
work order created from MO / BoM operation
  -> scheduled onto a work center calendar
  -> user may drag time or change center
  -> if center is on time off, Plan may send work to Alternative Workcenters
  -> after time off, Plan prefers the original unless it is at capacity
```

Load and OEE are reported. A hard refuse when two orders overlap was not in the official pages opened this session.

## 6. Moqui Requirement

```text
Proposed or Created
  -> Approved
      -> Ordered  (RequirementOrderItem)
      -> Rejected
  -> Rejected
```

Inventory requirements can be born from every order, from ATP or QOH breach, or for drop-ship. After approval they are summarized by product and facility, then turned into an order.

Work requirements go to a RequestItem or a WorkEffort through WorkRequirementFulfillment (Implements, Fixes, Deploys, Tests, Delivers).

A Request has its own life: Draft, Submitted, Reviewed, In Progress, Completed, Cancelled, plus a resolution.

Priority lives on Request, not on Requirement.

## 7. ValueFlows plan layer

```text
recipe
  -> Plan
      includes Process, Intent, Commitment
      hasIndependentDemand -> Intent or Commitment
  -> EconomicEvent fulfills Commitment, satisfies Intent, or both
```

The same Process instance can carry planned flows and later observed events. That is a strong exhibit for plan versus execution without making Plan an Action.

Pages that would describe plan revision were 404 this session.

## 8. ISA-95 public shape

```text
Level 4 business planning
  -> Operations Schedule / Work Schedule   (intent to the plant)
Level 3 operations management
  -> Operations Performance / Work Performance  (what happened)
Level 4
  -> may send a new schedule
```

Capability models sit beside schedule models. Attribute lists are `undetermined`.

## 9. What every lifecycle still forces

Across sources, something like this sequence appears even when names differ.

```text
sense or type demand
  -> distinguish forecast from promise when both exist
  -> explode dependents
  -> net against a position
  -> offset by lead time
  -> optionally look at capacity
  -> someone or some rule authorizes supply orders
  -> execution produces events
  -> the plan is now stale or complete or closed
```

The disputed joints are the identity of demand, the nature of the plan object, and whether capacity can reject the plan.

## 10. Function versus Action in these lives

| Step | Better candidate | Why |
| --- | --- | --- |
| Explode, net, offset, bucket, smooth history | Function | Same inputs give the same outputs in the reports we read |
| Save a forecast, submit a production plan, Order on MPS, approve a requirement | Action | Authority and a new operational fact |
| Finite sequence under an objective | Optimization Function, if later accepted | Search, not a unique arithmetic line |
| Choose which late order to slip | Agent proposal then Action | Judgment. Not published as a formula |
| Receipt, produced qty, work-center time off | Event | Happened. May stale a plan |

This table is a reading of the corpora. It is not an RFC-0001 edit.
