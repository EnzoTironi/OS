# W0 runtime baseline

## Goal

Map the production-shaped runtime, CI, journeys, Fly image, projection, effects, and open PR frontier. Recommend the smallest vertical pilot that fixes a real failure.

## Scope

Read `deploy/fly`, `.github/workflows`, `e2e`, `scripts`, the `apps/zoend` binaries, manifests, and GitHub PR metadata. Do not edit files or change branches.

## Acceptance

- Trace boot through `/ready`.
- Compare built and supervised processes.
- Compare registered journeys and CI jobs.
- Classify all open PRs.
- Recommend one pilot with observable acceptance criteria.
- Estimate the track's work units.

## Verify

Use `rg`, code reads, and `gh pr` read operations. Report exact paths, symbols, PR numbers, and commands.

## Report

Return the explorer template sections. End with Pilot recommendation and Unit estimate.
