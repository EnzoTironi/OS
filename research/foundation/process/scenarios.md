# Scenarios

**Kind:** explanation, with labeled counterexamples  
**Fetched:** 2026-08-15

Each cycle is modeled with the same small vocabulary from [README.md](README.md). Happy paths are not evidence. Each cycle ends with an adversarial case.

## Shared vocabulary

| Form | Meaning in these cards |
| --- | --- |
| ProcessSpecification | Kind of transformation or routing |
| Process | One instance of that kind, same identity from plan through observation |
| Intent | Potential flow not yet agreed |
| Commitment | Promised future flow |
| Agreement | Reciprocal commitments, or reciprocal events if unplanned |
| Action | Attempted intervention |
| Event | Observed occurrence |
| Function | Computation with no direct mutation |
| Constraint | Condition an Action or state must not violate |
| Policy | Authority over Principal, Action, resource, context |

No `Workflow`. No stored `Status` unless a Function is named. Deadline is a fact on a Commitment or Action. Escalation is an Action. Compensation is later Actions and Events.

## Purchase-to-pay

### Happy path, compressed

1. Intent. A material request or RFQ says the org wants a quantity.
2. Agreement. `SubmitPurchaseOrder` records reciprocal Commitments. Supplier will provide items by Required By. Buyer will pay under payment terms.
3. Events. `PurchaseReceived` fulfills some or all supply Commitments. `InvoicePosted` and `PaymentAllocated` fulfill or settle payment Commitments or Claims.
4. Functions. `receivedQty`, `billedQty`, `paidQty`, `threeWayMatch`.
5. Constraints. Update Items cannot delete a received line (ERPNext). Bill-from-received Policy refuses a bill before any receipt (Odoo).
6. Actions after submit. Hold, Close remaining, Receive, Bill, Pay, Return.

Odoo bill control is Policy. Ordered-quantity billing creates a draft bill from Commitments. Received-quantity billing creates it from Events. Three-way matching compares PO Commitment, receipt Event, and invoice Event.

### Adversarial. Partial receipt, then price change, then cancel attempt

**Kind:** counterexample attempt against "one PO status field is enough"

Supplier commits 100. Receipt Event for 40. User tries to change rate on all 100 and then cancel the order.

ERPNext documented behavior. Qty may change on unreceived remainder. Rate may change only while uninvoiced. Cancel of the order waits on cancel of receipts and invoices.

**OS reading.** The original Commitment remains. A remainder Commitment can be reduced by Close or by an amending Action. An observing Event pins the received slice. There is no single workflow step to rewind.

**Seed overlap.** S-002 partial fulfillment. S-010 cancel after irreversible consequences.

## Manufacturing execution

### Happy path, compressed

1. ProcessSpecification. BOM plus operations plus workstations, or Odoo BoM plus work-order steps.
2. Process. `AuthorizeWorkOrder` or confirm manufacturing order for a quantity, source, WIP, and target. This is the instance.
3. Nested Processes or operation Events. ERPNext Job Cards. Odoo work orders at work centers.
4. Events. Material transfer into WIP, time logs, manufacture output, scrap, quality inspection.
5. Functions. `completedQty`, `consumedQty`, `pendingQty`, `processLossQty`.
6. Constraints. ERPNext Stop refused while WIP components are unreturned. Odoo work order not ready until predecessors finish and components are available.
7. Partial. ERPNext Finish with partial quantity. Job Card Pending Qty prevents leftover from becoming process loss. Odoo Register Production can record a different unit count.

Warehouse step count (Odoo 1, 2, or 3 step) is custody Policy over the same Process. It is not a different specification kind.

### Adversarial. Scrap, rework, extra transfer, then stop

**Kind:** counterexample attempt against "Workflow step list inside one Work Order"

Ten fail inspection. Six are reworked. Four become scrap. Extra material is transferred because some was damaged. User clicks Stop.

ERPNext documented behavior. Scrap warehouse is part of the Work Order. Additional transfer requires a settings percentage. Stop requires return of unconsumed WIP. Job Card can record scrap items. Pending Qty distinguishes unfinished from lost.

**OS reading.** Rework is either a new Process based on a rework ProcessSpecification or a continuation Event on the same Process. That choice is still open. See [open-questions.md](open-questions.md). Either way the record is Events on a Process, not a branch node in a workflow graph.

**Seed overlap.** S-009 rework and scrap.

## Approval escalation

### Happy path, compressed

1. Action. `ProposePurchase` with parameters, assumed stock, and a deadline fact.
2. Policy. Principal P1 may approve under a limit. After deadline, Principal P2 may approve.
3. Events. `DeadlinePassed` can be a Function of clock versus deadline, recorded when first observed.
4. Action. `EscalateApproval` changes the required Principal. `ApprovePurchase` or `RejectPurchase` follows.
5. Constraint. Commit re-reads state. Stale assumptions fail closed.

Temporal can wake a durable execution with a Timer, then invoke `EscalateApproval` as an Activity. Palantir Automate can fire the same Action when a condition holds. Those are runtime or product bindings of the same Action.

### Adversarial. Approval after the world moved

**Kind:** counterexample attempt against "approval is a workflow step that consumes a token"

At 10:01 an agent proposes 1,000 because on-hand is 20. At 10:06 a receipt of 800 is posted. At 10:07 a human approves the 10:01 proposal.

**OS reading.** The approved object is an Action invocation with pinned parameters and assumptions, not a token sitting in an Approve box. Revalidation is part of Action, per thesis and S-003. A Workflow primitive would tempt the design to treat the token as authority.

**Seed overlap.** S-003 stale approval.

## Customer fulfillment

### Happy path, compressed

1. Intent. Quotation.
2. Agreement. `SubmitSalesOrder` records Commitments to deliver quantities on promised dates and to collect payment.
3. Optional Processes. Pick, pack, manufacture, purchase-to-stock. Each Process fulfills some of the same Commitments.
4. Events. Delivery, invoice, payment.
5. Functions. ERPNext `percent_delivered`, `percent_billed`, and the list status `To Deliver and Bill`.
6. Actions. Hold, Resume, Close remaining, Cancel when dependents allow, Update Items within fulfilled-quantity limits.

S-001 dates. Requested date is Intent. Promised date is Commitment. Planned date is Process schedule. Actual date is Event. They must not share one `delivery_date` field.

### Adversarial. Partial ship, then accelerate remainder, then close

**Kind:** counterexample attempt against "the order is a workflow instance"

Customer orders 10. Four ship. Remainder needs manufacture and a purchase. Customer asks to accelerate. Later the customer accepts 8 and the remainder is Closed.

**OS reading.** The Agreement identity stays. Fulfillment Events attach to line Commitments. New Processes can be planned against the open remainder. Close is an Action that withdraws remaining Commitment without inventing a delivery Event. A workflow instance that "moves to Closed" would erase that distinction.

**Seed overlap.** S-001, S-002.

## Cross-cutting waits

| Wait | Domain fact | Runtime binding, not ontology |
| --- | --- | --- |
| Supplier shipment | Commitment unfulfilled | document left open, or Temporal Signal when ASN arrives |
| Payment | Claim or Commitment unfulfilled | same |
| Approval | Action awaiting Policy decision | task list, Signal, Automate condition |
| Deadline | fact on Commitment or Action | Temporal Timer, BPMN Timer Event, Automate schedule |
| External API | Action Effect unknown | S-004. unknown is not failed |

## Counterexamples aimed at the headline

### CX-001 Ad-hoc human task graph

**Kind:** counterexample  
**Attack.** A company runs a unique onboarding checklist with no economic flows. Only a task graph exists.

**Response.** That graph is either a ProcessSpecification made of Actions assigned to Principals, or it is application chrome. It still does not need a kernel `Workflow` if Action, Policy, and assignment already exist. **Undetermined** whether such checklists deserve a first-class Process. They do not rescue `Workflow` as a separate form.

### CX-002 Irreversible money movement saga

**Kind:** counterexample  
**Attack.** Temporal docs tell authors to unwind with try and catch, the saga pattern. That looks like a workflow primitive.

**Response.** The unwind steps are compensating Actions that post new Events. Temporal hosts the program counter. The saga sample is application code, not a Temporal primitive named Compensation. BPMN Compensation is notation for the same idea. **Hypothesis** holds.

### CX-003 Event-based exclusive choice

**Kind:** counterexample  
**Attack.** BPMN event-based gateway waits for the first of several messages. Composition of Actions cannot say "first one wins" without a join primitive.

**Response.** The domain fact is a Constraint on competing Commitments or a Function that accepts the first Event and rejects the rest. Runtime may park on multiple Signals. Whether OS needs a native race join is **undetermined**. It is still a Constraint or Function, not `Workflow`.

### CX-004 Multi-party choreography

**Kind:** counterexample  
**Attack.** BPMN Choreography models message exchange between participants. An internal Process cannot see that.

**Response.** Out of scope for this folder. Candidate home is Agreement plus message Events between Agents. Marked **undetermined**. Do not open a new issue until a real multi-party scenario is researched.

## Seed scenario coverage

| Seed | Used as |
| --- | --- |
| S-001 requested, promised, planned, actual | Customer fulfillment |
| S-002 partial fulfillment | Purchase-to-pay and fulfillment |
| S-003 stale approval | Approval escalation |
| S-004 external timeout | Cross-cutting waits |
| S-009 rework and scrap | Manufacturing |
| S-010 cancel after consequences | Purchase-to-pay |
