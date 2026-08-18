# ADR-0007: External effects remain uncertain until reconciled

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

External systems can accept a request while the caller times out. Treating timeout as failure creates duplicate orders, payments or physical operations; treating local commit as remote success invents reality.

## Decision

Local Action commit may create one or more durable `EffectRequest`s. Effect execution is a separate runtime capability. Attempts and observations update knowledge about the external effect through explicit records and reconciliation; they do not retroactively redefine the local Action commit.

The effect state model must represent ambiguity, including an `unknown` class. Blind retry is forbidden when the prior attempt may have succeeded and the connector cannot prove a retry safe. Reconciliation may later confirm, refute or otherwise resolve the external outcome from independent evidence.

## Invariants

- Local commit is not remote success.
- Timeout is not proof of failure.
- EffectRequest identity and intent are durable before execution.
- Retry policy depends on known delivery state and connector semantics.
- External evidence can reconcile an ambiguous attempt without duplicating the Action.
- Connectors never mutate semantic authority directly.

## Consequences

Effect workers and connectors are replaceable adapters. The semantic kernel owns EffectRequest and reconciliation contracts; vendor-specific delivery mechanics live outside it.

## Evidence

- Issues #7 and #41.
- V-001 and V-002 preserved `unknown`, rejected unsafe retry and reconciled later evidence to confirmed outcomes.
- PRs #178/#179 include EffectRequests in the same local durable commit as semantic records.

## Revisit if

A domain demonstrates external operations whose uncertainty cannot be represented by the effect/reconciliation protocol without inventing domain-specific kernel states.
