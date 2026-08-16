# Candidate laws

**Kind:** candidate law, with counterexamples and runtime consequences  
**Fetched:** 2026-08-15

Decision state is one of `hypothesis`, `supported`, `rejected`, `undetermined`. Never `accepted`.

A law is written so a later agent can try to break it. Constitution rule 18.

## L-001 Workflow as a kernel semantic form

**Decision state:** rejected  
**Claim.** `Workflow` does not belong in the kernel. Long-running coordination in the four target cycles can be expressed with ProcessSpecification, Process, Intent, Commitment, Agreement, Action, Event, Function, Constraint, and Policy. Adding `Workflow` does not add economic or legal meaning.

**Evidence.** E-003 VF has no Workflow class. A-004 Palantir kinetics are actions and functions. A-006 Palantir "workflow" is a lineage app. A-001 Temporal Workflow is durable function execution. E-006 ERPNext sales status is a Function of delivery and billing. Constitution rule 1 prefers composition when meaning is preserved.

**Counterexample that would revive it.** A domain cycle where two systems independently need a token graph that cannot be reconstructed from commitments, events, and action invocations, and where removing the graph causes repeated operational failures.

**Runtime consequence.** Wave B may adopt a durable execution engine as infrastructure. That choice must not add `Workflow` to the ontology.

**Falsification test.** Model purchase-to-pay, manufacturing execution, approval escalation, and customer fulfillment in the small vocabulary. If a required distinction is inexpressible without a token or step graph, reopen this law.

## L-002 Specification is not instance

**Decision state:** supported  
**Claim.** The kind of work and one occurrence of that kind are different objects. Instantiating a specification copies references. It does not keep the instance bound to later edits of the specification.

**Evidence.** E-003 `ProcessSpecification` versus `Process`. E-004 Plan decoupled from Recipe. E-007 BOM versus Work Order versus Job Card. Odoo BoM fills an MO, then the MO can gain extra components and work orders (E-009). Temporal Definition versus Execution (A-001) is the infrastructure analog.

**Counterexample.** A domain where changing the recipe must rewrite in-flight instances and that rewrite is considered the same object rather than a new revision Action.

**Runtime consequence.** Historical Processes must pin the specification revision they were based on. Ontology evolution (open question 19) is adjacent, not solved here.

## L-003 Commitment is not a state machine and not a schedule slot

**Decision state:** supported  
**Claim.** A Commitment is a promised future flow. A state machine is at best a projection of how that promise is being fulfilled. A schedule slot is a time coordination fact. Neither replaces the promise.

**Evidence.** E-002 VF Commitment versus Event. E-005 PO as binding contract. E-006 SO submit does not move stock. S-001 four dates. Temporal Timer is recommended instead of Workflow Timeout (A-001, failure-detection page).

**Counterexample.** A legally meaningful promise that has no quantity, resource, provider, or receiver and exists only as a status token.

**Runtime consequence.** Do not persist `status=Closed` as the only record that a remainder was withdrawn. Record the Close Action and the resulting Commitment change.

## L-004 Requested is not happened, including inside a process

**Decision state:** supported  
**Claim.** An Action or Commitment does not prove the corresponding Event. A Process may hold both planned flows and later observed flows. The observed flows can diverge.

**Evidence.** Thesis "Action is not event." Constitution rule 8. E-001 same Process, different actuals. E-002 Events are past only. S-004 unknown external Effect. Temporal Activity Failure does not fail the Workflow unless author code decides to (TypeScript failure page).

**Counterexample.** A domain where the attempt is ontologically identical to the occurrence and independent systems never distinguish them.

**Runtime consequence.** External calls must be allowed to remain `unknown`. Retry policy is runtime. Reconciliation is new Events.

## L-005 Status is usually a Function

**Decision state:** hypothesis  
**Claim.** For the four cycles, list status can be computed from Commitments versus Events. A stored status field is a source-system artifact unless reconstruction fails a real query.

**Evidence.** E-006 ERPNext status table plus explicit "does not change stock." VF fulfillment via `fulfills`. D-003.

**Counterexample.** A status that is itself a speech act, such as a court decree, that cannot be recovered from other facts.

**Runtime consequence.** Materialized status columns are allowed as projections. They are not ontology forms.

## L-006 Partial fulfillment is many Events on one Commitment

**Decision state:** supported  
**Claim.** Partial completion does not split the original Commitment's identity. Later Events fulfill quantities. Remainder can be Closed, amended, or left open.

**Evidence.** E-005 part delivery dates. E-006 partial deliver and bill. E-007 partial Finish and Job Card Pending Qty. E-009 Register Production quantity. VF "one or more EconomicEvents" fulfill a Commitment (model-text).

**Counterexample.** A commercial practice where each partial shipment is a new contract with no remainder on the original promise.

**Runtime consequence.** Quantity math must be deterministic Functions. Rounding and units are open (value types, issue 62) and not solved here.

## L-007 Cancellation after effects is compensation, not deletion

**Decision state:** supported  
**Claim.** After an Event has changed stock, money, or custody, cancel is either refused or expressed as later reversing Events. History stays.

**Evidence.** E-002 `corrects` with possible negative quantity. E-007 Stop requires WIP return. A-008 dependent documents must be cancelled first. S-010. Temporal Terminated versus Cancelled (A-001). BPMN Compensation outside normal flow (E-010).

**Counterexample.** A regulated domain that requires expunging the original Event rather than superseding it.

**Runtime consequence.** Ledger-like append is a likely storage shape. That is implementation, not a new semantic form.

## L-008 Escalation is Policy plus Action, possibly after a deadline fact

**Decision state:** hypothesis  
**Claim.** Escalation does not need a kernel type. A deadline fact, a Policy that names the next Principal, and an `Escalate` or `Approve` Action are enough.

**Evidence.** E-010 BPMN Escalation is a situation to react to. Palantir Automate fires Actions on conditions (A-005). Temporal Timer plus Activity (A-001). S-003.

**Counterexample.** An escalation that changes meaning in a way no Policy over Principals can state, independently documented in two systems.

**Runtime consequence.** Task inboxes and reminder jobs are surfaces or runtime. They share the Action.

## L-009 Durable orchestration is infrastructure

**Decision state:** supported  
**Claim.** Surviving process-days, worker crashes, timers, and inbound signals is a runtime property. It is not a domain distinction. Constitution rule 6.

**Evidence.** A-001 durability, reliability, scalability definitions. A-002 replay. A-003 Standalone Activity. A-005 at-least-once Automate. ERPNext and Odoo "wait" by leaving documents open (D-005).

**Counterexample.** A business rule that refers to replay, sticky queues, or Continue-As-New as part of its meaning.

**Runtime consequence.** Wave B may evaluate Temporal or similar only after Wave A pressure names the waits. The waits already named are unfulfilled Commitment, unknown Effect, Policy decision, and deadline.

## L-010 Human and agent handoff is the same Action, different Principal

**Decision state:** hypothesis  
**Claim.** Shop-floor handoff, approval handoff, and automation firing are Principal and Policy over one Action. They are not a Workflow swimlane primitive.

**Evidence.** Thesis surfaces diagram. Palantir same action across applications (A-004). Automate as another consumer of actions (A-005). Odoo operator panel assigns employees to the same work order (E-009). VF provider and receiver Agents on flows (E-003).

**Counterexample.** A handoff that creates new business meaning that cannot be stated as a change of Principal, delegation, or assignment on an existing Action or Process.

**Runtime consequence.** Agent tools must call the same Action path as UI buttons. Issue 11 (principals) owns the harder delegation questions.

## L-011 Process as a domain object is still not Workflow

**Decision state:** hypothesis  
**Claim.** A transformation instance with inputs, outputs, and a specification may deserve an ordinary object type, possibly with Event-nature flows. That object is not a control-flow engine and not a kernel form named `Workflow`.

**Evidence.** E-001, E-003, E-007, E-009. RFC-0001 already allows objects with lifecycle. Open question 14 asks whether a Work Order is commitment, authorization, plan, process instance, or a combination.

**Counterexample.** Showing that every Process reduces to a bag of Events with no leftover identity, across VF and two ERPs.

**Runtime consequence.** Do not add a process virtual machine to the generic engine. If Process exists, it is data plus Actions.

## Decision state summary

| ID | Topic | State |
| --- | --- | --- |
| L-001 | `Workflow` as kernel form | rejected |
| L-002 | Spec versus instance | supported |
| L-003 | Commitment versus machine or slot | supported |
| L-004 | Requested versus happened | supported |
| L-005 | Status as Function | hypothesis |
| L-006 | Partial fulfillment | supported |
| L-007 | Cancel versus compensate | supported |
| L-008 | Escalation composition | hypothesis |
| L-009 | Durable orchestration as infrastructure | supported |
| L-010 | Handoff as Principal on Action | hypothesis |
| L-011 | Process object without Workflow | hypothesis |

RFC-0001 is not edited. Independent sources converge on L-001 through L-004, L-006, L-007, and L-009. That is enough to keep `Workflow` off the candidate list. It is not enough to add `Process` or `Commitment` as kernel forms. Those stay hypotheses for synthesis (#70) after more domain folders exist.
