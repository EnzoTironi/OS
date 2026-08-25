# Archived from the default workspace

These trees are on `main` for git history. They are outside the default npm workspace, TypeScript project, and CI.

## Live target tree

`crates/*`, `apps/zoend`, `apps/whatsapp-companion`, `proto`, `wit`, `packages/ontology`, `packages/sdk`, `packages/osdk`, `packages/harness`, `packages/speaker`, `packages/transport`. `packages/mcp` stays deferred (CLI/API first).

## What lives here

- `archive/domain/` — pre-modeled ERP packs and sample-company. Each company brings its own world.
- `archive/packages/` — surface, pack, kitchen, onboarding, attention, activation-metrics, effect-worker, workload-ingress.
- `archive/apps/web` — TanStack web app.

Live WhatsApp compiles `packages/ontology/fixtures/commercial.zoen.ts`. Transport owns `PresentationIntent` types and does not import the Surface compiler. Speaker debounce is local; attention is not on that path.

`archive/packages/effect-worker` stays out of npm workspaces. Default `tsc` still emits it so `just e2e explain` can start the Restate worker. KIND/web deploy scenarios are optional.

Do not add these folders back to `package.json` workspaces or the live `tsconfig.json` include. Optional adapter unit tests under `archive/domain/fiscal-brazil` use that package’s own `tsconfig.json`.
