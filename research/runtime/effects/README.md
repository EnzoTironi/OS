# External effects, retries, unknown outcomes, and reconciliation

- Artifact ID: `issue-0041-external-effects`
- Issue: <https://github.com/EnzoTironi/OS/issues/41>
- Track: Wave B runtime boundary research
- Date: 2026-08-16
- Base: Wave A + merged #45 ingest/entity-resolution + merged #40 transaction/commit semantics
- Decision: none. This folder defines an implementation-neutral **external-effect contract** and adversarial suite; it does not select Temporal, Debezium, Kafka, a connector SDK, webhook framework, or `Effect` as a metamodel primitive.

## Question

What exactly does OS know and guarantee when a committed business decision asks a system outside the local authoritative transaction to change the world?

The naive model is:

```text
call API -> 200 = success
call timeout -> failure -> retry
```

That model is unsafe.

A safer semantic decomposition is:

```text
LOCAL BUSINESS COMMIT
  Action/operation O commits
  and may create durable EffectRequest E
        │
        ▼
EFFECT EXECUTION
  stable local EffectRequestId E
  + provider dedupe/correlation identity only if protocol supports it
        │
        ├── Attempt A1
        │      request bytes / credentials / optional client key
        │      transport response or failure evidence
        │      optional receipt learned after send
        │
        ├── Attempt A2 ... only if protocol/reconciliation says safe
        │
        ▼
REMOTE SYSTEM
  may reject synchronously
  may accept request but process asynchronously
  may complete before caller receives response
  may partially apply
  may expose authoritative state later
  may expose no deterministic correlation identifier at all
        │
        ▼
OBSERVATIONS / RECONCILIATION
  webhook / CDC / API read-back / legal protocol / receipt
        │
        ▼
KNOWLEDGE OF REMOTE OUTCOME
  confirmed outcome
  confirmed no-effect/rejection when protocol proves it
  accepted-but-pending
  indeterminate/unresolved
  contradiction/dispute/partial outcome where domain supports it
```

`EffectRequest`, `Attempt`, remote dedupe/correlation identities, `OutcomeEvidence`, and `Reconciliation` are **research roles**, not primitive declarations.

## The key distinction: three things called “success”

A connector/runtime must not collapse:

1. **transport success** — a request/response exchange succeeded;
2. **request acceptance** — remote system accepted/scheduled the request;
3. **business/domain outcome** — the intended remote change actually reached the authoritative state required by the operation.

Examples:

- Stripe PaymentIntent can be `processing` after a request and only later become `succeeded`; payment status should be monitored by webhooks/read-back, not assumed from request submission.
- Palantir Action webhooks can run before or after Ontology edits, and current docs explicitly warn that a before-edit webhook may succeed while later Ontology edits fail.
- Debezium Outbox atomically relates a local transaction to a durable outbox event for later publication, but an outbox row/message is not evidence that a downstream remote business effect succeeded.
- Brazilian fiscal authorization is an external legal outcome: locally generating/sending a DF-e request is not the same as authorization of use.

## Model by orthogonal evidence, not one universal state machine

Different protocols expose different stages. Rather than force every connector through one enum, preserve independent axes where relevant:

```text
EffectRequest state
  planned / cancelled-before-attempt / eligible

Remote correlation capabilities
  optional client dedupe/correlation key before send
  optional receipt/transaction id after send
  optional business-key/read-back relation
  or no deterministic remote identifier

Attempt evidence
  attempt id, request digest, send/receive timestamps,
  credential/delegation context, transport result

Remote acknowledgement
  rejected-before-processing / accepted / queued / receipt-issued / absent

Authoritative domain outcome
  protocol-specific: payment succeeded, listing active,
  invoice authorized, order accepted, etc.

Outcome knowledge
  confirmed / confirmed-no-effect / pending / indeterminate / contradicted/disputed

Reconciliation evidence
  webhook, API read-back, CDC, remote receipt/protocol, human/legal evidence
```

A connector can project these into a simpler UI status, but the simplification must not destroy recovery semantics.

## Stable identities — and which ones are optional

Do not reuse one ID for everything merely for convenience.

Conceptually distinguish:

```text
LocalOperationId       // #40 semantic business commit; always local
EffectRequestId        // one causal remote effect requested by that commit; always local
RemoteDedupKey?        // provider/client key usable before send only when supported
AttemptId              // each network/client execution attempt
RemoteReceiptId?       // remote request/transaction/protocol identity, when returned
ObservationId          // webhook/CDC/readback evidence identity from #45
```

The critical correction from adversarial review is:

> a stable `EffectRequestId` does **not** imply the remote provider offers idempotency or even a stable remote operation identifier.

A provider may support a caller-supplied key, may return only a receipt after acceptance, may expose only a business-key lookup, or may expose no deterministic identifier. The runtime must represent that absence rather than fabricate exactly-once semantics.

One local Action can create zero, one, or several external effects. One effect can require several transport attempts. A remote system can later emit many observations about one requested effect.

## Retry is protocol-specific recovery, not a generic loop

A safe retry decision depends on what is known:

### Definitely not attempted / rejected before effect

If the connector can prove the request did not reach a mutation boundary, a new attempt may be safe under the same EffectRequest — even when the provider has no idempotency support.

### Stable provider idempotency contract

If the remote API accepts a stable client key and guarantees same-key retries are deduplicated for the required window/scope, retry can itself be the reconciliation technique.

`EffectRequestId` is not enough unless that identity, or a derived key, is actually transmitted under such a provider contract.

### Outcome indeterminate and non-idempotent

Query/read back by receipt/business key when possible before retry. If the remote system cannot answer and a duplicate would be harmful, remain unresolved/escalate rather than guess.

### Accepted asynchronously

Do not retry simply because final business success is not known. Poll/subscribe/reconcile using the returned receipt/operation identity when available, or whatever correlation mechanism the protocol supports.

### Partial remote outcome

Retry/compensation must be operation-specific. A generic engine cannot assume the remote operation is atomic.

## Local commit and effect request

#40 establishes that a local authoritative commit can atomically persist an effect intent/request as one possible outbox-style mechanism. Debezium Outbox is production evidence for that pattern: the application commits business state and an outbox row in one local database transaction; CDC publishes it later.

This gives a strong guarantee:

```text
if the local transaction committed,
there is durable evidence that effect E should eventually be handled
```

It does **not** give:

```text
remote effect E happened exactly once
```

The external executor still needs attempt history and whatever idempotency/correlation/reconciliation semantics the actual provider offers.

## Inbound observations reuse #45 semantics

A remote webhook, CDC record or API response is **evidence from the external source**, not automatically the final truth merely because it arrived after an effect request.

Correlation can establish:

```text
Observation W definitively refers to EffectRequest E by client key/receipt
```

or:

```text
Observation W is only a candidate relation to EffectRequest E
```

or remain unresolved when no adequate correlation evidence exists.

Authority then asks whether that source/statement is sufficient to confirm the target outcome.

Examples:

- payment processor webhook for PaymentIntent `pi_...` may be authoritative for processor status;
- marketplace CDC/listing API read-back may be authoritative for current listing status;
- a generic HTTP 202 response may only prove request acceptance;
- a duplicated webhook is duplicated evidence, not a second payment.

## Compensation, reversal, and cancellation

Do not use `rollback` for a remote effect that already happened unless the remote protocol literally supports atomic rollback before final commit.

Once a business effect happened:

```text
reverse payment
cancel fiscal document
return goods
cancel supplier order
restore previous listing price
```

are **new governed operations/effects** with their own authority, evidence and possible failure semantics.

Cancellation before attempt is different from cancellation racing an in-flight attempt, which is different from compensation after confirmed outcome.

## Temporal as a mechanism donor, not business authority

Temporal's current official patterns make write-side tool Activities idempotent because Activities have at-least-once execution semantics and can retry. Temporal also durably records Activity results so workflows resume rather than redoing already completed steps in normal replay.

This is useful execution machinery, but it does not make a non-idempotent external API exactly-once. The Activity/connector must still supply the remote operation's idempotency/reconciliation semantics where those exist.

## What this research refuses

```text
HTTP 2xx -> business effect confirmed
HTTP timeout -> business effect failed
webhook received -> new business event by default
same Action id -> same remote effect id for every effect
EffectRequestId -> provider idempotency automatically
every provider -> stable remote operation ID before first send
provider receipt -> final success
retry always creates a new business decision
retry is always safe with same payload
accepted async request -> final success
outbox published -> remote system changed
Temporal retry -> exactly-once external side effect
compensation -> database rollback of history
source writeback response -> authoritative current state forever
unknown outcome -> ordinary failure
local CommitOutcomeIndeterminate -> remote EffectOutcomeIndeterminate
```

## Files

| File | Purpose |
| --- | --- |
| [`source-study.md`](source-study.md) | Temporal, Debezium Outbox, Stripe, Palantir, Brazil fiscal + #40/#45 evidence |
| [`effect-contract.md`](effect-contract.md) | effect request/attempt/outcome/reconciliation/retry semantics |
| [`candidate-laws.md`](candidate-laws.md) | falsifiable external-effect laws |
| [`adversarial-cases.md`](adversarial-cases.md) | timeout, duplicate, async, partial, callback and compensation cases |
| [`reference_model.py`](reference_model.py) | executable semantic effect/reconciliation toy model |
| [`test_reference_model.py`](test_reference_model.py) | regression/litmus tests; not connector/runtime code |
| [`open-questions.md`](open-questions.md) | handoff to #42/#43/#47/#49/#70 |

## Primitive-reduction result

This research does **not** yet earn `Effect`/`EffectType` as an ontology root primitive.

Strongest current hypothesis:

- domain `Action`/operation commits a durable causal request/intention to interact with an external capability where needed;
- effect request, attempts, optional remote keys/receipts, observations and reconciliation are ordinary typed operational records/relationships;
- generic runtime has a **first-class effect execution boundary/capability** for security, credentials, retries, observability and network isolation;
- provider protocol explicitly declares whether remote dedupe/correlation/read-back guarantees exist;
- protocol/domain ontology defines what the remote outcome means and which evidence confirms it.

This distinction matters: a native runtime effect system may be justified without making `Effect` a universal business ontology sort. #47/#70 must attack that boundary.
