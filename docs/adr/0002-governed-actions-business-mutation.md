# ADR-0002: Governed Actions are the business mutation seam

**Status:** Accepted for Architecture v0  
**Date:** 2026-08-18

## Context

Enterprise users think in business verbs, not generic CRUD. Agent access becomes dangerous when an AI receives raw database or vendor APIs that bypass the same rules humans use.

## Decision

Meaningful business interventions are represented as governed `Action`s. A human UI, agent, API client, automation or workflow addresses the same Action definition and the same authority path.

The runtime protocol distinguishes proposal/preview, approval, revalidation, local commit and observed outcome. `Action` is not an occurrence, an approval is not a commit, and a local commit is not proof that an external effect happened.

Source ingestion, reconciliation, ontology administration and projection maintenance may use separate universal runtime operations where they are not business interventions; those paths must still obey the applicable semantic invariants and may not become write backdoors.

## Invariants

- Agents do not get a privileged mutation path.
- Business state is not changed by arbitrary UI callbacks, SQL or connector calls.
- Approval is evaluated against an explicit proposal and state basis.
- Commit revalidates the assumptions that matter before mutation.
- One semantic Action should drive human, API and agent surfaces rather than duplicate business implementations.

## Consequences

Action discovery becomes a core agent capability. UI controls and generated tools bind to Action references rather than embedding business logic.

## Evidence

- Issues #7, #44, #53 and #57.
- PR #182 demonstrates human and agent committing the same `action.reserve-inventory` under different workloads.
- V-001/V-002 experiments distinguished denied, committed, replayed and stale/replanned operations.

## Revisit if

A legitimate business mutation class cannot be represented as an Action or another explicit universal write class without meaningless ceremony or loss of safety.
