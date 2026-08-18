# ADR-0003: Evidence, claims and organizational belief remain distinct

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Real organizations receive incompatible observations from ERPs, spreadsheets, sensors, messages and people. Overwriting disagreement destroys information; treating every retrieved document as truth makes agents unsafe.

## Decision

Zoen preserves evidence and claims with provenance instead of collapsing them into a single mutable value. Organizational belief or an Action's accepted operational basis is a separate governed interpretation of that evidence.

Corrections append, supersede or explicitly relate to prior statements; they do not silently rewrite history. Better domain modeling should eliminate false conflicts such as requested date versus promised date, but irreducible disagreement remains representable.

## Invariants

- Source evidence is not automatically accepted state.
- Confidence is not authority.
- Rival statements may coexist.
- Provenance is part of meaning when decisions depend on source or derivation.
- Company Brain retrieval never promotes text or model output directly into authoritative organizational state.
- Corrections preserve the original evidence and the correction relationship where legally possible.

## Consequences

Queries may return a value together with supporting, rival, excluded and corrected evidence. Ingestion is a proposal/evidence boundary, not schema replication into the ontology.

## Evidence

- Issues #4, #6, #45 and #60.
- V-001 preserved competing inventory claims.
- PR #174 preserved independent sensor and inspector claims in the quality domain.
- PR #182 models a return as a new correcting claim rather than rewriting the original shipment claim.

## Revisit if

A simpler information model preserves disagreement, provenance, historical correction and safe decision authority across the production vertical without recreating these distinctions implicitly.
