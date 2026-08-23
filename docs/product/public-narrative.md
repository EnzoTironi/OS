# Public narrative hierarchy

Visitor-facing copy follows this order. Architecture stays after first value.

1. Promise: one sentence for what Zoen is.
2. Demo: runnable Sample Company path, then recorded video when #267 closes that gap.
3. Quickstart: `just start` and `just e2e activation-sample`.
4. Sample Company: first governed Action without ADR reading.
5. Packs: outcome-first examples. Public directory lands with #260.
6. Why not LLM + tools: evidence vs truth, shared contracts, governed Actions, unknown effects, reproducible history, self-host.
7. Self-host: same signed artifacts, optional paid providers, Keycloak + Active Membership.
8. Architecture: `Type + Relation + Computation + Action`, ADRs, contributor depth.

## Progressive reveal after first success

After Sample Company works, deepen in this order:

1. Inspect ontology `.zoen.ts` definitions.
2. Create or modify a Pack.
3. Connect your own data (messy-data path from #258).
4. Deploy self-hosted from `deploy/`.
5. Build an integration or adapter behind a Zoen-owned boundary.
6. Read architecture and ADRs.

## Do not advertise

- Live Brazil fiscal vendors while #214 is parked.
- Live Linq or other paid messaging as required for self-host.
- Fake chat, fixture-only demos as product proof, or claims without release evidence.

## Checker

```bash
npx tsx e2e/public-surface.ts
```

The checker asserts README heading order, Quickstart commands, and the no-live-fiscal / no-live-Linq rules until `just e2e public-surface` is registered.
