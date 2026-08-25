# Demo paths

Runnable demos use landed e2e scenarios. Sample Company and archived web are optional. There is no separate marketing backend and no fake chat widget.

## Five-minute company

Optional archived first governed Action on Sample Company.

1. From the repository root, run `just build` then `just start`.
2. If archived web is built, open the printed web URL and sign in with the sample OIDC user (`web-user` / `web-password`).
3. Walk at-risk stock → propose → approve on the seeded Sample Company tenant.
4. Confirm the non-interactive path with `just e2e activation-sample`.

Expected signals: `just status` reports Ready only when probes pass; `just doctor` fails closed when something is unhealthy.

## Agent safely acts

A real model harness uses semantic capabilities and commits only through governed Action.

```bash
just e2e agent-capabilities-live
```

This scenario needs OpenCode/zen credentials from the host environment (see activation preferences). It proves provider routing, illegal-path rejection, and commit recovery. Brazil fiscal vendors and Linq stay off the advertised surface.

## Your messy data

Read-only enterprise source to mapping ambiguity to Shadow recommendation without a blind commit.

```bash
just e2e company-bootstrap-shadow
```

This is the optional archived #258 bootstrap path. Shadow may recommend; it must not call `commitOrRecover` or write an `EffectRequest` on its own.

## Killer path script (manual, production stack)

Use this checklist when recording or walking the Sample Company risk path. Capture operation and effect IDs from the live runtime, not from fixtures.

1. Seed and open conflicting inventory evidence that creates order risk.
2. Ask why. Read evidence and rival claims from the explain path.
3. Accept a governed recommendation and approve it.
4. Force or observe an external timeout after a possible send.
5. Confirm the effect stays `UNKNOWN` with no blind retry.
6. Reconcile from later evidence.

Record that walkthrough with `./docs/demo/record.sh`. The command probes live Keycloak and zoend, drives the web-user path in Playwright, and writes `docs/demo/sample-company-five-minute.webm` plus a manifest of live operation ids. See [`docs/demo/README.md`](../demo/README.md).

## Pack directory

Outcome-first Pack pages live in [`docs/product/pack-directory.md`](../product/pack-directory.md). Install and share resolve through the signed registry from #260. Kitchen (#264) authoring stays in flight. Full marketplace commerce is out of scope.

## Still open on #267

- Human comprehension study (protocol exists under `e2e/public-surface-web`; capture remains).
- Live conversation entry only when a real channel is available (#273) or a web chat that uses the AD-05/AD-03 contracts. Until then, do not ship a fake chat.
- Cold-start comprehension evidence for people who have not read the ADRs.
- Coordinator registration of `just e2e public-surface`.

