# conversation

Zoen conversation is an [eve](https://eve.dev) agent. Callers talk to it on the HTTP eve channel.

## Run locally

You need Node 24. From this directory:

```bash
npm install
eve dev --no-ui
```

`eve dev` sets `EVE_DEV=1`, so `localDev()` accepts requests. The default port is 2000.

Start a session:

```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"oi"}'
```

Stream events:

```bash
curl http://127.0.0.1:2000/eve/v1/session/<sessionId>/stream
```

Assistant text arrives on `message.appended` and `message.completed`. Health is public at `GET /eve/v1/health`. Session routes are not.

WhatsApp inbound is the Chat SDK Kapso channel at `POST /eve/v1/kapso`. Set `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, and `KAPSO_WEBHOOK_SECRET`. Kapso signs the raw body with HMAC-SHA256 in `X-Webhook-Signature`. Everyday replies are text plus one https URL.

Admit a signed sandbox-shaped POST against a local eve:

```bash
KAPSO_WEBHOOK_SECRET='kapso-local-proof-secret' node scripts/kapso-webhook-admit.mjs http://127.0.0.1:2000/eve/v1/kapso
```

Do not point Kapso project or phone webhooks from that helper.

Edit `agent/instructions.md` for voice. Edit `agent/agent.ts` for the model.

The model is a direct OpenAI-compatible `LanguageModel`. Set `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `ZOEN_MODEL` in the process environment. Do not commit those values.

## Self-host on Fly

Build the Nitro server, then start it:

```bash
eve build
eve start --host 0.0.0.0
```

`eve start` does not set `EVE_DEV`. `localDev()` skips. Session routes ask the Better Auth door at `ZOEN_AUTH_BASE_URL` (`GET /api/auth/get-session`) with the inbound Cookie or Authorization header. No session is 401. Health stays public:

```bash
curl http://127.0.0.1:3000/eve/v1/health
```

Fly is the host. Workflow world stays the eve default in this app. Postgres world comes later. Do not set `experimental.workflow.world` here yet.

Forward `/eve/` and `/.well-known/workflow/` through the proxy. Do not rewrite those paths.

See [Self-host eve](https://eve.dev/docs/guides/deployment/self-hosting) for storage, sandbox, and proxy notes. The same page lives at `node_modules/eve/docs/guides/deployment/self-hosting.md` after `npm install`.

## Learn more

- [eve documentation](https://eve.dev/docs)
- [eve on GitHub](https://github.com/vercel/eve)
