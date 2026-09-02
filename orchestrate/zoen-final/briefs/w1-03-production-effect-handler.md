# W1-03 Production ZoenEffect handler

## Goal

Ship an Ontology-owned production `ZoenEffect` handler, connector, registration reconciler, and dispatcher gate inside the one-Fly product. Prove the same durable generic effect path used by the existing journeys. Do not create a fourth product and do not put Restate inside Eve.

## Queue and ownership

- Prepared branch: `codex/w1-03-zoen-effect-handler`.
- Prepared worktree: `/Users/enzotironi/Codex/zoen-w1-03-effect-handler`.
- State stays queued until W1-02 lands. Rebase onto the merged W1-02 head before editing shared deploy topology.
- W1-03 owns the handler, HTTP connector packaging, Restate registration reconciliation, workload credential boundary, dispatcher registration gate, and component probes. W1-06 owns aggregate `/ready`; W6 owns generic automation and origin delivery.

## Required design

1. Promote the proven TypeScript handler behavior from `e2e/effect-worker.ts` into `apps/zoend/effect-handler/`. Run it with the image's Ontology Node runtime on loopback `127.0.0.1:9081`. Delete the e2e duplicate after every journey uses the production module.
2. Package and supervise the existing Rust `zoen-http-connector` on loopback `127.0.0.1:8081`. Neither process is publicly routed.
3. The handler receives only a dedicated `workload.effect-worker` API key. It exchanges that credential inside each durable call, never logs or journals credentials, and retries exchange once after `Unauthenticated` so a zoend restart does not strand an invocation.
4. Authority stays behind `EffectService`. The handler never opens Postgres or writes authority tables. Keep worker and reconciler credentials distinct.
5. Before production credential provisioning is allowed, make `/workload/admin/credentials` require real operator authority rather than merely any Better Auth session. A bootstrap script must validate an existing `0600` key file and fail closed on missing, revoked, expired, mismatched, or unknown credentials. It must not silently mint a replacement or hide orphaned credentials.
6. The registration reconciler is long-lived and idempotent. It waits on component-local liveness, Restate Admin health, and handler health; inspects deployment and handler shape; registers the stable loopback URI only when absent; explicitly sends `force:false` and `breaking:false`; verifies Ontology ownership and artifact identity; and reconciles after Restate restart or empty state.
7. An exact existing registration is success. An incompatible URI, service type, handler set, owner, or artifact is a readiness failure. Never force-replace or delete it automatically.
8. Dispatcher polling starts only after exact `ZoenEffect.execute` registration exists. Restate rejection or loss returns it to bounded backoff and registration gating.
9. Missing/forbidden payload access, forbidden claims, and absent effects become observable failed invocations. They must never return successful no-ops. Human-executor effects never reach the generic connector.
10. Add stable component probes for zoend liveness, handler, connector, Restate, and exact registration. No startup or bootstrap process may wait on global `/ready`, which would deadlock W1-06.

## Likely files

New:

- `apps/zoend/effect-handler/main.ts`
- `apps/zoend/effect-handler/config.ts`
- `apps/zoend/effect-handler/effect-service-client.ts`
- `apps/zoend/effect-handler/connector-client.ts`
- `deploy/fly/tsconfig.ontology-runtime.json`
- `deploy/fly/zoen-ensure-effect-workload-credential`
- `deploy/fly/zoen-register-effects`
- `e2e/effect-runtime.ts` and only the production-shaped topology it needs

Modify as required:

- Root TypeScript configuration
- `deploy/fly/Dockerfile`, `supervisord.conf`, and `fly.toml`
- `apps/zoend/src/bin/zoen-effect-dispatcher.rs`
- Workload credential issuance and session error mapping
- `apps/zoend/src/main.rs` for component liveness only
- Existing effect journey support and the scenario registry/CI
- Deploy documentation

Delete `e2e/effect-worker.ts` when its production replacement is active. Do not introduce another runtime package or dependency; the pinned Restate SDK already exists.

## Boot and recovery contract

Postgres, Better Auth, zoend component liveness, and Restate start independently. Operator binding precedes worker credential provisioning. Connector and handler start only with complete private configuration. Registration reconciles continuously. Dispatcher admits work only after exact registration.

Normal Restate restart preserves `/data/restate`; an empty Restate store is also reconciled. Handler restart is transparent at the stable endpoint. A zoend restart invalidates in-memory exchange tokens, so the handler must reauthenticate from its API key without rerunning the business action.

## Journey acceptance

Add a focused `effect-runtime` journey that launches the production handler, connector, registrar, dispatcher, Restate, zoend, and real authority stores. Reuse existing live journey infrastructure where possible; add no unit tests, mocks, fakes, or stubs.

It must prove:

- A governed action creates one external effect, one immutable dispatch identity, one claimed attempt, one logical provider operation, and a final confirmed state.
- Request digest, tenant, idempotency key, Restate key, invocation ID, and attempt ID remain paired.
- Missing or revoked worker credentials prevent registration and readiness.
- Missing handler prevents dispatcher admission and creates no provider operation.
- Cross-tenant credentials and connector references fail closed.
- Wrong object key is terminal and creates no attempt.
- Human executor payload never reaches the generic connector.
- Pre-send failure becomes `definitely_not_sent` and retries safely under the next knowledge state.
- Denials and missing effects remain visible failures.
- Handler, Restate, and zoend restarts converge without rerunning the business action or duplicating provider work.
- An accepted-but-lost provider response becomes `unknown`; no blind resend occurs; independent reconciler evidence converges to `confirmed` with separate immutable records.

Two reminders, provider-specific channel behavior, and origin-bound delivery remain W6 work.

## Verification

- `npm run check`
- `npm run lint:ts`
- `cargo fmt --all --check`
- `cargo clippy --locked --workspace --all-targets --exclude zoen-proto --no-deps -- -D warnings`
- Production binary build for `zoen`, dispatcher, and connector
- `./e2e/run.sh effect-runtime`
- Full `./e2e/run.sh verify`
- Local release Docker build and process inspection
- `git diff --check`
- Independent exact-head code review before ledger entry

## Exclusions

No Redis, Rivet, OIDC/Keycloak compatibility, channel/reminder branch, public handler route, forced Restate replacement, automated production reconciliation before W6, effect-domain redesign, duplicate e2e handler, or global-readiness bootstrap dependency.

