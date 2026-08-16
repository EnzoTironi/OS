# Candidate durable execution contract

**Issue:** #43  
**Status:** Wave B hypothesis.  
**Goal:** define what a durable execution runtime must preserve while keeping business semantics authoritative elsewhere.

Names below describe runtime/semantic roles, not required ontology primitives.

# 1. Two state spaces must remain distinguishable

## 1.1 Business semantic state

Examples:

```text
PurchaseOrder accepted
Commitment due
Approval valid
Inventory reservation committed
Payment outcome pending
Delivery fulfilled
Fiscal authorization confirmed
```

This state changes only through the appropriate #40/#41/#45/#42/domain semantics.

## 1.2 Orchestration execution state

Examples:

```text
execution X running
run R2 active
step S completed
waiting for signal key K
runtime timer T scheduled for 17:00
retry A3 due in 30 seconds
worker definition revision D7
history checkpoint H
execution cancelled
```

Execution state can guide future work. It is not automatically a statement about the business world.

# 2. Identities

## 2.1 Semantic subject/process identity — optional and domain-owned

A business process, commitment, case, order, claim, obligation, manufacturing run or other subject can have its own stable identity **when the domain independently needs it**.

This contract does not require one universal `BusinessProcessId`.

## 2.2 OrchestrationInstanceId

Identifies one logical durable coordination instance.

It should be possible to link it to one or more domain subjects/operations without making the IDs equal.

## 2.3 ExecutionRunId / epoch

A logical orchestration instance can have several execution runs/epochs due to:

```text
Continue-As-New
fork/replacement
migration
redrive/recovery strategy
history compaction
runtime/backend migration
manual repair
```

The exact runtime may not call these `runs`, but OS observability needs to distinguish continuity of the coordination goal from one physical/history epoch when such rollover exists.

## 2.4 DefinitionRevision

Identifies the runtime program/process definition used by an execution/run.

It is distinct from:

```text
OntologyRevision
ActionDefinitionRevision
PolicyRevision
ConnectorRevision
```

An execution can bind several of these explicitly.

## 2.5 RuntimeStep/Attempt identity

Each Activity/Task/Step execution attempt can have runtime identity for scheduling/diagnostics.

It must not replace:

```text
#40 LocalOperationId
#41 EffectRequestId / AttemptId
#45 ObservationId
#42 Grant/Authorization decision identity
```

One runtime step can invoke no semantic mutation, one semantic mutation, or several explicitly separated operations.

# 3. Durable waits

A wait stores **what condition should cause execution to reconsider what to do next**.

Candidate wait types:

```text
until runtime time T
until correlated external input arrives
until #40 operation reaches a reconciled result
until #41 effect outcome knowledge changes
until domain query/predicate becomes true
until human task interaction arrives
until child execution closes
```

The runtime need not evaluate every business predicate continuously. It can wake on hints/events/timers and then re-read authoritative state.

## 3.1 Timer registration != domain deadline

Suppose a domain Commitment has:

```text
dueAt = 17:00
```

The runtime may register:

```text
Timer(wakeAt=17:00, purpose=recheck commitment C)
```

If `dueAt` changes to 18:00, or C is fulfilled at 16:55, an old 17:00 timer can still fire harmlessly. On wake, the orchestration re-reads the current/pinned domain basis required by the operation.

The timer is therefore a **wake-up hint/guarantee**, not the truth of deadline breach.

## 3.2 Early and duplicate signals

Runtime input queues may buffer events/signals before a wait is active, duplicate them, or deliver them with engine-specific ordering.

Inbound external data must retain #45 source identity/correlation. A runtime signal envelope can carry/correlate ObservationId; it cannot erase it.

# 4. Semantic operation boundary

A durable workflow should not directly mutate authoritative business state as an incidental consequence of advancing its cursor.

When execution wants to cause a business mutation:

```text
orchestration decides to attempt operation
        │
        ▼
construct/reuse stable #40 LocalOperationId
        │
        ▼
#42 authorization / #40 StateBasis / invariants
        │
        ▼
short authoritative commit
        │
        ▼
record/reconcile commit result
```

If the orchestrator retries/replays the scheduling code, it must reuse the semantic operation identity when it is the same operation.

## 4.1 Runtime replay must not duplicate semantic operations

A replay engine can execute the orchestration function many times while reconstructing state. Only runtime APIs that are part of durable history should schedule new work.

For OS, additionally:

> no replay/recovery path may generate a fresh LocalOperationId merely because the orchestrator function body ran again.

## 4.2 Runtime retry vs semantic retry

```text
runtime Activity retry
  = try this execution unit again under runtime policy

#40 physical transaction retry
  = retry known-abort implementation of same semantic operation

semantic reproposal/new Action
  = business decision changed enough to need new authority/identity

#41 Effect attempt retry
  = protocol-specific retry of same external effect request
```

These are separate layers.

# 5. External effects

A write-side Activity/Task that talks to an external authority must consume #41 semantics.

Required mapping:

```text
Orchestration step/activity
  -> existing/create EffectRequest E
       -> #41 executor/reconciliation
```

The orchestration runtime's retry guarantee cannot independently make `E` safe to resend.

## 5.1 Workflow waits on effect knowledge, not worker exception alone

Example:

```text
Activity sends payment request
worker dies after send
```

On recovery:

```text
find EffectRequest E
inspect/reconcile #41 outcome
retry only if E protocol says safe
```

Do not infer `worker crashed -> payment failed`.

# 6. Human interaction and authority

A runtime may represent:

```text
HumanTask T pending
assignee/candidate list
form data
callback token
signal approval=yes
```

OS business Approval requires more:

```text
who acted?
under which represented principal/delegation/grant?
which proposal/intent/bounds?
SoD/four-eyes satisfied?
which policy/currentness rules?
what was committed?
```

Therefore:

> completing a runtime human task is an input to a governed Approval Action, not universal Approval truth.

For low-risk domains a composed Action can make the two transitions happen in one UX operation, while retaining the semantic distinction.

# 7. Authorization over long waits

Do not persist an in-memory/session permission snapshot as durable authority.

An execution should persist references/basis such as:

```text
GrantId/revision
approval evidence
vested authority marker when domain permits
required current policy class
represented principal
agent/workload relation
```

At each semantic commit/effect attempt, #42 decides which controls are:

- historical/vested;
- pinned to proposal/effective date;
- current-at-commit;
- current-at-effect-attempt;
- emergency/non-waivable.

Runtime worker replacement/version migration does not grant new business authority.

# 8. Cancellation, termination, and compensation

Distinguish:

```text
CancelExecution
  stop future orchestration scheduling where possible

CancelPendingSemanticOperation
  governed operation if #40 operation not yet committed

CancelPendingRemoteOperation
  #41 protocol-specific external effect

CompensateCommittedOutcome
  new governed Action/Effect after prior outcome
```

A runtime `CANCELLED` status cannot erase committed business history.

Cancellation races require reconciliation of in-flight operations/effects before declaring domain outcome.

# 9. Completion

## 9.1 Runtime completion

`ExecutionCompleted` means:

> this definition/run reached its runtime terminal condition and no further work is scheduled by it.

## 9.2 Business completion

Domain completion must be defined independently, e.g.:

```text
all required Commitments fulfilled or validly discharged
all required #40 Actions committed
required #41 external outcomes reconciled
no blocking invariant/policy violation
```

The domain can choose to emit/commit a `ProcessCompleted` Event/Action if that concept exists. The runtime terminal state can trigger evaluation but is not sufficient evidence by itself.

# 10. Versioning and migration

At least four revisions can matter simultaneously:

```text
execution definition revision
ontology/domain revision
Action/function revision
policy/authorization revision
connector/effect revision
```

A robust system records the relevant bindings rather than one global version number.

## 10.1 Runtime code compatibility

Long-running execution backends solve this differently:

- pin old execution to old code/worker deployment;
- patch deterministic replay;
- migrate process instance mappings;
- redrive under original definition;
- fork/new execution.

OS must support the selected backend strategy without pretending it changes historical business semantics.

## 10.2 Domain migration during a live execution

When OntologyRevision changes, the orchestrator must decide explicitly whether the pending next semantic operation:

```text
continues under pinned old semantics
re-evaluates under compatible new semantics
requires reproposal/migration
is cancelled/replaced
```

This is not determined merely by workflow-worker compatibility.

# 11. Repair/fork/redrive

Operational repair may:

```text
retry failed runtime task
redrive from failure
fork execution from checkpoint
migrate active process element
create a new run/history epoch
```

Safety rule:

> copied/replayed runtime progress must not copy permission to duplicate semantic Actions/Effects.

Recovery queries durable semantic operation IDs/results before scheduling further mutations.

A fork can intentionally create new semantic work, but then it needs new semantic IDs/authority by explicit policy.

# 12. Concurrency

The orchestration engine can serialize an execution instance or keyed handler, but domain invariants can span multiple executions/objects.

Example:

```text
workflow X reserves last 7 units
workflow Y reserves last 7 units
```

Correctness belongs to #40 aggregate/predicate invariant enforcement, not `one worker per workflow`.

Likewise, two workflows can race to fulfill the same Commitment. The winning business transition is determined by semantic commit, not scheduler arrival order.

# 13. Orchestrator outage and external-world progress

The real world can change while the orchestrator is unavailable:

```text
supplier delivers
payment settles
human performs manual warehouse action
SEFAZ authorizes document
marketplace changes listing
```

On recovery, the orchestrator must ingest/reconcile current evidence before replaying assumed pending work.

Therefore durable runtime state is **not** a complete source of current business state.

# 14. Retention and history rollover

Execution history may need:

- Continue-As-New;
- archive/retention;
- compaction/checkpoints;
- new workflow execution at service limits;
- privacy-driven deletion.

Business/audit retention requirements are independent. A shorter orchestration history is acceptable if durable domain/effect/authority evidence required by law/operations remains elsewhere.

Do not force indefinite retention of all engine-internal events merely because some business history must be retained.

# 15. Generic runtime capability interface — hypothesis

An implementation-neutral runtime could expose roles like:

```text
StartExecution(definitionRevision, semanticLinks, input)
GetExecution(id)
ScheduleWake(id, wakeSpec)
DeliverInput(id, observationOrRuntimeMessageRef)
RunDurableStep(id, stepIdentity, fn)
RequestSemanticOperation(id, LocalOperationId, payload)
RequestEffect(id, EffectRequestId)
StartChildExecution(...)
CancelExecution(...)
MigrateOrReplaceExecution(...)
```

This is intentionally not an API specification. It shows that the runtime can be abstracted without making its internal `Workflow` type the business ontology.

# 16. Minimum acceptance tests for a candidate backend

A backend fails #43 if OS cannot implement these without semantic leakage:

1. crash after #40 commit but before runtime checkpoint -> no duplicate Action;
2. crash after remote send -> #41 indeterminate/reconciliation, not blind Activity retry;
3. timer fires after domain deadline changed -> no false breach;
4. signal arrives twice/before wait -> no duplicate business Event/Approval;
5. grant revoked during month-long wait -> #42 currentness rule still enforceable;
6. workflow definition upgraded -> old run remains explainable under its actual revision;
7. ontology revision changes independently -> next semantic operation handles compatibility explicitly;
8. execution cancels after remote effect -> prior effect remains and compensation is explicit;
9. orchestrator down while external world fulfills obligation -> recovery recognizes fulfillment;
10. multiple execution runs/forks can coordinate one domain process without changing its identity;
11. one runtime execution can coordinate multiple domain subjects without merging their identities;
12. runtime completion can coexist with unresolved domain effect and must not claim business completion;
13. execution history rollover/retention does not delete required business evidence;
14. test/replay environment cannot trigger production effects (#47);
15. runtime serialization cannot substitute for cross-object #40 invariant enforcement.

Passing these is stronger evidence than merely surviving worker crashes.
