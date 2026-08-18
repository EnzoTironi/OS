# ADR-0013: Architecture laws become executable conformance properties

**Status:** Accepted for Architecture v0; inherited by V1 and strengthened by ADR-0021  
**Date:** 2026-08-18

## Context

The disposable prototype repeatedly produced green nominal suites while independent adversarial review found safety holes: foreign-namespace commit, false stale detection, malformed temporal coverage, delegated-scope escalation, partial writes, mutable installed definitions and incomplete lineage. The most valuable output was not the patches; it was the generalized law extracted from each failure.

## Decision

Zoen treats semantic laws as executable conformance properties independent of internal module layout. A stable semantic seam is tested end-to-end; the old Python `apply/query/explain` shape remains evidence for a deep seam, not a literal production API commitment.

Every material semantic bug or adversarial counterexample is generalized into a permanent property, state-machine test, mutation test or equivalent verification artifact. Tests target observable laws rather than implementation names.

ADR-0021 additionally requires production-shaped E2E proof before a V1 capability can be considered complete. This ADR defines *what semantic laws must be falsifiable*; ADR-0021 defines *what real system path must prove them*.

## Invariants

- CI green is not sufficient when the property set omits the attack.
- New implementations survive adversarial properties for identity, authority, time, stale revalidation, atomic writes, durable replay, effects, ontology evolution, tenant isolation and explanation lineage.
- Mutants deliberately weakening a required law are killed by the conformance suite.
- Domain extensions are tested for absence of domain-to-kernel leakage.
- Public behavior is verified across the deepest available semantic seam; internal helper structure is not a contract.
- A mock-only success cannot replace the production E2E required by ADR-0021.

## Consequences

The Python prototype is deleted, but its discovered failures remain requirements for the Rust conformance suite and V1 Specs. Future agent swarms attack properties, not preserve old test-file structure. Every new semantic production incident should produce a generalized law whenever possible.

## Evidence

- Issues #46, #51 and #83.
- Independent FAIL/PASS cycles across PRs #169, #179, #181, #183 and #184.
- PR #183 received a narrow independent PASS and later review discovered additional high-severity variants, illustrating why laws must be broader than named regression cases.

## Revisit if

Verification cost becomes disproportionate for low-risk presentation-only behavior. Semantic authority, security, durability, evolution, effect and tenant-isolation paths remain subject to this decision.
