# Current state, projections, ledgers, and reconstructability

**Track:** foundation  
**Issue:** [#12](https://github.com/EnzoTironi/OS/issues/12)  
**Wave:** A  
**Fetched:** 2026-08-16  
**Decision:** mixed. See [candidate-laws.md](candidate-laws.md).  
**Scope:** this folder only. Does not edit RFC-0001 or `docs/open-questions.md`.

This note answers issue #12 for a later synthesis agent. It is evidence, not architecture.

## Question

When is current state a primary fact, and when should it be a projection over durable facts or events?

The issue also asks whether pure event sourcing is required. The working guess in the issue text is that it is not.

## Falsifiable claim tested this session

> Every operational current value is only a projection. OS therefore needs a pure event-sourced kernel in which the event store is the sole system of record and current objects are disposable working copies.

**Verdict:** rejected as a kernel requirement. Reconstructability is required. A single storage style is not.

## How to read this folder

| File | Owns |
| --- | --- |
| [sources.md](sources.md) | URLs and pages fetched this session |
| [evidence.md](evidence.md) | Labeled observations from those pages |
| [taxonomy.md](taxonomy.md) | `observed`, `asserted`, `committed`, `derived`, `cached/materialized` |
| [candidate-laws.md](candidate-laws.md) | Smallest claims, counterexamples, runtime pressure, decision state |
| [open-questions.md](open-questions.md) | What this session did not settle |

Each evidence block is tagged as one of:

- domain evidence
- source-system artifact
- candidate law
- counterexample
- runtime consequence

Decision state is one of `hypothesis`, `supported`, `rejected`, or `undetermined`. Nothing here is silently accepted.

## Contract map

Until issue #74 lands, this folder follows the Agent output contract in `docs/swarm-research-backlog.md`.

1. Question. This file.
2. Sources. [sources.md](sources.md).
3. Evidence. [evidence.md](evidence.md).
4. Source artifacts. Marked inside [evidence.md](evidence.md).
5. Convergence and divergence. [evidence.md](evidence.md) and [candidate-laws.md](candidate-laws.md).
6. Candidate laws. [candidate-laws.md](candidate-laws.md).
7. Counterexamples. [candidate-laws.md](candidate-laws.md).
8. Runtime pressure. [candidate-laws.md](candidate-laws.md). Wave B must not treat these as toolchain picks.
9. Open questions. [open-questions.md](open-questions.md).
10. Decision state. Per claim in [candidate-laws.md](candidate-laws.md).

## What later agents should not do

- Do not copy ERPNext, Odoo, or other copyleft implementation into OS.
- Do not promote a cache, materialization, or index into a domain primitive.
- Do not write answers into `docs/open-questions.md` from this folder.
- Do not treat RFC-0001 Fact/Event wording as settled by this note.

## Licensing

OS is MIT. ERPNext and Odoo are copyleft corpora. This folder records documented behavior and public concepts only.
