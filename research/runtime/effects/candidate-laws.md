# Candidate laws — external effects and reconciliation

**Issue:** #41  
**Status:** falsifiable Wave B hypotheses. `supported` means scoped evidence is strong, not accepted architecture.

## L-EFF-01 — local committed decision and remote business outcome are distinct facts

**State:** `supported`.

A local Action can validly commit an intention/request to affect an external system while the external outcome is pending, rejected, unknown, or later contradicted.

**Evidence:** Debezium outbox; Palantir webhook ordering; Stripe asynchronous payment lifecycle; fiscal external authorization.

## L-EFF-02 — one local operation may produce multiple independently reconcilable effects

**State:** `supported`.

Payment, ERP writeback, notification, fiscal submission, etc. can have different target systems/outcomes. Effect identity cannot universally equal parent Action identity.

## L-EFF-03 — local semantic effect identity survives transport retries; remote identity is protocol-dependent

**State:** `supported`.

Retries of the same requested external effect retain one stable local EffectRequestId. A provider-side dedupe/correlation key or receipt may also identify the remote operation **when the protocol actually supplies such semantics**, but it is not universal and need not exist before first send.

**Evidence:** Temporal at-least-once Activity execution; Stripe idempotency; asynchronous provider receipts; protocols without idempotency support.

## L-EFF-04 — attempt identity is distinct from effect identity

**State:** `supported`.

Several network/client attempts can correspond to one requested remote business operation; one lost response should not invent a second effect.

## L-EFF-05 — transport success is not universal business success

**State:** `supported`.

HTTP response/acknowledgement semantics depend on protocol. Async APIs can accept a request while final outcome remains pending.

**Evidence:** Stripe PaymentIntent `processing`; Palantir webhooks.

## L-EFF-06 — transport timeout is not universal business failure

**State:** `supported`.

Remote operation can succeed before caller receives response. Retry must consume the actual protocol/idempotency/read-back/reconciliation evidence available.

## L-EFF-07 — accepted/pending is distinct from indeterminate outcome

**State:** `supported`.

If remote system explicitly accepted the request — with or without a returned receipt/operation ID — request acceptance is known while final outcome may still be pending. That is stronger knowledge than `we do not know whether the request reached the remote mutation boundary`.

## L-EFF-08 — indeterminate remote outcome is an epistemic condition, not a domain status

**State:** `supported`.

`unknown/indeterminate` describes what OS can establish, not necessarily a status stored by the external system.

## L-EFF-09 — remote idempotency/correlation is optional, protocol-scoped, and revisioned

**State:** `supported`.

A provider may expose a pre-send idempotency key, a receipt only after acceptance, a business-key lookup, several of these, or none. Scope, request equivalence, retention window, supported methods, and replay behavior vary by provider/version.

**Evidence:** Stripe v1/v2 plus contrasting non-idempotent/receipt-driven protocols.

## L-EFF-10 — same provider dedupe/idempotency identity with materially different intent is unsafe

**State:** `supported`.

Where a remote dedupe identity exists, OS should reject/reproposal rather than silently rely on provider behavior when intent/payload materially changes.

## L-EFF-11 — provider idempotency expiry can reopen duplicate-effect risk

**State:** `supported`.

An unresolved operation beyond provider dedupe retention cannot be assumed safe to retry merely with the old key.

## L-EFF-12 — write-side durable orchestration still requires external idempotency/reconciliation

**State:** `supported`.

Temporal Activities can execute at least once/retry; durable workflow execution does not make a non-idempotent external API exactly-once.

## L-EFF-13 — transactional outbox provides local causal durability, not remote exactly-once

**State:** `supported`.

Outbox links local commit to durable publication intent/event; downstream application/outcome remains separately deduped/reconciled.

## L-EFF-14 — webhook/message duplicate is not duplicate business effect

**State:** `supported`.

Delivery identities must be deduped/correlated to the underlying provider event/requested effect where possible. Missing deterministic correlation remains an unresolved #45 relation rather than license to invent another effect.

**Evidence:** Stripe explicitly warns duplicate webhook events occur.

## L-EFF-15 — webhook arrival order is not universal business order

**State:** `supported`.

Receive time/order cannot define remote business chronology when provider does not guarantee event ordering.

**Evidence:** Stripe webhooks.

## L-EFF-16 — inbound effect observations inherit #45 evidence/provenance semantics

**State:** `supported`.

Webhook, CDC, API read-back, protocol receipt, statement, and manual investigation remain independently identified observations whose source authority and correlation assurance determine what they can confirm.

## L-EFF-17 — reconciliation result must cite outcome evidence

**State:** `supported`.

A transition from pending/indeterminate to confirmed should identify which authoritative/adequate observation/read-back/receipt established it.

## L-EFF-18 — external authority can own terminal outcome semantics

**State:** `supported`.

Examples: fiscal authority authorization, payment processor state, marketplace listing state. OS may own the decision/request while external source owns evidence of remote result.

## L-EFF-19 — local-first and remote-first orderings expose different unavoidable failure modes

**State:** `supported`.

Local-first can yield local-success/remote-failure; remote-first can yield remote-success/local-failure. Neither ordering creates atomicity across independent authorities.

**Evidence:** Palantir supports both before-edit writeback and after-edit side effects and documents the split-brain risks.

## L-EFF-20 — compensation/reversal after confirmed effect is a new governed operation

**State:** `supported`.

Once remote outcome happened, undoing its business meaning is not equivalent to rolling back uncommitted local state.

## L-EFF-21 — cancellation before attempt, cancellation in flight, and compensation after outcome are distinct

**State:** `supported`.

They have different race/evidence/protocol requirements.

## L-EFF-22 — partial remote outcome must remain representable where protocol/domain allows it

**State:** `supported` as capability pressure.

Generic engine cannot assume every remote operation is all-or-nothing.

## L-EFF-23 — effect retryability is typed protocol semantics, not generic exception policy

**State:** `supported`.

Rate limit, invalid request, definite rejection, lost response, asynchronous acceptance, provider outage, availability of dedupe key, and availability of authoritative read-back demand different recovery.

**Evidence:** Temporal current patterns; Stripe/provider semantics.

## L-EFF-24 — local `CommitOutcomeIndeterminate` and remote outcome indeterminacy are distinct reconciliation problems

**State:** `supported`.

Caller may be unsure whether EffectRequest was locally committed before even reasoning about the remote operation. Reconcile local operation first.

## L-EFF-25 — executor must not create a second effect because caller retried a locally indeterminate Action

**State:** `supported`.

Effect execution consumes durable local EffectRequest identity; caller transport failure is not authority to invent E2.

## L-EFF-26 — effect capability/security boundary is generic runtime pressure even if `Effect` is not an ontology primitive

**State:** `supported` as runtime pressure; exact design `hypothesis`.

Network/credentials/secrets/rate limits are materially different from pure Functions and should be mediated by typed capabilities rather than arbitrary I/O.

## L-EFF-27 — outcome confirmation must not claim more than evidence supports

**State:** `supported`.

Provider message acceptance, processor payment success, bank settlement, human receipt, and legal authorization can be distinct domain outcomes.

## L-EFF-28 — source manual changes can reconcile/diverge from effect requests without an OS Action causing them

**State:** `supported`.

External users/systems can change remote authoritative state independently; #45 observations capture that reality and reconciliation correlates it where possible.

## L-EFF-29 — effect execution can be cancelled locally only while the contract still establishes no remote outcome requiring separate reversal

**State:** `supported`.

A local queue flag cannot retroactively erase a request that may already be in flight.

## L-EFF-30 — no inspected evidence requires `Effect` as a base ontology sort

**State:** `hypothesis` / `not-earned`, not a rejection.

The semantic requirements currently compose from typed request/attempt/observation/outcome records plus runtime effect capability. #47/#70 must attempt to falsify that composition.

# Explicit non-laws

Rejected as universal claims:

- `HTTP 2xx = intended business outcome succeeded`;
- `HTTP timeout = intended business outcome failed`;
- `webhook = business Event`;
- `webhook count = effect count`;
- `webhook receive order = business event order`;
- `Temporal Activity retry = exactly-once external mutation`;
- `outbox event published = downstream remote operation succeeded`;
- `EffectRequestId = provider idempotency key`;
- `every external protocol exposes a stable remote operation ID before first send`;
- `provider receipt = final success`;
- `same payload = same effect`;
- `same parent Action = same effect`;
- `same idempotency key protects forever`;
- `accepted async = confirmed success`;
- `unknown = failed`;
- `retry is always safe`;
- `retry always requires a new business decision`;
- `remote compensation erases original history`;
- `local transaction rollback can undo an independent remote system`;
- `all remote-first architectures are wrong`;
- `all local-first/outbox architectures are right`;
- `EffectType has been proven a semantic primitive`.
