# ADR-0001: Executable ontology and a generic semantic kernel

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Traditional enterprise systems spread business meaning across schemas, services, workflows, permissions, documents and human convention. The two-day research phase tested whether domain behavior could instead live in executable definitions over a small generic runtime. V-001 and V-002 showed materially different domains executing without adding domain identifiers to the experimental kernel; conventional baselines repeatedly reintroduced domain-shaped branches.

## Decision

Zoen is built around an executable ontology of the organization. Architecture v0 starts with the canonical semantic hypothesis:

`Type + Relation + Computation + Action`

This is a v0 kernel contract, not a claim that no future evidence can change it. Authoring surfaces may expose richer concepts such as Property, Link, Event, Policy, Interface or Approval when they reduce to the canonical semantics without hidden alternate engines.

The generic runtime contains universal mechanisms only. Products, invoices, inventory, Brazil, marketplaces, customers and company-specific workflows belong in definitions or domain libraries.

## Invariants

- No business/domain identifier may select a runtime branch.
- Physical storage and execution strategies may specialize without becoming semantic authority.
- A new enterprise domain should normally add definitions, not kernel code.
- A supposed primitive that can be safely expressed through already-required mechanisms should not be promoted into the kernel.

## Consequences

The implementation may be large, but the semantic core must remain small and difficult to simplify. Package, compiler, workflow and deployment concepts are not ontology primitives merely because implementation needs them.

## Evidence

- Issues #56, #156, #157 and #158.
- PR #174: second quality domain without kernel changes.
- PRs #176 and #177: conventional baselines expose domain coupling.
- PR #182: cross-cycle fixture on the same experimental kernel.

## Revisit if

- the Rust vertical requires repeated hidden dispatch by domain concept;
- a fifth canonical form becomes necessary for enforcement rather than authoring convenience;
- a well-designed conventional architecture matches the same semantic extensibility with materially less machinery.
