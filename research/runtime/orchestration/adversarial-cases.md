# Adversarial cases — durable execution and orchestration

**Issue:** #43  
**Purpose:** falsify the candidate boundary between business semantics and execution memory.

A candidate backend/design should pass these without engine-specific business authority shortcuts.

## S-ORCH-01 — crash after authoritative commit, before runtime checkpoint

Execution requests #40 operation `O1`; O1 commits. Worker crashes before marking runtime step complete.

**Required:** recovery discovers/replays O1 by stable semantic ID; no second business mutation.

## S-ORCH-02 — crash before authoritative commit

Runtime step starts but process crashes before O1 reaches #40 commit.

**Required:** retry can safely attempt the same O1 under its basis/authority rules.

## S-ORCH-03 — local commit result indeterminate

Runtime gets no definitive response from #40 commit, but O1 may have committed.

**Required:** reconcile O1 by stable identity before deciding whether to execute again.

## S-ORCH-04 — write skew across two workflows

Two orchestration instances each see enough inventory and both try to reserve the last quantity.

**Required:** #40 aggregate/predicate concurrency rule prevents invalid combined commit. Per-workflow serialization is insufficient.

## S-ORCH-05 — two workflows fulfill same commitment

Automation and human-triggered execution race to mark Commitment C fulfilled.

**Required:** one permitted semantic transition wins/replays under #40; scheduler arrival order is not the business rule.

## S-ORCH-06 — workflow replay reruns orchestration function

Code-first runtime re-executes function body many times to reconstruct local state.

**Required:** replay does not generate new LocalOperationIds/EffectRequestIds.

## S-ORCH-07 — workflow step copied by fork

Operator forks execution from checkpoint after O1 already committed.

**Required:** copied checkpoint references/reuses O1 result; fork does not silently create O2 for identical already-completed semantic work.

## S-ORCH-08 — intentional fork creates new business operation

Operator forks precisely to make a second legitimate shipment.

**Required:** explicit policy creates new semantic operation/effect identity; dedupe does not suppress intentional new work.

## S-ORCH-09 — Continue-As-New/history rollover

Long execution rolls over into a new run/history epoch.

**Required:** domain Process/Commitment identity remains stable unless domain says otherwise; new run ID is operational.

## S-ORCH-10 — Step Functions-style new execution at service limit

Runtime must continue a year-long process by starting another execution.

**Required:** continuation does not create a new domain process merely because runtime execution ID changed.

## S-ORCH-11 — timer fires after obligation fulfilled

Timer set for 17:00. External fulfillment commits at 16:55. Timer fires at 17:00.

**Required:** wake rechecks C; no overdue/escalation Action.

## S-ORCH-12 — domain deadline extended but old timer remains

Deadline changes 17:00 -> 18:00. Old timer cannot be unscheduled in time.

**Required:** 17:00 wake is harmless; domain breach logic uses current/pinned deadline basis.

## S-ORCH-13 — timer fires late due outage

Runtime is down at 17:00 and resumes 17:20.

**Required:** preserve actual scheduling/wakeup evidence; domain rule decides whether breach occurred at 17:00, 17:20, or under another business-time contract.

## S-ORCH-14 — clock skew between timer service and domain timestamp source

Runtime clock differs from trusted business/legal time source.

**Required:** timer mechanics do not silently become authoritative timestamp of legal/business occurrence.

## S-ORCH-15 — duplicate timer delivery/wakeup

Backend wakes same timeout logic twice.

**Required:** same semantic escalation operation dedupes/revalidates; no duplicate penalty/escalation.

## S-ORCH-16 — signal arrives before wait subscription

Webhook/approval response arrives before execution reaches its wait.

**Required:** backend may buffer or OS may ingest first; later coordination correlates existing Observation instead of losing it or inventing a second Event.

## S-ORCH-17 — signal delivered twice

Same provider event/message is delivered twice.

**Required:** #45 observation identity/dedupe prevents duplicate business transition.

## S-ORCH-18 — two different signals contain same payload

Two independent physical counts both report `108`.

**Required:** equal payload does not dedupe independent evidence.

## S-ORCH-19 — out-of-order provider signals

Provider status `succeeded` then older `processing` webhook arrives.

**Required:** provider sequence/read-back semantics win; receive order does not regress domain state.

## S-ORCH-20 — uncorrelated signal matches wait name

A message named `Approved` targets wrong order/tenant but reaches matching engine event name.

**Required:** #45 correlation/tenant identity rejects/unbinds it; wait-name match is insufficient.

## S-ORCH-21 — LLM-generated signal payload hallucinates approval

Agent sends orchestration signal `approved=true` based on ambiguous chat text.

**Required:** signal can wake execution, but #42/#40 governed Approval remains absent until evidence/authority satisfy contract.

## S-ORCH-22 — user task marked complete by unauthorized user

Engine/API permits completion due misconfigured task assignment.

**Required:** business Approval commit fails #42 authority even if runtime UserTask is `COMPLETED`.

## S-ORCH-23 — authorized user completes task after proposal changed

Human was authorized but proposal amount/supplier changed after task was created.

**Required:** #40 approval basis mismatch causes reproposal/review; old runtime task completion is not sticky Approval.

## S-ORCH-24 — SoD violation via two runtime accounts sharing authority

Initiator and approver task identities are distinct usernames but resolve to same effective principal/grant source.

**Required:** #42 SoD evaluation rejects if independence rule fails.

## S-ORCH-25 — task grant expires during three-month wait

Agent/user grant valid when wait starts, expired at commit.

**Required:** #42 currentness/vesting contract decides; in-memory workflow session is irrelevant.

## S-ORCH-26 — authority vested but user session expired

Business rule vested authority at approved local commit before a later effect.

**Required:** effect may proceed under vested basis plus current non-waivable controls; expired browser session alone does not cancel it.

## S-ORCH-27 — emergency kill switch during wait

A pending effect has vested business authority but current emergency policy disables production transfers.

**Required:** #42/#41 current-at-attempt control blocks execution; workflow remains pending/escalated, not silently completed.

## S-ORCH-28 — worker identity changes after failover

Execution resumes on a different service workload.

**Required:** new workload authentication does not change represented business actor/grant semantics.

## S-ORCH-29 — subagent receives narrower grant

Parent agent starts child execution after its own task grant was narrowed.

**Required:** child authority is explicitly derived/re-authorized; workflow ancestry does not confer old scope.

## S-ORCH-30 — workflow code version changes while waiting

New deployment changes next step ordering.

**Required:** runtime uses pinned/version-compatible/migration strategy; no nondeterministic replay or silent semantic reinterpretation.

## S-ORCH-31 — ontology revision changes while workflow code stays same

Property/action semantics change in ontology while execution revision remains D1.

**Required:** next #40 operation explicitly binds compatible/pinned/current ontology semantics; workflow code version alone is insufficient.

## S-ORCH-32 — workflow code changes but ontology does not

Runtime bug fix changes orchestration route only.

**Required:** domain objects/history do not get new semantic revision merely because orchestration implementation changed.

## S-ORCH-33 — policy revision changes while execution definition stays same

Approval threshold changes from 50k to 30k.

**Required:** #42/#40 policy basis decides pending operation behavior independently of workflow revision.

## S-ORCH-34 — connector revision changes while effect pending

Provider API v1 -> v2 changes idempotency scope.

**Required:** #41 EffectRequest remains explainable under connector revision used; runtime deployment version does not hide protocol change.

## S-ORCH-35 — BPMN instance migrated to new definition

Active task A maps to task B in new process version.

**Required:** migration changes execution memory; prior Actions/Events/Approvals keep historical meaning and IDs.

## S-ORCH-36 — migration does not recreate active job

Engine keeps old job properties while process definition now differs.

**Required:** semantic operation generated from active job uses explicitly bound definition/operation contract; do not assume target diagram rewrote the existing job.

## S-ORCH-37 — migration intentionally changes business procedure

Regulation requires pending cases to adopt new process semantics.

**Required:** explicit domain/process migration policy maps pending commitments/proposals; engine migration alone is not sufficient evidence.

## S-ORCH-38 — old worker and new worker overlap

Both can poll work during deployment.

**Required:** runtime version fencing prevents incompatible execution; semantic commit still dedupes stable operation IDs.

## S-ORCH-39 — old execution history replayed in test environment

Developer replays production history locally.

**Required:** #47 effect capabilities fence production network/secrets; replay cannot send payment/email/fiscal request.

## S-ORCH-40 — workflow worker crashes after remote send

Effect E was sent; response lost; Activity not checkpointed.

**Required:** recovery finds E and #41 indeterminate evidence; no blind external retry based only on Activity failure.

## S-ORCH-41 — runtime retry policy says retry, provider idempotency window expired

Activity retry wakes days later.

**Required:** #41 refuses automatic resend when remote dedupe guarantee no longer applies.

## S-ORCH-42 — provider confirms effect while retry timer queued

Webhook/read-back confirms E before scheduled retry executes.

**Required:** retry wake sees E confirmed and becomes no-op/continues; does not resend.

## S-ORCH-43 — effect partial outcome

Remote batch operation partially succeeds.

**Required:** workflow cannot treat Activity exception as atomic failure; #41 item/outcome evidence drives resume/compensation.

## S-ORCH-44 — effect succeeded, workflow crashes before recording branch decision

Remote effect is confirmed via #41, runtime state stale.

**Required:** recovery derives next action from durable E knowledge; no duplicate effect.

## S-ORCH-45 — workflow completed while effect remains pending

Bug/definition reaches terminal success after sending async effect without awaiting reconciliation.

**Required:** runtime can be `COMPLETED`; domain process remains pending/unfulfilled if business completion requires effect confirmation. Surface inconsistency.

## S-ORCH-46 — workflow failed after business process already completed manually

Operator finishes fulfillment manually while execution later errors.

**Required:** execution failure does not reopen/mark business process failed; repair execution may be unnecessary.

## S-ORCH-47 — workflow canceled after committed payment

Operator stops orchestration after payment confirmed but before shipment.

**Required:** payment remains historical fact/effect; domain may require refund/fulfillment compensation Action.

## S-ORCH-48 — cancellation races an in-flight effect

Execution cancellation arrives while network send may already be in progress.

**Required:** runtime cancel cannot assert no-effect; #41 reconciliation determines remote outcome.

## S-ORCH-49 — runtime cancellation before any semantic operation

Execution is queued and canceled before work begins.

**Required:** no domain cancellation Event is invented unless the domain explicitly models cancellation of a real commitment/process.

## S-ORCH-50 — saga compensation fails

Workflow schedules refund after shipment failure, refund itself times out.

**Required:** original payment remains; compensation has independent #40/#41 identity/outcome and can remain indeterminate.

## S-ORCH-51 — orchestrator outage while supplier fulfills commitment

No workflow worker is running. Supplier delivery occurs and is ingested.

**Required:** on recovery, execution recognizes current fulfillment and skips obsolete reminder/escalation.

## S-ORCH-52 — orchestrator outage while deadline passes with no fulfillment

Runtime wakes much later.

**Required:** domain computes breach according to actual deadline/time semantics; runtime can schedule late escalation without pretending timer fired on time.

## S-ORCH-53 — manual external change conflicts with planned workflow branch

Human changes marketplace price directly while workflow waits to apply old price.

**Required:** #45 source observation/current basis triggers replan/no-op/conflict; runtime cursor cannot overwrite blindly.

## S-ORCH-54 — message correlated to two potential business subjects

Poor source identity makes callback ambiguous.

**Required:** #45 candidate relation remains unresolved; orchestrator cannot pick based on whichever instance is waiting.

## S-ORCH-55 — same business process has two orchestration instances after disaster recovery

Old instance returns after replacement execution started.

**Required:** semantic operation IDs/fencing/current coordinator policy prevent duplicate business transitions; existence of two runtimes is observable.

## S-ORCH-56 — one orchestration coordinates several orders

Batch replenishment workflow handles 50 purchase orders.

**Required:** orchestration identity does not merge 50 order/process identities.

## S-ORCH-57 — one order uses several orchestrations

Fraud review, fulfillment and notification are independent durable executions linked to same order.

**Required:** no requirement for one canonical workflow per business object.

## S-ORCH-58 — workflow run retention expires before legal audit retention

Engine history is deleted/archived after operational horizon; tax/payment evidence requires years.

**Required:** required domain/commit/effect evidence remains in authoritative/audit storage; business audit does not depend on runtime log retention.

## S-ORCH-59 — privacy erasure requires deleting orchestration payload

Runtime history contains personal data not needed for durable business audit.

**Required:** retention/redaction policy can minimize orchestration data without falsifying necessary domain evidence.

## S-ORCH-60 — history compaction loses internal timer events

Backend compacts old execution internals.

**Required:** continuation/recovery remains correct; domain history is unaffected unless those internal events were independently admitted as domain evidence.

## S-ORCH-61 — state machine choice re-evaluated on redrive

Runtime redrive reevaluates a Choice using changed external/current data.

**Required:** if choice must be frozen for business semantics, its basis/result is durable; if choice is live, changed result is explicit. Backend mechanics alone do not choose.

## S-ORCH-62 — deterministic replay code reads current database directly

Replay sees different data and branches differently.

**Required:** candidate backend/design forbids/encapsulates nondeterministic direct reads or records them as semantic/query steps with explicit basis.

## S-ORCH-63 — deterministic replay code reads current time directly

Replayed branch changes because wall clock advanced.

**Required:** runtime deterministic time/timer API or durable step; business legal time semantics remain separate.

## S-ORCH-64 — workflow execution result cached but business invariant later corrected

Execution says success; later entity-resolution split shows operation affected wrong party and corrective Action is required.

**Required:** workflow result remains historical execution result; domain correction/reclassification does not rewrite it into alternate history.

## S-ORCH-65 — child workflow canceled by parent-close policy

Parent execution ends and backend cancels child.

**Required:** child domain commitments/effects are not assumed canceled unless governed domain cancellation occurred.

## S-ORCH-66 — child workflow continues after parent failure

Backend policy lets child run independently.

**Required:** domain authority/causal relationship decides whether its future Actions remain valid; runtime orphanhood is not enough.

## S-ORCH-67 — execution scheduler duplicates start request

Same requested coordination instance start is delivered twice.

**Required:** orchestration start idempotency/policy prevents unintended duplicate coordinator or both instances are safely fenced at semantic commits.

## S-ORCH-68 — two intentional identical orchestration starts

Two separate customer cases happen to have identical inputs.

**Required:** payload equality does not dedupe distinct intended executions/processes.

## S-ORCH-69 — runtime backend migration Temporal -> another engine

Business process is mid-flight while organization replaces orchestration backend.

**Required:** new execution can reconstruct pending coordination from semantic state + explicit migration evidence; domain identities/revisions do not become Temporal-specific.

## S-ORCH-70 — no orchestrator at all for a short Action

Simple deterministic Action validates/commits immediately.

**Required:** architecture permits direct #40 execution without manufacturing a Workflow instance merely for uniformity.

# Coverage dimensions

Generated/property tests should vary:

```text
execution: initial / retry / replay / redrive / fork / migration / replacement
wait: timer / human / webhook / child / effect / domain predicate
input: early / late / duplicate / out-of-order / ambiguous / unauthorized
semantic op: unstarted / committed / known-abort / indeterminate / replayed
external effect: unattempted / pending / indeterminate / confirmed / partial / compensated
revision: execution / ontology / policy / grant / connector independently changed
authority: current / expired / vested / revoked / emergency-denied
world progress: orchestrator online / offline / stale / concurrent manual actor
retention: live history / compacted / archived / erased
```

Happy-path workflow completion alone is almost useless evidence for #43 correctness.
