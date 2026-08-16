# Source study — external effects, retries, and reconciliation

**Issue:** #41  
**Retrieved/rechecked:** 2026-08-16  
**Decision:** source observations only; architecture remains `undetermined`.

# 1. Temporal — durable orchestration does not remove external idempotency requirements

Primary/current official sources:

- Temporal documentation: <https://docs.temporal.io/>
- Temporal Platform Hub AI patterns: <https://go.temporal.io/platform-hub/ai-engineering/ai-patterns>

## E-EFF-TEMP-01 — Activities have at-least-once execution semantics

Temporal's current official AI patterns explicitly state that Activities have at-least-once execution semantics and may run again if an Activity fails mid-execution/retries.

**Pressure:** any write-side Activity/tool/connector must tolerate repeated execution or use a stable remote idempotency/reconciliation contract.

## E-EFF-TEMP-02 — write-side Activities should be idempotent

The same current official pattern recommends idempotency keys for side-effecting tools such as sending email, executing trades, or modifying records, while read-side tools are naturally safer to retry.

**Pressure:** durable orchestration can own scheduling/retry but cannot infer the external system's exactly-once semantics.

## E-EFF-TEMP-03 — durable history records completed Activity results

Temporal's platform documentation emphasizes durable workflow state/history and resumption from the last successful step rather than restarting from scratch.

**Pressure:** orchestration state and remote business state are separate. A recorded Activity result is evidence about the Activity execution; the semantic interpretation of remote success still depends on the protocol.

## E-EFF-TEMP-04 — retry policy is error-class specific

Official patterns distinguish retryable errors (for example rate limits with retry-after) from non-retryable errors such as invalid/content-policy requests.

**Pressure:** connector retryability is a semantic/protocol decision, not `catch Exception -> retry`.

# 2. Debezium Outbox — local state + durable publication intent, not remote exactly-once

Primary source:

- Outbox Event Router stable docs: <https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html>

## E-EFF-DBZ-01 — outbox pattern targets inconsistency between local state and emitted events

Debezium describes the outbox pattern as a way to safely/reliably exchange data while avoiding inconsistency between a service's internally persisted state and events consumed elsewhere.

**Pressure:** one local transaction can persist business mutation plus a durable event/effect-publication intent.

## E-EFF-DBZ-02 — outbox event has its own unique identity

The default outbox schema has an event `id`, `aggregateid`, `aggregatetype`, type and payload. The unique event ID can be used by consumers to remove duplicate messages.

**Pressure:** publication/effect message identity is separate from the aggregate/business object identity and can support dedupe.

## E-EFF-DBZ-03 — outbox ordering key is explicit and scoped

`aggregateid` becomes the message key in the default router and is important for maintaining correct order in Kafka partitions.

**Pressure:** ordering guarantee is physical/scoped (partition/key), not a universal total business order.

## E-EFF-DBZ-04 — outbox table is append/queue-like in the default pattern

Current docs expect outbox changes to be INSERT operations; UPDATE is treated as invalid behavior and DELETE is filtered by the SMT.

**Pressure:** immutable publication intent is a useful physical mechanism. It does not imply all business records/events are append-only.

## E-EFF-DBZ-05 — outbox event publication is not downstream business confirmation

Debezium transforms committed outbox rows into messages. Its guarantee concerns reliable exchange/publication from the local DB boundary. It cannot establish that a separate remote API/payment/ERP actually applied the business effect.

**Pressure:** `effect request published` and `remote effect confirmed` must remain distinct.

# 3. Stripe — request idempotency, asynchronous processing, webhooks, duplicate/out-of-order evidence

Primary/current official sources:

- PaymentIntent object/statuses: <https://docs.stripe.com/api/payment_intents/object>
- Payment lifecycle: <https://docs.stripe.com/payments/paymentintents/lifecycle>
- Webhooks: <https://docs.stripe.com/webhooks>
- Idempotent requests/API v1: <https://docs.stripe.com/api/idempotent_requests>
- API v2 idempotency overview: <https://docs.stripe.com/api-v2-overview>

## E-EFF-STRIPE-01 — accepted API interaction can precede final payment outcome

PaymentIntent has lifecycle states such as `processing`, `requires_action`, `requires_payment_method`, `canceled`, and `succeeded`. Some payment methods enter processing and complete later.

**Pressure:** a successful request/acknowledgement is not necessarily the terminal business outcome.

## E-EFF-STRIPE-02 — webhooks are the recommended asynchronous outcome channel

Stripe recommends using webhooks to monitor PaymentIntent state rather than relying on a client/UI path to determine payment success.

**Pressure:** remote outcome can be observed asynchronously after the initiating request completes.

## E-EFF-STRIPE-03 — webhook delivery is at-least-once-like evidence: duplicates can occur

Stripe's webhook docs explicitly warn that endpoints can occasionally receive the same event more than once and recommend logging processed event IDs.

**Pressure:** webhook/event-delivery identity must be deduplicated; duplicate message ≠ duplicate business effect.

## E-EFF-STRIPE-04 — webhook event ordering is not guaranteed

Stripe explicitly says it does not guarantee delivery order and recommends retrieving current API state when event ordering matters.

**Pressure:** arrival order cannot be used as authoritative business order without protocol/source sequence semantics.

## E-EFF-STRIPE-05 — automatic webhook retries have a delivery window

Stripe retries webhook delivery automatically for up to three days in live mode with exponential backoff.

**Pressure:** absence of a webhook at one moment is not evidence of failure; connector/reconciliation should tolerate delayed delivery and use read-back when necessary.

## E-EFF-STRIPE-06 — idempotency scope/window is protocol-specific

Current Stripe v1/v2 define different replay/idempotency semantics. Same idempotency key only protects according to those documented scopes/windows/request-equivalence rules.

**Pressure:** OS cannot assume a stable key provides permanent remote dedupe. Effect-level retry policy must know the remote protocol contract.

# 4. Palantir — action webhooks expose ordering and split-brain risks explicitly

Primary/current official sources:

- Webhook rules in Actions: <https://www.palantir.com/docs/foundry/action-types/webhook-rule>
- Action side effects overview: <https://www.palantir.com/docs/foundry/action-types/side-effects-overview>
- Action metrics/failures: <https://www.palantir.com/docs/foundry/action-types/action-metrics>
- Branching Actions external-call behavior: <https://www.palantir.com/docs/foundry/action-types/branching-action-types>

## E-EFF-PAL-01 — writeback and side effect are intentionally different orderings

Palantir supports writeback webhooks that run before Ontology edits and side-effect webhooks that run after edits.

**Pressure:** ordering between local authoritative mutation and remote request is an explicit architecture choice with different failure semantics.

## E-EFF-PAL-02 — before-edit writeback can succeed remotely then fail locally

Current docs explicitly warn that if a writeback webhook is successfully sent and later action edits fail, the external system is modified while the Ontology changes are rolled back.

**Pressure:** `remote success + local failure` is not theoretical. If the external system is authority, reconciliation/import may be required; if local system was meant to lead, compensation/recovery is required.

## E-EFF-PAL-03 — after-edit side effect can fail after local action work

Action metrics classify webhook/side-effect failure separately. Side effects are external integrations after or around ontology decision flows.

**Pressure:** local decision commit and remote side-effect delivery need separate outcome/audit semantics.

## E-EFF-PAL-04 — external calls on test/branch environments are dangerous precisely because they are real

Palantir disables action webhooks/functions with external calls by default on branches, and warns that enabling them can still hit production external systems.

**Pressure:** runtime effect capability/security boundary matters independently of ontology state. Testing/replay must not accidentally re-execute production external effects.

# 5. Brazilian fiscal authorization — external legal authority

Internal primary-source-backed research:

- `research/domain/fiscal/current-law-2026-review.md`
- `research/domain/fiscal/candidate-laws.md`

## E-EFF-FISC-01 — local payload/request is not external authorization outcome

For NF-e-family flows requiring authorization, generating/signing/sending the payload is distinct from external authorization of use. Contingency adds alternative legal/temporal paths.

**Pressure:** a connector cannot mark the fiscal outcome successful merely because transmission completed.

## E-EFF-FISC-02 — protocol/evidence can be legally authoritative

Authorization/protocol returned by the fiscal authority is external evidence with legal meaning the local runtime does not invent.

**Pressure:** external authority may own the terminal semantic outcome. OS records/correlates/reconciles it.

# 6. Wave A + #40 + #45 pressure

## E-EFF-OS-01 — local commit can itself be outcome-indeterminate

#40 established `CommitOutcomeIndeterminate` for the local authoritative transaction. If the same local commit may have created an EffectRequest, caller retry must first reconcile the **local operation** before deciding whether a new effect should exist.

## E-EFF-OS-02 — remote observations use source/evidence semantics from #45

Webhook/CDC/read-back are captured evidence with source identity/provenance. Correlation and source authority determine whether they confirm an effect outcome.

## E-EFF-OS-03 — retry identity is not necessarily Action identity

One local Action can request multiple effects (payment, notification, ERP writeback). Each effect needs an identity that survives its transport attempts; using only the parent Action ID cannot distinguish/reconcile siblings.

## E-EFF-OS-04 — compensation is a new governed operation after confirmed effect

Once a payment/order/fiscal action happened in the external world, reversing/canceling it requires a new operation under the domain/remote protocol. It is not local transaction rollback.

# 7. Convergence matrix

| Pressure | Temporal | Debezium Outbox | Stripe | Palantir | Fiscal | #40/#45 |
| --- | --- | --- | --- | --- | --- | --- |
| stable effect/attempt identity | workflow/activity ids + app key | event id | idempotency/event ids | webhook/action context | protocol/access key | required |
| retries may duplicate execution | strong Activity pressure | delivery consumer must dedupe | webhook duplicates + API replay | webhook failures/retry mechanisms | protocol-specific | strong |
| local commit != remote success | yes | **central** | yes | **explicit** | **explicit** | required |
| async acceptance != final outcome | common | n/a | **strong** | possible external systems | possible | required |
| remote observation can arrive later | Activity result/signal | downstream consumer | **webhooks** | source sync/readback | protocol response/events | #45 |
| message/event order can differ | workflow ordering per history | partition-key scoped | **not globally guaranteed** | source/protocol dependent | protocol dependent | must not assume |
| idempotency window/scope matters | app/remote contract | event id consumer logic | **strong** | remote API dependent | protocol dependent | #40 |
| external authority can define outcome | yes, Activity wraps it | downstream source | processor status | external source of truth | **legal authority** | #45 authority |
| compensation is new action | app/domain | app/domain | refunds/cancel etc | writeback/domain | legal cancellation/correction | required |

# 8. Main disagreements / lessons

## D-EFF-01 — outbox solves local causal durability, not remote exactly-once

The outbox pattern is excellent when the problem is `local DB commit + publish a durable instruction/event`. It does not solve `remote API applied once` by itself.

**Conclusion:** keep outbox as one physical mechanism under the effect contract, not the semantic definition of Effect.

## D-EFF-02 — Temporal retries are durable but can re-execute write-side Activities

Temporal removes orchestration fragility; it does not remove the remote protocol's need for idempotency.

**Conclusion:** orchestration retries and remote effect idempotency remain separate contracts.

## D-EFF-03 — webhooks are evidence, not a new occurrence by delivery count

Stripe duplicate/out-of-order webhook behavior is direct evidence.

**Conclusion:** process webhook identity/provenance via #45 and correlate to remote operation; do not append a second business effect for duplicate delivery.

## D-EFF-04 — write-before-local and write-after-local each have irreducible failure modes

Palantir demonstrates both arrangements. Before-local can produce remote-success/local-failure. After-local can produce local-success/remote-failure.

**Conclusion:** there is no ordering that magically creates atomicity across independent systems. Select authority/ordering per operation and reconcile the exposed failure mode.

## D-EFF-05 — one generic `Succeeded/Failed` enum is insufficient

Stripe asynchronous states, fiscal external authorization, Palantir writeback ordering, and unknown transports all expose different dimensions.

**Conclusion:** generic runtime should preserve attempt/acknowledgement/outcome knowledge evidence; domain/protocol defines meaningful outcome states.

# 9. Source-study conclusion

The independent sources converge on this boundary:

```text
local authoritative decision
  -> durable effect request / remote-operation identity
  -> one or more attempts
  -> transport/request acknowledgement evidence
  -> protocol-specific remote outcome
  -> later observations/readback
  -> reconciliation / confirmation / dispute
```

Neither durable workflow history, transactional outbox, HTTP success, webhook arrival, nor idempotency key alone proves the intended remote business effect happened exactly once.
