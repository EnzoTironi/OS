# Evidence

**Fetched:** 2026-08-15  
Every block is labeled as domain evidence, source-system artifact, candidate law, counterexample, or runtime consequence. Quotes are paraphrased from pages fetched this session. See [sources.md](sources.md) for URLs.

## Question restated

Does long-running coordination force a `Workflow` kernel form, or do specification, commitment, action, and event already carry the meaning?

## Domain evidence

### E-001 Process identity spans plan and observation

**Kind:** domain evidence  
**Source:** ValueFlows Processes, https://www.valueflo.ws/concepts/processes/

A Process can carry intents, commitments, and economic events as it moves from planning into observation. The planned-pie diagram and the actual-pie diagram are the same Process instance. Alice dropping a pie is an Economic Event on that instance, not a new process type.

**Interpretation.** The real-world distinction is one transformation that was planned and then happened, possibly differently. OS should be able to ask for all events of a process even when some events fulfill commitments rather than hanging directly on the process.

### E-002 Flows progress from defined to realized

**Kind:** domain evidence  
**Source:** ValueFlows Flows, https://www.valueflo.ws/concepts/flows/

The documented progression is Recipe Flow, then Intent, then Commitment, then Economic Event. Commitment is a contractual promise. Economic Event is past only. Claim resembles Commitment but is initiated by the receiver. Corrections use a later event with `corrects`, including a negative quantity.

**Interpretation.** Scheduled work, promised work, and observed work are different. A state machine that mutates one `status` field collapses them.

### E-003 ProcessSpecification is the kind, Process is the activity

**Kind:** domain evidence  
**Source:** ValueFlows formatted spec, https://www.valueflo.ws/specification/all_vf/

`vf:Process` is an activity that changes inputs into outputs by transforming or transporting resources. `vf:ProcessSpecification` specifies the kind of process and also the stage. `vf:Plan` is a logical collection of processes that constitute scheduled work with defined deliverables. `vf:Commitment` is a planned economic flow scheduled or promised by one agent to another. `vf:Agreement` is a set of reciprocal commitments, or a set of reciprocal economic events.

**Interpretation.** Specification versus instance is in the vocabulary. Workflow is not.

### E-004 Plan is generated from recipe and then decoupled

**Kind:** domain evidence  
**Source:** ValueFlows Operational Planning, https://www.valueflo.ws/concepts/plan/

A plan can be generated from recipes or entered directly. After generation, the plan is decoupled from the recipe and keeps only references to resource and process specifications. People tweak plans. Batch size can leave leftover inventory inside the plan.

**Interpretation.** Instantiating a specification is not the same as remaining bound to it. A later recipe revision must not silently rewrite a running plan.

### E-005 Purchase order is a binding contract, not a stock move

**Kind:** domain evidence  
**Source:** ERPNext Purchase Order, https://docs.frappe.io/erpnext/user/manual/en/buying/purchase-order

The page calls a Purchase Order a binding contract that the buyer promises to buy items under given conditions. After submit, the user can create Purchase Receipt, Purchase Invoice, Payment Entry, or Journal Entry. The user can Hold or Close. Update Items cannot delete already received items. Each item can have its own Required By date for part delivery.

**Interpretation.** The document is an Agreement of Commitments. Receipt and payment are later Events. Per-line dates are commitment attributes, not workflow steps.

### E-006 Sales order submit does not move stock

**Kind:** domain evidence  
**Source:** ERPNext Sales Order, https://docs.frappe.io/erpnext/user/manual/en/selling/sales-order

Submitting confirms the commitment and makes downstream documents available. The page states that the Sales Order itself does not deliver stock or recognize an invoice. Status values include Draft, To Deliver and Bill, To Deliver, To Bill, Completed, On Hold, Closed, Cancelled. Close is for remaining quantity that will not be fulfilled. Cancel reverses the submitted transaction when linked documents allow it. Partial deliver and bill are first-class.

**Interpretation.** Document status is a Function of fulfillment Events against Commitments. Close and Cancel are different Actions.

### E-007 Work order authorizes manufacture. Job card records execution.

**Kind:** domain evidence  
**Source:** ERPNext Work Order and Job Card, https://docs.frappe.io/erpnext/user/manual/en/manufacturing/work-order and https://docs.frappe.io/erpnext/job-card

A Work Order is a signal to the shop floor to manufacture a quantity of an item. It explodes the BOM, reserves source warehouses, and can create Job Cards. The user may Finish a partial quantity. Stop is refused while transferred raw materials have not been returned from WIP. A Job Card stores actual production of one Operation at one Workstation. Pending Qty was added so remaining quantity is not forced into Process Loss.

**Interpretation.** Authorization and plan live on the Work Order. Actual time and quantity live on the Job Card. Partial completion is a quantity fact, not a workflow branch node.

### E-008 Ordered quantity and received quantity are different bill bases

**Kind:** domain evidence  
**Source:** Odoo 18 bill control, https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html

The default policy is Ordered quantities or Received quantities. Three-way matching, when enabled, only works with received quantities. A draft bill can be edited. An edit sets `Should Be Paid` to Exception rather than blocking. After payment the field becomes No.

**Interpretation.** The same purchase commitments support two billing Functions. Exception is an explicit disagreement between bill and receipt, not a hidden status.

### E-009 Manufacturing order and work order are nested instances

**Kind:** domain evidence  
**Source:** Odoo 18 Shop Floor and two-step manufacturing

A manufacturing order is ready when it is confirmed and components are available. A work order is ready when its MO is ready and preceding work orders are done. Two-step warehouses add a pick-components transfer before manufacture. Register Production records output quantity, which may differ from the ordered quantity. Close Production can be undone while the card is still fading. Scrap, add component, and add work order are extra Actions on a live MO.

**Interpretation.** Nested process instances, resource readiness, and predecessor constraints explain shop-floor sequence. A generic workflow engine is not what the pages describe.

### E-010 Escalation is a situation a process may react to

**Kind:** domain evidence  
**Source:** OMG BPMN 2.0.2 PDF, clause 8.4.4, fetched from https://www.omg.org/spec/BPMN/2.0.2/PDF/

An Escalation identifies a business situation that a Process might need to react to. Catching on a boundary may be coded or may catch any escalation. Compensation Association occurs outside normal flow and targets a Compensation Activity.

**Interpretation.** Escalation and compensation are control-flow reactions. They are not economic commitments. OS can represent the business situation as an Event or a Function of a deadline, then fire an Action.

## Source-system artifacts

These are implementation or product shapes. Do not map them one-to-one into OS.

### A-001 Temporal Workflow Definition, Type, and Execution

**Kind:** source-system artifact  
**Source:** https://docs.temporal.io/workflows and https://docs.temporal.io/workflow-execution

Temporal's own glossary splits code, name, and running instance. A Workflow Execution is "a durable, reliable, and scalable function execution." It has exclusive local state. It talks to the world through Activities and to other executions through Signals. Closed statuses include Cancelled, Completed, Continued-As-New, Failed, Terminated, Timed Out. Durability means no imposed time limit. The default Workflow Execution Timeout is infinite. The docs recommend a Timer when the business needs to act after a period.

**Do not import.** Workflow Type as an ontology type. Event History as the business ledger. Continue-As-New as a domain concept.

### A-002 Temporal replay and determinism

**Kind:** source-system artifact  
**Source:** https://docs.temporal.io/workflows

Resume works by replaying Event History, not by restoring a memory snapshot. Workflow code must make the same decisions given the same history. Time, timers, and randomness have replay-safe APIs. Activities run once. Their results are reused on replay.

**Do not import.** Deterministic replay as a semantic law of purchase or manufacture. It is a runtime technique for recovering program counters.

### A-003 Temporal Activity versus Workflow

**Kind:** source-system artifact  
**Source:** https://docs.temporal.io/activities

An Activity is a normal function that does one well-defined action and may be non-deterministic. The docs recommend idempotency. A single Activity can be invoked as a Standalone Activity without a Workflow.

**Implication.** Even Temporal does not require a Workflow wrapper around one side effect. That weakens "Workflow is the unit of business work."

### A-004 Palantir kinetics omit Workflow

**Kind:** source-system artifact  
**Source:** https://palantir.com/docs/foundry/ontology/overview/ and https://www.palantir.com/docs/foundry/action-types/overview/

The ontology's semantic elements are objects, properties, and links. The kinetic elements are actions, functions, and dynamic security. An action type is the definition of a set of object edits plus side effects, applied as one transaction, reused across applications.

**Implication.** A mature operational ontology ships verbs without a Workflow primitive.

### A-005 Palantir Automate is condition then effect

**Kind:** source-system artifact  
**Source:** https://palantir.com/docs/foundry/automate/overview/ and https://www.palantir.com/docs/foundry/automate/effect-settings/

Automate watches time or object conditions and then submits actions, runs functions, or notifies. Effects are at-least-once. Sequential effects stop after a failure, even if a fallback succeeds. Separate automations that fire together run in a nondeterministic order.

**Do not import.** At-least-once automation as domain truth. Duplicate submission is a runtime fact that Actions must tolerate.

### A-006 Palantir Workflow Lineage is a management graph

**Kind:** source-system artifact  
**Source:** https://palantir.com/docs/foundry/workflow-lineage/overview/

The application formerly called Workflow Builder is now Workflow Lineage. It shows objects, actions, functions, models, and applications so builders can debug and bulk-upgrade. It is complementary to Pipeline Builder and Data Lineage.

**Do not import.** Workflow as an ontology node. Here it is a provenance view over kinetic resources.

### A-007 BPMN token is theoretical

**Kind:** source-system artifact  
**Source:** OMG BPMN 2.0.2 PDF introductory execution text

A token traverses Sequence Flows to define behavior. Implementations are not required to implement any form of token. BPMN Events are restricted to types that affect sequence or timing of Activities. Start and end of an activity, document state change, and message arrival could all be called events in English. BPMN refuses most of those.

**Do not import.** Tokens as domain objects. BPMN's narrow Event as OS Event. OS Event is an occurrence in the world, per RFC-0001 and the thesis.

### A-008 ERPNext document amend and cancel chain

**Kind:** source-system artifact  
**Source:** https://docs.frappe.io/erpnext/amending-purchase-order-after-submit and Sales Order cancel rules

Qty cannot be updated after a completed Purchase Receipt. Rate cannot be updated after a submitted Purchase Invoice. A Sales Order cannot be cancelled until dependent Delivery Notes and Sales Invoices are cancelled.

**Do not import.** The DocType graph as ontology. Do import the underlying Constraint. You cannot silently rewrite a commitment after an observing Event has consumed it.

### A-009 Odoo warehouse manufacturing steps

**Kind:** source-system artifact  
**Source:** https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/basic_setup/two_step_manufacturing.html

Manufacture in one, two, or three steps is a warehouse configuration. Two-step creates a pick-components transfer and does not track finished-goods putaway as a transfer, while still updating inventory counts.

**Do not import.** Step count as a semantic primitive. It is a custody-tracking policy over the same Process.

### A-010 ValueFlows has no intra-process steps

**Kind:** source-system artifact  
**Source:** https://www.valueflo.ws/concepts/processes/

VF does not provide steps inside a Process. Different resources or outputs that go separate ways should become separate processes. Notes can hold informal steps.

**Implication.** Fine-grained shop-floor operations in ERPNext and Odoo are either nested Processes or Events on a Process, not a Workflow step list inside one object.

## Convergence

| Distinction | VF | Temporal | BPMN | ERPNext | Odoo | Palantir |
| --- | --- | --- | --- | --- | --- | --- |
| Spec versus instance | ProcessSpecification vs Process. Recipe vs Plan. | Workflow Definition vs Execution | Process definition vs instance (TOC plus token text) | BOM vs Work Order vs Job Card | BoM vs MO vs work order | Action type vs submitted action. Function vs execution. |
| Promise versus observation | Commitment vs EconomicEvent | not in scope | not in scope | PO or SO vs receipt, delivery, invoice | PO vs receipt vs bill | Action submission vs later object state, weakly |
| Action versus occurrence | Action on a flow names the effect. Event is the occurrence. | Workflow command vs Activity result vs Signal | Activity vs Event that changes sequence | Submit, Receive, Finish vs stock and time-log records | Confirm, Validate, Produce All vs stock moves | Action type is the verb. Automate fires it. |
| Partial fulfillment | Events fulfill part of a Commitment | n/a | multi-instance and loops are notation | Partial receive, deliver, finish, Job Card Pending Qty | Register Production can differ from ordered qty | not documented on fetched pages |
| Long running | Plan and Process last as long as the work | Executions last years. Timeout default infinite. | Timer events exist | Documents stay open across receipts | MOs stay In Progress | Automate is continuous or scheduled |
| Wait for the outside | later Economic Events | Signal, Update, Activity completion, Timer | Message, Timer, Event-based gateway | user creates next document | user validates transfer or completes work order | object-data condition or schedule |
| Cancel versus compensate | correcting Event, including negative qty | Cancelled vs Terminated. Saga is application code. | Compensation outside normal flow | Cancel chain. Close remaining. Return components. | Undo while card fades. Scrap. | fallback effect does not resume a failed sequence |
| Human or agent handoff | provider and receiver Agents on flows | Signal or Update from a client | User Task in the notation set | Job Card employee. Approvals are other docs, not fetched. | operator panel, Add Operator | Action taken by a user or by Automate |

Shared distinction that matters for OS. Specification, promise, attempt, and observation are separable. The word Workflow does not appear as the carrier of that distinction in VF, Palantir ontology kinetics, or ERP document semantics.

## Divergence

### D-001 What "process" names

VF Process is a resource transformation. BPMN Process is a control-flow graph. Temporal has no Process type. ERPNext Work Order is authorization plus plan plus reservation. Odoo MO is the parent instance. Palantir uses process loosely in Automate and Lineage copy.

**Why.** Different jobs. Economic accounting, drawing executable diagrams, surviving crashes, and printing shop paperwork.

**OS implication.** Do not reuse the English word as a kernel form without pinning VF-like meaning. If OS needs a form, name it as transformation instance, not as Workflow.

### D-002 Where control flow lives

BPMN puts exclusive, inclusive, parallel, and event-based gateways in the model. Temporal puts `if` and `await` in code. VF puts almost no control flow in the ontology. ERPNext and Odoo encode sequence as document creation rules and predecessor work orders.

**Why.** BPMN is a notation standard. Temporal is a programming model. VF is an economic vocabulary. ERPs grew document graphs.

**OS implication.** Control flow that does not change economic meaning can stay in Functions and runtime. Predecessor constraints that are domain laws, such as "do not plate before grind," belong on ProcessSpecification.

### D-003 Status as stored field

ERPNext and Odoo persist document status. VF derives fulfillment from events that fulfill commitments. Temporal persists execution status because the program counter is the product. Palantir Automate does not define a business document status.

**Why.** UI lists need a column. Durable execution needs a Closed bit.

**OS implication.** Prefer Function. Persist a status field only if a counterexample shows reconstruction is not enough. None found this session for the four cycles.

### D-004 Billing basis

Odoo lets a company bill from ordered quantity or received quantity. ERPNext starts billing from the order and tracks billed percentage separately from received percentage. VF would treat invoice as another Event or Claim against the Agreement.

**Why.** Commercial practice differs. Some vendors invoice on order. Some invoice on receipt.

**OS implication.** Billing basis is Policy over the same Commitments and Events. It is not a different workflow type.

### D-005 How long-running wait is implemented

Temporal records a Timer or parks on a Signal. BPMN draws a Timer or Message Event. ERPs wait by leaving a document open until a human creates the next document. Palantir Automate re-evaluates conditions. VF just records the later Event.

**Why.** Only Temporal and BPMN are in the business of executing wait.

**OS implication.** Waiting is a runtime need. The domain fact is still "this Commitment is unfulfilled" or "this Action is awaiting an external Effect."

## Candidate law pointers

Laws with decision states live in [candidate-laws.md](candidate-laws.md). The evidence above is what they stand on.

## Runtime consequence pointers

Runtime pressure is recorded next to each law. Wave B must not pick a workflow engine because this folder used the word wait.

## Counterexample pointers

Adversarial cards live in [scenarios.md](scenarios.md). The strongest attacks on the headline rejection are CX-001 through CX-004 there.
