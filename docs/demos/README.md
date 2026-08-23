# Demo paths

Runnable demos use the production Sample Company stack. There is no separate marketing backend and no fake chat widget.

## Five-minute company (available now)

1. From the repository root, run `just build` then `just start`.
2. Open the printed web URL and sign in with the sample OIDC user (`web-user` / `web-password`).
3. Walk at-risk stock → propose → approve on the seeded Sample Company tenant.
4. Confirm the non-interactive path with `just e2e activation-sample`.

Expected signals: `just status` reports Ready only when probes pass; `just doctor` fails closed when something is unhealthy.

## Killer path script (manual, production stack)

Use this checklist when recording or walking the Sample Company risk path. Capture operation and effect IDs from the live runtime, not from fixtures.

1. Seed and open conflicting inventory evidence that creates order risk.
2. Ask why. Read evidence and rival claims from the explain path.
3. Accept a governed recommendation and approve it.
4. Force or observe an external timeout after a possible send.
5. Confirm the effect stays `UNKNOWN` with no blind retry.
6. Reconcile from later evidence.

A polished 45 to 90 second recorded video is still open on #267.

## Still open on #267

- Recorded visual product demo with release/source artifacts in frame.
- Agent-safely-acts entry that uses a real model harness and governed Action.
- Messy-data entry from #258 (read-only source → mapping ambiguity → Shadow recommendation).
- Live conversation entry only when a real channel is available. Until then, do not ship a fake chat.

Pack directory pages and install/share links wait on #260.
