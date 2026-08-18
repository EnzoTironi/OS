# ADR-0013: Architecture laws become executable conformance properties

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

The disposable prototype repeatedly produced green nominal suites while independent adversarial review found safety holes: foreign-namespace commit, false stale detection, malformed temporal coverage, delegated-scope escalation, partial writes, mutable installed definitions and incomplete lineage. The most valuable output was not the patches; it was the generalized law extracted from each failure.

## Decision

Architecture v0 treats semantic laws as executable conformance properties independent of internal module layout. A stable public semantic seam is tested end-to-end; the old `apply/query/explain` shape is evidence for a deep seam, not a literal production API commitment.

Every material semantic bug or adversarial counterexample must be generalized into a permanent property, state-machine test, mutation test or equivalent verification artifact. Tests should target observable laws rather than implementation names.

## Invariants

- CI green is not sufficient when the property set omits the attack.
- New implementations must survive adversarial properties for identity, authority, time, stale revalidation, atomic writes, durable replay, effects, ontology evolution and explanation lineage.
- Mutants deliberately weakening a required law should be killed by the conformance suite.
- Domain extensions must be tested for absence of domain-to-kernel leakage.
- Public behavior is verified across the deepest available seam; internal helper structure is not a contract.

## Consequences

The Python prototype itself is deleted, but its discovered failures remain as requirements for the Rust conformance suite and Specs. Future agent swarms should attack properties, not preserve old test-file structure.

## Evidence

- Issues #46, #51 and #83.
- Independent FAIL/PASS cycles across PRs #169, #179, #181, #183 and #184.
- PR #183 received a narrow independent PASS and then later review discovered additional high-severity variants, illustrating why laws must be broader than named regression cases.

## Revisit if

The verification cost becomes disproportionate for low-risk surfaces; the semantic authority path itself remains subject to this decision.
