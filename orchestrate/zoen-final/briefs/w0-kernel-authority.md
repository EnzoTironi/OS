# W0 kernel and authority baseline

## Goal

Map definition, policy, query, evidence, Action, invitation, effect, computation, projection, and transaction boundaries against the approved `WorldRelease` design.

## Scope

Read `crates/zoen-core`, `crates/zoen-engine`, `crates/zoen-adapters`, `apps/zoend`, `proto`, and migrations. Do not edit files.

## Acceptance

- Trace publish and activation.
- Trace Query through pagination and Cedar.
- Trace Propose, approval, and Commit through Postgres.
- Trace invitations, evidence, effect reads, computation budgets, and projection.
- Classify fundamental types as keep, change, or delete.
- Separate pilot blockers from later architecture work.
- Produce a dependency graph of verifiable units.

## Verify

Use `rg` and source reads. Name exact paths and symbols. Distinguish live, journey-only, and dead code.

## Report

Return the explorer template sections. End with Unit graph and Pilot constraints.
