# Scenarios

**Kind:** counterexample unless noted  
**Decision:** each card is a test, not a passed test  
**Fetched:** 2026-08-16

Thirty cards. Happy paths are omitted. Seed suite S-001 and S-003 are reused, not replaced.

Each card says what would falsify a nearby law. Execution detail after release belongs to #19. Bin math belongs to #18.

---

## P-01 Late firm order inside a frozen forecast

**Family:** late demand  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-02, L-08

Week 1 forecast for item A is 100. MPS adopted it. A sales order for 40 arrives on Wednesday for Friday delivery.

Questions. Does independent demand become 100, 140, or `max(100, 40)` plus leftover forecast. ERPNext would take max then add ad-hoc if the order was not on the MPS. Odoo would show actual 40 beside forecast 100. Which rule is the domain.

Falsifier. One combination rule that both first-party systems already share. They do not.

---

## P-02 Late demand after work orders were released

**Family:** late demand  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-07, L-08

Production Plan submitted. Work orders released. A new sales order lands for the same item and week.

Questions. Is the plan stale. Must replan create a new revision. May the old work orders stand.

Falsifier. A source that mutates the released work order qty in place and still calls the original plan approved.

---

## P-03 Delivery schedule arrives after a single-date explosion

**Family:** late demand  
**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** L-04, E-15

Sales order qty 90 due month-end. MRP exploded all 90. The customer then splits into three weekly deliveries of 30.

Questions. Are there three independent-demand facts. Does lead-time offset move three release dates.

Falsifier. A correct plan that still uses one due date after the split is known.

---

## P-04 Constrained work center, two jobs, one shift

**Family:** constrained capacity  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-06, L-10

Center C can run one job. Job 1 and job 2 both have due Friday and four hours of work. The shift is six hours.

Questions. Does the material plan still release both. Does any Function return infeasible. Who picks the loser.

Falsifier. Official Odoo or ERPNext docs that refuse the second job. Not found this session.

---

## P-05 Infinite MRP says on time. The plant cannot start

**Family:** constrained capacity  
**Kind:** domain-evidence  
**Decision:** supported as a known failure  
**Attacks:** L-06

Lead-time offset places release on Monday. Every machine that can run the routing is already loaded Monday through Wednesday.

Questions. Is the planned date still Monday. Where does overload live. Is that a Constraint on an Action or an output of a Function.

---

## P-06 Safety target versus added cover under a tight calendar

**Family:** constrained capacity  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-05

Net need is 0. Safety policy wants 50. The only resource is already full.

Questions. Does the system still launch a 50-unit make. Does finite scheduling drop safety first.

Falsifier. One agreed precedence between safety policy and capacity.

---

## P-07 Alternate work center when the primary is on time off

**Family:** alternate resource  
**Kind:** domain-evidence  
**Decision:** supported as a documented Odoo path  
**Attacks:** L-09

Center A is on maintenance. Center B is listed as alternative. User clicks Plan.

Questions. Is B a capability match or only a configured fallback. If B is slower, who owns the new planned dates.

Source. Odoo work-center time-off page.

---

## P-08 Alternate work center when both are up and A is overloaded

**Family:** alternate resource  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-09, L-10

A and B can both do the operation. A is cheaper. A is full. B is idle.

Questions. Does any first-party Function move the job. Odoo says Plan prefers A after time off unless A is at capacity. "At capacity" semantics were not proven in code this session.

Falsifier. A published objective that picks B when overtime on A is worse.

---

## P-09 Subcontract versus in-house on one sub-assembly

**Family:** alternate resource  
**Kind:** source-artifact  
**Decision:** supported as an ERPNext choice  
**Attacks:** L-09

Production Plan sub-assembly manufacturing type can be In House, subcontract purchase, or material request.

Questions. Is that a capability choice, a sourcing Action, or both. Does changing type after submit amend the plan or require a new one.

Issue #19 owns subcontract execution.

---

## P-10 Material shortage discovered at netting

**Family:** material shortage  
**Kind:** domain-evidence  
**Decision:** supported  
**Attacks:** L-03

BOM needs 100 of C. Projected qty of C is 40. Skip-available is on.

Questions. Is the plan still approvable. Is the shortage a Function output or a Constraint that blocks submit.

ERPNext still lets the user submit and then create a material request for 60.

---

## P-11 Material shortage discovered after approval

**Family:** material shortage  
**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** L-08

Plan approved when projected C was 100. A backdated issue (#18, S-007 family) drops historical on-hand. Net need is now 80 short.

Questions. Valid-time stock versus knowledge-time stock. Which plan revision is stale. Must commit re-read.

---

## P-12 Shared component, two parents, one shortage

**Family:** material shortage  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-01, L-03

Parent A and parent B both explode to C. On-hand C covers only A.

Questions. Does netting allocate C to A first, split, or leave both short. Priority is `undetermined` (E-12).

Falsifier. A first-party rule that always prefers the earlier due parent, found in both ERPNext and Odoo. Not shown this session.

---

## P-13 Stale approved Production Plan after a receipt

**Family:** stale approved plan  
**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** L-07, L-08  
**Related:** seed S-003

At 10:01 the plan nets a buy of 1000 because available is 20 and demand is 980. Human approves at 10:07. At 10:06 a receipt of 800 posts.

Questions. What was approved. Parameters, assumptions, or a document id. Must submit re-read bins. ERPNext submit reserves from current bins. Timing still matters.

---

## P-14 Stale Odoo MPS row after automatic Order

**Family:** stale approved plan  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-07

Replenishment Trigger is Automatic. Forecast was 200. Actual demand later drops to 20. An MO for 200 already exists.

Questions. Does the grid turn red (replenishment too high). Is there a cancel Action. Is the MO still the plan.

Odoo docs describe color states. They do not describe an automatic cancel.

---

## P-15 Closed plan with leftover demand

**Family:** stale approved plan  
**Kind:** domain-evidence  
**Decision:** supported for ERPNext  
**Attacks:** L-07, E-14

Plan is half produced. The rest will be made outside the plan. User Closes.

Questions. Does leftover independent demand still exist. Can a new plan claim it. Can the closed plan be re-opened and double-order.

---

## P-16 Forecast adopted from smoothing, then history is corrected

**Family:** late demand  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-02, L-11

Exponential smoothing used last year's sales orders. A cancellation backdates one large order out of history.

Questions. Does the adopted Sales Forecast change. Or is the report a Function that must be re-run and re-adopted.

E-16. Computed suggestion versus saved forecast.

---

## P-17 Quotation history used as if it were demand

**Family:** late demand  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-02

ERPNext smoothing can run on Quotations. A quote is not a commitment.

Questions. If that output is saved as Sales Forecast and fed to MPS, has the system laundered intent into independent demand.

Falsifier. A source that forbids quote-based forecasts from entering MPS without an extra Action.

---

## P-18 MTO and MPS both fire for one product

**Family:** stale approved plan  
**Kind:** counterexample  
**Decision:** supported as a documented conflict in Odoo  
**Attacks:** E-11

Odoo says MPS must not sit beside reordering rules. MTO plus MPS is also two triggers.

Questions. Two supply orders for one sales line. Which one is the plan.

Falsifier. A first-party page that defines a safe composition. The replenishment page warns instead.

---

## P-19 Spare part is both independent and dependent

**Family:** material shortage  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-01

Item G is a component in a machine BOM and is also sold as a spare. Forecast of spares is 20. Explosion from machines is 50. On-hand is 30.

Questions. Two independent facts plus one dependent fact, or one blended demand. ValueFlows would allow a spare Intent plus a plan for the machine.

---

## P-20 Minimum order qty lifts a tiny net need

**Kind:** source-artifact  
**Decision:** supported in ERPNext MRP  
**Attacks:** L-03

Net need is 3. Min order qty is 20. `make_order` raises qty to 20.

Questions. Is the extra 17 independent demand, safety, or a supply policy. It is not exploded from a parent.

---

## P-21 Whole-number UOM rounds a fractional explosion

**Kind:** source-artifact  
**Decision:** supported in ERPNext MRP  
**Attacks:** L-03

Explosion yields 4.2. UOM must be whole. Qty becomes 5.

Questions. Rounding is a Function. It changes material need. It is not judgment.

---

## P-22 Horizon end cuts a lead-time tail

**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** E-03, L-04

Horizon is 8 weeks. Purchase lead time is 12 weeks. Net need sits in week 8.

Questions. Does the Function emit a release date in the past, drop the row, or demand a longer horizon.

ERPNext release_date can precede today. Past due is a result, not a block, in the report code that was read.

---

## P-23 Equal-split of a monthly forecast into days

**Kind:** source-artifact  
**Decision:** supported as ERPNext behavior  
**Attacks:** L-02

Monthly forecast 300 becomes 10 per day. Actual orders all land on the last day.

Questions. Bucket conversion is a Function that invents timing. Late-demand cards must say which bucket grain was pinned.

---

## P-24 Two sales orders, consolidate items, one work order

**Kind:** source-artifact  
**Decision:** supported for ERPNext  
**Attacks:** L-07

Production Plan consolidate combines the same BOM into one planned qty. Pegging to each sales order is then a reference table.

Questions. If one order cancels, does the combined work order shrink. Identity of the plan line versus the commitment.

---

## P-25 Reserve stock on submit, then close

**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-07, #18

`reserve_stock` is on. Submit reserves raw materials for the plan. User Closes with leftover qty.

Questions. Do reservations die on close. The Python `set_status` updates bins on close. Exact reservation release on close was not fully traced. Marked partial.

---

## P-26 Cancel plan after some work orders are submitted

**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** L-07

Cancel deletes draft work orders. Submitted work orders are execution (#19).

Questions. Can a plan cancel while authorized work remains. What fact says the plan no longer owns those orders.

---

## P-27 Rough-cut capacity from item rate, not work-center calendar

**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** L-09

ERPNext `capacity_per_day` on Item Lead Time says 10 a day. Two items that share one machine each claim 10 a day.

Questions. Summed item rates exceed the machine. The material plan still looks green.

---

## P-28 Allowed employees missing on a capable machine

**Family:** alternate resource  
**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-09

Odoo Allowed Employees lists certified operators. The center is empty this shift.

Questions. Is that a capability miss or a capacity miss. Finite scheduling without people is still infeasible.

---

## P-29 Frozen horizon versus agent expedite

**Kind:** counterexample  
**Decision:** undetermined  
**Attacks:** L-11, L-08

A company treats the next two weeks as frozen. An agent proposes pulling a job into the freeze to save a customer.

Questions. Is the freeze a Constraint on Replan. Is the agent allowed to propose, not commit.

No first-party freeze-horizon field was found in the ERPNext Production Plan JSON or Odoo MPS page.

---

## P-30 Level 4 schedule versus Level 3 performance mismatch

**Kind:** counterexample  
**Decision:** hypothesis  
**Attacks:** E-18, L-08

ISA-95 shaped exchange. ERP sends a schedule for 500. MES reports 480 good and 12 scrap.

Questions. Is the plan still 500. Is the remainder a new independent demand, a scrap-driven dependent need (#19), or a closed short.

Part 1 attributes `undetermined`. The card still stands as a message mismatch.

---

## Coverage

| Required family | Cards |
| --- | --- |
| Late demand | P-01, P-02, P-03, P-16, P-17 |
| Constrained capacity | P-04, P-05, P-06, P-27, P-28 |
| Alternate resource | P-07, P-08, P-09, P-28 |
| Material shortage | P-10, P-11, P-12, P-19, P-20 |
| Stale approved plan | P-13, P-14, P-15, P-18, P-25, P-26 |

Related seed cards: S-001 dates, S-002 partial fulfillment with changing plan, S-003 stale approval.
