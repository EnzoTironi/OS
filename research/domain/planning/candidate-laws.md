# Candidate laws

**Kind:** candidate-law  
**Decision:** each card names its own state  
**Fetched:** 2026-08-16

A law is the smallest claim that would explain the evidence. Counterexamples are how it dies. Runtime consequences are pressure, not a design.

RFC-0001 is not updated. No target schema. No solver product.

---

## L-01 Independent demand is not calculated from a parent. Dependent demand is

**Decision:** supported  
**Kind:** candidate-law

A plan is justified by independent demand. Component need is a function of that demand, a specification, and a netting position.

**Evidence:** E-02. ValueFlows `hasIndependentDemand`. ERPNext MPS versus BOM walk. Odoo forecasted versus indirect demand.

**Counterexample:** a component that businesses treat as independent because it is also sold as a spare. If spare demand is just another independent row, the law holds. If the same row is both exploded and independently promised without two facts, the law fails.

**Runtime consequence:** explosion is a Function. It must cite the specification revision it used. Issue #19 owns that specification.

---

## L-02 Forecast quantity and committed quantity are different facts

**Decision:** supported as distinct facts. Identity of the object that holds them is `undetermined`.

They may share an item, warehouse, and bucket. They do not share meaning. A combination rule (max, sum, ignore forecast once orders exist) is itself a Function with provenance.

**Evidence:** E-01, E-08. Odoo actual versus forecasted. ERPNext `max` plus ad-hoc. ValueFlows Intent versus Commitment.

**Counterexample:** a domain where the only demand that ever exists is a firm order, and forecast is only a report. That would shrink the law to "optional forecast fact," not kill the split when both exist.

**Forbidden silent move:** storing both in one `demand_qty` field.

This law does **not** say forecast and commitment are two types in the metamodel. That is the standing identity fork.

---

## L-03 Material netting is deterministic given a declared position

**Decision:** supported  
**Kind:** candidate-law

Gross need minus a declared inventory position and open supply yields net need. The arithmetic is a Function. The position is not redefined here.

**Evidence:** E-06. ERPNext projected-qty formula. Production Plan skip-available. Odoo forecasted-stock equation.

**Counterexample:** a netting run that needs an agent to pick which lots or which warehouses count as available. That would push availability policy into #18 and leave a Policy in front of the Function.

**Runtime consequence:** the Function pins the position snapshot and the rule version. Replaying yesterday's plan under today's stock is a different computation.

---

## L-04 Lead time is an offset, not a promise

**Decision:** supported  
**Kind:** candidate-law

Release date is due date minus a declared make or buy lead time, optionally plus buffer, optionally scaled by quantity and capacity. The result is a planned date. It is not a customer promise and not an actual start.

**Evidence:** E-05. Seed scenario S-001. ERPNext `release_date`.

**Counterexample:** a contract where promised date is defined as planned release plus lead time with no separate promise fact. That would collapse planned and promised in that company. It would not collapse them in S-001.

**Runtime consequence:** four dates stay distinct when they exist. Requested, promised, planned, actual.

---

## L-05 Safety stock is a policy applied during netting or targeting, not on-hand stock

**Decision:** supported that it is a policy. One formula is `rejected`.

ERPNext add-to-required and Odoo target-ending-inventory cannot be the same Function without a parameter that selects the policy.

**Evidence:** E-04.

**Counterexample:** a plant that models safety as a reserved physical lot. That would be inventory (#18), not a planning add-on.

**Runtime consequence:** do not store safety stock as if it were a quantity in a bin unless #18 says that reservation exists.

---

## L-06 Classical material planning may ignore finite capacity

**Decision:** supported  
**Kind:** candidate-law

A legal MRP output can still be impossible to run. Finite scheduling is an extra constraint set, not a silent property of netting.

**Evidence:** E-10. APS page. ERPNext and Odoo first-party pages publish material math and show load, not a refuse-on-collision rule.

**Counterexample:** a source that treats any dated work order as already capacity-feasible. Odoo load views are not that claim.

**Runtime consequence:** if OS later enforces finite plans, infeasibility must be a first-class result, not a log line.

---

## L-07 Authorizing supply is a different speech act from calculating need

**Decision:** hypothesis  
**Kind:** candidate-law

Explosion and netting can run without creating a work order or purchase order. Creating those documents is an Action. Approving a Moqui Requirement is an Action. Odoo Order on an MPS row is an Action.

**Evidence:** E-07, E-11, lifecycle sections 2–4 and 6.

**Why not supported:** ERPNext users often treat the submitted Production Plan itself as the authorization. That is the plan-as-Action fork. The law holds only if "submit plan" and "calculate MRP" stay separable even when one screen does both.

**Counterexample:** a source where the only stored object is the work order, and the plan never exists except as a report. Then plan is a projection and this law shrinks.

**Runtime consequence:** preview of netting must not imply reserved material or released work.

---

## L-08 A plan is stale when any pinned assumption changes

**Decision:** hypothesis  
**Kind:** candidate-law

A plan pins demand facts, a position snapshot, specification revisions, lead times, calendars, and the combination rule. A later receipt, late sales order, lost work center, or BOM change does not rewrite history. It creates a replan question.

**Evidence:** constitution §9. Seed S-003. ERPNext Close when reality diverged. Odoo in-place grid edits.

**Counterexample:** a rolling schedule that is defined as "whatever the function returns now," with no approved snapshot. Then staleness is not a state. That is the projection side of the standing fork.

**Runtime consequence:** if plans can be approved, commit must re-read assumptions. Ontologiq's propose, approve, revalidate pattern in `research/reference-landscape.md` is nearby evidence, not a decision.

---

## L-09 Capability and capacity are not the same question

**Decision:** hypothesis  
**Kind:** candidate-law

Capability. Can this resource perform this operation or make this item.  
Capacity. How much of that work fits in a calendar interval.

**Evidence:** E-09. Odoo alternate work centers and allowed employees. Moqui asset needed versus assigned. ISA-95 Capability models named in Part 5.

**Why not supported:** Part 1 attributes unread. ERPNext often stores a make rate on the item, which mixes the two.

**Counterexample:** a one-machine shop where the only resource that can do the job is that machine, and capability is implied. The distinction still matters the first time an alternate exists.

**Issue #19** owns the resource and routing model. Planning consumes the answers.

---

## L-10 Optimization is a Function only if its objective and infeasibility are explicit

**Decision:** hypothesis  
**Kind:** candidate-law

Search over sequences, lots, and alternates is not agent chatter and not MRP arithmetic. If it lives in the ontology, it is a Function with declared inputs, an objective, and outputs that can be infeasible.

**Evidence:** E-13. RFC-0001 Function open question. APS definition.

**Why not supported:** no first-party ERP page wrote an objective. RFC-0001 has not been promoted.

**Counterexample:** a plant that only ever runs infinite MRP and human dispatch. Then optimization is not required. The law is conditional.

**Forbidden:** picking a solver product in Wave A.

---

## L-11 Agent reasoning may propose a plan. It may not silently become the plan

**Decision:** hypothesis  
**Kind:** candidate-law

Judgment enters when the Function set is silent. Which forecast to believe. Which late order to slip. Whether to break a frozen horizon. The output of that judgment is a proposal. Commit is an Action under policy.

**Evidence:** `docs/open-questions.md` item 10. Constitution §8. Absence of agent language in the ERP manuals.

**Counterexample:** a fully specified finite model with one objective and no human override. Then agents are unnecessary for that plant. The law still applies wherever overrides exist.

**Runtime consequence:** prompt text is not a business rule store.

---

## Function and Action boundary

**Kind:** candidate-law  
**Decision:** hypothesis

| Port | Candidate form | Inputs | Outputs |
| --- | --- | --- | --- |
| Adopt or type a forecast | Action | item, bucket, qty, method, provenance | forecast fact |
| Combine forecast and commitments | Function | forecast facts, commitment facts, rule | independent demand per bucket |
| Explode dependents | Function | independent demand, spec revision | gross dependent need |
| Net material | Function | gross need, position snapshot, safety policy | net need, shortages |
| Offset lead time | Function | net need, lead-time table, calendar | planned release and due |
| Rough capacity check | Function | planned load, calendars | overload flags |
| Finite schedule / allocate alternates | Optimization Function | jobs, resources, calendars, objective, constraints | sequence or infeasible |
| Submit / approve / Order / close / replan | Action | pinned inputs, actor, policy | plan revision or supply orders |
| Judge exceptions | Agent proposal | Function outputs, policies | suggested Action |

Plan-as-Action versus plan-as-projection still decides whether "the plan" is the Action output, the Function output, or both.

## Solver ports

**Kind:** source-artifact of a conceptual interface  
**Decision:** hypothesis  
**Product:** none

Inputs a later solver-shaped Function would need, gathered from the corpora:

- independent demand rows with kind (forecast or commitment), qty, due bucket, provenance
- inventory position snapshot (#18)
- open supply (PO, WO, subcontract)
- specification explosion (#19)
- lead times and buffers
- safety policy selector
- resource calendars, time off, parallel capacity
- alternate resources and sourcing types
- frozen horizon, if any
- objective and hard constraints

Outputs:

- planned make and buy orders with release and due
- assigned resources, or an explicit unassigned
- material shortage rows
- capacity overload rows
- infeasible, with the binding constraint
- pinned assumption set so staleness is testable

A human or agent choosing among feasible outputs is outside the Function.

## Rejected shortcuts

| Shortcut | State | Why |
| --- | --- | --- |
| One `demand_qty` for forecast and orders | rejected as a silent default | E-01, E-08 |
| One safety-stock formula | rejected | E-04 |
| MRP output is capacity-feasible | rejected | E-10 |
| Copy Production Plan DocType into OS | rejected | constitution §2 |
| Pick an APS product in Wave A | rejected | standing order 7 |
