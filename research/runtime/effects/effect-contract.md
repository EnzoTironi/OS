# Candidate external-effect contract

**Issue:** #41  
**Status:** Wave B hypothesis.  
**Goal:** define what OS must preserve when it asks an external system/world authority to perform or report a change.

The names below describe semantic jobs, not required metamodel sorts.

# 1. Separate local decision, external request, and observed outcome

A local committed Action answers:

> OS decided/committed that this external interaction should be attempted under these parameters and authority.

It does not answer:

> the external system definitely performed the intended business change.

A useful causal chain is:

```text
LocalOperation O committed
    │
    ├─ EffectRequest E1
    ├─ EffectRequest E2
    │
    ▼
EffectRequest E
  target capability/protocol
  intent/payload identity
  remote operation identity/idempotency contract
  authority/credential scope
  expected outcome semantics
  reconciliation strategy
    │
    ├─ Attempt A1
    ├─ Attempt A2
    └─ ...
         │
         ▼
External system/world
         │
         ▼
Outcome observations / receipts / callbacks / read-back
         │
         ▼
Reconciliation judgment / projection
```

# 2. Identities

## 2.1 LocalOperationId

Comes from #40. It identifies one local semantic business operation and survives physical local transaction retries.

One local operation can produce zero, one, or many effect requests.

## 2.2 EffectRequestId

Identifies one requested causal interaction with one external capability/operation semantics.

Examples:

```text
create supplier PO in ERP
capture payment
set marketplace listing price
send notification
request NF-e authorization
```

Two effects with identical payloads can still be distinct intentional operations if they have different EffectRequestIds.

## 2.3 RemoteOperationId / idempotency identity

The stable identity used to dedupe/retrieve the **remote** operation under the remote protocol.

It may be:

```text
client-generated idempotency key
remote request id
business-natural key
fiscal document/access key
provider transaction/reference id
connector-generated stable key
```

It is not necessarily equal to EffectRequestId. A mapping between them must remain stable and auditable.

## 2.4 AttemptId

Each actual connector/network/protocol execution attempt has its own identity.

Attempt evidence can include:

```text
request digest / method / target
remote idempotency key used
credential/capability revision
started/finished timestamps
transport response/status/headers
remote request id returned
network/timeout/error evidence
```

Retry creates another AttemptId under the same EffectRequestId when semantics say it is the same remote operation.

## 2.5 ObservationId

Webhook, CDC, polling result, response document, signed protocol, bank statement or manual reconciliation evidence has its own #45 source-evidence identity.

One remote operation can generate many observations; one observation can sometimes describe several remote/business effects.

# 3. Effect request semantics

An EffectRequest should carry enough meaning to prevent an executor from treating arbitrary network calls as equivalent.

Conceptually:

```text
EffectRequest {
  effectRequestId
  parentLocalOperationId
  targetCapabilityRevision
  operationKind
  intent/parameter digest
  remoteOperationIdentityContract
  credential/delegation requirement
  retryPolicyClass
  expectedOutcomeDefinition
  reconciliationStrategy
  expiry/deadline/cancellation semantics
}
```

This does not require one persisted record/object. Equivalent durable evidence is sufficient.

## 3.1 Target capability, not raw URL, is the semantic boundary

A connector should expose an operation such as:

```text
Marketplace.SetListingPrice
Bank.InitiateTransfer
ERP.CreatePurchaseOrder
FiscalAuthority.RequestAuthorization
Email.SendMessage
```

rather than letting domain Actions execute arbitrary HTTP/network code directly.

The capability contract specifies:

- input/output schemas;
- idempotency support and window;
- synchronous vs async acknowledgement;
- authoritative read-back/reconciliation operations;
- timeout semantics where known;
- partial-success possibilities;
- credentials/scopes;
- rate limits;
- remote API/version semantics.

# 4. Attempt evidence and transport knowledge

A connector attempt should not be reduced to `success/failure`.

Candidate transport/acknowledgement evidence includes:

```text
NotStarted
DefinitelyNotSent
SentNoResponse
ResponseReceived(status, body, headers)
AcceptedAsync(remote_request_id)
RejectedBeforeProcessing(remote_evidence)
TransportIndeterminate(reason)
```

These labels are examples. Exact protocols expose different guarantees.

## 4.1 `ResponseReceived` is not final business success

HTTP 200/201/202 can mean:

```text
operation completed
request accepted and queued
remote object created but downstream processing pending
validation only
provider-specific partial result
```

The connector's protocol semantics decide which.

## 4.2 `SentNoResponse` is not final business failure

The remote system may have committed before the response was lost. The executor must use remote idempotency/read-back/reconciliation rather than assume failure.

## 4.3 Timeout semantics differ by connector/protocol

Some client errors prove no request was sent. Some prove only response deadline expired. Some remote protocols can return an operation ID before final completion. Generic retry policy must consume typed connector evidence rather than raw exception classes alone.

# 5. Outcome semantics

Do not impose one terminal enum across payments, marketplace listings, fiscal authorization, ERP writeback and email.

A useful generic distinction is **knowledge about the outcome**, while the actual outcome state is protocol/domain-specific.

## 5.1 Confirmed outcome

There is authoritative/adequate evidence that a named remote business outcome occurred.

Examples:

```text
PaymentIntent succeeded
remote PO exists with remote id R and expected contents
listing price read-back equals requested value under source authority
NF-e authorization protocol confirms authorization of use
email provider confirms message accepted for delivery  // only provider acceptance, not human reading
```

The wording must match the evidence. Do not claim more than the remote system actually guarantees.

## 5.2 Confirmed no-effect / rejection

Only use when evidence proves the intended remote effect did not occur under the operation contract.

Examples:

```text
remote validation rejected before mutation
provider lookup confirms idempotency key has no operation after a protocol-defined final window
fiscal authority returned definitive rejection for the submitted document
```

A transport timeout alone rarely establishes this.

## 5.3 Accepted/pending

Remote authority acknowledged the operation but the target business outcome is not final.

Examples:

```text
payment processing
job queued
async ERP import accepted
carrier pickup request accepted
```

This is neither `unknown` nor `succeeded`: acceptance is known; final outcome is pending.

## 5.4 Outcome indeterminate

OS cannot currently establish whether the intended remote business outcome happened.

Possible reasons:

```text
lost response after send
provider unavailable for read-back
idempotency window expired
webhook missing and API inconclusive
partial/unmodelled remote behavior
remote authority conflict
```

Indeterminate is an epistemic condition, not the remote system's business status.

## 5.5 Partial/contradicted/disputed outcome

Some protocols can partially mutate or later expose evidence inconsistent with earlier acknowledgement.

Generic runtime must preserve the evidence and route to operation-specific reconciliation. It should not force every connector to pretend atomic all-or-nothing semantics.

# 6. Retry decision table

Retry should be a function of **effect contract + attempt/outcome evidence**, not a generic loop.

## Case A — definitely not sent / definitive pre-effect rejection

A new attempt may be safe if:

- EffectRequest remains valid/not cancelled/expired;
- authority credentials remain valid;
- the failure is retryable under protocol semantics.

## Case B — known remote idempotency identity with adequate replay guarantee

Retry same EffectRequest using the **same remote operation identity**.

If provider returns the already-created result, treat as reconciliation/replay, not a second effect.

## Case C — sent/no response + provider offers authoritative lookup

Read/query by remote operation/idempotency/business key first. Retry only if lookup proves absence or same-key retry is contractually safe.

## Case D — sent/no response + no idempotency + no authoritative lookup

Remain indeterminate or escalate. Blind retry of a non-idempotent operation is unsafe when duplicate effect matters.

## Case E — accepted asynchronously

Do not resend just because final outcome is pending. Subscribe/poll/reconcile using returned remote operation identity.

## Case F — confirmed rejection

A new attempt may remain the same EffectRequest only if the operation contract says the rejection is transient and identical retry is meaningful. Materially changing parameters creates a new semantic effect request/reproposal.

## Case G — partial remote effect

Use protocol/domain-specific resume/reconcile/compensate semantics. Generic retry cannot assume the remote API will finish atomically.

# 7. Remote idempotency contract

An executor should know:

```text
which key/field identifies same remote operation?
what caller/account/endpoint/version scope applies?
what request fields must remain equivalent?
what response/result is replayed?
what failures consume or do not consume the key?
how long is the dedupe window?
what happens after expiry?
can the remote operation be queried by the key?
```

A stable EffectRequestId can derive/provide the remote idempotency key, but the runtime should store the actual remote-key mapping and provider contract revision.

## 7.1 Same remote key + different intent is unsafe

If a provider allows it, OS should still prevent accidental reuse of an EffectRequest/remote key for materially different intent unless the connector contract explicitly defines compatible mutation semantics.

## 7.2 Provider idempotency expiry can reopen duplication risk

If an effect remains unresolved beyond provider dedupe retention, retry can become unsafe. Reconciliation/business-key lookup or human/provider investigation may be required.

# 8. Correlation and observations

Inbound evidence is processed through #45.

Correlation can use:

```text
remote operation id
provider event id
idempotency key
business natural key
fiscal access key
local EffectRequestId propagated as metadata
causal parent/correlation id
```

A correlation relation should preserve assurance/provenance where not deterministic.

## 8.1 Duplicate observations

Same webhook/event delivery ID repeated:

- do not create another remote effect;
- preserve delivery attempts only if operationally useful;
- process the underlying provider event idempotently.

## 8.2 Out-of-order observations

Do not use receive time as business sequence unless protocol guarantees it. Query authoritative current state or use provider sequence/version where available.

## 8.3 Observation can confirm only what its authority covers

Example:

```text
provider webhook says PaymentIntent succeeded
```

may confirm processor status but not necessarily final bank settlement if those are distinct domain concepts.

# 9. Reconciliation

Reconciliation is a governed evidence-gathering procedure to answer:

> what external operation/outcome can OS now establish for EffectRequest E?

Strategies can include:

```text
provider GET/read-back by remote id
lookup by idempotency/business key
consume webhook/CDC/provider event
compare externally authoritative ledger/statement
verify signed/legal protocol
manual/provider support investigation
```

## 9.1 Reconciliation result should cite evidence

A transition from indeterminate/pending to confirmed should record which observation/receipt/query established it and under which connector/source authority revision.

## 9.2 Reconciliation can contradict earlier local assumptions

Example:

```text
local UI displayed "failed" after timeout
later provider read-back proves succeeded
```

The system must correct the **knowledge/projection**, not invent a second payment or rewrite the original timeout evidence.

## 9.3 Reconciliation is not always an Action

Purely ingesting authoritative provider evidence can update a derived remote-state projection without a human/agent decision. A human disposition/compensation choice is an Action; observation itself is not.

# 10. Cancellation and compensation

## 10.1 Cancel before first attempt

If EffectRequest is still local/not attempted and no remote effect exists, cancellation can prevent execution.

## 10.2 Cancel races with attempt

Cancellation must coordinate with the executor/remote protocol. If request may already have been sent, state can become indeterminate until reconciliation proves whether remote cancellation or original effect won.

## 10.3 Remote cancellation before terminal effect

If provider supports canceling an accepted/pending remote operation, cancellation itself is a remote operation/effect with its own attempt/outcome evidence.

## 10.4 Compensation after confirmed effect

Compensation/reversal is a **new semantic operation** caused by the prior outcome:

```text
refund PaymentIntent
cancel/return supplier order
restore marketplace price
cancel/correct fiscal document through legal operation
```

Preserve original effect and compensating causal chain.

# 11. Effect request creation and local commit ambiguity

If #40 local commit atomically includes EffectRequest E but the caller gets `CommitOutcomeIndeterminate`, the caller must not create E2/new local Action simply because no response arrived.

Recovery:

```text
reconcile LocalOperation O by its stable operation id
  if O committed and E exists -> resume/replay E execution safely
  if O definitely did not commit -> retry/reproposal O
  if local outcome remains indeterminate -> do not manufacture a second E
```

Executor should consume durable EffectRequests, not transient caller assumptions.

# 12. Local-first vs remote-first ordering

Two broad patterns have different failures.

## 12.1 Local-first

```text
commit local state + effect request
then execute remote effect
```

Failure mode:

```text
local committed, remote unresolved/failed
```

Requires durable retry/reconciliation and possibly compensation/local follow-up.

## 12.2 Remote-first

```text
perform remote effect
then commit local representation
```

Failure mode:

```text
remote changed, local commit failed
```

Requires ingest/reconciliation from external authority and maybe compensation.

Palantir's writeback/side-effect orderings are production evidence of both shapes.

## 12.3 No generic winner

Select ordering based on source of authority and business risk:

- if remote system is definitive authority and cannot reserve/prepare atomically, remote-first may be unavoidable;
- if local system owns the decision and remote effect can be retried idempotently, local-first/outbox is attractive;
- if both support coordinated transaction/prepare semantics, a stronger protocol can reduce some uncertainty at higher complexity.

This is a per-effect contract, not a global OS ordering law.

# 13. Security and capability boundary

An effect executor handles:

```text
network access
credentials/secrets
remote scopes
rate limits
protocol versions
sensitive payloads
```

Domain Functions should not gain arbitrary network/filesystem access merely because they need a side effect.

Strong hypothesis for #47:

> generic runtime should expose typed effect capabilities and execute them in a constrained effect boundary distinct from pure/deterministic Functions.

This is runtime security/effect typing pressure. It still does not prove `Effect` is a business ontology primitive.

# 14. Minimal runtime capabilities implied

If this contract survives, runtime needs:

1. durable effect request identity causally linked to local operation;
2. target capability/protocol revision;
3. stable remote operation/idempotency identity mapping;
4. separate transport attempts and attempt evidence;
5. retry policy driven by typed protocol outcome, not generic exceptions;
6. outcome knowledge that can remain pending/indeterminate;
7. correlation to #45 observations/webhooks/CDC/read-back;
8. reconciliation procedures and evidence;
9. duplicate/out-of-order observation handling;
10. cancellation/compensation as explicit operations;
11. constrained credential/network effect execution boundary;
12. observability across Action -> EffectRequest -> Attempt -> Observation -> Reconciliation;
13. no claim of remote success unless protocol/source authority evidence supports it.

# 15. Primitive reduction competitors

## M-E1 — native `Effect` semantic primitive

Action declares Effect definitions; engine creates request/attempt/outcome lifecycle natively.

**Benefit:** strong tooling/security/retry/observability.  
**Risk:** promotes one integration lifecycle into universal business ontology and may not fit source observations/external authorities cleanly.

## M-E2 — ordinary typed operational records + native runtime effect capability

Ontology/domain defines typed EffectRequest/remote-outcome records as ordinary Types/Links/Actions. Runtime gives a privileged, typed network/effect executor with generic identity/retry/reconciliation hooks.

**Benefit:** keeps business semantics compositional while still preventing arbitrary I/O and providing operational guarantees.  
**Risk:** conventions around effect request/outcome may drift unless interfaces/contracts are strong.

## M-E3 — generic event/message workflow only

Represent every effect stage as events/messages and use orchestration/reducers.

**Benefit:** minimal metamodel.  
**Risk:** can hide security capability, remote idempotency contract, authority and operation identity as conventions; event delivery may be mistaken for outcome.

### Current verdict

`M-E2` is the strongest working hypothesis. It is not selected. #47/#46/#70 should attempt to prove that native effect semantics are necessary, or that ordinary records + runtime capability are insufficient.
