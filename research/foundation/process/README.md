# Process, commitment, and whether Workflow is a kernel form

**Track:** foundation  
**Issue:** [#10](https://github.com/EnzoTironi/OS/issues/10)  
**Fetched:** 2026-08-15  
**Decision state (headline):** `Workflow` as a kernel semantic form is **rejected**. Durable orchestration is infrastructure. Economic `Process` and `Commitment` remain **hypothesis** as domain objects, not as a synonym for workflow engines.

A primitive here means a kernel semantic form that composition cannot replace safely. See `docs/constitution.md` rule 1.

This folder is Wave A evidence for a later synthesis agent. It does not edit `rfcs/0001-metamodel-hypothesis.md` or `docs/open-questions.md`.

## Question

Is `Workflow` a primitive, a composition of Actions, Events, and Functions, or a higher-level derived construct?

RFC-0001 already excludes `Workflow` from the candidate list until evidence requires it. This note tests that exclusion against first-party pages fetched this session.

## Verdict

`Workflow` is a derived construct. Sometimes it is only a name for durable function execution. Sometimes it is a control-flow drawing. Sometimes it is an application graph over objects and actions. None of those sources treat it as a unit of economic or legal meaning.

The smallest vocabulary that covers purchase-to-pay, manufacturing execution, approval escalation, and customer fulfillment is:

```text
ProcessSpecification
Process
Intent
Commitment
Agreement
Action
Event
Function
Constraint
Policy
```

`Status` is usually a Function of commitments versus events. Deadline is a fact on a Commitment. Escalation is a Policy plus an Action after a deadline or Event. Compensation is later Actions and Events, not an edit of history. Durable wait, retry, and replay belong to runtime.

## Overview

Independent sources split three things that enterprise software often collapses into one status field.

1. A kind of work, such as a recipe, a routing, or a BPMN process definition.
2. A promised future flow, such as a purchase line or a delivery promise.
3. An observed occurrence, such as a receipt, a job time log, or a payment.

ValueFlows keeps those as `ProcessSpecification`, `Commitment`, and `EconomicEvent`, with one `Process` identity that can carry planned flows and later observed flows. ERPNext Sales Order documentation says submit records a commitment and does not move stock. Temporal documentation says a Workflow Execution is durable function execution that can run for years. Palantir documentation puts kinetics in action types and functions, then treats "workflow" as an application graph in Workflow Lineage.

If OS added `Workflow` as a kernel form, it would import control-flow machinery into the ontology. The four target cycles do not need that. They need identity for a transformation instance, identity for a promise, and a strict Action versus Event cut.

## Key concepts

**ProcessSpecification.** The kind of transformation. ValueFlows `vf:ProcessSpecification`. ERPNext BOM plus Operations. Odoo Bill of Materials plus Work Orders on a manufacturing order. BPMN process definition. Temporal Workflow Definition is the code analog, and it is not an economic kind.

**Process.** One instance of that kind. ValueFlows says the same Process remains when planning becomes observation. ERPNext Work Order is the shop-floor authorization for a quantity. Odoo manufacturing order holds work orders. BPMN talks about process instances and theoretical tokens. Temporal Workflow Execution is an instance of code, not of a resource transformation.

**Commitment.** A promised future flow between agents. ValueFlows treats it as a contractual promise that Economic Events can fulfill. ERPNext names Purchase Order a binding contract and Sales Order a confirmed customer request. A commitment is not a state machine and not a timer.

**Agreement.** A bundle of reciprocal commitments, or of reciprocal events when no plan existed. ValueFlows `vf:Agreement`. An ERP purchase order or sales order is often this bundle plus print chrome.

**Action and Event.** Attempted intervention versus occurrence. Palantir action types are the kinetic edit. Temporal Activities are the side-effecting steps a Workflow calls. ValueFlows Economic Events are past flows only.

**Durable execution.** Temporal Event History, replay, Signals, timers, cancellation. This is how a program survives days and months. It is not what a purchase means.

## How the four cycles fit

See [scenarios.md](scenarios.md) for the full cards. The short form:

**Purchase-to-pay.** Material request or RFQ is Intent. Submitted purchase order is Agreement of Commitments. Receipt, invoice, and payment are Events. Three-way match is a Function. Hold, close, and update-items are Actions with Constraints. Odoo bill control chooses whether the bill is generated from ordered quantity or received quantity. That is a policy over the same commitments and events.

**Manufacturing execution.** BOM and routing are ProcessSpecification. Work Order or manufacturing order is Process plus authorization. Job Card or shop-floor work order is actual operation execution. Material transfer, time log, manufacture, scrap, and quality inspection are Events. Partial finish is allowed. Stop is blocked while WIP is unreturned in ERPNext.

**Approval escalation.** The proposed purchase is an Action with pinned parameters. Approval is a Policy decision. A deadline is a fact on that Action or on the underlying Commitment. Escalation is another Action that changes the required Principal. Temporal timers can wake the runtime. The ontology does not need an Escalation type.

**Customer fulfillment.** Sales Order is Agreement of Commitments. Delivery, invoice, and payment are Events. Manufacturing or picking Processes may fulfill the same Commitments. ERPNext status `To Deliver and Bill` is a Function of delivery and billing percentages. Close withdraws remaining commitment. Cancel reverses the submitted agreement when linked documents allow it.

## Where things live

| File | Mode | Contents |
| --- | --- | --- |
| [sources.md](sources.md) | reference | URLs fetched this session |
| [evidence.md](evidence.md) | reference | Labeled evidence, source artifacts, convergence, divergence |
| [scenarios.md](scenarios.md) | explanation | Four cycle models plus adversarial cases |
| [candidate-laws.md](candidate-laws.md) | explanation | Falsifiable claims and decision states |
| [open-questions.md](open-questions.md) | reference | What this folder does not settle |

## Gotchas

ERP document status looks like a workflow. ERPNext Sales Order status is documented as a consequence of delivery and billing progress. Treating that status as a stored primitive would hide the commitments and events that already explain it.

Temporal uses the word Workflow for years-long durability. That word will keep leaking into design talks. Keep the runtime name and refuse the ontology name.

ValueFlows Process is not BPMN Process. VF Process is a resource transformation with inputs and outputs. BPMN Process is a token graph whose Events exist only when they change sequence or timing.

Palantir "workflow" in Workflow Lineage is a management view over objects, actions, and functions. Automate is condition then effect, with at-least-once delivery. Neither is a kernel form.

Copyleft systems in this folder are documented behavior only. No ERPNext or Odoo implementation was copied.

## Agent output contract

| Contract item | File |
| --- | --- |
| Question | this README |
| Sources | [sources.md](sources.md) |
| Evidence | [evidence.md](evidence.md) |
| Source artifacts | [evidence.md](evidence.md) |
| Convergence | [evidence.md](evidence.md) |
| Divergence | [evidence.md](evidence.md) |
| Candidate laws | [candidate-laws.md](candidate-laws.md) |
| Counterexamples | [scenarios.md](scenarios.md), [candidate-laws.md](candidate-laws.md) |
| Runtime pressure | [candidate-laws.md](candidate-laws.md) |
| Open questions | [open-questions.md](open-questions.md) |
| Decision state | [candidate-laws.md](candidate-laws.md) and the headline above |
