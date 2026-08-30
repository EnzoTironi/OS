# Demo paths

Runnable demos use landed e2e scenarios. Sample Company and archived web are optional. There is no separate marketing backend and no fake chat widget.

## Five-minute company

Optional archived first governed Action on Sample Company.

Checkout [`archive/pre-modeled-erp`](https://github.com/EnzoTironi/OS/tree/archive/pre-modeled-erp). These commands are not on default `main`.

1. From that branch, run `just build` then `just start`.
2. If archived web is built, open the printed web URL and sign in with the sample archive web user (`web-user` / `web-password`). Default `main` identity is Better Auth SessionDoor. Default `main` has no web app.
3. Walk at-risk stock, then propose, then approve on the seeded Sample Company tenant.
4. Confirm the non-interactive path with `just e2e activation-sample`.

Expected signals: `just status` reports Ready only when probes pass. `just doctor` fails closed when something is unhealthy.

## Agent safely acts

Eve conversation plus governed Action. Wasm code-mode lives on zoend.

```bash
just e2e governed-action
just e2e wasm-code-mode
```

Brazil fiscal vendors and Linq stay off the advertised surface.

## Your messy data

Read-only enterprise source to mapping ambiguity to Shadow recommendation without a blind commit.

```bash
just e2e company-bootstrap-shadow
```

This is the optional archived #258 bootstrap path on `archive/pre-modeled-erp`. Shadow may recommend. It must not call `commitOrRecover` or write an `EffectRequest` on its own.

## Killer path script (manual, production stack)

Use this checklist when recording or walking the Sample Company risk path. Capture operation and effect IDs from the live runtime, not from fixtures.

1. Seed and open conflicting inventory evidence that creates order risk.
2. Ask why. Read evidence and rival claims from the explain path.
3. Accept a governed recommendation and approve it.
4. Force or observe an external timeout after a possible send.
5. Confirm the effect stays `UNKNOWN` with no blind retry.
6. Reconcile from later evidence.

Record that walkthrough with `./docs/demo/record.sh` on `archive/pre-modeled-erp`. Default `main` has no Playwright demo. See [`docs/demo/README.md`](../demo/README.md).

## Pack directory

Outcome-first Pack pages live in [`docs/product/pack-directory.md`](../product/pack-directory.md). Install and share resolve through the signed registry from #260. Kitchen (#264) has landed on `archive/pre-modeled-erp` (`just e2e pack-kitchen` there). Full marketplace commerce is out of scope.

## Still open on #267

- Human comprehension study (protocol lived under `e2e/public-surface-web` on `archive/pre-modeled-erp`; capture remains).
- Live conversation entry only when a real channel is available (#273) or a web chat that uses the AD-05/AD-03 contracts. Until then, do not ship a fake chat.
- Cold-start comprehension evidence for people who have not read the ADRs.
- Coordinator registration of `just e2e public-surface`.

