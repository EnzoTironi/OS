# Open questions and downstream handoff

**Issue:** #43  
**Status:** unresolved unless explicitly answered.

# Questions #43 can answer now

## Q-ORCH-01 — should orchestration engine state be the business source of truth?

**Answer:** no as a general architecture.

Execution state tells us what the engine is doing/waiting for. Business truth remains governed by ontology/domain Actions, observations, effects, commitments and policies.

## Q-ORCH-02 — does long-running work imply `Workflow` is a base semantic primitive?

**Answer:** no.

All inspected engines provide durable execution without proving that their Workflow/ProcessInstance type corresponds one-for-one to real-world process identity.

## Q-ORCH-03 — can a timer represent a business deadline directly?

**Answer:** only as an implementation/materialization when an explicit mapping contract says so. The semantic deadline and runtime timer remain distinguishable because deadlines can change/be fulfilled while stale timers still fire.

## Q-ORCH-04 — can workflow Activity retry directly retry external mutation?

**Answer:** not safely as a generic rule.

#41 effect identity/idempotency/reconciliation determines whether remote retry is safe.

## Q-ORCH-05 — can workflow completion be used as business completion?

**Answer:** only if the domain has explicitly defined a completion Action/predicate and the execution terminal step commits/evaluates it under the required evidence. Engine terminal status alone is insufficient.

## Q-ORCH-06 — should every Action use durable orchestration?

**Answer:** no.

Short atomic Actions should be able to execute directly through #40. Durable orchestration is justified by waits, retries, multi-stage coordination, asynchronous effects, scheduled work, or recovery requirements.

# Open backend questions

## Q-ORCH-10 — one durable runtime or pluggable backends?

Current answer: `undetermined`, with strong pressure for an implementation-neutral boundary.

Temporal, BPMN/Zeebe, DBOS and Restate expose meaningfully different execution models. A narrow OS interface might allow:

- code-first deterministic replay backend;
- BPMN/human-process backend;
- Postgres-local lightweight backend;
- managed cloud backend.

But supporting several engines can create migration/testing/observability complexity. Prove one engine fails required scenarios before multiplying backends.

## Q-ORCH-11 — is Temporal the strongest general default?

Undetermined.

Temporal has mature durable workflow/replay/versioning/message primitives, but #43 must benchmark:

- operational footprint and HA;
- worker versioning ergonomics;
- history/retention behavior;
- high-volume timers/signals;
- integration with #40 authoritative Postgres transactions;
- typed boundary around #41 effects;
- agent workloads;
- testability and deterministic replay constraints.

Restate/DBOS may be materially simpler for some OS deployment shapes. Camunda may dominate explicit human/BPMN workflows. Do not pick from reputation alone.

## Q-ORCH-12 — should BPMN be a supported authoring projection?

Strong candidate, not decided.

BPMN is valuable for business-readable explicit coordination, especially human tasks, timers, gateways and compensation. But a BPMN model should compile/map into the orchestration boundary and domain Actions rather than become the ontology schema.

## Q-ORCH-13 — does `Process` deserve a semantic primitive?

Still open from #10/#70.

Evidence supports independently meaningful domain processes in manufacturing/REA/ValueFlows, but this is not the same as runtime Workflow. Test:

```text
ManufacturingProcess / RecipeProcess
Fulfillment process
Economic exchange commitments
Approval/case coordination
```

against composition from ObjectType + Links + Actions + Events + Commitments.

## Q-ORCH-14 — does `Commitment` deserve a primitive?

Open. ValueFlows/REA gives stronger semantic evidence than workflow engines do. #70 should test Commitment independently of orchestration.

## Q-ORCH-15 — how should orchestration history link to domain audit graph?

Working hypothesis:

```text
runtime execution/run/step/timer/input IDs
  link causally to
LocalOperationId / EffectRequestId / ObservationId / Approval evidence
```

Do not copy every runtime event into the domain ledger. #49 should define explanation views and retention.

# Handoff to #39 — storage

Storage evaluation must distinguish:

```text
business authoritative transaction state (#40)
execution runtime state/history/checkpoints (#43)
external effect attempt/outcome state (#41)
authorization/grant state (#42)
```

Questions:

1. Can Postgres safely host both authoritative state and DBOS-style orchestration checkpoint tables without coupling schemas/retention?
2. Does Temporal/Restate need a separate persistence/control plane, and what operational cost follows?
3. Which execution records need relational query vs specialized runtime store?
4. Can runtime history be compacted/archive independently of business audit retention?
5. How are semantic operation IDs atomically/fail-safely linked to runtime checkpoints?
6. If runtime and authoritative DB fail independently, what recovery ordering preserves #40/#41 semantics?

Do not select storage based solely on orchestration engine preferences.

# Handoff to #46 — verification/fuzzing

Promote S-ORCH-* to executable property/fault tests.

Highest value:

- crash at every boundary before/after #40 commit and runtime checkpoint;
- duplicate/early/out-of-order signals;
- obsolete timers after state/deadline changes;
- workflow replay/fork/Continue-As-New with stable semantic IDs;
- effect send + worker crash + retry timer;
- policy/grant revocation during waits;
- concurrent workflows attacking one aggregate invariant;
- workflow/runtime version + ontology/policy/connector revision cross product;
- orchestrator outage while external world changes;
- cancellation at every causal stage.

Metamorphic properties:

1. **Replay invariance:** replay/recovery with unchanged semantic inputs does not create new committed semantic operations.
2. **Timer non-authority:** adding duplicate/obsolete runtime timer fires cannot change business state without a successful governed Action.
3. **Signal delivery invariance:** duplicate delivery of one Observation cannot create duplicate semantic transition.
4. **Run rollover invariance:** changing ExecutionRunId alone does not change domain subject identity/state.
5. **Runtime terminal independence:** changing runtime status to completed/cancelled cannot directly mutate authoritative domain state.
6. **External-world convergence:** after outage, recovery plus authoritative observations converges to the same business projection as if orchestration had stayed online, modulo explicit timing-dependent business rules.

# Handoff to #47 — safe code/effect execution

Orchestrator code and workers require capabilities:

```text
pure/deterministic orchestration code where replay model requires
restricted arbitrary I/O
#40 mutation capability only through semantic commit interface
#41 effect capability only through typed connector boundary
#42 trusted actor/grant context injection
production/test environment fencing
worker/deployment identity
resource/time/memory limits for agent/code steps
```

Historical replay/fork/test must not automatically inherit production effect credentials.

# Handoff to #49 — observability

Required explanation graph:

```text
Domain subject/process/commitment C
  <- coordinated by Execution X
       run R1 definition D1
         step S1 -> #40 O1 committed
         timer T1 fired (no domain mutation)
         signal delivery SD1 -> #45 Observation W1
       run R2 definition D2 (migration/rollover)
         step S4 -> #41 EffectRequest E1
           attempt A1 sent/no response
           reconciliation confirms later
       Execution X completed
  -> domain ProcessComplete? evaluated/committed separately
```

Operators must be able to answer:

- Is the business stuck or only the orchestrator?
- Which waits are runtime-only vs real obligations/deadlines?
- Which semantic operations already committed despite runtime failure?
- Which effects are pending/unknown?
- Which execution revision produced this scheduling decision?
- Did a replay/fork create new business work or only recover old work?

# Handoff to #63 — composition/modules

Workflow definitions, connector adapters, domain processes and UI authoring should be packageable/versioned without a `Pack` semantic primitive.

Potential separation:

```text
domain ontology module
orchestration definition/module
runtime backend adapter
connector/effect capability module
UI/BPMN projection
```

# Handoff to #53 — agent operating model

Agent loops are durable executions when they wait/retry/span failures, but agent memory is not business state.

Required:

- task/grant references survive recovery;
- agent reauthorization at semantic operation boundaries;
- subagent executions explicitly derive/narrow authority;
- model/tool retry does not duplicate Actions/Effects;
- human-in-loop input remains #45/#42 evidence;
- agent execution completion does not prove external outcome.

# Handoff to #70 — primitive reduction

Compare at least:

### M-O1 — `Workflow`/`Process` engine-native semantic primitive
### M-O2 — domain Process/Commitment only when meaningful + generic durable runtime
### M-O3 — no Process primitive; Actions/Events/state + generic durable runtime

Attack M-O2 on mapping complexity/convention drift. Attack M-O3 on long-lived obligations/process identity and REA/manufacturing scenarios. Attack M-O1 on BPMN/runtime leakage, backend migration and multiple-execution-per-process cases.

Current strongest runtime architecture: **generic durable execution boundary separate from ontology semantics**. Semantic Process/Commitment remains unresolved.
