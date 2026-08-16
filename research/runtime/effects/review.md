# Adversarial review — issue #41 external-effect semantics

**Date:** 2026-08-16  
**Disposition:** `review-clean` once the final CI passes; research remains non-normative.

This review attacks the draft effect contract after the source study, 70 scenarios, and executable toy model were written.

## Follow-up integration correction

The first merge of #41 included this review finding but left several primary artifacts on the older `RemoteOperationId` wording/model. The follow-up correction updates `README.md`, `effect-contract.md`, `candidate-laws.md`, `reference_model.py`, and `test_reference_model.py` so the reviewed conclusion is now mechanically consistent across the corpus:

```text
EffectRequestId                 mandatory local semantic identity
RemoteDedupOrCorrelationKey?   optional, protocol-defined, may exist before send
AttemptId                       mandatory per execution attempt
RemoteReceiptId?               optional provider-generated identity learned later
ObservationId                   independent #45 evidence identity
```

The executable tests now include a provider with **no pre-send remote key** and prove that local EffectRequest identity alone does not authorize replay after an indeterminate send.

## R-EFF-01 — a remote operation identifier is not universally available before send

**Draft failure:** the first model treated `RemoteOperationId` as if every provider exposed a stable remote identity/idempotency key before the first request.

That is false. Protocols differ materially:

1. some accept a client-generated idempotency/correlation key before send;
2. some return a provider request/job/transaction receipt only after acceptance;
3. some expose only a natural business key suitable for later lookup;
4. some expose no reliable correlation/idempotency identity at all after a lost response.

**Correction:** the reviewed model distinguishes:

```text
EffectRequestId                 mandatory local semantic identity
RemoteDedupOrCorrelationKey?   optional, protocol-defined, may exist before send
AttemptId                       mandatory per execution attempt
RemoteReceiptId?               optional provider-generated identity learned later
ObservationId                   independent #45 evidence identity
```

A local `EffectRequestId` does not magically create provider-side idempotence. When no usable remote key/receipt/read-back exists, a sent/no-response effect may remain genuinely indeterminate and unsafe to resend.

The corrected primary artifacts no longer require a universal `RemoteOperationId`; they explicitly model provider dedupe/correlation keys and receipts as optional protocol capabilities.

## R-EFF-02 — attempt evidence is cumulative, not `last attempt wins`

**Draft failure discovered by executable modeling:** if A1 was sent and lost its response, then A2 failed before send, assigning the state from A2 alone would incorrectly erase the uncertainty caused by A1.

**Correction:** attempt evidence accumulates conservatively:

- later `definitely-not-sent` does not erase an earlier `sent/no-response`;
- explicit async acceptance is stronger than later transport uncertainty;
- confirmed/partial remote effect evidence cannot be erased by a later failed attempt.

The effect knowledge projection is derived from the whole evidence set/connector semantics, not one mutable `last_status` field.

## R-EFF-03 — generic outcome knowledge must not pretend to be the provider state machine

The toy model converts incompatible authoritative generic terminal claims into `CONTRADICTED`. That is intentionally conservative.

It does **not** mean every provider sequence such as:

```text
payment succeeded -> later chargeback/reversal
listing active -> later manually paused
order accepted -> later canceled
```

is an epistemic contradiction. Those can be distinct legitimate domain occurrences/states when the connector/domain ontology understands their semantics and chronology.

`CONTRADICTED` means only:

> the generic effect layer has received claims it cannot safely collapse using its protocol-independent vocabulary.

The connector/domain adapter must interpret the richer lifecycle rather than let the generic layer invent it.

## R-EFF-04 — definitive rejection is not universally `never retry`

The toy `can_retry_same_remote_operation()` deliberately refuses automatic retry after `CONFIRMED_REJECTED`.

This is a **generic safety default**, not a law that no rejected remote operation can ever be tried again.

Examples:

- permanent schema/business validation rejection may require a revised/new EffectRequest;
- a provider may classify a rejection as transient while preserving the same semantic effect request;
- rate limit/service-unavailable is usually attempt/retry scheduling evidence, not a terminal business rejection at all.

The connector/operation contract decides whether another Attempt belongs to the same EffectRequest or whether the changed intent requires reproposal/new effect identity.

## R-EFF-05 — a privileged runtime effect capability is not automatically a metamodel primitive

The research strongly supports a generic runtime boundary for:

```text
network egress
credentials/secrets
capability allowlisting
protocol versioning
rate limits/timeouts
attempt evidence
retry hooks
reconciliation hooks
production-vs-test environment protection
```

But that does not imply `Effect`/`EffectType` must be a root semantic kind.

The current strongest competitor remains:

```text
ordinary typed domain/operational records + Actions/Links
                 │
                 ▼
privileged generic runtime effect capability
```

#47 must test which execution/security facilities truly require engine-native enforcement. #70 must separately decide whether the **business semantic representation** needs an Effect primitive.

## R-EFF-06 — local-first/outbox is a mechanism, not the universal effect architecture

Transactional outbox is strong when local state is authority and durable later execution is acceptable. It does not dominate cases where:

- the remote system is the primary authority and must be changed first;
- a legal/external authorization must be obtained before local state can legitimately advance;
- a coordinated distributed protocol exists;
- the operation is read-only/observational rather than a write effect.

Likewise remote-first is not globally superior. Palantir's documented before/after webhook orderings provide production evidence that either ordering exposes a different split-brain failure.

**Surviving law:** choose ordering per authority/protocol semantics and make the remaining failure mode reconcilable.

## R-EFF-07 — effect outcome knowledge and business-world chronology are separate

A later observation can improve or correct what OS knows without rewriting the evidence from an earlier timeout, acceptance, or provider response.

Reconciliation is therefore epistemic/operational:

```text
new evidence -> better supported interpretation/projection of the same remote operation
```

not:

```text
new evidence -> delete prior attempt/observation and manufacture a cleaner history
```

This mirrors #45's separation of evidence from business occurrence and #40's separation of commit result knowledge from durable state.

# Primary-source factual recheck

The reviewed claims are grounded in current first-party sources:

- Temporal current patterns explicitly treat Activities as at-least-once and recommend idempotency for write-side tools.
- Debezium Outbox atomically connects committed local database state to a durable outbox event/publication path; the event ID supports downstream duplicate handling, but the pattern does not prove the eventual remote business effect occurred.
- Stripe PaymentIntent has asynchronous states such as `processing`; webhook delivery can duplicate and arrive out of order, so provider event identity/read-back matter.
- Palantir currently supports writeback webhooks before Ontology edits and side-effect webhooks after; its docs explicitly warn of external-success/local-edit-failure in the former ordering.
- Brazil fiscal research shows transmission/request and external authorization-of-use are distinct legal stages for applicable DF-e flows.

# Surviving contract after review

```text
LocalOperation O
  -> EffectRequest E (mandatory local identity)
       -> optional pre-send remote dedupe/correlation key
       -> Attempts A1..An
            -> optional provider receipt ids learned later
       -> #45 Observations
       -> connector/domain reconciliation
       -> scoped knowledge of protocol-specific business outcome
```

No reviewed evidence yet requires `Effect` as a base ontology primitive. The evidence **does** require that external I/O/retry/credential execution not be an ungoverned side channel around the semantic operation model.
