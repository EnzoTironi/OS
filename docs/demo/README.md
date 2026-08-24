# Recorded Sample Company demo

The lever records a real 45–90s browser walkthrough of the Sample Company five-minute path on the production `just start` stack. Operation and effect IDs come from live zoend and Keycloak. There is no mocked backend and no fixture-only UI stand-in.

## One command

From the repository root, with Docker available and `target/debug/zoend` present (or symlinked from the main checkout):

```bash
./docs/demo/record.sh
```

The script compiles the TypeScript harness, ensures the Sample Company stack is Ready (`just start` when needed), probes live Keycloak OIDC discovery and web `/api/config`, then drives Playwright against `http://127.0.0.1:58359` as `web-user` / `web-password`.

Outputs:

- `docs/demo/sample-company-five-minute.webm` — the recorded video
- `docs/demo/sample-company-five-minute.json` — live endpoints, path steps, and operation/proposal ids captured from the DOM

Override destinations with `ZOEN_DEMO_VIDEO_PATH` and `ZOEN_DEMO_MANIFEST_PATH`.

## Path on camera

1. Sign in through Keycloak OIDC.
2. Open the seeded at-risk stock surface (conflicting physical quantity claims already in the Sample seed).
3. Propose a governed inventory Action.
4. Follow step-up approval when the proposal awaits approval, then commit through the Action API.
5. Capture live `operation.*` / `proposal.*` ids from the rendered surface.

The human comprehension study that also remains on #267 is separate. This unit only lands the recorded demo lake.

## Mutants killed

- Mocked backend or fixture-only UI as the sole demo (the harness refuses stub-shaped origins and requires live Keycloak discovery plus web config pointing at the Sample issuer).
- Recording without a Ready `just start` stack.
