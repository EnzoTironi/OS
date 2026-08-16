# Durable execution and orchestration — process memory without business authority

- Artifact ID: `issue-0043-durable-orchestration`
- Issue: <https://github.com/EnzoTironi/OS/issues/43>
- Track: Wave B runtime boundary research
- Date: 2026-08-16
- Base: Wave A + merged #40 commit + #41 effects + #42 authorization
- Decision: none. This folder defines an implementation-neutral **durable execution contract** and falsifiers. It does not select Temporal, Camunda, Step Functions, Azure Durable, DBOS, Restate, BPMN, or `Workflow`/`Process` as a metamodel primitive.

## Question

What memory must a runtime preserve so long-running work can survive crashes, waits, deployments and asynchronous inputs **without allowing the orchestration engine to become the authority for business truth?**

The central distinction is:

```text
BUSINESS / ONTOLOGY SEMANTICS

Process?          Commitment?       Obligation?
Action            Event             Approval
Deadline?         Agreement?        EffectRequest
State / invariant / policy / authority

                 !=

ORCHESTRATION / PROCESS MEMORY

execution instance       execution epoch? / continuation evidence
program/definition rev   execution cursor
step/activity attempt    durable timer registration
wait/subscription        buffered signal/message
retry schedule           checkpoint/journal
worker/deployment rev    runtime cancellation state
```

A runtime execution can coordinate business work. Its internal token/cursor/history is not automatically the business process itself.

`execution epoch` above is a **conceptual role when a backend exposes or needs rollover/replacement identity**. Temporal may expose a Run ID; another backend may use redrive/fork/migration evidence or one stable execution identity. OS does not require every backend to manufacture the same `RunId` field.

## Core result

The strongest current decomposition is:

```text
Business semantic identity / commitments / declared state basis
        │
        │ determine what must be done and what counts as done
        ▼
ORCHESTRATION PLAN / EXECUTION
  ExecutionInstance X
  DefinitionRevision DR
  ExecutionEpoch R1?     // backend-specific when applicable
        │
        ├─ durable wait / timer / subscription
        ├─ compute / pure routing
        ├─ request #40 LocalOperation O1
        ├─ request #41 EffectRequest E1
        ├─ wait for #45 Observation W
        ├─ obtain/recheck #42 authority
        └─ recover/replay/migrate as runtime mechanics require
        │
        ▼
ExecutionEpoch R2?       // continue-as-new, redrive, fork, migration, replacement when applicable
        │
        ▼
execution can close
```

Closure of `X/R` says the orchestrator has no more work under that execution definition/epoch. It does **not** prove, by itself, that a business Process/Commitment/Effect has succeeded.

## The boundary law

> **Durable orchestration is memory and scheduling for future semantic operations, not a substitute for semantic commit, external reconciliation, source evidence or authorization.**

Therefore:

```text
workflow step transition          != #40 authoritative business commit
Activity/Task retry               != #41 safe remote effect retry
signal/message received           != domain Event by default
timer fired                       != business Deadline breached
human task completed              != business Approval by default
workflow execution completed      != business Process fulfilled
workflow execution history        != universal business Event history
workflow code/definition revision != ontology/domain semantic revision
runtime cancellation              != business cancellation/compensation
```

## Why this matters for agents

Long-lived agents intensify the same problem. An agent may sleep, wait for a human, spawn work, recover after a deployment and resume after an external callback. Its **execution memory** must survive without turning:

- model context into authorization state;
- orchestration checkpoint into business truth;
- tool retry into duplicate Action/Effect;
- stale task grant into permanent authority;
- agent completion into proof of external outcome.

Agent execution therefore consumes the same boundaries as human/system workflows.

## Runtime mechanism comparison — high-level

| Family | Durable memory style | Main strength for #43 | Main semantic risk |
| --- | --- | --- | --- |
| Temporal | event history + deterministic workflow replay | rich code-first durable orchestration, signals/timers, worker versioning | confusing Temporal history/Workflow IDs with domain event/process identity |
| Azure Durable | event-sourced replay/checkpoints | code-first waits/timers/events + explicit orchestration versioning | replay determinism can be mistaken for business determinism |
| Camunda 8 / Zeebe | BPMN process model + persisted process-instance state | explicit human/process modeling, timers/messages, instance migration | BPMN token/user-task state can invade ontology and become business authority |
| AWS Step Functions Standard | managed state-machine execution history | managed waits/callbacks/redrive/version-bound executions | service `exactly-once workflow execution` can be overread as exactly-once external effects |
| DBOS | workflow/step checkpoints in Postgres | minimal infrastructure; co-committed durable DB transactions | checkpoint/step position may couple orchestration memory to one database/application layout |
| Restate | per-invocation journal + durable handlers/promises/timers | compact durable execution + keyed state + interaction primitives | handler/workflow IDs and journaled side effects can become accidental domain identity |

See [`capability-matrix.md`](capability-matrix.md) and [`source-study.md`](source-study.md) for evidence and caveats.

## Strongest candidate laws

The full falsifiable set lives in [`candidate-laws.md`](candidate-laws.md). The most important current findings are:

1. **Business process identity and orchestration execution identity must be separable.** One business process/commitment can outlive, migrate across, or be served by multiple execution epochs/instances where the backend architecture requires them.
2. **Runtime history is execution evidence, not automatically business event history.** It proves what the runtime scheduled/observed according to its protocol.
3. **Replay is not semantic re-execution.** Recovery must reuse stable #40 operation IDs/#41 effect IDs and evaluate the semantic operation's declared #40 basis — current, pinned, immutable, as-of, or another supported dependency form — rather than inventing a new operation or universally rereading “latest state”.
4. **Timers are triggers, not deadlines.** A timer firing tells the runtime to wake; the ontology/domain decides whether a deadline still exists or was breached under the relevant declared basis.
5. **Signals/messages are input evidence.** They inherit #45 correlation/authority/dedupe semantics before they can satisfy a business condition.
6. **Human wait completion is not authorization/approval by position alone.** #42 actor/grant/SoD and #40 proposal/approval basis still apply.
7. **Activity/step retry policy cannot overrule #41 external-effect safety.** A runtime may retry its unit of work only if the semantic operation/effect contract makes that retry safe.
8. **Execution definition/version and ontology revision are independent axes.** Both can change and must be bound explicitly where relevant.
9. **Cancellation has layers.** Stopping a scheduler/run does not reverse committed Actions or remote effects.
10. **Execution completion is not a universal business terminal event.** Business completion is derived/committed from domain-specific conditions/evidence.
11. **The orchestration transaction must stay short.** Waiting for months must not hold #40 authority transaction/locks open.
12. **No evidence yet earns `Workflow` as a base semantic primitive.** Durable execution capability is required; a universal business Workflow sort is not.

## A deliberately adversarial example

Supplier delivery commitment is due at 17:00.

```text
15:00  orchestrator registers timer for 17:00
16:55  supplier fulfills obligation; external evidence arrives
16:56  #40 commits Fulfillment/Receipt under adequate evidence
17:00  old timer fires
```

Correct result:

```text
timer fired = true            // runtime fact
commitment overdue = false    // business/domain fact
escalation Action = not needed
```

If the workflow engine says `timer branch won -> overdue`, it has improperly become business authority.

## Primitive-reduction result

This pass begins from three competitors:

### M-O1 — native Workflow/Process runtime primitive exposed as ontology semantic root

Engine-native workflow definition/instance/token state is directly semantic.

**Benefit:** tooling and execution are unified.  
**Risk:** highest leakage; runtime position becomes business truth.

### M-O2 — ordinary domain Process/Commitment types when independently meaningful + generic orchestration runtime

Runtime execution identities/waits/timers/checkpoints are operational records/capabilities. Domain Process/Commitment exists only where real-world semantics justify it.

**Benefit:** separates reality from mechanism while preserving strong durable execution.  
**Risk:** requires explicit mapping between domain conditions and runtime waits.

### M-O3 — no business Process concept, only Actions/Events/state + orchestration runtime

**Benefit:** smallest semantic vocabulary.  
**Risk:** can fail when an economic/organizational process, commitment or obligation has independent identity/lifecycle beyond individual Actions.

Current strongest runtime hypothesis is **M-O2**, but it does not decide whether `Process` itself is a metamodel primitive. #70 must test that separately across manufacturing, fulfillment, approvals and agreements.

## Files

| File | Purpose |
| --- | --- |
| [`source-study.md`](source-study.md) | current first-party comparison of Temporal, Azure Durable, Camunda 8, Step Functions, DBOS, Restate |
| [`capability-matrix.md`](capability-matrix.md) | mechanism matrix against #43 requirements |
| [`orchestration-contract.md`](orchestration-contract.md) | implementation-neutral execution-memory contract |
| [`candidate-laws.md`](candidate-laws.md) | falsifiable laws/non-laws |
| [`adversarial-cases.md`](adversarial-cases.md) | crash/wait/signal/timer/version/cancel/effect scenarios |
| [`reference_model.py`](reference_model.py) | executable semantic-boundary toy model |
| [`test_reference_model.py`](test_reference_model.py) | regression/litmus tests |
| [`open-questions.md`](open-questions.md) | downstream handoff |
| [`review.md`](review.md) | adversarial self-review |

## Explicit non-decisions

This research does **not** yet decide:

- Temporal vs Restate vs DBOS vs Camunda vs cloud-managed engine;
- code-first vs BPMN/declarative authoring for every process;
- whether `Process`, `Commitment`, `Deadline`, `Schedule`, or `Workflow` earns a semantic primitive;
- the physical storage of orchestration history;
- whether one or multiple runtime backends should be supported;
- whether agent loops share one engine with deterministic business coordination.

Those choices come only after the semantic contract survives executable adversarial tests.
