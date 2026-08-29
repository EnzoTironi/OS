# ADR-0022: Each company brings its own world; pre-modeled ERP packs leave the default product

**Status:** Accepted for V1  
**Date:** 2026-08-25  
**Supersedes:** ADR-0020 “V1 ships Party/Product/Commercial/…” library-shipping clause  
**Narrows:** ADR-0012 package location; ADR-0021 archived-proof slots

## Context

ADR-0020 required V1 to ship production-grade Party, Product, Commercial, Inventory, Procurement, Manufacturing, and Accounting Foundation libraries. ADR-0012 placed Surface IR in a live experience package. ADR-0021 required a production-shaped E2E proof for every advertised V1 capability.

That locked the repo into a prebuilt ERP. Companies do not share one Commercial world. Kitchen’s `derive.ts` still switches on `inventory` / `procurement` / `party` / `product`, so “Kitchen derives Pack capabilities from activated definitions” cannot be the reason those packs stay in default CI.

## Decision

Zoen is not a prebuilt SAP. Each company brings its own published definition. Pre-modeled ERP packs and the extra trees that only existed to run those packs leave the default workspace and CI. Git keeps them on the long-lived branch `archive/pre-modeled-erp`. Default `main` does not contain `archive/`.

### Still live

- `crates/*`, `apps/zoend`, `apps/whatsapp-companion`, `proto`, `wit`
- `packages/ontology` (compiler + lake fixture)
- `packages/mcp` (deferred; CLI/API first)
- `apps/conversation` (Eve)

### Archive (`archive/pre-modeled-erp`)

- `archive/domain/` — Party, Product, Commercial, Inventory, Procurement, Manufacturing, Quality, Accounting Foundation, fiscal-brazil ontology, sample-company
- `archive/packages/` — surface, pack, kitchen, onboarding, attention, activation-metrics, effect-worker, workload-ingress
- `archive/apps/web`

Those trees are unpublished history. Checkout `archive/pre-modeled-erp` to read or run them. Default live `tsc -p tsconfig.json` does not include them.

### Live lake

Compiler and lake tests that need an OrderLine-shaped definition compile `packages/ontology/fixtures/commercial.zoen.ts`. That file is the source of truth. `scripts/check-commercial-lake.mjs` checks the lake itself and does not require `archive/domain/commercial`. Fly personal-lake publishes that fixture from `ZOEN_WORLD_DEFINITION_PATH`.

### Surface IR

ADR-0012’s law stands: presentation is not business truth; renderer replacement must not change ontology or Action semantics. The full `@zoen/surface` package lives on `archive/pre-modeled-erp`. Surface IR left the default tree. Live WhatsApp destination is Kapso `defineChannel` in Eve. Do not treat archived Surface as a second compiler.

### Fiscal adapters

ADR-0020’s provider ports stand. Fiscal HTTP adapters are not live product. Optional `just e2e fiscal-fault-matrix` runs on `archive/pre-modeled-erp`. Live vendors stay parked on #214.

### Kitchen

Kitchen is archived. It does not derive live Pack capabilities from arbitrary company definitions. Do not advertise that sentence as current product law.

## Default gates

`just verify` and GitHub `verify` run `scenario_table` class `live` only. Classes `archive`, `kind`, `scale`, and `credential` are optional. `scripts/check-domain-leakage.mjs` is in `run_lint` so a `commercial.*` kernel branch still fails default CI.

`just verify-v1` no longer requires archived ERP/web/pack/effects slots. KIND and scale evidence remain production-release slots; `just verify` does not produce them. `just verify-activation` keeps the live activation and public-surface slots.

## Invariants

- No Rust kernel branch identifies an ERP package.
- Shipping transport does not default to an ERP module.
- `product: true` roadmap rows name a live producer, or they flip.
- A listed ADR revisit still requires a new ADR.

## Evidence

- PR #399 archived the trees on `main`. The follow-up moved them onto `archive/pre-modeled-erp` and removed `archive/` from default `main`.
- Parent #324. Lock 2026-08-25.
- `packages/ontology/fixtures/commercial.zoen.ts` remains the live lake.

## Revisit if

Company worlds are only published definition revisions and local `just start` activates a digest instead of any archived `.zoen.ts`. Then delete remaining archive-branch consumers and keep one synthetic compiler fixture.
