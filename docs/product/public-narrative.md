# Public narrative hierarchy

Visitor-facing copy follows this order. Architecture stays after first value.

1. Promise: one sentence for what Zoen is.
2. Demo: three entry demos in `docs/demos/README.md` (Five-minute company, Agent safely acts, Your messy data), then recorded video when #267 closes that gap.
3. Quickstart: `just start` and `just e2e activation-sample`.
4. Sample Company: first governed Action without ADR reading.
5. Packs: outcome-first examples. Live directory at `/packs`. Directory copy in `docs/product/pack-directory.md`. Install/share from #260; Kitchen from #264 has landed (`just e2e pack-kitchen`).
6. Why not LLM + tools: evidence vs truth, shared contracts, governed Actions, unknown effects, reproducible history, self-host.
7. Self-host: same signed artifacts, optional paid providers, Keycloak + Active Membership.
8. Architecture: `Type + Relation + Computation + Action`, ADRs, contributor depth.

## Progressive reveal after first success

After Sample Company works, deepen in this order:

1. Inspect ontology `.zoen.ts` definitions.
2. Create or modify a Pack (Kitchen #264 has landed; registry install/share already from #260).
3. Connect your own data (messy-data path: `just e2e company-bootstrap-shadow`).
4. Deploy self-hosted from `deploy/`.
5. Build an integration or adapter behind a Zoen-owned boundary.
6. Read architecture and ADRs.

## Do not advertise

- Live Brazil fiscal vendors while #214 is parked.
- Live Linq or other paid messaging as required for self-host.
- Fake chat, fixture-only demos as product proof, or claims without release evidence.

HAVE vs DON'T HAVE lives in [`docs/product/roadmap.md`](roadmap.md). Parent issue #324.

## Checker

```bash
npx tsx e2e/public-surface.ts
```

The checker asserts README heading order, Quickstart commands, the three demo headings, Pack directory outcome language, and the no-live-fiscal / no-live-Linq rules until `just e2e public-surface` is registered.
