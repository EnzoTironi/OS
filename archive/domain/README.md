# Archived from the default workspace

These trees are on `main` for git history. They are unpublished history plus optional TypeScript projects. They are outside the default npm workspace and the live `tsconfig.json` include.

## Live target tree

`crates/*`, `apps/zoend`, `apps/whatsapp-companion`, `proto`, `wit`, `packages/ontology`, `packages/sdk`, `packages/osdk`, `packages/harness`, `packages/speaker`, `packages/transport`. `packages/mcp` stays deferred (CLI/API first).

## What lives here

- `archive/domain/` — pre-modeled ERP packs and sample-company. Each company brings its own world.
- `archive/packages/` — surface, pack, kitchen, onboarding, attention, activation-metrics, effect-worker, workload-ingress.
- `archive/apps/web` — TanStack web app.

Live WhatsApp compiles `packages/ontology/fixtures/commercial.zoen.ts` when a test or process passes that path. Transport owns `PresentationIntent` types and does not import the Surface compiler. Speaker debounce is local; attention is not on that path. `createWorldQueryClientFromEnv` does not default to the lake.

Optional scenarios compile their own projects:

- `archive/packages/effect-worker/tsconfig.json` — `just e2e explain` and other effect runners call this before spawn. The node image does the same.
- `archive/domain/fiscal-brazil/tsconfig.json` — `just e2e fiscal-fault-matrix` and `cd archive/domain/fiscal-brazil && npm test`.

Do not add these folders back to `package.json` workspaces or the live `tsconfig.json` include.

KIND/web deploy scenarios are class=`kind` / `archive` and are not default CI.
