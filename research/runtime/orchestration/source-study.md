# Source study — durable execution and orchestration

**Issue:** #43  
**Method:** current first-party product documentation only for runtime behavior; Wave A/#40/#41/#42 for internal semantic pressures. Product terminology is evidence about mechanisms, not imported ontology.

# 1. Temporal

Primary references:

- <https://docs.temporal.io/>
- <https://docs.temporal.io/llms.txt>
- index entries for Workflow Execution, Event History, Continue-As-New, timers, message passing, retry policies and Worker Versioning.

Observed mechanism:

- Temporal defines durable Workflow Executions whose execution progress survives crashes/outages.
- Event History is the durable basis for replay/reconstruction of Workflow execution.
- Workflow code is constrained by deterministic replay; nondeterministic/external work belongs in Activities or other effect boundaries.
- Temporal distinguishes Workflow ID and Run ID and exposes Continue-As-New, which creates a new run/history while continuing the logical workflow chain.
- Signals/Updates/Queries are workflow-message mechanisms; timers and schedules are runtime constructs.
- Worker Versioning/Patching exist because workflow code compatibility across long-running executions is a runtime problem.
- Activity retries and Workflow retries are runtime execution semantics, not proof that an external API mutation is safe to repeat.

### Pressure for OS

Temporal is strong evidence that **execution identity can itself be multi-level**:

```text
logical workflow identity
  -> run 1
  -> run 2 (Continue-As-New)
```

That is useful for #43, but OS must not automatically equate Temporal Workflow ID with a business Process/Commitment ID. The same business goal may need a replacement/forked execution; one orchestration can also coordinate several domain objects/processes.

Temporal's Event History is evidence of runtime decisions/tasks/results, not automatically domain Event history. A `TimerFired`, `ActivityTaskCompleted`, or `WorkflowExecutionCompleted` has runtime meaning even when no independent business event corresponds to it.

# 2. Azure Durable Functions / Durable Task

Primary references:

- <https://learn.microsoft.com/en-us/azure/durable-task/common/durable-task-orchestrations>
- <https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-external-events>
- <https://learn.microsoft.com/en-us/azure/azure-functions/durable/durable-orchestration-versioning>

Observed mechanism:

- orchestrator functions coordinate long-running work using event-sourced execution history;
- after interruption, the function is replayed from the beginning and previous activity/timer/event results reconstruct local state;
- orchestrator code must be deterministic relative to execution history;
- durable timers survive host unload/restart;
- external events can wake a waiting orchestration and can be queued before the orchestration starts waiting;
- orchestration versioning associates running instances with execution versions so workers can preserve replay/code compatibility.

### Pressure for OS

This is particularly strong evidence that:

```text
runtime event queue semantics != #45 business observation semantics
```

An Azure external event is a message to an orchestration instance. If it came from a webhook/human/system, OS still needs source identity, actor/correlation, authority and dedupe semantics before it satisfies a business condition.

Version pinning/isolation is also clearly an execution concern. `orchestrator version 2` and `ontology revision 2` are unrelated identifiers unless explicitly bound.

# 3. Camunda 8 / Zeebe

Primary references:

- <https://docs.camunda.io/docs/components/orchestration-cluster/>
- <https://docs.camunda.io/docs/components/modeler/bpmn/tasks/>
- <https://docs.camunda.io/docs/components/modeler/bpmn/user-tasks/>
- Camunda 8 process-instance migration documentation inspected during this research pass.

Observed mechanism:

- Zeebe is a process automation/workflow engine with persisted process-instance state;
- BPMN tokens/active elements drive execution and job creation;
- User Tasks explicitly stop a process instance while a human-assisted task waits for completion;
- user task scheduling includes due/follow-up dates;
- messages are correlated to process instances/subscriptions by message name and correlation key under engine-defined buffering/correlation semantics;
- process-instance migration can move a running instance to another deployed definition under explicit element mappings/restrictions;
- migration of execution position does not imply historical domain Actions/Events are rewritten.

### Pressure for OS

Camunda is the best donor here for **explicitly modeled human/process coordination**, but also the strongest leakage risk.

A BPMN token at `Approve purchase` proves:

> Zeebe's execution instance is currently waiting at this modeled element.

It does not prove:

> there is a valid #40 Approval for the current proposal under #42 authority.

Likewise, Camunda `dueDate` can be a UI/work-management schedule without being the legal/economic deadline of a Commitment. The domain deadline can move or be fulfilled independently while an old engine timer/task still exists.

Instance migration reinforces the separation: runtime mapping of a running instance into another definition is a migration of **execution memory**; it cannot silently rewrite what prior domain Actions/Events/Commitments meant.

# 4. AWS Step Functions

Primary references:

- <https://docs.aws.amazon.com/step-functions/latest/dg/choosing-workflow-type.html>
- <https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html>
- <https://docs.aws.amazon.com/step-functions/latest/dg/redrive-executions.html>
- <https://docs.aws.amazon.com/step-functions/latest/dg/state-wait.html>

Observed mechanism:

- Standard Workflows persist state between transitions and AWS describes workflow execution as exactly-once unless explicit retry behavior is configured;
- Express variants have different at-least/at-most-once execution guarantees;
- callback Task Tokens can pause a workflow for human/external completion;
- Wait states durably delay continuation until duration/timestamp;
- Standard Workflow redrive preserves successful state results/history and restarts from unsuccessful steps under the original execution/definition/version association;
- Standard execution has finite duration/history limits, and AWS documents continuation by starting a new workflow execution for very long chains.

### Pressure for OS

The phrase `exactly-once workflow execution` must be scoped carefully. It is a guarantee from the Step Functions state-machine service, not a universal statement that every external Task target performs a side effect exactly once. #41 remains authoritative for remote effect safety.

Task Token callback also illustrates another separation:

```text
SendTaskSuccess(token)
```

proves that the orchestration callback protocol was satisfied. It does not by itself prove the callback sender had business approval authority or that the payload is an authoritative business Event.

Redrive's use of the original definition is execution-version semantics, not domain-version semantics.

# 5. DBOS

Primary references:

- <https://docs.dbos.dev/architecture>
- <https://docs.dbos.dev/production/workflow-recovery>
- language workflow/step/transaction tutorials, including Go/Python/TypeScript.

Observed mechanism:

- DBOS implements durable workflows by checkpointing workflow/step state in Postgres;
- recovery re-executes workflow code and returns checkpointed outputs for completed steps;
- workflow code is required to be deterministic between checkpoints;
- ordinary Steps execute at least once: if a process crashes after side effects but before checkpoint, the step can re-execute;
- DBOS explicitly recommends idempotent Steps and states that external API side effects can therefore need idempotency;
- DBOS Datasource transactions can atomically commit application DB writes and DBOS durability record in the same database, producing exactly-once database transaction semantics in that scope;
- durable sleep, workflow queues, cancellation/resume/fork/recovery are provided.

### Pressure for OS

DBOS is strong evidence that some #40 commit + #43 orchestration integration can be physically collapsed **when** the business authoritative database and durability checkpoint share a transaction.

That does not change semantic separation:

```text
DBOS checkpoint/transaction facility
  can implement #40/#43 mechanisms
  but does not define what the Action/invariant/authority means
```

Its own docs make the #41 boundary explicit: ordinary external Steps are at-least-once and should be idempotent. Therefore an `exactly-once transaction` claim cannot be generalized to network effects.

Forking from a step is also operationally useful but semantically dangerous: a fork is a **new execution** and must not duplicate business Actions/Effects merely because it copies execution checkpoints.

# 6. Restate

Primary references:

- <https://docs.restate.dev/foundations/key-concepts>
- <https://docs.restate.dev/foundations/services>
- <https://docs.restate.dev/develop/ts/external-events>
- <https://docs.restate.dev/develop/ts/durable-timers>
- <https://docs.restate.dev/services/versioning>
- <https://docs.restate.dev/guides/sagas>

Observed mechanism:

- Restate records handler actions/results in a journal and replays/skips completed actions on retries;
- Workflows have keyed execution identity and interaction handlers;
- durable Promises/Awakeables support external/human waits;
- durable timers and delayed messages survive failures;
- immutable deployments keep retry attempts on the same deployment version;
- keyed Virtual Objects/Workflow handlers provide serialized/exclusive state access for some handlers;
- Restate's Saga guidance still requires idempotent compensations and provider-specific idempotency for one-shot external APIs.

### Pressure for OS

Restate demonstrates that **journaled code execution + interaction + keyed concurrency** can be a compact alternative to a standalone BPMN engine.

But its Workflow ID, Virtual Object key, durable Promise name, invocation ID, and journal entry are runtime identities. OS cannot assume they are globally canonical business identities.

Its Saga guidance is useful evidence for #41: durable execution does not eliminate the lost-confirmation/duplicate-side-effect problem at external providers.

# 7. Cross-system comparison

## 7.1 What converges

All mature systems need some combination of:

- durable execution identity;
- persisted progress/history/checkpoint;
- delayed wakeups/timers;
- external/human input waiting;
- retry/failure recovery;
- version/deployment compatibility strategy;
- observability/admin operations;
- cancellation/termination/recovery controls.

This convergence strongly supports a **generic durable execution capability** in OS.

## 7.2 What does not converge

They disagree substantially on:

- code replay vs explicit state machine/BPMN;
- one event history vs step checkpoints vs process-token state;
- definition migration vs version pinning vs fork/redrive;
- exactly-once terminology/scope;
- human task representation;
- message buffering/deduplication;
- coupling to a particular database/control plane.

This divergence argues against importing one runtime's nouns into the base ontology.

# 8. Semantic mapping to OS boundaries

| Runtime concept | What it proves | What it does **not** automatically prove |
| --- | --- | --- |
| workflow/process instance | one engine execution exists | real-world Process/Commitment exists |
| workflow history/journal | runtime commands/results observed | complete authoritative business history |
| Activity/Task completed | runtime unit returned/completed | #40 business Action committed or #41 effect reconciled |
| timer fired | scheduling deadline elapsed | business deadline breached |
| external signal/message | runtime received input | authoritative domain Event |
| user task completed | engine task completion | #40 Approval under #42 authority |
| workflow canceled | engine execution stopped | prior business Actions/effects reversed |
| workflow succeeded | engine definition reached success | all domain obligations/effects fulfilled |
| process definition version | execution code/model revision | ontology/domain semantic revision |
| retry/redrive/replay | runtime recovery mechanics | permission to repeat semantic mutation |

# 9. Conclusion for #43

The inspected external evidence supports a first-class **durable execution/orchestration runtime boundary**, but does not support `Workflow` as a universal semantic primitive.

The runtime should be able to remember:

```text
where execution is
what it is waiting for
which code/definition revision it belongs to
which operations/effects it already requested
which runtime inputs/timers arrived
what retry/recovery action is safe at the execution layer
```

The ontology/business layer must still decide:

```text
what exists
what obligation/commitment/process means
what Action may commit
what Event actually happened
what authority is valid
what external outcome is established
what counts as business completion
```
