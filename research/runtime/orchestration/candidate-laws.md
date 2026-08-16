# Candidate laws — durable execution and orchestration

**Issue:** #43  
**Status:** falsifiable Wave B hypotheses. `supported` means scoped evidence is strong, not accepted metamodel.

## L-ORCH-01 — business semantic state and orchestration execution state are distinct state spaces

**State:** `supported`.

Runtime cursor/token/history can coordinate business work but cannot by itself establish domain truth.

## L-ORCH-02 — orchestration identity and business process/subject identity must be separable

**State:** `supported`.

One domain process/commitment can span replacement runs/executions; one execution can coordinate several domain subjects.

**Evidence:** Temporal Workflow/Run distinction and Continue-As-New; Step Functions continuation; DBOS fork; Camunda migration.

## L-ORCH-03 — execution run/epoch identity can change without changing domain identity

**State:** `supported`.

History rollover, fork, redrive or backend migration can create a new execution epoch while the business subject remains the same.

## L-ORCH-04 — runtime execution history is not automatically business Event history

**State:** `supported`.

`TimerFired`, task scheduled/completed, replay markers, token movement and workflow completion have runtime meaning. Only separately modeled/correlated/authorized occurrences become domain Events.

## L-ORCH-05 — deterministic replay is a runtime correctness property, not proof the business world is deterministic

**State:** `supported`.

Replay reconstructs program state from recorded results. External facts/actions still cross #45/#40/#41 boundaries.

## L-ORCH-06 — runtime step completion does not universally imply #40 Action commit

**State:** `supported`.

A step can compute, route, invoke a remote effect, or call a semantic commit. Completion semantics depend on the step contract.

## L-ORCH-07 — runtime Activity/Task retry is distinct from semantic operation retry

**State:** `supported`.

Workflow retry policy cannot mint a new semantic decision or override #40 retry/reproposal rules.

## L-ORCH-08 — runtime retry does not establish remote effect retry safety

**State:** `supported`.

External writes require stable #41 EffectRequest identity, typed attempt evidence and provider-specific idempotency/reconciliation.

**Evidence:** Temporal Activity retry pressure; DBOS external Steps at-least-once; Restate Saga idempotency guidance.

## L-ORCH-09 — durable timer firing is a wake-up fact, not universal domain deadline breach

**State:** `supported`.

The timer can fire after the underlying obligation was fulfilled or deadline changed. Domain state must be rechecked under its declared basis.

## L-ORCH-10 — runtime timer identity and business deadline identity are distinct

**State:** `supported`.

One deadline can cause multiple timer registrations across migrations/retries; one timer can trigger reevaluation of several conditions.

## L-ORCH-11 — external signal/message delivery is source/runtime input evidence, not universal business Event

**State:** `supported`.

Inbound data inherits #45 identity, correlation, dedupe, grain and authority semantics.

## L-ORCH-12 — signal receive order is not universal business chronology

**State:** `supported`.

Queueing/buffering/retry semantics vary by backend. Source/provider sequence or domain time determines chronology where relevant.

## L-ORCH-13 — duplicate runtime input must not duplicate semantic operation

**State:** `supported`.

At-least-once external-event/message delivery can awaken execution more than once; stable observation/operation IDs and commit dedupe protect the business transition.

## L-ORCH-14 — human-task completion and business Approval are distinct

**State:** `supported`.

Human interaction is input. #42 identity/delegation/SoD and #40 proposal/approval basis determine whether a governed Approval exists.

## L-ORCH-15 — long waits cannot rely on a durable copy of an interactive session's permissions

**State:** `supported`.

Long-running execution persists authority references/evidence; #42 determines current vs vested controls at later commit/effect attempts.

## L-ORCH-16 — runtime worker/service identity is not sufficient business authority

**State:** `supported`.

Recovery onto another worker/deployment cannot grant the represented actor new business permissions.

## L-ORCH-17 — runtime definition revision and ontology revision are independent

**State:** `supported`.

Execution-code compatibility and domain-semantic compatibility solve different problems and require distinct revision identity.

## L-ORCH-18 — policy/grant/connector revisions are also independent from orchestration definition revision

**State:** `supported`.

A long-lived execution can cross policy, credential, connector and ontology changes without changing workflow code.

## L-ORCH-19 — live execution migration is a runtime-memory operation unless explicit domain semantics say otherwise

**State:** `supported`.

Mapping an active BPMN element or switching worker version does not rewrite historical domain Actions/Events.

## L-ORCH-20 — runtime cancellation is not universal domain cancellation

**State:** `supported`.

Stopping future scheduling cannot erase already committed #40 operations or #41 effects.

## L-ORCH-21 — compensation/reversal after committed outcome is a new governed operation

**State:** `supported` by #41 and reinforced here.

Orchestrator saga logic schedules compensation; it does not rollback independent business history.

## L-ORCH-22 — workflow execution success is not universal business process completion

**State:** `supported`.

Business completion must be derived/committed from domain obligations/state/effect evidence, not engine terminal status alone.

## L-ORCH-23 — workflow execution failure is not universal business process failure

**State:** `supported`.

The real-world process may continue manually/externally; another execution can repair/replace coordination.

## L-ORCH-24 — external-world progress can occur while orchestration is down

**State:** `supported`.

Recovery must ingest/reconcile authoritative current evidence before assuming pending work still needs to happen.

## L-ORCH-25 — runtime serialization cannot replace #40 cross-object concurrency/invariant enforcement

**State:** `supported`.

One serialized workflow/key does not protect invariants spanning multiple executions/resources unless all competing transitions share the same proven serialization domain.

## L-ORCH-26 — repair/fork/redrive must preserve semantic operation identity for copied work

**State:** `supported`.

A new execution attempt/epoch may reuse prior committed semantic results. It must not manufacture fresh Action/Effect IDs for work already performed.

## L-ORCH-27 — execution-history retention and business/audit retention are independent policies

**State:** `supported`.

Runtime compaction/Continue-As-New/archive can be valid without deleting domain evidence that requires longer retention; conversely not every runtime event must live forever.

## L-ORCH-28 — a generic durable execution capability is strongly supported

**State:** `supported` as runtime capability pressure.

Independent mature systems converge on durable identity/state, waits/timers, recovery, messages, retries, versioning and operational visibility.

## L-ORCH-29 — no inspected evidence earns `Workflow` as a universal business semantic primitive

**State:** `not-earned` / `hypothesis`, not rejection.

Runtime workflow concepts vary substantially and can currently be kept outside base ontology semantics.

## L-ORCH-30 — a domain `Process`/`Commitment` concept may still be necessary independently of workflow runtime

**State:** `hypothesis`.

REA/ValueFlows and real fulfillment/manufacturing/obligation scenarios create pressure for independently identified planned/actual processes and commitments. #70 must test whether these reduce to Objects/Links/Actions/Events or deserve stronger semantic status.

# Explicit non-laws

The following are rejected as universal claims:

- `workflow instance = business process`;
- `workflow id = order/case/commitment id`;
- `workflow history = business event ledger`;
- `workflow completed = business completed`;
- `workflow failed = business failed`;
- `Activity completed = Action committed`;
- `Activity retry = safe effect retry`;
- `deterministic replay = deterministic world`;
- `timer fired = deadline breached`;
- `Wait state timestamp = canonical business deadline`;
- `signal received = business Event`;
- `signal payload = authoritative fact`;
- `human task completed = approved`;
- `runtime assignee = authorized approver`;
- `worker credential = represented principal authority`;
- `workflow definition version = ontology revision`;
- `BPMN migration = domain migration`;
- `workflow cancellation = business rollback`;
- `saga compensation = history deletion`;
- `one serialized workflow = all domain invariants safe`;
- `Step Functions exactly-once workflow = arbitrary remote effects exactly once`;
- `DBOS exactly-once transaction = external step exactly once`;
- `Restate/Temporal journal = provider idempotency`;
- `Continue-As-New/new execution = new business process`;
- `execution history must be retained forever`;
- `Workflow has been proven a base semantic primitive`.
