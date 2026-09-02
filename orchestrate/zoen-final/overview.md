# Zoen final program

The approved target is documented in `docs/product/zoen-final-architecture.md` and `docs/product/show-me-zoen-final.html`.

This file records durable program facts. `units.tsv` and `ledger.tsv` own current state. `status.md` is generated.

## Inputs

- Repository: `EnzoTironi/OS`
- Local checkout: `/home/box/code/OS`
- Products: Ontology, Eve, Better Auth
- Deployment: one Fly app before launch
- Browser assets: authenticated Better Auth session and two authenticated Telegram accounts

## Initial tracks

- Runtime truth and journeys
- World kernel and authority
- Identity, Eve, and channels
- Agent surfaces and distribution
- Integration, verification, and landing

## Done predicate

The program is done when all conditions below are true.

1. The production-shaped image passes eight registered journeys. The channel journey includes the web session, WhatsApp, Telegram A, and Telegram B.
2. Every behavioral unit has a `live-ui-verified` or journey-equivalent verdict for its current head SHA.
3. Rust checks, TypeScript checks, architecture locks, migrations, the image build, and the required CI gate pass from one revision.
4. The Fly runtime supervises Auth, Eve, Postgres, MinIO, Restate, projection, the effect dispatcher, and the production `ZoenEffect` handler. `/ready` proves their product dependencies.
5. CLI, Connect, MCP, and Eve use one governed World catalog. The same Action produces the same policy decision, receipt, and explanation.
6. The repository has no legacy `/channels/*`, shared `unbound` workbench, global Eve user credential, boot policy authority, provider branch in the generic engine, or Postgres conversation source of truth.
7. Every one of the 20 PRs open at program start has a recorded disposition. Every landed PR has a current ledger verdict.
8. A final cross-model security, correctness, and maintainability review has no unresolved release blocker.
9. The exact production-shaped artifact that passes the release journeys is deployed. The user granted standing merge and deploy authorization on 2026-09-01.

## Initial size

- Program units: 44 total. Wave 0 completed four read-only units. Forty implementation and release units remain.
- Expected delivery: five tracks over eight waves.
- Expected stacks: runtime, world authority, identity and Eve, agent surfaces, and integration.
- Expected effort: several engineering days with a rolling window of three active workers on this machine.
- Landing rule: stop opening new work near 70 percent of the program budget and integrate every verified unit already in flight.

## Baseline

- Main revision: `d530f622141149f564a22e2f03051c34690426f4`
- Repository files outside generated dependencies: 464
- Existing journey directories: 16
- Existing SQL migrations: 25
- Open pull requests: 20
- Graphite frontier: unavailable from the current `main` checkout. An integration unit must recover stack metadata in an isolated worktree before it changes any PR.
