# Adversarial scenarios

**Status:** seed suite for research. These scenarios are not yet executable tests.

The purpose of scenarios is to force candidate ontologies to explain real operational behavior without adding source-system-shaped escape hatches.

## Scenario principles

A useful scenario should include at least one of:

- partial completion;
- cancellation after downstream consequences;
- contradictory observations;
- late-arriving information;
- identity ambiguity;
- concurrent decisions;
- stale approval;
- external timeout/unknown outcome;
- backdating;
- ownership/custody divergence;
- derived financial/stock consequences;
- ontology/schema evolution.

Happy paths alone are not evidence.

---

## S-001 — Requested, promised, planned, actual

A customer requests delivery on August 18.

Sales promises August 20.

Production planning calculates August 21.

The carrier delivers on August 22.

Questions:

- Are these four values properties of one field or different semantic facts?
- Which are Intent, Commitment, Plan, and Event-like concepts?
- Can the system answer "what did we promise?" independently of "what actually happened?"
- Can it explain when each statement became known?

---

## S-002 — Partial fulfillment with changing plan

A customer orders 10 units.

Four are immediately available.

Material on hand can produce four more.

Two require a supplier purchase.

After the first four ship, the customer asks to accelerate the remainder.

Questions:

- What is the identity of the original commitment?
- How are partial fulfillments related to it?
- Is reservation distinct from possession?
- How are multiple production/purchase plans associated with one customer commitment?
- Does changing a plan mutate history or create a new plan/version?

---

## S-003 — Stale approval

At 10:01 an agent proposes purchasing 1,000 units because available inventory is 20 and demand is 980.

A human approves the proposal at 10:07.

At 10:06, a receipt of 800 units was posted.

Questions:

- What exactly did the human approve: parameters, assumptions, consequences, or an action revision?
- Must commit re-read state?
- Is the proposal still valid?
- Can the system explain why it refused or replanned?

---

## S-004 — External timeout after possible success

An action requests an external ERP/marketplace/provider to change an order.

The request leaves OS. The connection times out before a response is received.

The remote system may or may not have applied the change.

Questions:

- Can the action outcome remain explicitly `unknown`?
- What evidence is required before retry?
- How is reconciliation represented?
- How do idempotency keys relate to action identity?
- Which event, if any, can be asserted before reconciliation?

---

## S-005 — Supplier is also customer

Organization B sells raw material to Organization A and also buys finished goods from A.

Questions:

- Is B simultaneously a `Supplier` object and a `Customer` object?
- Or is `Organization` the enduring entity and Supplier/Customer contextual roles?
- What happens if the commercial relationship ends but the organization continues to exist?
- Where do payment terms and commercial conditions live?

---

## S-006 — Relationship with lifecycle

Person P works for Organization O from January to July, changes position in March, compensation in May, is suspended briefly, and later leaves.

Questions:

- Is `worksFor` sufficient as a link?
- Does `Employment` need identity/lifecycle/actions?
- Can a relationship be the target of `Promote`, `Suspend`, and `Terminate`?
- How is historical employment represented without mutating away prior periods?

---

## S-007 — Backdated stock movement

On August 10 the system believes there are 100 units.

On August 12 it receives a valid document proving that 20 units actually left on August 8 but were never recorded.

Questions:

- How does the system represent valid time versus knowledge/system time?
- What was stock as known on August 10?
- What is stock now believed to have been on August 10?
- Which valuations or downstream decisions must be recomputed?
- Are historical decisions still explainable under the knowledge available then?

---

## S-008 — Lot recall

A finished product lot is discovered to contain material from a defective input lot.

Production created multiple output lots and some outputs were split across customers.

Questions:

- Can the ontology trace transformation inputs to outputs?
- Are lot identity and quantity separate concerns?
- Can it answer which customers received affected outputs?
- Are transformations events, processes, or both?

---

## S-009 — Rework and scrap

A manufacturing operation produces 100 units. Ten fail quality inspection.

Six are reworked successfully. Four become scrap.

Questions:

- Is rework a new production process or continuation of the original one?
- How is scrap represented: resource transformation, disposition event, quantity adjustment?
- How do costs move?
- What counts as completed quantity on the original production commitment?

---

## S-010 — Cancellation after irreversible consequences

A posted sales invoice has already produced accounting entries, stock movements, and a payment allocation.

A user attempts to cancel it.

Questions:

- Is cancellation deletion, state transition, compensating action, or creation of reversal events?
- Which downstream consequences are reversible?
- What new facts must be recorded?
- Can the system preserve the original history and show the reversal causally?

---

## S-011 — Contradictory observations

An ERP says promised delivery is August 25.

A spreadsheet says August 27.

A chat message from sales says August 24.

Questions:

- Are they claims about the same semantic property?
- Do they instead represent different concepts?
- If they truly conflict, how are multiple assertions and their provenance represented?
- What makes one assertion operationally authoritative?
- Is accepted state a primitive, policy consequence, or projection?

---

## S-012 — Ontology revision after historical action

Version 1 of the ontology permits a discount under one rule.

An action is approved and executed.

Version 2 changes the discount policy and modifies the action's function.

Years later an auditor asks why the original discount was allowed.

Questions:

- Can OS reconstruct the ontology/policy/function revision used then?
- Are action invocations content-addressed against definitions?
- Can old decisions be explained without replaying them under today's rules?

---

## Next scenario families

Future scenarios should cover:

- three-way matching;
- partial receipts/invoices/payments;
- overpayment and credit balance;
- returns after consumption;
- subcontracting;
- co-products/by-products;
- serial identity and replacement;
- custody without ownership;
- consignment stock;
- multi-company/intercompany flows;
- currency revaluation;
- fiscal corrections;
- duplicate external events;
- split/merge identity;
- access delegation to an agent for a single task;
- revocation during a long-running action;
- conflicting ontology migrations.
