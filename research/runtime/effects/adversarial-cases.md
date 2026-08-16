# Adversarial cases — external effects and reconciliation

**Issue:** #41  
**Purpose:** falsify the external-effect contract before connector/orchestrator selection.

## S-EFF-01 — timeout after remote success

Connector sends payment request. Provider commits payment, response is lost.

**Required:** effect becomes indeterminate/pending reconciliation, not failed; retry only under provider idempotency/read-back contract.

## S-EFF-02 — timeout before request left client

Connector proves request never left local process/network boundary.

**Required:** same EffectRequest may create a new attempt if still valid. Do not pretend a remote effect exists.

## S-EFF-03 — provider returns async operation id

HTTP 202 returns remote job `R1`; job is still processing.

**Required:** record accepted/pending with R1; do not resend because final outcome is not yet known.

## S-EFF-04 — async operation later succeeds

Webhook/read-back says R1 succeeded.

**Required:** correlate observation to same EffectRequest; mark outcome confirmed with evidence.

## S-EFF-05 — async operation later fails

Remote accepted request then asynchronously rejects business operation.

**Required:** acceptance evidence remains; final outcome is rejected/failed according to protocol. Do not rewrite initial acceptance as transport failure.

## S-EFF-06 — duplicate webhook same provider event id

Stripe-like provider sends same event twice.

**Required:** duplicate deliveries do not create second remote effect or second domain occurrence.

## S-EFF-07 — different provider event ids describe same remote operation

Provider emits `processing` event then `succeeded` event for same payment.

**Required:** preserve both observations; correlate to one remote operation and derive latest/terminal knowledge according to provider semantics.

## S-EFF-08 — webhooks arrive out of order

`succeeded` arrives before delayed `processing`.

**Required:** do not regress business outcome using receive order. Use provider status/version/read-back rules.

## S-EFF-09 — webhook missing, authoritative GET succeeds

No callback arrives, but polling remote operation id reports succeeded.

**Required:** reconcile from read-back; webhook absence is not failure.

## S-EFF-10 — webhook says succeeded, later read-back contradicts

Provider event says succeeded but authoritative current query says reversed/canceled.

**Required:** preserve both observations and protocol/domain chronology; do not erase earlier success if reversal is a later outcome.

## S-EFF-11 — same remote idempotency key, same request after lost response

Provider contract guarantees replay/dedupe in window.

**Required:** retry same EffectRequest/key; provider result confirms/replays same remote operation, no duplicate effect.

## S-EFF-12 — same remote key, changed amount

Retry changes payment amount but reuses key.

**Required:** reject/reproposal locally; do not rely on provider mismatch behavior.

## S-EFF-13 — provider dedupe window expired while outcome unresolved

Old key is outside documented retention.

**Required:** do not blindly resend non-idempotent effect. Reconcile by business/remote key or escalate.

## S-EFF-14 — two intentional identical remote effects

User intentionally sends two R$100 payments to same beneficiary.

**Required:** different EffectRequestIds/remote operation identities permit both. Do not dedupe by payload equality.

## S-EFF-15 — one Action creates payment and notification

Both payloads causally belong to local operation O.

**Required:** separate EffectRequests E-pay and E-notify; payment retry cannot be confused with notification retry.

## S-EFF-16 — local commit succeeds, executor crashes before send

EffectRequest persisted atomically with local commit.

**Required:** durable pending request remains discoverable; later executor sends it once under stable remote identity.

## S-EFF-17 — local commit indeterminate but actually committed EffectRequest

Caller retries Action because response lost.

**Required:** #40 dedupe/reconciliation discovers original local operation/effect request; no E2 created.

## S-EFF-18 — local commit indeterminate and definitely did not commit

Later local reconciliation proves absence.

**Required:** Action may retry/reproposal according to #40; only then can a new/derived EffectRequest exist.

## S-EFF-19 — executor reads same pending EffectRequest twice concurrently

Two workers race to execute E.

**Required:** effect execution coordination/idempotency prevents two harmful remote operations; physical locking is implementation detail.

## S-EFF-20 — worker crashes after send before recording attempt result

Remote may have succeeded.

**Required:** subsequent worker uses stable effect/remote id and reconciliation before dangerous resend.

## S-EFF-21 — Temporal Activity retries write-side tool

Activity sends email/payment then fails after external call.

**Required:** write-side operation uses remote idempotency/reconciliation; Temporal retry alone cannot guarantee exactly once.

## S-EFF-22 — read-only Activity retries

Remote GET/search fails transiently then retries.

**Required:** retry is naturally safer; result is still a source observation with capture provenance.

## S-EFF-23 — local-first effect permanently rejected remotely

Local business Action committed and effect request is durable; remote API returns definitive permanent rejection.

**Required:** local commit remains history; effect outcome confirmed rejected; domain decides follow-up/reversal/case, not DB rollback fiction.

## S-EFF-24 — local-first remote outage for hours

Effect remains pending/unresolved through retries.

**Required:** durable request survives; retry cadence/rate limit applies; local state does not claim remote success.

## S-EFF-25 — remote-first succeeds, local commit fails

Writeback updates authoritative ERP, then local ontology transaction fails.

**Required:** remote success preserved; ingest/read-back reconciles local representation; compensation only if business contract requires it.

## S-EFF-26 — remote-first fails before mutation

External validation rejects; no local commit performed.

**Required:** confirmed no-effect/rejection; local system does not create committed representation of remote success.

## S-EFF-27 — Palantir-like writeback succeeds then local edits fail

**Required:** explicit divergence state/reconciliation path. No claim of distributed atomicity.

## S-EFF-28 — after-local notification fails

Core Action commit succeeds, email notification fails.

**Required:** operation can remain committed if notification is non-authoritative side effect; retry notification separately.

## S-EFF-29 — notification is a contractual precondition

Domain operation requires successful registered-delivery acceptance before a later state transition.

**Required:** model that requirement explicitly; do not assume all notifications are non-authoritative.

## S-EFF-30 — fiscal payload sent, response lost

NF-e-like request may have been authorized.

**Required:** query/reconcile using access key/protocol before resubmitting when legal/protocol semantics demand it.

## S-EFF-31 — fiscal authority definitively rejects

**Required:** local request evidence + authoritative rejection preserved. Changing fields and resubmitting is a new/revised request under fiscal/domain rules, not blind retry.

## S-EFF-32 — contingency path changes legal timing

Normal authority unavailable; legal contingency procedure used.

**Required:** effect contract can represent protocol-specific alternative path/outcome evidence; no one universal authorization state machine.

## S-EFF-33 — marketplace listing update returns 200 but async moderation later reverts

**Required:** 200 confirms request/initial processing only to extent protocol guarantees; current listing state reconciles from marketplace authority.

## S-EFF-34 — marketplace user manually changes price after OS effect

OS effect set 100; human changes to 110 remotely.

**Required:** #45 observation records new authoritative remote state; do not treat it as failed old effect or invent OS Action.

## S-EFF-35 — remote operation partially creates resources

Batch API creates 7 of 10 rows then returns error.

**Required:** partial outcome remains representable; reconcile created subset; retry strategy is operation-specific.

## S-EFF-36 — remote API says atomic batch

Provider contract guarantees all-or-nothing and returns definitive rejection.

**Required:** contract may simplify to confirmed no-effect; do not force partial-state machinery into every connector path.

## S-EFF-37 — rate limit with retry-after

Provider returns 429 with retry semantics.

**Required:** executor treats as retryable scheduling evidence, not business rejection.

## S-EFF-38 — invalid request 400

Payload violates remote schema and identical retry cannot help.

**Required:** no blind exponential retry; route to correction/reproposal depending contract.

## S-EFF-39 — credential expired before first attempt

**Required:** definitely no remote effect if connector can prove no send; refresh/re-authorize or fail according to policy.

## S-EFF-40 — credential revoked after remote accepted operation

**Required:** revocation may block future query/cancel but does not erase accepted remote operation. Reconciliation may need privileged/provider channel.

## S-EFF-41 — cancellation before send

EffectRequest is pending and executor has fenced it as not started.

**Required:** cancel prevents attempt; no compensation needed.

## S-EFF-42 — cancellation races send

Cancel and attempt start concurrently.

**Required:** one fenced/serializable execution state decides whether request was definitely unsent; otherwise outcome becomes in-flight/indeterminate until reconciled.

## S-EFF-43 — cancel accepted async remote operation

Provider supports remote cancel call.

**Required:** cancel itself has remote operation/attempt/outcome evidence. Original request remains history.

## S-EFF-44 — compensate confirmed payment

Payment succeeded; business now wants refund.

**Required:** refund is a new governed local operation + external effect; original payment remains confirmed.

## S-EFF-45 — compensation fails

Refund request is rejected/unknown.

**Required:** original effect does not revert to failed; compensation has its own outcome/reconciliation.

## S-EFF-46 — duplicate outbox message delivery

Same outbox event id reaches executor twice.

**Required:** event/effect id dedupe prevents duplicate remote operation; publication duplication is not business duplication.

## S-EFF-47 — outbox row committed but broker unavailable

**Required:** local commit/effect intent remains durable; CDC/router eventually publishes. Do not mark remote outcome pending solely based on broker state if execution has not started.

## S-EFF-48 — broker delivered, remote executor unavailable

**Required:** message delivery and remote attempt are separate stages; durable effect remains unexecuted/pending.

## S-EFF-49 — remote observation cannot be deterministically correlated

Webhook lacks operation id; only amount/time/name similarity links it to effect candidate.

**Required:** use #45 candidate relation/assurance; do not confirm exact effect outcome from fuzzy correlation automatically when risk requires exact match.

## S-EFF-50 — deterministic remote receipt correlation

Provider receipt includes exact client idempotency key/effect metadata.

**Required:** automatic exact correlation allowed; no needless human review.

## S-EFF-51 — provider status means processor success, not bank settlement

Payment processor marks operation `succeeded`; downstream settlement is separate domain concept.

**Required:** confirm only processor-payment outcome claimed by evidence; do not overstate final settlement.

## S-EFF-52 — email provider accepted message, user never read it

**Required:** `accepted for delivery` cannot be projected as `recipient read/acknowledged` unless separate evidence exists.

## S-EFF-53 — webhook signing verification fails

**Required:** capture evidence/quarantine; do not use unverified payload to confirm outcome.

## S-EFF-54 — webhook event already processed but payload redelivered with same id

**Required:** idempotent observation processing returns prior result/no duplicate transition.

## S-EFF-55 — remote state changed before OS effect executes

Effect intends set price=100, but remote user sets 90 before executor sends. Effect contract says unconditional set.

**Required:** remote result 100 can be confirmed; conflict with user's intervening intent is a business concurrency/authority question, not transport failure.

## S-EFF-56 — effect has remote precondition / ETag

Effect intends update only if remote version V remains current.

**Required:** connector sends remote conditional guard; precondition failure is definite no-effect and may require reproposal.

## S-EFF-57 — remote conditional request times out after send

**Required:** query remote version/result before retry; cannot assume guard prevented effect.

## S-EFF-58 — provider creates remote id only after success, response lost

No idempotency key/query-by-client-key exists.

**Required:** operation may remain indeterminate; generic runtime must support escalation rather than unsafe resend.

## S-EFF-59 — remote natural business key can reconcile

Provider lacks formal idempotency API but business object key is unique/queryable.

**Required:** connector may reconcile by natural key if domain/provider contract makes it safe; idempotency need not be one header mechanism.

## S-EFF-60 — effect request expires before attempt

Business instruction valid only until deadline; executor wakes after expiry.

**Required:** do not send stale request; mark expired/cancelled according to contract and require new local decision if needed.

## S-EFF-61 — attempt started before expiry, outcome arrives after expiry

**Required:** expiry of permission-to-start does not imply already-sent remote effect was canceled. Reconcile actual outcome.

## S-EFF-62 — remote API version changes idempotency semantics

Provider upgrades endpoint and dedupe window/request equivalence changes.

**Required:** EffectRequest pins/knows connector/protocol revision; retry cannot silently assume old guarantee.

## S-EFF-63 — replay test environment accidentally calls production remote

**Required:** effect capability/environment policy prevents workflow/history replay or branch test from re-executing real production effect unless explicitly enabled.

## S-EFF-64 — pure historical replay

System replays Action history for explanation/projection.

**Required:** no network effect is re-executed merely because historical record is replayed.

## S-EFF-65 — reconciliation observation arrives before local effect record visible

Distributed ingestion/order race: webhook lands before local read replica exposes EffectRequest.

**Required:** observation can remain unresolved and correlate later; do not drop or fabricate a new request.

## S-EFF-66 — two remote effects have same provider amount/time but different ids

**Required:** exact provider/operation identity distinguishes them; value similarity does not dedupe.

## S-EFF-67 — provider event describes several local effects

Batch settlement/ERP import result covers multiple submitted operations.

**Required:** one observation can correlate to multiple EffectRequests with explicit per-item outcome evidence.

## S-EFF-68 — one effect produces several authoritative observations

Payment success, fee posting and settlement statement arrive separately.

**Required:** preserve separate statement kinds; do not collapse them into one generic `EffectSucceeded` fact.

## S-EFF-69 — remote read-back itself times out

Initial effect is indeterminate; reconciliation GET also indeterminate.

**Required:** remain unresolved and schedule/escalate; reconciliation attempt failure is not outcome failure.

## S-EFF-70 — human/provider support confirms outcome

Automated APIs remain inconclusive; signed/provider support evidence confirms transaction.

**Required:** governed/manual evidence can resolve effect if source/authority contract permits, with provenance.

# Coverage dimensions

```text
ordering: local-first / remote-first / coordinated
remote protocol: sync / async / batch / conditional / legal authorization
attempt evidence: not-sent / response / lost-response / accepted-id
outcome knowledge: confirmed / no-effect / pending / indeterminate / partial / contradicted
idempotency: provider-key / natural-key / none / expired-window
observation: webhook / CDC / read-back / signed receipt / manual evidence
observation delivery: duplicate / out-of-order / delayed / missing / unverified
local commit: committed / definitely-aborted / indeterminate
cancellation: before-attempt / race / remote-cancel / compensation
security: valid credential / expired / revoked / wrong environment
correlation: exact / candidate/fuzzy / one-to-many / many-to-one
```

A connector design that only passes `POST returns 200` tests has not demonstrated safe effect semantics.
