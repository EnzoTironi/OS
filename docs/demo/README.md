# Recorded Sample Company demo

The Sample Company recorder and `just start` stack live on [`archive/pre-modeled-erp`](https://github.com/EnzoTironi/OS/tree/archive/pre-modeled-erp). They are not on default `main`. Default `main` has no web app, no Keycloak, and no Playwright demo.

The committed `sample-company-five-minute.webm` and `.json` are a prior capture on that archive branch. Re-recording needs the archive branch, Docker, and a Ready Sample Company stack. Operation and effect IDs come from live zoend on that archive stack. There is no mocked backend and no fixture-only UI stand-in.

## One command

Checkout `archive/pre-modeled-erp`, then from that branch:

```bash
./docs/demo/record.sh
```

The archive-branch script compiles the TypeScript harness, ensures the Sample Company stack is Ready (`just start` when needed), then drives the archived web as `web-user` / `web-password`. Default `main` identity is Better Auth SessionDoor. Default `main` has no web app.

On default `main`, `./docs/demo/record.sh` exits 2 and names the archive branch.

Outputs on the archive branch:

- `docs/demo/sample-company-five-minute.webm` is the recorded video
- `docs/demo/sample-company-five-minute.json` is live endpoints, path steps, and operation/proposal ids captured from the DOM

Override destinations with `ZOEN_DEMO_VIDEO_PATH` and `ZOEN_DEMO_MANIFEST_PATH`.

## Path on camera

1. Sign in on the archived Sample Company web.
2. Open the seeded at-risk stock surface (conflicting physical quantity claims already in the Sample seed).
3. Propose a governed inventory Action.
4. Follow step-up approval when the proposal awaits approval, then commit through the Action API.
5. Capture live `operation.*` / `proposal.*` ids from the rendered surface.

The human comprehension study that also remains on #267 is separate. This unit only lands the recorded demo lake.

## Mutants killed

- Mocked backend or fixture-only UI as the sole demo (the archive harness refuses stub-shaped origins and requires a Ready archive stack).
- Recording without a Ready `just start` stack.
