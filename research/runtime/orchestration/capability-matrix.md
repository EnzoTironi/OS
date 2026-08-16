# Capability matrix — durable execution mechanisms

**Issue:** #43  
**Purpose:** compare runtime mechanisms against the semantic contract, not pick a vendor by feature count.

Legend:

- `strong` — first-class current mechanism in inspected official docs;
- `partial` — possible but constrained, indirect, or requires surrounding infrastructure/application conventions;
- `external` — intentionally delegated to another system/component;
- `n/a` — not a meaningful guarantee for that runtime category.

The matrix records **runtime capabilities**, not business semantic correctness.

| Capability | Temporal | Azure Durable | Camunda 8 / Zeebe | AWS Step Functions Standard | DBOS | Restate |
| --- | --- | --- | --- | --- | --- | --- |
| durable execution state | strong event history | strong event history/checkpoints | strong persisted process-instance state | strong managed state between transitions | strong Postgres checkpoints | strong invocation journal |
| crash/restart recovery | strong replay | strong replay | strong replicated engine state | managed service | strong checkpoint recovery | strong journal replay |
| code-first orchestration | strong | strong | partial via workers/scripts; BPMN-first | declarative ASL | strong | strong |
| explicit visual process model | external | external | strong BPMN | strong state-machine visualization | external | external |
| durable timers | strong | strong | strong BPMN timers | strong Wait state | strong durable sleep/schedules | strong sleep/delayed calls |
| human/external waits | Signals/Updates | external events | strong User Tasks/messages | callback Task Token | messages/events/sleep composition | durable promises/awakeables |
| early-arriving input buffering | runtime-specific message history | documented external-event queueing | message TTL/buffering rules | callback protocol-specific | message/event APIs | durable promises/invocations |
| activity/step retry | strong policies | activity retry/error handling | job retries/incidents | Retry/Catch | step retry config | invocation/run retries |
| execution redrive/resume | replay/reset/retry/run mechanics | replay/restart | incidents/modification/migration | explicit Redrive | resume/recover/fork | retries/replay; invocation management |
| long-history rollover | Continue-As-New | app/version strategy | retention/archive; process model | new execution required at service limits | checkpointed workflow; retention config | handler decomposition/delayed calls recommended for very long sleeps |
| execution definition versioning | strong worker versioning/patching | strong built-in orchestration versioning | deployed process versions + migration | versions/aliases; redrive pins original | app deployment compatibility conventions/fork | immutable deployments pin retries |
| migrate live instance to new definition | mechanisms vary; patch/version/fork patterns | version isolation more than arbitrary migration | strong explicit migration | no redrive to changed definition; start new execution | fork/new workflow | new deployment/invocation patterns; not equivalent to Camunda migration |
| child/sub-workflows | strong | strong | call activities/process composition | nested workflows/service integration | child/enqueued workflows | service/workflow calls |
| per-key serialized handler state | external/domain DB | Durable Entities separately | process-instance token/state serialization | state machine execution semantics | DB/queue/app locking | strong Virtual Objects/workflow keyed handlers |
| local DB co-commit with durability | external via app DB/outbox | external | external | external | strong for supported datasource transaction scope | specialized patterns; not universal app DB transaction |
| arbitrary external effect exactly-once | **no** — #41 required | **no** | **no** | service execution guarantee does not prove target effect | **no** for ordinary Steps | **no** — provider idempotency still required |
| authoritative business commit | external to orchestrator | external | engine can own process vars/token, but OS should use #40 | external to state machine | can physically implement #40 when same DB contract fits | can mediate state but OS #40 contract still governs semantic commit |
| current authorization at semantic commit | external/PDP integration | external | Camunda auth/task assignment != full OS authority | IAM/service auth != business delegation | application/PDP | application/PDP |
| durable operational visibility | strong Visibility/UI | strong management/history | strong Operate/Tasklist | strong execution details/history | Conductor/console | UI/introspection journal |
| cancellation of runtime execution | strong | strong | strong | StopExecution | strong cancel | invocation cancel/kill |
| automatic reversal of committed domain effects | no | no | no | no | no | no; saga compensation is explicit code |

# Semantic fit by architectural style

## Temporal

Best fit if OS wants:

- expressive code-first coordination;
- years-long waits;
- rich replay/history;
- Signals/Updates;
- mature worker/versioning semantics;
- runtime separated from business database.

Main #43 proof obligation:

> ensure Workflow/Run/Event History identities remain orchestration memory and every semantic mutation crosses #40/#41/#42 boundaries.

## Azure Durable / Durable Task

Best fit if:

- code-first event-sourced orchestration is desired;
- Azure ecosystem is acceptable;
- explicit current version-isolation semantics are valuable.

Main proof obligation:

> external-event queues and replay events must not be treated as domain Event truth.

## Camunda 8 / Zeebe

Best fit if:

- business users/process engineers need explicit BPMN;
- human task lifecycle/assignment/UI is central;
- process-instance migration is operationally important.

Main proof obligation:

> BPMN model/token/task variables must not become a rival ontology or bypass #40/#42 semantics.

## AWS Step Functions

Best fit if:

- managed AWS-native integration dominates;
- workflows are bounded enough for Standard execution limits;
- declarative state machines are acceptable.

Main proof obligation:

> scope `exactly-once workflow execution` to the AWS execution service and never infer remote exactly-once effects.

## DBOS

Best fit if:

- OS already wants Postgres as primary operational store;
- low infrastructure footprint matters;
- co-committing #40 transaction + orchestration durability is valuable;
- code-first workflows are enough.

Main proof obligation:

> don't let the attractive shared-Postgres mechanism collapse ontology/transaction/process memory into one unversioned application schema; external Steps remain #41 effects.

## Restate

Best fit if:

- keyed stateful actors/virtual objects + durable handlers are useful;
- code-first orchestration and human/external waits should be compact;
- runtime-level service calls/idempotency are valuable.

Main proof obligation:

> provider/API side effects still need #41 identity/reconciliation; Workflow/Virtual Object keys must not become canonical domain identity merely because runtime serializes by key.

# What the matrix cannot decide

Feature parity cannot answer:

```text
Should Process be a semantic primitive?
Should Workflow be a semantic primitive?
Does a timer correspond to a business Deadline?
Does a user task correspond to Approval?
Does completion mean obligation fulfilled?
Which external signal is authoritative?
```

Those are ontology/domain questions. The runtime can only provide mechanisms capable of implementing the resulting contract.
