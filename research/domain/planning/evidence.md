# Evidence

**Fetched:** 2026-08-16  
**Decision:** mixed. Each card has its own state.

Cards are observations. Laws live in [candidate-laws.md](candidate-laws.md). Inventory position details belong to issue #18. BOM and routing details belong to issue #19.

---

## E-01 Forecast is not a sales order

**Kind:** domain-evidence  
**Decision:** supported

ERPNext documents a Sales Forecast that users type, plus a smoothing report over historical Sales Orders, Delivery Notes, or Quotations. The MRP report then takes `demand_qty = max(planned_qty, sales_forecast_qty)` and can still add ad-hoc sales-order quantity that was not already in the MPS.

Odoo MPS has a Forecasted Demand row that a user types. Enabling Actual Demand shows confirmed sales-order demand beside that forecast.

ValueFlows splits Intent (proposed or estimated flow) from Commitment (agreed flow).

**Source artifacts:** ERPNext MRP manual and report SHA `c3e45e755ac8d4e34d8d555664ccb2c1ac1bc289`. Odoo MPS 18.0. ValueFlows Intent and Commitment.

**Not shown:** a single object whose status flip turns a forecast into a commitment. Identity remains `undetermined`.

---

## E-02 Independent demand is the plan's reason. Dependent demand is calculated

**Kind:** domain-evidence  
**Decision:** supported

ValueFlows Plan `hasIndependentDemand` points at the commitments or intents the plan exists to deliver. Dependent flows come from recipe explosion into the plan.

ERPNext MPS holds finished-item demand. The MRP report walks the default BOM and emits purchase or manufacture rows for components. Production Plan "Get Sub Assembly Items" does the same for a submitted plan.

Odoo MPS adds an Indirect Demand Forecast row only when the product is a component of another product. Selecting a BoM when adding a product also adds those components to the grid.

**Source artifacts:** ValueFlows `hasIndependentDemand`. ERPNext Production Plan manual. Odoo MPS 18.0.

**Issue #19:** the BOM and recipe themselves are manufacturing specifications. Planning consumes them.

---

## E-03 A planning horizon is a bounded bucketed interval

**Kind:** domain-evidence  
**Decision:** supported

Odoo MPS is a grid of Yearly, Monthly, Weekly, or Daily periods, with a configured number of columns.

ERPNext MPS has `from_date` and `to_date`. The MRP report can show Daily, Weekly, or Monthly buckets and will convert monthly or weekly forecast rows into daily slices by equal split.

**Source artifacts:** Odoo MPS configuration. ERPNext MPS JSON SHA `39e4bbb16adc5fc31ebab6196293837070df822a`. MRP report `get_dates` and `convert_to_daily_bucket_data`.

**Inference, not evidence:** horizon is a parameter of a plan run, not a kind of demand.

---

## E-04 Safety stock is a policy with at least two published formulas

**Kind:** domain-evidence  
**Decision:** supported that the policy exists. Formula is divergent.

ERPNext Production Plan has `include_safety_stock`. The MRP report, when `add_safety_stock` is on, does `required_qty += safety_stock` after netting on-hand, purchase orders, and work orders.

Odoo MPS Safety Stock Target is the minimum quantity to keep across periods. Suggested replenishment is `Safety Stock Target - Starting Stock - Forecasted Demand - Indirect Demand`, then clamped by min and max replenish.

Those are not the same arithmetic. ERPNext adds a cover quantity to a shortage. Odoo aims at an ending inventory target.

**Source artifacts:** Production Plan JSON field `include_safety_stock`. MRP report `add_safety_stock`. Odoo MPS replenishment equation.

---

## E-05 Lead time offsets release from due date

**Kind:** domain-evidence  
**Decision:** supported

ERPNext Item Lead Time stores manufacturing minutes or purchase days plus buffer. The MRP report sets `release_date = add_days(delivery_date, lead_time * -1)` and recurses that offset down the BOM.

ERPNext Production Plan `no_of_shifts` scales Item Lead Time daily capacity when an item has no BOM operations.

Odoo 18.0 work-center docs define working hours, setup, cleanup, and time efficiency. Product purchase and manufacture lead times were not opened this session. Odoo lead-time field semantics are `undetermined` at the product form.

**Source artifacts:** ERPNext MRP manual "Item Lead Time". MRP report `get_item_lead_time`, `update_rm_details`. Production Plan field `no_of_shifts`.

---

## E-06 Material requirements are netted against a projected position

**Kind:** domain-evidence  
**Decision:** supported as a calculation. Position definition belongs to #18.

ERPNext published formula:

`Projected Qty = Actual Qty + Planned Qty + Requested Qty + Ordered Qty - Reserved Qty - Reserved Qty for Production - Reserved Qty for Subcontracting - Reserved Qty for Production Plan`

Production Plan "Skip Available" uses `Required Qty = BOM Required Qty - Projected Qty`.

The MRP report nets in a different order on each row: start from planned or forecast demand, consume on-hand minus reserved stock, then open POs, then open WOs, then optional safety stock.

Odoo MPS uses starting stock, forecasted and indirect demand, and replenishment to compute forecasted stock. Available to Promise is offered as `Starting Stock - Actual Demand + Replenishment`.

**Source artifacts:** https://docs.frappe.io/erpnext/projected-quantity. Production Plan manual examples. Odoo MPS row equation.

**Issue #18:** which of actual, reserved, ordered, and ATP is "available" is not decided here.

---

## E-07 A submitted production plan can reserve and authorize work

**Kind:** source-artifact  
**Decision:** supported for ERPNext. Not universal.

ERPNext Production Plan is submittable. Statuses include Draft, Submitted, Not Started, In Process, Completed, Closed, Cancelled, Material Requested. Submit updates bins, sales-order planned qty, and optional stock reservations. After submit the user creates Work Orders and Material Requests. Close stops new work against the plan. Cancel deletes draft work orders and releases reservations.

Odoo MPS documentation says adding a product does not create a PO or MO. The user, or an automatic trigger, must Order. The grid is a suggestion until that Action.

Moqui Requirement moves Proposed or Created to Approved, then Ordered. Approval is a status on the requirement, not a separate plan document.

**Source artifacts:** Production Plan statuses and `on_submit` / `set_status`. Odoo MPS "Important" note. Moqui Requirement seed statuses.

This is the main exhibit for the plan-as-Action versus plan-as-projection fork. The fork stays `undetermined`.

---

## E-08 Forecast and committed demand are combined by a rule, not by identity

**Kind:** source-artifact  
**Decision:** supported that combination is a rule. Identity `undetermined`.

ERPNext MRP uses `max(planned_qty, sales_forecast_qty)` then may add ad-hoc sales-order qty that was not in the MPS. Sales orders already listed on the MPS are skipped when scanning ad-hoc demand.

Odoo shows Actual / Forecasted Demand as two numbers in one row when the filter is on. The published stock equation still subtracts Forecasted Demand, not a documented max or sum of actual and forecast.

Those combination rules disagree. Neither source says the forecast row becomes the sales order.

---

## E-09 Capacity appears as a number. Capability is thinner in the open corpora

**Kind:** domain-evidence  
**Decision:** capacity as load is `supported`. Capability as a distinct kind is `hypothesis`. ISA-95 attributes `undetermined`.

Odoo work center Capacity is how many products can be processed at once. Specific Capacities override that per product. Alternative Workcenters name a substitute when the first is unavailable. Planning by Workcenter shows scheduled minutes. Load is time to finish current work.

ERPNext MRP reads `capacity_per_day` from Item Lead Time and scales it by bucket size. That is an item-level make rate, not a work-center calendar.

ISA-95 Part 5 preview lists Operations Capability and Work Capability as models. Part 1 terminology was not readable.

Moqui WorkEffortAssetNeeded plans for a type of asset. WorkEffortAssetAssign occupies a specific asset.

**Issue #19:** work center, routing, and execution stay there. Planning only needs the distinction between "can this resource do this" and "does it have time."

---

## E-10 Classical MRP can emit an infeasible capacity plan

**Kind:** domain-evidence  
**Decision:** supported as a known failure mode

Wikipedia APS. Classical MRP and MRP II allocate material and capacity in steps. Many systems ignore material or capacity constraints and produce plans that cannot run. APS is defined as simultaneous allocation of materials, labor, and plant capacity.

ERPNext and Odoo first-party planning docs publish material netting and date offset. They do not publish a constraint that refuses a plan when a work center is double-booked. Odoo shows load. Showing load is not the same as refusing the plan.

Finite versus infinite is therefore a real domain split. Which runtime primitive enforces finite is Wave B.

---

## E-11 Replenishment strategy is not one verb

**Kind:** source-artifact  
**Decision:** supported

Odoo names three stock-replenish paths.

1. Reordering rules fire when forecasted stock crosses a minimum.
2. MTO creates a PO or MO from a confirmed sales order and keeps the link.
3. MPS plans against typed forecasts over a horizon and must not run beside reordering rules.

ERPNext Production Plan can be filled from Sales Orders, Material Requests, or typed items. A later MPS plus MRP report adds forecast and delivery schedules.

Moqui can create inventory requirements on every order, on ATP or QOH breach, or for drop-ship.

These are different triggers over similar make-or-buy outcomes. Collapsing them into one "plan" Action would hide the trigger.

---

## E-12 Priority is weakly modeled in the open ERP corpora

**Kind:** source-artifact  
**Decision:** undetermined as a planning primitive

Moqui Request has an integer `priority`. Requirement does not.

ERPNext Production Plan filters sales orders by status and dates. No plan-level priority field was present on the DocType fetched this session.

Odoo MPS docs do not describe a priority rank among products. Min and max replenish and safety target act as bounds, not ranks.

APS literature treats competing products on shared capacity as a reason APS exists. That is a problem statement, not a field mapping.

---

## E-13 Optimization objective is unnamed in the ERP manuals

**Kind:** source-artifact  
**Decision:** undetermined

ERPNext MRP and Production Plan publish arithmetic. They do not name an objective such as minimize tardiness, changeovers, or inventory.

Odoo MPS publishes a target-stock equation and clamps. That is a heuristic, not a stated objective function.

APS is defined as optimal allocation. No first-party page fetched here writes the objective in math.

**Runtime consequence if a later law survives:** an optimization Function must take an explicit objective. A hidden default is a hidden business rule.

---

## E-14 Plan close is not plan complete

**Kind:** domain-evidence  
**Decision:** supported for ERPNext. Presence elsewhere `undetermined`.

ERPNext lets a user Close a Production Plan that is only partly done, so leftover items will not spawn more Work Orders. Reasons in the manual include independent production outside the plan and a change of intent. The same plan can be re-opened.

Completed is a different status, driven by produced quantity versus planned quantity.

Odoo MPS has no close-the-plan document in the 18.0 page. Rows remain editable.

ValueFlows does not, in the pages fetched, give Plan a close-versus-complete pair.

---

## E-15 Delivery can be split inside one sales order

**Kind:** domain-evidence  
**Decision:** supported

ERPNext MRP manual. Some customers refuse one delivery against a sales order. Delivery Schedules on the sales-order line tell MRP when material is needed instead of assuming the full quantity is due on one date.

That is a time-phased independent demand, not a new product kind.

Related seed scenario: `scenarios/README.md` S-001 requested, promised, planned, actual dates.

---

## E-16 Deterministic smoothing is not the same as a committed forecast

**Kind:** source-artifact  
**Decision:** supported

ERPNext Forecasting report applies exponential smoothing to history. The MRP manual still says users often type Sales Forecast rows calculated outside the system.

A computed suggestion and an adopted forecast are different speech acts. The report is a Function. Saving a Sales Forecast and linking it to an MPS is closer to an Action. The manuals do not use those words.

---

## E-17 Alternate resource is a named substitute, not an optimizer output

**Kind:** source-artifact  
**Decision:** supported as a configuration. Automatic choice under load is `undetermined`.

Odoo Alternative Workcenters. When the primary center is on time off, the Plan button can send work to the alternative. After time off ends, Plan does not reroute unless the first center is at capacity.

That is a fallback rule. It is not a search over a costed set of alternates.

ERPNext Production Plan manufacturing type on a sub-assembly can be In House, subcontract purchase, or material request. That is a sourcing alternate, not a machine alternate.

---

## E-18 ISA-95 separates schedule messages from performance messages

**Kind:** domain-evidence  
**Decision:** hypothesis from public Part 5 model names. Attribute detail `undetermined`.

ISA official page. Level 4 is business planning and logistics. Level 3 is manufacturing operations management. The standard is about the interface between those levels.

Part 5 preview lists Operations Schedule, Operations Performance, Operations Capability, Work Schedule, and Work Performance as distinct models.

That is enough to treat "what we asked the plant to do" and "what the plant did" as different objects. It is not enough to import Part 1 attribute lists.

Execution objects stay with issue #19.
