# AGENTS.md

## Cursor Cloud specific instructions

### What this repository is

`OS` is a **documentation / research** repository, not a running product. It is
intentionally pre-architecture: `docs/`, `research/`, `rfcs/`, and `scenarios/`
hold Markdown, and `.cursor/` holds vendored Cursor agent tooling (skills,
plugins, agents, rules). There is no web app, backend, database, or build step
for the research itself — "developing" the research means editing Markdown, so
most work here needs no toolchain at all.

### The only runnable code

The single piece of executable, testable code is the vendored **pstack
`poteto-mode` scripts** (agent tooling), which run on **Bun** + TypeScript:

- Loaded copy (what agents use): `.cursor/skills/pstack/poteto-mode/scripts/`
- Marketplace copy (kept in sync): `.cursor/plugins/pstack/skills/poteto-mode/scripts/`

Both copies are vendored from upstream (see `SOURCES.md`); update them by
overwriting from upstream rather than editing in place.

From `.cursor/skills/pstack/poteto-mode/scripts/`:

- Test: `bun test orch watch-pr` (see `package.json`; the `test` script is `bun test orch watch-pr`)
- Typecheck: `bun run typecheck` (`tsc --project watch-pr/tsconfig.json --noEmit --strict`)
- Run the CLI: `bun orch/orch.ts --help` (also `watch-pr/cli.ts`)

### Non-obvious gotchas

- **Bun is required** for the scripts (`bun:test`, `bun.lock`, `Bun.spawnSync`);
  Node cannot run them. Bun installs to `~/.bun` and is on `PATH` via `~/.bashrc`.
  If `bun` is not found in a fresh non-login shell, use `~/.bun/bin/bun` or
  `source ~/.bashrc`.
- `node_modules/` is gitignored. The scripts **self-bootstrap** their deps:
  `bootstrap.ts` runs `bun install --frozen-lockfile` on first execution if
  `commander` is missing, so `bun orch/orch.ts ...` works even before any manual
  install. The startup update script also pre-installs them to avoid first-run latency.
- `orch unit add` requires a positional `<id>` and `--track <track>`
  (e.g. `bun orch/orch.ts unit add my-id --track infra`).
